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

/** Lista de grupos (slug + nome) presentes no catálogo, em ordem alfabética. */
export function listCategories(products: Product[]) {
  const map = new Map<string, string>();
  for (const p of products) if (p.category && !map.has(p.category)) map.set(p.category, categoryName(p));
  return [...map].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
