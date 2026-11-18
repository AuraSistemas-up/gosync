const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const DEFAULTS = {
  erpUrl: "",
  erpToken: "",
  whatsapp: "",
  storeName: "",
  primaryColor: "#a33a33",
  bannersDir: "", // pasta com as imagens do carrossel de propaganda (até 6)
  ftpHost: "",
  ftpUser: "",
  ftpPass: "",
  ftpSecure: false,
  remoteDir: "/public_html",
  intervalMin: 15,
  siteDir: path.resolve(__dirname, "..", ".."),
  autostart: true,
};
const SECRETS = ["erpToken", "ftpPass"];

const file = () => path.join(app.getPath("userData"), "config.json");

const enc = (v) =>
  !v ? "" : safeStorage.isEncryptionAvailable() ? "enc:" + safeStorage.encryptString(v).toString("base64") : "raw:" + v;
const dec = (v) => {
  if (!v) return "";
  if (v.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
  return v.replace(/^raw:/, "");
};

/** Config completa (com segredos), só para uso no processo principal. */
function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file(), "utf8")); } catch {}
  const cfg = { ...DEFAULTS, ...saved };
  for (const k of SECRETS) cfg[k] = dec(saved[k] ?? "");
  return cfg;
}

/** `patch` com segredo vazio mantém o valor atual. */
function save(patch) {
  const cur = load();
  const next = { ...cur, ...patch };
  for (const k of SECRETS) if (!patch[k]) next[k] = cur[k];
  next.intervalMin = Math.max(5, Math.min(1440, Number(next.intervalMin) || 15));
  const toDisk = { ...next };
  for (const k of SECRETS) toDisk[k] = enc(next[k]);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(toDisk, null, 2));
  return next;
}

/** Versão para a interface: nunca envia segredos. */
function forUi(cfg) {
  const out = { ...cfg };
  for (const k of SECRETS) { out[k + "Set"] = !!cfg[k]; out[k] = ""; }
  return out;
}

module.exports = { load, save, forUi };
