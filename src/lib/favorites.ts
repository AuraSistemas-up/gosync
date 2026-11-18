import { useEffect, useState } from "preact/hooks";

/** Item salvo nos favoritos: o modelo e, opcionalmente, a cor e a numeração escolhidas para o pedido. */
export interface FavItem { id: string; color?: string; size?: string }

const KEY = "gosync:favoritos";
const EVT = "gosync:favoritos";

function read(): FavItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string") : [];
  } catch {
    return [];
  }
}
function write(items: FavItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* navegação privada: segue só em memória */ }
  window.dispatchEvent(new Event(EVT));
}

export const favorites = {
  all: read,
  has: (id: string) => read().some((x) => x.id === id),
  toggle(id: string, color?: string, size?: string) {
    const cur = read();
    write(cur.some((x) => x.id === id) ? cur.filter((x) => x.id !== id) : [...cur, { id, color, size }]);
  },
  update(id: string, patch: Partial<FavItem>) { write(read().map((x) => (x.id === id ? { ...x, ...patch } : x))); },
  remove(id: string) { write(read().filter((x) => x.id !== id)); },
  clear() { write([]); },
};

/** Lista de favoritos reativa (atualiza em todas as partes da página e entre abas). */
export function useFavorites(): FavItem[] {
  const [items, setItems] = useState<FavItem[]>(() => read());
  useEffect(() => {
    const sync = () => setItems(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return items;
}

/** Eventos de interface entre os componentes independentes (cabeçalho, barra do celular, catálogo). */
export const ui = {
  openFavorites: () => window.dispatchEvent(new Event("gosync:abrir-favoritos")),
  openFilters: () => window.dispatchEvent(new Event("gosync:abrir-filtros")),
};
