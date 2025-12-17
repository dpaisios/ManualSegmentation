// -------------------------------------------------------------
// lifecycle_controller.js
// Handles data/session loading and overlay logic
// -------------------------------------------------------------

import { parseData } from "./parse_data.js";
import { showFormatSelectionModal } from "./ui_format_modal.js";
import { resetLoaderState } from "./load_data.js";

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
        // App state
        AppState.selections = [];
        AppState.dataLoaded = false;

        // reset "dirty" tracker for the newly loaded file
        AppState.selectionsVersion = 0;

        // Loader module state (CRITICAL)
        resetLoaderState();
    }

    // ---------------------------------------------------------
    // Folder inspection helpers
    // ---------------------------------------------------------
    const ACCEPTED_EXTS = ["json", "csv", "txt"];

    function countFormats(entries) {
        const counts = {};
        for (const e of entries) {
            if (!counts[e.ext]) counts[e.ext] = 0;
            counts[e.ext]++;
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
            if (ACCEPTED_EXTS.includes(e.ext)) {
                set.add(e.ext);
            }
        }
        return [...set].sort();
    }

    // ---------------------------------------------------------
    // LOAD FILE BY INDEX (FOLDER SESSION MODE)
    // ---------------------------------------------------------
    async function loadFileAtIndex(idx) {
        if (!AppState.fileList) return;
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

        resetForNewFile();

        const filePath = AppState.fileList[idx];
        const txt  = await window.electronAPI.readFile(filePath);
        const rows = parseData(txt, filePath);

        loadData(rows, null, null, settingsOptions);

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
        if (!files.length) {
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
        if (!folder) {
            showOverlay();
            return;
        }

        // DIRECTORY MODE
        if (window.electronAPI.isDirectory(folder)) {

            // TEMPDATA MODE
            if (params.mode === "tempdata") {
                await loadNewestFileInFolder(folder, params);
                return;
            }

            // USER FOLDER SESSION
            const entries = await listFlatFiles(folder);
            const formats = detectAcceptedFormats(entries);

            if (!formats.length) {
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
                    showOverlay();
                    return;
                }
            }

            const files = entries
                .filter(e => chosenExts.includes(e.ext))
                .map(e => e.full)
                .sort();

            if (!files.length) {
                alert("No files matched the selected format(s).");
                showOverlay();
                return;
            }

            AppState.fileList = files;
            AppState.fileIndex = 0;

            await loadFileAtIndex(0);
            return;
        }

        // FILE MODE
        resetForNewFile();

        const txt = await window.electronAPI.readFile(folder);
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
        AppState.fileList = null;
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
