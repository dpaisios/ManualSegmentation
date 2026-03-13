// -------------------------------------------------------------
// settings_menu_ui.js
// Settings menu UI builders and manual-mapping UI
// -------------------------------------------------------------

export function buildCategory(title) {
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

export function buildRegularItem(opt, index, toggleOption) {
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

export function buildCheckboxGroupItem(opt, index, toggleOption, toggleChildOption) {
    const wrap = document.createElement("div");
    wrap.className = "settingsGroupBlock";
    wrap.dataset.settingIndex = String(index);

    const top = document.createElement("div");
    top.className = "settingsMenuItem settingsGroupToggle";
    if (opt.enabled === false) top.classList.add("disabled");

    const check = document.createElement("span");
    check.className = "settingsMenuCheck settingsGroupCheck";
    if (opt.checked) check.classList.add("checked");
    if (opt.enabled === false) check.classList.add("disabled");

    const checkHit = document.createElement("button");
    checkHit.type = "button";
    checkHit.className = "settingsCheckHit";
    checkHit.appendChild(check);

    const label = document.createElement("span");
    label.className = "settingsMenuLabel";
    label.textContent = opt.label;
    if (opt.enabled === false) label.classList.add("disabled");

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "settingsManualExpand settingsGroupExpand";
    expandBtn.textContent = "▸";
    expandBtn.disabled = opt.enabled === false;
    if (opt.expanded) expandBtn.classList.add("expanded");

    top.append(checkHit, label, expandBtn);

    const childrenWrap = document.createElement("div");
    childrenWrap.className = "settingsGroupChildren";
    childrenWrap.style.display = opt.expanded ? "" : "none";

    (opt.children ?? []).forEach((child, childIndex) => {
        const childItem = document.createElement("button");
        childItem.type = "button";
        childItem.className = "settingsMenuItem settingsGroupChild";
        childItem.dataset.settingIndex = String(index);
        childItem.dataset.childIndex = String(childIndex);

        const childCheck = document.createElement("span");
        childCheck.className = "settingsMenuCheck settingsGroupChildCheck";
        if (child.checked) childCheck.classList.add("checked");

        const childLabel = document.createElement("span");
        childLabel.className = "settingsMenuLabel";
        childLabel.textContent = child.label;

        childItem.append(childCheck, childLabel);

        childItem.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        childItem.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            toggleChildOption(index, childIndex);
        });

        childrenWrap.appendChild(childItem);
    });

    checkHit.addEventListener("mousedown", e => {
        e.preventDefault();
        e.stopPropagation();
    });

    checkHit.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        if (opt.enabled === false) return;
        toggleOption(index);
    });

    expandBtn.addEventListener("mousedown", e => {
        e.preventDefault();
        e.stopPropagation();
    });

    expandBtn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        if (opt.enabled === false) return;
        opt.expanded = !opt.expanded;
        wrap.classList.toggle("expanded", !!opt.expanded);
        expandBtn.classList.toggle("expanded", !!opt.expanded);
        childrenWrap.style.display = opt.expanded ? "" : "none";
    });

    top.addEventListener("mousedown", e => {
        e.preventDefault();
        e.stopPropagation();
    });

    top.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();

        if (opt.enabled === false) return;
        if (e.target === checkHit || checkHit.contains(e.target)) return;
        if (e.target === expandBtn || expandBtn.contains(e.target)) return;

        opt.expanded = !opt.expanded;
        wrap.classList.toggle("expanded", !!opt.expanded);
        expandBtn.classList.toggle("expanded", !!opt.expanded);
        childrenWrap.style.display = opt.expanded ? "" : "none";
    });

    wrap.classList.toggle("expanded", !!opt.expanded);
    wrap.append(top, childrenWrap);

    return wrap;
}

