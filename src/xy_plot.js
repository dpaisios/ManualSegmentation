// -------------------------------------------------------------
// xy_plot.js
// Pure XY drawing module: no global state, no event listeners.
// Everything receives data + context as function arguments.
// -------------------------------------------------------------

import { arrayMin, arrayMax } from "./stats_utils.js";

// -------------------------------------------------------------
// Compute XY transform for scaling + centering
// -------------------------------------------------------------
export function computeXYTransform(X, Y, visibleIdxs, canvasWidth, canvasHeight) {

    if (visibleIdxs.length === 0) {
        return {
            minX: 0, minY: 0,
            offsetX: 0, offsetY: 0,
            scale: 1
        };
    }

    let minX = arrayMin(visibleIdxs.map(i => X[i]));
    let maxX = arrayMax(visibleIdxs.map(i => X[i]));
    let minY = arrayMin(visibleIdxs.map(i => Y[i]));
    let maxY = arrayMax(visibleIdxs.map(i => Y[i]));

    const marginX = (maxX - minX) * 0.1;
    const marginY = (maxY - minY) * 0.1;

    minX -= marginX;
    maxX += marginX;
    minY -= marginY;
    maxY += marginY;

    const w = maxX - minX;
    const h = maxY - minY;

    const scaleX = canvasWidth  / w;
    const scaleY = canvasHeight / h;

    const scale = Math.min(scaleX, scaleY);

    const offsetX = (canvasWidth  - w * scale) / 2;
    const offsetY = (canvasHeight - h * scale) / 2;

    return { minX, minY, offsetX, offsetY, scale };
}

// -------------------------------------------------------------
// Convert data → canvas coordinates
// -------------------------------------------------------------
export function toCanvasX(x, transform) {
    return transform.offsetX + (x - transform.minX) * transform.scale;
}
export function toCanvasY(y, canvasHeight, transform) {
    return canvasHeight - (transform.offsetY + (y - transform.minY) * transform.scale);
}

// -------------------------------------------------------------
// Base XY drawing
// -------------------------------------------------------------
export function drawXY(ctx, X, Y, Tip, TipSeg, visibleIdxs, transform, canvasWidth, canvasHeight) {

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.lineWidth = 2;

    let i = 0;
    while (i < visibleIdxs.length) {
        const idx = visibleIdxs[i];

        ctx.beginPath();

        if (Tip[idx] === 0) ctx.setLineDash([10, 10]);
        else ctx.setLineDash([]);

        ctx.strokeStyle = "rgba(80,80,80,0.3)";
        ctx.moveTo(
            toCanvasX(X[idx], transform),
            toCanvasY(Y[idx], canvasHeight, transform)
        );

        i++;
        while (
            i < visibleIdxs.length &&
            TipSeg[visibleIdxs[i]] === TipSeg[visibleIdxs[i - 1]]
        ) {
            const j = visibleIdxs[i];
            ctx.lineTo(
                toCanvasX(X[j], transform),
                toCanvasY(Y[j], canvasHeight, transform)
            );
            i++;
        }

        ctx.stroke();
    }
}

// -------------------------------------------------------------
// Highlight specific (t0, t1) on XY plot
// -------------------------------------------------------------
export function drawXYHighlight(
    ctx, X, Y, Tip, TipSeg,
    T, t0, t1, alpha,
    transform, canvasWidth, canvasHeight,
    showUp
) {
    let start = 0;
    while (start < T.length && T[start] < t0) start++;
    let end = start;
    while (end < T.length && T[end] < t1) end++;

    if (start >= T.length || end >= T.length) return;

    let i = start;
    while (i <= end) {

        if (!showUp && Tip[i] === 0) {
            i++;
            continue;
        }

        ctx.beginPath();

        if (Tip[i] === 0) {
            ctx.strokeStyle = `rgba(255,50,50,${alpha})`;
            ctx.setLineDash([10,10]);
        } else {
            ctx.strokeStyle = `rgba(0,0,255,${alpha})`;
            ctx.setLineDash([]);
        }

        ctx.moveTo(
            toCanvasX(X[i], transform),
            toCanvasY(Y[i], canvasHeight, transform)
        );
        i++;

        while (
            i <= end &&
            TipSeg[i] === TipSeg[i - 1] &&
            (showUp || Tip[i] !== 0)
        ) {
            ctx.lineTo(
                toCanvasX(X[i], transform),
                toCanvasY(Y[i], canvasHeight, transform)
            );
            i++;
        }

        ctx.stroke();
    }
}

