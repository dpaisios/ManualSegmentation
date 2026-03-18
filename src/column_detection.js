// -------------------------------------------------------------
// column_detection.js
// Pure automatic column-detection module
//
// Exports:
//   detectColumns(data, colNames, manualOverrides?)
//   buildCanonicalFields(data, detectedCols)
//   computeTipSeg(data)
//   timeNormalization(data)
// -------------------------------------------------------------

import {
    arrayMin,
    mean,
    sd,
    median,
    linSlope,
    linR2
} from "./stats_utils.js";

// -------------------------------------------------------------
// Constants
// -------------------------------------------------------------
const Z_Q99 = 2.3263478740408408;

// -------------------------------------------------------------
// Run-length IDs
// -------------------------------------------------------------
function rleidJS(arr) {
    const out = [];
    let id = 1;
    let prev = arr[0];

    out[0] = 1;

    for (let i = 1; i < arr.length; i++) {
        if (arr[i] !== prev) {
            id++;
            prev = arr[i];
        }
        out[i] = id;
    }

    return out;
}

// -------------------------------------------------------------
// Basic helpers
// -------------------------------------------------------------
function findCol(colNames, candidates) {
    for (const name of candidates) {
        const idx = colNames.indexOf(name);
        if (idx !== -1) return idx;
    }
    return null;
}

function diffArray(arr) {
    const out = [];
    for (let i = 1; i < arr.length; i++) {
        out.push(arr[i] - arr[i - 1]);
    }
    return out;
}

function medianAbsDeviation(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return NaN;
    const m = median(arr);
    const absDev = arr.map(v => Math.abs(v - m));
    return median(absDev);
}

function uniqueFiniteValues(arr, maxCount = Infinity) {
    const out = new Set();

    for (const v of arr) {
        if (!Number.isFinite(v)) continue;
        out.add(v);
        if (out.size >= maxCount) break;
    }

    return [...out];
}

function isTwoValuedVariable(arr) {
    return uniqueFiniteValues(arr, 3).length === 2;
}

function isAllZeroVariable(arr) {
    const vals = uniqueFiniteValues(arr, 2);
    return vals.length === 1 && vals[0] === 0;
}

function countIf(arr, pred) {
    let n = 0;
    for (const v of arr) {
        if (pred(v)) n++;
    }
    return n;
}

function required75(n) {
    if (n <= 0) return 0;
    return Math.max(1, Math.floor(0.75 * n));
}

function uniqueBestIndexByScore(items, scoreKey, threshold = -Infinity) {
    const valid = items.filter(it =>
        Number.isFinite(it[scoreKey]) && it[scoreKey] > threshold
    );

    if (!valid.length) return null;

    let best = valid[0];
    let tie = false;

    for (let i = 1; i < valid.length; i++) {
        const cur = valid[i];
        if (cur[scoreKey] > best[scoreKey]) {
            best = cur;
            tie = false;
        } else if (cur[scoreKey] === best[scoreKey]) {
            tie = true;
        }
    }

    return tie ? null : best.idx;
}

function toSampleIndexVector(n) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = i;
    return out;
}

function contiguousSegmentsByPredicate(values, pred) {
    const segs = [];
    let start = null;

    for (let i = 0; i < values.length; i++) {
        if (pred(values[i], i)) {
            if (start == null) start = i;
        } else if (start != null) {
            segs.push({ start, end: i - 1, length: i - start });
            start = null;
        }
    }

    if (start != null) {
        segs.push({ start, end: values.length - 1, length: values.length - start });
    }

    return segs;
}

function medianOfColumnOnSegment(data, colName, seg) {
    const vals = [];
    for (let i = seg.start; i <= seg.end; i++) {
        const v = data[i]?.[colName];
        if (Number.isFinite(v)) vals.push(v);
    }
    return vals.length ? median(vals) : NaN;
}

function buildOverlappingWindows(n, size, maxWindows = 30) {
    if (!Number.isFinite(n) || n <= 0) return [];

    const winSize = Math.max(1, Math.min(size, n));
    const step = Math.max(1, Math.floor(winSize / 2));
    const windows = [];

    let start = 0;
    while (start + winSize <= n && windows.length < maxWindows) {
        windows.push({
            start,
            end: start + winSize - 1,
            length: winSize
        });
        start += step;
    }

    if (windows.length === 0) {
        windows.push({
            start: 0,
            end: n - 1,
            length: n
        });
    }

    return windows;
}

