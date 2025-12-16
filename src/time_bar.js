// -------------------------------------------------------------
// time_bar.js — time bar with XY-based temporal dimming
// and clustered hover controls (delete + label)
// -------------------------------------------------------------

import { isEditingSelection } from "./label_editor.js";
import {
    timeBarGeom,
    getIndexRange,
    getHandleSizes,
    getDeleteBubbleSize
} from "./time_bar_geom.js";
import {
    drawTriangle,
    drawTimeSubSegment,
    computeClusterLayout,
    getLabelText,
    CLUSTER_GAP,
    LABEL_FONT
} from "./time_bar_primitives.js";
import { computeTimeTicks } from "./time_scale.js";
import { drawMissingTimeHatch } from "./visibility.js";

// -------------------------------------------------------------
// Hit testing
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

// ID label rect (used also by app.js for DOM input)
export function getLabelRect(ctx, sel, T, W, H) {
    const cluster = computeClusterLayout(ctx, sel, T, W, H);
    return { ...cluster.label };
}

// Delete bubble hit-test: match drawDeleteBubble geometry
export function hitTestDeleteBubble(
    xClick, yClick,
    sel, T,
    leftPad, barWidth, barY0,
    tMin, tMax,
    H
) {
    if (!sel) return false;

    const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
    const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

    const { side, triOffset } = getHandleSizes(H);
    const triY   = barY0 - triOffset * 2;
    const height = Math.sqrt(3) * side / 2;
    const halfH  = height / 2;

    const { radius } = getDeleteBubbleSize(H);
    const inwardTipY = triY - halfH;

    // match computeClusterLayout geometry
    const mid      = (x0 + x1) / 2;
    const bubbleCx = mid - (radius + CLUSTER_GAP / 2);
    const bubbleCy = inwardTipY - radius;

    const dx = xClick - bubbleCx;
    const dy = yClick - bubbleCy;

    return dx * dx + dy * dy <= radius * radius;
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
// Full redraw
// -------------------------------------------------------------
export function drawTimeBar(
    ctx,
    T, Tip,
    selections,
    tempSel,
    hoveredHandle,
    deleteTarget,   // kept for signature parity; not used directly
    W, H,
) {
    if (!T || T.length === 0) {
        ctx.clearRect(0, 0, W, H);
        return;
    }

    const { leftPad, barWidth, barY0, barY1 } = timeBarGeom(W, H);
    const tMin = T[0];
    const tMax = T[T.length - 1];

    ctx.clearRect(0, 0, W, H);

    // 1) Base Tip-coloured background
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

    // 1b) XY temporal highlight under selections
    // Missing-time overlay
    drawMissingTimeHatch(ctx, T, W, H);

    // XY temporal highlight under selections
    applyXYDimMask(ctx, T, W, H);

    // 2) Ticks
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

    // 3) Selections (real + temp)
    const { side, triOffset } = getHandleSizes(H);
    const triY = barY0 - triOffset;

    function drawOneSelection(sel) {
        const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
        const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

        // Subsegments coloured by Tip
        const [startIdx, endIdx] = getIndexRange(T, sel.t0, sel.t1);
        let lastTip = Tip[startIdx];
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

        // Handles with hover colour
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

        // Left handle
        ctx.fillStyle   = leftHovered ? hoverColor : baseColor;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth   = 2;
        drawTriangle(ctx, x0, triY, side, "left", 2);
        ctx.beginPath();
        ctx.moveTo(x0, triY - 2);
        ctx.lineTo(x0, barY1);
        ctx.stroke();

        // Right handle
        ctx.fillStyle   = rightHovered ? hoverColor : baseColor;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth   = 2;
        drawTriangle(ctx, x1, triY, side, "right", 2);
        ctx.beginPath();
        ctx.moveTo(x1, triY);
        ctx.lineTo(x1, barY1);
        ctx.stroke();

        // Clustered hover controls (delete + label)
        if (sel.bubbleAlpha > 0.01) {
            const cluster = computeClusterLayout(ctx, sel, T, W, H);
            const { bubble, label } = cluster;
            const alpha = sel.bubbleAlpha;

            // Delete bubble
            ctx.save();
            ctx.globalAlpha = alpha;

            ctx.beginPath();
            ctx.arc(bubble.cx, bubble.cy, bubble.r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(236,60,60,0.95)";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(bubble.cx, bubble.cy, bubble.r, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(24,18,18,1)";
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            ctx.strokeStyle = "rgba(248,243,239,1)";
            ctx.lineWidth   = 2;
            const xSize = bubble.r * 0.38;

            ctx.beginPath();
            ctx.moveTo(bubble.cx - xSize, bubble.cy - xSize);
            ctx.lineTo(bubble.cx + xSize, bubble.cy + xSize);
            ctx.moveTo(bubble.cx + xSize, bubble.cy - xSize);
            ctx.lineTo(bubble.cx - xSize, bubble.cy + xSize);
            ctx.stroke();

            // Label box
            // ----------------------------------------------
            // Skip drawing label box entirely while editing
            // ----------------------------------------------
            if (!isEditingSelection(sel)) {
                const text = getLabelText(sel);

                ctx.fillStyle   = "rgba(255,255,255,0.95)";
                ctx.strokeStyle = "rgba(0,0,0,0.8)";
                ctx.lineWidth   = 1;
                ctx.fillRect(label.x, label.y, label.w, label.h);
                ctx.strokeRect(label.x, label.y, label.w, label.h);

                ctx.fillStyle    = "black";
                ctx.font         = LABEL_FONT;
                ctx.textAlign    = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(
                    text,
                    label.x + label.w / 2,
                    label.y + label.h / 2
                );
            }
            ctx.restore();
        }
    }

    for (let sel of selections) drawOneSelection(sel);
    if (tempSel) drawOneSelection(tempSel);
}
