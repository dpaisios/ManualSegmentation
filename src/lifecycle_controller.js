// -------------------------------------------------------------
// lifecycle_controller.js
// Handles data/session loading and overlay logic
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

    showOverlay,
    hideOverlay,
    setTitle,

    renderers
}) {

    // ---------------------------------------------------------
    // HARD RESET BETWEEN FILES (CRITICAL)
    // ---------------------------------------------------------
    function resetForNewFile() {
        AppState.selections = [];
        AppState.dataLoaded = false;
        AppState.selectionsVersion = 0;
        resetLoaderState();
    }

    // ---------------------------------------------------------
    // Folder inspection helpers
    // ---------------------------------------------------------
    const ACCEPTED_EXTS = ["json", "csv", "txt"];

    function countFormats(entries) {
        const counts = {};
        for (const e of entries) {
            counts[e.ext] = (counts[e.ext] ?? 0) + 1;
        }
        return counts;
    }

    function getExtLower(name) {
        const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
        return m ? m[1] : "";
    }

    async function listFlatFiles(folder) {
        const names = window.electronAPI.listFiles(folder);
        const out = [];

        for (const name of names) {
            const full = window.electronAPI.join(folder, name);

            let stat;
            try {
                stat = await window.electronAPI.stat(full);
            } catch {
                continue;
            }

            if (stat?.isDirectory?.()) continue;

            out.push({
                name,
                full,
                ext: getExtLower(name)
            });
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

    // ---------------------------------------------------------
    // LOAD FILE BY INDEX (FOLDER SESSION MODE)
    // ---------------------------------------------------------
    async function loadFileAtIndex(idx, opts = {}) {
        if (!AppState.fileList) return;

        // Ignore reload of current file unless import is explicitly requested
        if (
            AppState.dataLoaded &&
            idx === AppState.fileIndex &&
            !opts?.hasSegmentedExport
        ) {
            return;
        }

        if (idx < 0 || idx >= AppState.fileList.length) return;

        // --- UNSAVED SELECTION GUARD (EXPORT-AWARE) ---
        const curPath = AppState.originalFilePath;

        const hasSelections =
            AppState.selections && AppState.selections.length > 0;

        const exportedInfo =
            curPath ? AppState.exportTracker?.[curPath] ?? null : null;

        const exportedCount =
            exportedInfo ? exportedInfo.exportCount : null;

        const currentCount =
            AppState.selections?.length ?? 0;

        const unexported =
            hasSelections &&
            (
                exportedInfo === null ||
                exportedCount !== currentCount
            );

        if (unexported) {
            const ok = window.confirm(
                "You have unexported selections.\n" +
                "Loading another file will discard them.\n\n" +
                "Do you want to continue?"
            );
            if (!ok) return;
        }

        // -------------------------------------------------
        // HARD RESET
        // -------------------------------------------------
        resetForNewFile();

        const filePath = AppState.fileList[idx];
        const txt  = await window.electronAPI.readFile(filePath);
        const rows = parseData(txt, filePath);

        // Canonical raw load (this defines AppState.T, X, Y, etc.)
        loadData(rows, null, null, settingsOptions);

        // -------------------------------------------------
        // AUTO-IMPORT FROM SEGMENTED EXPORT (TIME-BASED)
        // -------------------------------------------------
        const tracked = AppState.exportTracker?.[filePath] ?? null;

        const shouldImport =
            opts.hasSegmentedExport ||
            (
                tracked?.exportPath &&
                (!AppState.selections || AppState.selections.length === 0)
            );

        if (shouldImport && tracked?.exportPath) {
            try {
                
                console.log(
                    "IMPORT CHECK",
                    "timeColIndex =", AppState.timeColIndex,
                    "timeColName =", AppState.timeColName,
                    "file =", filePath
                );

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

        // -------------------------------------------------
        // FINALIZE STATE
        // -------------------------------------------------
        AppState.fileIndex = idx;
        AppState.originalFileName = filePath.split(/[/\\]/).pop();
        AppState.originalFilePath = filePath;
        AppState.dataLoaded = true;

        setTitle(AppState.originalFileName);
        hideOverlay();
        renderers.redrawAll();
    }

    // ---------------------------------------------------------
    // LOAD NEWEST FILE IN FOLDER (TEMPDATA MODE)
    // ---------------------------------------------------------
    async function loadNewestFileInFolder(folder, params) {
        const files = window.electronAPI.listJson(folder);

        console.log("[TEMPDATA] listJson →", files);

        if (!files.length) {
            console.warn("[TEMPDATA] no json files found");
            showOverlay();
            return;
        }

        let newestPath = null;
        let newestTime = -Infinity;

        for (const f of files) {
            const full = window.electronAPI.join(folder, f);
            const stat = await window.electronAPI.stat(full);
            if (stat.ctimeMs > newestTime) {
                newestTime = stat.ctimeMs;
                newestPath = full;
            }
        }

        if (!newestPath) {
            showOverlay();
            return;
        }

        console.log("[TEMPDATA] loading newest =", newestPath);

        resetForNewFile();

        const txt = await window.electronAPI.readFile(newestPath);
        const rows = parseData(txt, newestPath);

        loadData(
            rows,
            params?.col_names ?? null,
            params?.export_path ?? null,
            settingsOptions
        );

        AppState.originalFileName = newestPath.split(/[/\\]/).pop();
        AppState.originalFilePath = newestPath;
        AppState.fileList = null;
        AppState.fileIndex = -1;
        AppState.dataLoaded = true;

        setTitle(AppState.originalFileName);
        hideOverlay();
        renderers.redrawAll();
    }

    // ---------------------------------------------------------
    // LOAD ENTRY POINT (FILE OR FOLDER)
    // ---------------------------------------------------------
    async function loadFromPath(folder, params = {}) {
        console.log(
            "[LIFECYCLE] loadFromPath",
            "folder =", folder,
            "params =", params
        );

        if (!folder) {
            console.log("[LIFECYCLE] no folder → showOverlay");
            showOverlay();
            return;
        }

        const isDir = window.electronAPI.isDirectory(folder);
        console.log("[LIFECYCLE] isDirectory =", isDir);

        // -----------------------------------------------------
        // EXPLICIT RESET FOR NEW FOLDER SESSION
        // -----------------------------------------------------
        if (params.reset) {
            console.log("[LIFECYCLE] FULL SESSION RESET");

            AppState.fileList  = null;
            AppState.fileIndex = -1;

            AppState.exportTracker = {};
            AppState.lastExportedVersionByFile = {};

            // Prevent unsaved-selection guard
            AppState.selections = [];
            AppState.selectionsVersion = 0;
            AppState.dataLoaded = false;

            resetLoaderState();
        }

        // -----------------------------------------------------
        // FOLDER MODE
        // -----------------------------------------------------
        if (isDir) {

            if (params.mode === "tempdata") {
                console.log("[LIFECYCLE] entering TEMPDATA mode");
                await loadNewestFileInFolder(folder, params);
                return;
            }

            console.log("[LIFECYCLE] entering FOLDER-SESSION mode");

            const entries = await listFlatFiles(folder);
            console.log("[LIFECYCLE] listFlatFiles →", entries.length);

            const formats = detectAcceptedFormats(entries);
            console.log("[LIFECYCLE] detected formats →", formats);

            if (!formats.length) {
                console.warn("[LIFECYCLE] no accepted formats found");
                alert("No supported data files found (json, csv, txt).");
                showOverlay();
                return;
            }

            let chosenExts;

            if (formats.length === 1) {
                chosenExts = [formats[0]];
            } else {
                const formatCounts = countFormats(
                    entries.filter(e => formats.includes(e.ext))
                );

                chosenExts = await showFormatSelectionModal(formatCounts);
                if (!chosenExts) {
                    console.warn("[LIFECYCLE] format selection cancelled");
                    showOverlay();
                    return;
                }
            }

            const files = entries
                .filter(e => chosenExts.includes(e.ext))
                .map(e => e.full)
                .sort();

            console.log("[LIFECYCLE] files selected →", files.length);

            if (!files.length) {
                alert("No files matched the selected format(s).");
                showOverlay();
                return;
            }

            AppState.exportTracker = {};
            AppState.lastExportedVersionByFile = {};
            AppState.fileList  = files;
            AppState.fileIndex = 0;

            console.log(
                "[LIFECYCLE] starting folder session",
                "fileList.length =", files.length
            );

            await scanExportsForFolderSession({
                AppState,
                dataFilesAbs: AppState.fileList,
                dataFolderAbs: folder
            });

            await loadFileAtIndex(0);
            return;
        }

        // -----------------------------------------------------
        // FILE MODE
        // -----------------------------------------------------
        console.log("[LIFECYCLE] entering FILE mode");

        resetForNewFile();

        const txt  = await window.electronAPI.readFile(folder);
        const rows = parseData(txt, folder);

        loadData(
            rows,
            params?.col_names ?? null,
            params?.export_path ?? null,
            settingsOptions
        );

        const fileName = folder.split(/[/\\]/).pop();

        AppState.originalFileName = fileName;
        AppState.originalFilePath = folder;
        AppState.fileList  = null;
        AppState.fileIndex = -1;
        AppState.dataLoaded = true;

        setTitle(fileName);
        hideOverlay();
        renderers.redrawAll();
    }

    // ---------------------------------------------------------
    // ELECTRON IPC ENTRY
    // ---------------------------------------------------------
    function attachElectronListener() {
        window.electronAPI.onDataFile(({ folder, params }) => {
            console.log(
                "[LIFECYCLE] onDataFile received",
                "folder =", folder,
                "params =", params
            );
            loadFromPath(folder, params);
        });
    }

    // ---------------------------------------------------------
    // MANUAL "OPEN FILE" BUTTON
    // ---------------------------------------------------------
    function attachManualOpen(buttonEl, exportPathOverrideGlobal) {
        buttonEl.addEventListener("click", async () => {
            const res = await window.electronAPI.openFileDialog();
            if (res.canceled) return;

            const filePath = res.filePaths[0];

            resetForNewFile();

            const raw = await window.electronAPI.readFile(filePath);
            const rows = parseData(raw, filePath);

            loadData(rows, null, exportPathOverrideGlobal, settingsOptions);

            const fileName = filePath.split(/[/\\]/).pop();

            AppState.originalFileName = fileName;
            AppState.originalFilePath = filePath;
            AppState.fileList = null;
            AppState.fileIndex = -1;
            AppState.dataLoaded = true;

            setTitle(fileName);
            hideOverlay();
            renderers.redrawAll();
        });
    }

    // ---------------------------------------------------------
    // NAVIGATION API (PREV / NEXT)
    // ---------------------------------------------------------
    function nextFile() {
        if (!AppState.fileList) return;
        loadFileAtIndex(AppState.fileIndex + 1);
    }

    function prevFile() {
        if (!AppState.fileList) return;
        loadFileAtIndex(AppState.fileIndex - 1);
    }

    // ---------------------------------------------------------
    // PUBLIC API
    // ---------------------------------------------------------
    return {
        attachElectronListener,
        attachManualOpen,
        prevFile,
        nextFile,
        loadFileAtIndex
    };
}
