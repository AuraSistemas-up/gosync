import { useState } from "preact/hooks";
import type { Product } from "../types/product";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  product: Product;
  whatsapp: string; // somente dígitos, com DDI (ex: 5511999998888)
  initialColor?: string;
}

export default function ProductDetail({ product, whatsapp, initialColor }: Props) {
  const startIdx = Math.max(0, product.variants.findIndex((v) => v.colorSlug === initialColor));
  const [vIdx, setVIdx] = useState(startIdx);
  const [photo, setPhoto] = useState(0);
  const [size, setSize] = useState<string | null>(null);

  const v = product.variants[vIdx];
  const photos = v.images.length ? v.images : v.image ? [v.image] : [];
  const price = product.promoPrice ?? product.price;
  const selected = v.sizes.find((s) => s.size === size && s.available);

  const pickColor = (i: number) => {
    setVIdx(i);
    setPhoto(0);
    // mantém a numeração só se ela existir com estoque na nova cor
    if (size && !product.variants[i].sizes.some((s) => s.size === size && s.available)) setSize(null);
  };

  const message = selected
    ? [
        "Olá! Quero pedir este calçado:",
        `*Modelo:* ${product.name}`,
        `*Ref/SKU:* ${selected.sku}`,
        `*Cor:* ${v.color}`,
        `*Numeração:* ${selected.size}`,
        `*Valor:* ${brl(price)}`,
      ].join("\n")
    : "";
  const href = selected && whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` : undefined;

  return (
    <div class="md:grid md:grid-cols-2 md:gap-8">
      {/* Galeria */}
      <div>
        <div class="aspect-square overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200">
          {photos[photo] ? (
            <img src={photos[photo]} alt={`${product.name} ${v.color}`} class="h-full w-full object-cover" />
          ) : (
            <div class="flex h-full items-center justify-center text-stone-400">Sem foto</div>
          )}
        </div>
        {photos.length > 1 && (
          <div class="mt-2 flex gap-2 overflow-x-auto pb-1">
            {photos.map((src, i) => (
              <button key={src} type="button" onClick={() => setPhoto(i)} aria-label={`Foto ${i + 1}`}
                class={`h-16 w-16 flex-none overflow-hidden rounded-lg ring-2 ${i === photo ? "ring-stone-900" : "ring-transparent"}`}>
                <img src={src} alt="" loading="lazy" class="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Informações */}
      <div class="mt-5 space-y-5 md:mt-0">
        <div>
          {product.brand && <p class="text-xs font-medium uppercase tracking-wide text-stone-500">{product.brand}</p>}
          <h1 class="text-2xl font-bold leading-tight">{product.name}</h1>
          <div class="mt-2">
            {product.promoPrice && <span class="mr-2 text-sm text-stone-400 line-through">{brl(product.price)}</span>}
            <span class={`text-3xl font-bold ${product.promoPrice ? "text-red-600" : ""}`}>{brl(price)}</span>
          </div>
        </div>

        {product.variants.length > 1 && (
          <section>
            <h2 class="mb-2 text-sm font-semibold">Cor: <span class="font-normal">{v.color}</span></h2>
            <div class="flex flex-wrap gap-2">
              {product.variants.map((x, i) => (
                <button key={x.colorSlug} type="button" onClick={() => pickColor(i)} aria-pressed={i === vIdx}
                  class={`flex items-center gap-2 rounded-xl p-1 pr-3 text-sm ring-2 ${i === vIdx ? "ring-stone-900" : "ring-stone-200"}`}>
                  {x.image && <img src={x.image} alt="" class="h-10 w-10 rounded-lg object-cover" />}
                  {x.color}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 class="mb-2 text-sm font-semibold">Numeração</h2>
          <div class="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {v.sizes.map((s) => (
              <button key={s.sku} type="button" disabled={!s.available}
                aria-pressed={s.size === size}
                aria-label={s.available ? `Tamanho ${s.size}` : `Tamanho ${s.size}, esgotado`}
                onClick={() => setSize(s.size)}
                class={`relative overflow-hidden rounded-lg py-3 text-sm font-medium ring-1 ${
                  !s.available
                    ? "cursor-not-allowed bg-stone-100 text-stone-300 ring-stone-200 line-through"
                    : s.size === size
                      ? "bg-stone-900 text-white ring-stone-900"
                      : "bg-white ring-stone-300 active:bg-stone-100"
                }`}>
                {s.size}
              </button>
            ))}
          </div>
          {selected && selected.stock <= 3 && (
            <p class="mt-2 text-sm font-medium text-amber-600">
              {selected.stock === 1 ? "Última unidade!" : `Restam só ${selected.stock} unidades`}
            </p>
          )}
        </section>

        {/* CTA fixo no rodapé no mobile */}
        <div class="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white p-3 md:static md:border-0 md:p-0">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer"
              class="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-4 text-base font-bold text-white active:bg-emerald-700">
              Pedir pelo WhatsApp
            </a>
          ) : (
            <button type="button" disabled
              class="w-full rounded-xl bg-stone-200 px-4 py-4 text-base font-bold text-stone-500">
              {whatsapp ? "Escolha a numeração" : "WhatsApp não configurado"}
            </button>
          )}
        </div>
        <div class="h-16 md:hidden" aria-hidden="true" />
      </div>
    </div>
  );
}
