// -------------------------------------------------------------
// renderers.js
// Central redraw orchestration (Step 2)
// -------------------------------------------------------------

export function createRenderers({
    redrawXY,
    redrawTimeBar,
    redrawSettings
}) {
    return {
        redrawXY,
        redrawTimeBar,
        redrawSettings,

        redrawAll() {
            redrawXY();
            redrawTimeBar();
            redrawSettings();
        }
    };
}
