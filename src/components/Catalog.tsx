import { useMemo, useState } from "preact/hooks";
import type { Product } from "../types/product";
import ProductCard from "./ProductCard";

const PRICE_RANGES = [
  { id: "all", label: "Todos", min: 0, max: Infinity },
  { id: "0-150", label: "Até R$ 150", min: 0, max: 150 },
  { id: "150-300", label: "R$ 150 a 300", min: 150, max: 300 },
  { id: "300-500", label: "R$ 300 a 500", min: 300, max: 500 },
  { id: "500+", label: "Acima de R$ 500", min: 500, max: Infinity },
];

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      class={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
        active ? "bg-stone-900 text-white ring-stone-900" : "bg-white text-stone-700 ring-stone-300"
      }`}>
      {children}
    </button>
  );
}

export default function Catalog({ products }: { products: Product[] }) {
  const [size, setSize] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [price, setPrice] = useState("all");
  const [open, setOpen] = useState(false);

  // Opções derivadas dos dados do ERP (34..44 sempre aparecem + extras).
  const sizes = useMemo(() => {
    const set = new Set<string>();
    for (let n = 34; n <= 44; n++) set.add(String(n));
    products.forEach((p) => p.variants.forEach((v) => v.sizes.forEach((s) => set.add(s.size))));
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[], [products]);
  const genders = useMemo(() => [...new Set(products.map((p) => p.gender).filter(Boolean))] as string[], [products]);

  const filtered = useMemo(() => {
    const range = PRICE_RANGES.find((r) => r.id === price)!;
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (gender && p.gender !== gender && p.gender !== "unissex") return false;
      const eff = p.promoPrice ?? p.price;
      if (eff < range.min || eff >= range.max) return false;
      // Estoque > 0 na numeração escolhida, em qualquer cor.
      if (size && !p.variants.some((v) => v.sizes.some((s) => s.size === size && s.stock > 0))) return false;
      return true;
    });
  }, [products, size, category, gender, price]);

  const activeCount = [size, category, gender, price !== "all"].filter(Boolean).length;
  const clear = () => { setSize(null); setCategory(null); setGender(null); setPrice("all"); };

  return (
    <div class="md:grid md:grid-cols-[250px_1fr] md:gap-6">
      <aside class="mb-4 md:mb-0">
        <button type="button" onClick={() => setOpen(!open)}
          class="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 font-medium ring-1 ring-stone-200 md:hidden">
          <span>Filtros{activeCount > 0 && ` (${activeCount})`}</span>
          <span>{open ? "−" : "+"}</span>
        </button>

        <div class={`${open ? "block" : "hidden"} mt-3 space-y-5 rounded-xl bg-white p-4 ring-1 ring-stone-200 md:mt-0 md:block md:sticky md:top-20`}>
          <section>
            <h2 class="mb-2 text-sm font-semibold">Numeração</h2>
            <div class="grid grid-cols-6 gap-1.5">
              {sizes.map((s) => (
                <button key={s} type="button" aria-pressed={size === s}
                  onClick={() => setSize(size === s ? null : s)}
                  class={`rounded-lg py-2 text-sm ring-1 ${
                    size === s ? "bg-emerald-600 text-white ring-emerald-600" : "ring-stone-300"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </section>

          {categories.length > 0 && (
            <section>
              <h2 class="mb-2 text-sm font-semibold">Categoria</h2>
              <div class="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>{label(c)}</Chip>
                ))}
              </div>
            </section>
          )}

          {genders.length > 0 && (
            <section>
              <h2 class="mb-2 text-sm font-semibold">Gênero</h2>
              <div class="flex flex-wrap gap-2">
                {genders.map((g) => (
                  <Chip key={g} active={gender === g} onClick={() => setGender(gender === g ? null : g)}>{label(g)}</Chip>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 class="mb-2 text-sm font-semibold">Faixa de preço</h2>
            <div class="flex flex-wrap gap-2">
              {PRICE_RANGES.map((r) => (
                <Chip key={r.id} active={price === r.id} onClick={() => setPrice(r.id)}>{r.label}</Chip>
              ))}
            </div>
          </section>

          {activeCount > 0 && (
            <button type="button" onClick={clear} class="w-full rounded-lg py-2 text-sm text-stone-600 underline">
              Limpar filtros
            </button>
          )}
        </div>
      </aside>

      <section>
        <p class="mb-3 text-sm text-stone-500" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "modelo" : "modelos"}
          {size && ` com numeração ${size} em estoque`}
        </p>
        {filtered.length === 0 ? (
          <div class="rounded-xl bg-white p-8 text-center ring-1 ring-stone-200">
            <p class="font-medium">Nenhum calçado encontrado</p>
            <button type="button" onClick={clear} class="mt-3 rounded-lg bg-stone-900 px-4 py-2 text-white">
              Limpar filtros
            </button>
          </div>
        ) : (
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {filtered.map((p) => <ProductCard key={p.id} product={p} size={size} />)}
          </div>
        )}
      </section>
    </div>
  );
}
