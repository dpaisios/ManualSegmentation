// -------------------------------------------------------------
// selection_manager.js — faithful to your original app
// -------------------------------------------------------------

import * as ID from "./selection_ids.js";

// Delete by reference — identical to original app.js
export function deleteSelection(target, selections) {
    return selections.filter(s => s !== target);
}

export function updateSelection(selections, target, patch) {
    return selections.map(s =>
        s === target
            ? { ...s, ...patch }
            : s
    );
}
// Selection creation & merge semantics

function overlaps(a0, a1, b0, b1) {
    // strict overlap only: allows endpoint sharing without forced merge
    return a1 > b0 && a0 < b1;
}

function containedIn(a0, a1, b0, b1) {
    return a0 >= b0 && a1 <= b1;
}

export function nearestSampleIndex(T, t) {
    if (!Array.isArray(T) || T.length === 0 || !Number.isFinite(t)) return null;
    if (T.length === 1) return 0;

    let bestI = 0;
    let bestD = Math.abs(T[0] - t);

    for (let i = 1; i < T.length; i++) {
        const d = Math.abs(T[i] - t);
        if (d < bestD) {
            bestD = d;
            bestI = i;
        }
    }
    return bestI;
}

export function firstIndexAtTime(T, t) {
    if (!Array.isArray(T) || T.length === 0 || !Number.isFinite(t)) return null;

    for (let i = 0; i < T.length; i++) {
        if (T[i] === t) return i;
    }
    return null;
}

export function lastIndexAtTime(T, t) {
    if (!Array.isArray(T) || T.length === 0 || !Number.isFinite(t)) return null;

    for (let i = T.length - 1; i >= 0; i--) {
        if (T[i] === t) return i;
    }
    return null;
}

function expandDuplicateRunLeft(T, i) {
    let j = i;
    while (j > 0 && T[j - 1] === T[i]) j--;
    return j;
}

function expandDuplicateRunRight(T, i) {
    let j = i;
    while (j + 1 < T.length && T[j + 1] === T[i]) j++;
    return j;
}

export function resolveLeftBoundaryIndex(T, t) {
    if (!Array.isArray(T) || T.length === 0 || !Number.isFinite(t)) return null;

    const exact = firstIndexAtTime(T, t);
    if (Number.isFinite(exact)) return exact;

    const nearest = nearestSampleIndex(T, t);
    if (!Number.isFinite(nearest)) return null;

    return expandDuplicateRunLeft(T, nearest);
}

export function resolveRightBoundaryIndex(T, t) {
    if (!Array.isArray(T) || T.length === 0 || !Number.isFinite(t)) return null;

    const exact = lastIndexAtTime(T, t);
    if (Number.isFinite(exact)) return exact;

    const nearest = nearestSampleIndex(T, t);
    if (!Number.isFinite(nearest)) return null;

    return expandDuplicateRunRight(T, nearest);
}

function clampIndex(i, n) {
    if (!Number.isFinite(i)) return 0;
    if (n <= 0) return 0;
    return Math.max(0, Math.min(n - 1, i | 0));
}

function normalizeIndexPair(i0, i1, n) {
    let a = clampIndex(i0, n);
    let b = clampIndex(i1, n);
    if (a > b) [a, b] = [b, a];
    return [a, b];
}

export function syncSelectionToIndices(sel, T) {
    if (!sel || !Array.isArray(T) || T.length === 0) return sel;
    if (!Number.isFinite(sel.i0) || !Number.isFinite(sel.i1)) return sel;

    [sel.i0, sel.i1] = normalizeIndexPair(sel.i0, sel.i1, T.length);

    // For now keep handle times anchored to the snapped samples themselves.
    // Later renderers/controllers will use i0/i1 for exact membership/highlight.
    sel.t0 = T[sel.i0];
    sel.t1 = T[sel.i1];
    return sel;
}

export function selectionFromIndices(i0, i1, T) {
    const sel = {
        i0,
        i1,
        t0: 0,
        t1: 0,
        id: null,
        lockedID: false,
        bubbleAlpha: 0,
        flagged: false,
        comment: ""
    };

    return syncSelectionToIndices(sel, T);
}

function getSelectionRange(sel, T) {
    if (sel && Number.isFinite(sel.i0) && Number.isFinite(sel.i1)) {
        return { a0: sel.i0, a1: sel.i1};
    }

    const leftT  = Math.min(sel.t0, sel.t1);
    const rightT = Math.max(sel.t0, sel.t1);

    const i0 = resolveLeftBoundaryIndex(T, leftT);
    const i1 = resolveRightBoundaryIndex(T, rightT);

    return {
        a0: Math.min(i0, i1),
        a1: Math.max(i0, i1)
    };
}

