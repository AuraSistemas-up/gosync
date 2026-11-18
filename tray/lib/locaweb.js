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
    const dir = found ? "/" + found : cfg.remoteDir || "/";
    add("Pasta do site", true, found ? `Encontrada: /${found}` : "Padrão não encontrada; usando a raiz do FTP");

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
    return { ok: true, steps, suggestedDir: dir };
  } finally {
    client.close();
  }
}

module.exports = { detectHost, diagnose, cleanDomain };
