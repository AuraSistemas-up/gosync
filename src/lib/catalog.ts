import { useEffect, useState } from "preact/hooks";
import type { CatalogFile, Product } from "../types/product";

export type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; data: CatalogFile };

// Uma única requisição por página, compartilhada entre cabeçalho, catálogo e produto.
let pending: Promise<CatalogFile> | null = null;
function load(): Promise<CatalogFile> {
  pending ??= fetch("/data/catalog.json", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<CatalogFile>;
    })
    .catch((e) => {
      pending = null; // permite tentar de novo
      throw e;
    });
  return pending;
}

/** Aplica a cor principal e o nome da loja definidos no GoSync (tema por variável CSS). */
function applyTheme(data: CatalogFile) {
  const { name, primaryColor } = data.store ?? {};
  if (primaryColor && /^#[0-9a-f]{6}$/i.test(primaryColor)) document.documentElement.style.setProperty("--primary", primaryColor);
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
