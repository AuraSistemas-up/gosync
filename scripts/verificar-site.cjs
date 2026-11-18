// Confere o site publicado: a página principal aponta para arquivos que existem? (detecta envio incompleto/misturado)
// Uso: node scripts/verificar-site.cjs [url]   (padrão: SITE_URL do .deploy.env)
const fs = require("fs");
const path = require("path");

const envFile = path.resolve(__dirname, "..", ".deploy.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const base = (process.argv[2] || process.env.SITE_URL || "").replace(/\/+$/, "");
if (!base) { console.error("Informe a URL: node scripts/verificar-site.cjs https://seusite.com.br"); process.exit(1); }

const get = async (p, init) => {
  try { return await fetch(base + p, { signal: AbortSignal.timeout(20000), cache: "no-store", ...init }); } catch { return null; }
};
const line = (ok, text) => { console.log(`${ok ? "✔" : "✗"} ${text}`); return ok; };

(async () => {
  console.log(`Verificando ${base}\n`);
  let ok = true;

  const home = await get("/");
  if (!home || !home.ok) { console.log("✗ A página inicial não abriu."); process.exit(1); }
  const html = await home.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_astro\/[^"]+)"/g)].map((m) => m[1]))];
  // O catálogo carrega outros arquivos (ex.: SiteHeader, CatalogApp) por import dinâmico: pega também os "component-url".
  for (const m of html.matchAll(/(?:component-url|renderer-url)="(\/_astro\/[^"]+)"/g)) assets.push(m[1]);
  for (const a of [...new Set(assets)]) {
    const r = await get(a, { method: "HEAD" });
    ok = line(!!r && r.ok, `${a}  (${r ? r.status : "sem resposta"})`) && ok;
  }

  for (const [p, label] of [["/data/catalog.json", "catálogo"], ["/produto/", "página de produto"], ["/404.html", "página 404"], ["/admin/", "painel admin"]]) {
    const r = await get(p, { method: "HEAD" });
    ok = line(!!r && r.ok, `${label}: ${p}  (${r ? r.status : "sem resposta"})`) && ok;
  }

  const ping = await get("/admin/api.php?a=ping");
  if (ping && ping.ok) {
    try {
      const j = await ping.json();
      ok = line(!!j.ok, `PHP ${j.php} · pastas graváveis: data=${j.writable?.data} banners=${j.writable?.banners} logo=${j.writable?.logo}`) && ok;
    } catch { ok = line(false, "api.php respondeu algo que não é JSON (o PHP está ativo?)") && ok; }
  } else ok = line(false, "api.php não respondeu") && ok;

  for (const p of ["/admin/credenciais.json", "/admin/tentativas.json"]) {
    const r = await get(p, { method: "HEAD" });
    ok = line(!r || r.status === 403 || r.status === 404, `protegido: ${p}  (${r ? r.status : "sem resposta"})`) && ok;
  }

  // HTTPS obrigatório: o endereço http deve redirecionar para https.
  if (base.startsWith("https://")) {
    try {
      const r = await fetch("http://" + base.slice(8) + "/", { redirect: "manual", signal: AbortSignal.timeout(15000) });
      const loc = r.headers.get("location") || "";
      ok = line(r.status >= 300 && r.status < 400 && loc.startsWith("https://"), `http → https  (${r.status}${loc ? " → " + loc : ""})`) && ok;
    } catch { ok = line(false, "http → https: sem resposta") && ok; }
  }

  // Página de produto com prévia (WhatsApp/Google) + sitemap + robots.
  const cat = await get("/data/catalog.json");
  if (cat && cat.ok) {
    const j = await cat.json().catch(() => null);
    const first = j?.products?.[0];
    if (first) {
      const pr = await get(`/p/${first.id}/`);
      const ph = pr && pr.ok ? await pr.text() : "";
      const hasOg = /property="og:title"/.test(ph) && /application\/ld\+json/.test(ph);
      if (j.store?.pages) ok = line(hasOg, `página com prévia: /p/${first.id}/  ${hasOg ? "(og:title e dados do Google presentes)" : "(SEM prévia: confira se a pasta p/ foi enviada e se o .htaccess é o novo)"}`) && ok;
      else console.log("• páginas com prévia ainda não ativadas (defina o endereço do site no GoSync / SITE_URL no .deploy.env)");
    }
  }
  for (const p of ["/sitemap.xml", "/robots.txt"]) {
    const r = await get(p, { method: "HEAD" });
    if (r && r.ok) line(true, `${p}  (${r.status})`); else console.log(`• ${p} ainda não existe (gerado junto com as páginas com prévia)`);
  }

  // Esse HTML é de uma versão antiga? (cabeçalho antigo = envio incompleto)
  if (/class="topbar"/.test(html)) ok = line(false, "index.html é de uma versão ANTIGA (cabeçalho antigo): envie a pasta locaweb inteira, sobrescrevendo tudo") && ok;

  console.log(ok ? "\nTudo certo. Abra o site com Ctrl+F5." : "\nHá problemas acima. Reenvie a pasta locaweb inteira (sobrescrevendo os arquivos existentes) e rode de novo.");
  process.exit(ok ? 0 : 2);
})();
