// -------------------------------------------------------------
// settings_scale.js
// Scale multiplier settings section
// -------------------------------------------------------------

export function createScaleController({
    menuRef,
    settingsOptions,
    applySettingChange,
    closeSuggestionList
}) {
    function getMenuEl() {
        return menuRef();
    }

    function getScaleOption() {
        return settingsOptions.find(o => o.label === "Scale multiplier") ?? null;
    }

    function updateScaleUI() {
        const menuEl = getMenuEl();
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

        if (fields) {
            fields.classList.toggle("disabled", !scaleOpt.checked);
            fields.style.display = scaleOpt.expanded ? "" : "none";
        }

        if (expandBtn) {
            expandBtn.classList.toggle("expanded", scaleOpt.expanded);
        }

        if (xInput) xInput.disabled = !scaleOpt.checked;
        if (yInput) yInput.disabled = !scaleOpt.checked;

        if (error) {
            const msg = String(scaleOpt.error ?? "");
            error.textContent = msg;
            error.style.display = msg ? "" : "none";
        }
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

    return {
        getScaleOption,
        updateScaleUI,
        buildScaleSection
    };
}