// -------------------------------------------------------------
// xy_plot.js
// Pure XY drawing module: no global state, no event listeners.
// Everything receives data + context as function arguments.
// -------------------------------------------------------------

// Helpers
function arrayMin(arr) {
    let m = Infinity;
    for (const v of arr) if (v < m) m = v;
    return m;
}

function arrayMax(arr) {
    let m = -Infinity;
    for (const v of arr) if (v > m) m = v;
    return m;
}

// Compute XY transform for scaling + centering
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

// Convert data → canvas coordinates
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
    // find time segment
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
    showUp
) {
    // base
    drawXY(ctx, X, Y, Tip, TipSeg, visibleIdxs, transform, canvasWidth, canvasHeight);

    // real selections
    for (let sel of selections) {
        let alpha = 0.75;
        if (tempSel) alpha = 0.4;
        drawXYHighlight(
            ctx, X, Y, Tip, TipSeg,
            T, sel.t0, sel.t1, alpha,
            transform, canvasWidth, canvasHeight,
            showUp
        );
    }

    // temporary selection (if drawing)
    if (tempSel) {
        drawXYHighlight(
            ctx, X, Y, Tip, TipSeg,
            T, tempSel.t0, tempSel.t1, 0.9,
            transform, canvasWidth, canvasHeight,
            showUp
        );
    }
}

// -------------------------------------------------------------
// XY selection box
// -------------------------------------------------------------
export function drawXYSelectionBox(ctx, box, W, H) {

    const x0 = Math.min(box.x0, box.x1);
    const x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const y1 = Math.max(box.y0, box.y1);

    ctx.save();

    // -------------------------------
    // Dim outside the rectangle
    // -------------------------------
    ctx.fillStyle = "rgba(0,0,0,0.30)";

    ctx.fillRect(0, 0, W, y0);                 // top
    ctx.fillRect(0, y1, W, H - y1);            // bottom
    ctx.fillRect(0, y0, x0, y1 - y0);          // left
    ctx.fillRect(x1, y0, W - x1, y1 - y0);     // right

    // -------------------------------
    // FORCE solid border
    // -------------------------------
    ctx.setLineDash([]);       // ← CRITICAL
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1.5;

    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    ctx.restore();
}