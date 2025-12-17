// -------------------------------------------------------------
// settings_ui.js — EXACT visual match to original app.js
// -------------------------------------------------------------

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpColor(c0, c1, t) {
    return {
        r: Math.round(lerp(c0.r, c1.r, t)),
        g: Math.round(lerp(c0.g, c1.g, t)),
        b: Math.round(lerp(c0.b, c1.b, t))
    };
}

// Smoothstep easing (better UI feel than linear)
function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

export function computeSettingsLayout(W, H, options) {

    const boxSize  = Math.min(Math.max(12, H * 0.35), 20);
    const fontSize = Math.min(Math.max(10, H * 0.35), 18);
    const padding  = W * 0.02;

    const midY = H / 2;
    let x = padding;

    const items = [];

    // Same font / metrics as original
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${fontSize}px sans-serif`;

    for (let opt of options) {

        const textWidth = ctx.measureText(opt.label).width;

        const fullW =
            boxSize +
            fontSize * 0.6 +
            textWidth +
            boxSize * 1.2;

        items.push({
            label: opt.label,
            x: x,
            y: midY - boxSize / 2,
            boxSize,
            width: fullW,
            height: boxSize,
            labelWidth: textWidth
        });

        x += fullW;
    }

    // Export button
    const btnW = W * 0.10;
    const btnH = H * 0.55;
    const btnX = W - btnW - padding;
    const btnY = midY - btnH / 2;

    return {
        items,
        fontSize,
        boxSize,
        btn: { x: btnX, y: btnY, w: btnW, h: btnH }
    };
}


// -------------------------------------------------------------
// Draw settings
// -------------------------------------------------------------
export function drawSettings(ctx, W, H, options) {

    ctx.clearRect(0, 0, W, H);

    const layout = computeSettingsLayout(W, H, options);
    const { items, fontSize, boxSize, btn } = layout;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `${fontSize}px sans-serif`;

    const midY = H / 2;

    // -------------------------------------------------
    // Checkboxes (unchanged)
    // -------------------------------------------------
    for (let i = 0; i < items.length; i++) {

        const it = items[i];
        const opt = options[i];

        ctx.lineWidth = Math.max(2, boxSize * 0.12);
        ctx.strokeStyle = "#222";
        ctx.strokeRect(it.x, it.y, boxSize, boxSize);

        ctx.fillStyle = "rgba(0,0,0,0.04)";
        ctx.fillRect(it.x, it.y, boxSize, boxSize);

        if (opt.checked) {
            ctx.strokeStyle = "#111";
            ctx.lineWidth = Math.max(2, boxSize * 0.15);
            ctx.lineCap = "round";

            const cx  = it.x + boxSize * 0.22;
            const cy  = it.y + boxSize * 0.55;
            const cx2 = it.x + boxSize * 0.45;
            const cy2 = it.y + boxSize * 0.75;
            const cx3 = it.x + boxSize * 0.80;
            const cy3 = it.y + boxSize * 0.25;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx2, cy2);
            ctx.lineTo(cx3, cy3);
            ctx.stroke();
        }

        ctx.fillStyle = "black";
        ctx.fillText(
            opt.label,
            it.x + boxSize + fontSize * 0.6,
            midY
        );

        opt.fullX = it.x;
        opt.fullY = it.y;
        opt.fullW = it.width;
        opt.fullH = it.height;
    }

    // -------------------------------------------------
    // Export button (smooth animated feedback)
    // -------------------------------------------------
    const r = Math.min(6, btn.h / 2);

    const pRaw = ctx._exportAnimP ?? 0;
    const p = smoothstep(Math.max(0, Math.min(1, pRaw)));

    const baseBlue   = { r: 59,  g: 130, b: 246 }; // #3b82f6
    const successGreen = { r: 34, g: 197, b: 94 }; // #22c55e

    const color =
        p > 0
            ? lerpColor(baseBlue, successGreen, p)
            : baseBlue;

    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;

    ctx.beginPath();
    ctx.moveTo(btn.x + r, btn.y);
    ctx.lineTo(btn.x + btn.w - r, btn.y);
    ctx.quadraticCurveTo(btn.x + btn.w, btn.y, btn.x + btn.w, btn.y + r);
    ctx.lineTo(btn.x + btn.w, btn.y + btn.h - r);
    ctx.quadraticCurveTo(btn.x + btn.w, btn.y + btn.h, btn.x + btn.w - r, btn.y + btn.h);
    ctx.lineTo(btn.x + r, btn.y + btn.h);
    ctx.quadraticCurveTo(btn.x, btn.y + btn.h, btn.x, btn.y + btn.h - r);
    ctx.lineTo(btn.x, btn.y + r);
    ctx.quadraticCurveTo(btn.x, btn.y, btn.x + r, btn.y);
    ctx.fill();

    // Text: switch only once clearly green
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const label = (p > 0.35) ? "Exported" : "Export";

    ctx.fillText(
        label,
        btn.x + btn.w / 2,
        btn.y + btn.h / 2
    );

    return layout;
}


// -------------------------------------------------------------
// Hit testing (unchanged)
// -------------------------------------------------------------
export function hitTestSettings(x, y, layout, options) {

    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (
            x >= opt.fullX &&
            x <= opt.fullX + opt.fullW &&
            y >= opt.fullY &&
            y <= opt.fullY + opt.fullH
        ) {
            return { type: "checkbox", index: i };
        }
    }

    const b = layout.btn;
    if (
        x >= b.x && x <= b.x + b.w &&
        y >= b.y && y <= b.y + b.h
    ) {
        return { type: "export" };
    }

    return null;
}
