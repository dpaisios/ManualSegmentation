// -------------------------------------------------------------
// settings_ui.js — EXACT visual match to original app.js
// -------------------------------------------------------------

function lerp(a, b, t) {
    return a + (b - a) * t;
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

    return {
        items,
        fontSize,
        boxSize
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

    return null;
}
