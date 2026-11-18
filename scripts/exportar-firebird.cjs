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

/* ---------- normalização de nomes ---------- */
const slugify = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// 1ª palavra da descrição → tipo (usado como grupo, porque no banco quase tudo está em "GERAL").
const TIPOS = {
  SAND: "Sandália", SANDALIA: "Sandália", TENIS: "Tênis", SAP: "Sapato", SAPATO: "Sapato", SAPATILHA: "Sapatilha", CHIN: "Chinelo",
  CHINELO: "Chinelo", TAM: "Tamanco", TAMANCO: "Tamanco", BOLSA: "Bolsa", BOTA: "Bota", MEIA: "Meia", KIT: "Kit", CINTO: "Cinto",
  CARTEIRA: "Carteira", CAMISETA: "Camiseta", MALA: "Mala", MOCHILA: "Mochila", CALCA: "Calça", TOP: "Top", BABUCHE: "Babuche",
  GALOCHA: "Galocha", SHORT: "Short", RASTEIRA: "Rasteira", FRASQUEIRA: "Frasqueira", NECESSAIRE: "Necessaire", PANTUFA: "Pantufa",
  MOCASSIM: "Mocassim", SCARPIN: "Scarpin", ANABELA: "Anabela", PAPETE: "Papete", CORDAO: "Cordão", BONE: "Boné", BERMUDA: "Bermuda",
};
const IGNORAR = /^(\d|PDV|DISPLAY|SACOLA|SACOLAS|REGUA|ETIQUETA|EMBALAGEM|CAIXA|BRINDE|SACO)\b/i;

// 2ª palavra → marca (somente marcas inequívocas; o banco não tem marca cadastrada).
const MARCAS = {
  MOLECA: "Moleca", MOLEKINHA: "Molekinha", MOLEKINHO: "Molekinho", VIZZANO: "Vizzano", MODARE: "Modare", HAVAIANAS: "Havaianas",
  KIDY: "Kidy", PICCADILLY: "Piccadilly", OLYMPIKUS: "Olympikus", CHENSON: "Chenson", LUPO: "Lupo", DAKOTA: "Dakota",
  CARTAGO: "Cartago", RAINHA: "Rainha", RAMARIM: "Ramarim", FILA: "Fila", DIJEAN: "Dijean", PETITE: "Petite", FASOLO: "Fasolo",
  DEMOCRATA: "Democrata", TOPPER: "Topper", GIULIA: "Giulia", ANNE: "Anne", PRIMICIA: "Primícia", YINS: "Yins",
};

const GERAL = /^geral$/i;
const titleCase = (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());

const SIZE_SUFFIX = /\s+N\s?(\d{2}(?:\/\d{2})?)\s*$/i;

