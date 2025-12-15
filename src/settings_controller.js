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
                renderers.redrawXY();
            }
            return;
        }

        if (hit.type === "export") {
            exportData();
        }
    });

    return {
        setLayout
    };
}
