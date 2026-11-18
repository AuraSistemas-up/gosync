import { useRef } from "preact/hooks";
import type { Product } from "../types/product";
import ProductCard from "./ProductCard";

interface Props {
  title: string;
  tag?: string;
  products: Product[];
  size: string | null;
  onOpen: (p: Product, color: string) => void;
}

/** Faixa horizontal de produtos (Destaques, Mais vendidos, Chegou agora), com setas e rolagem por toque. */
export default function Showcase({ title, tag, products, size, onOpen }: Props) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * 520, behavior: "smooth" });
  return (
    <section class="showcase" aria-label={title}>
      <div class="showcase-head">
        <h2>{title}{tag && <span class="tag">{tag}</span>}</h2>
        <div class="showcase-arrows">
          <button type="button" aria-label="Anterior" onClick={() => scroll(-1)}>‹</button>
          <button type="button" aria-label="Próximos" onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div class="showcase-row" ref={row}>
        {products.map((p) => <ProductCard key={p.id} product={p} size={size} onOpen={onOpen} />)}
      </div>
    </section>
  );
}
