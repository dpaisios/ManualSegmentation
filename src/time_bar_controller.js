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

    let hoveredCommentTarget = null;

    // Split mode
    let splitMode    = false;
    let splitTarget  = null;    // sel | null
    let splitTime    = null;    // number | null (hover)

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
        hoveredCommentTarget = null;
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

    // ---------------------------------------------------------
    // MOUSEDOWN
    // ---------------------------------------------------------
    canvas.addEventListener("mousedown", e => {
        if (getSuppressCanvasClicks?.()) return;
        if (!haveData()) return;

        const selections = getSelections() || [];

        // Block all interactions while editing a label
        if (anyEditingSelectionIn(selections) || anyEditingCommentIn(selections)) return;

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

                canvas.style.cursor = "default";
                redrawTimeBar();
                redrawXY();
                return;
            }

            // CASE 2 — ANY other click → cancel split mode
            exitSplitMode();
            clearDragState();

            canvas.style.cursor = "default";
            redrawTimeBar();
            redrawXY();
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
                redrawTimeBar();

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
                splitMode   = true;
                splitTarget = sel;
                splitTime   = null;

                clearDragState();
                clearHoverState();

                deleteTarget = sel;
                canvas.style.cursor = "crosshair";
                redrawTimeBar();
                redrawXY();
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
                    redrawTimeBar();
                    redrawXY();
                    return;
                }

                // placeholder: use new helper getClusterCommentRect(...)
                const r = getClusterCommentRect(ctx, sel, T, canvas.width, canvas.height);

                deleteTarget = sel;
                redrawTimeBar();

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
            ID.recomputeAutoIDs(next);

            clearDragState();
            // DO NOT clearHoverState() here: prevents bubble blink

            redrawTimeBar();
            redrawXY();
            return;
        }

        // -------------------------------------------------
        // Flag bubble (toggle)
        // -------------------------------------------------
        for (const sel of selections) {
            if ((sel.bubbleAlpha ?? 0) <= 0.01) continue;

            if (hitTestClusterFlag(ctx, x, y, sel, T, canvas.width, canvas.height)) {
                sel.flagged = !sel.flagged;

                // bump version (via app.js setSelections hook)
                setSelections([...selections]);

                deleteTarget = sel;
                redrawTimeBar();
                redrawXY();
                return;
            }
        }

        clearDragState();

        // -------------------------------------------------
        // Handle drags?
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
        // Merge drag: click inside selection body
        // -------------------------------------------------
        for (const sel of selections) {
            const tClick = pixelToTime(
                clamp(x, leftPad, leftPad + barWidth),
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

        const editingSel = getEditingSelection(selections) || getEditingCommentSelection(selections);

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
        // Merge drag update
        // -------------------------------------------------
        if (draggingMerge) {
            const t = pixelToTime(x, leftPad, barWidth, tMin, tMax);
            mergeT1 = t;

            const gaps = computeMergeFillGaps(selections, mergeT0, mergeT1);

            tempSelection = { __mergePreview: true, gaps };

            redrawTimeBar();
            redrawXY();
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
            let bestHandle = null;
            let bestDist   = Infinity;

            // -------------------------------------------------
            // 1) If pointer is ON the TIME BAR, choose segment by BAR HIT ONLY.
            //    This ignores cluster width entirely (your requested behavior).
            // -------------------------------------------------
            if (y >= barY0 && y <= barY1) {

                let under = null;

                for (const sel of selections) {
                    const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
                    const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

                    // handle hover (same as before)
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
                    redrawTimeBar();
                    return;
                }

                deleteTarget = under;
                canvas.style.cursor = "default";
                redrawTimeBar();
                redrawXY();
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
                    redrawTimeBar();
                    redrawXY();
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
                redrawTimeBar();
                return;
            }

            deleteTarget = bestSel;
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
                Select.clampLeftHandle(selections, draggingStartHandle, proposedT0);

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
                Select.clampRightHandle(selections, draggingEndHandle, proposedT1);

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
                Select.clampNewSelectionTime(selections, tStart, tCurr);

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
                mergeSource
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
            redrawTimeBar();
            redrawXY();
            return;
        }

        // -------------------------------------------------
        // 2) Split mode (no-op: split commits on mousedown)
        // -------------------------------------------------
        if (splitMode) {
            return;
        }

        // -------------------------------------------------
        // 3) New selection creation commit
        // -------------------------------------------------
        if (dragging && tempSelection && tempSelection.t1 > tempSelection.t0) {
            const next = Select.addOrMergeSelectionRange(
                selections,
                tempSelection.t0,
                tempSelection.t1
            );
            setSelections(next);
        }

        // -------------------------------------------------
        // 4) Cleanup
        // -------------------------------------------------
        clearDragState();

        canvas.style.cursor = "default";
        redrawTimeBar();
        redrawXY();
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
            redrawTimeBar();
            redrawXY();          // <-- ADD THIS
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
        redrawXY();              // <-- ADD THIS
    });

    // ---------------------------------------------------------
    // Public controller state
    // ---------------------------------------------------------
    return {
        state: {
            get hoveredHandle() { return hoveredHandle; },
            get deleteTarget()  { return deleteTarget; },
            get tempSelection() { return tempSelection; },
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
