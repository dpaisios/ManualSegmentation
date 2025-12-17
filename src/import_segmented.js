// -------------------------------------------------------------
// import_segmented.js
// Import selections from *_segmented.json using base-file time field
// -------------------------------------------------------------

import { AppState } from "./app_state.js";

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

export async function importSelectionsFromSegmentedExport({
    exportPath,
    baseT
}) {
    if (!exportPath || !baseT || baseT.length === 0) return [];

    const txt = await window.electronAPI.readFile(exportPath);
    const rows = JSON.parse(txt);

    console.log(
        "[IMPORT] baseT range:",
        baseT[0],
        "→",
        baseT[baseT.length - 1],
        "len =", baseT.length
    );

    if (!Array.isArray(rows) || rows.length === 0) return [];

    const timeKey = resolveTimeKey(rows);
    if (!timeKey) {
        console.error("importSelectionsFromSegmentedExport: missing time column name (timeColName)");
        return [];
    }

    const ranges = new Map();

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

        const cur = ranges.get(id);
        if (!cur) {
            ranges.set(id, { t0: t, t1: t });
        } else {
            if (t < cur.t0) cur.t0 = t;
            if (t > cur.t1) cur.t1 = t;
        }
    }

    const out = [];

    for (const [id, { t0, t1 }] of ranges.entries()) {
        if (!(t1 > t0)) {
            console.log("[IMPORT] DROP (raw collapse)", id, t0, t1);
            continue;
        }

        const s0 = snapToT(baseT, t0);
        const s1 = snapToT(baseT, t1);

        console.log(
            "[IMPORT] SEG",
            id,
            "raw:", t0, "→", t1,
            "snapped:", s0, "→", s1
        );

        if (!(s1 > s0)) {
            console.log("[IMPORT] DROP (snap collapse)", id);
            continue;
        }

        out.push({
            t0: s0,
            t1: s1,
            id,
            lockedID: true,
            bubbleAlpha: 0
        });
    }

    out.sort((a, b) => a.t0 - b.t0);
    console.log("[IMPORT] selections created:", out.length);
    return out;
}
