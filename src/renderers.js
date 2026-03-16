// -------------------------------------------------------------
// renderers.js
// Central redraw orchestration (Step 2)
// -------------------------------------------------------------

export function createRenderers({
    redrawXY,
    redrawTimeBar,
    redrawSettings = () => {}
}) {
    let xyPending = false;
    let timeBarPending = false;
    let settingsPending = false;
    let rafPending = false;

    function flush() {
        rafPending = false;

        const doXY = xyPending;
        const doTimeBar = timeBarPending;
        const doSettings = settingsPending;

        xyPending = false;
        timeBarPending = false;
        settingsPending = false;

        if (doXY) redrawXY();
        if (doTimeBar) redrawTimeBar();
        if (doSettings) redrawSettings();
    }

    function ensureRAF() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(flush);
    }

    function requestXY() {
        xyPending = true;
        ensureRAF();
    }

    function requestTimeBar() {
        timeBarPending = true;
        ensureRAF();
    }

    function requestFull() {
        xyPending = true;
        timeBarPending = true;
        settingsPending = true;
        ensureRAF();
    }

    return {
        redrawXY,
        redrawTimeBar,
        redrawSettings,

        redrawAll() {
            redrawXY();
            redrawTimeBar();
            redrawSettings();
        },

        requestXY,
        requestTimeBar,
        requestFull
    };
}