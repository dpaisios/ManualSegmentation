// -------------------------------------------------------------
// export_data.js
// Pure export logic: ORIGINAL rows + correct ManSegID assignment
// -------------------------------------------------------------

export function extractRowsForExport(originalRaw, selections, T, rowIds, rowIdColName) {
    if (!originalRaw?.length) return [];
    if (!selections?.length) return [];
    if (!T?.length) return [];
    if (!rowIds?.length) return [];
    if (!rowIdColName) return [];

    // Build stable lookup: RowID -> raw row
    const byId = new Map();
    for (const r of originalRaw) {
        const id = r?.[rowIdColName];
        if (id == null) continue;
        const key = String(id);
        if (!byId.has(key)) byId.set(key, r);
    }

    const out = [];

    // sort selections for stable IDs
    const ordered = [...selections].sort((a, b) => a.t0 - b.t0);

    for (let i = 0; i < T.length; i++) {
        const t = T[i];

        for (let s = 0; s < ordered.length; s++) {
            const sel = ordered[s];

            if (t >= sel.t0 && t <= sel.t1) {

                const rid = String(rowIds[i]);
                const rawRow = byId.get(rid);
                
                if (!rawRow) break;

                const row = { ...rawRow };

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
