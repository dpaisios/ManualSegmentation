// -------------------------------------------------------------
// comment_editor.js
// In-place editing of selection comments (multiline textarea)
// -------------------------------------------------------------

let activeSel = null;

export function createCommentEditor({ container, onCommit, onCancel }) {
    let wrap = null;      // absolute positioned wrapper
    let ta = null;        // textarea
    let ghost = null;     // placeholder ghost span
    let oldValue = "";

    function ensureUI() {
        if (wrap) return;

        wrap = document.createElement("div");
        wrap.style.position = "absolute";
        wrap.style.zIndex = "2147483647";
        wrap.style.pointerEvents = "auto";
        wrap.style.display = "none";

        // base lift (bubble radius) will be provided by start()
        wrap.__baseLift = 0;

        // textarea
        ta = document.createElement("textarea");
        ta.spellcheck = false;
        ta.rows = 1;

        ta.style.resize = "none";
        ta.style.overflow = "hidden";
        ta.style.padding = "2px 6px";
        ta.style.border = "1px solid #333";
        ta.style.borderRadius = "4px";
        ta.style.font = "12px sans-serif";
        ta.style.boxSizing = "border-box";
        ta.style.outline = "none";
        ta.style.whiteSpace = "pre-wrap";

        // ghost placeholder (non-selectable)
        ghost = document.createElement("span");
        ghost.textContent = "Enter your comment";
        ghost.style.position = "absolute";
        ghost.style.left = "7px";
        ghost.style.top = "3px";
        ghost.style.font = ta.style.font;
        ghost.style.color = "rgba(0,0,0,0.45)";
        ghost.style.pointerEvents = "none";
        ghost.style.userSelect = "none";
        ghost.style.whiteSpace = "pre";

        wrap.appendChild(ta);
        wrap.appendChild(ghost);
        container.appendChild(wrap);

        function refreshGhost() {
            ghost.style.display = (ta.value.length === 0) ? "block" : "none";
        }

        function measureText(text) {
            const span = document.createElement("span");
            span.style.visibility = "hidden";
            span.style.position = "fixed";
            span.style.whiteSpace = "pre";
            span.style.font = ta.style.font;
            span.textContent = text;
            document.body.appendChild(span);
            const w = Math.ceil(span.getBoundingClientRect().width);
            document.body.removeChild(span);
            return w;
        }

        function autoSize() {
            // width: max(placeholder, longest line)
            const placeholderW = measureText("Enter your comment");
            const lines = (ta.value || "").split("\n");
            const longest = lines.reduce(
                (m, s) => Math.max(m, measureText((s && s.length) ? s : " ")),
                0
            );

            const pad = 16; // padding + border slack
            const w = Math.max(placeholderW, longest) + pad;
            ta.style.width = `${w}px`;

            // height: based on scrollHeight
            ta.style.height = "1px";
            ta.style.height = `${ta.scrollHeight}px`;
        }

        function shiftUp() {
            const gap = 6;
            const base = wrap.__baseLift ?? 0;

            // Keep the editor’s bottom edge at a fixed height above the bubble.
            // The textarea itself grows upward because wrap is translated -100% in Y.
            wrap.style.marginTop = `${-(base + gap)}px`;
        }

        function commit(save) {
            if (!activeSel) return;

            const value = save ? ta.value : oldValue;

            wrap.style.display = "none";

            if (save) onCommit?.(activeSel, value);
            else onCancel?.(activeSel);

            activeSel = null;
            oldValue = "";
        }

        ta.addEventListener("blur", () => {
            if (activeSel) commit(true);
        });

        // Enter => commit, Shift+Enter => newline, Escape => cancel
        ta.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit(true);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                commit(false);
                return;
            }
        });

        // single input handler (no listener leak)
        ta.addEventListener("input", () => {
            refreshGhost();
            autoSize();
            shiftUp();
        });

        wrap.__commit = commit;
        wrap.__autoSize = autoSize;
        wrap.__refreshGhost = refreshGhost;
        wrap.__shiftUp = shiftUp;
    }

    function start(sel, anchorRect, canvasRect, initialValue) {
        ensureUI();

        activeSel = sel;
        oldValue = initialValue ?? "";

        ta.value = oldValue;

        const containerRect = container.getBoundingClientRect();

        // anchor is bubble center in canvas coords
        const left = (canvasRect.left - containerRect.left) + anchorRect.x;
        const top  = (canvasRect.top  - containerRect.top)  + anchorRect.y;

        wrap.style.left = `${left}px`;
        wrap.style.top  = `${top}px`;
        wrap.style.display = "block";

        // place ABOVE the bubble (and centered)
        wrap.style.transform = "translate(-50%, -100%)";

        // NEW: bubble radius lift so editor sits in the same band as hover tooltip
        // anchorRect from getClusterCommentRect() is {x: cx, y: cy, w: 2r, h: 2r}
        wrap.__baseLift = (anchorRect && typeof anchorRect.h === "number")
            ? (anchorRect.h / 2)
            : 10;

        wrap.__refreshGhost();
        wrap.__autoSize();
        wrap.__shiftUp?.();

        setTimeout(() => {
            ta.focus();
            ta.selectionStart = ta.value.length;
            ta.selectionEnd = ta.value.length;
        }, 0);
    }

    function toggleCommitIfEditingSame(sel) {
        if (activeSel === sel && wrap && wrap.style.display !== "none") {
            wrap.__commit?.(true);
            return true;
        }
        return false;
    }

    return { start, toggleCommitIfEditingSame };
}

export function isEditingComment(sel) {
    return sel === activeSel;
}

export function anyEditingCommentIn(selections) {
    if (!selections || selections.length === 0) return false;
    for (const sel of selections) if (isEditingComment(sel)) return true;
    return false;
}

export function getEditingCommentSelection(selections) {
    if (!selections || selections.length === 0) return null;
    for (const sel of selections) if (isEditingComment(sel)) return sel;
    return null;
}
