let { readFile } = require("fs");
const path = require("path");
const { promisify } = require("util");
readFile = promisify(readFile);

const electron = require("electron");
const { BrowserWindow, Menu, app, ipcMain, remote, dialog, shell } = electron;
const Store = require("electron-store");
const yaml = require("js-yaml");
const zip = require("jszip");

const { Template } = require("./template.js");

const persistentState = new Store();
const backendState = {
  template: null,
  fieldFilePath: null,
};

async function loadTemplate(filePath) {
  try {
    let zipFile = await readFile(filePath, "binary");
    zipFile = await zip.loadAsync(zipFile);
    let yamlData = await zipFile.file("template.yml").async("string");
    yamlData = yaml.safeLoad(yamlData);
    backendState.template = new Template(yamlData);
    await backendState.template.loadFiles(zipFile);
    return {
      name: backendState.template.name,
      fields: backendState.template.inputFieldList,
    };
  } catch (e) {
    return { error: e };
  }
}

async function loadPersistentState() {
  const templatePath = persistentState.get("templatePath");
  if (templatePath) {
    const result = await loadTemplate(templatePath);
    if (result.error) {
      persistentState.delete("templatePath");
      backendState.template = null;
    }
    return result;
  }
  return null;
}

async function openTemplate() {
  const result = await dialog.showOpenDialog(remote, {
    properties: ["openFile"],
    message: "Choose a template",
    filters: { name: "Document Templates", extensions: ["doctemplate"] },
  });
  if (!result || result.canceled || result.filePaths.length !== 1) {
    return null;
  }
  const filename = result.filePaths[0];
  try {
    await loadTemplate(filename);
    persistentState.set("templatePath", filename);
    return {
      name: backendState.template.name,
      fields: backendState.template.inputFieldList,
    };
  } catch (e) {
    return { error: e };
  }
}

function setupIPC() {
  ipcMain.handle("load-template", async (_event) => {
    return openTemplate();
  });

  ipcMain.handle("evaluate-template", async (_event, values) => {
    const result = { evaluated: null, documents: null };
    result.evaluated = backendState.template.evaluate(values);
    if (result.evaluated.errorCount === 0) {
      let outDir = await dialog.showOpenDialog(remote, {
        properties: ["openDirectory"],
        message: "Output folder:",
      });
      if (!outDir || outDir.canceled || outDir.filePaths.length !== 1) {
        return null;
      }
      outDir = outDir.filePaths[0];
      result.documents = backendState.template.generateDocuments(
        result.evaluated.fields,
        outDir
      );
    }
    return result;
  });

  ipcMain.handle("open-path", async (_event, path) => {
    return shell.openPath(path);
  });
}

async function startRenderer() {
  async function start() {
    const win = new electron.BrowserWindow({
      width: 515,
      height: 600,
      minWidth: 515,
      minHeight: 400,
      webPreferences: {
        contextIsolation: true,
        preload: path.join(app.getAppPath(), "client", "preload.js"),
      },
    });

    const menuTemplate = [
      { role: "appMenu" },
      {
        label: "File",
        submenu: [
          {
            label: "New",
            accelerator: "CmdOrCtrl+N",
            enabled: false,
            click: () => {
              // TODO prompt to save if not saved
              // TODO clear form
            },
          },
          { type: "separator" },
          {
            label: "Open…",
            accelerator: "CmdOrCtrl+O",
            enabled: false,
            click: () => {
              // TODO show open dialog
              // TODO validate that fields match template
              // TODO set current save file, update fields in frontend
            },
          },
          {
            label: "Open Template…",
            accelerator: "Shift+CmdOrCtrl+O",
            click: () => {
              openTemplate()
                .then((result) =>
                  win.webContents.send("template-loaded", result)
                )
                .catch((e) =>
                  win.webContents.send("template-loaded", { error: e })
                );
            },
          },
          { type: "separator" },
          {
            label: "Save…", // TODO only show ellipsis if no filename
            accelerator: "CmdOrCtrl+S",
            enabled: false,
            click: () => {
              // TODO show save as dialog if no filename
              // TODO write file
            },
          },
          {
            label: "Save As…",
            accelerator: "Shift+CmdOrCtrl+S",
            enabled: false,
            click: () => {
              // TODO show save as dialog
              // TODO write file
            },
          },
          { type: "separator" },
          process.platform === "darwin" ? { role: "close" } : { role: "quit" }, // TODO save on close? is there an event to listen for?
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ];
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    win
      .loadFile(path.join(app.getAppPath(), "client", "index.html"))
      .then(async (_) => {
        const result = await loadPersistentState();
        if (result) {
          win.webContents.send("template-loaded", result);
        }
      });
  }

  app.on("window-all-closed", () => {
    app.quit();
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
