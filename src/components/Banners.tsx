import { useEffect, useState } from "preact/hooks";

export interface Banner { image: string; link?: string; alt?: string }

const SLIDE_MS = 5000;
const PLACEHOLDERS = [1, 2, 3, 4];

/** Carrossel de banners de propaganda (gira sozinho; pausa ao passar o mouse). Sem banners cadastrados, mostra 4 espaços reservados. */
export default function Banners({ banners }: { banners?: Banner[] }) {
  const real = (banners ?? []).filter((b) => b?.image);
  const count = real.length || PLACEHOLDERS.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % count), SLIDE_MS);
    return () => clearInterval(t);
  }, [paused, count]);

  const go = (n: number) => setI((n + count) % count);

  return (
    <section class="banners" aria-roledescription="carrossel" aria-label="Destaques"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusIn={() => setPaused(true)} onFocusOut={() => setPaused(false)}>
      <div class="banners-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {real.length
          ? real.map((b, n) => {
              const img = <img src={b.image} alt={b.alt ?? `Destaque ${n + 1}`} loading={n === 0 ? "eager" : "lazy"} />;
              return (
                <div class="banner-slide" key={b.image} aria-hidden={n !== i}>
                  {b.link ? <a href={b.link} tabIndex={n === i ? 0 : -1}>{img}</a> : img}
                </div>
              );
            })
          : PLACEHOLDERS.map((n) => (
              <div class="banner-slide banner-placeholder" key={n} aria-hidden={n - 1 !== i}>
                <div>
                  <strong>Espaço para banner {n}</strong>
                  <span>Tamanho sugerido: 1600 × 500 px</span>
                </div>
              </div>
            ))}
      </div>

      {count > 1 && (
        <>
          <button type="button" class="banners-arrow prev" aria-label="Banner anterior" onClick={() => go(i - 1)}>‹</button>
          <button type="button" class="banners-arrow next" aria-label="Próximo banner" onClick={() => go(i + 1)}>›</button>
          <div class="banners-dots">
            {Array.from({ length: count }, (_, n) => (
              <button key={n} type="button" class={n === i ? "on" : ""} aria-label={`Ir para o banner ${n + 1}`} aria-current={n === i} onClick={() => go(n)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
