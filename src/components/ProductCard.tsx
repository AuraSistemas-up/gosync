import { useState } from "preact/hooks";
import type { Product } from "../types/product";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  product: Product;
  /** Numeração filtrada: só variantes com estoque nela são exibidas. */
  size: string | null;
}

export default function ProductCard({ product, size }: Props) {
  const variants = size
    ? product.variants.filter((v) => v.sizes.some((s) => s.size === size && s.stock > 0))
    : product.variants;

  const [idx, setIdx] = useState(0);
  const v = variants[Math.min(idx, variants.length - 1)];
  if (!v) return null;

  const discount = product.promoPrice
    ? Math.round((1 - product.promoPrice / product.price) * 100)
    : 0;

  return (
    <article class="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
      <a href={`/produto/?id=${encodeURIComponent(product.id)}&cor=${v.colorSlug}`} class="relative block aspect-square bg-stone-100"
        aria-label={`Ver ${product.name}`}>
        {v.image ? (
          <img src={v.image} alt={`${product.name} ${v.color}`} loading="lazy"
            class="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div class="flex h-full items-center justify-center text-sm text-stone-400">Sem foto</div>
        )}
        {discount > 0 && (
          <span class="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            -{discount}%
          </span>
        )}
      </a>

      <div class="flex flex-1 flex-col gap-2 p-3">
        {product.brand && (
          <p class="text-xs font-medium uppercase tracking-wide text-stone-500">{product.brand}</p>
        )}
        <h3 class="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</h3>

        {variants.length > 1 && (
          <div class="flex flex-wrap gap-1">
            {variants.map((x, i) => (
              <button key={x.colorSlug} type="button" onClick={() => setIdx(i)}
                aria-pressed={i === idx}
                class={`rounded-full px-2 py-0.5 text-xs ring-1 ${
                  i === idx ? "bg-stone-900 text-white ring-stone-900" : "ring-stone-300 text-stone-600"
                }`}>
                {x.color}
              </button>
            ))}
          </div>
        )}
        {variants.length === 1 && <p class="text-xs text-stone-500">{v.color}</p>}

        <div class="flex flex-wrap gap-1">
          {v.sizes.filter((s) => s.available).map((s) => (
            <span key={s.sku}
              class={`min-w-7 rounded px-1.5 py-0.5 text-center text-xs ring-1 ${
                s.size === size ? "bg-emerald-600 text-white ring-emerald-600" : "text-stone-600 ring-stone-200"
              }`}>
              {s.size}
            </span>
          ))}
        </div>

        <div class="mt-auto pt-1">
          {product.promoPrice ? (
            <>
              <span class="text-xs text-stone-400 line-through">{brl(product.price)}</span>
              <p class="text-lg font-bold text-red-600">{brl(product.promoPrice)}</p>
            </>
          ) : (
            <p class="text-lg font-bold">{brl(product.price)}</p>
          )}
        </div>
      </div>
    </article>
  );
}
