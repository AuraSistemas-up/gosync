/**
 * Fonte de dados "Firebird": lê produtos, variações, estoque e fotos do banco do ERP (SOMENTE LEITURA)
 * e devolve o catálogo pronto. Roda dentro do Electron (driver N-API; usa o fbclient.dll instalado com o Firebird).
 * As fotos saem redimensionadas (1200 px; pequenas são ampliadas) com miniatura de 520 px, por hash do conteúdo.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { nativeImage } = require("electron");
const { buildProducts } = require("./firebird-model");

const CANDIDATES = [
  "C:/Program Files/Firebird/Firebird_5_0/fbclient.dll",
  "C:/Program Files/Firebird/Firebird_4_0/fbclient.dll",
  "C:/Program Files/Firebird/Firebird_3_0/fbclient.dll",
  "C:/Program Files (x86)/Firebird/Firebird_5_0/fbclient.dll",
  "C:/Program Files (x86)/Firebird/Firebird_3_0/fbclient.dll",
  "C:/Program Files (x86)/Firebird/Firebird_2_5/bin/fbclient.dll",
];

/** Acha o fbclient.dll: caminho configurado, instalações padrão ou qualquer subpasta de C:/Program Files/Firebird. */
function findClientLib(cfg) {
  const list = [cfg.fbClient, ...CANDIDATES].filter(Boolean);
  for (const root of ["C:/Program Files/Firebird", "C:/Program Files (x86)/Firebird"]) {
    try {
      for (const d of fs.readdirSync(root)) list.push(`${root}/${d}/fbclient.dll`, `${root}/${d}/bin/fbclient.dll`);
    } catch { /* pasta não existe */ }
  }
  const found = list.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Cliente do Firebird (fbclient.dll) não encontrado. Informe o caminho em Configurações → Banco de dados.");
  return found;
}

const friendly = (e) => {
  const m = String(e.message || e);
  if (/Your user name and password|password|authenticat/i.test(m)) return "Usuário ou senha do Firebird incorretos";
  if (/Unable to complete network request|connection (refused|rejected)|10061|network/i.test(m)) return "O servidor Firebird não respondeu (confira a porta e se o serviço está ativo)";
  if (/I\/O error|cannot open|No such file|database.*not found|unavailable database/i.test(m)) return "Banco de dados não encontrado no servidor (confira o caminho do arquivo .FDB)";
  if (/Cannot load Firebird client/i.test(m)) return "Não foi possível carregar o cliente do Firebird (fbclient.dll)";
  return m;
};

/** Converte a imagem do banco em foto grande + miniatura (nativeImage). Devolve {name} ou null. */
function processPhoto(raw, photosDir) {
  if (!raw || raw.length < 100) return null;
  const img = nativeImage.createFromBuffer(raw);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const longest = Math.max(width, height);
  const png = raw.subarray(1, 4).toString() === "PNG"; // PNG continua PNG (preserva transparência)
  const enc = (i, q) => (png ? i.toPNG() : i.toJPEG(q));
  const scaled = (target) => {
    const s = target / longest;
    return s === 1 ? img : img.resize({ width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)), quality: "best" });
  };
  // Grande: reduz a 1200 px; fotos pequenas (< 700 px) são ampliadas para 800 px para não ficarem borradas no pop-up.
  const full = enc(scaled(longest < 700 ? 800 : Math.min(1200, longest)), 88);
  const thumb = enc(scaled(Math.min(520, longest)), 80);
  const ext = png ? ".png" : ".jpg";
  const name = crypto.createHash("sha1").update(full).digest("hex").slice(0, 16) + ext;
  fs.writeFileSync(path.join(photosDir, name), full);
  fs.writeFileSync(path.join(photosDir, name.replace(/(\.\w+)$/, "-s$1")), thumb);
  return { name };
}

/**
 * @param cfg  {fbDb, fbUser, fbPassword, fbHost, fbPort, fbClient}
 * @param opts {log, photosDir, cache}  cache: {chave → nome} persistido entre sincronizações (evita reler fotos já convertidas)
 * @returns {products, photoNames:Set, newPhotos, photoFailures}
 */
