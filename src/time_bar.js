// -------------------------------------------------------------
// time_bar.js — time bar with XY-based temporal dimming
// and clustered hover controls (delete + label)
// -------------------------------------------------------------

import { isEditingSelection } from "./label_editor.js";

// -------------------------------------------------------------
// Statistics helpers (for dt-based gap detection)
// -------------------------------------------------------------
function quantile(arr, p) {
    const a = [...arr].sort((x, y) => x - y);
    const pos = (a.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    return a[base + 1] !== undefined
        ? a[base] + rest * (a[base + 1] - a[base])
        : a[base];
}

// -------------------------------------------------------------
// Time tick helpers
// -------------------------------------------------------------
function niceStep(raw) {
    const exp = Math.floor(Math.log10(raw));
    const f   = raw / Math.pow(10, exp);

    let nf;
    if (f < 1.5)      nf = 1;
    else if (f < 3)   nf = 2;
    else if (f < 7)   nf = 5;
    else              nf = 10;

    return nf * Math.pow(10, exp);
}

function decimalsForStep(step) {
    if (!Number.isFinite(step) || step <= 0) return 0;
    const exp = Math.floor(Math.log10(step));
    return exp >= 0 ? 0 : Math.min(6, -exp); // cap to avoid silly labels
}

/**
 * Adaptive ticks; labels are the raw time values (no units).
 * @returns {Array<{t:number,label:string}>}
 */
export function computeTimeTicks(tMin, tMax, barWidthPx) {
    const TARGET_PX_PER_TICK = 90;

    const span = tMax - tMin;
    if (span <= 0 || barWidthPx <= 0) return [];

    const maxTicks = Math.max(2, Math.floor(barWidthPx / TARGET_PX_PER_TICK));
    const rawStep  = span / maxTicks;
    const step     = niceStep(rawStep);

    const tStart = Math.ceil(tMin / step) * step;
    const dec = decimalsForStep(step);

    const ticks = [];
    for (let t = tStart; t <= tMax + 1e-9; t += step) {
        ticks.push({ t, label: t.toFixed(dec) });
    }
    return ticks;
}

// -------------------------------------------------------------
// Geometry
// -------------------------------------------------------------
export function timeBarGeom(W, H) {
    const leftPad  = W * 0.05;
    const rightPad = W * 0.05;
    const barWidth = W - leftPad - rightPad;
    const barY0    = H * 0.45;
    const barY1    = H * 4.5 / 6;

    return { leftPad, rightPad, barWidth, barY0, barY1 };
}

export function pixelToTime(xPixel, leftPad, barWidth, tMin, tMax) {
    let rel = (xPixel - leftPad) / barWidth;
    rel = Math.max(0, Math.min(1, rel));
    return tMin + rel * (tMax - tMin);
}

export function getIndexRange(T, t0, t1) {
    let start = 0;
    while (start < T.length && T[start] < t0) start++;
    let end = start;
    while (end < T.length && T[end] < t1) end++;
    return [start, end];
}

// -------------------------------------------------------------
// Responsive element sizing
// -------------------------------------------------------------
export function getHandleSizes(H) {
    return {
        side:      Math.max(10, H * 0.05),
        margin:    Math.max(1,  H * 0.01),
        triOffset: H * 0.06
    };
}

export function getDeleteBubbleSize(H) {
    return {
        radius: Math.min(Math.max(10, H * 0.07), 15)
    };
}

// -------------------------------------------------------------
// Drawing helpers
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

// Time bar subsegments (Tip-coloured) used inside selections
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
        (tipVal === 1) ? "rgba(0,0,255,0.4)" : "rgba(255,50,50,0.4)";

    ctx.fillRect(x0, barY0, x1 - x0, barY1 - barY0);
}

// -------------------------------------------------------------
// Cluster layout for hover controls (delete bubble + label)
// -------------------------------------------------------------
const CLUSTER_GAP = 6;      // px between bubble and label
const LABEL_FONT  = "12px sans-serif";

function getLabelText(sel) {
    if (sel.id != null && sel.id !== "") return String(sel.id);
    return "";
}

// Computes all control positions for a given selection
// Returns:
// {
//   bubble: { cx, cy, r },
//   label:  { x, y, w, h }
// }
function computeClusterLayout(ctx, sel, T, W, H) {
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

    // Segment midpoint (in time-bar pixels)
    const mid = (x0 + x1) / 2;

    // ---------------------------------------------------------
    // Geometry:
    //   bubbleRight = mid - CLUSTER_GAP / 2
    //   labelLeft   = mid + CLUSTER_GAP / 2
    //
    //   bubbleCx = bubbleRight - radius
    //           = mid - (radius + CLUSTER_GAP / 2)
    //
    // => midpoint(bubbleRight, labelLeft) == mid
    // ---------------------------------------------------------
    const bubbleCx = mid - (radius + CLUSTER_GAP / 2);
    const bubbleCy = inwardTipY - radius;

    // Label sizing
    const labelText = getLabelText(sel);
    ctx.font = LABEL_FONT;

    const textW = ctx.measureText(labelText).width;
    const padX  = 6;

    const boxW = textW + padX * 2;
    const boxH = 2 * radius; // keep your choice: same visual height as bubble

    const xLabel = mid + CLUSTER_GAP / 2;   // left edge of ID field
    const yLabel = bubbleCy - boxH / 2;

    return {
        bubble: { cx: bubbleCx, cy: bubbleCy, r: radius },
        label:  { x: xLabel, y: yLabel, w: boxW, h: boxH }
    };
}

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

export function hitTestSelectionHover(
    x, y,
    selections, T,
    leftPad, barWidth,
    barY0, barY1,
    tMin, tMax
) {
    if (y < 1 || y > barY1) return null;

    for (let sel of selections) {
        const x0 = leftPad + (sel.t0 - tMin) / (tMax - tMin) * barWidth;
        const x1 = leftPad + (sel.t1 - tMin) / (tMax - tMin) * barWidth;
        if (x >= x0 && x <= x1) return sel;
    }
    return null;
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
// INTERNAL: diagonal hatch for missing-time intervals
// -------------------------------------------------------------
function drawMissingTimeHatch(ctx, T, W, H) {
    if (T.length < 3) return;

    // compute dt
    const dt = [];
    for (let i = 0; i < T.length - 1; i++) {
        dt.push(T[i + 1] - T[i]);
    }

    const q3  = quantile(dt, 0.75);
    const iqr = q3 - quantile(dt, 0.25);
    const thr = q3 + 1.5 * iqr;
    if (!Number.isFinite(thr)) return;

    const { leftPad, barWidth, barY0, barY1 } = timeBarGeom(W, H);
    const tMin = T[0];
    const tMax = T[T.length - 1];
    const h = barY1 - barY0;

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;

    for (let i = 0; i < dt.length; i++) {
        if (dt[i] <= thr) continue;

        const x0 =
            leftPad + (T[i]     - tMin) / (tMax - tMin) * barWidth;
        const x1 =
            leftPad + (T[i + 1] - tMin) / (tMax - tMin) * barWidth;

        ctx.save();

        // clip strictly to the missing-time interval
        ctx.beginPath();
        ctx.rect(x0, barY0, x1 - x0, barY1 - barY0);
        ctx.clip();

        // draw diagonal hatch inside clipped region
        for (let x = x0 - h; x < x1; x += 6) {
            ctx.beginPath();
            ctx.moveTo(x, barY1);
            ctx.lineTo(x + h, barY0);
            ctx.stroke();
        }

        ctx.restore();

    }

    ctx.restore();
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
