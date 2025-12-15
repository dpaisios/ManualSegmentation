// -------------------------------------------------------------
// column_detection.js
// Pure automatic column-detection module
// extracted from the loadData() in your current app.js.
//
// Exports:
//   detectColumns(data, colNames)
//   buildCanonicalFields(data, detectedCols)
//   computeTipSeg(data)
//   timeNormalization(data)
// -------------------------------------------------------------

// ---------- basic stats ----------
function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function median(arr) {
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return (a.length % 2 === 0)
        ? (a[m - 1] + a[m]) / 2
        : a[m];
}

function quantile(arr, p) {
    if (!arr.length) return NaN;
    const a = [...arr].sort((x, y) => x - y);
    const pos = (a.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    return (a[base + 1] !== undefined)
        ? a[base] + rest * (a[base + 1] - a[base])
        : a[base];
}

function sd(arr) {
    if (arr.length <= 1) return 0;
    const m = mean(arr);
    const v = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v);
}

function arrayMin(arr) {
    let m = Infinity;
    for (const v of arr) if (v < m) m = v;
    return m;
}

function arrayMax(arr) {
    let m = -Infinity;
    for (const v of arr) if (v > m) m = v;
    return m;
}

// ---------- run-length IDs ----------
function rleidJS(arr) {
    const out = [];
    let id = 1, prev = arr[0];
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

// ---------- linear helpers ----------
function linSlope(x, y) {
    const n = x.length;
    const mx = mean(x), my = mean(y);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx;
        num += dx * (y[i] - my);
        den += dx * dx;
    }
    return den === 0 ? 0 : num / den;
}

function linR2(x, y) {
    const n = x.length;
    const mx = mean(x), my = mean(y);
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx;
        const dy = y[i] - my;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }
    if (sxx === 0 || syy === 0) return 0;
    const r = sxy / Math.sqrt(sxx * syy);
    return r * r;
}

// ---------- helper: find column by name list ----------
function findCol(colNames, candidates) {
    for (const name of candidates) {
        const idx = colNames.indexOf(name);
        if (idx !== -1) return idx;
    }
    return null;
}

