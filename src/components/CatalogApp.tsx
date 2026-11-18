import { useCatalog } from "../lib/catalog";
import Catalog from "./Catalog";

export default function CatalogApp() {
  const s = useCatalog();
  if (s.status === "loading")
    return (
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} class="aspect-[3/4] animate-pulse rounded-2xl bg-stone-200" />
        ))}
      </div>
    );
  if (s.status === "error")
    return (
      <div class="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
        <p class="font-medium">Não foi possível carregar o catálogo agora.</p>
        <button type="button" onClick={() => location.reload()} class="mt-3 rounded-lg bg-red-700 px-4 py-2 text-white">
          Tentar de novo
        </button>
      </div>
    );
  return <Catalog products={s.data.products} />;
}
