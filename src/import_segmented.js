// -------------------------------------------------------------
// import_segmented.js
// Import selections from *_segmented.json
// PRIMARY: ManSeg_rowID (stable identity)
// FALLBACK: base-file time field
// ALSO imports: Flag, Comments
// -------------------------------------------------------------

import { AppState } from "./app_state.js";

const ROWID_KEY = "ManSeg_rowID";

function snapToT(T, t) {
    if (!T || !T.length || !Number.isFinite(t)) return t;

    if (t <= T[0]) return T[0];
    if (t >= T[T.length - 1]) return T[T.length - 1];

    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (T[mid] < t) lo = mid;
        else hi = mid;
    }

    return Math.abs(T[lo] - t) <= Math.abs(T[hi] - t)
        ? T[lo]
        : T[hi];
}

function nearestIndexInT(T, t) {
    if (!Array.isArray(T) || T.length === 0 || !Number.isFinite(t)) return null;

    if (t <= T[0]) return 0;
    if (t >= T[T.length - 1]) return T.length - 1;

    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (T[mid] < t) lo = mid;
        else hi = mid;
    }

    return Math.abs(T[lo] - t) <= Math.abs(T[hi] - t) ? lo : hi;
}

function makeImportedSelection({ id, i0, i1, T, flagged, comment }) {
    if (!Array.isArray(T) || !T.length) return null;
    if (!Number.isFinite(i0) || !Number.isFinite(i1)) return null;

    const a = Math.max(0, Math.min(i0, i1));
    const b = Math.min(T.length - 1, Math.max(i0, i1));
    if (b < a) return null;

    return {
        i0: a,
        i1: b,
        t0: T[a],
        t1: T[b],
        id,
        lockedID: true,
        bubbleAlpha: 0,
        flagged: !!flagged,
        comment: String(comment ?? "")
    };
}

function resolveTimeKey(rows) {
    // Preferred: whatever load_data persisted
    const k = AppState.timeColName;
    if (k && rows?.[0] && Object.prototype.hasOwnProperty.call(rows[0], k)) {
        return k;
    }

    // Fallbacks (common time names)
    const candidates = ["t", "T", "time", "Time", "Time_MS", "device_time"];
    const r0 = rows?.[0];
    if (r0 && typeof r0 === "object") {
        for (const c of candidates) {
            if (Object.prototype.hasOwnProperty.call(r0, c)) return c;
        }
    }

    return null;
}

function coerceFlag(v) {
    // Accept: 1/0, true/false, "1"/"0", "true"/"false"
    if (v == null) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v > 0;
    const s = String(v).trim().toLowerCase();
    if (s === "") return false;
    if (s === "true") return true;
    const n = Number(s);
    return Number.isFinite(n) ? n > 0 : false;
}

function coerceComment(v) {
    if (v == null) return "";
    const s = String(v);
    return s;
}

