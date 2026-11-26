// Assistente Locaweb: descobre o servidor FTP, testa o login e acha a pasta do site.
const net = require("net");
const ftp = require("basic-ftp");

const WEB_ROOTS = ["public_html", "www", "htdocs", "web", "html"];

function canConnect(host, port = 21, timeout = 4000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}

const cleanDomain = (d) =>
  String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

/** A partir do domínio, acha qual endereço FTP responde. */
async function detectHost(domain) {
  const d = cleanDomain(domain);
  if (!d || !d.includes(".")) throw new Error("Informe o domínio do site (ex.: minhaloja.com.br)");
  for (const host of [`ftp.${d}`, d, `www.${d}`]) {
    if (await canConnect(host)) return { host, domain: d };
  }
  throw new Error(`Nenhum servidor FTP respondeu para ${d}. Confira o endereço FTP no painel da Locaweb.`);
}

const friendly = (e) => {
  const m = String(e.message || e);
  if (/530|login|password|auth/i.test(m)) return "Usuário ou senha do FTP incorretos";
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return "Servidor FTP não encontrado (verifique o endereço)";
  if (/ETIMEDOUT|timeout|ECONNREFUSED/i.test(m)) return "Servidor FTP não respondeu (firewall/porta 21 ou FTPS)";
  if (/TLS|SSL|secure/i.test(m)) return "Falha de conexão segura: tente alternar a opção FTPS";
  return m;
};

/**
 * Descobre qual pasta o endereço público do site serve: grava um arquivo-marca em `dir` (e, se preciso, em cada
 * subpasta) e procura pelo endereço público. Devolve a pasta, null (nenhuma) ou undefined (site sem resposta).
 */
async function findSiteDir(client, dir, siteUrl) {
  const { Readable } = require("stream");
  const base = siteUrl.replace(/\/+$/, "");
  const name = `gosync-marca-${Date.now().toString(36)}.txt`;
  const join = (d, f) => `${d === "/" ? "" : d}/${f}`;
  const probe = async (d) => {
    const file = join(d, name);
    try { await client.uploadFrom(Readable.from([name]), file); } catch { return false; }
    try {
      const r = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (r.status >= 500) return undefined;
      return r.ok && (await r.text()).trim() === name;
    } catch { return undefined; }
    finally { await client.remove(file).catch(() => {}); }
  };
  const first = await probe(dir);
  if (first !== false) return first ? dir : undefined;
  let subs = [];
  try { subs = (await client.list(dir)).filter((f) => f.isDirectory && !f.name.startsWith(".")).map((f) => f.name); } catch {}
  const skip = /^(fotos|banners|data|p|produto|admin|logo|_astro|cgi-bin|logs?|tmp)$/i;
  for (const s of subs.filter((n) => !skip.test(n)).slice(0, 40)) {
    const d = join(dir, s);
    if (await probe(d)) return d;
  }
  return null;
}

/**
 * Diagnóstico passo a passo. Devolve {ok, steps[], suggestedDir}.
 * Cada step: {name, ok, detail}.
 */
async function diagnose(cfg) {
  const steps = [];
  const add = (name, ok, detail = "") => { steps.push({ name, ok, detail }); return ok; };
  const out = () => ({ ok: steps.every((s) => s.ok), steps, suggestedDir: null });

  if (!cfg.ftpHost || !cfg.ftpUser || !cfg.ftpPass) {
    add("Dados preenchidos", false, "Informe servidor, usuário e senha do FTP");
    return out();
  }
  add("Dados preenchidos", true);

  if (!add("Servidor responde", await canConnect(cfg.ftpHost), cfg.ftpHost)) return out();

  const client = new ftp.Client(20000);
  try {
    try {
      await client.access({ host: cfg.ftpHost, user: cfg.ftpUser, password: cfg.ftpPass, secure: !!cfg.ftpSecure });
      add("Login no FTP", true, cfg.ftpUser);
    } catch (e) {
      add("Login no FTP", false, friendly(e));
      return out();
    }

    let names = [];
    try {
      names = (await client.list("/")).filter((f) => f.isDirectory).map((f) => f.name);
      add("Listar pastas", true, names.slice(0, 8).join(", ") || "(vazio)");
    } catch (e) {
      add("Listar pastas", false, friendly(e));
      return out();
    }

    const found = WEB_ROOTS.find((r) => names.includes(r));
    // Se a pasta já configurada existe no servidor, MANTÉM (o site pode ficar numa subpasta, ex.: /public_html/loja).
    // Trocar por /public_html faria o GoSync enviar para o lugar errado.
    let keep = false;
    if (cfg.remoteDir && cfg.remoteDir !== "/") {
      try { await client.cd(cfg.remoteDir); keep = true; } catch { /* não existe: usa a padrão */ }
    }
    const dir = keep ? cfg.remoteDir : found ? "/" + found : cfg.remoteDir || "/";
    add("Pasta do site", true, keep ? `Mantida a pasta configurada: ${dir}` : found ? `Encontrada: /${found}` : "Padrão não encontrada; usando a raiz do FTP");

    const test = `${dir === "/" ? "" : dir}/.gosync-teste`;
    try {
      await client.ensureDir(dir);
      const { Readable } = require("stream");
      await client.uploadFrom(Readable.from(["ok"]), test);
      await client.remove(test);
      add("Permissão de gravação", true, dir);
    } catch (e) {
      add("Permissão de gravação", false, friendly(e));
      return { ok: false, steps, suggestedDir: dir };
    }

    // O endereço público do site lê mesmo essa pasta? (subdomínios costumam usar uma subpasta, ex.: /public_html/loja)
    if (cfg.siteUrl) {
      const site = await findSiteDir(client, dir, cfg.siteUrl);
      if (site === dir) add("Site lê esta pasta", true, cfg.siteUrl);
      else if (site) { add("Site lê esta pasta", true, `Pasta corrigida para ${site} (é a que ${cfg.siteUrl} mostra)`); return { ok: true, steps, suggestedDir: site }; }
      else if (site === null) add("Site lê esta pasta", false, `${cfg.siteUrl} não mostra arquivos de ${dir} nem das subpastas. Confira o endereço público ou a pasta do subdomínio no painel da Locaweb.`);
      // undefined: site fora do ar / sem resposta → não dá para afirmar nada
    }
    return { ok: steps.every((x) => x.ok), steps, suggestedDir: dir };
  } finally {
    client.close();
  }
}

module.exports = { detectHost, diagnose, cleanDomain, findSiteDir };
