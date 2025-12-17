// -------------------------------------------------------------
// selection_manager.js — faithful to your original app
// -------------------------------------------------------------

import * as ID from "./selection_ids.js";

// Delete by reference — identical to original app.js
export function deleteSelection(target, selections) {
    return selections.filter(s => s !== target);
}

// Selection creation & merge semantics

function overlaps(a0, a1, b0, b1) {
    return a1 > b0 && a0 < b1;
}

function containedIn(sel, t0, t1) {
    return t0 >= sel.t0 && t1 <= sel.t1;
}

function makeSelectionObject(t0, t1) {
    return {
        t0,
        t1,
        id: null,
        lockedID: false,
        bubbleAlpha: 0
    };
}

export function applySelectionRanges({
    getSelections,
    setSelections,
    ranges
}) {
    const current = getSelections() || [];
    const next = addOrMergeSelectionRanges(current, ranges);
    setSelections(next);
    return next;
}

export function addOrMergeSelectionRange(selections, tStart, tEnd) {
    const t0 = Math.min(tStart, tEnd);
    const t1 = Math.max(tStart, tEnd);
    if (!(t1 > t0)) return selections;

    // fully contained → no-op
    for (const sel of selections) {
        if (containedIn(sel, t0, t1)) {
            ID.recomputeAutoIDs(selections);
            return selections;
        }
    }

    // find overlaps
    const overlapping = [];
    for (const sel of selections) {
        if (
            overlaps(t0, t1, sel.t0, sel.t1) ||
            containedIn({ t0, t1 }, sel.t0, sel.t1)
        ) {
            overlapping.push(sel);
        }
    }

    // no overlap → new selection
    if (overlapping.length === 0) {
        const next = [...selections, makeSelectionObject(t0, t1)];
        ID.recomputeAutoIDs(next);
        return next;
    }

    // merge overlaps
    overlapping.sort((a, b) => (a.t0 - b.t0) || (a.t1 - b.t1));
    const primary = overlapping[0];

    let merged0 = Math.min(primary.t0, t0);
    let merged1 = Math.max(primary.t1, t1);

    for (let i = 1; i < overlapping.length; i++) {
        merged0 = Math.min(merged0, overlapping[i].t0);
        merged1 = Math.max(merged1, overlapping[i].t1);
    }

    primary.t0 = merged0;
    primary.t1 = merged1;

    const next = selections.filter(
        s => s === primary || !overlapping.includes(s)
    );

    ID.recomputeAutoIDs(next);
    return next;
}

export function addOrMergeSelectionRanges(selections, ranges) {
    let out = selections;
    for (const r of ranges ?? []) {
        if (!r) continue;
        out = addOrMergeSelectionRange(out, r.t0, r.t1);
    }
    return out;
}

export function clampLeftHandle(selections, activeSel, proposedT0) {
    const t1 = activeSel.t1;

    let blockRight = -Infinity;
    for (const sel of selections) {
        if (sel !== activeSel && t1 > sel.t0 && proposedT0 < sel.t1) {
            blockRight = Math.max(blockRight, sel.t1);
        }
    }

    let t0 = proposedT0;
    if (t0 < blockRight) t0 = blockRight;
    if (t0 > t1)         t0 = t1;
    return t0;
}

export function clampRightHandle(selections, activeSel, proposedT1) {
    const t0 = activeSel.t0;

    let blockLeft = Infinity;
    for (const sel of selections) {
        if (sel !== activeSel && proposedT1 > sel.t0 && t0 < sel.t1) {
            blockLeft = Math.min(blockLeft, sel.t0);
        }
    }

    let t1 = proposedT1;
    if (t1 > blockLeft) t1 = blockLeft;
    if (t1 < t0)        t1 = t0;
    return t1;
}

export function clampNewSelectionTime(selections, tAnchor, tCurr) {
    if (tCurr > tAnchor) {
        let limitRight = Infinity;
        for (const sel of selections) {
            if (sel.t0 > tAnchor && tCurr > sel.t0) {
                limitRight = Math.min(limitRight, sel.t0);
            }
        }
        return Math.min(tCurr, limitRight);
    } else {
        let limitLeft = -Infinity;
        for (const sel of selections) {
            if (sel.t1 < tAnchor && tCurr < sel.t1) {
                limitLeft = Math.max(limitLeft, sel.t1);
            }
        }
        return Math.max(tCurr, limitLeft);
    }
}

// -------------------------------------------------------------
// Split selection
// - validates by click in time bar
// - uses index-based guard if T is provided
// -------------------------------------------------------------
export function splitSelection(selections, targetSel, tSplit, T) {
    if (!targetSel) return selections;
    if (!(tSplit > targetSel.t0 && tSplit < targetSel.t1)) return selections;

    // optional safety: ensure at least 1 sample on each side
    if (Array.isArray(T) && T.length > 2) {
        let start = 0;
        while (start < T.length && T[start] < targetSel.t0) start++;
        let end = start;
        while (end < T.length && T[end] < targetSel.t1) end++;

        // nearest index to split
        let i = start;
        let best = Infinity;
        for (let k = start; k <= end && k < T.length; k++) {
            const d = Math.abs(T[k] - tSplit);
            if (d < best) {
                best = d;
                i = k;
            }
        }

        if (i <= start || i >= end) return selections;
    }

    const oldT1 = targetSel.t1;

    // mutate left in place
    targetSel.t1 = tSplit;

    // create right
    const right = makeSelectionObject(tSplit, oldT1);

    if (targetSel.lockedID && targetSel.id != null && targetSel.id !== "") {

        const base = String(targetSel.id);

        // Left segment becomes base_1
        targetSel.id = base + "_1";
        targetSel.lockedID = true;

        // Right segment becomes base_2
        right.id = base + "_2";
        right.lockedID = true;
    }

    const next = [...selections, right].sort((a, b) => (a.t0 - b.t0) || (a.t1 - b.t1));
    ID.recomputeAutoIDs(next);
    return next;
}

export function mergeSelectionsByEnvelope(
    selections,
    t0,
    t1,
    mergeSource = null
) {
    const a = Math.min(t0, t1);
    const b = Math.max(t0, t1);
    if (!(b > a)) return selections;

    const overlapping = selections.filter(
        s => s.t1 > a && s.t0 < b
    );

    if (overlapping.length < 2) {
        return selections;
    }

    let merged0 = Infinity;
    let merged1 = -Infinity;

    for (const s of overlapping) {
        merged0 = Math.min(merged0, s.t0);
        merged1 = Math.max(merged1, s.t1);
    }

    // --- canonical selection ---
    const primary =
        mergeSource && overlapping.includes(mergeSource)
            ? mergeSource
            : overlapping[0];

    primary.t0 = merged0;
    primary.t1 = merged1;

    const next = selections.filter(
        s => s === primary || !overlapping.includes(s)
    );

    // -------------------------------------------------
    // ID propagation rule
    // -------------------------------------------------
    if (primary.lockedID) {
        for (const s of next) {
            if (s === primary) continue;
            s.id       = primary.id;
            s.lockedID = true;
        }
    } else {
        ID.recomputeAutoIDs(next);
    }

    return next;
}
