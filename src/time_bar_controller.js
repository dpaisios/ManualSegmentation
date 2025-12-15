// -------------------------------------------------------------
// time_bar_controller.js
// Handles ALL time bar interactions (mouse, hover, drag, delete)
// -------------------------------------------------------------

import * as TB from "./time_bar.js";
import * as Select from "./selection_manager.js";
import * as ID from "./selection_ids.js";
import { isEditingSelection } from "./label_editor.js";

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

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function haveData() {
        return !!getDataLoaded?.() && Array.isArray(T) && T.length > 1;
    }

    function getTimeBounds() {
        const tMin = T[0];
        const tMax = T[T.length - 1];
        return { tMin, tMax };
    }

    function anyEditingSelection(selections) {
        for (const sel of selections) {
            if (isEditingSelection(sel)) return true;
        }
        return false;
    }

    function isInsideExistingSelection(xPixel) {
        const selections = getSelections() || [];
        if (!selections.length) return false;

        const { leftPad, barWidth } = TB.timeBarGeom(canvas.width, canvas.height);
        const { tMin, tMax } = getTimeBounds();

        const t = TB.pixelToTime(xPixel, leftPad, barWidth, tMin, tMax);
        for (let sel of selections) {
            if (t >= sel.t0 && t <= sel.t1) return true;
        }
        return false;
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

    // ---------------------------------------------------------
    // MOUSEDOWN
    // ---------------------------------------------------------
    canvas.addEventListener("mousedown", e => {
        if (getSuppressCanvasClicks?.()) return;
        if (!haveData()) return;

        const selections = getSelections() || [];

        // If an ID edit is active, ignore ALL mousedown events entirely.
        // Do NOT commit here. Commit only via blur or Enter.
        if (anyEditingSelection(selections)) return;

        const { leftPad, barWidth, barY0, barY1 } =
            TB.timeBarGeom(canvas.width, canvas.height);

        const x = e.offsetX;
        const y = e.offsetY;

        const { tMin, tMax } = getTimeBounds();

        ctx.font = "12px sans-serif";

        // -------------------------------------------------
        // 0) Click on label to edit? (only if bubble visible)
        // -------------------------------------------------
        for (const sel of selections) {
            if ((sel.bubbleAlpha ?? 0) <= 0.01) continue;

            const r = TB.getLabelRect(ctx, sel, T, canvas.width, canvas.height);

            if (
                x >= r.x && x <= r.x + r.w &&
                y >= r.y && y <= r.y + r.h
            ) {
                // keep same feel: editing only when controls are visible
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
        // 1) Delete bubble click?
        // -------------------------------------------------
        if (
            deleteTarget &&
            TB.hitTestDeleteBubble(
                x, y,
                deleteTarget,
                T,
                leftPad, barWidth, barY0,
                tMin, tMax,
                canvas.height
            )
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

        // -------------------------------------------------
        // Reset drag state
        // -------------------------------------------------
        clearDragState();

        // -------------------------------------------------
        // 2) Handle drags?
        // -------------------------------------------------
        for (let sel of selections) {
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
        // 3) New selection creation
        // -------------------------------------------------
        const leftExt  = leftPad * (1 / 3);
        const rightExt = (canvas.width - (leftPad + barWidth)) * (1 / 3);

        const barClickable =
            x >= (leftPad - leftExt) &&
            x <= (leftPad + barWidth + rightExt) &&
            y >= barY0 && y <= barY1;

        if (barClickable && !isInsideExistingSelection(x)) {
            dragging   = true;
            dragStartX = clamp(x, leftPad, leftPad + barWidth);

            tempSelection = null;
            deleteTarget  = null;

            canvas.style.cursor = "crosshair";
            return;
        }

        // -------------------------------------------------
        // Default: clicked outside controls -> clear bubble
        // -------------------------------------------------
        deleteTarget = null;
    });

    // ---------------------------------------------------------
    // MOUSEMOVE
    // ---------------------------------------------------------
    canvas.addEventListener("mousemove", e => {
        if (!haveData()) return;

        const selections = getSelections() || [];

        const { leftPad, barWidth, barY0, barY1 } =
            TB.timeBarGeom(canvas.width, canvas.height);

        const { tMin, tMax } = getTimeBounds();

        const rawX = e.offsetX;
        const x    = clamp(rawX, leftPad, leftPad + barWidth);
        const y    = e.offsetY;

        // ---------------------------------------------------------
        // editingSel: if an ID edit is active, freeze hover/drag UI
        // but DO NOT clear deleteTarget (bubble must stay visible)
        // ---------------------------------------------------------
        const editingSel = (() => {
            for (const sel of selections) {
                if (isEditingSelection(sel)) return sel;
            }
            return null;
        })();

        if (editingSel) {
            hoveredHandle = null;
            deleteTarget  = editingSel;   // keep bubble visible while editing
            canvas.style.cursor = "default";
            redrawTimeBar();
            return;
        }

        // ---------------------------------------------------------
        // NOT DRAGGING: EXACT original hover logic
        // ---------------------------------------------------------
        if (!dragging && !draggingStartHandle && !draggingEndHandle) {

            hoveredHandle = null;
            let hoveredSelection = null;

            let bestHandle = null;
            let bestDist   = Infinity;

            for (let sel of selections) {
                const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
                const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

                const { side } = TB.getHandleSizes(canvas.height);

                // inward tips
                const leftTipX  = x0 + side;
                const rightTipX = x1 - side;

                // allow both by default
                let allowLeft  = true;
                let allowRight = true;

                // CASE 1: left tip crosses past t1
                if (leftTipX > x1 && rawX > x1) {
                    allowLeft = false;
                }

                // CASE 2: right tip crosses past t0
                if (rightTipX < x0 && rawX < x0) {
                    allowRight = false;
                }

                // LEFT HANDLE
                if (
                    allowLeft &&
                    TB.hitTestHandleRect(
                        x, y,
                        x0, "left",
                        barY0, barY1,
                        canvas.height
                    )
                ) {
                    const dist = Math.abs(rawX - x0);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestHandle = { sel, side: "left" };
                    }
                }

                // RIGHT HANDLE
                if (
                    allowRight &&
                    TB.hitTestHandleRect(
                        x, y,
                        x1, "right",
                        barY0, barY1,
                        canvas.height
                    )
                ) {
                    const dist = Math.abs(rawX - x1);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestHandle = { sel, side: "right" };
                    }
                }

                // Hover via bar segment
                if (
                    y >= 1 && y <= barY1 &&
                    rawX >= x0 && rawX <= x1
                ) {
                    hoveredSelection = sel;
                }

                // Hover via label box
                if (!hoveredSelection) {
                    const r = TB.getLabelRect(
                        ctx, sel, T,
                        canvas.width, canvas.height
                    );

                    if (
                        rawX >= r.x && rawX <= r.x + r.w &&
                        y    >= r.y && y    <= r.y + r.h
                    ) {
                        hoveredSelection = sel;
                    }
                }

                // Hover via delete bubble
                if (!hoveredSelection) {
                    if (
                        TB.hitTestDeleteBubble(
                            rawX, y,
                            sel, T,
                            leftPad, barWidth, barY0,
                            tMin, tMax,
                            canvas.height
                        )
                    ) {
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
            return;
        }

        // ---------------------------------------------------------
        // DRAGGING A START HANDLE (EXACT original)
        // ---------------------------------------------------------
        if (draggingStartHandle) {
            hoveredHandle = null;
            deleteTarget  = null;

            let newT0 = TB.pixelToTime(x, leftPad, barWidth, tMin, tMax);
            const newT1 = draggingStartHandle.t1;

            // Prevent overlap with other selections on the LEFT
            let blockRight = -Infinity;
            for (let sel of selections) {
                if (sel === draggingStartHandle) continue;
                if (newT1 > sel.t0 && newT0 < sel.t1) {
                    blockRight = Math.max(blockRight, sel.t1);
                }
            }
            if (newT0 < blockRight) newT0 = blockRight;
            if (newT0 > newT1)      newT0 = newT1;

            draggingStartHandle.t0 = newT0;
            redrawTimeBar();
            redrawXY();
            return;
        }

        // ---------------------------------------------------------
        // DRAGGING AN END HANDLE (EXACT original)
        // ---------------------------------------------------------
        if (draggingEndHandle) {
            hoveredHandle = null;
            deleteTarget  = null;

            const newT0 = draggingEndHandle.t0;
            let newT1   = TB.pixelToTime(x, leftPad, barWidth, tMin, tMax);

            // Prevent overlap with other selections on the RIGHT
            let blockLeft = Infinity;
            for (let sel of selections) {
                if (sel === draggingEndHandle) continue;
                if (newT1 > sel.t0 && newT0 < sel.t1) {
                    blockLeft = Math.min(blockLeft, sel.t0);
                }
            }
            if (newT1 > blockLeft) newT1 = blockLeft;
            if (newT1 < newT0)     newT1 = newT0;

            draggingEndHandle.t1 = newT1;
            redrawTimeBar();
            redrawXY();
            return;
        }

        // ---------------------------------------------------------
        // DRAGGING SELECTION CREATION (EXACT original)
        // ---------------------------------------------------------
        if (dragging) {
            hoveredHandle = null;
            deleteTarget  = null;

            const tStart = TB.pixelToTime(dragStartX, leftPad, barWidth, tMin, tMax);
            let tCurr    = TB.pixelToTime(x,          leftPad, barWidth, tMin, tMax);

            // Prevent crossing into existing selections
            if (tCurr > tStart) {
                let limitRight = Infinity;
                for (let sel of selections) {
                    if (sel.t0 > tStart && tCurr > sel.t0) {
                        limitRight = Math.min(limitRight, sel.t0);
                    }
                }
                if (tCurr > limitRight) tCurr = limitRight;
            } else {
                let limitLeft = -Infinity;
                for (let sel of selections) {
                    if (sel.t1 < tStart && tCurr < sel.t1) {
                        limitLeft = Math.max(limitLeft, sel.t1);
                    }
                }
                if (tCurr < limitLeft) tCurr = limitLeft;
            }

            const t0 = Math.min(tStart, tCurr);
            const t1 = Math.max(tStart, tCurr);

            tempSelection = { t0, t1 };

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

        if (dragging && tempSelection && tempSelection.t1 > tempSelection.t0) {
            const next = [
                ...selections,
                {
                    t0: tempSelection.t0,
                    t1: tempSelection.t1,
                    id: null,
                    lockedID: false,
                    bubbleAlpha: 0
                }
            ];

            ID.recomputeAutoIDs(next);
            setSelections(next);
        }

        clearDragState();
        clearHoverState();

        canvas.style.cursor = "default";
        redrawTimeBar();
        redrawXY();
    });

    canvas.addEventListener("mouseleave", () => {
        const selections = getSelections() || [];

        const editingSel = (() => {
            for (const sel of selections) {
                if (isEditingSelection(sel)) return sel;
            }
            return null;
        })();

        // If editing, DO NOT clear deleteTarget (bubble must stay visible)
        if (editingSel) {
            hoveredHandle = null;
            deleteTarget  = editingSel;
            canvas.style.cursor = "default";
            redrawTimeBar();
            return;
        }

        clearHoverState();
        canvas.style.cursor = "default";
        redrawTimeBar();
    });


    return {
        state: {
            get hoveredHandle() { return hoveredHandle; },
            get deleteTarget()  { return deleteTarget; },
            get tempSelection() { return tempSelection; },
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
