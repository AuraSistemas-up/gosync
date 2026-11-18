import type { Product } from "../types/product";
import { categoryName, cmpSize } from "../lib/catalog";
import Photo from "./Photo";
import { favorites, useFavorites } from "../lib/favorites";

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  product: Product;
  /** Numeração filtrada: destaca o tamanho e mostra a foto da cor que tem estoque nele. */
  size: string | null;
  /** Abre o pop-up do produto (clique simples). Ctrl/botão do meio ainda abrem a página própria. */
  onOpen?: (product: Product, colorSlug: string) => void;
}

export default function ProductCard({ product, size, onOpen }: Props) {
  const fav = useFavorites().some((x) => x.id === product.id);
  const withSize = size ? product.variants.filter((v) => v.sizes.some((s) => s.size === size && s.stock > 0)) : product.variants;
  const v = withSize[0] ?? product.variants[0];

  // Numerações com estoque em qualquer cor.
  const sizes = [...new Set(product.variants.flatMap((x) => x.sizes.filter((s) => s.available).map((s) => s.size)))].sort(cmpSize);
  const shown = sizes.slice(0, 5);
  if (size && sizes.includes(size) && !shown.includes(size)) shown[shown.length - 1] = size;

  const discount = product.promoPrice ? Math.round((1 - product.promoPrice / product.price) * 100) : 0;
  const href = `/produto/?id=${encodeURIComponent(product.id)}&cor=${v.colorSlug}`;

  return (
    <a
      href={href}
      class="card"
      aria-label={product.name}
      onClick={(e) => {
        if (!onOpen || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(product, v.colorSlug);
      }}
    >
      <div class="card-photo">
        {v.image ? <Photo src={v.image} alt={`${product.name} ${v.color}`} mode="card" /> : <span class="no-photo">Sem foto</span>}
        {discount > 0 && <span class="badge-off">-{discount}%</span>}
        <button
          type="button"
          class={`heart${fav ? " on" : ""}`}
          aria-pressed={fav}
          aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            favorites.toggle(product.id, v.colorSlug, size && v.sizes.some((s) => s.size === size && s.available) ? size : undefined);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" /></svg>
        </button>
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
