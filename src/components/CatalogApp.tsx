import { useCatalog } from "../lib/catalog";
import Catalog from "./Catalog";

export default function CatalogApp() {
  const s = useCatalog();
  if (s.status === "loading")
    return (
      <div class="layout" aria-busy="true">
        <div class="skeleton" style="height:420px" />
        <div class="grid">
          {Array.from({ length: 8 }, (_, i) => <div key={i} class="skeleton" style="aspect-ratio:3/4" />)}
        </div>
      </div>
    );
  if (s.status === "error")
    return (
      <div class="product-wrap">
        <div class="empty-state">
          Não foi possível carregar o catálogo agora.
          <div><button type="button" class="btn-clear" onClick={() => location.reload()}>Tentar de novo</button></div>
        </div>
      </div>
    );
  return <Catalog products={s.data.products} whatsapp={s.data.whatsapp} banners={s.data.store?.banners} />;
}
