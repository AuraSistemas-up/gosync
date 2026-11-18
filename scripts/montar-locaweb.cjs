// Monta a pasta "locaweb/" com exatamente os arquivos que devem ser enviados à hospedagem
// (conteúdo da pasta, não a pasta em si, vai para /public_html/kuelhos).  Uso: node scripts/montar-locaweb.cjs
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "locaweb");

execSync("npm run build", { cwd: root, stdio: "inherit" });
// Esvazia a pasta SEM apagar a própria pasta (se o Explorer, o FileZilla ou o OneDrive estiver com ela aberta,
// o Windows não deixa remover a pasta em si, mas deixa trocar o conteúdo). Tenta de novo se houver bloqueio passageiro.
fs.mkdirSync(out, { recursive: true });
for (const entry of fs.readdirSync(out)) {
  fs.rmSync(path.join(out, entry), { recursive: true, force: true, maxRetries: 10, retryDelay: 400 });
}
fs.cpSync(path.join(root, "dist"), out, { recursive: true });
// Estes pertencem ao SERVIDOR (criados/alterados pelo painel admin): ficam fora da pasta para que enviar a
// pasta inteira nunca sobrescreva logo, banners, cor e mensagem que você configurou no /admin.
for (const f of ["admin/credenciais.json", "admin/tentativas.json", "admin/stats.json", "admin/rate.json", "data/config.json", "banners", "logo"]) {
  fs.rmSync(path.join(out, f), { recursive: true, force: true });
}

// Páginas de produto com prévia (WhatsApp/Google), sitemap.xml e robots.txt — precisam do endereço público (.deploy.env: SITE_URL).
async function gerarPaginas() {
  const envFile = path.join(root, ".deploy.env");
  const env = {};
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2];
    }
  }
  const siteUrl = process.env.SITE_URL || env.SITE_URL;
  const catFile = path.join(out, "data", "catalog.json");
  if (!siteUrl || !fs.existsSync(catFile)) { console.log("Páginas com prévia puladas (defina SITE_URL no .deploy.env)."); return; }
  const { generate, fetchHidden } = require(path.join(root, "tray", "lib", "pages.js"));
  const cat = JSON.parse(fs.readFileSync(catFile, "utf8"));
  const template = fs.readFileSync(path.join(out, "produto", "index.html"), "utf8");
  const hidden = await fetchHidden(siteUrl);
  const r = generate({ template, products: cat.products, siteUrl, storeName: cat.store?.name || "", hidden });
  fs.mkdirSync(path.join(out, "p"), { recursive: true });
  for (const p of r.pages) if (/^[a-z0-9-]+$/.test(p.id)) fs.writeFileSync(path.join(out, "p", `${p.id}.html`), p.html);
  fs.writeFileSync(path.join(out, "sitemap.xml"), r.sitemap);
  fs.writeFileSync(path.join(out, "robots.txt"), r.robots);
  cat.store = { ...(cat.store || {}), pages: true };
  fs.writeFileSync(catFile, JSON.stringify(cat));
  console.log(`Páginas com prévia: ${r.pages.length} (+ sitemap.xml e robots.txt) para ${siteUrl}`);
}

const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
gerarPaginas()
  .catch((e) => console.log("Páginas com prévia falharam:", e.message))
  .then(() => console.log(`\nPasta pronta: ${out}\n${count(out)} arquivos`));
