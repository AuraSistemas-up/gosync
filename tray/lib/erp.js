const { cmpSize } = require("./firebird-model");
// Busca no ERP e agrupa SKUs em modelo > cor > numeração.
// Espelha src/types/product.ts. Ajuste RawErpItem/groupProducts ao JSON real do seu ERP.

const slugify = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Aceita 12.9 | "12.90" | "12,90" | "1.234,56" | "1,234.56" | "1.234". Antes, "12.90" virava 1290.
const toNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let t = String(v ?? "0").trim().replace(/[^\d.,-]/g, "");
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    t = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma >= 0) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // "1.234" = milhar
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRaw({ url, token }, log, { timeoutMs = 15000, retries = 2 } = {}) {
  if (!url) throw new Error("URL da API do ERP não configurada");
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) {
        const json = await res.json().catch(() => {
          throw new Error("Resposta do ERP não é um JSON válido");
        });
        const list = Array.isArray(json) ? json : json?.data;
        if (!Array.isArray(list)) throw new Error("Resposta do ERP não é uma lista de produtos");
        return list;
      }
      last = new Error(`ERP retornou HTTP ${res.status}`);
      if (res.status < 500) throw last; // 4xx (inclui 429): não insistir
    } catch (e) {
      if (e.name === "AbortError") last = new Error(`ERP não respondeu em ${timeoutMs / 1000}s`);
      else last = e;
      if (/HTTP 4\d\d|JSON válido|lista de produtos/.test(last.message)) throw last;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) {
      log?.(`Tentativa ${attempt + 1} falhou (${last.message}). Repetindo…`);
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw last;
}

function groupProducts(items) {
  const products = new Map();
  for (const it of items) {
    if (!it.modelo || it.tamanho == null) continue;
    const id = slugify(it.modelo);
    let p = products.get(id);
    if (!p) {
      const price = toNumber(it.preco);
      const promo = toNumber(it.preco_promocional);
      p = {
        id,
        name: String(it.modelo).trim(),
        brand: it.marca || undefined,
        category: it.categoria ? slugify(it.categoria) : undefined,
        categoryLabel: it.categoria ? String(it.categoria).trim() : undefined,
        gender: it.genero ? slugify(it.genero) : undefined,
        price,
        promoPrice: promo > 0 && promo < price ? promo : undefined,
        variants: [],
      };
      products.set(id, p);
    }
    const colorSlug = slugify(it.cor || "unica");
    let v = p.variants.find((x) => x.colorSlug === colorSlug);
    if (!v) {
      v = { color: String(it.cor || "Única").trim(), colorSlug, image: undefined, images: [], sizes: [], totalStock: 0 };
      p.variants.push(v);
    }
    for (const url of [it.imagem, ...(it.imagens ?? [])]) {
      if (url && !v.images.includes(url)) v.images.push(url);
    }
    v.image = v.images[0];

    const stock = Math.max(0, Math.trunc(toNumber(it.estoque)));
    const size = String(it.tamanho);
    const ex = v.sizes.find((s) => s.size === size);
    if (ex) {
      ex.stock += stock;
      ex.available = ex.stock > 0;
    } else {
      v.sizes.push({ size, stock, sku: String(it.codigo ?? ""), available: stock > 0 });
    }
  }

  const out = [...products.values()];
  for (const p of out) {
    for (const v of p.variants) {
      v.sizes.sort((a, b) => cmpSize(a.size, b.size)); // números primeiro, depois P/M/G
      v.totalStock = v.sizes.reduce((t, s) => t + s.stock, 0);
    }
    p.variants = p.variants.filter((v) => v.totalStock > 0);
  }
  return out.filter((p) => p.variants.length > 0);
}

module.exports = { fetchRaw, groupProducts };
