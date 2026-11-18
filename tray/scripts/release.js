// Uso: npm run release            → sobe versão patch, builda, commita, dá push e publica a release
//      npm run release -- --no-bump   → usa a versão atual do package.json
//      npm run release -- --notes "texto das mudanças"
// Requer: git, gh (autenticado) e remoto "origin" configurado. Roda a partir de tray/.
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const tray = path.resolve(__dirname, "..");
const root = path.resolve(tray, "..");
const args = process.argv.slice(2);
const noBump = args.includes("--no-bump");
const ni = args.indexOf("--notes");
const notes = ni >= 0 ? args[ni + 1] : "";

const sh = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });
const out = (cmd, cwd = root) => execSync(cmd, { cwd, encoding: "utf8" }).trim();

if (!noBump) sh("npm version patch --no-git-tag-version", tray);
const version = JSON.parse(fs.readFileSync(path.join(tray, "package.json"), "utf8")).version;
const tag = `v${version}`;
console.log(`\n▶ Release ${tag}\n`);

sh("npm run dist", tray);

const dist = path.join(tray, "dist");
const files = fs.readdirSync(dist)
  .filter((f) => f === "latest.yml" || (f.startsWith("GoSync-Setup-") && (f.endsWith(".exe") || f.endsWith(".exe.blockmap"))))
  .filter((f) => f.includes(version) || f === "latest.yml")
  .map((f) => path.join(dist, f));
if (!files.some((f) => f.endsWith(".exe")) || !files.some((f) => f.endsWith("latest.yml")))
  throw new Error("Instalador ou latest.yml não encontrados em tray/dist");

sh("git add -A");
if (out("git status --porcelain")) sh(`git commit -m "release: ${tag}"`);
if (!out("git tag -l " + tag)) sh(`git tag ${tag}`);
const branch = out("git rev-parse --abbrev-ref HEAD");
sh(`git push origin ${branch}`);
sh(`git push origin ${tag}`);

const gh = spawnSync(
  "gh",
  ["release", "create", tag, ...files, "--title", `GoSync ${tag}`, ...(notes ? ["--notes", notes] : ["--generate-notes"])],
  { cwd: root, stdio: "inherit", shell: false },
);
if (gh.status !== 0) throw new Error("Falha ao criar a release no GitHub");
console.log(`\n✔ Release ${tag} publicada. Os GoSync instalados vão se atualizar sozinhos.`);
