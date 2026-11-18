import { useCatalog } from "../lib/catalog";
import Hero from "./Hero";

/** Cabeçalho de todas as páginas (lê as configurações do painel admin; aparece já com a busca mesmo antes de carregar). */
export default function SiteHeader() {
  const s = useCatalog();
  return <Hero data={s.status === "ok" ? s.data : null} />;
}
