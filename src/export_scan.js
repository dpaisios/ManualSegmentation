// -------------------------------------------------------------
// export_scan.js
// Folder-session export discovery (disk -> AppState.exportTracker)
// -------------------------------------------------------------

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
                exportPath
            };
        } catch {
            // ignore malformed exports
        }
    }

    AppState.exportTracker = nextTracker;
}
