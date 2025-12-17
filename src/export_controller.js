// -------------------------------------------------------------
// export_controller.js
// Handles export logic only (reads from AppState)
// -------------------------------------------------------------

export function createExportController({
    AppState,
    extractRowsForExport,
    buildExportJSON
}) {
    async function exportData() {

        if (!AppState.detectedCols) {
            alert("No detected column mapping.");
            return false;
        }

        if (!AppState.originalRaw || !AppState.originalRaw.length) {
            alert("No raw data loaded.");
            return false;
        }

        if (!AppState.T || !AppState.T.length) {
            alert("No time vector loaded.");
            return false;
        }

        if (!AppState.selections || AppState.selections.length === 0) {
            alert("No segments selected.");
            return false;
        }

        const rows = extractRowsForExport(
            AppState.originalRaw,
            AppState.selections,
            AppState.T
        );

        if (!rows.length) {
            alert("Export produced no rows.");
            return false;
        }

        const txt = buildExportJSON(rows);

        const cfg = AppState.exportConfig ?? { mode: "manual" };

        const base =
            AppState.originalFileName
                ? AppState.originalFileName.replace(/\.[^.]+$/, "")
                : "export";

        const outName = `${base}_segmented.json`;

        // -------------------------------------------------
        // MANUAL MODE
        // -------------------------------------------------
        if (cfg.mode === "manual") {
            const blob = new Blob([txt], { type: "application/json" });
            const url  = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = outName;
            a.click();

            URL.revokeObjectURL(url);

            // Manual mode has no stable path → do not set exportPath
            recordSuccessfulExport(null);
            return true;
        }

        // -------------------------------------------------
        // AUTOMATIC MODES
        // -------------------------------------------------
        let exportDir = null;

        if (cfg.mode === "fixed") {
            exportDir = cfg.fixedPath;
            if (!exportDir) {
                alert("No fixed export folder selected.");
                return false;
            }
        }

        if (cfg.mode === "relative") {
            if (!AppState.originalFilePath) {
                alert("Missing source file path.");
                return false;
            }

            const loadDir =
                window.electronAPI.dirname(AppState.originalFilePath);

            exportDir =
                window.electronAPI.join(loadDir, "Segmented");
        }

        try {
            window.electronAPI.mkdir(exportDir, { recursive: true });

            const outPath =
                window.electronAPI.join(exportDir, outName);

            window.electronAPI.writeFile(outPath, txt);

            recordSuccessfulExport(outPath);
            return true;
        } catch (err) {
            console.error(err);
            alert("Failed to write export file.");
            return false;
        }
    }

    // -------------------------------------------------
    // INTERNAL helper
    // -------------------------------------------------
    function recordSuccessfulExport(exportPath) {
        const path = AppState.originalFilePath;
        if (!path) return;

        AppState.exportTracker[path] = {
            exportCount: AppState.selections.length,
            exportedAt: Date.now(),
            exportPath // <-- CRITICAL for in-session import
        };

        AppState.lastExportedVersionByFile[path] =
            AppState.selectionsVersion;
    }

    return { exportData };
}
