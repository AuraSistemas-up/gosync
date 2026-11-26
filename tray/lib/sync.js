const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ftp = require("basic-ftp");
const { app, nativeImage } = require("electron");
const { fetchRaw, groupProducts } = require("./erp");
const { readFirebird } = require("./firebird");
const { generate, fetchHidden } = require("./pages");
const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const posix = path.posix;

const dirs = () => {
  const base = app.getPath("userData");
  return { base, photos: path.join(base, "photos"), out: path.join(base, "out"), state: path.join(base, "state.json") };
};

function loadState() {
  try { return JSON.parse(fs.readFileSync(dirs().state, "utf8")); } catch { return {}; }
}
// Gravação atômica: escreve num temporário e renomeia. Se o PC cair no meio, o state.json antigo continua íntegro
// (antes, um arquivo corrompido virava {} e o GoSync reenviava tudo do zero).
function saveState(s) {
  const file = dirs().state, tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s));
  try { fs.renameSync(tmp, file); }
  catch { fs.copyFileSync(tmp, file); fs.rmSync(tmp, { force: true }); } // antivírus/OneDrive segurando o arquivo
}

// "Reenviar todas as fotos" clicado durante uma sincronização: aplicado também ao estado em memória dela,
// para que o salvamento final não desfaça a limpeza.
let syncAtivo = 0; // contador: uma sincronização cancelada pode ainda estar terminando
let resetPendente = false;
const CAMPOS_RESET = () => ({ photos: {}, fbPhotos: {}, pages: {}, seoHash: null, uploaded: {}, lastHash: null });
function persist(state) {
  if (resetPendente) Object.assign(state, CAMPOS_RESET());
  saveState(state);
}

/**
 * Confere pelo endereço público se o site está lendo o catálogo que acabou de ser enviado.
 * Pega o caso "envio OK, mas para a pasta errada" (ex.: subdomínio servido de /public_html/loja).
 * Devolve null quando confere (ou quando não dá para saber: sem siteUrl, site fora do ar) e a mensagem de aviso quando não.
 */
async function verifySite(cfg, expectedUpdatedAt, log) {
  if (!cfg.siteUrl || !expectedUpdatedAt) return null;
  const url = cfg.siteUrl.replace(/\/+$/, "") + "/data/catalog.json?v=" + Date.now();
  let got;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (r.status === 404) got = null;
    else if (!r.ok) return null; // site com problema temporário: não acusa pasta errada
    else got = (await r.json())?.updatedAt ?? null;
  } catch { return null; }
  if (got === expectedUpdatedAt) { log("Conferido: o site já mostra o catálogo novo."); return null; }
  const msg = `O site ${cfg.siteUrl} não está mostrando o catálogo enviado para ${cfg.remoteDir || "/"}. ` +
    `A pasta do site no servidor provavelmente está errada: use "Diagnosticar e configurar" em Configurações.`;
  log(`ERRO: ${msg}`);
  return msg;
}

/** Erro lançado quando a operação foi cancelada pelo vigia de tempo do processo principal. */
const checkAbort = (signal) => { if (signal?.aborted) throw new Error("Operação cancelada (tempo limite)."); };

async function openFtp(cfg) {
  if (!cfg.ftpHost || !cfg.ftpUser) throw new Error("FTP da Locaweb não configurado");
  const client = new ftp.Client(30000);
  await client.access({ host: cfg.ftpHost, user: cfg.ftpUser, password: cfg.ftpPass, secure: !!cfg.ftpSecure });
  return client;
}

async function testFtp(cfg) {
  const c = await openFtp(cfg);
  try { await c.ensureDir(cfg.remoteDir || "/"); } finally { c.close(); }
}

