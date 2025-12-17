// -------------------------------------------------------------
// time_bar_primitives.js
// Low-level drawing & layout primitives for time bar
// (cluster visuals are overlay-owned)
// -------------------------------------------------------------

import {
    timeBarGeom,
    getHandleSizes,
    getDeleteBubbleSize
} from "./time_bar_geom.js";

export const CLUSTER_GAP = 6;
export const LABEL_FONT = "12px sans-serif";

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
// Cluster layout (Split + Delete + Label)
// Geometry only — rendering happens in overlay
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

    // Vertical anchor: tip of inward handle triangle
    const inwardTipY = triY - halfH;

    const { radius } = getDeleteBubbleSize(H);
    const r = radius;

    // Final cluster anchor (no baseline bias — overlay handles text)
    const anchorY = inwardTipY - r;

    // Horizontal anchor: selection midpoint
    const mid = (x0 + x1) / 2;

    // Virtual cluster width: [split][delete][label footprint]
    const N = 3;
    const virtualW = N * (2 * r) + (N - 1) * CLUSTER_GAP;
    const leftEdge = mid - virtualW / 2;

    function centerOfItem(k) {
        return leftEdge + r + k * (2 * r + CLUSTER_GAP);
    }

    // --- Label box (text width driven, position anchored) ---
    const text = (sel.id != null && sel.id !== "") ? String(sel.id) : "";
    ctx.font = LABEL_FONT;

    const textW = ctx.measureText(text).width;
    const padX  = 6;

    const boxW = textW + padX * 2;
    const boxH = 2 * r;

    const labelCenterX = centerOfItem(2);
    const virtualLeftEdge = labelCenterX - r;

    const xLabel = Math.max(
        virtualLeftEdge,
        labelCenterX - boxW / 2
    );

    return {
        anchorY,

        split: {
            cx: centerOfItem(0),
            cy: anchorY,
            r
        },

        delete: {
            cx: centerOfItem(1),
            cy: anchorY,
            r
        },

        label: {
            x: xLabel,
            y: anchorY - boxH / 2,
            w: boxW,
            h: boxH
        },

        // debug / future-proofing
        mid,
        r,
        virtual: {
            leftEdge,
            width: virtualW
        }
    };
}

// -------------------------------------------------------------
// Cluster hit-testing helpers (geometry only)
// -------------------------------------------------------------
function hitCircle(xClick, yClick, cx, cy, r) {
    const dx = xClick - cx;
    const dy = yClick - cy;
    return dx * dx + dy * dy <= r * r;
}

export function hitTestClusterSplit(ctx, xClick, yClick, sel, T, W, H) {
    if (!sel) return false;
    const cluster = computeClusterLayout(ctx, sel, T, W, H);
    return hitCircle(
        xClick, yClick,
        cluster.split.cx,
        cluster.split.cy,
        cluster.split.r
    );
}

export function hitTestClusterDelete(ctx, xClick, yClick, sel, T, W, H) {
    if (!sel) return false;
    const cluster = computeClusterLayout(ctx, sel, T, W, H);
    return hitCircle(
        xClick, yClick,
        cluster.delete.cx,
        cluster.delete.cy,
        cluster.delete.r
    );
}

export function getClusterLabelRect(ctx, sel, T, W, H) {
    const cluster = computeClusterLayout(ctx, sel, T, W, H);
    return { ...cluster.label };
}
