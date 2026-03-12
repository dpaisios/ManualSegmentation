// -------------------------------------------------------------
// settings_controller.js
// Handles title-bar settings menu interactions
// -------------------------------------------------------------

export function createExportSuccessAnimator({
    onUpdate,
    onDone
}) {
    const FADE_IN  = 150;
    const HOLD     = 900;
    const FADE_OUT = 500;

    return function run() {
        const t0 = performance.now();

        function frame(now) {
            const dt = now - t0;

            let p;
            if (dt < FADE_IN) {
                p = dt / FADE_IN;
            } else if (dt < FADE_IN + HOLD) {
                p = 1;
            } else if (dt < FADE_IN + HOLD + FADE_OUT) {
                p = 1 - (dt - FADE_IN - HOLD) / FADE_OUT;
            } else {
                onUpdate(0);
                onDone?.();
                return;
            }

            onUpdate(Math.max(0, Math.min(1, p)));
            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
    };
}

export function attachSettingsController({
    titleBarController,

    AppState,
    settingsOptions,

    loadData,
    originalRaw,
    colNamesOverrideGlobal,
    exportPathOverrideGlobal,

    resetXYSelection,
    renderers
}) {
    const MANUAL_KEYS = ["X", "Y", "Z", "t", "P", "v", "v_pits"];

    let menuEl = null;
    let docMouseDown = null;
    let chooserModalEl = null;
    let activeSuggestionList = null;
    let activeSuggestionMode = null; // null | "typed" | "full"
    let activeSuggestionKey = null;

    ensureManualMappingState();

    function ensureManualMappingState() {
        if (!AppState.manualMapping) {
            AppState.manualMapping = {};
        }

        const mm = AppState.manualMapping;

        mm.enabled = !!mm.enabled;

        if (!mm.fields) {
            mm.fields = {};
        }
        if (!mm.resolved) {
            mm.resolved = {};
        }
        if (!mm.status) {
            mm.status = {};
        }
        if (!mm.errors) {
            mm.errors = {};
        }
        if (!mm.meta) {
            mm.meta = {};
        }

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

    function getButtonEl() {
        return titleBarController.getSettingsButtonElement();
    }

    function getScaleOption() {
        return settingsOptions.find(o => o.label === "Scale multiplier") ?? null;
    }

    function getDatasetRaw() {
        if (AppState.originalRaw && AppState.originalRaw.length) return AppState.originalRaw;
        if (originalRaw && originalRaw.length) return originalRaw;
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

    function formatAutoFieldForIndex(index0) {
        const columns = getDatasetColumns();
        const counts = getDuplicateNameCounts(columns);
        const col = columns[index0];
        if (!col) return "";
        return counts.get(col.name) > 1 ? String(col.index1) : col.name;
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

        const quotedNumericName = raw.match(/^"(\d+)"$/);
        if (quotedNumericName) {
            return {
                kind: "name",
                name: quotedNumericName[1],
                raw
            };
        }

        if (/^[1-9]\d*$/.test(raw)) {
            return {
                kind: "index",
                index1: Number(raw),
                raw
            };
        }

        return {
            kind: "name",
            name: raw,
            raw
        };
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
            mm.meta[key] = { source: null, columnIndex: null };
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

            // Never overwrite a user-entered / chooser / suggestion value.
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
                    // keep auto status; resolved will be set from meta
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
                if (token.kind === "index" || token.kind === "name") {
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
            } else if (token.kind === "index") {
                const idx0 = token.index1 - 1;
                if (idx0 < 0 || idx0 >= columns.length) {
                    invalid = "Column index out of range";
                } else {
                    resolvedIndex = idx0;
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

            if (!invalid && resolvedIndex != null && !isColumnNumeric(resolvedIndex)) {
                invalid = "Selected column is not numeric";
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

        // same actual column mapped to several MANUAL variables -> invalid
        // auto fields must never veto a new manual mapping;
        // they will be refreshed after rerunning detection.
        const used = new Map();

        for (const key of MANUAL_KEYS) {
            const idx = mm.resolved[key];
            const text = String(mm.fields[key] ?? "").trim();
            const source = mm.meta[key]?.source ?? null;

            if (idx == null || text === "") continue;

            // Ignore auto fields here: manual mappings must win first,
            // then auto-mode fields will be recomputed from the new pipeline state.
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

    function updateManualMappingUI() {
        if (!menuEl) return;

        const mm = getManualMapping();
        const block = menuEl.querySelector(".settingsManualBlock");
        const check = menuEl.querySelector(".settingsManualCheck");
        const expandBtn = menuEl.querySelector(".settingsManualExpand");
        const fieldsWrap = menuEl.querySelector(".settingsManualFields");

        if (block) {
            block.classList.toggle("enabled", !!mm.enabled);
            block.classList.toggle("expanded", !!mm.expanded);
        }

        if (check) {
            check.classList.toggle("checked", !!mm.enabled);
            check.classList.toggle("state-grey", false);
            check.classList.toggle("state-red", false);

            const allEmpty = MANUAL_KEYS.every(k => String(mm.fields[k] ?? "").trim() === "");

            if (mm.enabled && allEmpty) {
                check.classList.add("state-grey");
            } else if (mm.enabled && mm.hasErrors && !allEmpty) {
                check.classList.add("state-red");
            }
        }

        if(fieldsWrap){
            fieldsWrap.style.display=mm.expanded?"":"none";
            fieldsWrap.classList.toggle("disabled",!mm.enabled);
        }

        if(expandBtn){
            expandBtn.classList.toggle("expanded",mm.expanded);
        }

        for (const key of MANUAL_KEYS) {
            const input = menuEl.querySelector(`.settingsManualInput[data-var="${key}"]`);
            const chooseBtn = menuEl.querySelector(`.settingsManualChoose[data-var="${key}"]`);
            const autoBtn = menuEl.querySelector(`.settingsManualAutoBtn[data-var="${key}"]`);
            const fieldArrow = menuEl.querySelector(`.settingsManualFieldArrow[data-var="${key}"]`);

            if (!input) continue;

            input.value = String(mm.fields[key] ?? "");
            input.title = String(mm.errors[key] ?? "");
            input.disabled = !mm.enabled;

            input.classList.toggle("state-auto", mm.status[key] === "auto");
            input.classList.toggle("state-valid", mm.status[key] === "valid");
            input.classList.toggle("state-warning", mm.status[key] === "warning");
            input.classList.toggle("state-invalid", mm.status[key] === "invalid");

            if (autoBtn) {
                autoBtn.disabled =
                    !AppState.dataLoaded ||
                    !["X", "Y", "Z", "t", "P"].includes(key);

                autoBtn.disabled = autoBtn.disabled || !mm.enabled;

                autoBtn.classList.toggle("active", mm.status[key] === "auto");
            }

            if (chooseBtn) {
                chooseBtn.disabled = !AppState.dataLoaded || !mm.enabled;
            }

            if (fieldArrow) {
                fieldArrow.disabled = !mm.enabled;
            }
        }
    }

    function pulseManualFieldError(key) {
        if (!menuEl) return;

        const input = menuEl.querySelector(`.settingsManualInput[data-var="${key}"]`);
        if (!input) return;

        input.classList.remove("pulse-error");
        void input.offsetWidth;
        input.classList.add("pulse-error");

        setTimeout(() => {
            input.classList.remove("pulse-error");
        }, 420);
    }

    function updateTitleBarSettingsError() {
        const mm = getManualMapping();

        const hasBlockingErrors =
            !!mm.enabled &&
            !!mm.hasErrors;

        titleBarController.setSettingsError(
            hasBlockingErrors,
            hasBlockingErrors ? "Some variables could not be mapped" : ""
        );
    }

    function positionMenu() {
        if (!menuEl) return;

        const btn = getButtonEl();
        if (!btn || !btn.isConnected) return;

        const r = btn.getBoundingClientRect();

        menuEl.style.top = `${r.bottom + 6}px`;
        menuEl.style.left = `${Math.max(8, r.right - menuEl.offsetWidth)}px`;
    }

    function rerunLoad() {
        if (!AppState.dataLoaded) return;

        loadData(
            originalRaw,
            colNamesOverrideGlobal,
            exportPathOverrideGlobal,
            settingsOptions
        );

        resetXYSelection();
        renderers.redrawXY();
        renderers.redrawTimeBar();
    }

    function applySettingChange(opt) {
        if (
            opt.label === "Remove edge lifts" ||
            opt.label === "Remove last stroke" ||
            opt.label === "Scale multiplier"
        ) {
            rerunLoad();
            return;
        }

        if (opt.label === "Show lifts") {
            resetXYSelection();
            renderers.redrawXY();
            renderers.redrawTimeBar();
        }
    }

    function applyManualMappingChange() {
        ensureManualMappingState();

        // First resolve current manual entries so loadData gets the latest overrides
        validateManualMappings();

        // Then rerun the detection pipeline with locked manual columns
        rerunLoad();

        // Then refresh all auto-mode fields from the NEW detected columns
        syncAutoFieldsFromDetected();

        // Finally revalidate everything and redraw UI
        validateManualMappings();
        updateManualMappingUI();
        updateTitleBarSettingsError();
    }

    function updateRegularChecks() {
        if (!menuEl) return;

        const items = menuEl.querySelectorAll(".settingsMenuItem[data-setting-index]");
        items.forEach(item => {
            const index = Number(item.dataset.settingIndex);
            const opt = settingsOptions[index];
            const check = item.querySelector(".settingsMenuCheck");
            if (check) {
                check.classList.toggle("checked", !!opt?.checked);
            }
        });
    }

    function updateScaleUI() {
        if (!menuEl) return;

        const scaleOpt = getScaleOption();
        if (!scaleOpt) return;

        const check = menuEl.querySelector(".settingsScaleCheck");
        const xInput = menuEl.querySelector(".settingsScaleInputX");
        const yInput = menuEl.querySelector(".settingsScaleInputY");
        const fields = menuEl.querySelector(".settingsScaleFields");
        const expandBtn = menuEl.querySelector(".settingsScaleExpand");
        const error = menuEl.querySelector(".settingsScaleError");

        if (check) {
            check.classList.toggle("checked", !!scaleOpt.checked);
        }

        if (xInput) xInput.value = String(scaleOpt.xText ?? "1");
        if (yInput) yInput.value = String(scaleOpt.yText ?? "1");

        if(fields){
            fields.classList.toggle("disabled",!scaleOpt.checked);
            fields.style.display=scaleOpt.expanded?"":"none";
        }

        if(expandBtn){
            expandBtn.classList.toggle("expanded",scaleOpt.expanded);
        }

        if (xInput) xInput.disabled = !scaleOpt.checked;
        if (yInput) yInput.disabled = !scaleOpt.checked;

        if (error) {
            const msg = String(scaleOpt.error ?? "");
            error.textContent = msg;
            error.style.display = msg ? "" : "none";
        }
    }

    function toggleOption(index) {
        const opt = settingsOptions[index];
        if (!opt) return;

        opt.checked = !opt.checked;
        if(opt.checked) opt.expanded=true;
        updateRegularChecks();
        applySettingChange(opt);
    }

    function parseScaleValue(text) {
        const raw = String(text ?? "").trim();

        if (raw === "") {
            return { kind: "empty", text: "1", value: 1 };
        }

        if (raw.includes(",")) {
            return {
                kind: "invalid",
                message: "Values must be numeric or fractions (commas not allowed)"
            };
        }

        const decRe = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
        const fracRe = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\/([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/;

        if (decRe.test(raw)) {
            const v = Number(raw);
            if (!Number.isFinite(v)) {
                return {
                    kind: "invalid",
                    message: "Values must be numeric or fractions (commas not allowed)"
                };
            }
            if (v === 0) {
                return { kind: "zero" };
            }
            return { kind: "valid", text: raw, value: v };
        }

        const m = raw.match(fracRe);
        if (m) {
            const num = Number(m[1]);
            const den = Number(m[2]);

            if (!Number.isFinite(num) || !Number.isFinite(den)) {
                return {
                    kind: "invalid",
                    message: "Values must be numeric or fractions (commas not allowed)"
                };
            }
            if (den === 0) {
                return { kind: "zero" };
            }

            const v = num / den;
            if (!Number.isFinite(v) || v === 0) {
                return { kind: "zero" };
            }

            return { kind: "valid", text: raw, value: v };
        }

        return {
            kind: "invalid",
            message: "Values must be numeric or fractions (commas not allowed)"
        };
    }

    function commitScaleField(axis) {
        const scaleOpt = getScaleOption();
        if (!scaleOpt) return;

        const textKey = axis === "x" ? "xText" : "yText";
        const valueKey = axis === "x" ? "xValue" : "yValue";

        const parsed = parseScaleValue(scaleOpt[textKey]);

        if (parsed.kind === "empty") {
            scaleOpt[textKey] = "1";
            scaleOpt[valueKey] = 1;
            scaleOpt.error = "";
            updateScaleUI();
            if (scaleOpt.checked) applySettingChange(scaleOpt);
            return;
        }

        if (parsed.kind === "zero") {
            scaleOpt[textKey] = "1";
            scaleOpt[valueKey] = 1;
            scaleOpt.error = "Scale cannot be 0";
            updateScaleUI();
            if (scaleOpt.checked) applySettingChange(scaleOpt);
            return;
        }

        if (parsed.kind === "invalid") {
            scaleOpt.error = parsed.message;
            updateScaleUI();
            return;
        }

        scaleOpt[textKey] = parsed.text;
        scaleOpt[valueKey] = parsed.value;
        scaleOpt.error = "";
        updateScaleUI();

        if (scaleOpt.checked) {
            applySettingChange(scaleOpt);
        }
    }

    function closeSuggestionList() {
        if (activeSuggestionList) {
            activeSuggestionList.remove();
            activeSuggestionList = null;
        }
        activeSuggestionMode = null;
        activeSuggestionKey = null;
    }

    function applyColumnSelection(key, col, source, inputEl = null) {
        const mm = getManualMapping();

        mm.fields[key] = col.name;
        mm.meta[key].source = source;
        mm.meta[key].columnIndex = col.index0;
        mm.resolved[key] = col.index0;
        mm.errors[key] = "";
        mm.status[key] = "valid";

        closeSuggestionList();
        validateManualMappings();
        updateManualMappingUI();
        applyManualMappingChange();

        if (inputEl) {
            inputEl.blur();
        }
    }

    function closeChooserModal() {
        if (!chooserModalEl) return;
        chooserModalEl.remove();
        chooserModalEl = null;
    }

    function closeMenu() {
        if (!menuEl) return;

        closeSuggestionList();
        closeChooserModal();

        const mm = getManualMapping();

        if(!mm.enabled){
            mm.expanded=false;
        }

        menuEl.remove();
        menuEl = null;
        updateTitleBarSettingsError();
        titleBarController.setSettingsMenuOpen(false);

        if (docMouseDown) {
            document.removeEventListener("mousedown", docMouseDown, true);
            docMouseDown = null;
        }
    }

    function buildRegularItem(opt, index) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "settingsMenuItem";
        item.dataset.settingIndex = String(index);

        const check = document.createElement("span");
        check.className = "settingsMenuCheck";
        if (opt.checked) check.classList.add("checked");

        const label = document.createElement("span");
        label.className = "settingsMenuLabel";
        label.textContent = opt.label;

        item.append(check, label);

        item.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        item.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            toggleOption(index);
        });

        return item;
    }

    function buildScaleSection(opt) {
        if(opt.expanded===undefined) opt.expanded=false;

        const wrap = document.createElement("div");
        wrap.className = "settingsScaleBlock";

        const top = document.createElement("button");
        top.type = "button";
        top.className = "settingsMenuItem settingsScaleToggle";

        const check = document.createElement("span");
        check.className = "settingsMenuCheck settingsScaleCheck";
        if (opt.checked) check.classList.add("checked");

        const label = document.createElement("span");
        label.className = "settingsMenuLabel";
        label.textContent = opt.label;

        const expandBtn=document.createElement("button");
        expandBtn.type="button";
        expandBtn.className="settingsScaleExpand";
        expandBtn.textContent="▸";

        if(opt.expanded) expandBtn.classList.add("expanded");

        expandBtn.addEventListener("mousedown",e=>{
            e.preventDefault();
            e.stopPropagation();
        });

        expandBtn.addEventListener("click",e=>{
            e.preventDefault();
            e.stopPropagation();

            opt.expanded=!opt.expanded;

            updateScaleUI();
        });

        top.append(check,label,expandBtn);

        top.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        top.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            opt.checked = !opt.checked;
            if(opt.checked) opt.expanded=true;
            updateScaleUI();
            applySettingChange(opt);
        });

        const fields = document.createElement("div");
        fields.className = "settingsScaleFields";
        if (!opt.checked) fields.classList.add("disabled");
        fields.style.display=opt.expanded?"":"none";

        const rowX = document.createElement("div");
        rowX.className = "settingsScaleRow";

        const labelX = document.createElement("label");
        labelX.className = "settingsScaleAxisLabel";
        labelX.textContent = "X";

        const inputX = document.createElement("input");
        inputX.type = "text";
        inputX.className = "settingsScaleInput settingsScaleInputX";
        inputX.value = String(opt.xText ?? "1");
        inputX.disabled = !opt.checked;
        inputX.autocomplete = "off";
        inputX.spellcheck = false;

        rowX.append(labelX, inputX);

        const rowY = document.createElement("div");
        rowY.className = "settingsScaleRow";

        const labelY = document.createElement("label");
        labelY.className = "settingsScaleAxisLabel";
        labelY.textContent = "Y";

        const inputY = document.createElement("input");
        inputY.type = "text";
        inputY.className = "settingsScaleInput settingsScaleInputY";
        inputY.value = String(opt.yText ?? "1");
        inputY.disabled = !opt.checked;
        inputY.autocomplete = "off";
        inputY.spellcheck = false;

        rowY.append(labelY, inputY);

        const error = document.createElement("div");
        error.className = "settingsScaleError";
        error.textContent = String(opt.error ?? "");
        error.style.display = opt.error ? "" : "none";

        function wireInput(input, axis) {
            input.addEventListener("mousedown", e => {
                e.stopPropagation();
            });

            input.addEventListener("click", e => {
                e.stopPropagation();
                closeSuggestionList();
                input.select();
            });

            input.addEventListener("focus", () => {
                closeSuggestionList();
            });

            input.addEventListener("input", e => {
                opt[axis === "x" ? "xText" : "yText"] = e.target.value;
                opt.error = "";
                updateScaleUI();
            });

            input.addEventListener("keydown", e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    commitScaleField(axis);
                    input.blur();
                }
            });

            input.addEventListener("blur", () => {
                commitScaleField(axis);
            });
        }

        wireInput(inputX, "x");
        wireInput(inputY, "y");

        fields.append(rowX, rowY, error);
        wrap.append(top, fields);

        return wrap;
    }

    function buildManualRow(key) {
        const mm = getManualMapping();

        const row = document.createElement("div");
        row.className = "settingsManualRow";

        const label = document.createElement("label");
        label.className = "settingsManualVarLabel";
        label.textContent = key;

        const inputWrap = document.createElement("div");
        inputWrap.className = "settingsManualInputWrap";
        inputWrap.classList.add("hasFieldArrow");

        const input = document.createElement("input");
        input.type = "text";
        input.className = "settingsManualInput";
        input.dataset.var = key;
        input.value = String(mm.fields[key] ?? "");
        input.autocomplete = "off";
        input.spellcheck = false;

        const autoBtn = document.createElement("button");
        autoBtn.type="button";
        autoBtn.className="settingsManualAutoBtn";
        autoBtn.dataset.var=key;
        autoBtn.textContent="auto";

        const chooseBtn = document.createElement("button");
        chooseBtn.type = "button";
        chooseBtn.className = "settingsManualChoose";
        chooseBtn.dataset.var = key;
        chooseBtn.textContent = "choose";
        chooseBtn.disabled = !AppState.dataLoaded;

        const suggestionAnchor = document.createElement("div");
        suggestionAnchor.className = "settingsManualSuggestAnchor";

        const fieldArrow = document.createElement("button");
        fieldArrow.type = "button";
        fieldArrow.className = "settingsManualFieldArrow";
        fieldArrow.dataset.var = key;
        fieldArrow.textContent = "▾";

        inputWrap.append(input, fieldArrow, suggestionAnchor);
        row.append(label,inputWrap,autoBtn,chooseBtn);

        input.addEventListener("mousedown", e => {
            e.stopPropagation();
        });

        input.addEventListener("click", e => {
            e.stopPropagation();
            input.select();
        });

        input.addEventListener("input", e => {
            const mm2 = getManualMapping();
            mm2.fields[key] = e.target.value;
            mm2.meta[key].source = "typed";
            mm2.meta[key].columnIndex = null;
            mm2.resolved[key] = null;
            mm2.errors[key] = "";
            mm2.status[key] = e.target.value.trim() === "" ? "empty" : "valid";

            closeSuggestionList();
            validateManualMappings();
            updateManualMappingUI();
            maybeShowSuggestions(key, input, suggestionAnchor);
        });

        input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                closeSuggestionList();

                const mm2 = getManualMapping();
                if (mm2.fields[key].trim() === "") {
                    mm2.meta[key].source = null;
                    mm2.meta[key].columnIndex = null;
                    mm2.resolved[key] = null;
                    mm2.status[key] = "empty";
                    mm2.errors[key] = "";
                }

                validateManualMappings();
                updateManualMappingUI();
                applyManualMappingChange();
                input.blur();
            }
        });

        input.addEventListener("blur", () => {
            closeSuggestionList();

            const mm2 = getManualMapping();
            if (mm2.fields[key].trim() === "") {
                mm2.meta[key].source = null;
                mm2.meta[key].columnIndex = null;
                mm2.resolved[key] = null;
                mm2.status[key] = "empty";
                mm2.errors[key] = "";
            }

            validateManualMappings();
            updateManualMappingUI();
            applyManualMappingChange();
        });

        chooseBtn.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        chooseBtn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            openChooserModalForVariable(key);
        });

        fieldArrow.addEventListener("mousedown", e=>{
            e.preventDefault();
            e.stopPropagation();
        });

        fieldArrow.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            if (
                activeSuggestionList &&
                activeSuggestionMode === "full" &&
                activeSuggestionKey === key
            ) {
                closeSuggestionList();
                return;
            }

            showAllColumnsDropdown(key, input, suggestionAnchor);
        });

        autoBtn.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        autoBtn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            if (!AppState.dataLoaded) return;
            if (!["X", "Y", "Z", "t", "P"].includes(key)) return;

            const mm2 = getManualMapping();

            // Clicking auto means this variable is no longer manually locked.
            mm2.fields[key] = "";
            mm2.resolved[key] = null;
            mm2.errors[key] = "";
            mm2.status[key] = "empty";
            mm2.meta[key] = {
                source: "auto",
                columnIndex: null
            };

            // Rerun with all OTHER manual mappings locked, but not this one.
            applyManualMappingChange();

            // If nothing was found for this variable, show the pulse.
            if (mm2.status[key] !== "auto" || mm2.resolved[key] == null) {
                pulseManualFieldError(key);
                updateManualMappingUI();
            }
        });

        return row;
    }

    function maybeShowSuggestions(key, inputEl, anchorEl) {
        closeSuggestionList();

        const columns = getNumericDatasetColumns();
        if (!columns.length) return;

        const raw = String(inputEl.value ?? "").trim();
        if (!raw) return;
        if (/^[1-9]\d*$/.test(raw)) return;
        if (/^"\d+"$/.test(raw)) return;

        const matches = columns.filter(c =>
            c.name.toLowerCase().includes(raw.toLowerCase())
        );

        if (!matches.length) return;

        const usedBy = getColumnAssignments();

        const list = document.createElement("div");
        list.className = "settingsManualSuggestList";

        matches.forEach(col => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "settingsManualSuggestItem";

            const nameSpan = document.createElement("span");
            nameSpan.className = "settingsManualSuggestName";
            nameSpan.textContent = col.name;

            item.appendChild(nameSpan);

            const assigned = usedBy.get(col.index0) ?? [];
            if (assigned.length) {
                item.classList.add("assigned");

                const assignedSpan = document.createElement("span");
                assignedSpan.className = "settingsManualSuggestAssigned";
                assignedSpan.textContent = assigned.join(", ");
                item.appendChild(assignedSpan);
            }

            item.addEventListener("mousedown", e => {
                e.preventDefault();
                e.stopPropagation();
            });

            item.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                applyColumnSelection(key, col, "suggestion", inputEl);
            });

            list.appendChild(item);
        });

        const r = inputEl.getBoundingClientRect();
        list.style.left = `${r.left + window.scrollX}px`;
        list.style.top = `${r.bottom + window.scrollY + 2}px`;
        list.style.minWidth = `${Math.max(120, r.width)}px`;

        document.body.appendChild(list);
        activeSuggestionList = list;
        activeSuggestionMode = "typed";
        activeSuggestionKey = key;
    }

    function showAllColumnsDropdown(key, inputEl, anchorEl) {
        closeSuggestionList();

        const columns = getNumericDatasetColumns();
        if (!columns.length) return;

        const usedBy = getColumnAssignments();

        const list = document.createElement("div");
        list.className = "settingsManualSuggestList";

        columns.forEach(col => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "settingsManualSuggestItem";

            const nameSpan = document.createElement("span");
            nameSpan.className = "settingsManualSuggestName";
            nameSpan.textContent = col.name;
            item.appendChild(nameSpan);

            const assigned = usedBy.get(col.index0) ?? [];
            if (assigned.length) {
                item.classList.add("assigned");

                const assignedSpan = document.createElement("span");
                assignedSpan.className = "settingsManualSuggestAssigned";
                assignedSpan.textContent = assigned.join(", ");
                item.appendChild(assignedSpan);
            }

            item.addEventListener("mousedown", e => {
                e.preventDefault();
                e.stopPropagation();
            });

            item.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                applyColumnSelection(key, col, "suggestion", inputEl);
            });

            list.appendChild(item);
        });

        const r = inputEl.getBoundingClientRect();
        list.style.left = `${r.left + window.scrollX}px`;
        list.style.top = `${r.bottom + window.scrollY + 2}px`;
        list.style.minWidth = `${Math.max(120, r.width)}px`;

        document.body.appendChild(list);

        activeSuggestionList = list;
        activeSuggestionMode = "full";
        activeSuggestionKey = key;
    }

    function openChooserModalForVariable(key) {
        if (!AppState.dataLoaded) return;

        closeChooserModal();

        const raw = getDatasetRaw();
        const columns = getDatasetColumns();
        if (!raw || !columns.length) return;

        let selectedIndex0 = null;

        chooserModalEl = document.createElement("div");
        chooserModalEl.className = "settingsChooserModal";

        const box = document.createElement("div");
        box.className = "settingsChooserBox";

        const title = document.createElement("div");
        title.className = "settingsChooserTitle";
        title.textContent = `Choose column for ${key}`;

        const tableWrap = document.createElement("div");
        tableWrap.className = "settingsChooserTableWrap";

        const table = document.createElement("table");
        table.className = "settingsChooserTable";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");

        columns.forEach(col => {
            const th = document.createElement("th");
            th.textContent = col.name;
            th.dataset.index0 = String(col.index0);

            th.addEventListener("click", () => {
                selectedIndex0 = col.index0;
                refreshSelectedColumn();
            });

            headRow.appendChild(th);
        });

        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        raw.slice(0, 20).forEach(rowObj => {
            const tr = document.createElement("tr");

            columns.forEach(col => {
                const td = document.createElement("td");
                td.textContent = String(rowObj[col.name] ?? "");
                td.dataset.index0 = String(col.index0);

                td.addEventListener("click", () => {
                    selectedIndex0 = col.index0;
                    refreshSelectedColumn();
                });

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);

        const actions = document.createElement("div");
        actions.className = "settingsChooserActions";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "settingsChooserCancel";
        cancelBtn.textContent = "Cancel";

        const validateBtn = document.createElement("button");
        validateBtn.type = "button";
        validateBtn.className = "settingsChooserValidate";
        validateBtn.textContent = "Validate";

        cancelBtn.addEventListener("click", () => {
            const mm = getManualMapping();
            mm.fields[key] = "";
            mm.meta[key].source = null;
            mm.meta[key].columnIndex = null;
            mm.resolved[key] = null;
            mm.status[key] = "empty";
            mm.errors[key] = "";
            closeChooserModal();
            validateManualMappings();
            updateManualMappingUI();
            updateTitleBarSettingsError();
        });

        validateBtn.addEventListener("click", () => {
            if (selectedIndex0 == null) return;

            const mm = getManualMapping();
            const duplicateCounts = getDuplicateNameCounts(columns);
            const col = columns[selectedIndex0];
            const duplicated = duplicateCounts.get(col.name) > 1;

            mm.fields[key] = duplicated ? String(col.index1) : col.name;
            mm.meta[key].source = "chooser";
            mm.meta[key].columnIndex = selectedIndex0;

            validateManualMappings();
            updateManualMappingUI();
            applyManualMappingChange();
            closeChooserModal();
        });

        actions.append(cancelBtn, validateBtn);
        box.append(title, tableWrap, actions);
        chooserModalEl.appendChild(box);
        document.body.appendChild(chooserModalEl);

        function refreshSelectedColumn() {
            box.querySelectorAll("[data-index0]").forEach(el => {
                el.classList.toggle(
                    "selected-col",
                    Number(el.dataset.index0) === selectedIndex0
                );
            });
        }
    }

    function buildManualMappingSection() {
        const mm = getManualMapping();
        if (mm.expanded === undefined) mm.expanded = false;

        const wrap = document.createElement("div");
        wrap.className = "settingsManualBlock";

        const top = document.createElement("div");
        top.className = "settingsMenuItem settingsManualToggle";

        const check = document.createElement("span");
        check.className = "settingsMenuCheck settingsManualCheck";
        if (mm.enabled) check.classList.add("checked");

        const checkHit = document.createElement("button");
        checkHit.type = "button";
        checkHit.className = "settingsCheckHit";
        checkHit.appendChild(check);

        const label = document.createElement("span");
        label.className = "settingsMenuLabel";
        label.textContent = "Manual mapping";

        const expandBtn = document.createElement("button");
        expandBtn.type = "button";
        expandBtn.className = "settingsManualExpand";
        expandBtn.textContent = "▸";
        if (mm.expanded) expandBtn.classList.add("expanded");

        top.append(checkHit, label, expandBtn);

        checkHit.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        checkHit.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            mm.enabled = !mm.enabled;
            if (mm.enabled) mm.expanded = true;

            if (mm.enabled) {
                primeAutoFieldsOnEnable();
            }

            validateManualMappings();
            updateManualMappingUI();
            applyManualMappingChange();
        });

        expandBtn.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        expandBtn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            mm.expanded = !mm.expanded;

            if (mm.expanded) {
                syncManualMappingPreviewFromDetected();
            }

            updateManualMappingUI();
        });

        top.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        top.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            if (e.target === checkHit || checkHit.contains(e.target)) return;
            if (e.target === expandBtn || expandBtn.contains(e.target)) return;

            mm.expanded = !mm.expanded;

            if (mm.expanded) {
                syncManualMappingPreviewFromDetected();
            }

            updateManualMappingUI();
        });

        const fields = document.createElement("div");
        fields.className = "settingsManualFields";
        fields.style.display = mm.expanded ? "" : "none";

        for (const key of MANUAL_KEYS) {
            fields.appendChild(buildManualRow(key));
        }

        wrap.append(top, fields);
        return wrap;
    }

    function buildScaleSection(opt) {
        if (opt.expanded === undefined) opt.expanded = false;

        const wrap = document.createElement("div");
        wrap.className = "settingsScaleBlock";

        const top = document.createElement("div");
        top.className = "settingsMenuItem settingsScaleToggle";

        const check = document.createElement("span");
        check.className = "settingsMenuCheck settingsScaleCheck";
        if (opt.checked) check.classList.add("checked");

        const checkHit = document.createElement("button");
        checkHit.type = "button";
        checkHit.className = "settingsCheckHit";
        checkHit.appendChild(check);

        const label = document.createElement("span");
        label.className = "settingsMenuLabel";
        label.textContent = opt.label;

        const expandBtn = document.createElement("button");
        expandBtn.type = "button";
        expandBtn.className = "settingsScaleExpand";
        expandBtn.textContent = "▸";
        if (opt.expanded) expandBtn.classList.add("expanded");

        top.append(checkHit, label, expandBtn);

        checkHit.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        checkHit.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            opt.checked = !opt.checked;
            if (opt.checked) opt.expanded = true;

            updateScaleUI();
            applySettingChange(opt);
        });

        expandBtn.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        expandBtn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            opt.expanded = !opt.expanded;
            updateScaleUI();
        });

        top.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        top.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            if (e.target === checkHit || checkHit.contains(e.target)) return;
            if (e.target === expandBtn || expandBtn.contains(e.target)) return;

            opt.expanded = !opt.expanded;
            updateScaleUI();
        });

        const fields = document.createElement("div");
        fields.className = "settingsScaleFields";
        if (!opt.checked) fields.classList.add("disabled");
        fields.style.display = opt.expanded ? "" : "none";

        const rowX = document.createElement("div");
        rowX.className = "settingsScaleRow";

        const labelX = document.createElement("label");
        labelX.className = "settingsScaleAxisLabel";
        labelX.textContent = "X";

        const inputX = document.createElement("input");
        inputX.type = "text";
        inputX.className = "settingsScaleInput settingsScaleInputX";
        inputX.value = String(opt.xText ?? "1");
        inputX.disabled = !opt.checked;
        inputX.autocomplete = "off";
        inputX.spellcheck = false;

        rowX.append(labelX, inputX);

        const rowY = document.createElement("div");
        rowY.className = "settingsScaleRow";

        const labelY = document.createElement("label");
        labelY.className = "settingsScaleAxisLabel";
        labelY.textContent = "Y";

        const inputY = document.createElement("input");
        inputY.type = "text";
        inputY.className = "settingsScaleInput settingsScaleInputY";
        inputY.value = String(opt.yText ?? "1");
        inputY.disabled = !opt.checked;
        inputY.autocomplete = "off";
        inputY.spellcheck = false;

        rowY.append(labelY, inputY);

        const error = document.createElement("div");
        error.className = "settingsScaleError";
        error.textContent = String(opt.error ?? "");
        error.style.display = opt.error ? "" : "none";

        function wireInput(input, axis) {
            input.addEventListener("mousedown", e => {
                e.stopPropagation();
            });

            input.addEventListener("click", e => {
                e.stopPropagation();
                input.select();
            });

            input.addEventListener("input", e => {
                opt[axis === "x" ? "xText" : "yText"] = e.target.value;
                opt.error = "";
                updateScaleUI();
            });

            input.addEventListener("keydown", e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    commitScaleField(axis);
                    input.blur();
                }
            });

            input.addEventListener("blur", () => {
                commitScaleField(axis);
            });
        }

        wireInput(inputX, "x");
        wireInput(inputY, "y");

        fields.append(rowX, rowY, error);
        wrap.append(top, fields);

        return wrap;
    }

    function buildCategory(title) {
        const wrap = document.createElement("div");
        wrap.className = "settingsMenuCategory";

        const label = document.createElement("div");
        label.className = "settingsMenuCategoryTitle";
        label.textContent = title;

        const sep = document.createElement("div");
        sep.className = "settingsMenuCategorySep";

        wrap.append(label, sep);

        return wrap;
    }

    function openMenu() {
        if (menuEl) return;

        syncManualMappingPreviewFromDetected();
        validateManualMappings();
        updateTitleBarSettingsError();

        menuEl = document.createElement("div");
        menuEl.className = "settingsMenu";

        // VARIABLES
        menuEl.appendChild(buildCategory("Variables"));
        menuEl.appendChild(buildManualMappingSection());

        // DISPLAY
        menuEl.appendChild(buildCategory("Display"));

        settingsOptions.forEach((opt, index) => {
            if (opt.label === "Show lifts") {
                menuEl.appendChild(buildRegularItem(opt, index));
            }
        });

        // FILTERS
        menuEl.appendChild(buildCategory("Filters"));

        settingsOptions.forEach((opt, index) => {
            if (
                opt.label === "Remove edge lifts" ||
                opt.label === "Remove last stroke"
            ) {
                menuEl.appendChild(buildRegularItem(opt, index));
            }
        });

        // TRANSFORMS
        menuEl.appendChild(buildCategory("Transforms"));

        settingsOptions.forEach((opt) => {
            if (opt.label === "Scale multiplier") {
                menuEl.appendChild(buildScaleSection(opt));
            }
        });

        document.body.appendChild(menuEl);
        positionMenu();
        updateScaleUI();
        updateManualMappingUI();
        titleBarController.setSettingsMenuOpen(true);

        docMouseDown = e => {
            const btn = getButtonEl();
            if (!menuEl) return;

            const clickInsideMenu = menuEl.contains(e.target);
            const clickOnButton = btn?.contains?.(e.target);
            const clickInSuggestions = activeSuggestionList?.contains?.(e.target);
            const clickInChooser = chooserModalEl?.contains?.(e.target);
            const clickOnFieldArrow = e.target?.closest?.(".settingsManualFieldArrow");

            if (clickInChooser) {
                return;
            }

            if (clickInSuggestions) {
                return;
            }

            // Let the arrow click handler manage open/close itself.
            if (clickOnFieldArrow) {
                return;
            }

            if (clickInsideMenu || clickOnButton) {
                closeSuggestionList();
                return;
            }

            closeSuggestionList();
            closeMenu();
        };

        setTimeout(() => {
            document.addEventListener("mousedown", docMouseDown, true);
        }, 0);
    }

    function toggleMenu() {
        if (menuEl) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    titleBarController.setSettingsHandler(toggleMenu);

    window.addEventListener("resize", () => {
        if (menuEl) positionMenu();
    });

    validateManualMappings();
    updateTitleBarSettingsError();

    return {
        closeMenu
    };
}