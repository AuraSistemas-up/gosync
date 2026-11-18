/**
 * Exporta o catálogo de um banco Firebird (ERP UpSystem) para o formato do site:
 *   <out>/data/catalog.json  +  <out>/fotos/<hash>.webp
 *
 * SOMENTE LEITURA: usa transação READ_ONLY e apenas SELECT.
 *
 * Uso:  node scripts/exportar-firebird.cjs [--out public] [--no-fotos]
 * Variáveis opcionais: FB_DB, FB_HOST, FB_PORT, FB_USER, FB_PASSWORD, FB_CLIENT,
 *                      STORE_NAME, STORE_COLOR, STORE_WHATSAPP
 */
process.env.PATH = "C:/Program Files/Firebird/Firebird_5_0;" + process.env.PATH;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createNativeClient } = require("node-firebird-driver-native");

const args = process.argv.slice(2);
const OUT = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : "public");
const WITH_PHOTOS = !args.includes("--no-fotos");
// Credenciais e dados da loja ficam em .fb.env (não vai para o Git). Formato: CHAVE=valor por linha.
require("./carregar-env.cjs");
const env = process.env;
for (const k of ['FB_DB', 'FB_USER', 'FB_PASSWORD']) if (!env[k]) { console.error('Faltou ' + k + ' (defina em .fb.env — veja .fb.env.example)'); process.exit(1); }
const DB = env.FB_DB;
const URL = `inet://${env.FB_HOST || "127.0.0.1"}:${env.FB_PORT || 3060}/${DB}`;

const STORE = {
  name: env.STORE_NAME || "Minha Loja",
  primaryColor: env.STORE_COLOR || "#a33a33",
  whatsapp: (env.STORE_WHATSAPP || "").replace(/\D/g, ""),
};

const { buildProducts } = require("../tray/lib/firebird-model.js"); // consultas e agrupamento (compartilhado com o GoSync)


/* ---------- principal ---------- */
(async () => {
  const t0 = Date.now();
  const client = createNativeClient(env.FB_CLIENT || "C:/Program Files/Firebird/Firebird_5_0/fbclient.dll");
  const att = await client.connect(URL, { username: env.FB_USER, password: env.FB_PASSWORD, charSetForNONE: "win1252" });
  const tx = await att.startTransaction({ accessMode: "READ_ONLY" });
  const q = async (sql) => {
    const rs = await att.executeQuery(tx, sql);
    const rows = await rs.fetchAsObject();
    await rs.close();
    return rows;
  };

  let sharp = null;
  if (WITH_PHOTOS) sharp = require("sharp");
  const fotosDir = path.join(OUT, "fotos");
  if (WITH_PHOTOS) fs.mkdirSync(fotosDir, { recursive: true });

  const photoCache = new Map(); // chave (prd/var) → "/fotos/x.webp" | null
  let photoCount = 0, photoFail = 0;
  async function photoUrl(key, blobRef) {
    if (!WITH_PHOTOS || !blobRef) return null;
    if (photoCache.has(key)) return photoCache.get(key);
    let url = null;
    try {
      const stream = await att.openBlob(tx, blobRef);
      const chunks = [];
      const buf = Buffer.alloc(65536);
      let n;
      while ((n = await stream.read(buf)) !== -1) chunks.push(Buffer.from(buf.subarray(0, n)));
      await stream.close();
      const raw = Buffer.concat(chunks);
      if (raw.length > 100) {
        const base = sharp(raw).rotate(); // respeita a orientação EXIF
        // Fotos pequenas do ERP (< 700 px) são ampliadas (Lanczos + leve nitidez) para não ficarem borradas no pop-up.
        const meta = await sharp(raw).rotate().metadata();
        const longest = Math.max(meta.width || 0, meta.height || 0);
        const small = longest > 0 && longest < 700;
        const bigPipe = small
          ? base.clone().resize({ width: 800, height: 800, fit: "inside", kernel: "lanczos3" }).sharpen({ sigma: 0.7 })
          : base.clone().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true });
        const webp = await bigPipe.webp({ quality: 84, effort: 5 }).toBuffer();
        const name = crypto.createHash("sha1").update(webp).digest("hex").slice(0, 16) + ".webp";
        const file = path.join(fotosDir, name);
        if (!fs.existsSync(file)) { fs.writeFileSync(file, webp); photoCount++; }
        // Miniatura (520 px) para os cards: carrega rápido e continua nítida em telas comuns.
        const thumbFile = file.replace(/\.webp$/, "-s.webp");
        if (!fs.existsSync(thumbFile)) fs.writeFileSync(thumbFile, await base.clone().resize({ width: 520, height: 520, fit: "inside", withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toBuffer());
        url = "/fotos/" + name;
      }
    } catch { photoFail++; }
    photoCache.set(key, url);
    return url;
  }

  const products = await buildProducts({ q, photoUrl, log: console.log, tipos: env.FB_TIPOS || "N,G" });
  await tx.commit();
  await att.disconnect();
  await client.dispose();

  // Banners de propaganda: imagens colocadas em <out>/banners (ordem alfabética: 1.jpg, 2.jpg…).
  const bdir = path.join(OUT, "banners");
  const banners = fs.existsSync(bdir)
    ? fs.readdirSync(bdir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, 6).map((f) => ({ image: "/banners/" + f }))
    : [];

  fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
  const file = path.join(OUT, "data", "catalog.json");
  fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), whatsapp: STORE.whatsapp, store: { name: STORE.name, primaryColor: STORE.primaryColor, banners }, products }));

  const withPhoto = products.filter((p) => p.variants.some((v) => v.images.length)).length;
  const cats = {};
  for (const p of products) cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1;
  console.log(`\nPronto em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`Modelos: ${products.length} (com foto: ${withPhoto}) · fotos novas: ${photoCount} · falhas de foto: ${photoFail}`);
  console.log("Grupos:", Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
  console.log("Arquivo:", file, `(${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
