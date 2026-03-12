// -------------------------------------------------------------
// settings_controller.js
// Handles title-bar settings menu interactions
// -------------------------------------------------------------
import {
    originalRaw as liveOriginalRaw,
    colNamesOverrideGlobal as liveColNamesOverrideGlobal
} from "./load_data.js";

import { createScaleController } from "./settings_scale.js";
import {
    MANUAL_KEYS,
    createManualMappingController
} from "./settings_manual_mapping.js";
import {
    buildCategory,
    buildRegularItem,
    updateRegularChecks,
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
    originalRaw,
    colNamesOverrideGlobal,
    exportPathOverrideGlobal,

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
        validateManualMappings
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

        validateManualMappings();
        rerunLoad();
        syncAutoFieldsFromDetected();
        validateManualMappings();
        updateManualMappingUI();
        updateTitleBarSettingsError();
    }

    function toggleOption(index) {
        const opt = settingsOptions[index];
        if (!opt) return;

        opt.checked = !opt.checked;
        if (opt.checked) opt.expanded = true;

        updateRegularChecks(menuEl, settingsOptions);
        applySettingChange(opt);
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
        updateTitleBarSettingsError,
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
        updateTitleBarSettingsError();
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
        updateTitleBarSettingsError();

        menuEl = document.createElement("div");
        menuEl.className = "settingsMenu";

        menuEl.appendChild(buildCategory("Variables"));
        menuEl.appendChild(buildManualMappingSection());

        menuEl.appendChild(buildCategory("Display"));
        settingsOptions.forEach((opt, index) => {
            if (opt.label === "Show lifts") {
                menuEl.appendChild(buildRegularItem(opt, index, toggleOption));
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
    updateTitleBarSettingsError();

    return {
        closeMenu
    };
}