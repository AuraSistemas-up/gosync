import { useCatalog } from "../lib/catalog";
import ProductDetail from "./ProductDetail";

export default function ProductPage() {
  const s = useCatalog();
  const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  const id = q.get("id");
  const color = q.get("cor") ?? undefined;

  if (s.status === "loading")
    return <div class="aspect-square max-w-md animate-pulse rounded-2xl bg-stone-200" aria-busy="true" />;

  const product = s.status === "ok" ? s.data.products.find((p) => p.id === id) : undefined;
  if (!product)
    return (
      <div class="rounded-xl bg-white p-8 text-center ring-1 ring-stone-200">
        <p class="font-medium">
          {s.status === "error" ? "Não foi possível carregar o produto agora." : "Calçado não encontrado. Ele pode ter esgotado."}
        </p>
        <a href="/" class="mt-3 inline-block rounded-lg bg-stone-900 px-4 py-2 text-white">Ver catálogo</a>
      </div>
    );

  if (typeof document !== "undefined") document.title = `${product.name} | Sapataria`;
  const whatsapp = s.status === "ok" ? s.data.whatsapp : "";
  return <ProductDetail product={product} whatsapp={whatsapp} initialColor={color} />;
}
