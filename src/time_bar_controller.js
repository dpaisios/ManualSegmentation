// -------------------------------------------------------------
// time_bar_controller.js
// Handles ALL time bar interactions (mouse, hover, drag, delete, split)
// -------------------------------------------------------------

import {
    timeBarGeom,
    pixelToTime,
    getHandleSizes,
    getTimeBoundsFromT,
    isPixelInsideAnySelection
} from "./time_bar_geom.js";

import * as TB from "./time_bar.js";
import * as Select from "./selection_manager.js";
import * as ID from "./selection_ids.js";

import {
    isEditingSelection,
    anyEditingSelectionIn,
    getEditingSelection
} from "./label_editor.js";

import { clamp } from "./geometry.js";

import {
    getClusterLabelRect,
    hitTestClusterSplit,
    hitTestClusterDelete
} from "./time_bar_primitives.js";

export function attachTimeBarController({
    canvas,
    ctx,

    // data access
    getSelections,
    setSelections,
    T,
    Tip,

    // label editing
    labelEditor,

    // redraw hooks
    redrawTimeBar,
    redrawXY,

    // optional (safe defaults)
    getDataLoaded = () => true,
    getSuppressCanvasClicks = () => false
}) {

    // ---------------------------------------------------------
    // Controller state
    // ---------------------------------------------------------
    let dragging            = false;
    let draggingStartHandle = null;
    let draggingEndHandle   = null;
    let dragStartX          = null;
    let tempSelection       = null;

    let hoveredHandle = null;   // { sel, side } | null
    let deleteTarget  = null;   // sel | null

    // Split mode
    let splitMode    = false;
    let splitTarget  = null;    // sel | null
    let splitTime    = null;    // number | null (hover)
    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    function haveData() {
        return !!getDataLoaded?.() && Array.isArray(T) && T.length > 1;
    }

    function clearDragState() {
        dragging            = false;
        draggingStartHandle = null;
        draggingEndHandle   = null;
        dragStartX          = null;
        tempSelection       = null;
    }

    function clearHoverState() {
        hoveredHandle = null;
        deleteTarget  = null;
    }

    function exitSplitMode() {
        splitMode   = false;
        splitTarget = null;
        splitTime   = null;
    }

    function barHit(x, y) {
        const { leftPad, barWidth, barY0, barY1 } =
            timeBarGeom(canvas.width, canvas.height);

        const leftExt  = leftPad * (1 / 3);
        const rightExt = (canvas.width - (leftPad + barWidth)) * (1 / 3);

        const barClickable =
            x >= (leftPad - leftExt) &&
            x <= (leftPad + barWidth + rightExt) &&
            y >= barY0 && y <= barY1;

        return { barClickable, leftPad, barWidth, barY0, barY1 };
    }

    // ESC exits split mode (recommended UX)
    window.addEventListener("keydown", e => {
        if (e.key === "Escape" && splitMode) {
            exitSplitMode();
            clearDragState();
            clearHoverState();
            canvas.style.cursor = "default";
            redrawTimeBar();
            redrawXY();
        }
    });

    // ---------------------------------------------------------
    // MOUSEDOWN
    // ---------------------------------------------------------
    canvas.addEventListener("mousedown", e => {
        if (getSuppressCanvasClicks?.()) return;
        if (!haveData()) return;

        const selections = getSelections() || [];

        // Block all interactions while editing a label
        if (anyEditingSelectionIn(selections)) return;

        const x = e.offsetX;
        const y = e.offsetY;

        const { barClickable, leftPad, barWidth, barY0, barY1 } = barHit(x, y);
        const { tMin, tMax } = getTimeBoundsFromT(T);

        ctx.font = "12px sans-serif";

        // -------------------------------------------------
        // Split mode: validate OR cancel
        // -------------------------------------------------
        if (splitMode) {

            // Convert click to bar + time if applicable
            let tClick = null;
            if (barClickable) {
                const xc = clamp(x, leftPad, leftPad + barWidth);
                tClick = pixelToTime(xc, leftPad, barWidth, tMin, tMax);
            }

            // CASE 1 — Click INSIDE active selection → validate split
            if (
                barClickable &&
                splitTarget &&
                tClick != null &&
                tClick > splitTarget.t0 &&
                tClick < splitTarget.t1
            ) {
                const next = Select.splitSelection(
                    selections,
                    splitTarget,
                    tClick,
                    T
                );

                setSelections(next);
                ID.recomputeAutoIDs(next);

                exitSplitMode();
                clearDragState();
                clearHoverState();

                canvas.style.cursor = "default";
                redrawTimeBar();
                redrawXY();
                return;
            }

            // CASE 2 — ANY other click → cancel split mode
            exitSplitMode();
            clearDragState();
            clearHoverState();

            canvas.style.cursor = "default";
            redrawTimeBar();
            redrawXY();
            return;
        }

        // -------------------------------------------------
        // 0) Click on label to edit?
        // -------------------------------------------------
        for (const sel of selections) {
            if ((sel.bubbleAlpha ?? 0) <= 0.01) continue;

            const r = getClusterLabelRect(ctx, sel, T, canvas.width, canvas.height);

            if (
                x >= r.x && x <= r.x + r.w &&
                y >= r.y && y <= r.y + r.h
            ) {
                labelEditor.start(
                    sel,
                    r,
                    canvas.getBoundingClientRect(),
                    String(sel.id ?? "")
                );
                return;
            }
        }

        // -------------------------------------------------
        // 1) Split bubble click? (enter split mode)
        // -------------------------------------------------
        for (const sel of selections) {
            if ((sel.bubbleAlpha ?? 0) <= 0.01) continue;

            if (hitTestClusterSplit(ctx, x, y, sel, T, canvas.width, canvas.height)) {
                splitMode   = true;
                splitTarget = sel;
                splitTime   = null;

                clearDragState();
                clearHoverState();

                canvas.style.cursor = "crosshair";
                redrawTimeBar();
                redrawXY();
                return;
            }
        }

        // -------------------------------------------------
        // 2) Delete bubble click?
        // -------------------------------------------------
        if (
            deleteTarget &&
            hitTestClusterDelete(ctx, x, y, deleteTarget, T, canvas.width, canvas.height)
        ) {
            const next = Select.deleteSelection(deleteTarget, selections);
            setSelections(next);
            ID.recomputeAutoIDs(next);

            clearDragState();
            clearHoverState();

            redrawTimeBar();
            redrawXY();
            return;
        }

        clearDragState();

        // -------------------------------------------------
        // 3) Handle drags?
        // -------------------------------------------------
        for (const sel of selections) {
            const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
            const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

            if (TB.hitTestHandleRect(x, y, x0, "left", barY0, barY1, canvas.height)) {
                draggingStartHandle = sel;
                canvas.style.cursor = "grabbing";
                deleteTarget = null;
                return;
            }

            if (TB.hitTestHandleRect(x, y, x1, "right", barY0, barY1, canvas.height)) {
                draggingEndHandle = sel;
                canvas.style.cursor = "grabbing";
                deleteTarget = null;
                return;
            }
        }

        // -------------------------------------------------
        // 4) New selection creation
        // -------------------------------------------------
        if (
            barClickable &&
            !isPixelInsideAnySelection(
                x,
                selections,
                canvas.width,
                canvas.height,
                T
            )
        ) {
            dragging   = true;
            dragStartX = clamp(x, leftPad, leftPad + barWidth);

            tempSelection = null;
            deleteTarget  = null;

            canvas.style.cursor = "crosshair";
            return;
        }

        deleteTarget = null;
    });

    // ---------------------------------------------------------
    // MOUSEMOVE
    // ---------------------------------------------------------
    canvas.addEventListener("mousemove", e => {
        if (!haveData()) return;

        const selections = getSelections() || [];

        const { leftPad, barWidth, barY0, barY1 } =
            timeBarGeom(canvas.width, canvas.height);

        const { tMin, tMax } = getTimeBoundsFromT(T);

        const rawX = e.offsetX;
        const x    = clamp(rawX, leftPad, leftPad + barWidth);
        const y    = e.offsetY;

        const editingSel = getEditingSelection(selections);

        if (editingSel) {
            hoveredHandle = null;
            deleteTarget  = editingSel;
            canvas.style.cursor = "default";
            redrawTimeBar();
            return;
        }

        // -------------------------------------------------
        // Split mode hover preview (time bar only)
        // -------------------------------------------------
        if (splitMode) {
            hoveredHandle = null;
            deleteTarget  = splitTarget;

            const insideBar = (y >= barY0 && y <= barY1);
            if (insideBar && splitTarget) {
                let t = pixelToTime(x, leftPad, barWidth, tMin, tMax);

                // Clamp split preview strictly to the active selection
                if (t < splitTarget.t0) t = splitTarget.t0;
                if (t > splitTarget.t1) t = splitTarget.t1;

                splitTime = t;
                canvas.style.cursor = "col-resize";
            } else {
                splitTime = null;
                canvas.style.cursor = "default";
            }

            redrawTimeBar();
            redrawXY();
            return;
        }

        // -------------------------------------------------
        // Hover logic (no dragging)
        // -------------------------------------------------
        if (!dragging && !draggingStartHandle && !draggingEndHandle) {

            hoveredHandle = null;
            let hoveredSelection = null;

            let bestHandle = null;
            let bestDist   = Infinity;

            for (const sel of selections) {
                const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
                const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

                const { side } = getHandleSizes(canvas.height);

                const leftTipX  = x0 + side;
                const rightTipX = x1 - side;

                const allowLeft  = !(leftTipX > x1 && rawX > x1);
                const allowRight = !(rightTipX < x0 && rawX < x0);

                if (
                    allowLeft &&
                    TB.hitTestHandleRect(x, y, x0, "left", barY0, barY1, canvas.height)
                ) {
                    const dist = Math.abs(rawX - x0);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestHandle = { sel, side: "left" };
                    }
                }

                if (
                    allowRight &&
                    TB.hitTestHandleRect(x, y, x1, "right", barY0, barY1, canvas.height)
                ) {
                    const dist = Math.abs(rawX - x1);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestHandle = { sel, side: "right" };
                    }
                }

                if (y >= 1 && y <= barY1 && rawX >= x0 && rawX <= x1) {
                    hoveredSelection = sel;
                }

                if (!hoveredSelection) {
                    const r = getClusterLabelRect(ctx, sel, T, canvas.width, canvas.height);
                    if (
                        rawX >= r.x && rawX <= r.x + r.w &&
                        y    >= r.y && y    <= r.y + r.h
                    ) {
                        hoveredSelection = sel;
                    }
                }

                if (!hoveredSelection) {
                    if (hitTestClusterSplit(ctx, rawX, y, sel, T, canvas.width, canvas.height)) {
                        hoveredSelection = sel;
                    }
                }

                if (!hoveredSelection) {
                    if (hitTestClusterDelete(ctx, rawX, y, sel, T, canvas.width, canvas.height)) {
                        hoveredSelection = sel;
                    }
                }
            }

            if (bestHandle) {
                hoveredHandle = bestHandle;
                deleteTarget  = bestHandle.sel;
                canvas.style.cursor = "grab";
                redrawTimeBar();
                return;
            }

            deleteTarget = hoveredSelection;
            canvas.style.cursor = "default";
            redrawTimeBar();
            redrawXY();
            return;
        }

        // -------------------------------------------------
        // Drag left handle
        // -------------------------------------------------
        if (draggingStartHandle) {
            hoveredHandle = null;
            deleteTarget  = null;

            const proposedT0 =
                pixelToTime(x, leftPad, barWidth, tMin, tMax);

            draggingStartHandle.t0 =
                Select.clampLeftHandle(
                    selections,
                    draggingStartHandle,
                    proposedT0
                );

            redrawTimeBar();
            redrawXY();
            return;
        }

        // -------------------------------------------------
        // Drag right handle
        // -------------------------------------------------
        if (draggingEndHandle) {
            hoveredHandle = null;
            deleteTarget  = null;

            const proposedT1 =
                pixelToTime(x, leftPad, barWidth, tMin, tMax);

            draggingEndHandle.t1 =
                Select.clampRightHandle(
                    selections,
                    draggingEndHandle,
                    proposedT1
                );

            redrawTimeBar();
            redrawXY();
            return;
        }

        // -------------------------------------------------
        // Drag new selection
        // -------------------------------------------------
        if (dragging) {
            hoveredHandle = null;
            deleteTarget  = null;

            const tStart =
                pixelToTime(dragStartX, leftPad, barWidth, tMin, tMax);

            let tCurr =
                pixelToTime(x, leftPad, barWidth, tMin, tMax);

            tCurr =
                Select.clampNewSelectionTime(
                    selections,
                    tStart,
                    tCurr
                );

            tempSelection = {
                t0: Math.min(tStart, tCurr),
                t1: Math.max(tStart, tCurr)
            };

            redrawTimeBar();
            redrawXY();
            return;
        }
    });

    // ---------------------------------------------------------
    // MOUSEUP
    // ---------------------------------------------------------
    canvas.addEventListener("mouseup", () => {
        if (!haveData()) return;

        const selections = getSelections() || [];

        if (splitMode) {
            // no-op; split commits on mousedown click inside bar
            return;
        }

        if (dragging && tempSelection && tempSelection.t1 > tempSelection.t0) {
            const next = Select.addOrMergeSelectionRange(
                selections,
                tempSelection.t0,
                tempSelection.t1
            );
            setSelections(next);
        }

        clearDragState();
        clearHoverState();

        canvas.style.cursor = "default";
        redrawTimeBar();
        redrawXY();
    });

    // ---------------------------------------------------------
    // MOUSELEAVE
    // ---------------------------------------------------------
    canvas.addEventListener("mouseleave", () => {
        const selections = getSelections() || [];

        const editingSel = getEditingSelection(selections);

        if (editingSel) {
            hoveredHandle = null;
            deleteTarget  = editingSel;
            canvas.style.cursor = "default";
            redrawTimeBar();
            return;
        }

        if (splitMode) {
            splitTime = null;
            canvas.style.cursor = "default";
            redrawTimeBar();
            redrawXY();
            return;
        }

        clearHoverState();
        canvas.style.cursor = "default";
        redrawTimeBar();
    });

    // ---------------------------------------------------------
    // Public controller state
    // ---------------------------------------------------------
    return {
        state: {
            get hoveredHandle() { return hoveredHandle; },
            get deleteTarget()  { return deleteTarget; },
            get tempSelection() { return tempSelection; },
            get split() {
                return {
                    active: splitMode,
                    sel: splitTarget,
                    t: splitTime
                };
            },
            get editingSel() {
                const selections = getSelections() || [];
                for (const sel of selections) {
                    if (isEditingSelection(sel)) return sel;
                }
                return null;
            }
        }
    };
}