function slopeOnWindowLocalIndex(rows, colName, win) {
    const vals = [];
    for (let i = win.start; i <= win.end; i++) {
        const v = rows[i]?.[colName];
        if (!Number.isFinite(v)) return NaN;
        vals.push(v);
    }

    if (vals.length < 2) return NaN;

    const x = toSampleIndexVector(vals.length);
    return linSlope(x, vals);
}

function buildTemporaryTip(data, found, colNames, source) {
    const out = new Array(data.length).fill(null);

    if (source === "Z") {
        const zName = colNames[found.Z];
        if (!zName) return out;

        for (let i = 0; i < data.length; i++) {
            const z = data[i]?.[zName];

            if (z === 0) out[i] = 1;
            else if (z > 0) out[i] = 0;
            else out[i] = null;
        }

        return out;
    }

    if (source === "P") {
        const pName = colNames[found.P];
        if (!pName) return out;

        for (let i = 0; i < data.length; i++) {
            const p = data[i]?.[pName];

            if (p > 0) out[i] = 1;
            else if (p === 0) out[i] = 0;
            else out[i] = null;
        }

        return out;
    }

    return out;
}

function chooseDefaultTipSource(data, found, colNames) {
    const hasZ = Number.isInteger(found.Z) && found.Z >= 0;
    const hasP = Number.isInteger(found.P) && found.P >= 0;

    if (hasZ && !hasP) return "Z";
    if (!hasZ && hasP) return "P";
    if (!hasZ && !hasP) return null;

    const zName = colNames[found.Z];
    const pName = colNames[found.P];
    if (!zName || !pName) return "Z";

    let nonZeroZCount = 0;
    let pZeroOnNonZeroZ = 0;

    for (let i = 0; i < data.length; i++) {
        const z = data[i]?.[zName];
        const p = data[i]?.[pName];

        if (z !== 0 && Number.isFinite(z)) {
            nonZeroZCount++;
            if (p === 0) pZeroOnNonZeroZ++;
        }
    }

    if (nonZeroZCount === 0) return "Z";

    return (pZeroOnNonZeroZ / nonZeroZCount >= 0.95) ? "P" : "Z";
}

function filterNegativeOnFoundCols(data, found, colNames, keys) {
    const names = [];

    for (const k of keys) {
        const ix = found[k];
        if (ix == null || ix === -1) continue;

        const name = colNames[ix];
        if (name != null) names.push(name);
    }

    if (!names.length) return data;

    const negRows = new Set();

    for (const name of names) {
        for (let i = 0; i < data.length; i++) {
            const v = data[i]?.[name];
            if (typeof v === "number" && v < 0) {
                negRows.add(i);
            }
        }
    }

    return negRows.size ? data.filter((_, i) => !negRows.has(i)) : data;
}

function assignedOrLockedSet(found, lockedCols, excludeKeys = [], extraBlocked = null) {
    const out = new Set(lockedCols);
    const exclude = new Set(excludeKeys);

    if (extraBlocked) {
        for (const v of extraBlocked) {
            out.add(v);
        }
    }

    for (const [k, v] of Object.entries(found)) {
        if (exclude.has(k)) continue;
        if (Number.isInteger(v) && v >= 0) out.add(v);
    }

    return out;
}

