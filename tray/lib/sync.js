const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ftp = require("basic-ftp");
const { app, nativeImage } = require("electron");
const { fetchRaw, groupProducts } = require("./erp");
const { readFirebird } = require("./firebird");

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const posix = path.posix;

const dirs = () => {
  const base = app.getPath("userData");
  return { base, photos: path.join(base, "photos"), out: path.join(base, "out"), state: path.join(base, "state.json") };
};

function loadState() {
  try { return JSON.parse(fs.readFileSync(dirs().state, "utf8")); } catch { return {}; }
}
const saveState = (s) => fs.writeFileSync(dirs().state, JSON.stringify(s));

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
async function syncData(cfg, { force = false, log = () => {} } = {}) {
  const target = `${cfg.ftpHost}|${cfg.remoteDir}`;
  const state = loadState();
  if (state.target !== target) Object.assign(state, { target, uploaded: {}, lastHash: null });
  state.photos ??= {};
  state.uploaded ??= {};
  // `force` só ignora o atalho "nada mudou" (reenvia o catálogo). Para refazer as fotos use "Reenviar todas as fotos".

  let products;
  let falhas = 0;
  let photoNames; // nomes (hash) das fotos usadas pelo catálogo, para enviar as que faltam

  if (cfg.source === "firebird") {
    // Fonte: banco Firebird do ERP (somente leitura). As fotos vêm do próprio banco e já saem redimensionadas.
    state.fbPhotos ??= {};
    const fb = await readFirebird(cfg, { log, photosDir: dirs().photos, cache: state.fbPhotos });
    products = fb.products;
    photoNames = fb.photoNames;
    falhas = fb.photoFailures;
    log(`${products.length} modelos com estoque (${fb.newPhotos} foto(s) nova(s) lida(s) do banco).`);
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
    store: { name: cfg.storeName || undefined, primaryColor: /^#[0-9a-f]{6}$/i.test(cfg.primaryColor || "") ? cfg.primaryColor : undefined, banners },
    products,
  };
  const hash = crypto.createHash("sha1").update(JSON.stringify({ ...catalog, updatedAt: 0 })).digest("hex");

  const pendentes = [...photoNames].filter((n) => !state.uploaded[n]);
  const bannersPendentes = bannerFiles.filter((b) => !state.uploaded["b/" + b.name]);
  if (!force && hash === state.lastHash && pendentes.length === 0 && bannersPendentes.length === 0) {
    saveState(state);
    log("Nada mudou desde a última sincronização. Nada enviado.");
    return { changed: false, models: products.length, photos: 0, failedPhotos: falhas };
  }

  fs.mkdirSync(dirs().out, { recursive: true });
  const catalogFile = path.join(dirs().out, "catalog.json");
  fs.writeFileSync(catalogFile, JSON.stringify(catalog));

  const client = await openFtp(cfg);
  try {
    const root = cfg.remoteDir || "/";
    if (pendentes.length) {
      log(`Enviando ${pendentes.length} foto(s)…`);
      let enviadas = 0;
      await client.ensureDir(posix.join(root, "fotos"));
      for (const n of pendentes) {
        await client.uploadFrom(path.join(dirs().photos, n), posix.join(root, "fotos", n));
        const t = n.replace(/(\.\w+)$/, "-s$1"); // miniatura, se existir
        if (fs.existsSync(path.join(dirs().photos, t))) await client.uploadFrom(path.join(dirs().photos, t), posix.join(root, "fotos", t));
        state.uploaded[n] = true;
        if (++enviadas % 50 === 0) { saveState(state); log(`  ${enviadas}/${pendentes.length} fotos enviadas…`); } // progresso salvo: se cair, retoma daqui
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
    log("Enviando catálogo…");
    await client.ensureDir(posix.join(root, "data"));
    const tmp = posix.join(root, "data", "catalog.json.tmp");
    const final = posix.join(root, "data", "catalog.json");
    await client.uploadFrom(catalogFile, tmp); // catálogo por último e de forma atômica
    try { await client.rename(tmp, final); }
    catch { await client.remove(final).catch(() => {}); await client.rename(tmp, final); }
  } finally {
    client.close();
  }

  state.lastHash = hash;
  saveState(state);
  return { changed: true, models: products.length, photos: pendentes.length, failedPhotos: falhas };
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
async function publishSite(cfg, { log = () => {} } = {}) {
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

  const client = await openFtp(cfg);
  try {
    log("Enviando o site para a Locaweb…");
    await client.ensureDir(cfg.remoteDir || "/");
    await client.uploadFromDir(dist, cfg.remoteDir || "/");
  } finally {
    client.close();
  }
}

/** Força reenvio de todas as fotos na próxima sincronização. */
function resetPhotoCache() {
  const s = loadState();
  s.photos = {};
  s.fbPhotos = {};
  s.uploaded = {};
  s.lastHash = null;
  saveState(s);
}

module.exports = { syncData, publishSite, testFtp, resetPhotoCache };
