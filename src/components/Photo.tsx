/** "/fotos/abc.webp" → "/fotos/abc-s.webp" (miniatura gerada pelo exportador/GoSync). Outras URLs ficam como estão. */
export const thumbOf = (u: string) => (/^\/fotos\/[^/]+\.\w+$/.test(u) ? u.replace(/(\.\w+)$/, "-s$1") : u);

interface Props {
  src: string;
  alt: string;
  /** "card": miniatura + versão grande para telas de alta densidade (srcset). "tiny": só miniatura. Sem modo: foto grande. */
  mode?: "card" | "tiny";
  sizes?: string;
  loading?: "lazy" | "eager";
  class?: string;
}

/** Imagem com redimensionamento automático: usa a miniatura quando existe e cai para a foto grande se ela faltar. */
export default function Photo({ src, alt, mode, sizes, loading = "lazy", class: cls }: Props) {
  const t = thumbOf(src);
  // Entrada suave: a foto aparece desfocada e vai ficando nítida quando termina de carregar.
  const reveal = (e: Event) => (e.currentTarget as HTMLImageElement).classList.add("loaded");
  const mark = (el: HTMLImageElement | null) => { if (el && el.complete && el.naturalWidth > 0) el.classList.add("loaded"); };
  const klass = `blur-up${cls ? " " + cls : ""}`;
  if (!mode || t === src) return <img ref={mark} src={src} alt={alt} loading={loading} decoding="async" class={klass} onLoad={reveal} />;
  const fallback = (e: Event) => {
    const img = e.currentTarget as HTMLImageElement;
    if (img.dataset.fb) return;
    img.dataset.fb = "1";
    img.removeAttribute("srcset");
    img.src = src; // miniatura ausente (foto antiga): usa a grande
  };
  return mode === "tiny" ? (
    <img ref={mark} src={t} alt={alt} loading={loading} decoding="async" class={klass} onLoad={reveal} onError={fallback} />
  ) : (
    <img ref={mark} src={t} srcset={`${t} 520w, ${src} 1200w`} sizes={sizes ?? "(max-width: 860px) 50vw, 280px"} alt={alt} loading={loading} decoding="async" class={klass} onLoad={reveal} onError={fallback} />
  );
}