function getInputRange(v0, v1, T) {
    const leftT  = Math.min(v0, v1);
    const rightT = Math.max(v0, v1);

    const i0 = resolveLeftBoundaryIndex(T, leftT);
    const i1 = resolveRightBoundaryIndex(T, rightT);

    return {
        a0: Math.min(i0, i1),
        a1: Math.max(i0, i1)
    };
}

function getInputIndexRange(i0, i1, T) {
    if (!Array.isArray(T) || !T.length) {
        return {
            a0: Math.min(i0, i1),
            a1: Math.max(i0, i1)
        };
    }

    const a = clampIndex(i0, T.length);
    const b = clampIndex(i1, T.length);

    return {
        a0: Math.min(a, b),
        a1: Math.max(a, b)
    };
}

export function applySelectionRanges({
    getSelections,
    setSelections,
    ranges,
    T = null
}) {
    const current = getSelections() || [];
    const next = addOrMergeSelectionIndexRanges(
        current,
        (ranges ?? []).map(r => {
            if (!r) return r;

            const i0 = resolveLeftBoundaryIndex(T, r.t0);
            const i1 = resolveRightBoundaryIndex(T, r.t1);

            return { i0, i1 };
        }),
        T
    );
    setSelections(next);
    return next;
}

export function addOrMergeSelectionIndexRange(selections, iStart, iEnd, T) {
    const inRange = getInputIndexRange(iStart, iEnd, T);
    const r0 = inRange.a0;
    const r1 = inRange.a1;

    if (r1 < r0) return selections;

    // fully contained → no-op
    for (const sel of selections) {
        const s = getSelectionRange(sel, T);
        if (containedIn(r0, r1, s.a0, s.a1)) {
            return ID.withRecomputedAutoIDs(selections);
        }
    }

    // find overlaps
    const overlapping = [];
    for (const sel of selections) {
        const s = getSelectionRange(sel, T);
        if (
            overlaps(r0, r1, s.a0, s.a1) ||
            containedIn(s.a0, s.a1, r0, r1)
        ) {
            overlapping.push(sel);
        }
    }

    // no overlap → new selection
    if (overlapping.length === 0) {
        const next = [...selections, selectionFromIndices(r0, r1, T)];
        return ID.withRecomputedAutoIDs(next);
    }

    // merge overlaps
    overlapping.sort((a, b) => {
        const ra = getSelectionRange(a, T);
        const rb = getSelectionRange(b, T);
        return (ra.a0 - rb.a0) || (ra.a1 - rb.a1);
    });

    const primary = overlapping[0];
    const p = getSelectionRange(primary, T);

    let merged0 = Math.min(p.a0, r0);
    let merged1 = Math.max(p.a1, r1);

    for (let i = 1; i < overlapping.length; i++) {
        const s = getSelectionRange(overlapping[i], T);
        merged0 = Math.min(merged0, s.a0);
        merged1 = Math.max(merged1, s.a1);
    }

    let updatedPrimary;

    updatedPrimary = syncSelectionToIndices(
        {
            ...primary,
            i0: merged0,
            i1: merged1
        },
        T
    );

    const next = selections
        .filter(s => s === primary || !overlapping.includes(s))
        .map(s => s === primary ? updatedPrimary : s);

    return ID.withRecomputedAutoIDs(next);
}

export function addOrMergeSelectionIndexRanges(selections, ranges, T) {
    let out = selections;
    for (const r of ranges ?? []) {
        if (!r) continue;
        out = addOrMergeSelectionIndexRange(out, r.i0, r.i1, T);
    }
    return out;
}

// -------------------------------------------------------------
// Split selection
// - validates by click in time bar
// - uses index-based guard if T is provided
// -------------------------------------------------------------
export function splitSelection(selections, targetSel, tSplit, T) {
    if (!targetSel) return selections;
    if (!Array.isArray(T) || T.length < 2) return selections;

    const base = getSelectionRange(targetSel, T);
    const splitI = nearestSampleIndex(T, tSplit);

    if (!Number.isFinite(splitI)) return selections;

    // Need at least one sample on each side.
    // Shared boundary sample is intentional, so:
    // left  = [i0 ... splitI]
    // right = [splitI ... i1]
    if (splitI <= base.a0 || splitI >= base.a1) return selections;

    const updatedLeft = syncSelectionToIndices(
        {
            ...targetSel,
            i0: base.a0,
            i1: splitI
        },
        T
    );

    const right = selectionFromIndices(splitI, base.a1, T);
    right.flagged = !!targetSel.flagged;
    right.comment = String(targetSel.comment ?? "");

    let finalLeft = updatedLeft;

    if (updatedLeft.lockedID && updatedLeft.id != null && updatedLeft.id !== "") {
        const root = String(updatedLeft.id);

        finalLeft = {
            ...updatedLeft,
            id: root + "_1",
            lockedID: true
        };

        right.id = root + "_2";
        right.lockedID = true;
    }

    const next = selections
        .map(s => s === targetSel ? finalLeft : s)
        .concat(right)
        .sort((a, b) => {
            const ra = getSelectionRange(a, T);
            const rb = getSelectionRange(b, T);
            return (ra.a0 - rb.a0) || (ra.a1 - rb.a1);
        });

    return ID.withRecomputedAutoIDs(next);
}

