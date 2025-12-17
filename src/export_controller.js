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
        // -----------------------------------------------------
        // Validation (unchanged)
        // -----------------------------------------------------
        if (!AppState.detectedCols) {
            alert("No detected column mapping.");
            return;
        }

        if (!AppState.originalRaw || !AppState.originalRaw.length) {
            alert("No raw data loaded.");
            return;
        }

        if (!AppState.T || !AppState.T.length) {
            alert("No time vector loaded.");
            return;
        }

        if (!AppState.selections || AppState.selections.length === 0) {
            alert("No segments selected.");
            return;
        }

        // -----------------------------------------------------
        // Build export payload (unchanged)
        // -----------------------------------------------------
        const rows = extractRowsForExport(
            AppState.originalRaw,
            AppState.selections,
            AppState.T
        );

        if (!rows.length) {
            alert("Export produced no rows (selection/data mismatch).");
            return;
        }

        const txt = buildExportJSON(rows);

        // -----------------------------------------------------
        // Resolve export policy
        // -----------------------------------------------------
        const cfg = AppState.exportConfig ?? { mode: "manual" };

        const base =
            AppState.originalFileName
                ? AppState.originalFileName.replace(/\.[^.]+$/, "")
                : "export";

        const outName = `${base}_segmented.json`;

        // -----------------------------------------------------
        // MANUAL MODE (existing behavior)
        // -----------------------------------------------------
        if (cfg.mode === "manual") {

            const blob = new Blob([txt], { type: "application/json" });
            const url  = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = outName;
            a.click();

            URL.revokeObjectURL(url);
            return;
        }

        // -----------------------------------------------------
        // AUTOMATIC MODES (relative / fixed)
        // -----------------------------------------------------
        let exportDir = null;

        // FIXED: exactly what the user chose
        if (cfg.mode === "fixed") {
            exportDir = cfg.fixedPath;
            if (!exportDir) {
                alert("No fixed export folder selected.");
                return;
            }
        }

        // RELATIVE: <load-location>/Segmented
        if (cfg.mode === "relative") {

            if (!AppState.originalFilePath) {
                alert("Missing source file path for export.");
                return;
            }

            // Folder containing the currently loaded file
            const loadDir =
                window.electronAPI.dirname(AppState.originalFilePath);

            exportDir =
                window.electronAPI.join(loadDir, "Segmented");
        }

        // -----------------------------------------------------
        // Write file (NO prompt)
        // -----------------------------------------------------
        try {
            window.electronAPI.mkdir(exportDir, { recursive: true });
            const outPath = window.electronAPI.join(exportDir, outName);
            window.electronAPI.writeFile(outPath, txt);
        } catch (err) {
            console.error(err);
            alert("Failed to write export file.");
            return;
        }
    }

    return { exportData };
}
