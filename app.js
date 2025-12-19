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
import { computeClusterLayout } from "./src/time_bar_primitives.js";

import { createExportSuccessAnimator } from "./src/settings_controller.js";

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
        XY.drawXYSelectionBox(
            xyCtx,
            box,
            xyCanvas.width,
            xyCanvas.height
        );
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
    clearOverlay("timebar-label-");

    const rect = timeCanvas.getBoundingClientRect();
    const offsetX = rect.left + window.scrollX;
    const offsetY = rect.top  + window.scrollY;

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

const runTitleExportSuccess = createExportSuccessAnimator({
    onUpdate: p => titleBarController.setExportSuccess(p),
    onDone: () => titleBarController.setExportSuccess(0)
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
        const visible = visibility.getVisibleIndices(X.length);
        const transform = XY.computeXYTransform(
            X, Y,
            visible,
            xyCanvas.width,
            xyCanvas.height
        );

        return computeTimeRangesFromXYBox({
            box,
            X, Y, T,
            visibleIndices: visible,
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
// Lifecycle
// -------------------------------------------------------------
const lifecycle = attachLifecycleController({
    AppState,
    loadData,
    settingsOptions,
    setTitle: () => {
        titleBarController.updateTitleBar();
    },
    renderers
});

titleBarController.setLifecycle(lifecycle);


// -------------------------------------------------------------
// Title-bar export handler (guarded)
// -------------------------------------------------------------
let exporting = false;

titleBarController.setExportHandler(async () => {
    if (exporting) return;
    exporting = true;

    try {
        const ok = await exportController.exportData();
        if (ok) runTitleExportSuccess();
    } finally {
        setTimeout(() => { exporting = false; }, 1600);
    }
});


// -------------------------------------------------------------
// Electron wiring
// -------------------------------------------------------------
lifecycle.attachElectronListener();

// -------------------------------------------------------------
// Resize handling
// -------------------------------------------------------------
function applyCanvasSizesNow() {
    if (
        xyCanvas.clientWidth === 0 || xyCanvas.clientHeight === 0 ||
        timeCanvas.clientWidth === 0 || timeCanvas.clientHeight === 0 ||
        settingsCanvas.clientWidth === 0 || settingsCanvas.clientHeight === 0
    ) return;

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
// Animation loop (bubble fade)
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
