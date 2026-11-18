/**
 * Publica o site (pasta dist/) na hospedagem por FTP.
 *   node scripts/publicar-ftp.cjs [--sem-build] [--dry-run]
 *
 * Lê .deploy.env (não vai para o Git):  FTP_HOST, FTP_USER, FTP_DIR, FTP_PASSWORD (opcional), FTP_SECURE, SITE_URL
 * Se FTP_PASSWORD não estiver no arquivo, pede a senha no terminal (sem mostrar o que você digita).
 *
 * Regras de envio (para não apagar o que o painel admin do servidor já guarda):
 *  - data/config.json, banners/ e logo/: só enviados se ainda NÃO existirem no servidor (semente inicial).
 *  - fotos/ e demais arquivos: enviados quando novos ou com tamanho diferente.
 *  - admin/credenciais.json e admin/tentativas.json nunca são enviados.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");
const ftp = require(path.resolve(__dirname, "..", "tray", "node_modules", "basic-ftp"));

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const SKIP_BUILD = args.includes("--sem-build");

// ---- .deploy.env ----
const envFile = path.join(ROOT, ".deploy.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const env = process.env;
for (const k of ["FTP_HOST", "FTP_USER", "FTP_DIR"]) {
  if (!env[k]) { console.error(`Faltou ${k} no .deploy.env`); process.exit(1); }
}
const REMOTE_ROOT = env.FTP_DIR.replace(/\/+$/, "") || "/";

const SEED_ONLY = (rel) => rel === "data/config.json" || rel.startsWith("banners/") || rel.startsWith("logo/");
const NEVER = (rel) => /^admin\/(credenciais|tentativas)\.json$/.test(rel) || /\.tmp[0-9a-f]*$/.test(rel);

function walk(dir, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) process.stdout.write(s); }; // não ecoa a digitação
    rl.question(prompt, (ans) => { rl.close(); process.stdout.write("\n"); resolve(ans); });
  });
}

(async () => {
  if (!SKIP_BUILD) {
    console.log("Gerando o site (npm run build)…");
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  }
  if (!fs.existsSync(path.join(DIST, "index.html"))) { console.error("dist/index.html não existe. Rode sem --sem-build."); process.exit(1); }

  const files = walk(DIST).filter((r) => !NEVER(r)).sort();
  const byDir = new Map();
  for (const rel of files) {
    const d = path.posix.dirname(rel);
    (byDir.get(d) ?? byDir.set(d, []).get(d)).push(rel);
  }
  const totalBytes = files.reduce((t, r) => t + fs.statSync(path.join(DIST, r)).size, 0);
  console.log(`\nSite pronto: ${files.length} arquivos, ${(totalBytes / 1048576).toFixed(1)} MB`);
  console.log(`Destino: ftp://${env.FTP_HOST}${REMOTE_ROOT}  (usuário ${env.FTP_USER})`);
  if (DRY) {
    console.log("\n[dry-run] Nada foi enviado. Pastas:", [...byDir.keys()].map((d) => `${d} (${byDir.get(d).length})`).join(", "));
    return;
  }

  const password = env.FTP_PASSWORD || (await askHidden(`Senha do FTP de ${env.FTP_USER}: `));
  if (!password) { console.error("Senha não informada."); process.exit(1); }

  const client = new ftp.Client(60000);
  const connect = async () => client.access({ host: env.FTP_HOST, user: env.FTP_USER, password, secure: env.FTP_SECURE === "true" });
  try {
    await connect();
  } catch (e) {
    console.error("\nNão foi possível entrar no FTP:", /530|login|password/i.test(e.message) ? "usuário ou senha incorretos" : e.message);
    process.exit(1);
  }
  console.log("Conectado. Enviando…\n");

  let sent = 0, skipped = 0, failed = 0, done = 0;
  const started = Date.now();
  for (const [dir, rels] of byDir) {
    const remoteDir = dir === "." ? REMOTE_ROOT : `${REMOTE_ROOT}/${dir}`;
    await client.ensureDir(remoteDir);
    const existing = new Map((await client.list()).filter((f) => f.isFile).map((f) => [f.name, f.size]));
    for (const rel of rels) {
      const name = path.posix.basename(rel);
      const local = path.join(DIST, rel);
      const size = fs.statSync(local).size;
      done++;
      const remoteSize = existing.get(name);
      if (SEED_ONLY(rel) ? remoteSize !== undefined : remoteSize === size) { skipped++; continue; }
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          await client.uploadFrom(local, name);
          ok = true;
        } catch (e) {
          if (attempt === 3) break;
          try { await connect(); await client.ensureDir(remoteDir); } catch { /* tenta de novo */ }
        }
      }
      ok ? sent++ : (failed++, console.log(`  ✗ falhou: ${rel}`));
      if (done % 100 === 0) console.log(`  ${done}/${files.length}  (${sent} enviados, ${skipped} já estavam lá)`);
    }
  }
  client.close();
  console.log(`\nConcluído em ${((Date.now() - started) / 1000).toFixed(0)}s: ${sent} enviados, ${skipped} já existiam, ${failed} falhas.`);

  const site = (env.SITE_URL || "").replace(/\/+$/, "");
  if (site) {
    for (const p of ["/", "/data/catalog.json", "/admin/api.php?a=ping"]) {
      try {
        const r = await fetch(site + p, { signal: AbortSignal.timeout(15000) });
        console.log(`  ${r.ok ? "✔" : "✗"} ${r.status}  ${site}${p}`);
      } catch (e) { console.log(`  ✗ ${site}${p}  (${e.message})`); }
    }
    console.log(`\nSite:  ${site}\nAdmin: ${site}/admin/`);
  }
  if (failed) process.exit(2);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
