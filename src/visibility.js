// -------------------------------------------------------------
// visibility.js
// Encodes visibility policy for pen-up / pen-down
// + missing-time visualization policy
// -------------------------------------------------------------

import { quantile } from "./stats_utils.js";
import { timeBarGeom } from "./time_bar_geom.js";

export function createVisibilityPolicy({ Tip, settingsOptions }) {

    function showPenUp() {
        return settingsOptions.find(o => o.label === "Show lifts").checked;
    }

    function getVisibleIndices(N) {
        if (showPenUp()) return [...Array(N).keys()];
        return [...Array(N).keys()].filter(i => Tip[i] === 1);
    }

    return {
        showPenUp,
        getVisibleIndices
    };
}

// -------------------------------------------------------------
// Missing-time overlay (policy + rendering)
// -------------------------------------------------------------
export function drawMissingTimeHatch(ctx, T, W, H) {
    if (!T || T.length < 3) return;

    // ---------------------------------------------
    // Detect unusually large temporal gaps (IQR)
    // ---------------------------------------------
    const dt = [];
    for (let i = 0; i < T.length - 1; i++) {
        dt.push(T[i + 1] - T[i]);
    }

    const q1 = quantile(dt, 0.25);
    const q3 = quantile(dt, 0.75);
    const iqr = q3 - q1;
    const thr = q3 + 1.5 * iqr;

    if (!Number.isFinite(thr)) return;

    // ---------------------------------------------
    // Geometry
    // ---------------------------------------------
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

        // Clip strictly to missing-time interval
        ctx.beginPath();
        ctx.rect(x0, barY0, x1 - x0, barY1 - barY0);
        ctx.clip();

        // Diagonal hatch
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