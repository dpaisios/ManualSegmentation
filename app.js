// -------------------------------------------------------------
// app.js
// -------------------------------------------------------------

import {
    loadData,
    X, Y, T, Tip, TipSeg,
    exportPathOverrideGlobal
} from "./src/load_data.js";

import { AppState } from "./src/app_state.js";
import { createRenderers } from "./src/renderers.js";
import { attachXYController } from "./src/xy_controller.js";
import { attachSettingsController } from "./src/settings_controller.js";
import { attachLifecycleController } from "./src/lifecycle_controller.js";
import { createExportController } from "./src/export_controller.js";
import { attachTitleBar } from "./src/title_bar.js";

import { createVisibilityPolicy } from "./src/visibility.js";
import { computeTimeRangesFromXYBox } from "./src/geometry.js";

import * as XY from "./src/xy_plot.js";
import * as TB from "./src/time_bar.js";

import {
    drawSettings,
    hitTestSettings
} from "./src/settings_ui.js";

import {
    extractRowsForExport,
    buildExportJSON
} from "./src/export_data.js";

import * as ID from "./src/selection_ids.js";
import { createLabelEditor } from "./src/label_editor.js";
import { attachTimeBarController } from "./src/time_bar_controller.js";
import { placeIcon, clearOverlay, placeLabel } from "./src/icons_overlay.js";
import {
    computeClusterLayout
} from "./src/time_bar_primitives.js";

// -------------------------------------------------------------
// Export options
// -------------------------------------------------------------
function attachExportOptionsUI() {
    const rRelative = document.getElementById("exportModeRelative");
    const rFixed    = document.getElementById("exportModeFixed");
    const rManual   = document.getElementById("exportModeManual");

    const chooseBtn = document.getElementById("chooseExportFolderBtn");
    const pathEl    = document.getElementById("exportFolderPath");

    if (!rRelative || !rFixed || !rManual || !chooseBtn || !pathEl) return;

    function syncUIFromState() {
        const cfg = AppState.exportConfig;

        rRelative.checked = cfg.mode === "relative";
        rFixed.checked    = cfg.mode === "fixed";
        rManual.checked   = cfg.mode === "manual";

        chooseBtn.disabled = cfg.mode !== "fixed";
        pathEl.textContent = cfg.fixedPath ? cfg.fixedPath : "(none)";
        pathEl.title = cfg.fixedPath ? cfg.fixedPath : "";
    }

    rRelative.addEventListener("change", () => {
        if (!rRelative.checked) return;
        AppState.exportConfig.mode = "relative";
        syncUIFromState();
    });

    rManual.addEventListener("change", () => {
        if (!rManual.checked) return;
        AppState.exportConfig.mode = "manual";
        syncUIFromState();
    });

    rFixed.addEventListener("change", () => {
        if (!rFixed.checked) return;
        AppState.exportConfig.mode = "fixed";
        // do not force user to pick immediately
        syncUIFromState();
    });

    chooseBtn.addEventListener("click", async () => {
        const res = await window.electronAPI.openFolderDialog();
        if (res.canceled) return;

        const folder = res.filePaths?.[0];
        if (!folder) return;

        AppState.exportConfig.fixedPath = folder;
        AppState.exportConfig.mode = "fixed";
        syncUIFromState();
    });

    syncUIFromState();
}

// call once during init (near the bottom before showing overlay is fine)
attachExportOptionsUI();

// -------------------------------------------------------------
// Canvases
// -------------------------------------------------------------
const xyCanvas       = document.getElementById("xyCanvas");
const xyCtx          = xyCanvas.getContext("2d");
const timeCanvas     = document.getElementById("timeCanvas");
const timeCtx        = timeCanvas.getContext("2d");
const settingsCanvas = document.getElementById("settingsCanvas");
const settingsCtx    = settingsCanvas.getContext("2d");

// -------------------------------------------------------------
// Settings
// -------------------------------------------------------------
let settingsOptions = [
    { label: "Remove edge lifts", checked: false },
    { label: "Remove last stroke", checked: false },
    { label: "Show lifts",        checked: true }
];

// -------------------------------------------------------------
// Visibility policy
// -------------------------------------------------------------
const visibility = createVisibilityPolicy({
    Tip,
    settingsOptions
});

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
function smoothApproach(a, b, s = 0.2) {
    return a + (b - a) * s;
}