// -------------------------------------------------------------
// Split marker (perpendicular to curve)
// -------------------------------------------------------------
function drawPerpSplitMarker(
    ctx, X, Y, T,
    tSplit,
    transform, W, H
) {
    if (tSplit == null) return;
    if (!T || T.length < 3) return;

    // nearest index
    let i = 0;
    let best = Infinity;
    for (let k = 0; k < T.length; k++) {
        const d = Math.abs(T[k] - tSplit);
        if (d < best) {
            best = d;
            i = k;
        }
    }

    const i0 = Math.max(0, i - 3);
    const i1 = Math.min(T.length - 1, i + 3);

    const x0 = X[i0], y0 = Y[i0];
    const x1 = X[i1], y1 = Y[i1];

    let vx = x1 - x0;
    let vy = y1 - y0;
    const len = Math.hypot(vx, vy);

    if (!Number.isFinite(len) || len < 1e-12) return;

    vx /= len;
    vy /= len;

    // perpendicular in data space
    let nx = -vy;
    let ny =  vx;

    const px = toCanvasX(X[i], transform);
    const py = toCanvasY(Y[i], H, transform);

    // scale normal into screen space (approx)
    const L = 10; // px half-length
    // convert a tiny step in data space to screen to estimate scale
    // (use transform.scale)
    const sx = nx * (L / transform.scale);
    const sy = ny * (L / transform.scale);

    const ax = toCanvasX(X[i] - sx, transform);
    const ay = toCanvasY(Y[i] - sy, H, transform);

    const bx = toCanvasX(X[i] + sx, transform);
    const by = toCanvasY(Y[i] + sy, H, transform);

    ctx.save();

    // glow
    ctx.strokeStyle = "rgba(43,176,166,0.25)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // crisp core
    ctx.strokeStyle = "rgba(43,176,166,0.95)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.restore();
}

// -------------------------------------------------------------
// Full XY redraw with selections
// -------------------------------------------------------------
// -------------------------------------------------------------
// Full XY redraw with selections
// -------------------------------------------------------------
export function drawXYFromSelections(
    ctx, X, Y, Tip, TipSeg,
    T,
    selections,
    tempSel,
    visibleIdxs,
    transform,
    canvasWidth,
    canvasHeight,
    showUp,
    // optional: split state { active, sel, t }
    splitState,
    // optional: hovered selection from time bar (uses t0/t1)
    hoveredSel = null
) {
    // ---------------------------------------------------------
    // State flags
    // ---------------------------------------------------------
    const splitting =
        !!splitState?.active &&
        !!splitState?.sel;

    const hoverDimmingActive =
        !!hoveredSel &&
        !tempSel &&
        !splitting &&
        Number.isFinite(hoveredSel.t0) &&
        Number.isFinite(hoveredSel.t1) &&
        hoveredSel.t1 > hoveredSel.t0;

    // ---------------------------------------------------------
    // 1) Draw BASE XY trace 
    // ---------------------------------------------------------
    drawXY(
        ctx,
        X, Y, Tip, TipSeg,
        visibleIdxs,
        transform,
        canvasWidth,
        canvasHeight
    );

    // ---------------------------------------------------------
    // 2) Draw selection highlights
    // ---------------------------------------------------------
    for (const sel of selections) {
        let alpha;

        if (tempSel) {
            // temp selection creation dims everything uniformly
            alpha = 0.4;
        } else if (splitting) {
            // split mode: active selection emphasized
            alpha = (sel === splitState.sel) ? 0.9 : 0.25;
        } else if (hoverDimmingActive) {
            // hover time selection: hovered emphasized
            alpha = (sel === hoveredSel) ? 0.9 : 0.15;
        } else {
            // normal state
            alpha = 0.75;
        }

        drawXYHighlight(
            ctx, X, Y, Tip, TipSeg,
            T, sel.t0, sel.t1, alpha,
            transform, canvasWidth, canvasHeight,
            showUp
        );
    }

    // ---------------------------------------------------------
    // 3) Temp selection highlight (during creation)
    // ---------------------------------------------------------
    if (tempSel) {
        drawXYHighlight(
            ctx, X, Y, Tip, TipSeg,
            T, tempSel.t0, tempSel.t1, 0.9,
            transform, canvasWidth, canvasHeight,
            showUp
        );
    }

    // ---------------------------------------------------------
    // 4) Split marker (unchanged)
    // ---------------------------------------------------------
    if (splitting && splitState.t != null) {
        drawPerpSplitMarker(
            ctx, X, Y, T,
            splitState.t,
            transform, canvasWidth, canvasHeight
        );
    }
}

