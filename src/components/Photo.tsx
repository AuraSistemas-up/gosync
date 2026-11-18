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
  if (!mode || t === src) return <img src={src} alt={alt} loading={loading} decoding="async" class={cls} />;
  const fallback = (e: Event) => {
    const img = e.currentTarget as HTMLImageElement;
    if (img.dataset.fb) return;
    img.dataset.fb = "1";
    img.removeAttribute("srcset");
    img.src = src; // miniatura ausente (foto antiga): usa a grande
  };
  return mode === "tiny" ? (
    <img src={t} alt={alt} loading={loading} decoding="async" class={cls} onError={fallback} />
  ) : (
    <img src={t} srcset={`${t} 520w, ${src} 1200w`} sizes={sizes ?? "(max-width: 860px) 50vw, 280px"} alt={alt} loading={loading} decoding="async" class={cls} onError={fallback} />
  );
}
