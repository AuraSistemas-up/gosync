import type { Product } from "../types/product";
import { categoryName, cmpSize } from "../lib/catalog";

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  product: Product;
  /** Numeração filtrada: destaca o tamanho e mostra a foto da cor que tem estoque nele. */
  size: string | null;
}

export default function ProductCard({ product, size }: Props) {
  const withSize = size ? product.variants.filter((v) => v.sizes.some((s) => s.size === size && s.stock > 0)) : product.variants;
  const v = withSize[0] ?? product.variants[0];

  // Numerações com estoque em qualquer cor.
  const sizes = [...new Set(product.variants.flatMap((x) => x.sizes.filter((s) => s.available).map((s) => s.size)))].sort(cmpSize);
  const shown = sizes.slice(0, 5);
  if (size && sizes.includes(size) && !shown.includes(size)) shown[shown.length - 1] = size;

  const discount = product.promoPrice ? Math.round((1 - product.promoPrice / product.price) * 100) : 0;
  const href = `/produto/?id=${encodeURIComponent(product.id)}&cor=${v.colorSlug}`;

  return (
    <a href={href} class="card" aria-label={product.name}>
      <div class="card-photo">
        {v.image ? <img src={v.image} alt={`${product.name} ${v.color}`} loading="lazy" /> : <span class="no-photo">Sem foto</span>}
        {discount > 0 && <span class="badge-off">-{discount}%</span>}
      </div>
      <div class="card-body">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          {product.brand && <span class="pill">{product.brand}</span>}
          {product.category && <span class="pill" style="opacity:.75">{categoryName(product)}</span>}
        </div>
        <h3 class="card-title" style="margin:0">{product.name}</h3>
        <div class="card-sizes">
          <span class="card-sizes-label">Nº</span>
          {shown.map((s) => (
            <span key={s} class={`card-size-chip${s === size ? " match" : ""}`}>{s}</span>
          ))}
          {sizes.length > shown.length && <span class="card-size-chip more">+{sizes.length - shown.length}</span>}
        </div>
        <div class="card-footer">
          <div>
            {product.promoPrice && <span class="price-old">{brl(product.price)}</span>}
            <span class="card-price">{brl(product.promoPrice ?? product.price)}</span>
          </div>
          {product.variants.length > 1 && <span class="badge-var">{product.variants.length} cores</span>}
        </div>
      </div>
    </a>
  );
}
