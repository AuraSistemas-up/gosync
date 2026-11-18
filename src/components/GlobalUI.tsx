import { useEffect, useMemo, useState } from "preact/hooks";
import { buildWhatsMessage, categoryName, cmpSize, useCatalog } from "../lib/catalog";
import { favorites, ui, useFavorites } from "../lib/favorites";
import type { Product } from "../types/product";
import { brl } from "./ProductCard";
import Photo from "./Photo";

const WaIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-1.6-.8-2.6-1.4-3.7-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.6.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2z" /></svg>
);

/** Monta a mensagem do pedido com vários itens (um por linha), com link de cada produto e total. */
function orderMessage(lines: { p: Product; color: string; size: string }[], intro: string): string {
  const itens = lines.map((l, i) => {
    const price = l.p.promoPrice ?? l.p.price;
    const link = `${location.origin}/produto/?id=${encodeURIComponent(l.p.id)}&cor=${encodeURIComponent(l.color)}&tam=${encodeURIComponent(l.size)}`;
    const cor = l.p.variants.find((v) => v.colorSlug === l.color);
    return `${i + 1}) *${l.p.name}*${cor && cor.color !== "Único" ? ` · ${cor.color}` : ""} · Nº ${l.size} · ${brl(price)}\n${link}`;
  });
  const total = lines.reduce((t, l) => t + (l.p.promoPrice ?? l.p.price), 0);
  return `${intro}\n\n${itens.join("\n\n")}\n\n*Total:* ${brl(total)}`;
}

/** Elementos globais: botão flutuante do WhatsApp, barra inferior do celular e gaveta de favoritos. */
export default function GlobalUI() {
  const s = useCatalog();
  const favs = useFavorites();
  const [drawer, setDrawer] = useState(false);
  const [path, setPath] = useState(() => (typeof location !== "undefined" ? location.pathname : "/"));

  useEffect(() => {
    const open = () => setDrawer(true);
    window.addEventListener("gosync:abrir-favoritos", open);
    return () => window.removeEventListener("gosync:abrir-favoritos", open);
  }, []);
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);
  useEffect(() => setPath(location.pathname), []);

  const data = s.status === "ok" ? s.data : null;
  const byId = useMemo(() => new Map((data?.products ?? []).map((p) => [p.id, p])), [data]);
  const wa = data?.whatsapp ? `https://wa.me/${data.whatsapp}?text=${encodeURIComponent("Olá! Vim pelo catálogo.")}` : "";
  const onProduct = path.startsWith("/produto");

  // Itens ainda existentes no catálogo (um modelo pode ter saído de estoque depois de favoritado).
  const items = favs.map((f) => ({ f, p: byId.get(f.id) })).filter((x): x is { f: typeof favs[number]; p: Product } => !!x.p);
  const ready = items.length > 0 && items.every(({ f, p }) => {
    const v = p.variants.find((x) => x.colorSlug === (f.color ?? p.variants[0].colorSlug)) ?? p.variants[0];
    return !!f.size && v.sizes.some((s) => s.size === f.size && s.available);
  });

  const send = () => {
    if (!data?.whatsapp || !ready) return;
    const lines = items.map(({ f, p }) => ({ p, color: f.color ?? p.variants[0].colorSlug, size: f.size! }));
    const name = data.store?.name ? ` da ${data.store.name}` : "";
    const msg = orderMessage(lines, `Olá! Quero fazer este pedido${name}:`);
    window.open(`https://wa.me/${data.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  return (
    <>
      {/* Botão flutuante (computador) */}
      {wa && !onProduct && (
        <a class="wa-float" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chamar no WhatsApp"><WaIcon /><span>Chamar no WhatsApp</span></a>
      )}

      {/* Barra inferior (celular) */}
      {!onProduct && (
        <nav class="mobile-bar" aria-label="Atalhos">
          <a href="/"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" /></svg><span>Início</span></a>
          <button type="button" onClick={() => (location.pathname === "/" ? ui.openFilters() : (location.href = "/?filtros=1"))}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" /></svg><span>Filtros</span></button>
          <button type="button" onClick={() => setDrawer(true)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" /></svg><span>Favoritos</span>{favs.length > 0 && <b class="mobile-badge">{favs.length}</b>}</button>
          {wa && <a class="wa" href={wa} target="_blank" rel="noopener noreferrer"><WaIcon /><span>WhatsApp</span></a>}
        </nav>
      )}

      {/* Gaveta de favoritos / pedido */}
      {drawer && (
        <div class="drawer-overlay" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <aside class="drawer" role="dialog" aria-modal="true" aria-label="Meus favoritos">
            <header class="drawer-head">
              <h2>Meus favoritos <span>({items.length})</span></h2>
              <button type="button" class="modal-close static" aria-label="Fechar" onClick={() => setDrawer(false)}>×</button>
            </header>

            <div class="drawer-body">
              {items.length === 0 ? (
                <div class="empty-state" style="margin:20px 0">
                  Você ainda não favoritou nada.<br />Toque no coração ♡ dos produtos para montar seu pedido.
                </div>
              ) : (
                items.map(({ f, p }) => {
                  const v = p.variants.find((x) => x.colorSlug === (f.color ?? p.variants[0].colorSlug)) ?? p.variants[0];
                  const price = p.promoPrice ?? p.price;
                  return (
                    <div class="fav-item" key={p.id}>
                      <a href={`/produto/?id=${encodeURIComponent(p.id)}&cor=${v.colorSlug}`} class="fav-photo">
                        {v.image ? <Photo src={v.image} alt={p.name} mode="tiny" /> : <span class="no-photo">Sem foto</span>}
                      </a>
                      <div class="fav-info">
                        <strong>{p.name}</strong>
                        <small>{categoryName(p)} · {brl(price)}</small>
                        <div class="fav-selects">
                          {p.variants.length > 1 && (
                            <select aria-label="Cor" value={v.colorSlug} onChange={(e) => favorites.update(p.id, { color: (e.target as HTMLSelectElement).value, size: undefined })}>
                              {p.variants.map((x) => <option key={x.colorSlug} value={x.colorSlug}>{x.color}</option>)}
                            </select>
                          )}
                          <select aria-label="Numeração" value={f.size ?? ""} class={f.size ? "" : "need"} onChange={(e) => favorites.update(p.id, { size: (e.target as HTMLSelectElement).value || undefined })}>
                            <option value="">Nº…</option>
                            {[...v.sizes].filter((s) => s.available).sort((a, b) => cmpSize(a.size, b.size)).map((s) => <option key={s.size} value={s.size}>{s.size}</option>)}
                          </select>
                        </div>
                      </div>
                      <button type="button" class="fav-remove" aria-label={`Remover ${p.name}`} onClick={() => favorites.remove(p.id)}>🗑</button>
                    </div>
                  );
                })
              )}
            </div>

            {items.length > 0 && (
              <footer class="drawer-foot">
                <div class="drawer-total"><span>Total</span><b>{brl(items.reduce((t, { p }) => t + (p.promoPrice ?? p.price), 0))}</b></div>
                <button type="button" class="btn-whatsapp pm-whatsapp" disabled={!ready || !data?.whatsapp} aria-disabled={!ready} onClick={send}>
                  <WaIcon /> {ready ? "Enviar pedido pelo WhatsApp" : "Escolha o Nº de cada item"}
                </button>
                <button type="button" class="btn-clear" style="width:100%;margin-top:8px" onClick={() => favorites.clear()}>Limpar favoritos</button>
              </footer>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
