import { useCatalog } from "../lib/catalog";

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** Rodapé da loja. Os dados vêm do painel admin; só aparece o que foi preenchido. */
export default function Footer() {
  const s = useCatalog();
  if (s.status !== "ok") return null;
  const store = s.data.store ?? {};
  const f = store.footer ?? {};
  const name = store.name || "";
  const phoneDigits = (f.phone ?? "").replace(/\D/g, "");
  const maps = f.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}` : "";
  const insta = f.instagram ? `https://instagram.com/${f.instagram}` : "";
  const wa = s.data.whatsapp ? `https://wa.me/${s.data.whatsapp}` : "";
  const hasInfo = f.about || f.address || f.hours || f.phone || f.instagram || wa;

  return (
    <footer class="site-footer">
      {hasInfo && (
        <div class="footer-grid">
          <div class="footer-col">
            {store.logo ? <img class="footer-logo" src={store.logo} alt={name} /> : <strong class="footer-name">{name}</strong>}
            {f.about && <p>{f.about}</p>}
          </div>

          {(f.address || f.hours) && (
            <div class="footer-col">
              <h3>Visite a loja</h3>
              {f.address && <p><Icon d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z" /> {f.address}</p>}
              {f.hours && <p><Icon d="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> {f.hours}</p>}
              {maps && <a class="footer-btn" href={maps} target="_blank" rel="noopener noreferrer">Como chegar</a>}
            </div>
          )}

          {(f.phone || insta || wa) && (
            <div class="footer-col">
              <h3>Fale com a gente</h3>
              {f.phone && <p><Icon d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /> <a href={`tel:${phoneDigits}`}>{f.phone}</a></p>}
              {insta && <p><Icon d="M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zM12 8a4 4 0 100 8 4 4 0 000-8zM17.5 6.5h.01" /> <a href={insta} target="_blank" rel="noopener noreferrer">@{f.instagram}</a></p>}
              {wa && <a class="footer-btn wa" href={wa} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>}
            </div>
          )}
        </div>
      )}
      <div class="footer-bottom">
        © {new Date().getFullYear()} {name} · Estoque atualizado automaticamente
      </div>
    </footer>
  );
}
