// -------------------------------------------------------------
// geometry.js
// Generic reusable math + geometry helpers
// -------------------------------------------------------------

export function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
}

export function computeTimeRangesFromXYBox({
    box,
    X, Y, T,
    visibleIndices,
    transform,
    canvasHeight
}) {
    if (!box) return [];

    const x0 = Math.min(box.x0, box.x1);
    const x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const y1 = Math.max(box.y0, box.y1);

    const dataXmin = transform.minX + (x0 - transform.offsetX) / transform.scale;
    const dataXmax = transform.minX + (x1 - transform.offsetX) / transform.scale;
    const dataYmax = transform.minY + (canvasHeight - y0 - transform.offsetY) / transform.scale;
    const dataYmin = transform.minY + (canvasHeight - y1 - transform.offsetY) / transform.scale;

    const inside = [];
    for (let i of visibleIndices) {
        if (
            X[i] >= dataXmin && X[i] <= dataXmax &&
            Y[i] >= dataYmin && Y[i] <= dataYmax
        ) {
            inside.push(i);
        }
    }

    if (!inside.length) return [];

    const out = [];
    let s = inside[0], prev = inside[0];
    for (let k = 1; k < inside.length; k++) {
        if (inside[k] !== prev + 1) {
            out.push({ t0: T[s], t1: T[prev] });
            s = inside[k];
        }
        prev = inside[k];
    }
    out.push({ t0: T[s], t1: T[prev] });
    return out;
}
