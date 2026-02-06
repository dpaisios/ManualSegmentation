// -------------------------------------------------------------
// load_data.js
// Handles data loading, preprocessing, filtering, and state sync
// -------------------------------------------------------------

import {
    detectColumns,
    buildCanonicalFields,
    computeTipSeg,
    timeNormalization
} from "./column_detection.js";

import {
    removeLastJS,
    removeEdgeLifts
} from "./data_filters.js";

import { AppState } from "./app_state.js";

// -------------------------------------------------------------
// Exported buffers
// -------------------------------------------------------------
export let detectedCols = null;
export let originalRaw = null;          // TRUE original, immutable
export let X = [], Y = [], T = [], Tip = [], TipSeg = [];
export let RowIDs = [];
export let exportPathOverrideGlobal = null;
export let colNamesOverrideGlobal = null;

// -------------------------------------------------------------
// Main loader / reprocessor
// -------------------------------------------------------------
export function loadData(
    raw,
    colNamesOverride = null,
    exportPathOverride = null,
    settingsOptions = null
) {
    if (!AppState.dataLoaded) {
        if (!raw || !raw.length || typeof raw[0] !== "object") {
            alert("Invalid or unsupported data format.");
            return;
        }
    }

    if (exportPathOverride !== null) {
        exportPathOverrideGlobal = exportPathOverride;
    }

    if (!originalRaw && raw && raw.length) {
        originalRaw = raw.map(r => ({ ...r }));
    }

    if (!originalRaw || !originalRaw.length) {
        alert("Error: empty data.");
        return;
    }

    let data = originalRaw.map(r => ({ ...r }));
    // Keep a copy of the ORIGINAL (raw) key order for mapping back into originalRaw
    const rawColNames = Object.keys(data[0]);
    let colNames = [...rawColNames];

    // If caller didn't pass an override (e.g. filter toggle), reuse last one.
    if (colNamesOverride == null && colNamesOverrideGlobal) {
        colNamesOverride = [...colNamesOverrideGlobal];
    }

    // If caller passed a valid override, persist it for future reprocessing.
    if (
        colNamesOverride &&
        Array.isArray(colNamesOverride) &&
        colNamesOverride.length === colNames.length
    ) {
        colNamesOverrideGlobal = [...colNamesOverride];

        // Rename keys using the override (this is your existing loop).
        for (const row of data) {
            for (let i = 0; i < colNames.length; i++) {
                const oldK = colNames[i];
                const newK = colNamesOverride[i];
                row[newK] = row[oldK];
                delete row[oldK];
            }
        }

        // From here on, the canonical names are the override names.
        colNames = [...colNamesOverride];
    }

    data = data.map(r => {
        const o = {};
        for (const k of colNames) {
            o[k] = (typeof r[k] === "number") ? r[k] : Number(r[k]);
        }
        return o;
    });

    // ---------------------------------------------------------
    // Column detection + canonicalisation
    // ---------------------------------------------------------
    const { detectedCols: cols, processedData } =
        detectColumns(data, colNames);

    detectedCols = cols;

    // Persist time column metadata for segmented import
    AppState.timeColIndex =
        (typeof cols.t === "number") ? cols.t : null;

    AppState.timeColName =
        (typeof cols.t === "number") ? rawColNames[cols.t] : null;

    // Persist row-id column metadata (required for correct export under filtering)
    AppState.rowIdColIndex =
        (typeof cols.Index === "number") ? cols.Index : null;

    AppState.rowIdColName =
        (typeof cols.Index === "number") ? rawColNames[cols.Index] : null;

    // Row-id key in the *processed data* domain (after optional colNamesOverride).
    // This is what we must read from 'r' when building RowIDs.
    const rowIdKeyData =
        (typeof cols.Index === "number") ? colNames[cols.Index] : null;

    if (!AppState.rowIdColName) {
        alert(
            "No stable row ID column detected (Index/eventid). " +
            "Export cannot be made reliable under filtering without it."
        );
        return;
    }

    if (!rowIdKeyData) {
        alert(
            "Internal error: row ID key not resolved in processed data domain."
        );
        return;
    }

    // Persist raw time origin (for segmented import re-alignment)
    if (
        AppState.timeColName &&
        originalRaw.length > 0 &&
        Number.isFinite(Number(originalRaw[0][AppState.timeColName]))
    ) {
        AppState.rawTime0 = Number(originalRaw[0][AppState.timeColName]);
    } else {
        AppState.rawTime0 = null;
    }

    data = processedData;

    buildCanonicalFields(data, detectedCols, colNames);
    computeTipSeg(data);
    timeNormalization(data);

    if (settingsOptions?.find(o => o.label === "Remove last stroke")?.checked) {
        data = removeLastJS(data, detectedCols);
    }

    if (settingsOptions?.find(o => o.label === "Remove edge lifts")?.checked) {
        data = removeEdgeLifts(data);
    }

    X.length = 0;
    Y.length = 0;
    T.length = 0;
    Tip.length = 0;
    TipSeg.length = 0;
    RowIDs.length = 0;
    
    for (const r of data) {
        X.push(r.X);
        Y.push(r.Y);
        T.push(r.t);
        Tip.push(r.Tip);
        TipSeg.push(r.Tip_seg);
        RowIDs.push(String(r[rowIdKeyData]));
    }

    AppState.X = X;
    AppState.Y = Y;
    AppState.T = T;
    AppState.Tip = Tip;
    AppState.TipSeg = TipSeg;
    AppState.rowIds = RowIDs;
    AppState.detectedCols = detectedCols;
    AppState.originalRaw = originalRaw;
}

// -------------------------------------------------------------
// HARD RESET
// -------------------------------------------------------------
export function resetLoaderState() {
    detectedCols = null;
    originalRaw = null;
    X.length = 0;
    Y.length = 0;
    T.length = 0;
    Tip.length = 0;
    TipSeg.length = 0;
    RowIDs.length = 0;

    // IMPORTANT: timeColIndex MUST persist
}
