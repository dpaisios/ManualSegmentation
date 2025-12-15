// -------------------------------------------------------------
// export_data.js
// Pure export logic: ORIGINAL rows + correct ManSegID assignment
// -------------------------------------------------------------

export function extractRowsForExport(originalRaw, selections, T) {
    if (!originalRaw?.length) return [];
    if (!selections?.length) return [];

    const out = [];

    // sort selections for stable IDs
    const ordered = [...selections].sort((a, b) => a.t0 - b.t0);

    for (let i = 0; i < T.length; i++) {
        const t = T[i];

        for (let s = 0; s < ordered.length; s++) {
            const sel = ordered[s];

            if (t >= sel.t0 && t <= sel.t1) {

                const row = { ...originalRaw[i] };

                // assign ID immediately (CORRECT DOMAIN)
                row.ManSegID = sel.id ?? `#${s + 1}`;

                out.push(row);
                break;
            }
        }
    }

    return out;
}

// Backward-compatible no-op (kept so nothing breaks)
export function addSegID(rows) {
    return rows;
}

export function buildExportJSON(rows) {
    return JSON.stringify(rows, null, 2);
}
