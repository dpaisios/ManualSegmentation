// -------------------------------------------------------------
// selection_manager.js — faithful to your original app
// -------------------------------------------------------------
/**
// Create a new selection
export function createSelection(tStart, tEnd) {
    const t0 = Math.min(tStart, tEnd);
    const t1 = Math.max(tStart, tEnd);
    return {
        t0,
        t1,
        bubbleAlpha: 0,
        id: null,        // displayed ID
        lockedID: false  // false = auto, true = user-edited
    };
}

// Add selection — the original app just appended, no merging
export function addSelection(sel, selections) {
    return [...selections, sel];
}
*/
// Delete by reference — identical to original app.js
export function deleteSelection(target, selections) {
    return selections.filter(s => s !== target);
}