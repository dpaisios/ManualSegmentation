// -------------------------------------------------------------
// settings_controller.js
// Handles settings canvas interactions (checkboxes + export)
// -------------------------------------------------------------

export function createExportSuccessAnimator({
    onUpdate,
    onDone
}) {
    const FADE_IN  = 150;
    const HOLD     = 900;
    const FADE_OUT = 500;

    return function run() {
        const t0 = performance.now();

        function frame(now) {
            const dt = now - t0;

            let p;
            if (dt < FADE_IN) {
                p = dt / FADE_IN;
            } else if (dt < FADE_IN + HOLD) {
                p = 1;
            } else if (dt < FADE_IN + HOLD + FADE_OUT) {
                p = 1 - (dt - FADE_IN - HOLD) / FADE_OUT;
            } else {
                onUpdate(0);
                onDone?.();
                return;
            }

            onUpdate(Math.max(0, Math.min(1, p)));
            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
    };
}

export function attachSettingsController({
    canvas,

    // state
    AppState,
    settingsOptions,

    // helpers
    hitTestSettings,
    loadData,
    originalRaw,
    exportPathOverrideGlobal,

    // NEW: injected reset hook
    resetXYSelection,

    // redraw hooks
    renderers,

    // export hook
    exportData
}) {
    let settingsLayout = null;

    function setLayout(layout) {
        settingsLayout = layout;
    }

    canvas.addEventListener("mousedown", e => {
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;

        const hit = hitTestSettings(x, y, settingsLayout, settingsOptions);
        if (!hit) return;

        if (hit.type === "checkbox") {
            const opt = settingsOptions[hit.index];
            opt.checked = !opt.checked;

            renderers.redrawSettings();

            if (
                opt.label === "Remove edge lifts" ||
                opt.label === "Remove last stroke"
            ) {
                loadData(
                    originalRaw,
                    null,
                    exportPathOverrideGlobal,
                    settingsOptions
                );

                resetXYSelection();   // ✅ SAFE, injected

                renderers.redrawXY();
                renderers.redrawTimeBar();
            }

            if (opt.label === "Show lifts") {
                resetXYSelection();   // ← REQUIRED
                renderers.redrawXY();
                renderers.redrawTimeBar();
            }
            return;
        }
    });

    return {
        setLayout
    };
}