// -------------------------------------------------------------
// Confirm bubble helper
// -------------------------------------------------------------
function drawConfirmBubble(ctx, cx, cy, r) {
    ctx.save();

    // Stronger, cleaner elevation
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // High-contrast fill (works on light & dark backgrounds)
    ctx.fillStyle = "#2ecc71"; // keep green, but solid

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // White outline for separation from dimmed background
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.25;
    ctx.stroke();

    // Checkmark
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy);
    ctx.lineTo(cx - r * 0.1,  cy + r * 0.35);
    ctx.lineTo(cx + r * 0.45, cy - r * 0.35);
    ctx.stroke();

    ctx.restore();
}

// -------------------------------------------------------------
// XY selection box with hover + commit bubble
// -------------------------------------------------------------
export function drawXYSelectionBox(ctx, box, W, H) {
    if (!box) return;

    const x0 = Math.min(box.x0, box.x1);
    const x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const y1 = Math.max(box.y0, box.y1);

    ctx.save();

    // Dim outside
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(0, 0, W, y0);
    ctx.fillRect(0, y1, W, H - y1);
    ctx.fillRect(0, y0, x0, y1 - y0);
    ctx.fillRect(x1, y0, W - x1, y1 - y0);

    // Base rectangle
    ctx.setLineDash([]);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // Hover highlight
    if (box._hover) {
        ctx.strokeStyle = "rgba(63, 64, 99, 1)";
        ctx.lineWidth = 3;

        ctx.beginPath();
        switch (box._hover) {
            case "left":   ctx.moveTo(x0,y0); ctx.lineTo(x0,y1); break;
            case "right":  ctx.moveTo(x1,y0); ctx.lineTo(x1,y1); break;
            case "top":    ctx.moveTo(x0,y0); ctx.lineTo(x1,y0); break;
            case "bottom": ctx.moveTo(x0,y1); ctx.lineTo(x1,y1); break;
            case "nw":
                ctx.moveTo(x0,y0); ctx.lineTo(x0,y1);
                ctx.moveTo(x0,y0); ctx.lineTo(x1,y0);
                break;
            case "ne":
                ctx.moveTo(x1,y0); ctx.lineTo(x1,y1);
                ctx.moveTo(x0,y0); ctx.lineTo(x1,y0);
                break;
            case "sw":
                ctx.moveTo(x0,y0); ctx.lineTo(x0,y1);
                ctx.moveTo(x0,y1); ctx.lineTo(x1,y1);
                break;
            case "se":
                ctx.moveTo(x1,y0); ctx.lineTo(x1,y1);
                ctx.moveTo(x0,y1); ctx.lineTo(x1,y1);
                break;
        }
        ctx.stroke();
    }

    // Commit bubble
    if (box._canCommit) {
        const cx = x1 + 18;
        const cy = (y0 + y1) / 2;
        const r  = 12;

        drawConfirmBubble(ctx, cx, cy, r);
        box._commitBubble = { cx, cy, r };
    } else {
        box._commitBubble = null;
    }

    ctx.restore();
}
