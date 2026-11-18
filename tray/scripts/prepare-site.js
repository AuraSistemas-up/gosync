// Gera o site (Astro) na raiz do repositório e copia dist/ → tray/site-dist,
// que o electron-builder embute no instalador (extraResources).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const target = path.resolve(__dirname, "..", "site-dist");

if (!fs.existsSync(path.join(root, "node_modules"))) execSync("npm install", { cwd: root, stdio: "inherit" });
execSync("npm run build", { cwd: root, stdio: "inherit" });

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(path.join(root, "dist"), target, { recursive: true });
// Nunca embutir dados de exemplo: o catálogo real vem do ERP.
fs.rmSync(path.join(target, "data"), { recursive: true, force: true });
fs.rmSync(path.join(target, "fotos"), { recursive: true, force: true });
fs.rmSync(path.join(target, "banners"), { recursive: true, force: true }); // banners vêm do painel admin / GoSync
fs.rmSync(path.join(target, "logo"), { recursive: true, force: true });
fs.rmSync(path.join(target, "admin", "credenciais.json"), { force: true });
fs.rmSync(path.join(target, "admin", "tentativas.json"), { force: true });
console.log("Site embutido em", target);
