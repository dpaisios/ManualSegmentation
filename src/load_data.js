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
export let exportDataBuffer = [];
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
    // ---------------------------------------------------------
    // Validate ONLY on first load (file parsing stage)
    // ---------------------------------------------------------
    if (!AppState.dataLoaded) {
        if (!raw || !raw.length || typeof raw[0] !== "object") {
            alert("Invalid or unsupported data format.");
            return;
        }
    }

    if (exportPathOverride !== null) {
        exportPathOverrideGlobal = exportPathOverride;
    }

    // ---------------------------------------------------------
    // Preserve TRUE original raw data (deep copy, ONCE)
    // ---------------------------------------------------------
    if (!originalRaw && raw && raw.length) {
        originalRaw = raw.map(r => ({ ...r }));
    }

    if (!originalRaw || !originalRaw.length) {
        alert("Error: empty data.");
        return;
    }

    // ---------------------------------------------------------
    // Working copy for processing
    // ---------------------------------------------------------
    let data = originalRaw.map(r => ({ ...r }));
    let colNames = Object.keys(data[0]);

    // ---------------------------------------------------------
    // Column override (WORKING COPY ONLY)
    // ---------------------------------------------------------
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

    // ---------------------------------------------------------
    // Convert all fields to numeric (NaN allowed)
    // ---------------------------------------------------------
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
    data = processedData;

    buildCanonicalFields(data, detectedCols, colNames);
    computeTipSeg(data);
    timeNormalization(data);

    // ---------------------------------------------------------
    // Filters (re-applied from TRUE original each time)
    // ---------------------------------------------------------
    if (settingsOptions?.find(o => o.label === "Remove last stroke")?.checked) {
        data = removeLastJS(data, detectedCols);
    }

    if (settingsOptions?.find(o => o.label === "Remove edge lifts")?.checked) {
        data = removeEdgeLifts(data);
    }

    // ---------------------------------------------------------
    // Fill processed-domain vectors
    // ---------------------------------------------------------
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

    // ---------------------------------------------------------
    // Processed data buffer (used for export)
    // ---------------------------------------------------------
    exportDataBuffer = data;

    // ---------------------------------------------------------
    // Sync AppState (single source of truth)
    // ---------------------------------------------------------
    AppState.X = X;
    AppState.Y = Y;
    AppState.T = T;
    AppState.Tip = Tip;
    AppState.TipSeg = TipSeg;
    AppState.detectedCols = detectedCols;
    AppState.originalRaw = originalRaw;   // TRUE original
    AppState.exportDataBuffer = exportDataBuffer;
}

// -------------------------------------------------------------
// HARD RESET (used when switching files)
// -------------------------------------------------------------
export function resetLoaderState() {
    detectedCols = null;
    originalRaw = null;
    exportDataBuffer = [];
    X.length = 0;
    Y.length = 0;
    T.length = 0;
    Tip.length = 0;
    TipSeg.length = 0;
}
