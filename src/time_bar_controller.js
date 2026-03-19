// -------------------------------------------------------------
// time_bar_controller.js
// Handles ALL time bar interactions (mouse, hover, drag, delete, split)
// -------------------------------------------------------------

import {
    timeBarGeom,
    pixelToTime,
    getHandleSizes,
    getTimeBoundsFromT,
    isPixelInsideAnySelection,
    nearestStrokeBoundaryIndexFromPixel
} from "./time_bar_geom.js";

import * as TB from "./time_bar.js";
import * as Select from "./selection_manager.js";

import {
    isEditingSelection,
    anyEditingSelectionIn,
    getEditingSelection
} from "./label_editor.js";

import { clamp } from "./geometry.js";

import {
    getClusterLabelRect,
    hitTestClusterSplit,
    hitTestClusterDelete,
    hitTestClusterFlag,
    getClusterHoverRect,
    hitTestClusterComment,
    getClusterCommentRect
} from "./time_bar_primitives.js";

import {
    anyEditingCommentIn,
    getEditingCommentSelection
} from "./comment_editor.js";

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

    commentEditor,

    // redraw hooks
    renderers,

    // optional (safe defaults)
    getDataLoaded = () => true,
    getSuppressCanvasClicks = () => false,
    getRestrictSelectionsToStrokes = () => false
}) {

    // ---------------------------------------------------------
    // Controller state
    // ---------------------------------------------------------
    let dragging            = false;
    let draggingStartHandle = null;
    let draggingEndHandle   = null;
    let dragStartX          = null;
    let tempSelection       = null;

    // sample-aware drag preview state
    let dragSelectionPreview = null;   // { sourceSel, sel, side, rawTime } | null
    let dragRawTime         = null;   // continuous pointer-derived time
    let dragLastRawTime     = null;   // previous raw time (for direction)
    let dragDirection       = 0;      // -1 | 0 | +1
    let dragSnappedIndex    = null;   // hysteretic preview snap target
    let dragAnchorIndex     = null;   // for new selection creation

    let hoveredHandle = null;   // { sel, side } | null
    let deleteTarget  = null;   // sel | null

    let hoveredCommentTarget = null;

    // Split mode
    let splitMode         = false;
    let splitTarget       = null;    // sel | null
    let splitTime         = null;    // snapped preview time
    let splitSnappedIndex = null;    // snapped preview sample index
    let splitLastRawTime  = null;    // previous raw hover time
    let splitDirection    = 0;       // -1 | 0 | +1

    // Merging
    let draggingMerge = false;
    let mergeSource   = null;
    let mergeT0       = null;
    let mergeT1       = null;

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    function haveData() {
        return !!getDataLoaded?.() && Array.isArray(T) && T.length > 1;
    }

    function restrictToStrokes() {
        return !!getRestrictSelectionsToStrokes?.();
    }

    function getStrokeRunBounds(i) {
        if (!Array.isArray(Tip) || !Tip.length) return null;
        if (!Number.isFinite(i) || i < 0 || i >= Tip.length) return null;
        if (Tip[i] !== 1) return null;

        let i0 = i;
        let i1 = i;

        while (i0 > 0 && Tip[i0 - 1] === 1) i0--;
        while (i1 + 1 < Tip.length && Tip[i1 + 1] === 1) i1++;

        return { i0, i1 };
    }

    function clampIndexToRun(i, run) {
        if (!run || !Number.isFinite(i)) return i;
        return Math.max(run.i0, Math.min(run.i1, i));
    }

    function resolveStrokeSafeAnchorIndex(rawX, x, leftPad, barWidth, tMin, tMax) {
        const rawT = pixelToTime(x, leftPad, barWidth, tMin, tMax);
        const nearestI = Select.nearestSampleIndex(T, rawT);

        if (Number.isFinite(nearestI) && Tip[nearestI] === 1) {
            return nearestI;
        }

        if (!restrictToStrokes()) return null;

        return nearestStrokeBoundaryIndexFromPixel(
            rawX,
            T,
            Tip,
            leftPad,
            barWidth,
            tMin,
            tMax,
            20
        );
    }

    function clearDragState() {
        dragging            = false;
        draggingStartHandle = null;
        draggingEndHandle   = null;
        dragStartX          = null;
        tempSelection       = null;

        dragSelectionPreview = null;
        dragRawTime         = null;
        dragLastRawTime     = null;
        dragDirection       = 0;
        dragSnappedIndex    = null;
        dragAnchorIndex     = null;
    }

    function clearHoverState() {
        hoveredHandle = null;
        deleteTarget  = null;
        hoveredCommentTarget = null;
    }

    function exitSplitMode() {
        splitMode         = false;
        splitTarget       = null;
        splitTime         = null;
        splitSnappedIndex = null;
        splitLastRawTime  = null;
        splitDirection    = 0;
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

    function getPointer(e, leftPad, barWidth) {
        const rawX = e.offsetX;
        return {
            rawX,
            x: clamp(rawX, leftPad, leftPad + barWidth),
            y: e.offsetY
        };
    }

    function medianDt() {
        if (!Array.isArray(T) || T.length < 2) return 0;

        const diffs = [];
        for (let i = 1; i < T.length; i++) {
            const d = T[i] - T[i - 1];
            if (Number.isFinite(d) && d > 0) diffs.push(d);
        }
        if (!diffs.length) return 0;

        diffs.sort((a, b) => a - b);
        const mid = Math.floor(diffs.length / 2);
        return (diffs.length % 2)
            ? diffs[mid]
            : 0.5 * (diffs[mid - 1] + diffs[mid]);
    }

    function snapParams() {
        const md = medianDt();
        return {
            capture: md * 0.30,
            release: md * 0.45
        };
    }

    function updateDragDirection(rawT) {
        if (!Number.isFinite(rawT)) return;

        if (Number.isFinite(dragLastRawTime)) {
            if (rawT > dragLastRawTime) dragDirection = +1;
            else if (rawT < dragLastRawTime) dragDirection = -1;
        }

        dragLastRawTime = rawT;
    }

    function boundaryIndexForRawTime(rawT, side = null) {
        if (!Number.isFinite(rawT)) return null;

        if (side === "left") {
            return Select.resolveLeftBoundaryIndex(T, rawT);
        }

        if (side === "right") {
            return Select.resolveRightBoundaryIndex(T, rawT);
        }

        return Select.nearestSampleIndex(T, rawT);
    }

    function nearestSampleWithinCapture(rawT, side = null) {
        if (!Number.isFinite(rawT)) return null;

        const i = boundaryIndexForRawTime(rawT, side);
        if (!Number.isFinite(i)) return null;

        const { capture } = snapParams();
        if (Math.abs(T[i] - rawT) <= capture) return i;

        return null;
    }

    function updateHystereticSnap(rawT, side = null) {
        if (!Number.isFinite(rawT)) return null;

        const { release } = snapParams();

        if (Number.isFinite(dragSnappedIndex)) {
            const ts = T[dragSnappedIndex];

            const shouldRelease =
                (dragDirection > 0 && rawT > ts + release) ||
                (dragDirection < 0 && rawT < ts - release);

            if (!shouldRelease) {
                return dragSnappedIndex;
            }

            dragSnappedIndex = null;
        }

        const captured = nearestSampleWithinCapture(rawT, side);
        if (Number.isFinite(captured)) {
            dragSnappedIndex = captured;
            return captured;
        }

        return null;
    }

    function forceNearestSnap(rawT, side = null) {
        return boundaryIndexForRawTime(rawT, side);
    }

    function getSelectionIndexBounds(sel) {
        const i0 = Number.isFinite(sel?.i0)
            ? sel.i0
            : Select.resolveLeftBoundaryIndex(T, sel?.t0);

        const i1 = Number.isFinite(sel?.i1)
            ? sel.i1
            : Select.resolveRightBoundaryIndex(T, sel?.t1);

        return {
            i0: Math.min(i0, i1),
            i1: Math.max(i0, i1)
        };
    }

    function buildHandleDragPreview(sourceSel, side, rawTime, nextBoundaryIndex) {
        if (!sourceSel) return null;
        if (!Number.isFinite(nextBoundaryIndex)) return null;

        const base = getSelectionIndexBounds(sourceSel);

        let i0 = base.i0;
        let i1 = base.i1;

        if (side === "left") {
            i0 = nextBoundaryIndex;
        } else if (side === "right") {
            i1 = nextBoundaryIndex;
        } else {
            return null;
        }

        const a = Math.min(i0, i1);
        const b = Math.max(i0, i1);

        return {
            sourceSel,
            side,
            rawTime,
            sel: {
                ...sourceSel,
                i0: a,
                i1: b,
                t0: T[a],
                t1: T[b]
            }
        };
    }

    function updateSplitDirection(rawT) {
        if (!Number.isFinite(rawT)) return;

        if (Number.isFinite(splitLastRawTime)) {
            if (rawT > splitLastRawTime) splitDirection = +1;
            else if (rawT < splitLastRawTime) splitDirection = -1;
        }

        splitLastRawTime = rawT;
    }

    function expandDuplicateRun(i) {
        if (!Number.isFinite(i)) return null;

        let i0 = i;
        let i1 = i;

        while (i0 > 0 && T[i0 - 1] === T[i]) i0--;
        while (i1 + 1 < T.length && T[i1 + 1] === T[i]) i1++;

        return { i0, i1 };
    }

    function resolveDirectionalSplitIndex(rawT, bounds = null) {
        if (!Number.isFinite(rawT)) return null;

        const nearestI = Select.nearestSampleIndex(T, rawT);
        if (!Number.isFinite(nearestI)) return null;

        const run = expandDuplicateRun(nearestI);
        if (!run) return nearestI;

        let i;
        if (run.i0 === run.i1) {
            i = nearestI;
        } else if (splitDirection > 0) {
            i = run.i0;   // moving right -> first duplicate
        } else {
            i = run.i1;   // moving left or no direction -> last duplicate
        }

        if (bounds) {
            i = Math.max(bounds.i0, Math.min(bounds.i1, i));
        }

        return i;
    }

    // ESC exits split mode (recommended UX)
    window.addEventListener("keydown", e => {
        if (e.key === "Escape" && splitMode) {
            exitSplitMode();
            clearDragState();
            clearHoverState();
            canvas.style.cursor = "default";
            renderers.requestFull();
        }
    });

    function computeMergeFillGaps(selections, t0, t1) {
        const a = Math.min(t0, t1);
        const b = Math.max(t0, t1);

        let gaps = [{ t0: a, t1: b }];

        for (const sel of selections) {
            const next = [];
            for (const g of gaps) {
                if (sel.t1 <= g.t0 || sel.t0 >= g.t1) {
                    next.push(g);
                } else {
                    if (sel.t0 > g.t0) {
                        next.push({ t0: g.t0, t1: sel.t0 });
                    }
                    if (sel.t1 < g.t1) {
                        next.push({ t0: sel.t1, t1: g.t1 });
                    }
                }
            }
            gaps = next;
            if (gaps.length === 0) break;
        }

        return gaps;
    }

    function resolveBestHandleHit(selections, rawX, y, leftPad, barWidth, barY0, barY1, tMin, tMax) {
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
                TB.hitTestHandleRect(rawX, y, x0, "left", barY0, barY1, canvas.height)
            ) {
                const dist = Math.abs(rawX - x0);

                if (dist < bestDist) {
                    bestDist = dist;
                    bestHandle = { sel, side: "left" };
                }
            }

            if (
                allowRight &&
                TB.hitTestHandleRect(rawX, y, x1, "right", barY0, barY1, canvas.height)
            ) {
                const dist = Math.abs(rawX - x1);

                if (dist < bestDist) {
                    bestDist = dist;
                    bestHandle = { sel, side: "right" };
                }
            }
        }

        return bestHandle;
    }

    // ---------------------------------------------------------
    // MOUSEDOWN
    // ---------------------------------------------------------
    canvas.addEventListener("mousedown", e => {
        if (getSuppressCanvasClicks?.()) return;
        if (!haveData()) return;

        const selections = getSelections() || [];

        // Block all interactions while editing a label
        if (anyEditingSelectionIn(selections) || anyEditingCommentIn(selections)) return;

        const rawX0 = e.offsetX;
        const y0 = e.offsetY;

        const { barClickable, leftPad, barWidth, barY0, barY1 } = barHit(rawX0, y0);
        const { rawX, x, y } = getPointer(e, leftPad, barWidth);
        const { tMin, tMax } = getTimeBoundsFromT(T);

        ctx.font = "12px sans-serif";

        // -------------------------------------------------
        // Split mode: validate OR cancel
        // -------------------------------------------------
        if (splitMode) {

            // Convert click to bar + time if applicable
            // CASE 1 — Click on a valid snapped split sample → validate split
            if (
                barClickable &&
                splitTarget &&
                Number.isFinite(splitSnappedIndex)
            ) {
                const next = Select.splitSelectionAtIndex(
                    selections,
                    splitTarget,
                    splitSnappedIndex,
                    T
                );

                setSelections(next);

                exitSplitMode();
                clearDragState();

                canvas.style.cursor = "default";
                renderers.requestFull();
                return;
            }

            // CASE 2 — ANY other click → cancel split mode
            exitSplitMode();
            clearDragState();

            canvas.style.cursor = "default";
            renderers.requestFull();
            return;
        }

        // -------------------------------------------------
        // Click on label to edit?
        // -------------------------------------------------
        for (const sel of selections) {
            if ((sel.bubbleAlpha ?? 0) <= 0.01) continue;

            const r = getClusterLabelRect(ctx, sel, T, canvas.width, canvas.height);

            if (
                x >= r.x && x <= r.x + r.w &&
                y >= r.y && y <= r.y + r.h
            ) {
                deleteTarget = sel;
                renderers.requestTimeBar();

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
        // Split bubble click? (enter split mode)
        // -------------------------------------------------
        for (const sel of selections) {
            if ((sel.bubbleAlpha ?? 0) <= 0.01) continue;

            if (hitTestClusterSplit(ctx, x, y, sel, T, canvas.width, canvas.height)) {
                splitMode         = true;
                splitTarget       = sel;
                splitTime         = null;
                splitSnappedIndex = null;
                splitLastRawTime  = null;
                splitDirection    = 0;

                clearDragState();
                clearHoverState();

                deleteTarget = sel;
                canvas.style.cursor = "crosshair";
                renderers.requestFull();
                return;
            }
        }

        // -------------------------------------------------
        // Comment bubble click? (toggle editor)
        // -------------------------------------------------
        for (const sel of selections) {
            if ((sel.bubbleAlpha ?? 0) <= 0.01) continue;

            if (hitTestClusterComment(ctx, x, y, sel, T, canvas.width, canvas.height)) {

                // if already editing this selection comment, commit by toggling
                if (commentEditor?.toggleCommitIfEditingSame?.(sel)) {
                    renderers.requestFull();
                    return;
                }

                // placeholder: use new helper getClusterCommentRect(...)
                const r = getClusterCommentRect(ctx, sel, T, canvas.width, canvas.height);

                deleteTarget = sel;
                renderers.requestTimeBar();

                commentEditor.start(
                    sel,
                    r,
                    canvas.getBoundingClientRect(),
                    String(sel.comment ?? "")
                );

                return;
            }
        }

        // -------------------------------------------------
        // Delete bubble click?
        // -------------------------------------------------
        if (
            deleteTarget &&
            hitTestClusterDelete(ctx, x, y, deleteTarget, T, canvas.width, canvas.height)
        ) {
            const next = Select.deleteSelection(deleteTarget, selections);
            setSelections(next);

            clearDragState();
            // DO NOT clearHoverState() here: prevents bubble blink

            renderers.requestFull();
            return;
        }

        // -------------------------------------------------
        // Flag bubble (toggle)
        // -------------------------------------------------
        for (const sel of selections) {
            if ((sel.bubbleAlpha ?? 0) <= 0.01) continue;

            if (hitTestClusterFlag(ctx, x, y, sel, T, canvas.width, canvas.height)) {
                setSelections(
                    Select.updateSelection(
                        selections,
                        sel,
                        { flagged: !sel.flagged }
                    )
                );

                deleteTarget = sel;
                renderers.requestFull();
                return;
            }
        }

        clearDragState();

        // -------------------------------------------------
        // Handle drags?
        // -------------------------------------------------
        const bestHandle = resolveBestHandleHit(
            selections,
            rawX,
            y,
            leftPad,
            barWidth,
            barY0,
            barY1,
            tMin,
            tMax
        );

        if (bestHandle) {
            if (bestHandle.side === "left") {
                draggingStartHandle = bestHandle.sel;

                dragRawTime      = bestHandle.sel.t0;
                dragLastRawTime  = bestHandle.sel.t0;
                dragDirection    = 0;

                dragSnappedIndex =
                    Number.isFinite(bestHandle.sel.i0)
                        ? bestHandle.sel.i0
                        : Select.resolveLeftBoundaryIndex(T, bestHandle.sel.t0);

                dragSelectionPreview = buildHandleDragPreview(
                    bestHandle.sel,
                    "left",
                    bestHandle.sel.t0,
                    dragSnappedIndex
                );
            } else {
                draggingEndHandle = bestHandle.sel;

                dragRawTime      = bestHandle.sel.t1;
                dragLastRawTime  = bestHandle.sel.t1;
                dragDirection    = 0;

                dragSnappedIndex =
                    Number.isFinite(bestHandle.sel.i1)
                        ? bestHandle.sel.i1
                        : Select.resolveRightBoundaryIndex(T, bestHandle.sel.t1);

                dragSelectionPreview = buildHandleDragPreview(
                    bestHandle.sel,
                    "right",
                    bestHandle.sel.t1,
                    dragSnappedIndex
                );
            }

            canvas.style.cursor = "grabbing";
            deleteTarget = null;
            return;
        }

        // -------------------------------------------------
        // Merge drag: click inside selection body
        // -------------------------------------------------
        for (const sel of selections) {
            const tClick = pixelToTime(
                x,
                leftPad, barWidth, tMin, tMax
            );

            if (tClick > sel.t0 && tClick < sel.t1) {

                // Avoid conflict with handles
                const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
                const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

                if (
                    TB.hitTestHandleRect(x, y, x0, "left",  barY0, barY1, canvas.height) ||
                    TB.hitTestHandleRect(x, y, x1, "right", barY0, barY1, canvas.height)
                ) {
                    break;
                }

                draggingMerge = true;
                mergeSource   = sel;
                mergeT0       = tClick;
                mergeT1       = tClick;

                canvas.style.cursor = "ew-resize";
                return;
            }
        }

        // -------------------------------------------------
        // New selection creation
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
            let anchorIndex = null;
            let tStart = pixelToTime(x, leftPad, barWidth, tMin, tMax);

            if (restrictToStrokes()) {
                anchorIndex = resolveStrokeSafeAnchorIndex(
                    rawX,
                    x,
                    leftPad,
                    barWidth,
                    tMin,
                    tMax
                );

            if (!Number.isFinite(anchorIndex)) {
                clearDragState();
                canvas.style.cursor = "default";
                return;
            }

                tStart = T[anchorIndex];
            } else {
                anchorIndex = Select.resolveLeftBoundaryIndex(T, tStart);
            }

            dragging   = true;
            dragStartX = x;

            dragRawTime      = tStart;
            dragLastRawTime  = tStart;
            dragDirection    = 0;
            dragAnchorIndex  = anchorIndex;
            dragSnappedIndex = anchorIndex;

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

        const { rawX, x, y } = getPointer(e, leftPad, barWidth);

        const editingSel = getEditingSelection(selections) || getEditingCommentSelection(selections);

        if (editingSel) {
            hoveredHandle = null;
            deleteTarget  = editingSel;
            canvas.style.cursor = "default";
            renderers.requestTimeBar();
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
                const rawT = pixelToTime(x, leftPad, barWidth, tMin, tMax);
                updateSplitDirection(rawT);

                const bounds = getSelectionIndexBounds(splitTarget);
                const i = resolveDirectionalSplitIndex(rawT, bounds);

                if (
                    Number.isFinite(i) &&
                    i > bounds.i0 &&
                    i < bounds.i1
                ) {
                    splitSnappedIndex = i;
                    splitTime = T[i];
                    canvas.style.cursor = "col-resize";
                } else {
                    splitSnappedIndex = null;
                    splitTime = null;
                    canvas.style.cursor = "default";
                }
            } else {
                splitSnappedIndex = null;
                splitTime = null;
                canvas.style.cursor = "default";
            }

            renderers.requestFull();
            return;
        }

        // -------------------------------------------------
        // Merge drag update
        // -------------------------------------------------
        if (draggingMerge) {
            const t = pixelToTime(x, leftPad, barWidth, tMin, tMax);
            mergeT1 = t;

            const gaps = computeMergeFillGaps(selections, mergeT0, mergeT1);

            tempSelection = { __mergePreview: true, gaps };

            renderers.requestFull();
            return;
        }

        // -------------------------------------------------
        // Hover logic (no dragging)
        // -------------------------------------------------
        if (!dragging && !draggingStartHandle && !draggingEndHandle) {

            hoveredHandle = null;
            hoveredCommentTarget = null;

            // -------------------------------------------------
            // 0) HANDLE HOVER (independent)
            // -------------------------------------------------
            const bestHandle = resolveBestHandleHit(
                selections,
                rawX,
                y,
                leftPad,
                barWidth,
                barY0,
                barY1,
                tMin,
                tMax
            );

            // -------------------------------------------------
            // 1) If pointer is ON the TIME BAR, choose segment by BAR HIT ONLY.
            //    This ignores cluster width entirely (your requested behavior).
            // -------------------------------------------------
            if (y >= barY0 && y <= barY1) {

                let under = null;

                for (const sel of selections) {
                    const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
                    const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

                    // bar hit decides ownership
                    if (rawX >= x0 && rawX <= x1) {
                        under = sel;
                        // selections should not overlap; if they do, keep the first
                        break;
                    }
                }

                if (bestHandle) {
                    hoveredHandle = bestHandle;
                    deleteTarget  = bestHandle.sel;
                    canvas.style.cursor = "grab";
                    renderers.requestTimeBar();
                    return;
                }

                deleteTarget = under;
                canvas.style.cursor = "default";
                renderers.requestFull();
                return;
            }

            // -------------------------------------------------
            // 2) Above the bar: STICKY OWNERSHIP
            //    Keep current cluster visible while pointer stays within:
            //    - cluster hover rect (includes gaps), OR
            //    - a vertical corridor aligned with the segment body [x0..x1] down to the bar
            // -------------------------------------------------
            if (deleteTarget) {
                // segment body x-range
                const bx0 = leftPad + (deleteTarget.t0 - tMin) / (tMax - tMin) * barWidth;
                const bx1 = leftPad + (deleteTarget.t1 - tMin) / (tMax - tMin) * barWidth;

                // cluster hover rect (you already added getClusterHoverRect)
                const zr = getClusterHoverRect(ctx, deleteTarget, T, canvas.width, canvas.height, barY1);

                const inClusterRect =
                    rawX >= zr.x && rawX <= zr.x + zr.w &&
                    y    >= zr.y && y    <= zr.y + zr.h;

                // corridor: allow moving from segment to its cluster even if cluster is narrow
                const inCorridor =
                    rawX >= bx0 && rawX <= bx1 &&
                    y    >= zr.y && y    <= barY1;

                if (inClusterRect || inCorridor) {

                    // NEW: detect comment bubble hover while we keep sticky ownership
                    if (hitTestClusterComment(ctx, rawX, y, deleteTarget, T, canvas.width, canvas.height)) {
                        hoveredCommentTarget = deleteTarget;
                    }

                    canvas.style.cursor = "default";
                    renderers.requestFull();
                    return;
                }
            }

            // -------------------------------------------------
            // 3) Resolve hovered selection ABOVE bar:
            //    bubbles(4) > label(3) > hoverRect(2) > body(1)
            // -------------------------------------------------
            let bestSel   = null;
            let bestScore = -Infinity;
            let bestDist2 = Infinity;

            for (const sel of selections) {
                const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
                const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

                // handle hover (same as before)
                let score = -Infinity;
                let dist2 = Infinity;

                // bubbles
                if (    
                    hitTestClusterSplit(ctx, rawX, y, sel, T, canvas.width, canvas.height) ||
                    hitTestClusterFlag(ctx,  rawX, y, sel, T, canvas.width, canvas.height) ||
                    hitTestClusterDelete(ctx, rawX, y, sel, T, canvas.width, canvas.height) ||
                    hitTestClusterComment(ctx, rawX, y, sel, T, canvas.width, canvas.height)
                ) {
                    if (hitTestClusterComment(ctx, rawX, y, sel, T, canvas.width, canvas.height)) {
                        hoveredCommentTarget = sel;
                    }
                    score = 4;
                    const cx = (x0 + x1) / 2;
                    const dx = rawX - cx;
                    const dy = y - (barY0 - 20);
                    dist2 = dx*dx + dy*dy;

                } else {
                    // label
                    const lr = getClusterLabelRect(ctx, sel, T, canvas.width, canvas.height);
                    if (
                        rawX >= lr.x && rawX <= lr.x + lr.w &&
                        y    >= lr.y && y    <= lr.y + lr.h
                    ) {
                        score = 3;
                        const cx = lr.x + lr.w / 2;
                        const cy = lr.y + lr.h / 2;
                        const dx = rawX - cx;
                        const dy = y - cy;
                        dist2 = dx*dx + dy*dy;

                    } else {
                        // hover rect (includes gaps)
                        const zr = getClusterHoverRect(ctx, sel, T, canvas.width, canvas.height, barY1);
                        if (
                            rawX >= zr.x && rawX <= zr.x + zr.w &&
                            y    >= zr.y && y    <= zr.y + zr.h
                        ) {
                            score = 2;
                            const cx = zr.x + zr.w / 2;
                            const cy = zr.y + zr.h / 2;
                            const dx = rawX - cx;
                            const dy = y - cy;
                            dist2 = dx*dx + dy*dy;
                        } else {
                            // fallback body (above bar): allow selecting cluster even when cursor is above bar
                            if (rawX >= x0 && rawX <= x1) {
                                score = 1;
                                const cx = (x0 + x1) / 2;
                                const dx = rawX - cx;
                                const dy = y - barY0;
                                dist2 = dx*dx + dy*dy;
                            }
                        }
                    }
                }

                if (score > bestScore || (score === bestScore && dist2 < bestDist2)) {
                    bestScore = score;
                    bestDist2 = dist2;
                    bestSel   = sel;
                }
            }

            if (bestHandle) {
                hoveredHandle = bestHandle;
                deleteTarget  = bestHandle.sel;
                canvas.style.cursor = "grab";
                renderers.requestTimeBar();
                return;
            }

            deleteTarget = bestSel;
            canvas.style.cursor = "default";
            renderers.requestFull();
            return;
        }

        // -------------------------------------------------
        // Drag left handle
        // -------------------------------------------------
        if (draggingStartHandle) {
            hoveredHandle = null;
            deleteTarget  = null;

            const rawT = pixelToTime(x, leftPad, barWidth, tMin, tMax);
            dragRawTime = rawT;
            updateDragDirection(rawT);

            const snappedI = updateHystereticSnap(rawT, "left");
            const previewI = Number.isFinite(snappedI)
                ? snappedI
                : boundaryIndexForRawTime(rawT, "left");

            if (Number.isFinite(previewI)) {
                let constrainedI = previewI;

                if (restrictToStrokes()) {
                    const fixedI = Number.isFinite(draggingStartHandle?.i1)
                        ? draggingStartHandle.i1
                        : Select.resolveRightBoundaryIndex(T, draggingStartHandle?.t1);

                    const run = getStrokeRunBounds(fixedI);
                    constrainedI = clampIndexToRun(constrainedI, run);
                }

                const clampedI = Select.clampLeftHandleIndex(
                    selections,
                    draggingStartHandle,
                    constrainedI,
                    T
                );

                const displayT =
                    (Number.isFinite(snappedI) || clampedI !== previewI)
                        ? T[clampedI]
                        : rawT;

                dragSnappedIndex = Number.isFinite(snappedI) ? clampedI : null;

                dragSelectionPreview = buildHandleDragPreview(
                    draggingStartHandle,
                    "left",
                    displayT,
                    clampedI
                );
            }

            renderers.requestFull();
            return;
        }

        // -------------------------------------------------
        // Drag right handle
        // -------------------------------------------------
        if (draggingEndHandle) {
            hoveredHandle = null;
            deleteTarget  = null;

            const rawT = pixelToTime(x, leftPad, barWidth, tMin, tMax);
            dragRawTime = rawT;
            updateDragDirection(rawT);

            const snappedI = updateHystereticSnap(rawT, "right");
            const previewI = Number.isFinite(snappedI)
                ? snappedI
                : boundaryIndexForRawTime(rawT, "right");

            if (Number.isFinite(previewI)) {
                let constrainedI = previewI;

                if (restrictToStrokes()) {
                    const fixedI = Number.isFinite(draggingEndHandle?.i0)
                        ? draggingEndHandle.i0
                        : Select.resolveLeftBoundaryIndex(T, draggingEndHandle?.t0);

                    const run = getStrokeRunBounds(fixedI);
                    constrainedI = clampIndexToRun(constrainedI, run);
                }

                const clampedI = Select.clampRightHandleIndex(
                    selections,
                    draggingEndHandle,
                    constrainedI,
                    T
                );

                const displayT =
                    (Number.isFinite(snappedI) || clampedI !== previewI)
                        ? T[clampedI]
                        : rawT;

                dragSnappedIndex = Number.isFinite(snappedI) ? clampedI : null;

                dragSelectionPreview = buildHandleDragPreview(
                    draggingEndHandle,
                    "right",
                    displayT,
                    clampedI
                );
            }

            renderers.requestFull();
            return;
        }

        // -------------------------------------------------
        // Drag new selection
        // -------------------------------------------------
        if (dragging) {
            hoveredHandle = null;
            deleteTarget  = null;

            const rawT = pixelToTime(x, leftPad, barWidth, tMin, tMax);
            dragRawTime = rawT;
            updateDragDirection(rawT);

            const nearestI = Select.nearestSampleIndex(T, rawT);
            const movingSide =
                Number.isFinite(nearestI) && nearestI < dragAnchorIndex
                    ? "left"
                    : "right";

            let currI = updateHystereticSnap(rawT, movingSide);
            if (!Number.isFinite(currI)) {
                currI = forceNearestSnap(rawT, movingSide);
            }

            if (restrictToStrokes()) {
                const run = getStrokeRunBounds(dragAnchorIndex);
                currI = clampIndexToRun(currI, run);
            }

            currI = Select.clampNewSelectionIndex(
                selections,
                dragAnchorIndex,
                currI,
                T
            );

            const i0 = Math.min(dragAnchorIndex, currI);
            const i1 = Math.max(dragAnchorIndex, currI);

            tempSelection = {
                i0,
                i1,
                t0: T[i0],
                t1: T[i1]
            };

            dragSnappedIndex = currI;

            renderers.requestFull();
            return;
        }
    });

    // ---------------------------------------------------------
    // MOUSEUP
    // ---------------------------------------------------------
    canvas.addEventListener("mouseup", e => {
        if (!haveData()) return;

        const selections = getSelections() || [];

        // -------------------------------------------------
        // 1) Merge drag commit
        // -------------------------------------------------
        if (draggingMerge) {

            const next = Select.mergeSelectionsByEnvelope(
                selections,
                mergeT0,
                mergeT1,
                mergeSource,
                T
            );

            if (next !== selections) {
                setSelections(next);
            }

            draggingMerge = false;
            mergeSource   = null;
            mergeT0       = null;
            mergeT1       = null;
            tempSelection = null;

            canvas.style.cursor = "default";
            renderers.requestFull();
            return;
        }

        // -------------------------------------------------
        // 2) Split mode (no-op: split commits on mousedown)
        // -------------------------------------------------
        if (splitMode) {
            return;
        }

        if (draggingStartHandle) {
            const preview =
                dragSelectionPreview &&
                dragSelectionPreview.sourceSel === draggingStartHandle &&
                dragSelectionPreview.side === "left"
                    ? dragSelectionPreview
                    : null;

            if (preview?.sel) {
                const updated = Select.syncSelectionToIndices(
                    {
                        ...draggingStartHandle,
                        i0: preview.sel.i0,
                        i1: preview.sel.i1
                    },
                    T
                );

                setSelections(
                    Select.updateSelection(
                        selections,
                        draggingStartHandle,
                        updated
                    )
                );
            }
        }

        if (draggingEndHandle) {
            const preview =
                dragSelectionPreview &&
                dragSelectionPreview.sourceSel === draggingEndHandle &&
                dragSelectionPreview.side === "right"
                    ? dragSelectionPreview
                    : null;

            if (preview?.sel) {
                const updated = Select.syncSelectionToIndices(
                    {
                        ...draggingEndHandle,
                        i0: preview.sel.i0,
                        i1: preview.sel.i1
                    },
                    T
                );

                setSelections(
                    Select.updateSelection(
                        selections,
                        draggingEndHandle,
                        updated
                    )
                );
            }
        }

        // -------------------------------------------------
        // 3) New selection creation commit
        // -------------------------------------------------
        if (
            dragging &&
            tempSelection &&
            Number.isFinite(tempSelection.i0) &&
            Number.isFinite(tempSelection.i1)
        ) {
            const next = Select.addOrMergeSelectionIndexRange(
                selections,
                tempSelection.i0,
                tempSelection.i1,
                T
            );
            setSelections(next);
        }

        // -------------------------------------------------
        // 4) Cleanup
        // -------------------------------------------------
        clearDragState();

        canvas.style.cursor = "default";
        renderers.requestFull();
    });

    // ---------------------------------------------------------
    // MOUSELEAVE
    // ---------------------------------------------------------
    canvas.addEventListener("mouseleave", () => {
        const selections = getSelections() || [];

        const editingSel =
            getEditingSelection(selections) || getEditingCommentSelection(selections);

        if (editingSel) {
            hoveredHandle = null;
            deleteTarget  = editingSel;
            canvas.style.cursor = "default";
            renderers.requestFull();
            return;
        }

        if (splitMode) {
            splitTime = null;
            splitSnappedIndex = null;
            splitLastRawTime = null;
            splitDirection = 0;
            canvas.style.cursor = "default";
            renderers.requestFull();
            return;
        }

        clearHoverState();
        canvas.style.cursor = "default";
        renderers.requestFull();
    });

    // ---------------------------------------------------------
    // Public controller state
    // ---------------------------------------------------------
    return {
        state: {
            get hoveredHandle() { return hoveredHandle; },
            get deleteTarget()  { return deleteTarget; },
            get tempSelection() { return tempSelection; },
            get dragRawTime() { return dragRawTime; },
            get dragSnappedIndex() { return dragSnappedIndex; },
            get dragAnchorIndex() { return dragAnchorIndex; },
            get dragSelectionPreview() { return dragSelectionPreview; },
            get hoveredCommentTarget() { return hoveredCommentTarget; },

            get mergePreview() {
                if (!draggingMerge || mergeT0 == null || mergeT1 == null) {
                    return null;
                }
                return {
                    t0: Math.min(mergeT0, mergeT1),
                    t1: Math.max(mergeT0, mergeT1)
                };
            },

            get split() {
                return {
                    active: splitMode,
                    sel: splitTarget,
                    t: splitTime,
                    i: splitSnappedIndex
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
