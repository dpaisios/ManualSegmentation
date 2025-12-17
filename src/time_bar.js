// -------------------------------------------------------------
// time_bar.js — time bar with XY-based temporal dimming
// time bar rendering (background, handles, split preview)
// -------------------------------------------------------------

import { isEditingSelection } from "./label_editor.js";
import {
    timeBarGeom,
    getIndexRange,
    getHandleSizes
} from "./time_bar_geom.js";
import {
    drawTriangle,
    drawTimeSubSegment,
    LABEL_FONT
} from "./time_bar_primitives.js";
import { computeTimeTicks } from "./time_scale.js";
import { drawMissingTimeHatch } from "./visibility.js";

// -------------------------------------------------------------
// Hit testing (handles only; cluster is now in primitives)
// -------------------------------------------------------------
export function hitTestHandleRect(
    xClick, yClick,
    xLine, direction,
    barY0, barY1,
    H
) {
    const { side, margin, triOffset } = getHandleSizes(H);
    const triY = barY0 - triOffset;

    const width = side + margin;
    const extra = width / 2;

    let xMin, xMax;
    if (direction === "left") {
        xMin = xLine - extra;
        xMax = xLine + width;
    } else {
        xMin = xLine - width;
        xMax = xLine + extra;
    }

    const height = Math.sqrt(3) * side / 2;
    const halfH  = height / 2;

    const yMin = triY - 3 * halfH;
    const yMax = barY1;

    return (
        xClick >= xMin && xClick <= xMax &&
        yClick >= yMin && yClick <= yMax
    );
}

