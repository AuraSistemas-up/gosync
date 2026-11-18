import { useCatalog } from "../lib/catalog";
import ProductDetail from "./ProductDetail";

export default function ProductPage() {
  const s = useCatalog();
  const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  const id = q.get("id");
  const color = q.get("cor") ?? undefined;

  if (s.status === "loading") return <div class="skeleton" style="height:520px" aria-busy="true" />;

  const product = s.status === "ok" ? s.data.products.find((p) => p.id === id) : undefined;
  if (!product)
    return (
      <div class="empty-state">
        {s.status === "error" ? "Não foi possível carregar o produto agora." : "Calçado não encontrado. Ele pode ter esgotado."}
        <div><a href="/" class="btn-clear" style="display:inline-block;margin-top:12px">Ver catálogo</a></div>
      </div>
    );

  if (typeof document !== "undefined") document.title = `${product.name} | ${s.data.store?.name ?? "Sapataria"}`;
  return <ProductDetail product={product} whatsapp={s.data.whatsapp} initialColor={color} />;
}