// -------------------------------------------------------------
// Title bar
// -------------------------------------------------------------
const titleBarController = attachTitleBar({
    titleBarEl: document.getElementById("titleBar"),
    AppState
});

// -------------------------------------------------------------
// Redraw implementations
// -------------------------------------------------------------
function redrawXY() {
    if (!AppState.dataLoaded) return;

    const visible = visibility.getVisibleIndices(X.length);

    const transform = XY.computeXYTransform(
        X, Y,
        visible,
        xyCanvas.width,
        xyCanvas.height
    );

    const tempSelection =
        timeBarController?.state?.tempSelection ?? null;

    const hoveredSel =
        timeBarController?.state?.deleteTarget ?? null;

    XY.drawXYFromSelections(
        xyCtx,
        X, Y, Tip, TipSeg,
        T,
        AppState.selections,
        tempSelection,
        visible,
        transform,
        xyCanvas.width,
        xyCanvas.height,
        visibility.showPenUp(),
        timeBarController.state.split,
        hoveredSel
    );

    const box = xyController?.getSelectBox?.() ?? null;
    if (box) {
        XY.drawXYSelectionBox(xyCtx, box, xyCanvas.width, xyCanvas.height);
    }
}

function redrawTimeBar(state) {
    if (!AppState.dataLoaded) return;

    TB.drawTimeBar(
        timeCtx,
        T, Tip,
        AppState.selections,
        state.tempSelection,
        state.hoveredHandle,
        state.deleteTarget,
        timeCanvas.width,
        timeCanvas.height,
        state.split,
        state.mergePreview
    );

    clearOverlay("timebar-");

    const timeCanvasRect = timeCanvas.getBoundingClientRect();
    const offsetX = timeCanvasRect.left + window.scrollX;
    const offsetY = timeCanvasRect.top  + window.scrollY;

    clearOverlay("timebar-label-");

    for (let i = 0; i < AppState.selections.length; i++) {
        const sel = AppState.selections[i];
        if (sel.bubbleAlpha <= 0.01) continue;

        const cluster = computeClusterLayout(
            timeCtx,
            sel,
            T,
            timeCanvas.width,
            timeCanvas.height
        );

        const size = cluster.label.h;
        const cy   = cluster.anchorY;

        placeIcon({
            id: `timebar-split-${i}`,
            svgPath: "images/splitbubble.svg",
            cx: offsetX + cluster.split.cx,
            cy: offsetY + cy,
            size,
            opacity: sel.bubbleAlpha
        });

        placeIcon({
            id: `timebar-delete-${i}`,
            svgPath: "images/deletebubble.svg",
            cx: offsetX + cluster.delete.cx,
            cy: offsetY + cy,
            size,
            opacity: sel.bubbleAlpha
        });

        if (sel.id != null && sel.id !== "") {
            placeLabel({
                id: `timebar-label-${i}`,
                x: offsetX + cluster.label.x,
                y: offsetY + cluster.label.y,
                w: cluster.label.w,
                h: cluster.label.h,
                text: String(sel.id),
                opacity: sel.bubbleAlpha
            });
        }
    }
}

function redrawSettings() {
    // 🔒 Guard: settingsController may not exist during early init
    if (!settingsController) return;

    const layout = drawSettings(
        settingsCtx,
        settingsCanvas.width,
        settingsCanvas.height,
        settingsOptions
    );
    settingsController.setLayout(layout);
}

// -------------------------------------------------------------
// Render orchestration
// -------------------------------------------------------------
const renderers = createRenderers({
    redrawXY,
    redrawTimeBar: () => redrawTimeBar(timeBarController.state),
    redrawSettings
});

// -------------------------------------------------------------
// Export controller
// -------------------------------------------------------------
const exportController = createExportController({
    AppState,
    extractRowsForExport,
    buildExportJSON
});

// -------------------------------------------------------------
// Label editor
// -------------------------------------------------------------
const labelEditor = createLabelEditor({
    container: document.getElementById("appContainer"),
    onCommit: (sel, value) => {
        const prev = String(sel.id ?? "");

        if (value !== "" && value !== prev) {
            sel.id = value;
            sel.lockedID = true;
            AppState.selectionsVersion++;
        }

        ID.recomputeAutoIDs(AppState.selections);
        renderers.redrawTimeBar();
    },
    onCancel: () => renderers.redrawTimeBar()
});

