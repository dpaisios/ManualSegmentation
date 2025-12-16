// -------------------------------------------------------------
// xy_controller.js
// Handles XY plot interactions (mouse drag selection)
// -------------------------------------------------------------

import { getCanvasCoords } from "./geometry.js";

const EDGE_TOL   = 6;  // px hit tolerance for box edges
const CORNER_TOL = 8;  // px hit tolerance for corners

export function attachXYController({
    canvas,
    AppState,
    renderers,
    computeTimeRangesFromXYBox
}) {
    let selecting = false;
    let dragMode  = null;
    let hoverMode = null;
    // "new"
    // "left" | "right" | "top" | "bottom"
    // "nw" | "ne" | "sw" | "se"

    let selectBox = null;  // {x0,y0,x1,y1}
    let tempTimeRanges = [];

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    function normBox(b) {
        return {
            x0: Math.min(b.x0, b.x1),
            x1: Math.max(b.x0, b.x1),
            y0: Math.min(b.y0, b.y1),
            y1: Math.max(b.y0, b.y1)
        };
    }

    function normalizeBox(b) {
        const n = normBox(b);
        b.x0 = n.x0;
        b.x1 = n.x1;
        b.y0 = n.y0;
        b.y1 = n.y1;
    }

    function hitTestCorner(x, y, b) {
        const { x0, x1, y0, y1 } = normBox(b);

        if (Math.hypot(x - x0, y - y0) < CORNER_TOL) return "nw";
        if (Math.hypot(x - x1, y - y0) < CORNER_TOL) return "ne";
        if (Math.hypot(x - x0, y - y1) < CORNER_TOL) return "sw";
        if (Math.hypot(x - x1, y - y1) < CORNER_TOL) return "se";

        return null;
    }

    function hitTestEdges(x, y, b) {
        const { x0, x1, y0, y1 } = normBox(b);

        if (Math.abs(x - x0) < EDGE_TOL) return "left";
        if (Math.abs(x - x1) < EDGE_TOL) return "right";
        if (Math.abs(y - y0) < EDGE_TOL) return "top";
        if (Math.abs(y - y1) < EDGE_TOL) return "bottom";

        return null;
    }

    function cursorForMode(mode) {
        switch (mode) {
            case "left":
            case "right":
                return "col-resize";

            case "top":
            case "bottom":
                return "row-resize";

            case "nw":
            case "se":
                return "nwse-resize";

            case "ne":
            case "sw":
                return "nesw-resize";

            case "new":
                return "crosshair";

            default:
                return "default";
        }
    }

    // ---------------------------------------------------------
    // Public helpers
    // ---------------------------------------------------------
    function getSelectBox() {
        return selectBox;
    }

    function getTempTimeRanges() {
        return tempTimeRanges;
    }

    function resetSelection() {
        selecting = false;
        dragMode  = null;
        hoverMode = null;
        selectBox = null;
        tempTimeRanges = [];
        window.xyTempTimeRanges = [];
        canvas.style.cursor = "default";
    }

    // ---------------------------------------------------------
    // Events
    // ---------------------------------------------------------
    canvas.addEventListener("mousedown", e => {
        if (!AppState.dataLoaded) return;

        const { x, y } = getCanvasCoords(e, canvas);

        hoverMode = null;

        if (selectBox) {
            const corner = hitTestCorner(x, y, selectBox);
            if (corner) {
                selecting = true;
                dragMode  = corner;
                canvas.style.cursor = cursorForMode(corner);
                return;
            }

            const edge = hitTestEdges(x, y, selectBox);
            if (edge) {
                selecting = true;
                dragMode  = edge;
                canvas.style.cursor = cursorForMode(edge);
                return;
            }
        }

        // NEW SELECTION
        selecting = true;
        dragMode  = "new";
        canvas.style.cursor = "crosshair";

        selectBox = {
            x0: x, y0: y,
            x1: x, y1: y
        };

        tempTimeRanges = [];
        window.xyTempTimeRanges = tempTimeRanges;

        renderers.redrawXY();
        renderers.redrawTimeBar();
    });

    canvas.addEventListener("mousemove", e => {
        if (!AppState.dataLoaded) return;

        const { x, y } = getCanvasCoords(e, canvas);

        // -----------------------------------------------------
        // Hover feedback (not dragging)
        // -----------------------------------------------------
        if (!selecting && selectBox) {
            const corner = hitTestCorner(x, y, selectBox);
            if (corner) {
                hoverMode = corner;
                canvas.style.cursor = cursorForMode(corner);
                selectBox._hover = corner;
                renderers.redrawXY();
                return;
            }

            const edge = hitTestEdges(x, y, selectBox);
            if (edge) {
                hoverMode = edge;
                canvas.style.cursor = cursorForMode(edge);
                selectBox._hover = edge;
                renderers.redrawXY();
                return;
            }

            hoverMode = null;
            selectBox._hover = null;
            canvas.style.cursor = "default";
            renderers.redrawXY();
        }

        if (!selecting || !selectBox) return;

        // -----------------------------------------------------
        // Dragging
        // -----------------------------------------------------
        switch (dragMode) {
            case "new":
                selectBox.x1 = x;
                selectBox.y1 = y;
                break;

            case "left":
                selectBox.x0 = x;
                break;

            case "right":
                selectBox.x1 = x;
                break;

            case "top":
                selectBox.y0 = y;
                break;

            case "bottom":
                selectBox.y1 = y;
                break;

            case "nw":
                selectBox.x0 = x;
                selectBox.y0 = y;
                break;

            case "ne":
                selectBox.x1 = x;
                selectBox.y0 = y;
                break;

            case "sw":
                selectBox.x0 = x;
                selectBox.y1 = y;
                break;

            case "se":
                selectBox.x1 = x;
                selectBox.y1 = y;
                break;
        }

        tempTimeRanges = computeTimeRangesFromXYBox(selectBox);
        window.xyTempTimeRanges = tempTimeRanges;

        renderers.redrawXY();
        renderers.redrawTimeBar();
    });

    canvas.addEventListener("mouseup", () => {
        if (!selecting || !selectBox) return;

        selecting = false;
        dragMode  = null;
        canvas.style.cursor = "default";

        if (
            Math.abs(selectBox.x1 - selectBox.x0) < 5 ||
            Math.abs(selectBox.y1 - selectBox.y0) < 5
        ) {
            selectBox = null;
            tempTimeRanges = [];
        } else {
            normalizeBox(selectBox);
            selectBox._hover = null;
        }

        window.xyTempTimeRanges = tempTimeRanges;

        renderers.redrawXY();
        renderers.redrawTimeBar();
    });

    canvas.addEventListener("mouseleave", () => {
        if (!selecting) {
            hoverMode = null;
            if (selectBox) selectBox._hover = null;
            canvas.style.cursor = "default";
            renderers.redrawXY();
        }
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
