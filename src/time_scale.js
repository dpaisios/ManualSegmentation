// time_scale.js
// -------------------------------------------------------------
// Time scale helpers (ticks & labels)
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
    return exp >= 0 ? 0 : Math.min(6, -exp);
}

/**
 * Adaptive ticks; labels are raw time values.
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
