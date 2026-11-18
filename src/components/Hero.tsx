import type { CatalogFile } from "../types/product";
import { useMemo, useState } from "preact/hooks";
import { ui, useFavorites } from "../lib/favorites";
import { pagesEnabled } from "../lib/catalog";
import { suggest } from "../lib/search";

const WaIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-1.6-.8-2.6-1.4-3.7-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.6.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2z" /></svg>
);

/**
 * Cabeçalho único do site: faixa da marca (logo, nome, frase) com a BUSCA dentro dela e o botão de WhatsApp.
 * Configurado no painel admin; com a faixa desligada fica compacto (só logo, nome e busca).
 * Funciona mesmo antes de o catálogo carregar (`data` nulo).
 */
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  if (dark) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = "dark";
  try { localStorage.setItem("gosync:tema", dark ? "light" : "dark"); } catch { /* sem armazenamento: vale só nesta visita */ }
}

export default function Hero({ data }: { data: CatalogFile | null }) {
  const favs = useFavorites();
  const [text, setText] = useState(() => (typeof location !== "undefined" ? new URLSearchParams(location.search).get("q") ?? "" : ""));
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const sugg = useMemo(() => (data && open ? suggest(data.products, text, pagesEnabled()) : []), [data, text, open]);
  const store = data?.store ?? {};
  const h = store.hero ?? {};
  const compact = h.enabled === false;
  const title = h.title || store.name || "Catálogo";
  const wa = data?.whatsapp ? `https://wa.me/${data.whatsapp}?text=${encodeURIComponent("Olá! Vim pelo catálogo.")}` : "";

  return (
    <header class={`hero${compact ? " compact" : ""}`}>
      <div class="hero-inner">
        <a href="/" class="hero-brand" aria-label="Início">
          {store.logo ? (
            <img class="hero-logo" src={store.logo} alt={title} />
          ) : (
            <div class="hero-mono" aria-hidden="true">{title.charAt(0).toUpperCase()}</div>
          )}
          <div class="hero-text">
            <h2>{title}</h2>
            {!compact && h.subtitle && <p>{h.subtitle}</p>}
          </div>
        </a>

        <form action="/" method="get" role="search" class="search-wrap hero-search" onSubmit={() => setOpen(false)}>
          <label for="q" class="sr-only">Buscar calçados</label>
          <input
            id="q" name="q" type="search" placeholder="Buscar por modelo, marca ou referência…" autocomplete="off" value={text}
            role="combobox" aria-expanded={sugg.length > 0} aria-controls="sugestoes" aria-autocomplete="list"
            onInput={(e) => { setText((e.target as HTMLInputElement).value); setOpen(true); setHi(-1); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 160)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, sugg.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
              else if (e.key === "Escape") setOpen(false);
              else if (e.key === "Enter" && hi >= 0 && sugg[hi]) { e.preventDefault(); location.href = sugg[hi].href; }
            }}
          />
          <button type="submit" aria-label="Buscar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          {sugg.length > 0 && (
            <ul class="suggest" id="sugestoes" role="listbox">
              {sugg.map((s, i) => (
                <li key={s.type + s.label} class={i === hi ? "on" : ""} role="option" aria-selected={i === hi}>
                  <a href={s.href} class={`t-${s.type}`}>{s.label}<small>{s.sub}</small></a>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div class="hero-tools">
          <button type="button" class="hero-icon" aria-label="Meus favoritos" title="Meus favoritos" onClick={ui.openFavorites}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" /></svg>
            {favs.length > 0 && <b class="hero-badge">{favs.length}</b>}
          </button>
          <button type="button" class="hero-icon" aria-label="Alternar modo escuro" title="Modo claro/escuro" onClick={toggleTheme}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
          </button>
        </div>

        {!compact && wa && (
          <a class="hero-cta" href={wa} target="_blank" rel="noopener noreferrer"><WaIcon /> Fale conosco</a>
        )}
      </div>
    </header>
  );
}
