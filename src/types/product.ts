/** Estoque de uma numeração específica. */
export interface SizeStock {
  size: string; // "38", "39"...
  stock: number;
  sku: string;
  available: boolean; // stock > 0
}

/** Variante = um modelo em uma cor, com suas numerações. */
export interface Variant {
  color: string;
  colorSlug: string;
  image?: string; // foto principal
  images: string[]; // galeria (inclui a principal)
  sizes: SizeStock[]; // ordenadas
  totalStock: number;
}

/** Produto = modelo agrupado, com todas as cores. */
export interface Product {
  id: string; // slug do modelo
  name: string;
  brand?: string;
  category?: string; // slug do grupo (ex.: "tenis")
  categoryLabel?: string; // nome original do ERP (ex.: "Tênis")
  gender?: string; // "masculino" | "feminino" | "infantil" | "unissex"
  price: number;
  promoPrice?: number; // só se menor que price
  variants: Variant[];
}

/** Arquivo /data/catalog.json, gerado e enviado pelo app da bandeja (tray/). */
export interface CatalogFile {
  updatedAt: string; // ISO
  whatsapp: string; // só dígitos, com DDI
  store?: { name?: string; primaryColor?: string }; // identidade da loja (definida no GoSync)
  products: Product[];
}
