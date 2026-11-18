import { useEffect, useState } from "preact/hooks";
import type { CatalogFile } from "../types/product";

export type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; data: CatalogFile };

/** Carrega /data/catalog.json (atualizado pelo app da bandeja). */
export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fetch("/data/catalog.json", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<CatalogFile>;
      })
      .then((data) => alive && setState({ status: "ok", data }))
      .catch(() => alive && setState({ status: "error" }));
    return () => { alive = false; };
  }, []);
  return state;
}