export function updateRegularChecks(menuEl, settingsOptions) {
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

export function updateCheckboxGroupItems(menuEl, settingsOptions) {
    if (!menuEl) return;

    const blocks = menuEl.querySelectorAll(".settingsGroupBlock[data-setting-index]");
    blocks.forEach(block => {
        const index = Number(block.dataset.settingIndex);
        const opt = settingsOptions[index];
        if (!opt) return;

        const top = block.querySelector(".settingsGroupToggle");
        const check = block.querySelector(".settingsGroupCheck");
        const label = block.querySelector(".settingsMenuLabel");
        const expandBtn = block.querySelector(".settingsGroupExpand");
        const childrenWrap = block.querySelector(".settingsGroupChildren");

        block.classList.toggle("expanded", !!opt.expanded);
        if (top) top.classList.toggle("disabled", opt.enabled === false);
        if (check) {
            check.classList.toggle("checked", !!opt.checked);
            check.classList.toggle("disabled", opt.enabled === false);
        }
        if (label) {
            label.classList.toggle("disabled", opt.enabled === false);
        }
        if (expandBtn) {
            expandBtn.classList.toggle("expanded", !!opt.expanded);
            expandBtn.disabled = opt.enabled === false;
        }
        if (childrenWrap) {
            childrenWrap.style.display = opt.expanded ? "" : "none";
        }

        const childItems = block.querySelectorAll(".settingsGroupChild[data-child-index]");
        childItems.forEach(childItem => {
            const childIndex = Number(childItem.dataset.childIndex);
            const childOpt = opt.children?.[childIndex];
            const childCheck = childItem.querySelector(".settingsGroupChildCheck");
            if (childCheck) {
                childCheck.classList.toggle("checked", !!childOpt?.checked);
            }
        });
    });
}

export function updateManualMappingUI({
    menuEl,
    getManualMapping,
    MANUAL_KEYS,
    AppState
}) {
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

    if (fieldsWrap) {
        fieldsWrap.style.display = mm.expanded ? "" : "none";
        fieldsWrap.classList.toggle("disabled", !mm.enabled);
    }

    if (expandBtn) {
        expandBtn.classList.toggle("expanded", mm.expanded);
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

        input.classList.remove("state-auto", "state-valid", "state-warning", "state-invalid");

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

export function pulseManualFieldError(menuEl, key) {
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

export function createManualMappingMenuUI({
    AppState,
    MANUAL_KEYS,
    manualMappingController,

    setChooserModal,

    activeSuggestionListRef,
    setActiveSuggestionList,
    activeSuggestionModeRef,
    setActiveSuggestionMode,
    activeSuggestionKeyRef,
    setActiveSuggestionKey,

    updateManualMappingUI,
    updateTitleBarSettingsError,
    pulseManualFieldError,

    applyColumnSelection,
    applyManualMappingChange,
    closeSuggestionList,
    closeChooserModal
}) {
    const {
        getManualMapping,
        getDatasetRaw,
        getDatasetColumns,
        getDuplicateNameCounts,
        getNumericDatasetColumns,
        getColumnAssignments,
        validateManualMappings,
        syncManualMappingPreviewFromDetected,
        primeAutoFieldsOnEnable
    } = manualMappingController;

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
        autoBtn.type = "button";
        autoBtn.className = "settingsManualAutoBtn";
        autoBtn.dataset.var = key;
        autoBtn.textContent = "auto";

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
        row.append(label, inputWrap, autoBtn, chooseBtn);

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
            maybeShowSuggestions(key, input);
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

        fieldArrow.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
        });

        fieldArrow.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();

            if (
                activeSuggestionListRef() &&
                activeSuggestionModeRef() === "full" &&
                activeSuggestionKeyRef() === key
            ) {
                closeSuggestionList();
                return;
            }

            showAllColumnsDropdown(key, input);
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
            const isActiveAuto = mm2.status[key] === "auto";

            // If already in auto mode: deactivate auto and clear the field
            if (isActiveAuto) {
                mm2.fields[key] = "";
                mm2.resolved[key] = null;
                mm2.errors[key] = "";
                mm2.status[key] = "empty";
                mm2.meta[key] = {
                    source: null,
                    columnIndex: null
                };

                validateManualMappings();
                updateManualMappingUI();
                applyManualMappingChange();
                return;
            }

            // Otherwise activate auto mode
            mm2.fields[key] = "";
            mm2.resolved[key] = null;
            mm2.errors[key] = "";
            mm2.status[key] = "empty";
            mm2.meta[key] = {
                source: "auto",
                columnIndex: null
            };

            applyManualMappingChange();

            if (mm2.status[key] !== "auto" || mm2.resolved[key] == null) {
                pulseManualFieldError(key);
                updateManualMappingUI();
            }
        });

        return row;
    }

    function maybeShowSuggestions(key, inputEl) {
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
        setActiveSuggestionList(list);
        setActiveSuggestionMode("typed");
        setActiveSuggestionKey(key);
    }

    function showAllColumnsDropdown(key, inputEl) {
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
        setActiveSuggestionList(list);
        setActiveSuggestionMode("full");
        setActiveSuggestionKey(key);
    }

    function openChooserModalForVariable(key) {
        if (!AppState.dataLoaded) return;

        closeChooserModal();

        const raw = getDatasetRaw();
        const columns = getDatasetColumns();
        if (!raw || !columns.length) return;

        let selectedIndex0 = null;

        const modalEl = document.createElement("div");
        modalEl.className = "settingsChooserModal";
        setChooserModal(modalEl);

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
        modalEl.appendChild(box);
        document.body.appendChild(modalEl);

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

    return {
        buildManualMappingSection
    };
}