function parseName(desc) {
  const clean = String(desc || "").replace(/\s+/g, " ").trim();
  const m = SIZE_SUFFIX.exec(clean);
  const base = m ? clean.slice(0, m.index).trim() : clean;
  const words = base.split(" ");
  const first = (words[0] || "").toUpperCase();
  const tipo = TIPOS[first] ?? null;
  let brand;
  if (words[1]) {
    const w = words[1].toUpperCase();
    if (w === "BEIRA" && (words[2] || "").toUpperCase() === "RIO") brand = "Beira Rio";
    else brand = MARCAS[w];
  }
  // Nome de exibição: expande o tipo abreviado e capitaliza (códigos com número ficam em maiúsculas).
  const shown = words.map((w, i) => {
    if (i === 0 && tipo) return tipo;
    if (/\d/.test(w) || w.length <= 2) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  return { base, display: shown.join(" "), size: m ? m[1] : null, tipo, brand };
}

const genderOf = (s) => {
  const t = String(s || "").toUpperCase();
  if (/INFANT|BABY|KIDS|JUVENIL/.test(t)) return "infantil";
  if (/FEMININ/.test(t)) return "feminino";
  if (/MASCULIN/.test(t)) return "masculino";
  return undefined;
};

const cmpSize = (a, b) => {
  const na = parseFloat(a), nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb || a.localeCompare(b);
  if (!isNaN(na)) return -1;
  if (!isNaN(nb)) return 1;
  return a.localeCompare(b, "pt-BR");
};

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

  console.log("Lendo produtos…");
  const STOCK = "EXISTS(SELECT 1 FROM TB_PRODUTO_ESTOQUE e WHERE e.PRDE_PRODUTO = p.PRD_ID AND e.PRDE_ESTOQUE > 0)";
  const prods = await q(`
    SELECT p.PRD_ID, p.PRD_CODIGO, p.PRD_DESCRICAO, p.PRD_REFERENCIA, p.PRD_PRECO_VENDA, g.PGRU_DESCRICAO AS GRUPO, p.PRD_IMAGEM
    FROM TB_PRODUTO p LEFT JOIN TB_PROD_GRUPO g ON g.PGRU_ID = p.PRD_GRUPO
    WHERE p.PRD_STATUS = 'A' AND p.PRD_EXPORTAR = 'S' AND ${STOCK}`);
  const prodById = new Map(prods.map((p) => [p.PRD_ID, p]));

  const stockRows = await q(`SELECT PRDE_PRODUTO AS P, COALESCE(PRDE_VARIACAO, 0) AS V, SUM(PRDE_ESTOQUE) AS S FROM TB_PRODUTO_ESTOQUE WHERE PRDE_ESTOQUE > 0 GROUP BY 1, 2`);
  const stock = new Map(); // "p:v" → qtd
  const prodStock = new Map();
  for (const r of stockRows) {
    stock.set(`${r.P}:${r.V}`, Number(r.S));
    prodStock.set(r.P, (prodStock.get(r.P) || 0) + Number(r.S));
  }

  console.log("Lendo variações e atributos…");
  const vars = await q(`
    SELECT v.PRV_PRODUTO AS P, v.PRV_ID AS V, v.PRV_DESCRICAO AS D, v.PRV_REFERENCIA AS REF, v.PRV_PRECO AS PRECO, v.PRV_IMAGEM AS IMG
    FROM TB_PRODUTO_VARIACAO v JOIN TB_PRODUTO p ON p.PRD_ID = v.PRV_PRODUTO
    WHERE v.PRV_STATUS = 'A' AND p.PRD_STATUS = 'A' AND p.PRD_EXPORTAR = 'S' AND ${STOCK}`);
  const attrs = await q(`
    SELECT pva.PVA_PRODUTO AS P, pva.PVA_VARIACAO AS V, t.TAT_DESCRICAO AS TIPO, a.ATR_DESCRICAO AS ATR
    FROM TB_PROD_VARIACAO_ATRIBUTO pva
    JOIN TB_ATRIBUTO a ON a.ATR_ID = pva.PVA_ATRIBUTO
    JOIN TB_TIPO_ATRIBUTO t ON t.TAT_ID = a.ATR_TIPO_ATRIBUTO
    JOIN TB_PRODUTO p ON p.PRD_ID = pva.PVA_PRODUTO
    WHERE p.PRD_STATUS = 'A' AND p.PRD_EXPORTAR = 'S' AND ${STOCK}`);

  const attrByVar = new Map();
  for (const a of attrs) {
    const k = `${a.P}:${a.V}`;
    (attrByVar.get(k) ?? attrByVar.set(k, []).get(k)).push({ tipo: String(a.TIPO || "").toUpperCase(), valor: String(a.ATR || "").trim() });
  }
  const varsByProd = new Map();
  for (const v of vars) (varsByProd.get(v.P) ?? varsByProd.set(v.P, []).get(v.P)).push(v);

  /* ----- monta modelos ----- */
  const models = new Map(); // chave → model
  const getModel = (key, init) => models.get(key) ?? (models.set(key, { ...init, variants: new Map(), minPrice: Infinity, gender: undefined }).get(key));
  const addVariant = (m, color) => {
    const slug = slugify(color || "unica");
    return m.variants.get(slug) ?? m.variants.set(slug, { color: color || "Único", colorSlug: slug, images: [], sizes: new Map() }).get(slug);
  };
  const addSize = (variant, size, qty, sku, image) => {
    const cur = variant.sizes.get(size);
    if (cur) { cur.stock += qty; cur.image ??= image; }
    else variant.sizes.set(size, { size, stock: qty, sku, available: qty > 0, image: image || undefined });
  };

  let n = 0;
  for (const p of prods) {
    n++;
    if (n % 500 === 0) console.log(`  processando ${n}/${prods.length}…`);
    const info = parseName(p.PRD_DESCRICAO);
    if (IGNORAR.test(info.base)) continue;

    const pvars = (varsByProd.get(p.PRD_ID) || []).filter((v) => (stock.get(`${p.PRD_ID}:${v.V}`) || 0) > 0);
    const categoria = info.tipo ?? (p.GRUPO && !GERAL.test(p.GRUPO) ? titleCase(String(p.GRUPO).trim()) : "Outros");
    const price = Number(p.PRD_PRECO_VENDA) || 0;

    if (pvars.length) {
      // Produto com grade por variações (tamanho + cor).
      const m = getModel(`P${p.PRD_ID}`, { id: slugify(info.display) + "-" + p.PRD_ID, name: info.display, brand: info.brand, category: categoria, price });
      for (const v of pvars) {
        const at = attrByVar.get(`${p.PRD_ID}:${v.V}`) || [];
        const cor = at.find((a) => a.tipo.includes("COR"))?.valor;
        const tam = at.find((a) => a.tipo.includes("TAMANHO"));
        const variant = addVariant(m, cor ? titleCase(cor) : null);
        m.gender ??= genderOf(tam?.tipo ?? v.D);
        const url = await photoUrl(`v${p.PRD_ID}:${v.V}`, v.IMG);
        if (url && !variant.images.includes(url)) variant.images.push(url);
        const size = tam?.valor || (String(v.D || "").match(/(\d{2}(?:\/\d{2})?)\s*$/)?.[1]) || "Único";
        addSize(variant, size, stock.get(`${p.PRD_ID}:${v.V}`) || 0, v.REF || p.PRD_REFERENCIA || String(p.PRD_CODIGO), url);
        const vp = Number(v.PRECO);
        m.minPrice = Math.min(m.minPrice, vp > 0 ? vp : price || Infinity);
      }
      const pu = await photoUrl(`p${p.PRD_ID}`, p.PRD_IMAGEM);
      if (pu) for (const variant of m.variants.values()) if (!variant.images.length) variant.images.push(pu);
    } else {
      // Produto "legado": um cadastro por numeração (ex.: "TENIS RAINHA VL 2500 N44") → agrupa por modelo.
      const qty = prodStock.get(p.PRD_ID) || 0;
      if (qty <= 0) continue;
      const m = getModel(`L${slugify(info.base)}`, { id: slugify(info.display) + "-" + p.PRD_ID, name: info.display, brand: info.brand, category: categoria, price });
      m.gender ??= genderOf(p.GRUPO);
      const variant = addVariant(m, null);
      const url = await photoUrl(`p${p.PRD_ID}`, p.PRD_IMAGEM);
      if (url && !variant.images.includes(url)) variant.images.push(url);
      addSize(variant, info.size || "Único", qty, p.PRD_REFERENCIA || String(p.PRD_CODIGO));
      m.minPrice = Math.min(m.minPrice, price || Infinity);
    }
  }

  await tx.commit();
  await att.disconnect();
  await client.dispose();

  /* ----- serializa ----- */
  const products = [];
  for (const m of models.values()) {
    const variants = [...m.variants.values()].map((v) => {
      const sizes = [...v.sizes.values()].sort((a, b) => cmpSize(a.size, b.size));
      return { color: v.color, colorSlug: v.colorSlug, image: v.images[0], images: v.images, sizes, totalStock: sizes.reduce((t, s) => t + s.stock, 0) };
    }).filter((v) => v.totalStock > 0);
    if (!variants.length) continue;
    const price = Number.isFinite(m.minPrice) ? m.minPrice : m.price;
    if (!(price > 0)) continue; // sem preço de venda: não publicar
    products.push({
      id: m.id, name: m.name, brand: m.brand, category: slugify(m.category), categoryLabel: m.category, gender: m.gender, price, variants,
    });
  }
  products.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

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