async function readFirebird(cfg, { log = () => {}, photosDir, cache = {} }) {
  if (!cfg.fbDb || !cfg.fbUser || !cfg.fbPassword) throw new Error("Banco Firebird não configurado (caminho do .FDB, usuário e senha).");
  fs.mkdirSync(photosDir, { recursive: true });

  const lib = findClientLib(cfg);
  process.env.PATH = path.dirname(lib) + path.delimiter + process.env.PATH; // dependências da dll
  const { createNativeClient } = require("node-firebird-driver-native");

  const client = createNativeClient(lib);
  let att, tx;
  try {
    const url = `inet://${cfg.fbHost || "127.0.0.1"}:${cfg.fbPort || 3050}/${String(cfg.fbDb).replace(/\\/g, "/")}`;
    log(`Conectando ao Firebird (${cfg.fbHost || "127.0.0.1"}:${cfg.fbPort || 3050})…`);
    att = await client.connect(url, { username: cfg.fbUser, password: cfg.fbPassword, charSetForNONE: "win1252" });
    tx = await att.startTransaction({ accessMode: "READ_ONLY" });

    const q = async (sql) => {
      const rs = await att.executeQuery(tx, sql);
      const rows = await rs.fetchAsObject();
      await rs.close();
      return rows;
    };

    const photoNames = new Set();
    let newPhotos = 0, photoFailures = 0;
    const photoUrl = async (key, blobRef) => {
      if (!blobRef) return null;
      let name = cache[key];
      if (name && fs.existsSync(path.join(photosDir, name))) {
        photoNames.add(name);
        return `/fotos/${name}`;
      }
      try {
        const stream = await att.openBlob(tx, blobRef);
        const chunks = [];
        const buf = Buffer.alloc(65536);
        let n;
        while ((n = await stream.read(buf)) !== -1) chunks.push(Buffer.from(buf.subarray(0, n)));
        await stream.close();
        const out = processPhoto(Buffer.concat(chunks), photosDir);
        if (!out) { photoFailures++; return null; }
        cache[key] = out.name;
        photoNames.add(out.name);
        newPhotos++;
        return `/fotos/${out.name}`;
      } catch {
        photoFailures++;
        return null;
      }
    };

    const products = await buildProducts({ q, photoUrl, log, tipos: cfg.fbTipos || "N,G" });
    return { products, photoNames, newPhotos, photoFailures };
  } catch (e) {
    throw new Error(friendly(e));
  } finally {
    try { if (tx) await tx.commit(); } catch { /* ignora */ }
    try { if (att) await att.disconnect(); } catch { /* ignora */ }
    try { await client.dispose(); } catch { /* ignora */ }
  }
}

/** Teste de conexão para o botão da interface: devolve o nº de produtos ativos. */
async function testFirebird(cfg) {
  if (!cfg.fbDb || !cfg.fbUser || !cfg.fbPassword) throw new Error("Preencha o caminho do .FDB, o usuário e a senha.");
  const lib = findClientLib(cfg);
  process.env.PATH = path.dirname(lib) + path.delimiter + process.env.PATH;
  const { createNativeClient } = require("node-firebird-driver-native");
  const client = createNativeClient(lib);
  let att;
  try {
    att = await client.connect(`inet://${cfg.fbHost || "127.0.0.1"}:${cfg.fbPort || 3050}/${String(cfg.fbDb).replace(/\\/g, "/")}`, {
      username: cfg.fbUser, password: cfg.fbPassword, charSetForNONE: "win1252",
    });
    const tx = await att.startTransaction({ accessMode: "READ_ONLY" });
    const tipos = String(cfg.fbTipos || "N,G").split(/[,;\s]+/).map((t) => t.trim().toUpperCase()).filter((t) => /^[A-Z0-9]$/.test(t));
    const rs = await att.executeQuery(tx, `SELECT COUNT(*) AS N FROM TB_PRODUTO p WHERE p.PRD_STATUS = 'A' AND p.PRD_EXPORTAR = 'S'
      AND p.PRD_TIPO_PRODUTO IN (${(tipos.length ? tipos : ["N", "G"]).map((t) => `'${t}'`).join(", ")})
      AND EXISTS(SELECT 1 FROM TB_PRODUTO_ESTOQUE e WHERE e.PRDE_PRODUTO = p.PRD_ID AND e.PRDE_ESTOQUE > 0)`);
    const rows = await rs.fetchAsObject();
    await rs.close();
    await tx.commit();
    return { products: Number(rows[0].N), lib };
  } catch (e) {
    throw new Error(friendly(e));
  } finally {
    try { if (att) await att.disconnect(); } catch { /* ignora */ }
    try { await client.dispose(); } catch { /* ignora */ }
  }
}

module.exports = { readFirebird, testFirebird, findClientLib };
