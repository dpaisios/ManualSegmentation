// -------------------------------------------------------------
// export_scan.js
// Folder-session export discovery (disk -> AppState.exportTracker)
// -------------------------------------------------------------

const ROWID_KEY = "ManSeg_rowID";

function baseNameNoExt(fileName) {
    return String(fileName).replace(/\.[^.]+$/, "");
}

function fileNameFromPath(p) {
    return String(p).split(/[/\\]/).pop();
}

function countUniqueManSegID(parsed) {
    if (!Array.isArray(parsed)) return 0;

    const set = new Set();

    for (const row of parsed) {
        if (!row || typeof row !== "object") continue;

        const v = row.ManSegID;
        if (v == null) continue;

        const s = String(v).trim();
        if (s !== "") set.add(s);
    }

    return set.size;
}

// NEW (rowID relevance): whether export contains stable row identity
function exportHasRowID(parsed) {
    if (!Array.isArray(parsed) || parsed.length === 0) return false;

    for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const v = row[ROWID_KEY];
        if (v != null && String(v).trim() !== "") return true;
    }
    return false;
}

// -------------------------------------------------------------
// EXPORTED API
// -------------------------------------------------------------
export async function scanExportsForFolderSession({
    AppState,
    dataFilesAbs,
    dataFolderAbs
}) {

    const exportDir =
        window.electronAPI.join(dataFolderAbs, "Segmented");

    if (!window.electronAPI.exists(exportDir)) return;
    if (!window.electronAPI.isDirectory(exportDir)) return;

    let names;
    try {
        names = window.electronAPI.listFiles(exportDir);
    } catch {
        return;
    }

    const exportByBase = new Map();

    for (const name of names) {
        if (!name.toLowerCase().endsWith("_segmented.json")) continue;

        const base = name.slice(0, -"_segmented.json".length);
        exportByBase.set(
            base,
            window.electronAPI.join(exportDir, name)
        );
    }

    const nextTracker = { ...(AppState.exportTracker ?? {}) };

    for (const dataPath of dataFilesAbs) {
        const dataName = fileNameFromPath(dataPath);
        const base = baseNameNoExt(dataName);

        const exportPath = exportByBase.get(base);
        if (!exportPath) continue;

        try {
            const txt = await window.electronAPI.readFile(exportPath);
            const parsed = JSON.parse(txt);

            const exportCount = countUniqueManSegID(parsed);
            const hasRowID = exportHasRowID(parsed);

            let exportedAt = Date.now();
            try {
                const st = await window.electronAPI.stat(exportPath);
                if (Number.isFinite(st?.mtimeMs)) {
                    exportedAt = st.mtimeMs;
                }
            } catch {}

            nextTracker[dataPath] = {
                exportCount,
                exportedAt,
                exportPath,

                // NEW: indicates whether re-import can be rowID-based
                hasRowID
            };
        } catch {
            // ignore malformed exports
        }
    }

    AppState.exportTracker = nextTracker;
}
