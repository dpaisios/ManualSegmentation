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

    const tempSelection = timeBarController?.state?.tempSelection ?? null;

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
        visibility.showPenUp()
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
        state.editingSel
    );
}

function redrawSettings() {
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
        sel.lockedID = value !== "";
        if (value !== "") sel.id = value;
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
    setSelections: s => { AppState.selections = s; },
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

// Patch lifecycle into title bar (circular-safe)
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
let resizePending = false;
function resizeCanvases() {
    if (resizePending) return;
    resizePending = true;

    requestAnimationFrame(() => {
        resizePending = false;

        xyCanvas.width = xyCanvas.clientWidth;
        xyCanvas.height = xyCanvas.clientHeight;
        timeCanvas.width = timeCanvas.clientWidth;
        timeCanvas.height = timeCanvas.clientHeight;
        settingsCanvas.width = settingsCanvas.clientWidth;
        settingsCanvas.height = settingsCanvas.clientHeight;

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
resizeCanvases();
renderers.redrawSettings();
titleBarController.updateTitleBar();
