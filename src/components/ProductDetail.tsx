import { useState } from "preact/hooks";
import type { Product } from "../types/product";
import { buildWhatsMessage, categoryName } from "../lib/catalog";
import { brl } from "./ProductCard";
import Photo from "./Photo";

interface Props {
  product: Product;
  whatsapp: string; // só dígitos, com DDI (ex.: 5511999998888)
  messageTemplate?: string; // modelo configurado no painel (usa a mensagem padrão se vazio)
  initialColor?: string;
  initialSize?: string | null;
}

const WaIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-1.6-.8-2.6-1.4-3.7-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.6.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2z" />
  </svg>
);

export default function ProductDetail({ product, whatsapp, messageTemplate, initialColor, initialSize }: Props) {
  const start = Math.max(0, product.variants.findIndex((v) => v.colorSlug === initialColor));
  const startSize = initialSize && product.variants[start].sizes.some((s) => s.size === initialSize && s.available) ? initialSize : null;
  const photosOf = (i: number) => {
    const x = product.variants[i];
    return x.images.length ? x.images : x.image ? [x.image] : [];
  };
  // Foto da variação (numeração) quando existir; senão a foto principal da cor.
  const photoFor = (i: number, sz: string | null) => {
    const img = sz ? product.variants[i].sizes.find((s) => s.size === sz)?.image : undefined;
    const idx = img ? photosOf(i).indexOf(img) : -1;
    return idx >= 0 ? idx : 0;
  };

  const [vIdx, setVIdx] = useState(start);
  const [size, setSize] = useState<string | null>(startSize);
  const [photo, setPhoto] = useState(() => photoFor(start, startSize));

  const v = product.variants[vIdx];
  const photos = photosOf(vIdx);
  const price = product.promoPrice ?? product.price;
  const selected = v.sizes.find((s) => s.size === size && s.available);

  const pickColor = (i: number) => {
    // Mantém a numeração só se existir com estoque na nova cor.
    const keep = size && product.variants[i].sizes.some((s) => s.size === size && s.available) ? size : null;
    setVIdx(i);
    setSize(keep);
    setPhoto(photoFor(i, keep));
  };
  const pickSize = (s: string) => {
    setSize(s);
    setPhoto(photoFor(vIdx, s)); // troca para a foto da variação escolhida
  };

  // Link direto para o produto (já com cor e numeração), enviado na mensagem do WhatsApp.
  const link = selected
    ? `${location.origin}/produto/?id=${encodeURIComponent(product.id)}&cor=${v.colorSlug}&tam=${encodeURIComponent(selected.size)}`
    : "";
  const message = selected
    ? buildWhatsMessage(messageTemplate, {
        produto: product.name,
        sku: selected.sku,
        cor: v.color !== "Único" ? v.color : "",
        numeracao: selected.size,
        valor: brl(price),
        link,
      })
    : "";
  const href = selected && whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` : undefined;
  const ctaText = !whatsapp ? "WhatsApp não configurado" : selected ? "Pedir pelo WhatsApp" : "Escolha a numeração";

  return (
    <div class="product-modal-body">
      <div class="pm-gallery">
        <div class="pm-photo">
          {photos[photo] ? <img src={photos[photo]} alt={`${product.name} ${v.color}`} /> : <span class="no-photo">Sem foto</span>}
        </div>
        {photos.length > 1 && (
          <div class="pm-thumbs">
            {photos.map((src, i) => (
              <button key={src} type="button" class={`pm-thumb${i === photo ? " active" : ""}`} onClick={() => setPhoto(i)} aria-label={`Foto ${i + 1}`}>
                <Photo src={src} alt="" mode="tiny" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div class="pm-info">
        <div class="pm-header-meta">
          {product.brand && <span class="pill">{product.brand}</span>}
          {product.category && <span class="pill" style="opacity:.75">{categoryName(product)}</span>}
        </div>
        <h1 class="pm-title">{product.name}</h1>

        <div class="pm-price-row">
          <span class={`pm-price${product.promoPrice ? " promo" : ""}`}>{brl(price)}</span>
          {product.promoPrice && <span class="pm-old">{brl(product.price)}</span>}
        </div>
        <div class="pm-selected">
          {v.color !== "Único" && <>Cor: <strong>{v.color}</strong> · </>}
          {size ? <>Nº <strong>{size}</strong></> : "Escolha a numeração"}
          {selected && <> · Ref. <strong>{selected.sku}</strong></>}
        </div>

        {product.variants.length > 1 && (
          <div class="pm-section">
            <h4>Cores</h4>
            <div class="pm-chip-list">
              {product.variants.map((x, i) => (
                <button key={x.colorSlug} type="button" class={`pm-chip${i === vIdx ? " active" : ""}`} aria-pressed={i === vIdx} onClick={() => pickColor(i)}>
                  <span class="pm-swatch">{x.image && <Photo src={x.image} alt="" mode="tiny" />}</span>
                  {x.color}
                </button>
              ))}
            </div>
          </div>
        )}

        <div class="pm-section">
          <h4>Numeração</h4>
          <div class="pm-sizes">
            {v.sizes.map((s) => (
              <button key={s.sku} type="button" disabled={!s.available} class={`pm-size${s.size === size ? " active" : ""}`}
                aria-pressed={s.size === size} aria-label={s.available ? `Tamanho ${s.size}` : `Tamanho ${s.size}, esgotado`}
                onClick={() => pickSize(s.size)}>
                {s.size}
              </button>
            ))}
          </div>
          {selected && selected.stock <= 3 && (
            <div class="pm-low">{selected.stock === 1 ? "Última unidade!" : `Restam só ${selected.stock} unidades`}</div>
          )}
        </div>

        <div class="pm-cta">
          <a class="btn-whatsapp pm-whatsapp" href={href} target="_blank" rel="noopener noreferrer" aria-disabled={href ? "false" : "true"}>
            <WaIcon /> {ctaText}
          </a>
        </div>
      </div>
    </div>
  );
}