// -------------------------------------------------------------
// Controllers
// -------------------------------------------------------------
const timeBarController = attachTimeBarController({
    canvas: timeCanvas,
    ctx: timeCtx,
    getSelections: () => AppState.selections,
    setSelections: s => {
        AppState.selections = s;
        AppState.selectionsVersion++;
    },
    T,
    Tip,
    labelEditor,
    redrawTimeBar: () => renderers.redrawTimeBar(),
    redrawXY: () => renderers.redrawXY()
});

const xyController = attachXYController({
    canvas: xyCanvas,
    AppState,
    renderers,

    computeTimeRangesFromXYBox: box => {
        const visibleIndices = visibility.getVisibleIndices(X.length);

        const transform = XY.computeXYTransform(
            X, Y,
            visibleIndices,
            xyCanvas.width,
            xyCanvas.height
        );

        return computeTimeRangesFromXYBox({
            box,
            X, Y, T,
            visibleIndices,
            transform,
            canvasHeight: xyCanvas.height
        });
    }
});

const settingsController = attachSettingsController({
    canvas: settingsCanvas,
    AppState,
    settingsOptions,
    hitTestSettings,
    loadData,
    exportPathOverrideGlobal,
    resetXYSelection: () => xyController.resetSelection(),
    renderers,
    exportData: exportController.exportData
});

// -------------------------------------------------------------
// Overlay helpers
// -------------------------------------------------------------
function showOverlay() {
    document.getElementById("fileOverlay").classList.remove("hidden");
}
function hideOverlay() {
    document.getElementById("fileOverlay").classList.add("hidden");
}

// -------------------------------------------------------------
// Lifecycle
// -------------------------------------------------------------
const lifecycle = attachLifecycleController({
    AppState,
    loadData,
    settingsOptions,
    showOverlay,
    hideOverlay,
    setTitle: txt => {
        AppState.originalFileName = txt;
        titleBarController.updateTitleBar();
    },
    renderers
});

titleBarController.setLifecycle(lifecycle);
lifecycle.attachElectronListener();

lifecycle.attachManualOpen(
    document.getElementById("openFileBtn"),
    exportPathOverrideGlobal
);

// -------------------------------------------------------------
// Open Folder button
// -------------------------------------------------------------
const openFolderBtn = document.getElementById("openFolderBtn");

if (openFolderBtn) {
    openFolderBtn.addEventListener("click", async () => {
        const res = await window.electronAPI.openFolderDialog();
        if (res.canceled) return;

        window.electronAPI.emitDataFile({
            folder: res.filePaths[0],
            params: { mode: "folder-session" }
        });
    });
}

// -------------------------------------------------------------
// Resize
// -------------------------------------------------------------
function applyCanvasSizesNow() {
    if (xyCanvas.clientWidth === 0 || xyCanvas.clientHeight === 0) return;
    if (timeCanvas.clientWidth === 0 || timeCanvas.clientHeight === 0) return;
    if (settingsCanvas.clientWidth === 0 || settingsCanvas.clientHeight === 0) return;

    xyCanvas.width = xyCanvas.clientWidth;
    xyCanvas.height = xyCanvas.clientHeight;

    timeCanvas.width = timeCanvas.clientWidth;
    timeCanvas.height = timeCanvas.clientHeight;

    settingsCanvas.width = settingsCanvas.clientWidth;
    settingsCanvas.height = settingsCanvas.clientHeight;
}

let resizePending = false;
function resizeCanvases() {
    if (resizePending) return;
    resizePending = true;

    requestAnimationFrame(() => {
        resizePending = false;

        applyCanvasSizesNow();

        AppState.dataLoaded
            ? renderers.redrawAll()
            : renderers.redrawSettings();

        titleBarController.updateTitleBar();
    });
}
window.addEventListener("resize", resizeCanvases);

// -------------------------------------------------------------
// Animation
// -------------------------------------------------------------
function animate() {
    let need = false;

    for (let sel of AppState.selections) {
        const target =
            (timeBarController.state.deleteTarget === sel ? 1 : 0);

        if (Math.abs(sel.bubbleAlpha - target) > 0.01) {
            sel.bubbleAlpha = smoothApproach(sel.bubbleAlpha, target);
            need = true;
        }
    }

    if (need) renderers.redrawTimeBar();
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// -------------------------------------------------------------
// Init
// -------------------------------------------------------------
applyCanvasSizesNow();
renderers.redrawSettings();
titleBarController.updateTitleBar();
resizeCanvases();
