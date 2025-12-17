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

    // selections
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
    // absoluteFilePath -> { exportCount, exportedAt }
    exportTracker: {},

    // absoluteFilePath -> selectionsVersion at last export
    lastExportedVersionByFile: {},
};
