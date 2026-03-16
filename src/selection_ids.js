// -------------------------------------------------------------
// selection_ids.js
// Centralized ID logic for time-bar selections
// -------------------------------------------------------------

function sortByEnd(selections) {
    return [...selections].sort((a, b) => a.t1 - b.t1);
}

export function withRecomputedAutoIDs(selections) {
    const sorted = sortByEnd(selections);
    const updates = new Map();

    let pos = 1;
    for (const sel of sorted) {
        if (!sel.lockedID) {
            const nextId = "#" + pos;
            if (sel.id !== nextId) {
                updates.set(sel, nextId);
            }
        }
        pos++;
    }

    if (updates.size === 0) return selections;

    return selections.map(sel =>
        updates.has(sel)
            ? { ...sel, id: updates.get(sel) }
            : sel
    );
}