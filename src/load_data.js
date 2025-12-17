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
export let exportPathOverrideGlobal = null;

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
    let colNames = Object.keys(data[0]);

    if (
        colNamesOverride &&
        Array.isArray(colNamesOverride) &&
        colNamesOverride.length === colNames.length
    ) {
        for (const row of data) {
            for (let i = 0; i < colNames.length; i++) {
                const oldK = colNames[i];
                const newK = colNamesOverride[i];
                row[newK] = row[oldK];
                delete row[oldK];
            }
        }
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
        (typeof cols.t === "number") ? Object.keys(originalRaw[0])[cols.t] : null;

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

    for (const r of data) {
        X.push(r.X);
        Y.push(r.Y);
        T.push(r.t);
        Tip.push(r.Tip);
        TipSeg.push(r.Tip_seg);
    }

    AppState.X = X;
    AppState.Y = Y;
    AppState.T = T;
    AppState.Tip = Tip;
    AppState.TipSeg = TipSeg;
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

    // IMPORTANT: timeColIndex MUST persist
}
