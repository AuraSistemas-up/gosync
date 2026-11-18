// Gera public/data/catalog.json com produtos de exemplo, só para testar o site localmente.
// O arquivo é apagado ao fechar o testar-site.bat e nunca vai para o Git nem para o build publicado.
import { mkdirSync, writeFileSync } from "node:fs";

const img = (bg, label) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${bg}"/>` +
      `<text x="300" y="320" font-size="44" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`,
  );

const sizes = (list) =>
  list.map(([size, stock], i) => ({ size: String(size), stock, sku: `SKU-${size}-${i}`, available: stock > 0 }));
const variant = (color, bg, list) => {
  const s = sizes(list);
  return { color, colorSlug: color.toLowerCase(), image: img(bg, color), images: [img(bg, color), img("#444", color + " 2")], sizes: s, totalStock: s.reduce((t, x) => t + x.stock, 0) };
};

const products = [
  { id: "tenis-runner", name: "Tênis Runner Pro", brand: "Velox", category: "tenis", categoryLabel: "Tênis", gender: "masculino", price: 249.9, promoPrice: 199.9,
    variants: [variant("Preto", "#222", [[38, 0], [39, 2], [40, 5], [41, 1], [42, 3]]), variant("Branco", "#8a8f98", [[40, 2], [41, 0], [42, 4]])] },
  { id: "tenis-urban", name: "Tênis Urban Feminino", brand: "Velox", category: "tenis", categoryLabel: "Tênis", gender: "feminino", price: 189.9,
    variants: [variant("Rosa", "#d6568a", [[34, 3], [35, 4], [36, 6], [37, 2]])] },
  { id: "sapato-social-classic", name: "Sapato Social Classic", brand: "Ferrante", category: "social", categoryLabel: "Social", gender: "masculino", price: 389.9,
    variants: [variant("Marrom", "#6b3f23", [[39, 1], [40, 2], [41, 3], [42, 2], [43, 1]])] },
  { id: "sandalia-bella", name: "Sandália Bella", brand: "Luna", category: "sandalia", categoryLabel: "Sandália", gender: "feminino", price: 129.9, promoPrice: 99.9,
    variants: [variant("Nude", "#c9a389", [[34, 2], [35, 3], [36, 3]]), variant("Preta", "#1a1a1a", [[35, 1], [36, 0], [37, 2]])] },
  { id: "bota-trekking", name: "Bota Trekking", brand: "Alpina", category: "bota", categoryLabel: "Bota", gender: "unissex", price: 549.9,
    variants: [variant("Caramelo", "#a5652a", [[40, 2], [41, 2], [42, 1], [43, 2], [44, 1]])] },
  { id: "tenis-kids", name: "Tênis Kids Fun", brand: "Pipa", category: "tenis", categoryLabel: "Tênis", gender: "infantil", price: 99.9,
    variants: [variant("Azul", "#2f6fd1", [[28, 3], [29, 3], [30, 2]])] },
];

mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/catalog.json", JSON.stringify({ updatedAt: new Date().toISOString(), whatsapp: "5511999998888", store: { name: "Kuelho's Sapatos", primaryColor: "#A33A33" }, products }));
console.log("Dados de exemplo criados em public/data/catalog.json");