export async function importSelectionsFromSegmentedExport({
    exportPath,
    baseT
}) {
    if (!exportPath || !baseT || baseT.length === 0) return [];

    const txt = await window.electronAPI.readFile(exportPath);
    const rows = JSON.parse(txt);

    if (!Array.isArray(rows) || rows.length === 0) return [];

    // ---------------------------------------------------------
    // PRIMARY MODE: reconstruct selections by ManSeg_rowID
    // ---------------------------------------------------------
    const hasRowID = rows.some(r =>
        r &&
        typeof r === "object" &&
        r.ManSegID != null &&
        r[ROWID_KEY] != null &&
        String(r[ROWID_KEY]).trim() !== ""
    );

    if (hasRowID) {
        if (!Array.isArray(AppState.rowIds) || AppState.rowIds.length === 0) {
            console.error("[IMPORT] AppState.rowIds missing; cannot import by ManSeg_rowID.");
            return [];
        }
        if (!Array.isArray(AppState.T) || AppState.T.length === 0) {
            console.error("[IMPORT] AppState.T missing; cannot import by ManSeg_rowID.");
            return [];
        }
        if (AppState.rowIds.length !== AppState.T.length) {
            console.error("[IMPORT] rowIds length != T length; cannot import by ManSeg_rowID safely.");
            return [];
        }

        // Map ManSeg_rowID -> index in current processed vectors
        const idxByRowID = new Map();
        for (let i = 0; i < AppState.rowIds.length; i++) {
            const rid = AppState.rowIds[i];
            if (rid == null) continue;
            const key = String(rid);
            if (!idxByRowID.has(key)) idxByRowID.set(key, i);
        }

        // Group exported rows by ManSegID:
        // - rowIDs: Set
        // - flagged: any Flag truthy
        // - comment: first non-empty Comments
        const metaBySegID = new Map();

        for (const row of rows) {
            if (!row || typeof row !== "object") continue;

            const idv = row.ManSegID;
            const ridv = row[ROWID_KEY];
            if (idv == null || ridv == null) continue;

            const id = String(idv).trim();
            const rid = String(ridv).trim();
            if (!id || !rid) continue;

            let meta = metaBySegID.get(id);
            if (!meta) {
                meta = {
                    rowIDs: new Set(),
                    flagged: false,
                    comment: ""
                };
                metaBySegID.set(id, meta);
            }

            meta.rowIDs.add(rid);

            // flag aggregation
            if (!meta.flagged && coerceFlag(row.Flag)) {
                meta.flagged = true;
            }

            // comment aggregation (first non-empty wins)
            if (!String(meta.comment).trim()) {
                const c = coerceComment(row.Comments);
                if (String(c).trim()) meta.comment = c;
            }
        }

        const out = [];

        for (const [id, meta] of metaBySegID.entries()) {
            let i0 = Infinity;
            let i1 = -Infinity;
            let nFound = 0;

            for (const rid of meta.rowIDs) {
                const idx = idxByRowID.get(rid);
                if (idx == null) continue;
                if (!Number.isFinite(AppState.T[idx])) continue;

                if (idx < i0) i0 = idx;
                if (idx > i1) i1 = idx;
                nFound++;
            }

            // keep inclusive shared-sample semantics on import
            if (nFound < 1 || !(i1 >= i0)) continue;

            const sel = makeImportedSelection({
                id,
                i0,
                i1,
                T: baseT,
                flagged: meta.flagged,
                comment: meta.comment
            });

            if (sel) out.push(sel);
        }

        out.sort((a, b) => {
            const da = Number.isFinite(a.i0) ? a.i0 : 0;
            const db = Number.isFinite(b.i0) ? b.i0 : 0;
            return da - db;
        });
        return out;
    }

    // ---------------------------------------------------------
    // FALLBACK MODE (legacy): reconstruct by time range from export
    // ALSO import Flag + Comments by ManSegID
    // ---------------------------------------------------------
    const timeKey = resolveTimeKey(rows);
    if (!timeKey) {
        console.error("importSelectionsFromSegmentedExport: missing time column name (timeColName) and no ManSeg_rowID present.");
        return [];
    }

    // id -> { t0, t1, flagged, comment }
    const meta = new Map();

    for (const row of rows) {
        if (!row || typeof row !== "object") continue;

        const idv = row.ManSegID;
        if (idv == null) continue;

        let t = Number(row[timeKey]);
        if (!Number.isFinite(t)) continue;

        // Re-align exported raw time into baseT space
        if (Number.isFinite(AppState.rawTime0)) {
            t = t - AppState.rawTime0;
        }

        const id = String(idv).trim();
        if (!id) continue;

        let m = meta.get(id);
        if (!m) {
            m = { t0: t, t1: t, flagged: false, comment: "" };
            meta.set(id, m);
        } else {
            if (t < m.t0) m.t0 = t;
            if (t > m.t1) m.t1 = t;
        }

        if (!m.flagged && coerceFlag(row.Flag)) {
            m.flagged = true;
        }

        if (!String(m.comment).trim()) {
            const c = coerceComment(row.Comments);
            if (String(c).trim()) m.comment = c;
        }
    }

    const out = [];

    for (const [id, m] of meta.entries()) {
        const i0 = nearestIndexInT(baseT, m.t0);
        const i1 = nearestIndexInT(baseT, m.t1);
        if (!Number.isFinite(i0) || !Number.isFinite(i1)) continue;
        if (i1 < i0) continue;

        const sel = makeImportedSelection({
            id,
            i0,
            i1,
            T: baseT,
            flagged: m.flagged,
            comment: m.comment
        });

        if (sel) out.push(sel);
    }

    out.sort((a, b) => {
        const da = Number.isFinite(a.i0) ? a.i0 : 0;
        const db = Number.isFinite(b.i0) ? b.i0 : 0;
        return da - db;
    });
    return out;
}
