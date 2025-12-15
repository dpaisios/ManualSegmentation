// -------------------------------------------------------------
// settings_ui.js — EXACT visual match to original app.js
// -------------------------------------------------------------

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
            boxSize * 1.2;  // original spacing buffer

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

    // Export button (match original dimensions)
    const btnW = W * 0.12;
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
// Draw settings exactly like original app.js
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
    // Draw checkboxes exactly like original
    // -------------------------------------------------
    for (let i = 0; i < items.length; i++) {

        const it = items[i];
        const opt = options[i];

        // Box border (same stroke as old app.js)
        ctx.lineWidth = Math.max(2, boxSize * 0.12);
        ctx.strokeStyle = "#222";
        ctx.strokeRect(it.x, it.y, boxSize, boxSize);

        // Background
        ctx.fillStyle = "rgba(0,0,0,0.04)";
        ctx.fillRect(it.x, it.y, boxSize, boxSize);

        // Checkmark
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

        // Label text (match original)
        ctx.fillStyle = "black";
        ctx.fillText(
            opt.label,
            it.x + boxSize + fontSize * 0.6,
            midY
        );

        // Save full clickable region (original behavior)
        opt.fullX = it.x;
        opt.fullY = it.y;
        opt.fullW = it.width;
        opt.fullH = it.height;
    }

    // -------------------------------------------------
    // Draw Export button (exact original style)
    // -------------------------------------------------
    ctx.fillStyle = "#2b6cb0";
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

    ctx.strokeStyle = "black";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Export", btn.x + btn.w / 2, H / 2);

    return layout;
}


// -------------------------------------------------------------
// Hit testing (same logic as original)
// -------------------------------------------------------------
export function hitTestSettings(x, y, layout, options) {

    // Check options
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

    // Check export button
    const b = layout.btn;
    if (
        x >= b.x && x <= b.x + b.w &&
        y >= b.y && y <= b.y + b.h
    ) {
        return { type: "export" };
    }

    return null;
}
