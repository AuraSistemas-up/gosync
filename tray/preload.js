const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  init: () => ipcRenderer.invoke("init"),
  saveConfig: (patch) => ipcRenderer.invoke("config:save", patch),
  syncNow: () => ipcRenderer.invoke("sync:now"),
  publishSite: () => ipcRenderer.invoke("site:publish"),
  testFtp: () => ipcRenderer.invoke("ftp:test"),
  resetPhotos: () => ipcRenderer.invoke("photos:reset"),
  detectLocaweb: (domain) => ipcRenderer.invoke("locaweb:detect", domain),
  diagnoseLocaweb: () => ipcRenderer.invoke("locaweb:diagnose"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdate: (cb) => ipcRenderer.on("update", (_e, u) => cb(u)),
  testFirebird: () => ipcRenderer.invoke("firebird:test"),
  pickFile: (filters) => ipcRenderer.invoke("pick:file", filters),
  pickFolder: () => ipcRenderer.invoke("pick:folder"),
  onStatus: (cb) => ipcRenderer.on("status", (_e, s) => cb(s)),
  onLog: (cb) => ipcRenderer.on("log", (_e, l) => cb(l)),
});
