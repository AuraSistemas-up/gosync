import type { Product } from "../types/product";
import { categoryName } from "./catalog";

/** Minúsculas e sem acento. */
export const norm = (s: string) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Distância de edição limitada (para tolerar erros de digitação como "sandalha"). */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    if (rowMin > max) return false;
  }
  return dp[a.length][b.length] <= max;
}

// Palavras de cada produto (nome, marca, grupo, cores e referências), calculadas uma vez.
const cache = new WeakMap<Product, { text: string; words: string[] }>();
function haystack(p: Product) {
  let h = cache.get(p);
  if (!h) {
    const text = norm([p.name, p.brand, categoryName(p), ...p.variants.map((v) => v.color), ...p.variants.flatMap((v) => v.sizes.map((s) => s.sku))].filter(Boolean).join(" "));
    h = { text, words: [...new Set(text.split(/[^a-z0-9]+/).filter(Boolean))] };
    cache.set(p, h);
  }
  return h;
}

/** Cada palavra buscada precisa aparecer no produto; palavras com 4+ letras toleram 1 erro (7+ letras, 2). */
export function matchesQuery(p: Product, query: string): boolean {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const h = haystack(p);
  return tokens.every((t) => {
    if (h.text.includes(t)) return true;
    if (t.length < 4) return false;
    const max = t.length >= 7 ? 2 : 1;
    return h.words.some((w) => w[0] === t[0] && within(t, w, max));
  });
}

export interface Suggestion { type: "produto" | "grupo" | "marca"; label: string; sub?: string; href: string }

/** Sugestões enquanto digita: grupos e marcas parecidos + os melhores produtos. */
export function suggest(products: Product[], query: string, pagesOn: boolean, limit = 7): Suggestion[] {
  const q = norm(query).trim();
  if (q.length < 2) return [];
  const out: Suggestion[] = [];

  const cats = new Map<string, string>();
  const brands = new Set<string>();
  for (const p of products) {
    if (p.category && !cats.has(p.category)) cats.set(p.category, categoryName(p));
    if (p.brand) brands.add(p.brand);
  }
  for (const [slug, name] of cats) if (norm(name).startsWith(q) || matchesName(name, q)) out.push({ type: "grupo", label: name, sub: "Grupo", href: `/?cat=${slug}` });
  for (const b of brands) if (norm(b).startsWith(q) || matchesName(b, q)) out.push({ type: "marca", label: b, sub: "Marca", href: `/?marca=${encodeURIComponent(b)}` });

  const found = products.filter((p) => matchesQuery(p, query));
  // Nomes que começam pelo texto vêm primeiro; depois por relevância natural da lista.
  found.sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q)));
  for (const p of found.slice(0, limit)) {
    out.push({ type: "produto", label: p.name, sub: categoryName(p), href: pagesOn ? `/p/${encodeURIComponent(p.id)}/` : `/produto/?id=${encodeURIComponent(p.id)}` });
  }
  return out.slice(0, limit + 3);
}

function matchesName(name: string, q: string) {
  const n = norm(name);
  return n.includes(q) || (q.length >= 4 && within(q, n.slice(0, q.length), 1));
}
