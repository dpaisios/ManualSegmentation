// -------------------------------------------------------------
// xy_controller.js
// Handles XY plot interactions (mouse drag selection)
// -------------------------------------------------------------

import { getCanvasCoords } from "./geometry.js";
import * as Select from "./selection_manager.js";

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

    let selectBox = null;        // {x0,y0,x1,y1,_hover,_canCommit,_commitBubble}
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

        // Selection can now be committed
        b._canCommit = true;
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

        // LEFT edge
        if (
            Math.abs(x - x0) < EDGE_TOL &&
            y >= y0 && y <= y1
        ) return "left";

        // RIGHT edge
        if (
            Math.abs(x - x1) < EDGE_TOL &&
            y >= y0 && y <= y1
        ) return "right";

        // TOP edge
        if (
            Math.abs(y - y0) < EDGE_TOL &&
            x >= x0 && x <= x1
        ) return "top";

        // BOTTOM edge
        if (
            Math.abs(y - y1) < EDGE_TOL &&
            x >= x0 && x <= x1
        ) return "bottom";

        return null;
    }

    // ---------------------------------------------------------
    // Commit bubble hit test
    // ---------------------------------------------------------
    function hitTestCommitBubble(x, y, b) {
        if (!b._commitBubble) return false;
        const { cx, cy, r } = b._commitBubble;
        return Math.hypot(x - cx, y - cy) <= r;
    }

    // ---------------------------------------------------------
    // Commit logic (DELEGATED)
    // ---------------------------------------------------------
    function commitXYSelection() {
        if (!tempTimeRanges || tempTimeRanges.length === 0) return;

        Select.applySelectionRanges({
            getSelections: () => AppState.selections,
            setSelections: s => { AppState.selections = s; },
            ranges: tempTimeRanges
        });

        resetSelection();
        renderers.redrawXY();
        renderers.redrawTimeBar();
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

        // Commit bubble click
        if (selectBox && selectBox._canCommit) {
            if (hitTestCommitBubble(x, y, selectBox)) {
                commitXYSelection();
                return;
            }
        }

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

        // New selection
        selecting = true;
        dragMode  = "new";
        canvas.style.cursor = "crosshair";

        selectBox = { x0: x, y0: y, x1: x, y1: y };
        tempTimeRanges = [];
        window.xyTempTimeRanges = tempTimeRanges;

        renderers.redrawXY();
        renderers.redrawTimeBar();
    });

    canvas.addEventListener("mousemove", e => {
        if (!AppState.dataLoaded) return;

        const { x, y } = getCanvasCoords(e, canvas);

        // Hover feedback
        if (!selecting && selectBox) {
            const corner = hitTestCorner(x, y, selectBox);
            if (corner) {
                hoverMode = corner;
                selectBox._hover = corner;
                canvas.style.cursor = cursorForMode(corner);
                renderers.redrawXY();
                return;
            }

            const edge = hitTestEdges(x, y, selectBox);
            if (edge) {
                hoverMode = edge;
                selectBox._hover = edge;
                canvas.style.cursor = cursorForMode(edge);
                renderers.redrawXY();
                return;
            }

            hoverMode = null;
            selectBox._hover = null;
            canvas.style.cursor = "default";
            renderers.redrawXY();
        }

        if (!selecting || !selectBox) return;

        // Dragging
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
                selectBox.x0 = x; selectBox.y0 = y;
                break;
            case "ne":
                selectBox.x1 = x; selectBox.y0 = y;
                break;
            case "sw":
                selectBox.x0 = x; selectBox.y1 = y;
                break;
            case "se":
                selectBox.x1 = x; selectBox.y1 = y;
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
