// -------------------------------------------------------------
// app_state.js
// Central application state (single source of truth)
// -------------------------------------------------------------

export const AppState = {

    // folder navigation
    fileList: null,      // array of absolute paths
    fileIndex: -1,        // current index in fileList

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

    // selections
    selections: []
};
