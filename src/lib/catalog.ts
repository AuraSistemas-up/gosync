import { useEffect, useState } from "preact/hooks";
import type { CatalogFile, Product } from "../types/product";

export type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; data: CatalogFile };

// Uma única requisição por página, compartilhada entre cabeçalho, catálogo e produto.
let pending: Promise<CatalogFile> | null = null;

let pagesOn = false;
export const pagesEnabled = () => pagesOn;
let salesOn = false;
/** O catálogo traz dados de venda? (usado para só marcar "Últimas unidades" nos modelos que realmente vendem) */
export const salesKnown = () => salesOn;

/** Conta um pedido iniciado pelo WhatsApp (aparece em "Mais pedidos" no painel). Uma vez por produto por visita. */
export function trackOrder(id: string) {
  try {
    const key = `gosync:pedido:${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* sem armazenamento: conta mesmo assim */ }
  const url = `/admin/api.php?a=track&id=${encodeURIComponent(id)}`;
  try {
    if (!navigator.sendBeacon?.(url)) fetch(url, { method: "POST", keepalive: true });
  } catch { /* a contagem nunca pode atrapalhar o pedido */ }
}

/** Link para COMPARTILHAR um produto. Com as páginas de prévia ativas (/p/<id>/) o WhatsApp mostra foto e preço. */
export function shareLink(id: string, color?: string, size?: string): string {
  const q = new URLSearchParams();
  if (!pagesOn) q.set("id", id);
  if (color) q.set("cor", color);
  if (size) q.set("tam", size);
  const qs = q.toString();
  return `${location.origin}${pagesOn ? `/p/${encodeURIComponent(id)}/` : "/produto/"}${qs ? "?" + qs : ""}`;
}

/** Mensagem padrão do WhatsApp (já com o link do produto). Placeholders: {produto} {sku} {cor} {numeracao} {valor} {link}. */
export const DEFAULT_MESSAGE =
  "Olá! Quero pedir este calçado:\n*Modelo:* {produto}\n*Ref/SKU:* {sku}\n*Cor:* {cor}\n*Numeração:* {numeracao}\n*Valor:* {valor}\n*Link:* {link}";

/** Preenche o modelo. Linhas cujo valor ficou vazio (ex.: produto sem cor) são omitidas. */
export function buildWhatsMessage(template: string | undefined, vars: Record<string, string>): string {
  const tpl = (template && template.trim()) || DEFAULT_MESSAGE;
  return tpl
    .split("\n")
    .map((line) => {
      let empty = false;
      const out = line.replace(/\{(\w+)\}/g, (_, k) => {
        const v = vars[k] ?? "";
        if (!v) empty = true;
        return v;
      });
      return empty ? null : out;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

type Cfg = {
  name?: string;
  primaryColor?: string;
  logo?: string;
  banners?: { image: string; link?: string }[];
  whatsapp?: string;
  message?: string;
  hero?: { enabled?: boolean; title?: string; subtitle?: string };
  photoStyle?: "classic" | "spotlight" | "frame";
  footer?: { about?: string; address?: string; hours?: string; phone?: string; instagram?: string };
  featured?: string[];
  hidden?: string[];
  sections?: { featured?: boolean; bestsellers?: boolean; news?: boolean };
};

/** Configurações do painel admin (/data/config.json). Opcional. */
async function loadConfig(): Promise<Cfg | null> {
  try {
    const r = await fetch("/data/config.json", { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function load(): Promise<CatalogFile> {
  pending ??= Promise.all([
    fetch("/data/catalog.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<CatalogFile>;
    }),
    loadConfig(),
  ])
    .then(([data, cfg]) => {
      // O painel admin tem prioridade sobre o que veio do GoSync/ERP.
      if (cfg) {
        const s = { ...(data.store ?? {}) };
        if (cfg.name) s.name = cfg.name;
        if (cfg.primaryColor) s.primaryColor = cfg.primaryColor;
        if (cfg.logo) s.logo = cfg.logo;
        if (cfg.banners?.length) s.banners = cfg.banners;
        if (cfg.message) s.message = cfg.message;
        if (cfg.hero) s.hero = cfg.hero;
        if (cfg.photoStyle) s.photoStyle = cfg.photoStyle;
        if (cfg.footer && Object.values(cfg.footer).some(Boolean)) s.footer = cfg.footer;
        if (cfg.featured?.length) s.featured = cfg.featured;
        if (cfg.sections) s.sections = cfg.sections;
        if (cfg.hidden?.length) {
          // Produtos ocultos no painel somem do site inteiro (lista, busca, favoritos…).
          const hide = new Set(cfg.hidden);
          data.products = data.products.filter((p) => !hide.has(p.id));
        }
        if (cfg.whatsapp) data.whatsapp = cfg.whatsapp.replace(/\D/g, "");
        data.store = s;
      }
      return data;
    })
    .catch((e) => {
      pending = null; // permite tentar de novo
      throw e;
    });
  return pending;
}

/** Aplica a cor principal e o nome da loja definidos no GoSync (tema por variável CSS). */
function applyTheme(data: CatalogFile) {
  const { name, primaryColor, logo, photoStyle } = data.store ?? {};
  document.documentElement.dataset.photo = photoStyle ?? "spotlight"; // estilo de destaque das fotos (CSS)
  pagesOn = !!data.store?.pages;
  salesOn = data.products.some((p) => (p.sold ?? 0) > 0);
  if (primaryColor && /^#[0-9a-f]{6}$/i.test(primaryColor)) document.documentElement.style.setProperty("--primary", primaryColor);
  if (logo) {
    const img = document.getElementById("brandLogo") as HTMLImageElement | null;
    if (img) {
      img.src = logo;
      img.hidden = false;
      img.alt = name ?? "Logo";
    }
    document.getElementById("brandMono")?.setAttribute("hidden", "");
    document.getElementById("companyName")?.setAttribute("hidden", ""); // o logo já traz o nome
  }
  if (name) {
    const el = document.getElementById("companyName");
    if (el) el.textContent = name;
    const mono = document.getElementById("brandMono");
    if (mono) mono.textContent = name.trim().charAt(0).toUpperCase();
  }
}

/** Carrega /data/catalog.json (atualizado pelo app da bandeja). */
export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    load()
      .then((data) => {
        applyTheme(data);
        if (alive) setState({ status: "ok", data });
      })
      .catch(() => alive && setState({ status: "error" }));
    return () => { alive = false; };
  }, []);
  return state;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Nome amigável do grupo: usa o texto original do ERP, senão capitaliza o slug. */
export const categoryName = (p: Pick<Product, "category" | "categoryLabel">) =>
  p.categoryLabel ?? (p.category ? cap(p.category) : "");

export const label = cap;

/** Ordena numerações: números primeiro (34, 35, 36/37), depois textos (P, M, Único). */
export const cmpSize = (a: string, b: string) => {
  const na = parseFloat(a), nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb || a.localeCompare(b);
  if (!isNaN(na)) return -1;
  if (!isNaN(nb)) return 1;
  return a.localeCompare(b, "pt-BR");
};

/** Lista de grupos (slug + nome) presentes no catálogo, em ordem alfabética. */
export function listCategories(products: Product[]) {
  const map = new Map<string, { name: string; n: number }>();
  for (const p of products) {
    if (!p.category) continue;
    const e = map.get(p.category) ?? map.set(p.category, { name: categoryName(p), n: 0 }).get(p.category)!;
    e.n++;
  }
  // Grupos com mais modelos primeiro; "Outros" sempre por último.
  return [...map]
    .map(([slug, e]) => ({ slug, name: e.name, n: e.n }))
    .sort((a, b) => (a.slug === "outros" ? 1 : b.slug === "outros" ? -1 : b.n - a.n || a.name.localeCompare(b.name, "pt-BR")));
}