// -------------------------------------------------------------
// MAIN: automatic detection logic
//
// INPUT:
//   data (array of objects),
//   colNames (array of column names),
//   manualOverrides (optional object, e.g. { X: 0, t: 4, v: 7 })
//
// OUTPUT: detectedCols = { X, Y, Z, P, t, Index, v, v_pits }
// -------------------------------------------------------------
export function detectColumns(data, colNames, manualControl = null) {
    const nCols = colNames.length;
    const nRows = data.length;

    // ---------------------------------------------------------
    // Attempt direct lookup
    // ---------------------------------------------------------
    let X_col = findCol(colNames, ["x", "X"]);
    let Y_col = findCol(colNames, ["y", "Y"]);
    let Z_col = findCol(colNames, ["z", "Z"]);
    let t_col = findCol(colNames, ["device_time", "t", "T", "Time_MS", "time", "Time"]);
    let P_col = findCol(colNames, ["P", "pressure", "Pressure"]);
    let idx_col = findCol(colNames, [
        "index", "Index", "ind", "Ind",
        "eventid", "eventID", "eventId", "EventID", "EventId", "Eventid",
        "event_id", "event_ID", "Event_id", "Event_ID", "Event_Id", "event_Id"
    ]);

    const dataCol = [...Array(nCols).keys()];

    const found = {
        X: X_col,
        Y: Y_col,
        Z: Z_col,
        t: t_col,
        P: P_col,
        Index: idx_col,
        v: null,
        v_pits: null
    };

    // ---------------------------------------------------------
    // Apply manual overrides first
    // ---------------------------------------------------------
    const manualOverrides = manualControl?.overrides ?? null;
    const blockedAuto = new Set(manualControl?.blockedAuto ?? []);

    if (manualOverrides && typeof manualOverrides === "object") {
        for (const key of ["X", "Y", "Z", "t", "P", "v", "v_pits"]) {
            const ix = manualOverrides[key];
            if (typeof ix === "number" && ix >= 0 && ix < nCols) {
                found[key] = ix;
            }
        }
    }

    const lockedCols = new Set(
        Object.entries(found)
            .filter(([k, v]) =>
                v !== null &&
                v !== -1 &&
                manualOverrides &&
                manualOverrides[k] === v
            )
            .map(([, v]) => v)
    );

    const blockedDetectedCols = new Set();

    // If manual mapping explicitly turned auto OFF for an unresolved field,
    // suppress name-based detection too.
    for (const key of ["X", "Y", "Z", "t", "P", "v", "v_pits"]) {
        if (blockedAuto.has(key) && !(manualOverrides && key in manualOverrides)) {
            found[key] = null;
        }
    }

    // ---------------------------------------------------------
    // AUTO INDEX
    // Rule:
    // - exclude locked / already-assigned columns
    // - median(diff) === 1
    // - MAD(diff) === 0
    // - if exactly one candidate => assign Index
    // - if more than one candidate => block all of them from later searches
    // ---------------------------------------------------------
    if (found.Index === null) {
        const used = assignedOrLockedSet(found, lockedCols, ["Index"]);
        const candidates = [];

        for (const j of dataCol) {
            if (used.has(j)) continue;

            const vals = data.map(r => r[colNames[j]]);
            if (vals.length < 2 || !vals.every(Number.isFinite)) continue;

            const dv = diffArray(vals);
            if (!dv.length || !dv.every(Number.isFinite)) continue;

            const md = median(dv);
            const mad = medianAbsDeviation(dv);

            if (md === 1 && mad === 0) {
                candidates.push(j);
            }
        }

        if (candidates.length === 1) {
            found.Index = candidates[0];
        } else if (candidates.length > 1) {
            for (const j of candidates) {
                blockedDetectedCols.add(j);
            }
        }
    }

    // ---------------------------------------------------------
    // AUTO TIME
    // Rule:
    // - exclude locked / already-assigned columns
    // - median(diff) > 0
    // - first pass: global R² > 0.9
    // - if several pass:
    //   * keep only monotone non-decreasing variables
    //   * if still several, compare stable diffs
    //     (remove diff > 2*median(diff), keep smallest sd)
    //   * if still tied, choose first variable
    // - fallback:
    //   * discard vars with >5% large jumps
    //   * split on diff > 2*median(diff)
    //   * use longest segment
    //   * keep all with segment R² > 0.95
    //   * apply same tie-break rules
    // ---------------------------------------------------------
    if (found.t === null && !blockedAuto.has("t")) {
        const used = assignedOrLockedSet(found, lockedCols, ["t"], blockedDetectedCols);
        const idxs = toSampleIndexVector(nRows);

        function isNonDecreasing(vals) {
            for (let i = 1; i < vals.length; i++) {
                if (vals[i] < vals[i - 1]) return false;
            }
            return true;
        }

        function stableDiffSD(vals) {
            const dv = diffArray(vals);
            if (!dv.length || !dv.every(Number.isFinite)) return Infinity;

            const md = median(dv);
            const kept = dv.filter(d => d <= 2 * md);

            if (!kept.length) return Infinity;
            return sd(kept);
        }

        function resolveTimeTie(candidates) {
            if (!candidates.length) return null;
            if (candidates.length === 1) return candidates[0].idx;

            // 1) monotonic non-decreasing filter
            const mono = candidates.filter(c => isNonDecreasing(c.vals));
            if (mono.length === 1) return mono[0].idx;
            if (mono.length > 1) candidates = mono;

            // 2) smallest stable diff sd
            let best = candidates[0];
            let tie = false;

            for (let i = 1; i < candidates.length; i++) {
                const cur = candidates[i];

                if (cur.stableSd < best.stableSd) {
                    best = cur;
                    tie = false;
                } else if (cur.stableSd === best.stableSd) {
                    tie = true;
                }
            }

            if (!tie) return best.idx;

            // 3) first variable by default
            return candidates[0].idx;
        }

        const firstPass = [];

        for (const j of dataCol) {
            if (used.has(j)) continue;

            const vals = data.map(r => r[colNames[j]]);
            if (vals.length < 2 || !vals.every(Number.isFinite)) continue;

            const dv = diffArray(vals);
            if (!dv.length || !dv.every(Number.isFinite)) continue;

            const md = median(dv);
            if (!(md > 0)) continue;

            const r2 = linR2(idxs, vals);

            if (r2 > 0.9) {
                firstPass.push({
                    idx: j,
                    vals,
                    r2,
                    stableSd: stableDiffSD(vals)
                });
            }
        }

        if (firstPass.length === 1) {
            found.t = firstPass[0].idx;
        } else if (firstPass.length > 1) {
            found.t = resolveTimeTie(firstPass);
        } else {
            const fallback = [];

            for (const j of dataCol) {
                if (used.has(j)) continue;

                const vals = data.map(r => r[colNames[j]]);
                if (vals.length < 2 || !vals.every(Number.isFinite)) continue;

                const dv = diffArray(vals);
                if (!dv.length || !dv.every(Number.isFinite)) continue;

                const md = median(dv);
                if (!(md > 0)) continue;

                const jumpCount = countIf(dv, d => d > 2 * md);
                if (jumpCount / dv.length > 0.05) continue;

                const jumpPositions = [];
                for (let i = 0; i < dv.length; i++) {
                    if (dv[i] > 2 * md) jumpPositions.push(i);
                }

                const segments = [];
                let segStart = 0;

                for (const i of jumpPositions) {
                    segments.push({
                        start: segStart,
                        end: i,
                        length: i - segStart + 1
                    });
                    segStart = i + 1;
                }

                segments.push({
                    start: segStart,
                    end: vals.length - 1,
                    length: vals.length - segStart
                });

                let longest = segments[0];
                for (let k = 1; k < segments.length; k++) {
                    if (segments[k].length > longest.length) {
                        longest = segments[k];
                    }
                }

                if (!longest) continue;

                const segVals = vals.slice(longest.start, longest.end + 1);
                const segIdxs = toSampleIndexVector(segVals.length);
                const r2 = linR2(segIdxs, segVals);

                if (r2 > 0.95) {
                    fallback.push({
                        idx: j,
                        vals,
                        r2,
                        stableSd: stableDiffSD(vals)
                    });
                }
            }

            if (fallback.length === 1) {
                found.t = fallback[0].idx;
            } else if (fallback.length > 1) {
                found.t = resolveTimeTie(fallback);
            }
        }
    }

    // ---------------------------------------------------------
    // AUTO Z (+ opportunistic P)
    // Rule:
    // - unlocked
    // - not two-valued
    // - at least one zero segment of length >= 10
    // - if 1 candidate => Z
    // - if 2 candidates => larger max = P, other = Z
    // - if >2 candidates => choose pair with largest abs(correlation),
    //   then larger max = P, other = Z
    // - security check on final Z:
    //   if time slips exist and zero-segment slips > non-zero-segment slips,
    //   remove that Z candidate and restart
    // ---------------------------------------------------------
    if (found.Z === null && !blockedAuto.has("Z")) {
        const used = assignedOrLockedSet(found, lockedCols, ["Z", "P"], blockedDetectedCols);
        const pool = [];

        let slipIdxs = [];
        if (Number.isInteger(found.t) && found.t >= 0) {
            const tVals = data.map(r => r[colNames[found.t]]);
            if (tVals.length >= 2 && tVals.every(Number.isFinite)) {
                const dt = diffArray(tVals);
                const medDT = median(dt);

                if (Number.isFinite(medDT) && medDT > 0) {
                    for (let i = 0; i < dt.length; i++) {
                        if (dt[i] > 2 * medDT) {
                            // slip is between samples i and i+1
                            slipIdxs.push(i);
                        }
                    }
                }
            }
        }

        for (const j of dataCol) {
            if (used.has(j)) continue;

            const vals = data.map(r => r[colNames[j]]);
            if (!vals.every(Number.isFinite)) continue;
            if (isTwoValuedVariable(vals)) continue;

            const zeroSegs = contiguousSegmentsByPredicate(vals, v => v === 0)
                .filter(seg => seg.length >= 10);

            if (zeroSegs.length === 0) continue;

            const nonZeroSegs = contiguousSegmentsByPredicate(
                vals,
                v => Number.isFinite(v) && v !== 0
            );

            pool.push({
                idx: j,
                vals,
                maxVal: Math.max(...vals),
                zeroSegs,
                nonZeroSegs
            });
        }

        function corrAbs(a, b) {
            const n = a.length;
            if (n !== b.length || n < 2) return -Infinity;

            const ma = mean(a);
            const mb = mean(b);

            let sxx = 0;
            let syy = 0;
            let sxy = 0;

            for (let i = 0; i < n; i++) {
                const dx = a[i] - ma;
                const dy = b[i] - mb;
                sxx += dx * dx;
                syy += dy * dy;
                sxy += dx * dy;
            }

            if (!(sxx > 0) || !(syy > 0)) return -Infinity;

            return Math.abs(sxy / Math.sqrt(sxx * syy));
        }

        function countSegmentSlips(segList) {
            let count = 0;

            for (const s of slipIdxs) {
                for (const seg of segList) {
                    if (s >= seg.start && (s + 1) <= seg.end) {
                        count++;
                        break;
                    }
                }
            }

            return count;
        }

        function resolveFromPool(candidates) {
            if (candidates.length === 0) {
                return { zIdx: null, pIdx: null };
            }

            if (candidates.length === 1) {
                return {
                    zIdx: candidates[0].idx,
                    pIdx: null
                };
            }

            if (candidates.length === 2) {
                const a = candidates[0];
                const b = candidates[1];

                if (a.maxVal === b.maxVal) {
                    return { zIdx: null, pIdx: null };
                }

                return (a.maxVal > b.maxVal)
                    ? { zIdx: b.idx, pIdx: a.idx }
                    : { zIdx: a.idx, pIdx: b.idx };
            }

            let bestPair = null;
            let bestCorr = -Infinity;
            let tie = false;

            for (let i = 0; i < candidates.length - 1; i++) {
                for (let j = i + 1; j < candidates.length; j++) {
                    const c = corrAbs(candidates[i].vals, candidates[j].vals);
                    if (!Number.isFinite(c)) continue;

                    if (c > bestCorr) {
                        bestCorr = c;
                        bestPair = [candidates[i], candidates[j]];
                        tie = false;
                    } else if (c === bestCorr) {
                        tie = true;
                    }
                }
            }

            if (!bestPair || tie) {
                return { zIdx: null, pIdx: null };
            }

            const [a, b] = bestPair;

            if (a.maxVal === b.maxVal) {
                return { zIdx: null, pIdx: null };
            }

            return (a.maxVal > b.maxVal)
                ? { zIdx: b.idx, pIdx: a.idx }
                : { zIdx: a.idx, pIdx: b.idx };
        }

        let candidates = [...pool];

        while (candidates.length > 0) {
            const resolved = resolveFromPool(candidates);
            if (resolved.zIdx == null) break;

            const zCandidate = candidates.find(c => c.idx === resolved.zIdx);
            if (!zCandidate) break;

            const zeroSlipCount = countSegmentSlips(zCandidate.zeroSegs);
            const nonZeroSlipCount = countSegmentSlips(zCandidate.nonZeroSegs);

            if (zeroSlipCount > nonZeroSlipCount) {
                candidates = candidates.filter(c => c.idx !== resolved.zIdx);
                continue;
            }

            found.Z = resolved.zIdx;

            if (
                found.P === null &&
                resolved.pIdx != null &&
                !blockedAuto.has("P")
            ) {
                found.P = resolved.pIdx;
            }

            break;
        }
    }

    // ---------------------------------------------------------
    // AUTO P
    // Rule:
    // - based on detected Z
    // - on every non-zero Z segment, median(Pcand) < median(Pcand) on every zero Z segment
    // - if multiple candidates satisfy, skip
    // ---------------------------------------------------------
    if (
        found.P === null &&
        !blockedAuto.has("P") &&
        Number.isInteger(found.Z) &&
        found.Z >= 0
    ) {
        const used = assignedOrLockedSet(found, lockedCols, ["P"], blockedDetectedCols);
        const zName = colNames[found.Z];
        const zVals = data.map(r => r[zName]);

        const zeroSegs = contiguousSegmentsByPredicate(zVals, v => v === 0);
        const nonZeroSegs = contiguousSegmentsByPredicate(zVals, v => v !== 0 && Number.isFinite(v));

        if (zeroSegs.length > 0 && nonZeroSegs.length > 0) {
            const pMatches = [];

            for (const j of dataCol) {
                if (used.has(j)) continue;

                const name = colNames[j];
                const vals = data.map(r => r[name]);
                if (!vals.every(Number.isFinite)) continue;

                const zeroMedians = zeroSegs.map(seg => medianOfColumnOnSegment(data, name, seg));
                const nonZeroMedians = nonZeroSegs.map(seg => medianOfColumnOnSegment(data, name, seg));

                if (
                    zeroMedians.some(v => !Number.isFinite(v)) ||
                    nonZeroMedians.some(v => !Number.isFinite(v))
                ) {
                    continue;
                }

                const minZero = Math.min(...zeroMedians);
                const maxNonZero = Math.max(...nonZeroMedians);

                if (maxNonZero < minZero) {
                    pMatches.push(j);
                }
            }

            if (pMatches.length === 1) {
                found.P = pMatches[0];
            }
        }
    }

    // ---------------------------------------------------------
    // TEMP TIP SOURCE + TEMP TIP (for XY only)
    // ---------------------------------------------------------
    const tempTipSource = chooseDefaultTipSource(data, found, colNames);
    const tempTip = buildTemporaryTip(data, found, colNames, tempTipSource);

    // ---------------------------------------------------------
    // AUTO X/Y
    // Rule:
    // - use rows with temporary Tip == 1 if temp Tip exists
    // - windows of 400 or n if smaller
    // - overlap = half-window
    // - up to 30 windows
    // - X: at least floor(.75*nWin), min 1, slopes same sign
    // - Y: from 5 windows onward, |mean(slopeY)| <= qnorm(.99) * sd(slopeY)
    // - dominance: at least floor(.75*nWin), min 1, |sX| > |sY|
    // - tie-break: adjacent pairs, then pair immediately before Z
    // ---------------------------------------------------------
    if (
        (found.X === null && !blockedAuto.has("X")) ||
        (found.Y === null && !blockedAuto.has("Y"))
    ) {
        let xyData = data;

        if (tempTip.some(v => v != null)) {
            xyData = data.filter((_, i) => tempTip[i] === 1);
        }

        if (xyData.length >= 2) {
            const windows = buildOverlappingWindows(xyData.length, Math.min(400, xyData.length), 30);

            const usedBase = assignedOrLockedSet(found, lockedCols, ["X", "Y"], blockedDetectedCols);
            const remaining = dataCol.filter(j => {
                if (usedBase.has(j)) return false;

                const vals = data.map(r => r[colNames[j]]);
                if (!vals.every(Number.isFinite)) return false;

                // Exclude two-valued variables from X/Y.
                if (isTwoValuedVariable(vals)) return false;

                return true;
            });

            const xCandidates =
                (found.X != null) ? [found.X] :
                blockedAuto.has("X") ? [] :
                remaining;

            const yCandidates =
                (found.Y != null) ? [found.Y] :
                blockedAuto.has("Y") ? [] :
                remaining;

            const pairHits = [];

            for (const xIdx of xCandidates) {
                for (const yIdx of yCandidates) {
                    if (xIdx === yIdx) continue;

                    const xName = colNames[xIdx];
                    const yName = colNames[yIdx];

                    const sx = [];
                    const sy = [];

                    for (const win of windows) {
                        const bx = slopeOnWindowLocalIndex(xyData, xName, win);
                        const by = slopeOnWindowLocalIndex(xyData, yName, win);

                        if (!Number.isFinite(bx) || !Number.isFinite(by)) continue;

                        sx.push(bx);
                        sy.push(by);
                    }

                    const nWin = sx.length;
                    if (nWin === 0) continue;

                    const need75 = required75(nWin);

                    const posCount = countIf(sx, v => v > 0);
                    const negCount = countIf(sx, v => v < 0);
                    const xSameSignOk = Math.max(posCount, negCount) >= need75;

                    if (!xSameSignOk) continue;

                    let yRuleOk = true;
                    if (nWin >= 5) {
                        const m = mean(sy);
                        const s = sd(sy);
                        yRuleOk = Math.abs(m) <= Z_Q99 * s;
                    }

                    if (!yRuleOk) continue;

                    let domCount = 0;
                    for (let i = 0; i < nWin; i++) {
                        if (Math.abs(sx[i]) > Math.abs(sy[i])) domCount++;
                    }

                    if (domCount < need75) continue;

                    pairHits.push({
                        xIdx,
                        yIdx,
                        adjacent: Math.abs(xIdx - yIdx) === 1,
                        beforeZ: (
                            Number.isInteger(found.Z) &&
                            found.Z >= 0 &&
                            Math.min(xIdx, yIdx) === found.Z - 2 &&
                            Math.max(xIdx, yIdx) === found.Z - 1
                        )
                    });
                }
            }

            if (pairHits.length) {
                let survivors = pairHits;

                const adjacentHits = survivors.filter(p => p.adjacent);
                if (adjacentHits.length > 0) {
                    survivors = adjacentHits;
                }

                const beforeZHits = survivors.filter(p => p.beforeZ);
                if (beforeZHits.length > 0) {
                    survivors = beforeZHits;
                }

                if (survivors.length === 1) {
                    const hit = survivors[0];
                    if (found.X === null) found.X = hit.xIdx;
                    if (found.Y === null) found.Y = hit.yIdx;
                }
            }
        }
    }

    // ---------------------------------------------------------
    // Final negative filter on detected X/Y/Z/P
    // ---------------------------------------------------------
    data = filterNegativeOnFoundCols(data, found, colNames, ["X", "Y", "Z", "P"]);

    return {
        detectedCols: found,
        processedData: data
    };
}

