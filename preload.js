// -------------------------------------------------------------
// preload.js
// Secure bridge between renderer and Node/Electron APIs
// -------------------------------------------------------------

const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

contextBridge.exposeInMainWorld("electronAPI", {

    // ---------------------------------------------------------
    // File system helpers
    // ---------------------------------------------------------

    readFile: (filePath) =>
        fs.promises.readFile(filePath, "utf8"),

    exists: (p) =>
        fs.existsSync(p),

    isDirectory: (p) =>
        fs.existsSync(p) && fs.lstatSync(p).isDirectory(),

    // Legacy (tempdata mode)
    listJson: (folder) =>
        fs.readdirSync(folder).filter(f =>
            f.toLowerCase().endsWith(".json")
        ),

    listFiles: (folder) =>
        fs.readdirSync(folder),

    listFilesWithExtensions: (folder, extensions) =>
        fs.readdirSync(folder).filter(f => {
            const ext = path.extname(f).slice(1).toLowerCase();
            return extensions.includes(ext);
        }),

    join: (...parts) =>
        path.join(...parts),

    dirname: (p) =>
        path.dirname(p),

    mkdir: (dirPath, opts = { recursive: true }) =>
        fs.mkdirSync(dirPath, opts),

    writeFile: (filePath, data) =>
        fs.writeFileSync(filePath, data),

    deleteFile: (filePath) => {
        try {
            fs.unlinkSync(filePath);
            return true;
        } catch (err) {
            console.error("deleteFile failed:", err);
            return false;
        }
    },

    // ---------------------------------------------------------
    // Stats via main
    // ---------------------------------------------------------

    stat: (filePath) =>
        ipcRenderer.invoke("fs-stat", filePath),

    // ---------------------------------------------------------
    // Dialogs
    // ---------------------------------------------------------

    openFileDialog: () =>
        ipcRenderer.invoke("open-file-dialog"),

    openFolderDialog: () =>
        ipcRenderer.invoke("open-folder-dialog"),

    saveFileDialog: (options) =>
        ipcRenderer.invoke("save-file-dialog", options),

    selectFolderFormats: (formats) =>
        ipcRenderer.invoke("select-folder-formats", formats),

    // ---------------------------------------------------------
    // IPC: programmatic loading
    // ---------------------------------------------------------

    onDataFile: (callback) =>
        ipcRenderer.on("startup-data-file", (_, payload) => callback(payload)),

    emitDataFile: (payload) =>
        ipcRenderer.send("startup-data-file", payload),
});
