/**
 * Páginas estáticas por produto (com prévia para WhatsApp/Facebook e dados para o Google), sitemap.xml e robots.txt.
 * Compartilhado pelo GoSync (envio automático) e por scripts/montar-locaweb.cjs (pasta manual).
 *
 * Cada produto vira p/<id>.html = o "molde" produto/index.html do site + tags no <head>:
 * título, descrição, foto, preço (Open Graph) e JSON-LD (schema.org/Product). O navegador abre o mesmo
 * aplicativo do site, então a página funciona igual; só que agora quem lê o HTML (WhatsApp, Google) enxerga o produto.
 */
const crypto = require("crypto");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cmpSize = (a, b) => {
  const na = parseFloat(a), nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  if (!isNaN(na)) return -1;
  if (!isNaN(nb)) return 1;
  return String(a).localeCompare(String(b), "pt-BR");
};

const abs = (site, p) => (p && /^https?:/i.test(p) ? p : p ? site + (p.startsWith("/") ? p : "/" + p) : "");

function describe(p, storeName) {
  const sizes = [...new Set(p.variants.flatMap((v) => v.sizes.filter((s) => s.available).map((s) => s.size)))].sort(cmpSize);
  const cores = p.variants.map((v) => v.color).filter((c) => c && c !== "Único");
  const brandExtra = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? ` ${p.brand}` : "";
  const parts = [`${p.name}${brandExtra} por ${brl(p.promoPrice ?? p.price)}`];
  if (cores.length) parts.push(`Cores: ${cores.slice(0, 4).join(", ")}`);
  if (sizes.length) parts.push(`Numerações: ${sizes.slice(0, 12).join(", ")}${sizes.length > 12 ? "…" : ""}`);
  parts.push(`Peça pelo WhatsApp${storeName ? ` na ${storeName}` : ""}.`);
  return parts.join(". ").replace(/\.\./g, ".").slice(0, 300);
}

/** Renderiza a página de um produto a partir do molde. */
function renderPage(template, p, { siteUrl, storeName }) {
  const site = siteUrl.replace(/\/+$/, "");
  const url = `${site}/p/${p.id}/`;
  const price = p.promoPrice ?? p.price;
  const image = abs(site, p.variants.find((v) => v.image)?.image);
  const images = [...new Set(p.variants.flatMap((v) => v.images))].slice(0, 4).map((i) => abs(site, i));
  const title = `${p.name} · ${brl(price)}${storeName ? ` | ${storeName}` : ""}`;
  const desc = describe(p, storeName);
  const sku = p.variants[0]?.sizes[0]?.sku;
  const available = p.variants.some((v) => v.totalStock > 0);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    ...(images.length ? { image: images } : {}),
    description: desc,
    ...(sku ? { sku } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BRL",
      price: Number(price).toFixed(2),
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  const head = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="product">`,
    `<meta property="og:site_name" content="${esc(storeName || "")}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : "",
    image ? `<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`,
    `<meta property="product:price:amount" content="${Number(price).toFixed(2)}">`,
    `<meta property="product:price:currency" content="BRL">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean).join("\n    ");

  let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  html = html.includes("</head>") ? html.replace("</head>", `    ${head}\n  </head>`) : head + html;
  return html;
}

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

/**
 * @returns {pages: [{id, html, hash}], sitemap, robots}
 * @param opts {template, products, siteUrl, storeName, hidden:Set<string>}
 */
function generate({ template, products, siteUrl, storeName, hidden = new Set() }) {
  const site = siteUrl.replace(/\/+$/, "");
  const list = products.filter((p) => !hidden.has(p.id));
  const pages = list.map((p) => {
    const html = renderPage(template, p, { siteUrl: site, storeName });
    return { id: p.id, html, hash: sha(html) };
  });
  const today = new Date().toISOString().slice(0, 10);
  // Produtos: sem <lastmod> (não há data real de alteração; um valor falso é pior do que nenhum).
  const urls = [`  <url><loc>${esc(site + "/")}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`].concat(
    list.map((p) => `  <url><loc>${esc(`${site}/p/${p.id}/`)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`),
  );
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /data/\n\nSitemap: ${site}/sitemap.xml\n`;
  return { pages, sitemap, robots };
}

/** Lê a lista de produtos ocultos configurada no painel admin (melhor esforço; sem rede = nenhum oculto). */
async function fetchHidden(siteUrl, { nullOnError = false } = {}) {
  const fail = nullOnError ? null : new Set(); // com nullOnError, o chamador sabe que a leitura falhou
  try {
    const r = await fetch(siteUrl.replace(/\/+$/, "") + "/data/config.json", { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (r.status === 404) return new Set(); // painel ainda não salvou nada: nenhum oculto
    if (!r.ok) return fail;
    const c = await r.json();
    return new Set(Array.isArray(c.hidden) ? c.hidden : []);
  } catch {
    return fail;
  }
}

module.exports = { generate, fetchHidden, renderPage };
