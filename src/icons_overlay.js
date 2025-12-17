// -------------------------------------------------------------
// icons_overlay.js
// Generic SVG overlay manager (app-wide)
// -------------------------------------------------------------

function getOverlay() {
    const el = document.getElementById("svgOverlay");
    if (!el) {
        throw new Error("svgOverlay element not found in DOM");
    }
    return el;
}

function ensureIcon(id, svgPath) {
    let el = document.getElementById(id);
    if (el) {
        // Ensure path is correct if reused
        if (el.tagName === "IMG" && el.getAttribute("src") !== svgPath) {
            el.setAttribute("src", svgPath);
        }
        return el;
    }

    const overlay = getOverlay();

    el = document.createElement("img");
    el.id = id;
    el.setAttribute("src", svgPath);

    el.style.position = "absolute";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    el.style.transform = "translate(-50%, -50%)"; // center on (cx, cy)
    el.style.display = "block";

    overlay.appendChild(el);
    return el;
}

export function placeIcon({
    id,
    svgPath,
    cx,
    cy,
    size,
    opacity = 1,
    visible = true
}) {
    const el = ensureIcon(id, svgPath);

    if (!visible) {
        el.style.display = "none";
        return;
    }

    el.style.display = "block";

    // cx, cy are the intended visual center
    el.style.left = `${cx}px`;
    el.style.top  = `${cy}px`;

    // explicit pixel sizing
    el.style.width  = `${Math.round(size)}px`;
    el.style.height = `${Math.round(size)}px`;

    el.style.opacity = opacity;
}

export function clearOverlay(prefix) {
    const overlay = getOverlay();
    overlay.querySelectorAll(`[id^="${prefix}"]`).forEach(n => n.remove());
}

// -------------------------------------------------------------
// Label overlay helper
// -------------------------------------------------------------
function ensureLabel(id) {
    let el = document.getElementById(id);
    if (el) return el;

    const overlay = getOverlay();

    el = document.createElement("div");
    el.id = id;

    el.style.position = "absolute";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";

    el.style.background = "white";
    el.style.border = "1px solid black";
    el.style.borderRadius = "4px";

    el.style.font = "12px sans-serif";
    el.style.color = "black";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.boxSizing = "border-box";

    overlay.appendChild(el);
    return el;
}

export function placeLabel({
    id,
    x,
    y,
    w,
    h,
    text,
    opacity = 1,
    visible = true
}) {
    const el = ensureLabel(id);

    if (!visible || !text) {
        el.style.display = "none";
        return;
    }

    el.style.display = "flex";

    el.style.left   = `${Math.round(x)}px`;
    el.style.top    = `${Math.round(y)}px`;
    el.style.width  = `${Math.round(w)}px`;
    el.style.height = `${Math.round(h)}px`;

    el.style.opacity = opacity;
    el.textContent   = text;
}
