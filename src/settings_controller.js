// -------------------------------------------------------------
// settings_controller.js
// Handles settings canvas interactions (checkboxes + export)
// -------------------------------------------------------------

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

    function animateExportSuccess() {
        const ctx = canvas.getContext("2d");

        const FADE_IN  = 150;
        const HOLD     = 900;
        const FADE_OUT = 500;

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
                ctx._exportAnimP = 0;
                renderers.redrawSettings();
                return;
            }

            ctx._exportAnimP = Math.max(0, Math.min(1, p));
            renderers.redrawSettings();
            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
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

        if (hit.type === "export") {
            (async () => {
                const ok = await exportData();
                if (ok) animateExportSuccess();
            })();
        }
    });

    return {
        setLayout
    };
}
