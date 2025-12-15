// -------------------------------------------------------------
// title_bar.js
// Handles title bar DOM (filename, prev/next, dropdown)
// -------------------------------------------------------------

export function attachTitleBar({
    titleBarEl,
    AppState
}) {
    let fileDropdown = null;
    let lifecycle = null; // <-- MUTABLE reference

    function setLifecycle(lc) {
        lifecycle = lc;
    }

    function updateTitleBar() {
        titleBarEl.innerHTML = "";

        if (!AppState.dataLoaded) return;

        // ---------------- File mode ----------------
        if (!AppState.fileList || AppState.fileList.length === 0) {
            titleBarEl.textContent = AppState.originalFileName ?? "";
            return;
        }

        // ---------------- Folder mode ----------------
        const prev = document.createElement("button");
        prev.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M15 6l-6 6 6 6"
                      fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        prev.disabled = AppState.fileIndex <= 0;
        prev.onclick = () => lifecycle?.prevFile();

        const next = document.createElement("button");
        next.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M9 6l6 6-6 6"
                      fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        next.disabled =
            AppState.fileIndex >= AppState.fileList.length - 1;
        next.onclick = () => lifecycle?.nextFile();

        const label = document.createElement("div");
        label.style.flex = "1";
        label.style.textAlign = "center";
        label.style.overflow = "hidden";
        label.style.whiteSpace = "nowrap";
        label.style.textOverflow = "ellipsis";
        label.style.cursor = "pointer";
        label.textContent = AppState.originalFileName ?? "";

        label.onclick = e => {
            e.stopPropagation();
            toggleFileDropdown(label);
        };

        titleBarEl.append(prev, label, next);
    }

    function toggleFileDropdown(anchor) {

        if (fileDropdown) {
            fileDropdown.remove();
            fileDropdown = null;
            return;
        }

        if (!AppState.fileList || AppState.fileList.length === 0) return;
        if (!lifecycle) return; // safety

        const r = anchor.getBoundingClientRect();

        fileDropdown = document.createElement("div");
        fileDropdown.className = "fileDropdown";
        fileDropdown.style.left = `${r.left}px`;
        fileDropdown.style.top  = `${r.bottom + 4}px`;

        // Measure longest filename
        const measurer = document.createElement("span");
        measurer.style.visibility = "hidden";
        measurer.style.position = "absolute";
        measurer.style.whiteSpace = "nowrap";
        measurer.style.font = getComputedStyle(anchor).font;
        document.body.appendChild(measurer);

        let maxW = 0;
        for (const fullPath of AppState.fileList) {
            measurer.textContent = fullPath.split(/[/\\]/).pop();
            maxW = Math.max(maxW, measurer.offsetWidth);
        }
        document.body.removeChild(measurer);

        fileDropdown.style.width = `${Math.min(maxW + 24, 480)}px`;

        // Items
        AppState.fileList.forEach((fullPath, idx) => {
            const item = document.createElement("div");
            item.className = "fileDropdownItem";
            item.textContent = fullPath.split(/[/\\]/).pop();

            if (idx === AppState.fileIndex) {
                item.classList.add("active");
            }

            item.addEventListener("click", e => {
                e.stopPropagation();

                fileDropdown.remove();
                fileDropdown = null;

                if (idx === AppState.fileIndex) return;
                lifecycle.loadFileAtIndex(idx); // ✅ now works
            });

            fileDropdown.appendChild(item);
        });

        document.body.appendChild(fileDropdown);

        const onDocMouseDown = e => {
            if (
                fileDropdown &&
                !fileDropdown.contains(e.target) &&
                !anchor.contains(e.target)
            ) {
                fileDropdown.remove();
                fileDropdown = null;
                document.removeEventListener("mousedown", onDocMouseDown, true);
            }
        };

        setTimeout(() => {
            document.addEventListener("mousedown", onDocMouseDown, true);
        }, 0);
    }

    return {
        updateTitleBar,
        setLifecycle
    };
}
