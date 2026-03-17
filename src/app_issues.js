// -------------------------------------------------------------
// app_issues.js
// Centralized app issue collection / normalization / deduplication
// -------------------------------------------------------------

export function getSelectedTipSource(settingsOptions) {
    const tipSourceOpt = settingsOptions?.find(o => o.label === "Tip source");

    if (tipSourceOpt?.children) {
        const zOpt = tipSourceOpt.children.find(c => c.label === "Z");
        if (zOpt?.checked) return "Z";
    }

    return "P";
}

export function getCriticalKeysForTipSource(tipSource) {
    return (tipSource === "Z")
        ? ["X", "Y", "Z", "t"]
        : ["X", "Y", "t", "P"];
}

export function getEffectiveColumnIndexForKey({ key, AppState, manualMapping }) {
    const manualIdx = manualMapping?.resolved?.[key];
    if (Number.isInteger(manualIdx) && manualIdx >= 0) {
        return manualIdx;
    }

    const detectedIdx = AppState?.detectedCols?.[key];
    if (Number.isInteger(detectedIdx) && detectedIdx >= 0) {
        return detectedIdx;
    }

    return -1;
}

export function hasDuplicateTimestampsFromRaw({
    rawRows,
    AppState,
    manualMapping
}) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return false;
    }

    const tIdx = getEffectiveColumnIndexForKey({
        key: "t",
        AppState,
        manualMapping
    });

    if (!Number.isInteger(tIdx) || tIdx < 0) {
        return false;
    }

    const firstRow = rawRows[0];
    if (!firstRow || typeof firstRow !== "object") {
        return false;
    }

    const rowKeys = Object.keys(firstRow).filter(k => k !== "ManSeg_rowID");
    const tName = rowKeys[tIdx];

    if (!tName) {
        return false;
    }

    const seen = new Set();

    for (const row of rawRows) {
        const v = Number(row?.[tName]);
        if (!Number.isFinite(v)) continue;

        if (seen.has(v)) return true;
        seen.add(v);
    }

    return false;
}

function normalizeIssue({
    level,
    code,
    message,
    keys = [],
    scope = "app"
}) {
    return {
        level,
        code,
        scope,
        keys: [...new Set(keys)],
        message: String(message ?? "").trim()
    };
}

function collectMissingCriticalMappingIssues({
    AppState,
    manualMapping,
    criticalKeys
}) {
    const missing = [];

    for (const key of criticalKeys) {
        const idx = getEffectiveColumnIndexForKey({
            key,
            AppState,
            manualMapping
        });

        if (!Number.isInteger(idx) || idx < 0) {
            missing.push(key);
        }
    }

    if (!missing.length) return [];

    return [
        normalizeIssue({
            level: "error",
            code: "missing-critical-mapping",
            scope: "mapping",
            keys: missing,
            message: `Missing critical variable mappings: ${missing.join(", ")}`
        })
    ];
}

function collectManualMappingIssues({
    manualMapping,
    criticalKeys
}) {
    const buckets = new Map();
    const allKeys = Object.keys(manualMapping?.errors ?? {});

    for (const key of allKeys) {
        const msg = String(manualMapping?.errors?.[key] ?? "").trim();
        if (!msg) continue;

        if (!buckets.has(msg)) {
            buckets.set(msg, []);
        }
        buckets.get(msg).push(key);
    }

    const out = [];

    for (const [msg, keys] of buckets.entries()) {
        const vars = [...new Set(keys)];

        // Special handling: duplicate column assignment
        if (msg === "This column is already assigned to another variable") {
            const colNames = new Set();

            for (const v of vars) {
                const name = manualMapping?.fields?.[v];
                if (name) colNames.add(name);
            }

            const cols = [...colNames];

            if (cols.length) {
                out.push(
                    normalizeIssue({
                        level: "error",
                        code: "duplicate-column-assignment",
                        scope: "manual-mapping",
                        keys: vars,
                        message:
                            `Some columns are assigned to multiple variables: ${cols.join(", ")}`
                    })
                );
                continue;
            }
        }

        // Special handling: invalid column names
        if (msg === "Column name not found") {

            const isCritical = vars.some(v => criticalKeys.includes(v));

            out.push(
                normalizeIssue({
                    level: isCritical ? "error" : "warning",
                    code: "invalid-column-name",
                    scope: "manual-mapping",
                    keys: vars,
                    message: `Invalid variable mappings: ${vars.join(", ")}`
                })
            );

            continue;
        }

        const isCritical = vars.some(v => criticalKeys.includes(v));

        out.push(
            normalizeIssue({
                level: isCritical ? "error" : "warning",
                code: isCritical
                    ? "critical-manual-mapping-error"
                    : "manual-mapping-warning",
                scope: "manual-mapping",
                keys: vars,
                message:
                    vars.length === 1
                        ? `${vars[0]}: ${msg}`
                        : `${vars.join(", ")}: ${msg}`
            })
        );
    }

    return out;
}

function collectDuplicateTimestampIssues({
    AppState,
    manualMapping,
    rawRows
}) {
    const hasDuplicates =
        !!AppState?.dataQuality?.hasDuplicateTimestamps ||
        hasDuplicateTimestampsFromRaw({
            rawRows,
            AppState,
            manualMapping
        });

    if (!hasDuplicates) return [];

    return [
        normalizeIssue({
            level: "warning",
            code: "duplicate-timestamps",
            scope: "dataset",
            keys: ["t"],
            message: "Duplicate time stamps detected in the dataset"
        })
    ];
}

function dedupeIssues(issues) {
    const out = [];
    const seen = new Set();

    for (const issue of issues) {
        if (
            !issue ||
            (issue.level !== "error" && issue.level !== "warning") ||
            !String(issue.message ?? "").trim()
        ) {
            continue;
        }

        const key = [
            issue.level,
            issue.code,
            issue.scope,
            [...(issue.keys ?? [])].sort().join(","),
            issue.message
        ].join("::");

        if (seen.has(key)) continue;
        seen.add(key);
        out.push(issue);
    }

    return out;
}

function sortIssues(issues) {
    const rank = { error: 0, warning: 1 };

    return [...issues].sort((a, b) => {
        const ra = rank[a.level] ?? 99;
        const rb = rank[b.level] ?? 99;
        if (ra !== rb) return ra - rb;
        return a.message.localeCompare(b.message);
    });
}

export function collectAppIssues({
    AppState,
    settingsOptions,
    manualMapping,
    rawRows
}) {
    if (!AppState?.dataLoaded) {
        return [];
    }

    const tipSource = getSelectedTipSource(settingsOptions);
    const criticalKeys = getCriticalKeysForTipSource(tipSource);

    const issues = [
        ...collectMissingCriticalMappingIssues({
            AppState,
            manualMapping,
            criticalKeys
        }),
        ...collectManualMappingIssues({
            manualMapping,
            criticalKeys
        }),
        ...collectDuplicateTimestampIssues({
            AppState,
            manualMapping,
            rawRows
        })
    ];

    return sortIssues(dedupeIssues(issues));
}