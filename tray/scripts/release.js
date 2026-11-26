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

// Antes de qualquer build: confere o GitHub. Evita gerar uma versão que já existe lá (publicada de outra branch)
// ou publicar a partir de uma branch desatualizada, o que desfaria mudanças de releases anteriores.
sh("git fetch origin --tags --quiet");
const curBranch = out("git rev-parse --abbrev-ref HEAD");
if (out(`git ls-remote --heads origin ${curBranch}`)) {
  const behind = Number(out(`git rev-list --count HEAD..origin/${curBranch}`));
  if (behind) throw new Error(`A branch ${curBranch} está ${behind} commit(s) atrás de origin/${curBranch}. Faça git pull antes.`);
}
const latest = out("gh release view --json tagName -q .tagName").replace(/^v/, "");
if (latest && out(`git merge-base --is-ancestor v${latest} HEAD && echo sim || echo nao`) !== "sim")
  throw new Error(`A release mais recente (v${latest}) não está nesta branch. Faça merge dela antes, senão as mudanças dela se perdem.`);
const pkgVer = JSON.parse(fs.readFileSync(path.join(tray, "package.json"), "utf8")).version;
const bumpPatch = (v) => v.split(".").map(Number).map((n, i) => (i === 2 ? n + 1 : n)).join(".");
const nextVer = noBump ? pkgVer : bumpPatch(pkgVer);
if (out(`git ls-remote --tags origin v${nextVer}`)) throw new Error(`A tag v${nextVer} já existe no GitHub. Atualize a versão no package.json antes.`);

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
