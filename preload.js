const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

contextBridge.exposeInMainWorld("electronAPI", {

    // ---------------------------------------------------------
    // File system helpers
    // ---------------------------------------------------------
    readFile: (filePath) => fs.promises.readFile(filePath, "utf8"),

    exists: (p) => fs.existsSync(p),
    isDirectory: (p) => fs.existsSync(p) && fs.lstatSync(p).isDirectory(),

    // Legacy (still used for tempdata mode)
    listJson: (folder) =>
        fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith(".json")),

    // Generic file listing (non-recursive)
    listFiles: (folder, extensions) =>
        fs.readdirSync(folder).filter(f => {
            if (!extensions || extensions.length === 0) return true;
            const ext = path.extname(f).slice(1).toLowerCase();
            return extensions.includes(ext);
        }),

    join: (...parts) => path.join(...parts),

    dirname: (p) => path.dirname(p),

    mkdir: (dirPath, opts = { recursive: true }) => fs.mkdirSync(dirPath, opts),

    writeFile: (filePath, data) => fs.writeFileSync(filePath, data),

    // ---------------------------------------------------------
    // Stats via main (safe)
    // ---------------------------------------------------------
    stat: (filePath) => ipcRenderer.invoke("fs-stat", filePath),

    // ---------------------------------------------------------
    // Delete export in folder
    // ---------------------------------------------------------
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
    // Dialogs
    // ---------------------------------------------------------
    openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
    openFolderDialog: () => ipcRenderer.invoke("open-folder-dialog"),

    // NEW: folder format selection dialog
    selectFolderFormats: (formats) =>
        ipcRenderer.invoke("select-folder-formats", formats),

    // ---------------------------------------------------------
    // IPC: startup / programmatic loading
    // ---------------------------------------------------------
    onDataFile: (callback) =>
        ipcRenderer.on("startup-data-file", (_, payload) => callback(payload)),

    emitDataFile: (payload) => {
        console.log("[PRELOAD] emitDataFile", payload);
        ipcRenderer.send("startup-data-file", payload);
    }

});
