const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("backend", {
  loadTemplate: function () {
    return ipcRenderer.invoke("load-template");
  },
  evaluateTemplate: function (values) {
    return ipcRenderer.invoke("evaluate-template", values);
  },
});
