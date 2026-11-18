/**
 * Leitura do ERP UpSystem (Firebird) e montagem do catálogo: modelo > cor > numeração.
 * Compartilhado pelo GoSync (tray) e pelo script scripts/exportar-firebird.cjs.
 * SOMENTE LEITURA: só executa SELECT (a transação é aberta READ_ONLY por quem chama).
 */

const slugify = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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

/**
 * @param q         async (sql) => rows  (somente SELECT, transação READ_ONLY aberta)
 * @param photoUrl  async (chave, blobRef) => "/fotos/x.ext" | null   (chave: "p<id>" ou "v<id>:<variação>")
 * @param log       (texto) => void
 * @returns Product[] já agrupado, no formato de src/types/product.ts
 */
async function buildProducts({ q, photoUrl, log = () => {} }) {
  log("Lendo produtos…");
  const STOCK = "EXISTS(SELECT 1 FROM TB_PRODUTO_ESTOQUE e WHERE e.PRDE_PRODUTO = p.PRD_ID AND e.PRDE_ESTOQUE > 0)";
  const prods = await q(`
    SELECT p.PRD_ID, p.PRD_CODIGO, p.PRD_DESCRICAO, p.PRD_REFERENCIA, p.PRD_PRECO_VENDA, g.PGRU_DESCRICAO AS GRUPO, p.PRD_IMAGEM
    FROM TB_PRODUTO p LEFT JOIN TB_PROD_GRUPO g ON g.PGRU_ID = p.PRD_GRUPO
    WHERE p.PRD_STATUS = 'A' AND p.PRD_EXPORTAR = 'S' AND ${STOCK}`);

  const stockRows = await q(`SELECT PRDE_PRODUTO AS P, COALESCE(PRDE_VARIACAO, 0) AS V, SUM(PRDE_ESTOQUE) AS S FROM TB_PRODUTO_ESTOQUE WHERE PRDE_ESTOQUE > 0 GROUP BY 1, 2`);
  const stock = new Map(); // "p:v" → qtd
  const prodStock = new Map();
  for (const r of stockRows) {
    stock.set(`${r.P}:${r.V}`, Number(r.S));
    prodStock.set(r.P, (prodStock.get(r.P) || 0) + Number(r.S));
  }

  log("Lendo variações e atributos…");
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
    if (n % 500 === 0) log(`  processando ${n}/${prods.length}…`);
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
  return products;
}

module.exports = { buildProducts, parseName, slugify, cmpSize };