// -------------------------------------------------------------
// MAIN: automatic detection logic
// This is *exactly* the logic from your current loadData()
// but turned into a pure function.
//
// INPUT: data (array of objects), colNames (array of column names)
// OUTPUT: detectedCols = { X, Y, Z, P, t, Index }
// -------------------------------------------------------------
export function detectColumns(data, colNames) {

    const nCols = colNames.length;

    // attempt direct lookup
    let X_col    = findCol(colNames, ["x","X"]);
    let Y_col    = findCol(colNames, ["y","Y"]);
    let Z_col    = findCol(colNames, ["z","Z"]);
    let t_col    = findCol(colNames, ["t","T","Time_MS","time","Time","device_time"]);
    let P_col    = findCol(colNames, ["P","pressure","Pressure"]);
    let idx_col  = findCol(colNames, ["index","Index","ind","Ind",
        "eventid","eventID","eventId","EventID","EventId","Eventid",
        "event_id","event_ID","Event_id","Event_ID","Event_Id","event_Id"
    ]);

    const dataCol = [...Array(nCols).keys()];

    // ranges
    const colRanges = colNames.map(name => {
        const vals = data.map(r => r[name]);
        return {
            min: arrayMin(vals),
            max: arrayMax(vals)
        };
    });

    const missing =
        [X_col, Y_col, Z_col, t_col, P_col, idx_col]
        .some(v => v === null || v === -1);

    // result holder
    const found = {
        X: X_col,
        Y: Y_col,
        Z: Z_col,
        t: t_col,
        P: P_col,
        Index: idx_col
    };

    if (!missing) {
        // fully detected by name, return directly
        return {
            detectedCols: found,
            processedData: data
        };
    }

    // ---------------------------------------------------------
    // NEGATIVE-VALUE FILTER (exact logic)
    // ---------------------------------------------------------
    let negRows = new Set();
    for (let j = 0; j < nCols; j++) {
        if (colRanges[j].min < 0) {
            const name = colNames[j];
            for (let i = 0; i < data.length; i++) {
                if (data[i][name] < 0) negRows.add(i);
            }
        }
    }
    if (negRows.size) {
        data = data.filter((_, i) => !negRows.has(i));
    }

    // recompute ranges
    const colRanges2 = colNames.map(name => {
        const vals = data.map(r => r[name]);
        return {
            min: Math.min(...vals),
            max: Math.max(...vals)
        };
    });

    // compute per-column diff stats
    const stats = colNames.map(name => {
        const vals = data.map(r => r[name]);
        const dv = vals.slice(1).map((v,i) => v - vals[i]);
        return {
            m_diff: mean(dv),
            sd_diff: sd(dv),
            mdn_diff: median(dv),
            IQR_diff: quantile(dv,0.75) - quantile(dv,0.25),
            range_diff: Math.max(...dv) - Math.min(...dv)
        };
    });

    // ---------------- AUTO INDEX -----------------
    if (found.Index === null) {
        let best = 0;
        for (let i = 1; i < stats.length; i++) {
            if (stats[i].range_diff < stats[best].range_diff)
                best = i;
        }
        if (stats[best].mdn_diff !== 0) {
            found.Index = best;
        }
    }

    // ---------------- AUTO TIME -------------------
    if (found.t === null) {
        const pos = stats
            .map((d,i) => ({d,i}))
            .filter(o => o.d.mdn_diff > 0)
            .map(o => o.i);

        const exclude = new Set([found.Index]);
        const pos2 = pos.filter(i => !exclude.has(i));

        if (pos2.length > 1) {
            const idxs = data.map((_,i) => i);
            const scores = pos2.map(j =>
                linR2(idxs, data.map(r => r[colNames[j]]))
            );
            let best = 0;
            for (let k = 1; k < scores.length; k++)
                if (scores[k] > scores[best]) best = k;
            found.t = pos2[best];
        }
        else if (pos2.length === 1) {
            found.t = pos2[0];
        }
    }

    // ---------------- AUTO PRESSURE ----------------
    if (found.P === null) {
        const rem = dataCol.filter(j => !Object.values(found).includes(j));
        const zeroLow = rem.filter(j => colRanges2[j].min === 0);
        if (zeroLow.length) {
            let best = zeroLow[0];
            for (let j of zeroLow.slice(1))
                if (colRanges2[j].max > colRanges2[best].max) best = j;
            found.P = best;
        }
    }

    // temporarily compute Tip & TipSeg
    for (const row of data) {
        const Pname = colNames[found.P];
        row.Tip = (Pname != null && row[Pname] > 0) ? 1 : 0;
    }
    const TipVec = data.map(r => r.Tip);
    const TipSeg = rleidJS(TipVec);
    TipSeg.forEach((ts,i) => data[i].Tip_seg = ts);

    const data_tip = data.filter(r => r.Tip === 1);
    const tipSegCounts = {};
    for (const r of data_tip) {
        tipSegCounts[r.Tip_seg] = (tipSegCounts[r.Tip_seg] || 0) + 1;
    }

    // ---------------- AUTO Z ------------------------
    if (found.Z === null) {
        const rem = dataCol.filter(j =>
            !Object.values(found).includes(j)
        );
        for (let j of rem) {
            const name = colNames[j];
            if (data_tip.every(r => r[name] === 0)) {
                found.Z = j;
                break;
            }
        }
    }

    // ---------------- AUTO X/Y ----------------------
    if (found.X === null || found.Y === null) {

        const rem = dataCol.filter(j => !Object.values(found).includes(j));
        let XY_candidates = null;

        // case: XY before Z
        if (found.Z != null) {
            const c1 = found.Z - 2, c2 = found.Z - 1;
            if (c1 >= 0 && c2 >= 0 && rem.includes(c1) && rem.includes(c2))
                XY_candidates = [c1, c2];
        }

        // fallback: adjacent columns
        if (!XY_candidates) {
            for (let i = 0; i < rem.length - 1; i++) {
                if (rem[i + 1] - rem[i] === 1) {
                    XY_candidates = [rem[i], rem[i + 1]];
                    break;
                }
            }
        }

        const segLens = Object.values(tipSegCounts);
        const thr = segLens.length > 3 ? median(segLens) : Math.min(...segLens);

        const longSegs = Object.entries(tipSegCounts)
            .filter(([id,len]) => len > thr)
            .map(([id]) => Number(id));

        if (XY_candidates && longSegs.length) {
            const tName = colNames[found.t];
            const [c1, c2] = XY_candidates;
            const xName = colNames[c1];
            const yName = colNames[c2];

            const slopes1 = [];
            const slopes2 = [];

            for (let segID of longSegs) {
                const segData = data_tip.filter(r => r.Tip_seg === segID);
                const tVals = segData.map(r => r[tName]);
                const xVals = segData.map(r => r[xName]);
                const yVals = segData.map(r => r[yName]);

                slopes1.push(linSlope(tVals, xVals));
                slopes2.push(linSlope(tVals, yVals));
            }

            const cnt1 = slopes1.filter(s => s > 0).length;
            const cnt2 = slopes2.filter(s => s > 0).length;

            if (cnt1 >= cnt2) {
                found.X = c1;
                found.Y = c2;
            } else {
                found.X = c2;
                found.Y = c1;
            }
        }
    }

    // return mapping + modified data (Tip,TipSeg attached)
    return {
        detectedCols: found,
        processedData: data
    };
}

// -------------------------------------------------------------
// Build canonical fields (X,Y,Z,P,t) inside each row
// EXACT logic from loadData()
// -------------------------------------------------------------
export function buildCanonicalFields(data, detectedCols, colNames) {
    const { X, Y, Z, P, t } = detectedCols;

    const Xname = colNames[X];
    const Yname = colNames[Y];
    const Zname = colNames[Z];
    const Pname = colNames[P];
    const tName = colNames[t];

    for (const row of data) {
        row.X = row[Xname];
        row.Y = row[Yname];
        row.Z = row[Zname];
        row.P = row[Pname];
        row.t = row[tName];
    }
}

// -------------------------------------------------------------
// Recompute Tip + TipSeg from canonical P
// -------------------------------------------------------------
export function computeTipSeg(data) {
    for (const r of data) {
        r.Tip = (r.P != null && r.P > 0) ? 1 : 0;
    }
    const vec = data.map(r => r.Tip);
    const seg = rleidJS(vec);
    seg.forEach((ts,i) => data[i].Tip_seg = ts);
}

// -------------------------------------------------------------
// Time normalization, dt, timeSeg
// -------------------------------------------------------------
export function timeNormalization(data) {
    const minT = arrayMin(data.map(r => r.t));
    data.forEach(r => {
        r.t = r.t - minT;
    });

    data.forEach((r,i) => {
        r.dt = (i === data.length - 1 ? 0 : data[i + 1].t - data[i].t);
    });

    const medDT = median(data.map(r => r.dt));
    const slip = data.map(r => r.dt > 2 * medDT ? 1 : 0);
    const timeSeg = rleidJS(slip);
    timeSeg.forEach((v,i) => data[i].Time_seg = v);
}