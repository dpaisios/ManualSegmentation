// -------------------------------------------------------------
// visibility.js
// Encodes visibility policy for pen-up / pen-down
// -------------------------------------------------------------

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
