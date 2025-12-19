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

        // -------------------------------------------------
        // Guards
        // -------------------------------------------------
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

        // -------------------------------------------------
        // Build export content
        // -------------------------------------------------
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

        const base =
            AppState.originalFileName
                ? AppState.originalFileName.replace(/\.[^.]+$/, "")
                : "export";

        const outName = `${base}_segmented.json`;

        // -------------------------------------------------
        // FILE MODE → Save As dialog
        // -------------------------------------------------
        if (!Array.isArray(AppState.fileList)) {

            const res = await window.electronAPI.saveFileDialog({
                defaultPath: outName,
                filters: [{ name: "JSON", extensions: ["json"] }]
            });

            if (res.canceled || !res.filePath) {
                return false;
            }

            try {
                window.electronAPI.writeFile(res.filePath, txt);
                recordSuccessfulExport(res.filePath);
                return true;
            } catch (err) {
                console.error(err);
                alert("Failed to write export file.");
                return false;
            }
        }

        // -------------------------------------------------
        // FOLDER MODE → always ./Segmented
        // -------------------------------------------------
        const dataFolder =
            window.electronAPI.dirname(AppState.originalFilePath);

        const exportDir =
            window.electronAPI.join(dataFolder, "Segmented");

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
            exportPath
        };

        AppState.lastExportedVersionByFile[path] =
            AppState.selectionsVersion;
    }

    return { exportData };
}
