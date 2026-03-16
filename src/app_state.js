export const AppState = {

    // folder navigation
    fileList: null,      // array of absolute paths
    fileIndex: -1,       // current index in fileList

    // lifecycle
    dataLoaded: false,
    suppressCanvasClicks: false,

    // data
    X: null,
    Y: null,
    T: null,
    Tip: null,
    TipSeg: null,
    detectedCols: null,
    originalRaw: null,
    originalFileName: null,
    originalFilePath: null,

    // derived overlays
    overlays: {
        velocityMinima: {
            available: false,
            source: null,   // null | "mapped" | "computed"
            indices: []
        }
    },

    // display state
    display: {
        velocityMinima: {
            enabled: false,
            showXY: true,
            showTimeBar: true
        }
    },

    // ---------------------------------------------------------
    // Data quality warnings
    // ---------------------------------------------------------
    dataQuality: {
        hasDuplicateTimestamps: false
    },

    // aggregated title-bar issues
    titleIssues: [],

    // interaction / snapping
    snapping: {
        // soft snap while dragging: sample captures when raw time is within this
        // fraction of median dt
        captureFrac: 0.30,

        // release threshold for direction-aware hysteresis while dragging
        releaseFrac: 0.45
    },
    
    // selections
    // New contract:
    // - i0 / i1: inclusive snapped sample indices (source of truth for membership)
    // - t0 / t1: display/export-aligned handle times derived from snapped indices
    //   and kept on the object for compatibility with existing drawing code
    selections: [],

    // increments whenever selections or IDs change
    selectionsVersion: 0,

    // export destination policy
    exportConfig: {
        mode: "relative",
        fixedPath: null
    },

    // ---------------------------------------------------------
    // Export tracking (session-scoped)
    // ---------------------------------------------------------
    // absoluteFilePath -> { exportCount, exportedAt, exportPath, hasRowID? }
    exportTracker: {},

    // absoluteFilePath -> selectionsVersion at last export
    lastExportedVersionByFile: {},

    // time metadata (for segmented import)
    timeColIndex: null,
    timeColName: null,

    // raw time origin (for segmented import re-alignment)
    rawTime0: null,

    // ---------------------------------------------------------
    // Stable row identity (must be ManSeg_rowID)
    // ---------------------------------------------------------
    rowIdColIndex: null,
    rowIdColName: "ManSeg_rowID",
    rowIds: null,

        // ---------------------------------------------------------
    // Manual variable mapping (session scoped)
    // ---------------------------------------------------------
    manualMapping: {
        enabled: false,

        // user entered text (what appears in fields)
        fields: {
            X: "",
            Y: "",
            Z: "",
            t: "",
            P: "",
            v: "",
            v_pits: ""
        },

        // resolved column index after validation
        resolved: {
            X: null,
            Y: null,
            Z: null,
            t: null,
            P: null,
            v: null,
            v_pits: null
        },

        // validation state per variable
        status: {
            X: "empty",      // empty | auto | valid | invalid | duplicate | ambiguous
            Y: "empty",
            Z: "empty",
            t: "empty",
            P: "empty",
            v: "empty",
            v_pits: "empty"
        },

        // hover error messages
        errors: {
            X: "",
            Y: "",
            Z: "",
            t: "",
            P: "",
            v: "",
            v_pits: ""
        },

        // true when at least one valid manual mapping exists
        hasAnyMapping: false,

        // true when invalid mappings exist
        hasErrors: false,
    },
};