// -------------------------------------------------------------
// INTERNAL: highlight XY-selected temporal ranges (green overlay)
// -------------------------------------------------------------
function applyXYDimMask(ctx, T, W, H) {
    if (typeof window === "undefined") return;
    const ranges = window.xyTempTimeRanges;
    if (!ranges || !ranges.length) return;

    const { leftPad, barWidth, barY0, barY1 } = timeBarGeom(W, H);
    const tMin = T[0];
    const tMax = T[T.length - 1];

    let segs = ranges
        .map(r => {
            const t0 = Math.max(tMin, Math.min(tMax, r.t0));
            const t1 = Math.max(tMin, Math.min(tMax, r.t1));
            return t1 > t0 ? { t0, t1 } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.t0 - b.t0);

    if (segs.length === 0) return;

    const merged = [];
    let cur = { ...segs[0] };
    for (let i = 1; i < segs.length; i++) {
        const s = segs[i];
        if (s.t0 <= cur.t1) {
            cur.t1 = Math.max(cur.t1, s.t1);
        } else {
            merged.push(cur);
            cur = { ...s };
        }
    }
    merged.push(cur);

    ctx.save();
    ctx.fillStyle = "rgba(0, 255, 115, 0.25)";

    for (const s of merged) {
        const rel0 = (s.t0 - tMin) / (tMax - tMin);
        const rel1 = (s.t1 - tMin) / (tMax - tMin);

        const x0 = leftPad + rel0 * barWidth;
        const x1 = leftPad + rel1 * barWidth;

        ctx.fillRect(x0, barY0, x1 - x0, barY1 - barY0);
    }

    ctx.restore();
}

// -------------------------------------------------------------
// Split line preview (time bar)
// -------------------------------------------------------------
function drawSplitPreviewLine(ctx, x, barY0, barY1) {
    ctx.save();

    // 1) Dark outline (contrast layer)
    ctx.strokeStyle = "rgba(43,176,166,0.95)";
    ctx.lineWidth   = 5;
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(x, barY0 - 8);
    ctx.lineTo(x, barY1 + 8);
    ctx.stroke();

    // 2) Bright core (precision layer)
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth   = 2;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(x, barY0 - 8);
    ctx.lineTo(x, barY1 + 8);
    ctx.stroke();

    ctx.restore();
}

// -------------------------------------------------------------
// Full redraw
// -------------------------------------------------------------
// -------------------------------------------------------------
// Full redraw
// -------------------------------------------------------------
export function drawTimeBar(
    ctx,
    T, Tip,
    selections,
    tempSel,
    hoveredHandle,
    deleteTarget,
    W, H,
    splitState,
    mergePreview = null
) {
    if (!T || T.length === 0) {
        ctx.clearRect(0, 0, W, H);
        return;
    }

    const { leftPad, barWidth, barY0, barY1 } = timeBarGeom(W, H);
    const tMin = T[0];
    const tMax = T[T.length - 1];

    ctx.clearRect(0, 0, W, H);

    // ---------------------------------------------------------
    // 1) Base Tip-coloured background
    // ---------------------------------------------------------
    let segStart = 0;
    let lastTip  = Tip[0];

    for (let i = 1; i < T.length; i++) {
        if (Tip[i] !== lastTip) {
            const x0 = leftPad + (T[segStart] - tMin) / (tMax - tMin) * barWidth;
            const x1 = leftPad + (T[i]        - tMin) / (tMax - tMin) * barWidth;

            ctx.fillStyle = (lastTip === 0) ? "#bbb" : "#acacacff";
            ctx.fillRect(x0, barY0, x1 - x0, barY1 - barY0);

            segStart = i;
            lastTip  = Tip[i];
        }
    }

    {
        const x0 = leftPad + (T[segStart]     - tMin) / (tMax - tMin) * barWidth;
        const x1 = leftPad + (T[T.length - 1] - tMin) / (tMax - tMin) * barWidth;

        ctx.fillStyle = (lastTip === 0) ? "#bbb" : "#acacacff";
        ctx.fillRect(x0, barY0, x1 - x0, barY1 - barY0);
    }

    // ---------------------------------------------------------
    // 2) Ticks
    // ---------------------------------------------------------
    ctx.strokeStyle  = "black";
    ctx.fillStyle    = "black";
    ctx.font         = LABEL_FONT;
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";

    const ticks = computeTimeTicks(tMin, tMax, barWidth);

    for (const { t, label } of ticks) {
        const x  = leftPad + (t - tMin) / (tMax - tMin) * barWidth;
        const xp = Math.round(x) + 0.5;

        ctx.beginPath();
        ctx.moveTo(xp, barY1);
        ctx.lineTo(xp, barY1 + 6);
        ctx.stroke();

        ctx.fillText(label, xp, barY1 + 8);
    }

    // ---------------------------------------------------------
    // 2.5) XY-selected temporal ranges (RESTORED)
    // ---------------------------------------------------------
    applyXYDimMask(ctx, T, W, H);

    // ---------------------------------------------------------
    // 3) Selections
    // ---------------------------------------------------------
    const { side, triOffset } = getHandleSizes(H);
    const triY = barY0 - triOffset;

    function drawOneSelection(sel) {
        const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
        const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

        const [startIdx, endIdx] = getIndexRange(T, sel.t0, sel.t1);
        let lastTip  = Tip[startIdx];
        let segStart = startIdx;

        for (let i = startIdx + 1; i <= endIdx; i++) {
            if (Tip[i] !== lastTip) {
                drawTimeSubSegment(
                    ctx, T,
                    segStart, i, lastTip,
                    leftPad, barWidth, barY0, barY1,
                    tMin, tMax
                );
                lastTip  = Tip[i];
                segStart = i;
            }
        }

        drawTimeSubSegment(
            ctx, T,
            segStart, endIdx, lastTip,
            leftPad, barWidth, barY0, barY1,
            tMin, tMax
        );

        const baseColor  = "rgba(24,18,18,1)";
        const hoverColor = "rgba(119,115,107,1)";

        const leftHovered =
            hoveredHandle &&
            hoveredHandle.sel === sel &&
            hoveredHandle.side === "left";

        const rightHovered =
            hoveredHandle &&
            hoveredHandle.sel === sel &&
            hoveredHandle.side === "right";

        ctx.fillStyle   = leftHovered ? hoverColor : baseColor;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth   = 2;
        drawTriangle(ctx, x0, triY, side, "left", 2);
        ctx.beginPath();
        ctx.moveTo(x0, triY - 2);
        ctx.lineTo(x0, barY1);
        ctx.stroke();

        ctx.fillStyle   = rightHovered ? hoverColor : baseColor;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth   = 2;
        drawTriangle(ctx, x1, triY, side, "right", 2);
        ctx.beginPath();
        ctx.moveTo(x1, triY);
        ctx.lineTo(x1, barY1);
        ctx.stroke();
    }

    for (const sel of selections) drawOneSelection(sel);
    if (tempSel && !tempSel.__mergePreview) drawOneSelection(tempSel);

    // ---------------------------------------------------------
    // 3.5) MERGE PREVIEW BAND (TOP LAYER)
    // ---------------------------------------------------------
    if (mergePreview && mergePreview.t1 > mergePreview.t0) {

        const rel0 = (mergePreview.t0 - tMin) / (tMax - tMin);
        const rel1 = (mergePreview.t1 - tMin) / (tMax - tMin);

        const x0 = leftPad + rel0 * barWidth;
        const x1 = leftPad + rel1 * barWidth;

        const barH  = barY1 - barY0;
        const bandH = barH * 1 / 3;
        const bandY = barY0 + (barH - bandH) / 2;

        ctx.save();
        ctx.fillStyle = "rgba(43,176,166,.8)";
        ctx.fillRect(x0, bandY, x1 - x0, bandH);
        ctx.restore();
    }

    // ---------------------------------------------------------
    // 4) Split preview line
    // ---------------------------------------------------------
    if (splitState?.active && splitState?.t != null) {
        const x = leftPad + (splitState.t - tMin) / (tMax - tMin) * barWidth;
        const xp = Math.round(x) + 0.5;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, barY0 - 14, W, (barY1 - barY0) + 28);
        ctx.clip();

        drawSplitPreviewLine(ctx, xp, barY0, barY1);
        ctx.restore();
    }
}