/** Baixa uma foto (ou decodifica data:URI); devolve {name, file} com nome = hash do conteúdo. */
async function fetchPhoto(url, cfg) {
  let buf, type;
  if (url.startsWith("data:")) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    if (!m) throw new Error("data URI inválido");
    type = m[1];
    buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
  } else {
    let sameOrigin = false;
    try { sameOrigin = new URL(url).origin === new URL(cfg.erpUrl).origin; } catch {}
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: sameOrigin && cfg.erpToken ? { Authorization: `Bearer ${cfg.erpToken}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    type = (res.headers.get("content-type") || "").split(";")[0];
    buf = Buffer.from(await res.arrayBuffer());
  }
  const ext = EXT[type] || path.extname(new URL(url.startsWith("data:") ? "http://x/x.jpg" : url).pathname).toLowerCase() || ".jpg";
  // Redimensionamento automático: foto grande (máx. 1200 px) + miniatura (520 px) com boa qualidade.
  // PNG continua PNG (preserva transparência); o resto vira JPEG 85. Se não der para decodificar, mantém o original.
  let out = buf, outExt = ext, thumb = null;
  try {
    const img = nativeImage.createFromBuffer(buf);
    if (!img.isEmpty()) {
      const { width, height } = img.getSize();
      // Reduz fotos grandes; amplia as pequenas (< 700 px) para 800 px, para não ficarem borradas no pop-up.
      const fit = (max, enlarge) => {
        const longest = Math.max(width, height);
        const target = enlarge && longest < 700 ? 800 : Math.min(max, longest);
        const s = target / longest;
        return s === 1 ? img : img.resize({ width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)), quality: "best" });
      };
      const png = ext === ".png";
      const enc = (i, q) => (png ? i.toPNG() : i.toJPEG(q));
      out = enc(fit(1200, true), 88);
      thumb = enc(fit(520, false), 80);
      outExt = png ? ".png" : ".jpg";
    }
  } catch { /* usa o original */ }
  const name = crypto.createHash("sha1").update(out).digest("hex").slice(0, 16) + outExt;
  fs.mkdirSync(dirs().photos, { recursive: true });
  const file = path.join(dirs().photos, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, out);
  if (thumb) fs.writeFileSync(file.replace(/(\.\w+)$/, "-s$1"), thumb);
  return name;
}

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/**
 * Sincroniza ERP → Locaweb: produtos, grupos, estoque e fotos.
 * Só envia o que mudou (fotos novas + catalog.json), salvo `force`.
 */
async function syncData(cfg, opts = {}) {
  if (!syncAtivo) resetPendente = false;
  syncAtivo++;
  try { return await syncDataInner(cfg, opts); }
  finally { if (--syncAtivo === 0) resetPendente = false; }
}

async function syncDataInner(cfg, { force = false, log = () => {}, signal } = {}) {
  const target = `${cfg.ftpHost}|${cfg.remoteDir}`;
  const state = loadState();
  log(`Destino do envio: ${cfg.ftpHost}${cfg.remoteDir || "/"}`);
  if (state.target && state.target !== target) log("O destino mudou desde a última sincronização: tudo será reenviado.");
  if (state.target !== target) Object.assign(state, { target, uploaded: {}, lastHash: null, lastUpdatedAt: null, pages: {}, seoHash: null }); // novo destino: tudo precisa ser reenviado
  state.photos ??= {};
  state.uploaded ??= {};
  // `force` só ignora o atalho "nada mudou" (reenvia o catálogo). Para refazer as fotos use "Reenviar todas as fotos".

  let products;
  let falhas = 0;
  let photoNames; // nomes (hash) das fotos usadas pelo catálogo, para enviar as que faltam

  if (cfg.source === "firebird") {
    // Fonte: banco Firebird do ERP (somente leitura). As fotos vêm do próprio banco e já saem redimensionadas.
    state.fbPhotos ??= {};
    state.fbIds ??= {}; // endereços dos modelos: nunca limpo (nem pelo "Reenviar todas as fotos")
    let tFb;
    const fb = await Promise.race([
      readFirebird(cfg, { log, photosDir: dirs().photos, cache: state.fbPhotos, ids: state.fbIds }),
      new Promise((_, rej) => { tFb = setTimeout(() => rej(new Error("O banco Firebird não respondeu em 10 min (leitura cancelada).")), 10 * 60_000); }),
    ]).finally(() => clearTimeout(tFb));
    products = fb.products;
    photoNames = fb.photoNames;
    falhas = fb.photoFailures;
    log(`${products.length} modelos${cfg.onlyStock !== false ? " com estoque" : ""} (${fb.newPhotos} foto(s) nova(s) lida(s) do banco).`);
  } else {
    log("Buscando produtos no ERP…");
    const raw = await fetchRaw({ url: cfg.erpUrl, token: cfg.erpToken }, log);
    products = groupProducts(raw);
    log(`${raw.length} itens do ERP → ${products.length} modelos com estoque.`);

    // Fotos: baixa só as URLs ainda desconhecidas.
    const urls = [...new Set(products.flatMap((p) => p.variants.flatMap((v) => v.images)))];
    const novas = urls.filter((u) => !state.photos[u]);
    if (novas.length) log(`Baixando ${novas.length} foto(s) nova(s)…`);
    await pool(novas, 4, async (u) => {
      try { state.photos[u] = await fetchPhoto(u, cfg); }
      catch (e) { falhas++; log(`Foto ignorada (${e.message}): ${u.slice(0, 80)}`); }
    });

    const toSite = (u) => (state.photos[u] ? `/fotos/${state.photos[u]}` : u);
    for (const p of products)
      for (const v of p.variants) {
        v.images = v.images.map(toSite);
        v.image = v.images[0];
      }
    photoNames = new Set(Object.values(state.photos));
  }

  // Numerações: "mostrar todas" deixa qualquer numeração ser escolhida e pedida; senão some com as sem estoque
  // (se a cor ficar sem nenhuma, mantém as numerações como esgotadas para o produto não ficar vazio).
  for (const p of products) for (const v of p.variants) {
    if (cfg.showAllSizes) for (const s of v.sizes) s.available = true;
    else if (v.sizes.some((s) => s.available)) v.sizes = v.sizes.filter((s) => s.available);
  }

  // Catálogo zerado nunca é publicado: apagaria todos os produtos do site. Normalmente é configuração errada
  // (tipos de produto, banco/arquivo .FDB diferente) ou leitura incompleta; o site continua com o último catálogo bom.
  if (!products.length) {
    throw new Error("Nenhum produto com estoque foi encontrado no ERP. Para não deixar o site vazio, nada foi enviado. Confira o banco (.FDB) e os tipos de produto em Configurações.");
  }

  // Páginas por produto (prévia no WhatsApp/Google), sitemap e robots: só se o endereço do site estiver configurado.
  let seo = null;
  if (!cfg.siteUrl) log("Aviso: \"URL pública do site\" não configurada; o link do WhatsApp vai sem prévia de foto e preço.");
  if (cfg.siteUrl) {
    const candidates = [path.join(process.resourcesPath || "", "site", "produto", "index.html"), path.join(cfg.siteDir || "", "dist", "produto", "index.html")];
    const tpl = candidates.find((f) => fs.existsSync(f));
    if (tpl) {
      // Se o site não responder, usa a última lista de ocultos conhecida (em vez de tratar todos como visíveis).
      let hidden = await fetchHidden(cfg.siteUrl, { nullOnError: true });
      if (hidden) state.hidden = [...hidden];
      else { hidden = new Set(state.hidden || []); log("Lista de ocultos indisponível; usando a última conhecida."); }
      seo = generate({ template: fs.readFileSync(tpl, "utf8"), products, siteUrl: cfg.siteUrl, storeName: cfg.storeName || "", hidden });
      seo.pages = seo.pages.filter((p) => /^[a-z0-9-]+$/.test(p.id));
    } else {
      log("Molde da página de produto não encontrado: páginas com prévia puladas (use Publicar/atualizar o site).");
    }
  }
  state.pages ??= {};

  // Banners do carrossel: imagens da pasta configurada (ordem alfabética, até 6), com nome = hash do conteúdo.
  const banners = [];
  const bannerFiles = []; // {name, file}
  if (cfg.bannersDir && fs.existsSync(cfg.bannersDir)) {
    const files = fs.readdirSync(cfg.bannersDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, 6);
    for (const f of files) {
      const file = path.join(cfg.bannersDir, f);
      // Redimensiona automaticamente (máx. 1920 px de largura, boa qualidade); o site ajusta a proporção sozinho.
      const raw = fs.readFileSync(file);
      let data = raw, bext = path.extname(f).toLowerCase();
      try {
        const img = nativeImage.createFromBuffer(raw);
        if (!img.isEmpty()) {
          const { width, height } = img.getSize();
          const s = Math.min(1, 1920 / width);
          const r = s < 1 ? img.resize({ width: Math.round(width * s), height: Math.max(1, Math.round(height * s)), quality: "best" }) : img;
          if (bext === ".png") data = r.toPNG();
          else { data = r.toJPEG(88); bext = ".jpg"; }
        }
      } catch { /* mantém o original */ }
      const name = crypto.createHash("sha1").update(data).digest("hex").slice(0, 16) + bext;
      const bdir = path.join(dirs().out, "banners");
      fs.mkdirSync(bdir, { recursive: true });
      const outFile = path.join(bdir, name);
      if (!fs.existsSync(outFile)) fs.writeFileSync(outFile, data);
      bannerFiles.push({ name, file: outFile });
      banners.push({ image: `/banners/${name}` });
    }
  }

  const catalog = {
    updatedAt: new Date().toISOString(),
    whatsapp: String(cfg.whatsapp || "").replace(/\D/g, ""),
    store: { name: cfg.storeName || undefined, primaryColor: /^#[0-9a-f]{6}$/i.test(cfg.primaryColor || "") ? cfg.primaryColor : undefined, banners, pages: seo ? true : undefined },
    products,
  };
  const hash = crypto.createHash("sha1").update(JSON.stringify({ ...catalog, updatedAt: 0 })).digest("hex");

  const pendentes = [...photoNames].filter((n) => !state.uploaded[n]);
  const pagesPendentes = seo ? seo.pages.filter((p) => state.pages[p.id] !== p.hash) : [];
  const seoHash = seo ? sha1(seo.sitemap + seo.robots) : null;
  const seoMudou = !!seo && seoHash !== state.seoHash;
  const bannersPendentes = bannerFiles.filter((b) => !state.uploaded["b/" + b.name]);
  // Páginas de produtos que saíram do catálogo (desmarcados, sem estoque ou ocultos): precisam ser apagadas do servidor.
  const atuais = new Set(seo ? seo.pages.map((p) => p.id) : []);
  const orfas = seo ? Object.keys(state.pages).filter((id) => !atuais.has(id)) : [];
  if (!force && hash === state.lastHash && pendentes.length === 0 && bannersPendentes.length === 0 && pagesPendentes.length === 0 && !seoMudou && orfas.length === 0) {
    checkAbort(signal);
    persist(state);
    log("Nada mudou desde a última sincronização. Nada enviado.");
    // Instalações anteriores à v1.0.20 não guardavam a data: usa o último catálogo enviado, salvo no PC.
    if (!state.lastUpdatedAt) { try { state.lastUpdatedAt = JSON.parse(fs.readFileSync(path.join(dirs().out, "catalog.json"), "utf8")).updatedAt; persist(state); } catch {} }
    const siteWarning = await verifySite(cfg, state.lastUpdatedAt, log);
    return { changed: false, models: products.length, photos: 0, failedPhotos: falhas, siteWarning };
  }

  checkAbort(signal);
  fs.mkdirSync(dirs().out, { recursive: true });
  const catalogFile = path.join(dirs().out, "catalog.json");
  fs.writeFileSync(catalogFile, JSON.stringify(catalog));

  const client = await openFtp(cfg);
  // Cancelado pelo vigia: fecha a conexão (o envio em curso falha na hora) e impede qualquer gravação de estado.
  const onAbort = () => client.close();
  signal?.addEventListener("abort", onAbort);
  try {
    const root = cfg.remoteDir || "/";
    if (pendentes.length) {
      log(`Enviando ${pendentes.length} foto(s)…`);
      let enviadas = 0;
      await client.ensureDir(posix.join(root, "fotos"));
      for (const n of pendentes) {
        checkAbort(signal);
        await client.uploadFrom(path.join(dirs().photos, n), posix.join(root, "fotos", n));
        const t = n.replace(/(\.\w+)$/, "-s$1"); // miniatura, se existir
        if (fs.existsSync(path.join(dirs().photos, t))) await client.uploadFrom(path.join(dirs().photos, t), posix.join(root, "fotos", t));
        state.uploaded[n] = true;
        if (++enviadas % 50 === 0) { persist(state); log(`  ${enviadas}/${pendentes.length} fotos enviadas…`); } // progresso salvo: se cair, retoma daqui
      }
    }
    if (bannersPendentes.length) {
      log(`Enviando ${bannersPendentes.length} banner(s)…`);
      await client.ensureDir(posix.join(root, "banners"));
      for (const b of bannersPendentes) {
        await client.uploadFrom(b.file, posix.join(root, "banners", b.name));
        state.uploaded["b/" + b.name] = true;
      }
    }
    checkAbort(signal);
    // Catálogo logo depois das fotos (que ele referencia): num reenvio completo os produtos aparecem no site sem esperar
    // as milhares de páginas de prévia. Enquanto uma página não existe, o .htaccess abre a página de produto normal.
    log("Enviando catálogo…");
    await client.ensureDir(posix.join(root, "data"));
    const tmp = posix.join(root, "data", "catalog.json.tmp");
    const final = posix.join(root, "data", "catalog.json");
    await client.uploadFrom(catalogFile, tmp); // envio atômico: temporário + renomear
    try { await client.rename(tmp, final); }
    catch { await client.remove(final).catch(() => {}); await client.rename(tmp, final); }
    state.lastUpdatedAt = catalog.updatedAt; // já está no ar, mesmo que as páginas parem no meio
    if (seo && (pagesPendentes.length || seoMudou)) {
      const { Readable } = require("stream");
      if (pagesPendentes.length) {
        log(`Enviando ${pagesPendentes.length} página(s) de produto…`);
        await client.ensureDir(posix.join(root, "p"));
        let n = 0;
        for (const pg of pagesPendentes) {
          checkAbort(signal);
          await client.uploadFrom(Readable.from([pg.html]), posix.join(root, "p", `${pg.id}.html`));
          state.pages[pg.id] = pg.hash;
          if (++n % 100 === 0) { persist(state); log(`  ${n}/${pagesPendentes.length} páginas enviadas…`); }
        }
      }
      await client.uploadFrom(Readable.from([seo.sitemap]), posix.join(root, "sitemap.xml"));
      await client.uploadFrom(Readable.from([seo.robots]), posix.join(root, "robots.txt"));
      state.seoHash = seoHash;
    }
    if (orfas.length) {
      log(`Removendo ${orfas.length} página(s) de produto que saíram do catálogo…`);
      for (const id of orfas) {
        try { await client.remove(posix.join(root, "p", `${id}.html`)); delete state.pages[id]; }
        catch (e) {
          if (/550|not found|no such/i.test(String(e.message))) delete state.pages[id]; // já não existe
          else log(`  Não foi possível remover p/${id}.html (${e.message}); tenta de novo no próximo ciclo.`);
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    client.close();
  }

  checkAbort(signal);
  state.lastHash = hash;
  state.lastUpdatedAt = catalog.updatedAt;
  persist(state);
  const siteWarning = await verifySite(cfg, catalog.updatedAt, log);
  return { changed: true, models: products.length, photos: pendentes.length, failedPhotos: falhas, siteWarning };
}

function run(cmd, cwd, log) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, { cwd, shell: true, env: process.env });
    const onData = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => log(l));
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`"${cmd}" terminou com código ${c}`))));
  });
}

/** Publica o site (shell estático) uma vez: gera com Astro e envia dist/ por FTP. */
async function publishSite(cfg, { log = () => {}, signal } = {}) {
  // App instalado: o site já vem pronto dentro do instalador (não precisa de Node).
  const bundled = path.join(process.resourcesPath || "", "site");
  let dist;
  if (app.isPackaged && fs.existsSync(path.join(bundled, "index.html"))) {
    dist = bundled;
    log("Usando o site embutido no GoSync.");
  } else {
    const dir = cfg.siteDir;
    if (!fs.existsSync(path.join(dir, "package.json"))) throw new Error(`Pasta do site inválida: ${dir}`);
    if (!fs.existsSync(path.join(dir, "node_modules"))) {
      log("Instalando dependências do site…");
      await run("npm install", dir, log);
    }
    log("Gerando o site…");
    await run("npm run build", dir, log);
    dist = path.join(dir, "dist");
  }
  if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("Site sem index.html");
  // Nunca enviar dados de exemplo por cima do catálogo real (build local de teste).
  if (dist !== bundled) {
    fs.rmSync(path.join(dist, "data"), { recursive: true, force: true });
    fs.rmSync(path.join(dist, "fotos"), { recursive: true, force: true });
    fs.rmSync(path.join(dist, "banners"), { recursive: true, force: true });
    fs.rmSync(path.join(dist, "logo"), { recursive: true, force: true });
    fs.rmSync(path.join(dist, "admin", "credenciais.json"), { force: true });
    fs.rmSync(path.join(dist, "admin", "tentativas.json"), { force: true });
  }

  checkAbort(signal);
  const client = await openFtp(cfg);
  const onAbort = () => client.close();
  signal?.addEventListener("abort", onAbort);
  try {
    log("Enviando o site para a Locaweb…");
    await client.ensureDir(cfg.remoteDir || "/");
    await client.uploadFromDir(dist, cfg.remoteDir || "/");
  } finally {
    signal?.removeEventListener("abort", onAbort);
    client.close();
  }
}

/** Força reenvio de todas as fotos na próxima sincronização. */
function resetPhotoCache() {
  saveState(Object.assign(loadState(), CAMPOS_RESET()));
  if (syncAtivo) resetPendente = true; // a sincronização em curso não pode gravar o estado antigo por cima
}

module.exports = { syncData, publishSite, testFtp, resetPhotoCache, verifySite };
