const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("backend", {
  loadTemplate: function () {
    return ipcRenderer.invoke("load-template");
  },
  evaluateTemplate: function (values) {
    return ipcRenderer.invoke("evaluate-template", values);
  },
  openPath: function (path) {
    return ipcRenderer.invoke("open-path", path);
  },
  onTemplateLoad: function (callback) {
    ipcRenderer.on("template-loaded", function (_event, ...args) {
      callback(...args);
    });
  },
});
