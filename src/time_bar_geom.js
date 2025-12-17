// time_bar_geom.js
// -------------------------------------------------------------
// Time bar geometry & coordinate helpers
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

export function getTimeBoundsFromT(T) {
    return {
        tMin: T[0],
        tMax: T[T.length - 1]
    };
}

export function isPixelInsideAnySelection(
    xPixel, selections, W, H, T
) {
    if (!selections || selections.length === 0) return false;

    const { leftPad, barWidth } = timeBarGeom(W, H);
    const tMin = T[0];
    const tMax = T[T.length - 1];

    const t = pixelToTime(xPixel, leftPad, barWidth, tMin, tMax);
    for (const sel of selections) {
        if (t >= sel.t0 && t <= sel.t1) return true;
    }
    return false;
}