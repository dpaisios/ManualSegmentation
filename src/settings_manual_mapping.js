// -------------------------------------------------------------
// settings_manual_mapping.js
// Manual variable mapping state, dataset introspection, auto-sync,
// and validation logic
// -------------------------------------------------------------

export const MANUAL_KEYS = ["X", "Y", "Z", "t", "P", "v", "v_pits"];

export function createManualMappingController({
    AppState,
    loadDataStateRef
}) {
    function getLoadDataState() {
        return loadDataStateRef?.() ?? {};
    }

    function getOriginalRaw() {
        return getLoadDataState().originalRaw ?? null;
    }

    function getColNamesOverrideGlobal() {
        return getLoadDataState().colNamesOverrideGlobal ?? null;
    }

    function ensureManualMappingState() {
        if (!AppState.manualMapping) {
            AppState.manualMapping = {};
        }

        const mm = AppState.manualMapping;

        mm.enabled = !!mm.enabled;

        if (!mm.fields) mm.fields = {};
        if (!mm.resolved) mm.resolved = {};
        if (!mm.status) mm.status = {};
        if (!mm.errors) mm.errors = {};
        if (!mm.meta) mm.meta = {};

        for (const key of MANUAL_KEYS) {
            if (typeof mm.fields[key] !== "string") mm.fields[key] = "";
            if (!Number.isInteger(mm.resolved[key])) mm.resolved[key] = null;
            if (typeof mm.status[key] !== "string") mm.status[key] = "empty";
            if (typeof mm.errors[key] !== "string") mm.errors[key] = "";

            if (!mm.meta[key] || typeof mm.meta[key] !== "object") {
                mm.meta[key] = {
                    source: null,      // null | auto | typed | suggestion | chooser
                    columnIndex: null
                };
            } else {
                if (!("source" in mm.meta[key])) mm.meta[key].source = null;
                if (!("columnIndex" in mm.meta[key])) mm.meta[key].columnIndex = null;
            }
        }

        mm.hasAnyMapping = !!mm.hasAnyMapping;
        mm.hasErrors = !!mm.hasErrors;
    }

    function getManualMapping() {
        ensureManualMappingState();
        return AppState.manualMapping;
    }

    function getDatasetRaw() {
        if (AppState.originalRaw && AppState.originalRaw.length) return AppState.originalRaw;

        const raw = getOriginalRaw();
        if (raw && raw.length) return raw;

        return null;
    }

    function getDatasetColumns() {
        const raw = getDatasetRaw();
        if (!raw || !raw.length || typeof raw[0] !== "object") {
            return [];
        }

        const ROWID_KEY = "ManSeg_rowID";
        const rawKeys = Object.keys(raw[0]).filter(k => k !== ROWID_KEY);

        let names = [...rawKeys];
        const colNamesOverrideGlobal = getColNamesOverrideGlobal();

        if (
            Array.isArray(colNamesOverrideGlobal) &&
            colNamesOverrideGlobal.length === rawKeys.length
        ) {
            names = [...colNamesOverrideGlobal];
        } else {
            const unnamed = rawKeys.every((k, i) => {
                const n = i + 1;
                return (
                    k === `col${n}` ||
                    k === `Col${n}` ||
                    k === `COL${n}`
                );
            });

            if (unnamed) {
                names = rawKeys.map((_, i) => String(i + 1));
            }
        }

        return names.map((name, i) => ({
            index0: i,
            index1: i + 1,
            name: String(name)
        }));
    }

    function getDuplicateNameCounts(columns) {
        const counts = new Map();
        for (const c of columns) {
            counts.set(c.name, (counts.get(c.name) || 0) + 1);
        }
        return counts;
    }

    function isColumnNumeric(index0) {
        const raw = getDatasetRaw();
        const columns = getDatasetColumns();
        const col = columns[index0];
        if (!raw || !col) return false;

        for (const row of raw) {
            const v = row[col.name];
            if (v == null || String(v).trim() === "") return false;

            const n = Number(v);
            if (!Number.isFinite(n)) return false;
        }

        return true;
    }

        function isColumnBinary(index0) {
        const raw = getDatasetRaw();
        const columns = getDatasetColumns();
        const col = columns[index0];
        if (!raw || !col) return false;

        for (const row of raw) {
            const v = row[col.name];
            if (v == null || String(v).trim() === "") return false;

            const n = Number(v);
            if (!Number.isFinite(n)) return false;
            if (n !== 0 && n !== 1) return false;
        }

        return true;
    }

    function getManualValidationError(key, resolvedIndex) {
        if (resolvedIndex == null) return "";

        if (!isColumnNumeric(resolvedIndex)) {
            return "Selected column is not numeric";
        }

        if (key === "v_pits" && !isColumnBinary(resolvedIndex)) {
            return "Variable needs to be binary";
        }

        return "";
    }

    function formatAutoFieldForIndex(index0) {
        const columns = getDatasetColumns();
        const col = columns[index0];
        if (!col) return "";

        return col.name;
    }

    function getNumericDatasetColumns() {
        return getDatasetColumns().filter(c => isColumnNumeric(c.index0));
    }

    function getColumnAssignments() {
        const mm = getManualMapping();
        const out = new Map();

        for (const key of MANUAL_KEYS) {
            const idx = mm.resolved[key];
            if (idx == null) continue;

            if (!out.has(idx)) out.set(idx, []);
            out.get(idx).push(key);
        }

        return out;
    }

    function parseFieldToken(text) {
        const raw = String(text ?? "").trim();

        if (raw === "") {
            return { kind: "empty" };
        }

        return {
            kind: "name",
            name: raw,
            raw
        };
    }

    function getColumnsForDataset(rawRows, colNamesOverride = null) {
        if (!Array.isArray(rawRows) || !rawRows.length || typeof rawRows[0] !== "object") {
            return [];
        }

        const ROWID_KEY = "ManSeg_rowID";
        const rawKeys = Object.keys(rawRows[0]).filter(k => k !== ROWID_KEY);

        let names = [...rawKeys];

        if (
            Array.isArray(colNamesOverride) &&
            colNamesOverride.length === rawKeys.length
        ) {
            names = [...colNamesOverride];
        }

        return names.map((name, i) => ({
            index0: i,
            index1: i + 1,
            name: String(name)
        }));
    }

    function isDatasetColumnNumeric(rawRows, columns, index0) {
        const col = columns[index0];
        if (!Array.isArray(rawRows) || !col) return false;

        for (const row of rawRows) {
            const v = row[col.name];
            if (v == null || String(v).trim() === "") return false;

            const n = Number(v);
            if (!Number.isFinite(n)) return false;
        }

        return true;
    }

    function isDatasetColumnBinary(rawRows, columns, index0) {
        const col = columns[index0];
        if (!Array.isArray(rawRows) || !col) return false;

        for (const row of rawRows) {
            const v = row[col.name];
            if (v == null || String(v).trim() === "") return false;

            const n = Number(v);
            if (!Number.isFinite(n)) return false;
            if (n !== 0 && n !== 1) return false;
        }

        return true;
    }

    function getDatasetValidationErrorForKey(key, rawRows, columns, resolvedIndex) {
        if (resolvedIndex == null) return "";

        if (!isDatasetColumnNumeric(rawRows, columns, resolvedIndex)) {
            return "Selected column is not numeric";
        }

        if (key === "v_pits" && !isDatasetColumnBinary(rawRows, columns, resolvedIndex)) {
            return "Variable needs to be binary";
        }

        return "";
    }

    function reconcileManualMappingsForDataset(rawRows, colNamesOverride = null) {
        const mm = getManualMapping();
        const columns = getColumnsForDataset(rawRows, colNamesOverride);

        for (const key of MANUAL_KEYS) {
            const text = String(mm.fields[key] ?? "").trim();
            const source = mm.meta[key]?.source ?? null;

            if (source === "auto") {
                mm.fields[key] = "";
                mm.resolved[key] = null;
                mm.status[key] = "empty";
                mm.errors[key] = "";
                mm.meta[key].source = null;
                mm.meta[key].columnIndex = null;
                continue;
            }

            if (text === "") {
                mm.fields[key] = "";
                mm.resolved[key] = null;
                mm.status[key] = "empty";
                mm.errors[key] = "";
                mm.meta[key].columnIndex = null;
                if (mm.meta[key].source !== "auto") {
                    mm.meta[key].source = null;
                }
                continue;
            }

            const matches = columns.filter(c => c.name === text);

            if (matches.length !== 1) {
                mm.fields[key] = "";
                mm.resolved[key] = null;
                mm.status[key] = "empty";
                mm.errors[key] = "";
                mm.meta[key].source = null;
                mm.meta[key].columnIndex = null;
                continue;
            }

            const idx = matches[0].index0;
            const invalid = getDatasetValidationErrorForKey(key, rawRows, columns, idx);

            if (invalid) {
                mm.fields[key] = "";
                mm.resolved[key] = null;
                mm.status[key] = "empty";
                mm.errors[key] = "";
                mm.meta[key].source = null;
                mm.meta[key].columnIndex = null;
                continue;
            }

            mm.resolved[key] = idx;
            mm.status[key] = "valid";
            mm.errors[key] = "";
            mm.meta[key].columnIndex = idx;
        }

        mm.hasAnyMapping = MANUAL_KEYS.some(k => String(mm.fields[k] ?? "").trim() !== "");
        mm.hasErrors = false;
    }
    
    function activateAutoForField(key) {
        const mm = getManualMapping();

        if (!mm.enabled || !AppState.dataLoaded || !AppState.detectedCols) return;
        if (!["X", "Y", "Z", "t", "P"].includes(key)) return;

        const idx = AppState.detectedCols[key];

        if (typeof idx === "number" && idx >= 0) {
            mm.fields[key] = formatAutoFieldForIndex(idx);
            mm.resolved[key] = idx;
            mm.status[key] = "auto";
            mm.errors[key] = "";
            mm.meta[key] = {
                source: "auto",
                columnIndex: idx
            };
        } else {
            mm.fields[key] = "";
            mm.resolved[key] = null;
            mm.status[key] = "empty";
            mm.errors[key] = "";
            mm.meta[key] = {
                source: null,
                columnIndex: null
            };
        }
    }

    function syncManualMappingPreviewFromDetected() {
        const mm = getManualMapping();

        if (!AppState.dataLoaded || !AppState.detectedCols) return;

        for (const key of ["X", "Y", "Z", "t", "P"]) {
            const text = String(mm.fields[key] ?? "").trim();
            const source = mm.meta[key]?.source ?? null;

            const hasUserValue =
                text !== "" &&
                source !== "auto";

            if (hasUserValue) continue;

            const idx = AppState.detectedCols[key];

            if (typeof idx === "number" && idx >= 0) {
                mm.fields[key] = formatAutoFieldForIndex(idx);
                mm.resolved[key] = idx;
                mm.status[key] = "auto";
                mm.errors[key] = "";
                mm.meta[key] = {
                    source: "auto",
                    columnIndex: idx
                };
            } else if (source === "auto") {
                mm.fields[key] = "";
                mm.resolved[key] = null;
                mm.status[key] = "empty";
                mm.errors[key] = "";
                mm.meta[key] = {
                    source: null,
                    columnIndex: null
                };
            }
        }
    }

    function primeAutoFieldsOnEnable() {
        const mm = getManualMapping();

        if (!mm.enabled || !AppState.dataLoaded || !AppState.detectedCols) return;

        for (const key of ["X", "Y", "Z", "t", "P"]) {
            const text = String(mm.fields[key] ?? "").trim();
            const source = mm.meta[key]?.source ?? null;

            const hasUserValue =
                text !== "" &&
                source !== "auto";

            if (!hasUserValue) {
                activateAutoForField(key);
            }
        }
    }

    function syncAutoFieldsFromDetected() {
        const mm = getManualMapping();

        if (!mm.enabled || !AppState.dataLoaded || !AppState.detectedCols) return;

        for (const key of ["X", "Y", "Z", "t", "P"]) {
            if (mm.meta[key]?.source === "auto") {
                activateAutoForField(key);
            }
        }
    }

    function validateManualMappings() {
        const mm = getManualMapping();
        const columns = getDatasetColumns();
        const duplicateCounts = getDuplicateNameCounts(columns);
        const hasData = columns.length > 0;

        mm.hasAnyMapping = false;
        mm.hasErrors = false;

        for (const key of MANUAL_KEYS) {
            const text = String(mm.fields[key] ?? "");
            const trimmed = text.trim();

            mm.resolved[key] = null;
            mm.errors[key] = "";

            if (trimmed === "") {
                if (mm.meta[key].source === "auto" && mm.enabled && hasData) {
                    mm.resolved[key] = mm.meta[key].columnIndex;
                    mm.status[key] = "auto";
                } else {
                    mm.status[key] = "empty";
                    mm.meta[key].columnIndex = null;
                    if (mm.meta[key].source !== "auto") {
                        mm.meta[key].source = null;
                    }
                }
                continue;
            }

            mm.hasAnyMapping = true;

            const meta = mm.meta[key];
            const token = parseFieldToken(trimmed);

            if (!hasData) {
                if (token.kind === "name") {
                    mm.status[key] = "valid";
                    mm.errors[key] = "";
                } else {
                    mm.status[key] = "invalid";
                    mm.errors[key] = "Column name not found";
                    mm.hasErrors = true;
                }
                continue;
            }

            let resolvedIndex = null;
            let warning = "";
            let invalid = "";

            if (
                (meta.source === "suggestion" || meta.source === "chooser" || meta.source === "auto") &&
                Number.isInteger(meta.columnIndex) &&
                meta.columnIndex >= 0 &&
                meta.columnIndex < columns.length
            ) {
                resolvedIndex = meta.columnIndex;

                const chosenName = columns[resolvedIndex]?.name ?? "";
                if (duplicateCounts.get(chosenName) > 1) {
                    warning = "Column name is duplicated in the dataset";
                }
            } else if (token.kind === "name") {
                const matches = columns.filter(c => c.name === token.name);

                if (matches.length === 0) {
                    invalid = "Column name not found";
                } else if (matches.length > 1) {
                    invalid = "Column name is duplicated in the dataset";
                } else {
                    resolvedIndex = matches[0].index0;
                }
            }

            if (!invalid && resolvedIndex != null) {
                invalid = getManualValidationError(key, resolvedIndex);
            }

            if (invalid) {
                mm.resolved[key] = null;
                mm.status[key] = "invalid";
                mm.errors[key] = invalid;
                mm.hasErrors = true;

                if (meta.source === "auto") {
                    meta.source = null;
                    meta.columnIndex = null;
                }

                continue;
            }

            mm.resolved[key] = resolvedIndex;

            if (meta.source === "auto") {
                mm.status[key] = "auto";
            } else if (warning) {
                mm.status[key] = "warning";
                mm.errors[key] = warning;
            } else {
                mm.status[key] = "valid";
                mm.errors[key] = "";
            }
        }

        const used = new Map();

        for (const key of MANUAL_KEYS) {
            const idx = mm.resolved[key];
            const text = String(mm.fields[key] ?? "").trim();
            const source = mm.meta[key]?.source ?? null;

            if (idx == null || text === "") continue;
            if (source === "auto") continue;

            if (!used.has(idx)) {
                used.set(idx, [key]);
            } else {
                used.get(idx).push(key);
            }
        }

        for (const [, keys] of used.entries()) {
            if (keys.length > 1) {
                for (const key of keys) {
                    mm.status[key] = "invalid";
                    mm.errors[key] = "This column is already assigned to another variable";
                    mm.resolved[key] = null;
                }
                mm.hasErrors = true;
            }
        }
    }

    return {
        ensureManualMappingState,
        getManualMapping,
        getDatasetRaw,
        getDatasetColumns,
        getDuplicateNameCounts,
        isColumnNumeric,
        isColumnBinary,
        formatAutoFieldForIndex,
        getNumericDatasetColumns,
        getColumnAssignments,
        parseFieldToken,
        activateAutoForField,
        syncManualMappingPreviewFromDetected,
        primeAutoFieldsOnEnable,
        syncAutoFieldsFromDetected,
        validateManualMappings,
        reconcileManualMappingsForDataset
    };
}