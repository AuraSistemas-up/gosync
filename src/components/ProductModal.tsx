import { useEffect } from "preact/hooks";
import type { Product } from "../types/product";
import ProductDetail from "./ProductDetail";

interface Props {
  product: Product;
  whatsapp: string;
  color?: string;
  size: string | null;
  onClose: () => void;
}

/** Pop-up com foto e informações do produto; fecha com Esc, clique fora ou no ×. */
export default function ProductModal({ product, whatsapp, color, size, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // trava a rolagem da página atrás
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-label={product.name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <button type="button" class="modal-close" aria-label="Fechar" onClick={onClose}>×</button>
        <ProductDetail key={product.id} product={product} whatsapp={whatsapp} initialColor={color} initialSize={size} />
      </div>
    </div>
  );
}
