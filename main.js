let { readFile } = require("fs");
const path = require("path");
const { promisify } = require("util");
readFile = promisify(readFile);

const electron = require("electron");
const { BrowserWindow, app, ipcMain, remote, dialog } = electron;
const yaml = require("js-yaml");
const zip = require("jszip");

const { Template } = require('./template.js');

const backendState = {
  template: null
};

function setupIPC() {
  ipcMain.handle("load-template", async (_event) => {
    let result = await dialog.showOpenDialog(remote, {
      properties: ["openFile"],
      message: "Choose a template",
      filters: { name: "Document Templates", extensions: ["doctemplate"] },
    });
    if (!result || result.canceled || result.filePaths.length !== 1) {
      return null;
    }
    const filename = result.filePaths[0];
    try {
      let zipFile = await readFile(filename, "binary");
      zipFile = await zip.loadAsync(zipFile);
      let yamlData = await zipFile.file("template.yml").async("string");
      yamlData = yaml.safeLoad(yamlData);
      backendState.template = new Template(yamlData);
      await backendState.template.loadFiles(zipFile);
      return {
        name: backendState.template.name,
        fields: backendState.template.inputFieldList
      };
    } catch (e) {
      return e;
    }
  });
  ipcMain.handle("evaluate-template", (_event, values) => {
    const result = backendState.template.evaluate(values);
    return result;
  })
}

function startRenderer() {
  function start() {
    const win = new electron.BrowserWindow({
      width: 450,
      height: 600,
      minWidth: 450,
      minHeight: 400,
      webPreferences: {
        contextIsolation: true,
        preload: path.join(app.getAppPath(), "client", "preload.js"),
      },
    });

    win.loadFile(path.join(app.getAppPath(), "client", "index.html"));
  }

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      start();
    }
  });

  app.whenReady().then(start);
}

setupIPC();
startRenderer();
