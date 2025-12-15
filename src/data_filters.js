// dataFilters.js
// -------------------------------------------------------------
// Contains only checkbox-related data modification functions
// exactly as in the original app.js
// -------------------------------------------------------------

// -------------------------------------------------------------
// Remove last stroke (original removeLastJS from app.js)
// -------------------------------------------------------------
export function removeLastJS(data, detectedCols) {

    // ----------------------------------------------
    // ENSURE canonical fields exist (X,Y,Tip,Tip_seg)
    // (Your app.js included this guard — preserved exactly)
    // ----------------------------------------------
    for (const row of data) {
        if (row.X === undefined && detectedCols?.X) row.X = row[detectedCols.X];
        if (row.Y === undefined && detectedCols?.Y) row.Y = row[detectedCols.Y];
        if (row.Tip === undefined && row.P !== undefined)
            row.Tip = (row.P > 0 ? 1 : 0);
    }

    // ----------------------------------------------
    // ORIGINAL LOGIC STARTS — UNMODIFIED
    // ----------------------------------------------

    // Tip segments that are pen-down
    const tipSegs = [...new Set(data.filter(d => d.Tip === 1).map(d => d.Tip_seg))];
    if (tipSegs.length === 0) return data;

    const lastTip = Math.max(...tipSegs);

    // mean of last Tip==1 segment
    function meanXY(seg) {
        const pts = data.filter(d => d.Tip_seg === seg);
        const mx = pts.reduce((a, b) => a + b.X, 0) / pts.length;
        const my = pts.reduce((a, b) => a + b.Y, 0) / pts.length;
        return { mx, my };
    }

    const lastM = meanXY(lastTip);

    // build list of Tip-segments to remove
    let remTips = [lastTip];

    let i = 2;
    let tip_i = tipSegs[tipSegs.length - i];
    let prev_tip = tipSegs[tipSegs.length - i - 1];

    while (true) {
        if (tip_i === undefined || prev_tip === undefined) break;

        const iM    = meanXY(tip_i);
        const prevM = meanXY(prev_tip);

        const distLast = Math.hypot(lastM.mx - iM.mx, lastM.my - iM.my);
        const distPrev = Math.hypot(prevM.mx - iM.mx, prevM.my - iM.my);

        if (distLast < distPrev) {
            remTips.push(tip_i);
            i++;
            tip_i = prev_tip;
            prev_tip = tipSegs[tipSegs.length - i];
        } else break;
    }

    // Find last Tip==0 segment
    let lastTip0;
    if (remTips.length > 0) lastTip0 = Math.min(...remTips) - 1;
    else lastTip0 = Math.max(...data.filter(d => d.Tip === 0).map(d => d.Tip_seg));

    // time-slip handling
    const timeSegs = [...new Set(
        data.filter(d => d.Tip_seg === lastTip0).map(d => d.Time_seg)
    )];

    if (timeSegs.length > 1) {
        const keepTS = Math.min(...timeSegs);
        data = data.filter(d => d.Time_seg <= keepTS);
    }

    // keep at most 10 rows of this last Tip==0 segment
    const rows0 = data
        .map((d, idx) => ({ d, idx }))
        .filter(o => o.d.Tip_seg === lastTip0)
        .map(o => o.idx);

    let lastKeep = rows0.length > 10
        ? rows0[10]
        : rows0[rows0.length - 1];

    return data.slice(0, lastKeep + 1);
}



// -------------------------------------------------------------
// Remove edge lifts (exact block from loadData)
// -------------------------------------------------------------
export function removeEdgeLifts(data) {
    // remove first and last Tip==0 segments
    const zeroSegs = [...new Set(data.filter(r => r.Tip === 0).map(r => r.Tip_seg))];
    if (zeroSegs.length === 0) return data;

    const first = Math.min(...zeroSegs);
    const last = Math.max(...zeroSegs);
    return data.filter(r => r.Tip_seg !== first && r.Tip_seg !== last);
}