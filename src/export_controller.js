// -------------------------------------------------------------
// export_controller.js
// Handles export logic only (reads from AppState)
// -------------------------------------------------------------

export function createExportController({
    AppState,
    extractRowsForExport,
    buildExportJSON
}) {
    function exportData() {

        // -----------------------------------------------------
        // Validation
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
        // Export (CORRECT, SINGLE-PASS LOGIC)
        // -----------------------------------------------------
        // IDs are assigned INSIDE extractRowsForExport
        let rows = extractRowsForExport(
            AppState.originalRaw,
            AppState.selections,
            AppState.T
        );

        if (!rows.length) {
            alert("Export produced no rows (selection/data mismatch).");
            return;
        }

        const txt = buildExportJSON(rows);

        const blob = new Blob([txt], { type: "application/json" });
        const url  = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        const base =
            AppState.originalFileName
                ? AppState.originalFileName.replace(/\.json$/i, "")
                : "export";

        a.download = `${base}_segmented.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    return { exportData };
}
