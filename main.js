process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

// -------------------------------------------------------------
// Default data folder = tempdata next to the EXE
// -------------------------------------------------------------
const exeDir = path.dirname(process.execPath);
const tempDataDir = path.join(exeDir, "tempdata");

// -------------------------------------------------------------
// Ensure tempdata exists
// -------------------------------------------------------------
if (!fs.existsSync(tempDataDir)) {
    try {
        fs.mkdirSync(tempDataDir, { recursive: true });
    } catch (err) {
        console.error("Failed to create tempdata:", err);
    }
}

// -------------------------------------------------------------
// OPTIONAL PARAMETERS FROM MATLAB
// Usage:
//   --col_names=col1,col2,col3
//   --export_path=C:/folder/file.json
// -------------------------------------------------------------
let launchParams = {
    col_names: null,
    export_path: null
};

for (const arg of process.argv.slice(1)) {

    if (arg.startsWith("--col_names=")) {
        const raw = arg.replace("--col_names=", "");
        launchParams.col_names = raw
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
    }

    if (arg.startsWith("--export_path=")) {
        launchParams.export_path = arg.replace("--export_path=", "");
    }
}

// -------------------------------------------------------------
// Clear contents of tempdata on exit
// -------------------------------------------------------------
function cleanTempData() {
    if (!fs.existsSync(tempDataDir)) return;

    for (const f of fs.readdirSync(tempDataDir)) {
        const full = path.join(tempDataDir, f);
        try {
            fs.rmSync(full, { recursive: true, force: true });
        } catch (err) {
            console.error("Failed to delete", full, err);
        }
    }
}

// -------------------------------------------------------------
// IPC: File dialog
// -------------------------------------------------------------
ipcMain.handle("open-file-dialog", async () => {
    return await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{
            name: "Data Files",
            extensions: ["json", "csv", "txt"]
        }]
    });
});

// -------------------------------------------------------------
// IPC: Folder dialog
// -------------------------------------------------------------
ipcMain.handle("open-folder-dialog", async () => {
    return await dialog.showOpenDialog({
        properties: ["openDirectory"]
    });
});

// -------------------------------------------------------------
// IPC: folder format selection dialog
// -------------------------------------------------------------
ipcMain.handle("select-folder-formats", async (_, formats) => {
    const buttons = [
        "All accepted formats",
        ...formats.map(f => `Only ${f.toUpperCase()}`),
        "Cancel"
    ];

    const result = await dialog.showMessageBox({
        type: "question",
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1,
        title: "Select data format",
        message: "Multiple data formats were found in this folder.",
        detail: "Choose which files you want to load:"
    });

    return result.response; // index of button
});

// -------------------------------------------------------------
// IPC: fs.stat (safe)
// -------------------------------------------------------------
ipcMain.handle("fs-stat", (_, filePath) => {
    return fs.statSync(filePath);
});

// -------------------------------------------------------------
// IPC: LOOPBACK for renderer-triggered loads
// renderer -> main -> renderer
// -------------------------------------------------------------
ipcMain.on("startup-data-file", (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    win.webContents.send("startup-data-file", payload);
});

// -------------------------------------------------------------
// Create window
// -------------------------------------------------------------
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-webrtc");

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 643,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: false,
            allowRunningInsecureContent: true
        }
    });

    win.once("ready-to-show", () => win.show());

    win.loadFile("index.html");

    // ---------------------------------------------------------
    // Startup: tempdata folder (programmatic mode)
    // ---------------------------------------------------------
    win.webContents.on("did-finish-load", () => {
        win.webContents.send("startup-data-file", {
            folder: tempDataDir,
            params: {
                ...launchParams,
                mode: "tempdata"
            }
        });
    });
}

// -------------------------------------------------------------
// App lifecycle
// -------------------------------------------------------------
app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("before-quit", cleanTempData);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
