// -------------------------------------------------------------
// xy_controller.js
// Handles XY plot interactions (mouse drag selection)
// -------------------------------------------------------------

export function attachXYController({
    canvas,

    // state / policy
    AppState,

    // redraw hooks
    renderers,

    // pure helper provided by app.js
    computeTimeRangesFromXYBox
}) {
    let selecting = false;
    let selectStart = null; // kept for parity/debug
    let selectBox = null;   // {x0,y0,x1,y1}
    let tempTimeRanges = [];

    // ---------------------------------------------------------
    // Public helpers
    // ---------------------------------------------------------
    function getSelectBox() {
        return selectBox;
    }

    function getTempTimeRanges() {
        return tempTimeRanges;
    }

    // ---------------------------------------------------------
    // HARD RESET (called when data changes)
    // ---------------------------------------------------------
    function resetSelection() {
        selecting = false;
        selectStart = null;
        selectBox = null;
        tempTimeRanges = [];
        window.xyTempTimeRanges = [];
    }

    // ---------------------------------------------------------
    // Events
    // ---------------------------------------------------------
    canvas.addEventListener("mousedown", e => {
        if (!AppState.dataLoaded) return;

        selecting = true;
        selectStart = { x: e.offsetX, y: e.offsetY };

        selectBox = {
            x0: e.offsetX, y0: e.offsetY,
            x1: e.offsetX, y1: e.offsetY
        };

        tempTimeRanges = [];
        window.xyTempTimeRanges = tempTimeRanges;

        renderers.redrawXY();
        renderers.redrawTimeBar();
    });

    canvas.addEventListener("mousemove", e => {
        if (!AppState.dataLoaded || !selecting) return;

        selectBox.x1 = e.offsetX;
        selectBox.y1 = e.offsetY;

        tempTimeRanges = computeTimeRangesFromXYBox(selectBox);
        window.xyTempTimeRanges = tempTimeRanges;

        renderers.redrawXY();
        renderers.redrawTimeBar();
    });

    canvas.addEventListener("mouseup", () => {
        if (!AppState.dataLoaded || !selecting) return;

        selecting = false;

        if (
            Math.abs(selectBox.x1 - selectBox.x0) < 5 ||
            Math.abs(selectBox.y1 - selectBox.y0) < 5
        ) {
            selectBox = null;
            tempTimeRanges = [];
        }

        window.xyTempTimeRanges = tempTimeRanges;

        renderers.redrawXY();
        renderers.redrawTimeBar();
    });

    // ---------------------------------------------------------
    // API
    // ---------------------------------------------------------
    return {
        getSelectBox,
        getTempTimeRanges,
        resetSelection
    };
}
