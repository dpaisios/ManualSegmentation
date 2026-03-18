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

// -------------------------------------------------------------
// Exact sample-position geometry
// -------------------------------------------------------------
export function sampleIndexX(T, i, leftPad, barWidth, tMin, tMax) {
    const n = Array.isArray(T) ? T.length : 0;
    if (n === 0) return leftPad;

    const ii = Math.max(0, Math.min(n - 1, i | 0));
    const denom = (tMax - tMin);

    if (!Number.isFinite(denom) || denom === 0) {
        return leftPad + barWidth / 2;
    }

    return leftPad + ((T[ii] - tMin) / denom) * barWidth;
}

export function midpointXBetweenSamples(T, iLeft, iRight, leftPad, barWidth, tMin, tMax) {
    const n = Array.isArray(T) ? T.length : 0;
    if (n === 0) return leftPad;

    const a = Math.max(0, Math.min(n - 1, iLeft  | 0));
    const b = Math.max(0, Math.min(n - 1, iRight | 0));

    const tMid = 0.5 * (T[a] + T[b]);
    const denom = (tMax - tMin);

    if (!Number.isFinite(denom) || denom === 0) {
        return leftPad + barWidth / 2;
    }

    return leftPad + ((tMid - tMin) / denom) * barWidth;
}

// -------------------------------------------------------------
// Legacy midpoint boundary geometry
// Kept for compatibility while other files are migrated.
// -------------------------------------------------------------
export function indexBoundaryX(T, i, leftPad, barWidth, tMin, tMax) {
    const n = Array.isArray(T) ? T.length : 0;
    if (n === 0) return leftPad;
    if (n === 1) return leftPad + barWidth;

    if (i <= 0) return leftPad;
    if (i >= n) return leftPad + barWidth;

    const tLeft  = T[i - 1];
    const tRight = T[i];
    const tMid   = 0.5 * (tLeft + tRight);
    const denom  = (tMax - tMin);

    if (!Number.isFinite(denom) || denom === 0) {
        return leftPad + barWidth / 2;
    }

    return leftPad + ((tMid - tMin) / denom) * barWidth;
}

// -------------------------------------------------------------
// Tip runs
// -------------------------------------------------------------
export function getTipRuns(Tip, targetVal = 1) {
    const segs = [];
    const n = Array.isArray(Tip) ? Tip.length : 0;
    if (n === 0) return segs;

    let runStart = 0;
    let runVal   = Tip[0];

    for (let i = 1; i <= n; i++) {
        const changed = (i === n) || (Tip[i] !== runVal);
        if (!changed) continue;

        const runEnd = i - 1;
        if (runVal === targetVal) {
            segs.push({ i0: runStart, i1: runEnd });
        }

        runStart = i;
        runVal   = Tip[i];
    }

    return segs;
}

export function getStrokeLogicalSegments(Tip) {
    return getTipRuns(Tip, 1);
}

// Current renderer still imports this name.
// For now keep it returning all logical stroke runs.
// The singleton visual exception will be handled explicitly in drawing code.
export function getStrokeVisualSegments(Tip) {
    return getStrokeLogicalSegments(Tip);
}

export function getSelectionIntervalSegments(Tip, i0, i1) {
    const n = Array.isArray(Tip) ? Tip.length : 0;
    if (n < 2) return { blue: [], red: [] };
    if (!Number.isFinite(i0) || !Number.isFinite(i1)) {
        return { blue: [], red: [] };
    }

    const start = Math.max(0, Math.min(n - 1, Math.min(i0, i1) | 0));
    const end   = Math.max(0, Math.min(n - 1, Math.max(i0, i1) | 0));

    if (end <= start) {
        return { blue: [], red: [] };
    }

    const blue = [];
    const red = [];

    let curKind = null;
    let segStart = start;

    for (let k = start; k < end; k++) {
        const kind = (Tip[k] === 1 && Tip[k + 1] === 1) ? "blue" : "red";

        if (curKind == null) {
            curKind = kind;
            segStart = k;
            continue;
        }

        if (kind !== curKind) {
            const seg = { i0: segStart, i1: k };
            if (curKind === "blue") blue.push(seg);
            else red.push(seg);

            curKind = kind;
            segStart = k;
        }
    }

    const lastSeg = { i0: segStart, i1: end };
    if (curKind === "blue") blue.push(lastSeg);
    else red.push(lastSeg);

    return { blue, red };
}

