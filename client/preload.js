const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("backend", {
  loadTemplate: function () {
    return ipcRenderer.invoke("load-template");
  },
});
