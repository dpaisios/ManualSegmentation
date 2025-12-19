// -------------------------------------------------------------
// lifecycle_controller.js
// Handles application lifecycle:
// - file / folder loading
// - session resets
// - tempdata startup
// -------------------------------------------------------------

import { parseData } from "./parse_data.js";
import { showFormatSelectionModal } from "./ui_format_modal.js";
import { resetLoaderState } from "./load_data.js";
import { scanExportsForFolderSession } from "./export_scan.js";
import { importSelectionsFromSegmentedExport } from "./import_segmented.js";

export function attachLifecycleController({
    AppState,

    loadData,
    settingsOptions,

    setTitle,
    renderers
}) {

    // =========================================================
    // RESET HELPERS
    // =========================================================

    // Resets selection-related state ONLY (between files)
    function resetSelectionState() {
        AppState.selections = [];
        AppState.selectionsVersion = 0;
        AppState.dataLoaded = false;
        resetLoaderState();
    }

    // Resets the entire session (between file / folder loads)
    function resetSessionState() {
        AppState.fileList = null;                 // file mode invariant
        AppState.fileIndex = -1;
        AppState.exportTracker = {};
        AppState.lastExportedVersionByFile = {};
        AppState.originalFilePath = null;
        AppState.exportPath = null;
        resetSelectionState();
    }

    // =========================================================
    // FOLDER INSPECTION HELPERS
    // =========================================================

    const ACCEPTED_EXTS = ["json", "csv", "txt"];

    function getExtLower(name) {
        const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
        return m ? m[1] : "";
    }

    async function listFlatFiles(folderPath) {
        const names = window.electronAPI.listFiles(folderPath);
        const out = [];

        for (const name of names) {
            const full = window.electronAPI.join(folderPath, name);
            let stat;
            try {
                stat = await window.electronAPI.stat(full);
            } catch {
                continue;
            }
            if (stat?.isDirectory?.()) continue;

            out.push({ name, full, ext: getExtLower(name) });
        }
        return out;
    }

    function detectAcceptedFormats(entries) {
        const set = new Set();
        for (const e of entries) {
            if (ACCEPTED_EXTS.includes(e.ext)) set.add(e.ext);
        }
        return [...set].sort();
    }

    function countFormats(entries) {
        const counts = {};
        for (const e of entries) {
            counts[e.ext] = (counts[e.ext] ?? 0) + 1;
        }
        return counts;
    }

    // =========================================================
    // FOLDER SESSION: LOAD FILE BY INDEX
    // =========================================================

    async function loadFileAtIndex(idx) {
        if (!AppState.fileList) return;
        if (idx < 0 || idx >= AppState.fileList.length) return;

        const filePath = AppState.fileList[idx];
        const tracked = AppState.exportTracker?.[filePath] ?? null;

        // Unsaved selection guard
        const curPath = AppState.originalFilePath;
        const hasSelections = AppState.selections?.length > 0;
        const curTracked = curPath
            ? AppState.exportTracker?.[curPath] ?? null
            : null;

        const unexported =
            hasSelections &&
            AppState.lastExportedVersionByFile[curPath] !== AppState.selectionsVersion;

        if (unexported) {
            const ok = window.confirm(
                "You have unexported selections.\n" +
                "Loading another file will discard them.\n\n" +
                "Do you want to continue?"
            );
            if (!ok) return;
        }

        resetSelectionState();

        const txt = await window.electronAPI.readFile(filePath);
        const rows = parseData(txt, filePath);

        loadData(rows, null, null, settingsOptions);

        // Auto-import segmented export
        if (tracked?.exportPath) {
            try {
                const imported = await importSelectionsFromSegmentedExport({
                    exportPath: tracked.exportPath,
                    baseT: AppState.T
                });

                AppState.selections = imported;
                AppState.selectionsVersion = 0;
                AppState.lastExportedVersionByFile[filePath] = 0;
            } catch (err) {
                console.error("Failed to import segmented export:", err);
            }
        }

        AppState.fileIndex = idx;
        AppState.originalFileName = filePath.split(/[/\\]/).pop();
        AppState.originalFilePath = filePath;
        AppState.dataLoaded = true;

        setTitle(AppState.originalFileName);
        renderers.redrawAll();
    }

    // =========================================================
    // TEMPDATA MODE
    // =========================================================

    async function loadNewestFileInFolder(folderPath, params) {
        const files = window.electronAPI.listJson(folderPath);
        if (!files.length) return;

        let newest = null;
        let newestTime = -Infinity;

        for (const f of files) {
            const full = window.electronAPI.join(folderPath, f);
            const stat = await window.electronAPI.stat(full);
            if (stat.ctimeMs > newestTime) {
                newestTime = stat.ctimeMs;
                newest = full;
            }
        }

        if (!newest) return;

        resetSessionState();

        const txt = await window.electronAPI.readFile(newest);
        const rows = parseData(txt, newest);

        loadData(
            rows,
            params?.col_names ?? null,
            params?.export_path ?? null,
            settingsOptions
        );

        AppState.exportPath = params?.export_path ?? null;

        AppState.originalFileName = newest.split(/[/\\]/).pop();
        AppState.originalFilePath = newest;
        AppState.dataLoaded = true;

        setTitle(AppState.originalFileName);
        renderers.redrawAll();
    }

    // =========================================================
    // ENTRY POINT: LOAD FILE OR FOLDER
    // =========================================================

    async function loadFromPath(path, params = {}) {
        if (!path) return;

        if (params.reset) {
            resetSessionState();
        }

        const isDir = window.electronAPI.isDirectory(path);

        // -----------------------------------------------------
        // FOLDER MODE
        // -----------------------------------------------------
        if (isDir) {

            if (params.mode === "tempdata") {
                await loadNewestFileInFolder(path, params);
                return;
            }

            const entries = await listFlatFiles(path);
            const formats = detectAcceptedFormats(entries);

            if (!formats.length) {
                alert("No supported data files found (json, csv, txt).");
                return;
            }

            let chosenExts;

            if (formats.length === 1) {
                chosenExts = [formats[0]];
            } else {
                const counts = countFormats(
                    entries.filter(e => formats.includes(e.ext))
                );
                chosenExts = await showFormatSelectionModal(counts);
                if (!chosenExts) return;
            }

            const files = entries
                .filter(e => chosenExts.includes(e.ext))
                .map(e => e.full)
                .sort();

            if (!files.length) {
                alert("No files matched the selected format(s).");
                return;
            }

            AppState.fileList = files;
            AppState.fileIndex = 0;
            AppState.exportTracker = {};
            AppState.lastExportedVersionByFile = {};

            await scanExportsForFolderSession({
                AppState,
                dataFilesAbs: files,
                dataFolderAbs: path
            });

            await loadFileAtIndex(0);
            return;
        }

        // -----------------------------------------------------
        // FILE MODE
        // -----------------------------------------------------
        resetSessionState();

        const txt = await window.electronAPI.readFile(path);
        const rows = parseData(txt, path);

        loadData(
            rows,
            params?.col_names ?? null,
            params?.export_path ?? null,
            settingsOptions
        );

        AppState.exportPath = params?.export_path ?? null;

        AppState.originalFileName = path.split(/[/\\]/).pop();
        AppState.originalFilePath = path;
        AppState.dataLoaded = true;

        setTitle(AppState.originalFileName);
        renderers.redrawAll();
    }

    // =========================================================
    // ELECTRON IPC
    // =========================================================

    function attachElectronListener() {
        window.electronAPI.onDataFile(({ folder, params }) => {
            loadFromPath(folder, params);
        });
    }

    // =========================================================
    // NAVIGATION API
    // =========================================================

    function nextFile() {
        if (!AppState.fileList) return;
        loadFileAtIndex(AppState.fileIndex + 1);
    }

    function prevFile() {
        if (!AppState.fileList) return;
        loadFileAtIndex(AppState.fileIndex - 1);
    }

    // =========================================================
    // PUBLIC API
    // =========================================================

    return {
        attachElectronListener,
        loadFileAtIndex,
        nextFile,
        prevFile
    };
}