// -------------------------------------------------------------
// Visual span for a contiguous run [i0, i1]
// Default: exact first-sample to last-sample
// Exception: isolated singleton between opposite-valued neighbors
// gets midpoint expansion for drawing only.
// -------------------------------------------------------------
export function getVisualRunSpanX(
    T,
    Tip,
    i0,
    i1,
    leftPad,
    barWidth,
    tMin,
    tMax
) {
    const nT = Array.isArray(T) ? T.length : 0;
    const nP = Array.isArray(Tip) ? Tip.length : 0;

    if (nT === 0 || nP !== nT) return null;
    if (!Number.isFinite(i0) || !Number.isFinite(i1)) return null;

    const a = Math.max(0, Math.min(nT - 1, i0 | 0));
    const b = Math.max(0, Math.min(nT - 1, i1 | 0));
    const start = Math.min(a, b);
    const end   = Math.max(a, b);

    const runLen = end - start + 1;
    const val = Tip[start];

    const isSingleton = runLen === 1;
    const hasPrev = start > 0;
    const hasNext = end < nT - 1;

    const isIsolatedSingleton =
        isSingleton &&
        hasPrev &&
        hasNext &&
        Tip[start - 1] !== val &&
        Tip[end + 1]   !== val &&
        Tip[start - 1] === Tip[end + 1];

    if (isIsolatedSingleton) {
        return {
            x0: midpointXBetweenSamples(T, start - 1, start, leftPad, barWidth, tMin, tMax),
            x1: midpointXBetweenSamples(T, end, end + 1, leftPad, barWidth, tMin, tMax)
        };
    }

    return {
        x0: sampleIndexX(T, start, leftPad, barWidth, tMin, tMax),
        x1: sampleIndexX(T, end,   leftPad, barWidth, tMin, tMax)
    };
}

export function nearestStrokeBoundaryIndexFromPixel(
    rawX,
    T,
    Tip,
    leftPad,
    barWidth,
    tMin,
    tMax,
    tolPx = 12
) {
    if (!Array.isArray(T) || !T.length) return null;
    if (!Array.isArray(Tip) || Tip.length !== T.length) return null;

    const segs = getStrokeLogicalSegments(Tip);
    if (!segs.length) return null;

    let bestI = null;
    let bestDx = Infinity;

    for (const s of segs) {
        const leftX  = sampleIndexX(T, s.i0, leftPad, barWidth, tMin, tMax);
        const rightX = sampleIndexX(T, s.i1, leftPad, barWidth, tMin, tMax);

        const dxL = Math.abs(rawX - leftX);
        if (dxL < bestDx) {
            bestDx = dxL;
            bestI = s.i0;
        }

        const dxR = Math.abs(rawX - rightX);
        if (dxR < bestDx) {
            bestDx = dxR;
            bestI = s.i1;
        }
    }

    return bestDx <= tolPx ? bestI : null;
}

export function clipSegmentsToRange(segs, i0, i1) {
    const out = [];

    for (const s of segs) {
        const a = Math.max(i0, s.i0);
        const b = Math.min(i1, s.i1);
        if (a <= b) out.push({ i0: a, i1: b });
    }

    return out;
}

export function invertSegmentsWithinRange(segs, i0, i1) {
    const out = [];
    let cur = i0;

    for (const s of segs) {
        if (s.i1 < cur) continue;
        if (s.i0 > i1) break;

        const a = Math.max(i0, s.i0);
        const b = Math.min(i1, s.i1);

        if (cur < a) out.push({ i0: cur, i1: a - 1 });
        cur = b + 1;
    }

    if (cur <= i1) out.push({ i0: cur, i1 });

    return out;
}

export function isPixelInsideAnySelection(
    xPixel, selections, W, H, T
) {
    if (!selections || selections.length === 0) return false;
    if (!Array.isArray(T) || T.length === 0) return false;

    const { leftPad, barWidth } = timeBarGeom(W, H);
    const tMin = T[0];
    const tMax = T[T.length - 1];

    const t = pixelToTime(xPixel, leftPad, barWidth, tMin, tMax);

    for (const sel of selections) {
        if (t >= sel.t0 && t <= sel.t1) return true;
    }
    return false;
}