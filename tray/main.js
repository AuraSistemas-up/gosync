const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, Notification, shell } = require("electron");
const path = require("path");
const config = require("./lib/config");
const { syncData, publishSite, testFtp, resetPhotoCache } = require("./lib/sync");
const locaweb = require("./lib/locaweb");

if (!app.requestSingleInstanceLock()) app.quit();

const ICON = path.join(__dirname, "assets", "icon.png");
let win = null;
let tray = null;
let timer = null;
let quitting = false;

const status = {
  state: "idle", // idle | running | ok | error
  message: "Aguardando configuração",
  lastRun: null,
  lastOk: null,
  nextRun: null,
  stats: null,
};
const logs = [];

const push = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);
const log = (text) => {
  const line = { t: new Date().toISOString(), text: String(text) };
  logs.push(line);
  if (logs.length > 300) logs.shift();
  push("log", line);
};
function setStatus(patch) {
  Object.assign(status, patch);
  push("status", status);
  updateTray();
}

const configured = (c) => c.erpUrl && c.ftpHost && c.ftpUser && c.ftpPass;

/* ---------- janela ---------- */
function createWindow(show = true) {
  win = new BrowserWindow({
    width: 520,
    height: 760,
    minWidth: 460,
    minHeight: 600,
    show,
    title: "GoSync",
    icon: ICON,
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "ui", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.on("close", (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
}
const showWindow = () => {
  if (!win || win.isDestroyed()) createWindow();
  win.show();
  win.focus();
};

/* ---------- bandeja ---------- */
const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

function updateTray() {
  if (!tray) return;
  const c = config.load();
  const running = status.state === "running";
  tray.setToolTip(
    `GoSync — ${running ? "sincronizando…" : status.state === "error" ? "erro" : `última: ${fmt(status.lastOk)} · próxima: ${fmt(status.nextRun)}`}`,
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir painel", click: showWindow },
      { label: running ? "Sincronizando…" : "Sincronizar agora", enabled: !running, click: () => runSync(true) },
      { type: "separator" },
      {
        label: "Iniciar com o Windows",
        type: "checkbox",
        checked: !!c.autostart,
        click: (i) => { config.save({ autostart: i.checked }); applyAutostart(i.checked); },
      },
      { type: "separator" },
      { label: "Sair", click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

function applyAutostart(on) {
  if (!app.isPackaged) return; // em desenvolvimento registraria o electron.exe
  app.setLoginItemSettings({ openAtLogin: !!on, args: ["--hidden"] });
}

/* ---------- agenda e sincronização ---------- */
function schedule() {
  clearTimeout(timer);
  const c = config.load();
  if (!configured(c)) { setStatus({ nextRun: null }); return; }
  const ms = c.intervalMin * 60_000;
  setStatus({ nextRun: new Date(Date.now() + ms).toISOString() });
  timer = setTimeout(() => runSync(false), ms);
}

async function guarded(label, fn) {
  if (status.state === "running") return { ok: false, error: "Já existe uma operação em andamento." };
  setStatus({ state: "running", message: label, lastRun: new Date().toISOString() });
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (e) {
    log(`ERRO: ${e.message}`);
    setStatus({ state: "error", message: e.message });
    new Notification({ title: "GoSync", body: `Falha: ${e.message}` }).show();
    return { ok: false, error: e.message };
  }
}

async function runSync(force) {
  const c = config.load();
  if (!configured(c)) { setStatus({ state: "idle", message: "Preencha as configurações para começar." }); showWindow(); return; }
  log(force ? "Sincronização manual iniciada." : "Sincronização agendada iniciada.");
  const r = await guarded("Sincronizando produtos, estoque e fotos…", async () => {
    const s = await syncData(c, { force, log });
    const msg = s.changed
      ? `${s.models} modelos publicados${s.photos ? ` · ${s.photos} foto(s) enviada(s)` : ""}`
      : "Tudo atualizado (sem mudanças)";
    log(msg + ".");
    setStatus({ state: "ok", message: msg, lastOk: new Date().toISOString(), stats: s });
    return s;
  });
  schedule(); // reagenda mesmo após erro: tenta de novo no próximo ciclo
  return r;
}

/* ---------- auto-update (GitHub Releases) ---------- */
let updater = null;
let updateReady = false;
const update = { state: "idle", version: null, message: "" }; // idle | checking | downloading | ready | uptodate | error
const setUpdate = (patch) => { Object.assign(update, patch); push("update", update); };

function initUpdater() {
  if (!app.isPackaged) { update.message = "Atualização automática só no app instalado"; return; }
  try {
    updater = require("electron-updater").autoUpdater;
  } catch (e) { log(`Atualizador indisponível: ${e.message}`); return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = { info: () => {}, warn: () => {}, error: (m) => log(`Update: ${m}`), debug: () => {} };
  updater.on("checking-for-update", () => setUpdate({ state: "checking", message: "Procurando atualização…" }));
  updater.on("update-available", (i) => { log(`Nova versão ${i.version} encontrada. Baixando…`); setUpdate({ state: "downloading", version: i.version, message: `Baixando v${i.version}…` }); });
  updater.on("update-not-available", () => setUpdate({ state: "uptodate", message: "Você está na versão mais recente" }));
  updater.on("error", (e) => setUpdate({ state: "error", message: `Falha ao verificar: ${e.message}` }));
  updater.on("update-downloaded", (i) => {
    updateReady = true;
    log(`Versão ${i.version} baixada.`);
    setUpdate({ state: "ready", version: i.version, message: `v${i.version} pronta para instalar` });
    // Instala sozinho assim que não houver sincronização em andamento.
    const tryInstall = () => {
      if (status.state === "running") return setTimeout(tryInstall, 30_000);
      new Notification({ title: "GoSync", body: `Atualizando para a v${i.version}…` }).show();
      setTimeout(() => { quitting = true; updater.quitAndInstall(true, true); }, 3000);
    };
    tryInstall();
  });
  setTimeout(() => checkUpdate(false), 15_000);
  setInterval(() => checkUpdate(false), 4 * 60 * 60 * 1000); // a cada 4 h
}
async function checkUpdate(manual) {
  if (!updater) { if (manual) setUpdate({ message: update.message || "Atualização automática só no app instalado" }); return update; }
  if (update.state === "downloading" || update.state === "ready") return update;
  try { await updater.checkForUpdates(); } catch (e) { setUpdate({ state: "error", message: `Falha ao verificar: ${e.message}` }); }
  return update;
}

/* ---------- IPC ---------- */
ipcMain.handle("init", () => ({ config: config.forUi(config.load()), status, logs, update, version: app.getVersion(), packaged: app.isPackaged }));
ipcMain.handle("config:save", (_e, patch) => {
  const next = config.save(patch);
  applyAutostart(next.autostart);
  schedule();
  updateTray();
  return config.forUi(next);
});
ipcMain.handle("sync:now", () => runSync(true));
ipcMain.handle("site:publish", () =>
  guarded("Publicando o site na Locaweb…", async () => {
    await publishSite(config.load(), { log });
    log("Site publicado.");
    setStatus({ state: "ok", message: "Site publicado na Locaweb", lastOk: new Date().toISOString() });
  }),
);
ipcMain.handle("ftp:test", async () => {
  try { await testFtp(config.load()); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("photos:reset", () => { resetPhotoCache(); log("Cache de fotos limpo: tudo será reenviado na próxima sincronização."); });
ipcMain.handle("locaweb:detect", async (_e, domain) => {
  try { return { ok: true, ...(await locaweb.detectHost(domain)) }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("locaweb:diagnose", async () => {
  const r = await locaweb.diagnose(config.load());
  if (r.suggestedDir) config.save({ remoteDir: r.suggestedDir });
  return { ...r, config: config.forUi(config.load()) };
});
ipcMain.handle("update:check", () => checkUpdate(true));
ipcMain.handle("update:install", () => { if (updater && updateReady) { quitting = true; updater.quitAndInstall(true, true); } });
ipcMain.handle("pick:folder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

/* ---------- ciclo de vida ---------- */
app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => { /* continua na bandeja */ });

app.whenReady().then(() => {
  app.setAppUserModelId("br.com.gosync.app");
  initUpdater();
  const c = config.load();
  const hidden = process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAtLogin;

  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.on("click", showWindow);
  createWindow(!hidden || !configured(c));
  applyAutostart(c.autostart);
  updateTray();

  if (configured(c)) setTimeout(() => runSync(false), 5000); // primeira sincronização logo após abrir
  else setStatus({ message: "Preencha as configurações para começar." });
});
