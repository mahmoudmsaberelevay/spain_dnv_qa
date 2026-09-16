const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("elevayDesktop", Object.freeze({
  getVersion: () => ipcRenderer.invoke("desktop:get-version"),
  retryConnection: () => ipcRenderer.invoke("desktop:retry-connection"),
  openExternal: url => ipcRenderer.invoke("desktop:open-external", url),
}));
