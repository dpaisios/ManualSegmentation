// -------------------------------------------------------------
// stats_utils.js
// Shared stat helpers (pure, no AppState/UI)
// -------------------------------------------------------------

export function arrayMin(arr) {
    let m = Infinity;
    for (const v of arr) if (v < m) m = v;
    return m;
}

export function arrayMax(arr) {
    let m = -Infinity;
    for (const v of arr) if (v > m) m = v;
    return m;
}

export function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function sd(arr) {
    if (arr.length <= 1) return 0;
    const m = mean(arr);
    const v = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v);
}

export function median(arr) {
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return (a.length % 2 === 0)
        ? (a[m - 1] + a[m]) / 2
        : a[m];
}

export function quantile(arr, p) {
    if (!arr.length) return NaN;
    const a = [...arr].sort((x, y) => x - y);
    const pos = (a.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    return (a[base + 1] !== undefined)
        ? a[base] + rest * (a[base + 1] - a[base])
        : a[base];
}

export function linSlope(x, y) {
    const n = x.length;
    const mx = mean(x), my = mean(y);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx;
        num += dx * (y[i] - my);
        den += dx * dx;
    }
    return den === 0 ? 0 : num / den;
}

export function linR2(x, y) {
    const n = x.length;
    const mx = mean(x), my = mean(y);
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx;
        const dy = y[i] - my;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }
    if (sxx === 0 || syy === 0) return 0;
    const r = sxy / Math.sqrt(sxx * syy);
    return r * r;
}
