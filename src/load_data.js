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
// Internal stable row identity key (NEW policy)
// -------------------------------------------------------------
const ROWID_KEY = "ManSeg_rowID";

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
function getActiveManualOverrides() {
    const mm = AppState.manualMapping;
    if (!mm || !mm.enabled) return null;

    const out = {};
    let any = false;

    const vars = ["X", "Y", "Z", "t", "P", "v", "v_pits"];

    for (const key of vars) {
        const idx = mm?.resolved?.[key];
        const source = mm?.meta?.[key]?.source ?? null;

        // Only user-committed mappings lock detection.
        // Auto fields must stay free so detection can rerun on them.
        if (
            source !== "auto" &&
            typeof idx === "number" &&
            idx >= 0
        ) {
            out[key] = idx;
            any = true;
        }
    }

    return any ? out : null;
}

function hasDuplicateTimestampsInData(data) {
    if (!Array.isArray(data) || data.length < 2) return false;

    const seen = new Set();

    for (const row of data) {
        const t = row?.t;

        if (!Number.isFinite(t)) continue;

        if (seen.has(t)) return true;
        seen.add(t);
    }

    return false;
}

function buildVelocityMinimaOverlay(data, colNames) {
    const mm = AppState.manualMapping;
    const resolvedIdx = mm?.resolved?.v_pits;

    if (
        !mm ||
        !mm.enabled ||
        typeof resolvedIdx !== "number" ||
        resolvedIdx < 0 ||
        resolvedIdx >= colNames.length
    ) {
        return {
            available: false,
            source: null,
            indices: []
        };
    }

    const colName = colNames[resolvedIdx];
    if (!colName) {
        return {
            available: false,
            source: null,
            indices: []
        };
    }

    const indices = [];

    for (let i = 0; i < data.length; i++) {
        const v = Number(data[i]?.[colName]);

        if (!Number.isFinite(v)) {
            return {
                available: false,
                source: null,
                indices: []
            };
        }

        if (v === 1) {
            indices.push(i);
        } else if (v !== 0) {
            return {
                available: false,
                source: null,
                indices: []
            };
        }
    }

    return {
        available: true,
        source: "mapped",
        indices
    };
}

function getTipSource(settingsOptions) {
    const tipSourceOpt = settingsOptions?.find(o => o.label === "Tip source");

    if (tipSourceOpt?.children) {
        const zOpt = tipSourceOpt.children.find(c => c.label === "Z");
        if (zOpt?.checked) return "Z";
    }

    return "P";
}

function getCriticalKeysForTipSource(tipSource) {
    return (tipSource === "Z")
        ? ["X", "Y", "Z", "t"]
        : ["X", "Y", "t", "P"];
}

function hasAllCriticalMappings(detectedCols, tipSource) {
    const critical = getCriticalKeysForTipSource(tipSource);

    return critical.every(key =>
        Number.isInteger(detectedCols?.[key]) &&
        detectedCols[key] >= 0
    );
}

function clearDrawableState() {
    X.length = 0;
    Y.length = 0;
    T.length = 0;
    Tip.length = 0;
    TipSeg.length = 0;
    RowIDs.length = 0;

    AppState.X = X;
    AppState.Y = Y;
    AppState.T = T;
    AppState.Tip = Tip;
    AppState.TipSeg = TipSeg;
    AppState.rowIds = RowIDs;

    AppState.dataQuality.hasDuplicateTimestamps = false;

    AppState.overlays.velocityMinima = {
        available: false,
        source: null,
        indices: []
    };
}

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

    // ---------------------------------------------------------
    // FIRST LOAD ONLY: freeze immutable original + assign ManSeg_rowID
    // ---------------------------------------------------------
    if (!originalRaw && raw && raw.length) {
        originalRaw = raw.map((r, i) => {
            const o = { ...r };

            // If already present (e.g. re-loading an exported file), keep it.
            // Otherwise generate stable IDs from original row order.
            const existing = o?.[ROWID_KEY];
            if (existing == null || String(existing).trim() === "") {
                o[ROWID_KEY] = String(i + 1);
            } else {
                o[ROWID_KEY] = String(existing);
            }

            return o;
        });
    }

    if (!originalRaw || !originalRaw.length) {
        alert("Error: empty data.");
        return;
    }

    let data = originalRaw.map(r => ({ ...r }));

    // Keep a copy of the ORIGINAL (raw) key order for mapping time column name.
    // IMPORTANT: exclude ManSeg_rowID from detection/renaming domains.
    const rawColNamesAll = Object.keys(data[0]);
    const rawColNames = rawColNamesAll.filter(k => k !== ROWID_KEY);

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

        // Rename keys using the override (EXCLUDING ManSeg_rowID).
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

    // Numeric-cast ONLY the data columns (exclude ManSeg_rowID)
    data = data.map(r => {
        const o = { ...r }; // preserves ManSeg_rowID untouched
        for (const k of colNames) {
            o[k] = (typeof r[k] === "number") ? r[k] : Number(r[k]);
        }
        return o;
    });

    // ---------------------------------------------------------
    // Column detection + canonicalisation
    // ---------------------------------------------------------
    const manualOverrides = getActiveManualOverrides();

    const { detectedCols: cols, processedData } =
        detectColumns(data, colNames, manualOverrides);

    detectedCols = cols;

    // Persist active manual overrides for current loaded dataset
    AppState.activeManualOverrides = manualOverrides ?? {};

    // Persist time column metadata for segmented import
    AppState.timeColIndex =
        (typeof cols.t === "number") ? cols.t : null;

    AppState.timeColName =
        (typeof cols.t === "number") ? rawColNames[cols.t] : null;

    // ---------------------------------------------------------
    // NEW: Stable row identity is ALWAYS our internal ManSeg_rowID
    // ---------------------------------------------------------
    AppState.rowIdColIndex = null;
    AppState.rowIdColName  = ROWID_KEY;

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

    const tipSource = getTipSource(settingsOptions);
    const drawableReady = hasAllCriticalMappings(detectedCols, tipSource);

    AppState.detectedCols = detectedCols;
    AppState.originalRaw = originalRaw;

    if (!drawableReady) {
        clearDrawableState();
        return;
    }

    buildCanonicalFields(data, detectedCols, colNames);

    const scaleOpt = settingsOptions?.find(o => o.label === "Scale multiplier");
    if (scaleOpt?.checked) {
        const sx = Number(scaleOpt.xValue);
        const sy = Number(scaleOpt.yValue);

        for (const row of data) {
            row.X *= sx;
            row.Y *= sy;
        }
    }

    computeTipSeg(data, tipSource);

    timeNormalization(data);

    if (settingsOptions?.find(o => o.label === "Remove last stroke")?.checked) {
        data = removeLastJS(data, detectedCols);
    }

    if (settingsOptions?.find(o => o.label === "Remove edge lifts")?.checked) {
        data = removeEdgeLifts(data);
    }

    AppState.dataQuality.hasDuplicateTimestamps =
        hasDuplicateTimestampsInData(data);

    const velocityMinimaOverlay = buildVelocityMinimaOverlay(data, colNames);

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
        RowIDs.push(String(r[ROWID_KEY]));
    }

    AppState.X = X;
    AppState.Y = Y;
    AppState.T = T;
    AppState.Tip = Tip;
    AppState.TipSeg = TipSeg;
    AppState.rowIds = RowIDs;
    AppState.overlays.velocityMinima = velocityMinimaOverlay;
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

    AppState.dataQuality.hasDuplicateTimestamps = false;
    AppState.titleIssues = []; 

    AppState.overlays.velocityMinima = {
        available: false,
        source: null,
        indices: []
    };
}