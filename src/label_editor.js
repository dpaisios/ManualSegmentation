// -------------------------------------------------------------
// label_editor.js
// Manages in-place editing of segment IDs
// -------------------------------------------------------------

let activeSel = null;

export function createLabelEditor({ container, onCommit, onCancel }) {

    let input = null;
    let oldValue = "";

    function ensureInput() {
        if (input) return;

        input = document.createElement("input");
        input.type = "text";

        input.style.position      = "absolute";
        input.style.zIndex        = "2147483647";
        input.style.pointerEvents = "auto";
        input.style.padding       = "2px 4px";
        input.style.border        = "1px solid #333";
        input.style.borderRadius  = "4px";
        input.style.font          = "12px sans-serif";
        input.style.boxSizing     = "border-box";
        input.style.display       = "none";

        // --- lifecycle ---
        input.addEventListener("blur", () => {
            if (activeSel) {
                commit(true);
            }
        });

        input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                commit(true);
            }
            if (e.key === "Escape") {
                e.preventDefault();
                commit(false);
            }
        });

        // --- auto width ---
        input.addEventListener("input", () => {
            const span = document.createElement("span");
            span.style.visibility = "hidden";
            span.style.position = "fixed";
            span.style.whiteSpace = "pre";
            span.style.font = input.style.font;

            span.textContent = input.value || " ";
            document.body.appendChild(span);

            const w = Math.ceil(span.getBoundingClientRect().width) + 10;
            input.style.width = w + "px";

            document.body.removeChild(span);
        });

        container.appendChild(input);
    }

    function start(sel, rect, canvasRect, initialValue) {
        ensureInput();

        activeSel = sel;
        oldValue = initialValue ?? "";

        input.value = oldValue;

        input.style.left   = (canvasRect.left + rect.x) + "px";
        input.style.top    = (canvasRect.top  + rect.y) + "px";
        input.style.width  = rect.w + "px";
        input.style.height = rect.h + "px";
        input.style.display = "block";

        // defer focus to avoid immediate blur
        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    }

    function commit(save) {
        if (!activeSel) return;

        const value = save ? input.value.trim() : oldValue;

        input.style.display = "none";

        if (save) {
            onCommit?.(activeSel, value);
        } else {
            onCancel?.(activeSel);
        }

        activeSel = null;
        oldValue = "";
    }

    return { start };
}

export function isEditingSelection(sel) {
    return sel === activeSel;
}

export function anyEditingSelectionIn(selections) {
    if (!selections || selections.length === 0) return false;
    for (const sel of selections) {
        if (isEditingSelection(sel)) return true;
    }
    return false;
}

export function getEditingSelection(selections) {
    if (!selections || selections.length === 0) return null;
    for (const sel of selections) {
        if (isEditingSelection(sel)) return sel;
    }
    return null;
}
