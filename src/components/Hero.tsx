import type { CatalogFile } from "../types/product";

/** Faixa da marca no topo: logo da empresa, nome, frase de destaque e botão de WhatsApp. Configurada no painel admin. */
export default function Hero({ data }: { data: CatalogFile }) {
  const store = data.store ?? {};
  const h = store.hero ?? {};
  if (h.enabled === false) return null;
  const title = h.title || store.name || "";
  if (!title && !store.logo) return null;
  const wa = data.whatsapp ? `https://wa.me/${data.whatsapp}?text=${encodeURIComponent("Olá! Vim pelo catálogo.")}` : "";

  return (
    <section class="hero" aria-label="Apresentação da loja">
      <div class="hero-inner">
        {store.logo ? (
          <img class="hero-logo" src={store.logo} alt={title || "Logo"} />
        ) : (
          <div class="hero-mono" aria-hidden="true">{title.charAt(0).toUpperCase()}</div>
        )}
        <div class="hero-text">
          {title && <h2>{title}</h2>}
          {h.subtitle && <p>{h.subtitle}</p>}
        </div>
        {wa && (
          <a class="hero-cta" href={wa} target="_blank" rel="noopener noreferrer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-1.6-.8-2.6-1.4-3.7-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.6.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2z" /></svg>
            Fale conosco
          </a>
        )}
      </div>
    </section>
  );
}
