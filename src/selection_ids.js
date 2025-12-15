// -------------------------------------------------------------
// selection_ids.js
// Centralized ID logic for time-bar selections
// -------------------------------------------------------------

export function recomputeAutoIDs(selections) {
    const sorted = [...selections].sort((a, b) => a.t1 - b.t1);

    let pos = 1;
    for (const sel of sorted) {
        if (!sel.lockedID) {
            sel.id = "#" + pos;
        }
        pos++;
    }
}