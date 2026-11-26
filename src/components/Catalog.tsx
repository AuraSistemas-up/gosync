import { Fragment } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { Product } from "../types/product";
import { categoryName, cmpSize, label, listCategories } from "../lib/catalog";
import ProductCard from "./ProductCard";
import ProductModal from "./ProductModal";
import { matchesQuery } from "../lib/search";
import Showcase from "./Showcase";
import Banners, { type Banner } from "./Banners";

const PAGE_SIZE = 24;
const PRICE_RANGES = [
  { id: "all", label: "Todos", min: 0, max: Infinity },
  { id: "0-150", label: "Até R$ 150", min: 0, max: 150 },
  { id: "150-300", label: "R$ 150 a 300", min: 150, max: 300 },
  { id: "300-500", label: "R$ 300 a 500", min: 300, max: 500 },
  { id: "500+", label: "Acima de R$ 500", min: 500, max: Infinity },
];
const SORTS = [
  { id: "relevance", label: "Relevância" },
  { id: "price-asc", label: "Menor preço" },
  { id: "price-desc", label: "Maior preço" },
  { id: "discount", label: "Maiores descontos" },
  { id: "name", label: "Nome (A–Z)" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const eff = (p: Product) => p.promoPrice ?? p.price;
const off = (p: Product) => (p.promoPrice ? 1 - p.promoPrice / p.price : 0);

interface F { q: string; cat: string | null; brand: string | null; size: string | null; gender: string | null; price: string }

function readUrl(): F {
  const u = new URLSearchParams(location.search);
  return {
    q: u.get("q") ?? "", cat: u.get("cat"), brand: u.get("marca"), size: u.get("tam"),
    gender: u.get("genero"), price: u.get("preco") ?? "all",
  };
}

function matches(p: Product, f: F, skip?: keyof F): boolean {
  if (skip !== "cat" && f.cat && p.category !== f.cat) return false;
  if (skip !== "brand" && f.brand && p.brand !== f.brand) return false;
  if (skip !== "gender" && f.gender && p.gender !== f.gender && p.gender !== "unissex") return false;
  if (skip !== "price") {
    const r = PRICE_RANGES.find((x) => x.id === f.price) ?? PRICE_RANGES[0];
    if (eff(p) < r.min || eff(p) >= r.max) return false;
  }
  // Estoque maior que zero na numeração escolhida, em qualquer cor.
  if (skip !== "size" && f.size && !p.variants.some((v) => v.sizes.some((s) => s.size === f.size && s.stock > 0))) return false;
  // Busca esperta: ignora acento e tolera 1–2 letras erradas ("sandalha" acha "sandália").
  if (skip !== "q" && f.q.trim() && !matchesQuery(p, f.q)) return false;
  return true;
}

function Pager({ page, pages, go }: { page: number; pages: number; go: (n: number) => void }) {
  if (pages <= 1) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <nav class="pagination" aria-label="Paginação">
      <button type="button" disabled={page === 1} onClick={() => go(page - 1)}>‹ Anterior</button>
      {nums.map((n, i) => (
        <Fragment key={n}>
          {i > 0 && n - nums[i - 1] > 1 && <span style="align-self:center;color:var(--text-muted)">…</span>}
          <button type="button" class={n === page ? "active" : ""} onClick={() => go(n)}>{n}</button>
        </Fragment>
      ))}
      <button type="button" disabled={page === pages} onClick={() => go(page + 1)}>Próxima ›</button>
    </nav>
  );
}

const ICONS: Record<string, string> = {
  filter: "M3 5h18l-7 8v6l-4-2v-4L3 5z",
  groups: "M4 6h16M4 12h16M4 18h10",
  brands: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z",
};

/** Seção recolhível da lateral, com ícone, contador de filtros ativos e divisor. */
function Section({ title, icon, badge, open, onToggle, children }: { title: string; icon: string; badge?: number; open: boolean; onToggle: () => void; children: any }) {
  return (
    <section class="side-sec">
      <button type="button" class="side-head" aria-expanded={open} onClick={onToggle}>
        <span class="side-ico">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={ICONS[icon]} /></svg>
        </span>
        <span class="side-title">{title}</span>
        {badge ? <span class="side-badge">{badge}</span> : null}
        <span class={`side-chev${open ? " open" : ""}`} aria-hidden="true">›</span>
      </button>
      {open && <div class="side-body">{children}</div>}
    </section>
  );
}

interface CatalogProps {
  products: Product[];
  whatsapp?: string;
  message?: string;
  banners?: Banner[];
  featured?: string[];
  sections?: { featured?: boolean; bestsellers?: boolean; news?: boolean };
}

export default function Catalog({ products, whatsapp = "", message, banners, featured, sections }: CatalogProps) {
  const [f, setF] = useState<F>(() => readUrl());
  // Produto aberto no pop-up (também vai para a URL: ?p=<id>&c=<cor>).
  const [open, setOpen] = useState<{ id: string; color?: string } | null>(() => {
    const u = new URLSearchParams(location.search);
    const id = u.get("p");
    return id ? { id, color: u.get("c") ?? undefined } : null;
  });
  const openProduct = open ? products.find((p) => p.id === open.id) : undefined;
  const [sort, setSort] = useState("relevance");
  const [page, setPage] = useState(1);
  const [sec, setSec] = useState({ filtros: false, grupos: true, marcas: true }); // seções abertas da lateral
  const toggle = (k: keyof typeof sec) => setSec((s) => ({ ...s, [k]: !s[k] }));
  const [mobileOpen, setMobileOpen] = useState(false); // só afeta telas pequenas
  const [catQ, setCatQ] = useState("");
  const [brandQ, setBrandQ] = useState("");
  const set = (patch: Partial<F>) => { setF((x) => ({ ...x, ...patch })); setPage(1); };

  // Barra do celular / outras páginas pedem para abrir os filtros.
  useEffect(() => {
    const open = () => { setMobileOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
    window.addEventListener("gosync:abrir-filtros", open);
    if (new URLSearchParams(location.search).get("filtros")) open();
    return () => window.removeEventListener("gosync:abrir-filtros", open);
  }, []);

  // Mantém a URL em sincronia (links compartilháveis e botão voltar do produto).
  useEffect(() => {
    const u = new URLSearchParams();
    if (f.q) u.set("q", f.q);
    if (f.cat) u.set("cat", f.cat);
    if (f.brand) u.set("marca", f.brand);
    if (f.size) u.set("tam", f.size);
    if (f.gender) u.set("genero", f.gender);
    if (f.price !== "all") u.set("preco", f.price);
    if (open) { u.set("p", open.id); if (open.color) u.set("c", open.color); }
    const qs = u.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }, [f, open]);

  const categories = useMemo(() => listCategories(products), [products]);
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "pt-BR")) as string[], [products]);
  const genders = useMemo(() => [...new Set(products.map((p) => p.gender).filter(Boolean))] as string[], [products]);
  const sizes = useMemo(() => {
    const s = new Set<string>();
    for (let n = 34; n <= 44; n++) s.add(String(n));
    products.forEach((p) => p.variants.forEach((v) => v.sizes.forEach((x) => s.add(x.size))));
    return [...s].sort(cmpSize);
  }, [products]);

  // Contadores de cada faceta, respeitando os demais filtros.
  // Filtra uma vez por faceta (e só quando produtos/filtros mudam); cada contador depois percorre só essa lista.
  // Antes, cada contador refazia todos os filtros (inclusive a busca tolerante) em todos os produtos.
  const base = useMemo(() => {
    const m = new Map<keyof F, Product[]>();
    return (skip: keyof F) => m.get(skip) ?? m.set(skip, products.filter((p) => matches(p, f, skip))).get(skip)!;
  }, [products, f]);
  const count = (skip: keyof F, test: (p: Product) => boolean) => base(skip).filter(test).length;

  const results = useMemo(() => {
    const list = products.filter((p) => matches(p, f));
    const by: Record<string, (a: Product, b: Product) => number> = {
      "price-asc": (a, b) => eff(a) - eff(b),
      "price-desc": (a, b) => eff(b) - eff(a),
      discount: (a, b) => off(b) - off(a),
      name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    };
    if (by[sort]) return [...list].sort(by[sort]);
    // Relevância: modelos com foto primeiro (vitrine mais bonita), depois por nome.
    const hasPhoto = (p: Product) => (p.variants.some((v) => v.image) ? 0 : 1);
    return [...list].sort((a, b) => hasPhoto(a) - hasPhoto(b) || a.name.localeCompare(b.name, "pt-BR"));
  }, [products, f, sort]);

  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const visible = results.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const goPage = (n: number) => { setPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const clear = () => { setF({ q: "", cat: null, brand: null, size: null, gender: null, price: "all" }); setPage(1); };
  const active = [f.q, f.cat, f.brand, f.size, f.gender, f.price !== "all"].filter(Boolean).length;

  const catName = f.cat ? categories.find((c) => c.slug === f.cat)?.name : null;
  const title = f.q ? `Resultados para “${f.q}”` : catName ?? "Todos os produtos";

  // Seções da página inicial (só na 1ª página e sem filtros): destaques escolhidos, mais vendidos e novidades.
  const showSections = active === 0 && cur === 1;
  const openFromShowcase = (p: Product, color: string) => setOpen({ id: p.id, color });
  const featList = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return (featured ?? []).map((id) => byId.get(id)).filter((p): p is Product => !!p).slice(0, 24);
  }, [products, featured]);
  const bestList = useMemo(() => products.filter((p) => (p.sold ?? 0) > 0).sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0)).slice(0, 12), [products]);
  const newList = useMemo(() => {
    // "Chegou agora": cadastros dentro dos 60 dias mais recentes do próprio catálogo.
    const dated = products.filter((p) => p.added);
    if (!dated.length) return [];
    const newest = dated.reduce((m, p) => (p.added! > m ? p.added! : m), "");
    const limit = new Date(new Date(newest).getTime() - 60 * 86400000).toISOString().slice(0, 10);
    return dated.filter((p) => p.added! >= limit).sort((a, b) => b.added!.localeCompare(a.added!)).slice(0, 12);
  }, [products]);

  // Filtros ativos como "chips" removíveis acima dos produtos.
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.q) chips.push({ key: "q", label: `Busca: “${f.q}”`, clear: () => set({ q: "" }) });
  if (f.cat) chips.push({ key: "cat", label: catName ?? f.cat, clear: () => set({ cat: null }) });
  if (f.brand) chips.push({ key: "brand", label: f.brand, clear: () => set({ brand: null }) });
  if (f.size) chips.push({ key: "size", label: `Nº ${f.size}`, clear: () => set({ size: null }) });
  if (f.gender) chips.push({ key: "gender", label: label(f.gender), clear: () => set({ gender: null }) });
  if (f.price !== "all") chips.push({ key: "price", label: PRICE_RANGES.find((r) => r.id === f.price)?.label ?? f.price, clear: () => set({ price: "all" }) });

  return (
    <div class="layout">
      <aside class={`sidebar${mobileOpen ? " open" : ""}`} aria-label="Filtros, grupos e marcas">
        <button type="button" class="sidebar-toggle" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
          <span>☰ Filtros, grupos e marcas{active > 0 ? ` (${active})` : ""}</span><span>{mobileOpen ? "−" : "+"}</span>
        </button>
        <div class="sidebar-body">
          {active > 0 && (
            <button type="button" class="btn-clear sidebar-clear" onClick={clear}>× Limpar todos os filtros ({active})</button>
          )}

          {/* 1) FILTROS */}
          <Section title="Filtros" icon="filter" badge={[f.size, f.gender, f.price !== "all"].filter(Boolean).length} open={sec.filtros} onToggle={() => toggle("filtros")}>
            <div class="filter-title" style="margin-top:0">Numeração</div>
            <div class="size-grid">
              {sizes.map((s) => {
                const n = count("size", (p) => p.variants.some((v) => v.sizes.some((x) => x.size === s && x.stock > 0)));
                return (
                  <button key={s} type="button" disabled={n === 0 && f.size !== s} title={n === 0 ? "Sem estoque" : `${n} modelo(s)`}
                    class={`size-pill${f.size === s ? " active" : ""}`} onClick={() => set({ size: f.size === s ? null : s })}>{s}</button>
                );
              })}
            </div>
            {genders.length > 0 && (
              <>
                <div class="filter-title">Gênero</div>
                <div class="chips">
                  {genders.map((g) => (
                    <button key={g} type="button" class={`chip${f.gender === g ? " active" : ""}`} onClick={() => set({ gender: f.gender === g ? null : g })}>{label(g)}</button>
                  ))}
                </div>
              </>
            )}
            <div class="filter-title">Faixa de preço</div>
            <div class="chips">
              {PRICE_RANGES.map((r) => (
                <button key={r.id} type="button" class={`chip${f.price === r.id ? " active" : ""}`} onClick={() => set({ price: r.id })}>{r.label}</button>
              ))}
            </div>
          </Section>

          {/* 2) GRUPOS */}
          <Section title="Grupos" icon="groups" badge={f.cat ? 1 : 0} open={sec.grupos} onToggle={() => toggle("grupos")}>
            <input class="sidebar-search" type="text" placeholder="Filtrar grupos…" value={catQ} onInput={(e) => setCatQ((e.target as HTMLInputElement).value)} />
            <ul class="group-list scroll">
              <li class={`group-item${!f.cat ? " active" : ""}`} onClick={() => set({ cat: null })}>
                <span>Todos os produtos</span><span class="cnt">{count("cat", () => true)}</span>
              </li>
              {categories.filter((c) => norm(c.name).includes(norm(catQ))).map((c) => (
                <li key={c.slug} class={`group-item${f.cat === c.slug ? " active" : ""}`} onClick={() => set({ cat: f.cat === c.slug ? null : c.slug })}>
                  <span>{c.name}</span><span class="cnt">{count("cat", (p) => p.category === c.slug)}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* 3) MARCAS (por último) */}
          {brands.length > 0 && (
            <Section title="Marcas" icon="brands" badge={f.brand ? 1 : 0} open={sec.marcas} onToggle={() => toggle("marcas")}>
              <input class="sidebar-search" type="text" placeholder="Filtrar marcas…" value={brandQ} onInput={(e) => setBrandQ((e.target as HTMLInputElement).value)} />
              <ul class="group-list scroll">
                <li class={`group-item${!f.brand ? " active" : ""}`} onClick={() => set({ brand: null })}>
                  <span>Todas as marcas</span><span class="cnt">{count("brand", () => true)}</span>
                </li>
                {brands.filter((b) => norm(b).includes(norm(brandQ))).map((b) => (
                  <li key={b} class={`group-item${f.brand === b ? " active" : ""}`} onClick={() => set({ brand: f.brand === b ? null : b })}>
                    <span>{b}</span><span class="cnt">{count("brand", (p) => p.brand === b)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </aside>

      <main class="content">
        {f.brand && (
          <div class="brand-banner">
            <div class="brand-banner-mono">{f.brand.charAt(0).toUpperCase()}</div>
            <div class="brand-banner-info">
              <div class="brand-banner-badge">Marca selecionada</div>
              <h2 class="brand-banner-name">{f.brand}</h2>
              <div class="brand-banner-count">{results.length} {results.length === 1 ? "modelo disponível" : "modelos disponíveis"}</div>
            </div>
            <button type="button" class="btn-clear" onClick={() => set({ brand: null })}>× Limpar</button>
          </div>
        )}

        <Banners banners={banners} />

        {showSections && sections?.featured !== false && featList.length > 0 && (
          <Showcase title="Destaques" tag="Escolhidos a dedo" products={featList} size={f.size} onOpen={openFromShowcase} />
        )}
        {showSections && sections?.bestsellers !== false && bestList.length >= 3 && (
          <Showcase title="Mais vendidos" tag="Últimos 90 dias" products={bestList} size={f.size} onOpen={openFromShowcase} />
        )}
        {showSections && sections?.news !== false && newList.length >= 3 && (
          <Showcase title="Chegou agora" tag="Novidades" products={newList} size={f.size} onOpen={openFromShowcase} />
        )}

        <div class="content-header">
          <h1 class="breadcrumb" style="margin:0">{title}</h1>
          <div class="header-right">
            <span class="result-count" aria-live="polite">{results.length} {results.length === 1 ? "modelo" : "modelos"}{f.size ? ` · nº ${f.size} em estoque` : ""}</span>
            <select class="sort-select" aria-label="Ordenar" value={sort} onChange={(e) => { setSort((e.target as HTMLSelectElement).value); setPage(1); }}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {chips.length > 0 && (
          <div class="active-chips" aria-label="Filtros ativos">
            {chips.map((c) => (
              <button key={c.key} type="button" class="achip" onClick={c.clear} aria-label={`Remover filtro ${c.label}`}>
                {c.label} <span aria-hidden="true">×</span>
              </button>
            ))}
            {chips.length > 1 && <button type="button" class="achip clear" onClick={clear}>Limpar tudo</button>}
          </div>
        )}

        {results.length === 0 ? (
          <div class="empty-state">
            Nenhum calçado encontrado com esses filtros.
            <div><button type="button" class="btn-clear" onClick={clear}>Limpar filtros</button></div>
          </div>
        ) : (
          <div class="grid">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} size={f.size} onOpen={(prod, color) => setOpen({ id: prod.id, color })} />
            ))}
          </div>
        )}
        <Pager page={cur} pages={pages} go={goPage} />
      </main>

      {openProduct && (
        <ProductModal product={openProduct} whatsapp={whatsapp} messageTemplate={message} color={open?.color} size={f.size} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
