// -------------------------------------------------------------
// time_bar_primitives.js
// Low-level drawing & layout primitives for time bar
// -------------------------------------------------------------

import {
    timeBarGeom,
    getHandleSizes,
    getDeleteBubbleSize
} from "./time_bar_geom.js";

export const CLUSTER_GAP = 6;
export const LABEL_FONT = "12px sans-serif";

// -------------------------------------------------------------
// Label helper
// -------------------------------------------------------------
export function getLabelText(sel) {
    if (sel.id != null && sel.id !== "") return String(sel.id);
    return "";
}

// -------------------------------------------------------------
// Triangle (handle) drawing
// -------------------------------------------------------------
export function drawTriangle(ctx, x, y, side, direction, lineWidth = 2) {
    const height = Math.sqrt(3) * side / 2;
    const halfH  = height / 2;

    ctx.beginPath();

    if (direction === "left") {
        const edgeX = x - lineWidth / 2;
        ctx.moveTo(edgeX, y - 3 * halfH);
        ctx.lineTo(edgeX, y);
        ctx.lineTo(edgeX + side, y - halfH);
    } else {
        const edgeX = x + lineWidth / 2;
        ctx.moveTo(edgeX, y - halfH);
        ctx.lineTo(edgeX, y + 2 * halfH);
        ctx.lineTo(edgeX - side, y);
    }

    ctx.closePath();
    ctx.fill();
}

// -------------------------------------------------------------
// Time-bar subsegment drawing (Tip-colored)
// -------------------------------------------------------------
export function drawTimeSubSegment(
    ctx, T,
    iStart, iEnd, tipVal,
    leftPad, barWidth, barY0, barY1,
    tMin, tMax
) {
    const t0 = T[iStart];
    const t1 = T[iEnd];

    const rel0 = (t0 - tMin) / (tMax - tMin);
    const rel1 = (t1 - tMin) / (tMax - tMin);

    const x0 = leftPad + rel0 * barWidth;
    const x1 = leftPad + rel1 * barWidth;

    ctx.fillStyle =
        (tipVal === 1)
            ? "rgba(0,0,255,0.4)"
            : "rgba(255,50,50,0.4)";

    ctx.fillRect(x0, barY0, x1 - x0, barY1 - barY0);
}

// -------------------------------------------------------------
// Cluster layout (delete bubble + label)
// -------------------------------------------------------------
export function computeClusterLayout(ctx, sel, T, W, H) {
    const { leftPad, barWidth, barY0 } = timeBarGeom(W, H);
    const tMin = T[0];
    const tMax = T[T.length - 1];

    const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
    const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;

    const { side, triOffset } = getHandleSizes(H);
    const triY   = barY0 - triOffset * 2;
    const height = Math.sqrt(3) * side / 2;
    const halfH  = height / 2;

    const inwardTipY = triY - halfH;

    const { radius } = getDeleteBubbleSize(H);

    const mid = (x0 + x1) / 2;

    const bubbleCx = mid - (radius + CLUSTER_GAP / 2);
    const bubbleCy = inwardTipY - radius;

    const labelText = getLabelText(sel);
    ctx.font = LABEL_FONT;

    const textW = ctx.measureText(labelText).width;
    const padX  = 6;

    const boxW = textW + padX * 2;
    const boxH = 2 * radius;

    const xLabel = mid + CLUSTER_GAP / 2;
    const yLabel = bubbleCy - boxH / 2;

    return {
        bubble: { cx: bubbleCx, cy: bubbleCy, r: radius },
        label:  { x: xLabel, y: yLabel, w: boxW, h: boxH }
    };
}