// -------------------------------------------------------------
// Build canonical fields (X,Y,Z,P,t) inside each row
// -------------------------------------------------------------
export function buildCanonicalFields(data, detectedCols, colNames) {
    const { X, Y, Z, P, t } = detectedCols;

    const Xname = colNames[X];
    const Yname = colNames[Y];
    const Zname = colNames[Z];
    const Pname = colNames[P];
    const tName = colNames[t];

    for (const row of data) {
        row.X = Xname != null ? row[Xname] : undefined;
        row.Y = Yname != null ? row[Yname] : undefined;
        row.Z = Zname != null ? row[Zname] : undefined;
        row.P = Pname != null ? row[Pname] : undefined;
        row.t = tName != null ? row[tName] : undefined;
    }
}

// -------------------------------------------------------------
// Recompute Tip + TipSeg from canonical P or Z
// -------------------------------------------------------------
export function computeTipSeg(data, source = "P") {
    for (const r of data) {
        if (source === "Z") {
            r.Tip = (r.Z != null && r.Z === 0) ? 1 : 0;
        } else {
            r.Tip = (r.P != null && r.P > 0) ? 1 : 0;
        }
    }

    const vec = data.map(r => r.Tip);
    const seg = rleidJS(vec);

    seg.forEach((ts, i) => {
        data[i].Tip_seg = ts;
    });
}

// -------------------------------------------------------------
// Time normalization, dt, timeSeg
// -------------------------------------------------------------
export function timeNormalization(data) {
    const minT = arrayMin(data.map(r => r.t));

    data.forEach(r => {
        r.t = r.t - minT;
    });

    data.forEach((r, i) => {
        r.dt = (i === data.length - 1 ? 0 : data[i + 1].t - data[i].t);
    });

    const medDT = median(data.map(r => r.dt));
    const slip = data.map(r => r.dt > 2 * medDT ? 1 : 0);
    const timeSeg = rleidJS(slip);

    timeSeg.forEach((v, i) => {
        data[i].Time_seg = v;
    });
}