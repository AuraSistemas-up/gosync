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
for (const f of ["admin/credenciais.json", "admin/tentativas.json", "data/config.json", "banners", "logo"]) {
  fs.rmSync(path.join(out, f), { recursive: true, force: true });
}

const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`\nPasta pronta: ${out}\n${count(out)} arquivos`);