export function mergeSelectionsByEnvelope(
    selections,
    t0,
    t1,
    mergeSource = null,
    T = null
) {
    const env = getInputRange(t0, t1, T);
    const a = env.a0;
    const b = env.a1;

    if (b < a) return selections;

    const overlapping = selections.filter(s => {
        const r = getSelectionRange(s, T);
        return r.a1 > a && r.a0 < b;
    });

    if (overlapping.length < 2) {
        return selections;
    }

    let merged0 = Infinity;
    let merged1 = -Infinity;

    for (const s of overlapping) {
        const r = getSelectionRange(s, T);
        merged0 = Math.min(merged0, r.a0);
        merged1 = Math.max(merged1, r.a1);
    }

    const primary =
        mergeSource && overlapping.includes(mergeSource)
            ? mergeSource
            : overlapping[0];

    let updatedPrimary;

    if (Array.isArray(T) && T.length) {
        updatedPrimary = syncSelectionToIndices(
            {
                ...primary,
                i0: merged0,
                i1: merged1
            },
            T
        );
    }

    let next = selections
        .filter(s => s === primary || !overlapping.includes(s))
        .map(s => s === primary ? updatedPrimary : s);

    if (updatedPrimary.lockedID) {
        next = next.map(s => {
            if (s === updatedPrimary) return s;

            return {
                ...s,
                id: updatedPrimary.id,
                lockedID: true
            };
        });
    } else {
        next = ID.withRecomputedAutoIDs(next);
    }

    const anyFlagged = overlapping.some(s => !!s.flagged);

    next = next.map(s =>
        s === updatedPrimary
            ? { ...s, flagged: anyFlagged }
            : s
    );

    const anyComment =
        overlapping.map(s => String(s.comment ?? "").trim()).find(s => s.length) ?? "";
    if (anyComment) {
        next = next.map(s =>
            s === updatedPrimary &&
            !String(s.comment ?? "").trim()
                ? { ...s, comment: anyComment }
                : s
        );
    }

    return next;
}

export function clampLeftHandleIndex(selections, activeSel, proposedI0, T) {
    const cur = getSelectionRange(activeSel, T);
    const i1 = cur.a1;

    let blockRight = -Infinity;
    for (const sel of selections) {
        if (sel === activeSel) continue;
        const r = getSelectionRange(sel, T);

        // allow one shared boundary sample
        if (i1 > r.a0 && proposedI0 < r.a1) {
            blockRight = Math.max(blockRight, r.a1);
        }
    }

    let i0 = proposedI0;
    if (i0 < blockRight) i0 = blockRight;
    if (i0 > i1) i0 = i1;
    return i0;
}

export function clampRightHandleIndex(selections, activeSel, proposedI1, T) {
    const cur = getSelectionRange(activeSel, T);
    const i0 = cur.a0;

    let blockLeft = Infinity;
    for (const sel of selections) {
        if (sel === activeSel) continue;
        const r = getSelectionRange(sel, T);

        // allow one shared boundary sample
        if (proposedI1 > r.a0 && i0 < r.a1) {
            blockLeft = Math.min(blockLeft, r.a0);
        }
    }

    let i1 = proposedI1;
    if (i1 > blockLeft) i1 = blockLeft;
    if (i1 < i0) i1 = i0;
    return i1;
}

export function clampNewSelectionIndex(selections, anchorI, currI, T) {
    if (currI > anchorI) {
        let limitRight = Infinity;
        for (const sel of selections) {
            const r = getSelectionRange(sel, T);
            if (r.a0 > anchorI && currI > r.a0) {
                limitRight = Math.min(limitRight, r.a0);
            }
        }
        return Math.min(currI, limitRight);
    } else {
        let limitLeft = -Infinity;
        for (const sel of selections) {
            const r = getSelectionRange(sel, T);
            if (r.a1 < anchorI && currI < r.a1) {
                limitLeft = Math.max(limitLeft, r.a1);
            }
        }
        return Math.max(currI, limitLeft);
    }
}