// -------------------------------------------------------------
// settings_controller.js
// Handles title-bar settings menu interactions
// -------------------------------------------------------------
import {
    originalRaw as liveOriginalRaw,
    colNamesOverrideGlobal as liveColNamesOverrideGlobal,
    exportPathOverrideGlobal as liveExportPathOverrideGlobal
} from "./load_data.js";

import { createScaleController } from "./settings_scale.js";
import {
    MANUAL_KEYS,
    createManualMappingController
} from "./settings_manual_mapping.js";
import {
    buildCategory,
    buildRegularItem,
    buildCheckboxGroupItem,
    updateRegularChecks,
    updateCheckboxGroupItems,
    updateManualMappingUI as updateManualMappingUIImpl,
    pulseManualFieldError as pulseManualFieldErrorImpl,
    createManualMappingMenuUI
} from "./settings_menu_ui.js";

export function createExportSuccessAnimator({
    onUpdate,
    onDone
}) {
    const FADE_IN = 150;
    const HOLD = 900;
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
    resetXYSelection,
    renderers
}) {
    let menuEl = null;
    let docMouseDown = null;
    let chooserModalEl = null;
    let activeSuggestionList = null;
    let activeSuggestionMode = null; // null | "typed" | "full"
    let activeSuggestionKey = null;

    const manualMappingController = createManualMappingController({
        AppState,
        loadDataStateRef: () => ({
            originalRaw: liveOriginalRaw,
            colNamesOverrideGlobal: liveColNamesOverrideGlobal
        })
    });

    const {
        ensureManualMappingState,
        getManualMapping,
        syncManualMappingPreviewFromDetected,
        primeAutoFieldsOnEnable,
        syncAutoFieldsFromDetected,
        validateManualMappings,
        reconcileManualMappingsForDataset
    } = manualMappingController;

    ensureManualMappingState();

    function getButtonEl() {
        return titleBarController.getSettingsButtonElement();
    }

    function updateManualMappingUI() {
        updateManualMappingUIImpl({
            menuEl,
            getManualMapping,
            MANUAL_KEYS,
            AppState
        });
    }

    function pulseManualFieldError(key) {
        pulseManualFieldErrorImpl(menuEl, key);
    }

    function updateTitleBarIssues() {
        if (!AppState.dataLoaded) {
            titleBarController.setTitleIssues([]);
            return;
        }

        const issues = [];

        const mm = getManualMapping();

        // -------------------------------------------------
        // Critical variable presence (auto OR manual)
        // -------------------------------------------------
        const tipSourceOpt = settingsOptions?.find(o => o.label === "Tip source");

        let tipSource = "P";
        if (tipSourceOpt?.children) {
            const zOpt = tipSourceOpt.children.find(c => c.label === "Z");
            if (zOpt?.checked) tipSource = "Z";
        }

        const critical = (tipSource === "Z")
            ? ["X", "Y", "Z", "t"]
            : ["X", "Y", "t", "P"];

        const missing = [];

        for (const key of critical) {
            const idx = AppState.detectedCols?.[key];

            if (!Number.isInteger(idx) || idx < 0) {
                missing.push(key);
            }
        }

        if (missing.length) {
            issues.push({
                level: "error",
                message:
                    "Missing critical variable mappings: " +
                    missing.join(", ")
            });
        }

        // -------------------------------------------------
        // Duplicate timestamp warning
        // -------------------------------------------------
        if (AppState.dataQuality?.hasDuplicateTimestamps) {
            issues.push({
                level: "warning",
                message:
                    "Duplicate time stamps detected in the dataset"
            });
        }

        // -------------------------------------------------
        // Push to title bar
        // -------------------------------------------------
        titleBarController.setTitleIssues(issues);
    }

    function syncVelocityMinimaSetting() {
        const opt = settingsOptions.find(o => o.label === "Show velocity minima");
        if (!opt) return;

        const available = !!AppState.overlays?.velocityMinima?.available;
        const display = AppState.display?.velocityMinima;

        opt.enabled = available;
        opt.checked = !!display?.enabled;

        if (!available) {
            opt.expanded = false;
        }

        if (Array.isArray(opt.children) && opt.children.length >= 2) {
            opt.children[0].checked = !!display?.showXY;
            opt.children[1].checked = !!display?.showTimeBar;
        }
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
            liveOriginalRaw,
            liveColNamesOverrideGlobal,
            liveExportPathOverrideGlobal,
            settingsOptions
        );

        resetXYSelection();
        renderers.requestFull();
    }

    function applySettingChange(opt) {
        if (
            opt.label === "Remove edge lifts" ||
            opt.label === "Remove last stroke" ||
            opt.label === "Scale multiplier" ||
            opt.label === "Tip source"
        ) {
            rerunLoad();
            return;
        }

        if (
            opt.label === "Show lifts" ||
            opt.label === "Show velocity minima"
        ) {
            resetXYSelection();
            renderers.requestFull();
        }
    }

    function applyManualMappingChange() {
        ensureManualMappingState();

        validateManualMappings();
        rerunLoad();
        syncAutoFieldsFromDetected();
        validateManualMappings();
        syncVelocityMinimaSetting();
        updateManualMappingUI();
        updateRegularChecks(menuEl, settingsOptions);
        updateCheckboxGroupItems(menuEl, settingsOptions);
        updateTitleBarIssues();
    }

    function toggleOption(index) {
        const opt = settingsOptions[index];
        if (!opt) return;
        if (opt.enabled === false) return;

        if (opt.label === "Tip source") {
            opt.expanded = !opt.expanded;
            updateRegularChecks(menuEl, settingsOptions);
            updateCheckboxGroupItems(menuEl, settingsOptions);
            return;
        }

        opt.checked = !opt.checked;

        if (opt.label === "Show velocity minima") {
            AppState.display.velocityMinima.enabled = !!opt.checked;
            if (opt.checked) opt.expanded = true;

            updateRegularChecks(menuEl, settingsOptions);
            updateCheckboxGroupItems(menuEl, settingsOptions);
            applySettingChange(opt);
            return;
        }

        if (opt.checked) opt.expanded = true;

        updateRegularChecks(menuEl, settingsOptions);
        updateCheckboxGroupItems(menuEl, settingsOptions);
        applySettingChange(opt);
    }

    function toggleChildOption(index, childIndex) {
        const opt = settingsOptions[index];
        if (!opt || opt.enabled === false) return;

        const child = opt.children?.[childIndex];
        if (!child) return;

        if (opt.label === "Tip source") {
            if (!Array.isArray(opt.children) || opt.children.length < 2) return;

            const currentIndex = opt.children.findIndex(c => c.checked);
            if (currentIndex === childIndex) {
                return;
            }

            opt.children.forEach((c, i) => {
                c.checked = (i === childIndex);
            });

            updateCheckboxGroupItems(menuEl, settingsOptions);
            applySettingChange(opt);
            return;
        }

        child.checked = !child.checked;

        if (opt.label === "Show velocity minima") {
            if (childIndex === 0) {
                AppState.display.velocityMinima.showXY = !!child.checked;
            } else if (childIndex === 1) {
                AppState.display.velocityMinima.showTimeBar = !!child.checked;
            }

            updateCheckboxGroupItems(menuEl, settingsOptions);
            resetXYSelection();
            renderers.requestFull();
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

    const manualMenuUI = createManualMappingMenuUI({
        AppState,
        MANUAL_KEYS,
        manualMappingController,

        setChooserModal: (v) => { chooserModalEl = v; },

        activeSuggestionListRef: () => activeSuggestionList,
        setActiveSuggestionList: (v) => { activeSuggestionList = v; },
        activeSuggestionModeRef: () => activeSuggestionMode,
        setActiveSuggestionMode: (v) => { activeSuggestionMode = v; },
        activeSuggestionKeyRef: () => activeSuggestionKey,
        setActiveSuggestionKey: (v) => { activeSuggestionKey = v; },

        updateManualMappingUI,
        updateTitleBarIssues,
        pulseManualFieldError,

        applyColumnSelection,
        applyManualMappingChange,
        closeSuggestionList,
        closeChooserModal
    });

    const scaleController = createScaleController({
        menuRef: () => menuEl,
        settingsOptions,
        applySettingChange,
        closeSuggestionList
    });

    const { buildManualMappingSection } = manualMenuUI;

    function closeMenu() {
        if (!menuEl) return;

        closeSuggestionList();
        closeChooserModal();

        const mm = getManualMapping();

        if (!mm.enabled) {
            mm.expanded = false;
        }

        menuEl.remove();
        menuEl = null;
        updateTitleBarIssues();
        titleBarController.setSettingsMenuOpen(false);

        if (docMouseDown) {
            document.removeEventListener("mousedown", docMouseDown, true);
            docMouseDown = null;
        }
    }

    function openMenu() {
        if (menuEl) return;

        syncManualMappingPreviewFromDetected();
        validateManualMappings();
        updateTitleBarIssues();
        syncVelocityMinimaSetting();

        menuEl = document.createElement("div");
        menuEl.className = "settingsMenu";

        menuEl.appendChild(buildCategory("Variables"));
        menuEl.appendChild(buildManualMappingSection());
        settingsOptions.forEach((opt, index) => {
            if (opt.label === "Tip source") {
                menuEl.appendChild(
                    buildCheckboxGroupItem(opt, index, toggleOption, toggleChildOption)
                );
            }
        });

        menuEl.appendChild(buildCategory("Display"));
        settingsOptions.forEach((opt, index) => {
            if (opt.label === "Show lifts") {
                menuEl.appendChild(buildRegularItem(opt, index, toggleOption));
            } else if (opt.label === "Show velocity minima") {
                menuEl.appendChild(
                    buildCheckboxGroupItem(opt, index, toggleOption, toggleChildOption)
                );
            }
        });

        menuEl.appendChild(buildCategory("Filters"));
        settingsOptions.forEach((opt, index) => {
            if (
                opt.label === "Remove edge lifts" ||
                opt.label === "Remove last stroke"
            ) {
                menuEl.appendChild(buildRegularItem(opt, index, toggleOption));
            }
        });

        menuEl.appendChild(buildCategory("Transforms"));
        settingsOptions.forEach((opt) => {
            if (opt.label === "Scale multiplier") {
                menuEl.appendChild(scaleController.buildScaleSection(opt));
            }
        });

        document.body.appendChild(menuEl);
        positionMenu();
        scaleController.updateScaleUI();
        updateManualMappingUI();
        updateRegularChecks(menuEl, settingsOptions);
        updateCheckboxGroupItems(menuEl, settingsOptions);
        titleBarController.setSettingsMenuOpen(true);

        docMouseDown = e => {
            const btn = getButtonEl();
            if (!menuEl) return;

            const clickInsideMenu = menuEl.contains(e.target);
            const clickOnButton = btn?.contains?.(e.target);
            const clickInSuggestions = activeSuggestionList?.contains?.(e.target);
            const clickInChooser = chooserModalEl?.contains?.(e.target);
            const clickOnFieldArrow = e.target?.closest?.(".settingsManualFieldArrow");

            if (clickInChooser) return;
            if (clickInSuggestions) return;
            if (clickOnFieldArrow) return;

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
    syncVelocityMinimaSetting();
    updateTitleBarIssues();
    
    return {
        closeMenu,

        reconcileManualMappingForDataset({ rawRows, colNamesOverride = null }) {
            ensureManualMappingState();
            reconcileManualMappingsForDataset(rawRows, colNamesOverride);
        },

        refreshTitleBarIssues() {
            updateTitleBarIssues();
        },

        refreshSettingsState() {
            syncVelocityMinimaSetting();

            if (menuEl) {
                updateManualMappingUI();
                updateRegularChecks(menuEl, settingsOptions);
                updateCheckboxGroupItems(menuEl, settingsOptions);
            }

            updateTitleBarIssues();
        }
    };
}