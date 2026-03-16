// -------------------------------------------------------------
// export_data.js
// Pure export logic: ORIGINAL rows + correct ManSegID assignment
// Uses ManSeg_rowID as the ONLY stable row identity key.
// -------------------------------------------------------------

export function extractRowsForExport(originalRaw, selections, T, rowIds, rowIdColName) {
    if (!originalRaw?.length) return [];
    if (!selections?.length) return [];
    if (!T?.length) return [];
    if (!rowIds?.length) return [];

    const ROWID_KEY = rowIdColName || "ManSeg_rowID";

    // Build stable lookup: ManSeg_rowID -> raw row
    const byId = new Map();
    for (const r of originalRaw) {
        const id = r?.[ROWID_KEY];
        if (id == null) continue;
        const key = String(id);
        if (!byId.has(key)) byId.set(key, r);
    }

    const out = [];

    // sort selections by index bounds for stable IDs
    const ordered = [...selections].sort((a, b) => {
        const a0 = Number.isFinite(a.i0) ? a.i0 : 0;
        const b0 = Number.isFinite(b.i0) ? b.i0 : 0;
        return a0 - b0;
    });

    for (let i = 0; i < T.length; i++) {
        for (let s = 0; s < ordered.length; s++) {
            const sel = ordered[s];

            if (!Number.isFinite(sel.i0) || !Number.isFinite(sel.i1)) continue;

            const i0 = Math.min(sel.i0, sel.i1);
            const i1 = Math.max(sel.i0, sel.i1);

            if (i >= i0 && i <= i1) {
                const rid = String(rowIds[i]);
                const rawRow = byId.get(rid);

                // If we can't resolve the raw row by ManSeg_rowID, do NOT fall back to indices.
                if (!rawRow) break;

                const row = { ...rawRow };

                // Ensure exported JSON always contains the stable ID
                row[ROWID_KEY] = rid;

                // assign selection metadata
                row.ManSegID = sel.id ?? `#${s + 1}`;
                row.Flag = sel.flagged ? 1 : 0;
                row.Comments = String(sel.comment ?? "");

                out.push(row);
                break;
            }
        }
    }

    return out;
}

export function buildExportJSON(rows) {
    return JSON.stringify(rows, null, 2);
}