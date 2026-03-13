// -------------------------------------------------------------
// app.js
// -------------------------------------------------------------

import {
    loadData,
    X, Y, T, Tip, TipSeg,
    exportPathOverrideGlobal,
    originalRaw,
    colNamesOverrideGlobal
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
    extractRowsForExport,
    buildExportJSON
} from "./src/export_data.js";

import * as ID from "./src/selection_ids.js";
import { createLabelEditor, isEditingSelection } from "./src/label_editor.js";
import { attachTimeBarController } from "./src/time_bar_controller.js";
import { placeIcon, clearOverlay, placeLabel } from "./src/icons_overlay.js";
import { computeClusterLayout } from "./src/time_bar_primitives.js";

import { createExportSuccessAnimator } from "./src/settings_controller.js";

import { createCommentEditor, isEditingComment } from "./src/comment_editor.js";

// -------------------------------------------------------------
// Canvases
// -------------------------------------------------------------
const xyCanvas   = document.getElementById("xyCanvas");
const xyCtx      = xyCanvas.getContext("2d");

const timeCanvas = document.getElementById("timeCanvas");
const timeCtx    = timeCanvas.getContext("2d");

// -------------------------------------------------------------
// Settings
// -------------------------------------------------------------
let settingsOptions = [
    { label: "Remove edge lifts", checked: false },
    { label: "Remove last stroke", checked: false },
    { label: "Show lifts", checked: true },
    {
        label: "Show velocity minima",
        checked: AppState.display.velocityMinima.enabled,
        expanded: false,
        enabled: AppState.overlays.velocityMinima.available,
        children: [
            {
                label: "XY plot",
                checked: AppState.display.velocityMinima.showXY
            },
            {
                label: "Time bar",
                checked: AppState.display.velocityMinima.showTimeBar
            }
        ]
    },
    {
        label: "Scale multiplier",
        checked: false,
        xText: "1",
        yText: "1",
        xValue: 1,
        yValue: 1,
        error: ""
    }
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

function syncVelocityMinimaSetting() {
    const opt = settingsOptions.find(o => o.label === "Show velocity minima");
    if (!opt) return;

    opt.enabled = !!AppState.overlays?.velocityMinima?.available;
    opt.checked = !!AppState.display?.velocityMinima?.enabled;

    if (Array.isArray(opt.children) && opt.children.length >= 2) {
        opt.children[0].checked = !!AppState.display.velocityMinima.showXY;
        opt.children[1].checked = !!AppState.display.velocityMinima.showTimeBar;
    }
}

syncVelocityMinimaSetting();

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

    const vmOverlay = AppState.overlays.velocityMinima;
    const vmDisplay = AppState.display.velocityMinima;

    const velocityMinimaIdxsXY =
        vmOverlay.available && vmDisplay.enabled && vmDisplay.showXY
            ? vmOverlay.indices
            : [];

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
        hoveredSel,
        velocityMinimaIdxsXY
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

    const vmOverlay = AppState.overlays.velocityMinima;
    const vmDisplay = AppState.display.velocityMinima;

    const velocityMinimaIdxsTimeBar =
        vmOverlay.available && vmDisplay.enabled && vmDisplay.showTimeBar
            ? vmOverlay.indices
            : [];

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
        state.mergePreview,
        velocityMinimaIdxsTimeBar
    );

    clearOverlay("timebar-");
    clearOverlay("timebar-label-");
    clearOverlay("timebar-commenttip-");

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
            id: `timebar-flag-${i}`,
            svgPath: sel.flagged ? "images/flag_active.svg" : "images/flag.svg",
            cx: offsetX + cluster.flag.cx,
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

        placeIcon({
            id: `timebar-comment-${i}`,
            svgPath: (sel.comment != null && String(sel.comment).trim() !== "")
                ? "images/comment_active.svg"
                : "images/comment.svg",
            cx: offsetX + cluster.comment.cx,
            cy: offsetY + cy,
            size,
            opacity: sel.bubbleAlpha
        });

        if (timeBarController?.state?.hoveredCommentTarget === sel && !isEditingComment(sel)) {
            const c = String(sel.comment ?? "").trim();
            if (c) {
                timeCtx.save();
                timeCtx.font = "12px sans-serif";

                const lines = c.split("\n");

                let maxLineW = 0;
                for (const line of lines) {
                    const w = timeCtx.measureText(line.length ? line : " ").width;
                    if (w > maxLineW) maxLineW = w;
                }

                const padX = 10;
                const padY = 6;

                const tipW = Math.min(420, Math.max(20, Math.ceil(maxLineW + padX * 2)));
                const tipH = Math.max(24, lines.length * 16 + padY * 2);

                timeCtx.restore();

                placeLabel({
                    id: `timebar-commenttip-${i}`,
                    x: offsetX + cluster.comment.cx - tipW / 2,
                    y: offsetY + cluster.comment.cy - cluster.comment.r - tipH - 6,
                    w: tipW,
                    h: tipH,
                    text: c,
                    opacity: sel.bubbleAlpha
                });
            }
        }

        if (sel.id != null && sel.id !== "" && !isEditingSelection(sel)) {
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
    // no-op: settings are now in the title-bar menu
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
// Comment editor
// -------------------------------------------------------------
const commentEditor = createCommentEditor({
    container: document.getElementById("appContainer"),
    onCommit: (sel, value) => {
        const v = String(value ?? "").trimEnd();
        const prev = String(sel.comment ?? "");

        if (v !== prev) {
            sel.comment = v;
            AppState.selectionsVersion++;
        }

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
    commentEditor,
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

attachSettingsController({
    titleBarController,
    AppState,
    settingsOptions,
    loadData,
    resetXYSelection: () => xyController.resetSelection(),
    renderers,

    // NEW: allow settings to react to dataset loads
    getCurrentData: () => originalRaw
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
// Title-bar export handler
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
        timeCanvas.clientWidth === 0 || timeCanvas.clientHeight === 0
    ) return;

    xyCanvas.width = xyCanvas.clientWidth;
    xyCanvas.height = xyCanvas.clientHeight;

    timeCanvas.width = timeCanvas.clientWidth;
    timeCanvas.height = timeCanvas.clientHeight;
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
// Animation loop
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
titleBarController.updateTitleBar();
resizeCanvases();