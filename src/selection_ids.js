// -------------------------------------------------------------
// selection_ids.js
// Centralized ID logic for time-bar selections
// -------------------------------------------------------------
/**
export function initAutoID(sel) {
    sel.id = null;
    sel.lockedID = false;
}

export function lockUserID(sel, value) {
    sel.id = value;
    sel.lockedID = true;
}

export function unlockUserID(sel) {
    sel.lockedID = false;
}
*/
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