// -------------------------------------------------------------
// title_bar.js
// Handles title bar DOM (filename, prev/next, dropdown)
// -------------------------------------------------------------

export function attachTitleBar({
    titleBarEl,
    AppState
}) {
    let fileDropdown = null;
    let lifecycle = null;

    const left  = titleBarEl.querySelector(".title-left");
    const label = titleBarEl.querySelector(".title-label");
    const arrow = titleBarEl.querySelector(".dropdown-arrow");
    const nav   = titleBarEl.querySelector(".title-nav");

    let prevBtn = null;

    // keep a stable reference so we can remove it on close
    let onDocMouseDown = null;

    // ---------------------------------------------------------
    // Folder button (left of dropdown arrow)
    // ---------------------------------------------------------
    const folderBtn = document.createElement("button");
    folderBtn.className = "title-folder-btn";
    folderBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 2-2z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linejoin="round"/>
        </svg>
    `;
    folderBtn.title = "Open file / folder";

    left.insertBefore(folderBtn, arrow);

    // ---------------------------------------------------------
    // Dropdown hit zone (visual + logical)
    // ---------------------------------------------------------
    const hitZone = document.createElement("div");
    hitZone.className = "dropdownHitZone";
    titleBarEl.appendChild(hitZone);

    function setLifecycle(lc) {
        lifecycle = lc;
    }

    function updateTitleBar() {
        if (!AppState.dataLoaded) {
            titleBarEl.style.display = "none";
            return;
        }

        titleBarEl.style.display = "flex";
        label.textContent = AppState.originalFileName ?? "";

        nav.innerHTML = "";
        prevBtn = null;

        const inFolderMode =
            Array.isArray(AppState.fileList) &&
            AppState.fileList.length > 0;

        // Arrow only visible in folder mode
        arrow.style.display = inFolderMode ? "" : "none";

        if (!inFolderMode) {
            hitZone.classList.remove("active");
            closeDropdown();
            return;
        }

        // PREV
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

        // NEXT
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

        nav.append(prev, next);
        prevBtn = prev;

        updateHitZone();
    }

    function updateHitZone() {
        if (!prevBtn) {
            hitZone.classList.remove("active");
            return;
        }

        const barRect   = titleBarEl.getBoundingClientRect();
        const arrowRect = arrow.getBoundingClientRect();
        const prevRect  = prevBtn.getBoundingClientRect();

        const x0 = arrowRect.left - barRect.left;
        const w  = prevRect.left - arrowRect.left;

        if (w <= 0) {
            hitZone.classList.remove("active");
            return;
        }

        hitZone.style.left  = `${x0}px`;
        hitZone.style.width = `${w}px`;
    }

    function isInDropdownZone(clientX) {
        if (!prevBtn || arrow.style.display === "none") return false;

        const arrowRect = arrow.getBoundingClientRect();
        const prevRect  = prevBtn.getBoundingClientRect();

        return (
            clientX >= arrowRect.left &&
            clientX <= prevRect.left
        );
    }

    function closeDropdown() {
        if (!fileDropdown) return;

        fileDropdown.remove();
        fileDropdown = null;
        arrow.classList.remove("open");

        if (onDocMouseDown) {
            document.removeEventListener("mousedown", onDocMouseDown, true);
            onDocMouseDown = null;
        }
    }

    function toggleFileDropdown() {
        if (fileDropdown) {
            closeDropdown();
            return;
        }

        if (!AppState.fileList || !lifecycle) return;

        const labelRect = label.getBoundingClientRect();
        const navRect   = nav.getBoundingClientRect();

        fileDropdown = document.createElement("div");
        fileDropdown.className = "fileDropdown";

        fileDropdown.style.left = `${labelRect.left}px`;
        fileDropdown.style.top  = `${labelRect.bottom + 4}px`;

        const maxWidth =
            Math.max(160, navRect.left - labelRect.left);

        fileDropdown.style.width = `${maxWidth}px`;

        AppState.fileList.forEach((fullPath, idx) => {
            const item = document.createElement("div");
            item.className = "fileDropdownItem";

            const fileName = fullPath.split(/[/\\]/).pop();

            const tracked = AppState.exportTracker?.[fullPath] ?? null;
            const count = (tracked && Number.isFinite(tracked.exportCount))
                ? tracked.exportCount
                : null;

            // exported styling
            if (count != null) {
                item.classList.add("exported");
                item.title = `Exported ${count} segment${count === 1 ? "" : "s"}`;
            }

            const countEl = document.createElement("span");
            countEl.className = "fileDropdownCount";
            countEl.textContent = (count == null) ? "—" : String(count);

            const nameEl = document.createElement("span");
            nameEl.className = "fileDropdownName";
            nameEl.textContent = fileName;

            item.append(countEl, nameEl);

            if (idx === AppState.fileIndex) {
                item.classList.add("active");
            }

            item.onclick = e => {
                e.stopPropagation();
                closeDropdown();
                if (idx !== AppState.fileIndex) {
                    lifecycle.loadFileAtIndex(idx);
                }
            };

            fileDropdown.appendChild(item);
        });

        document.body.appendChild(fileDropdown);
        arrow.classList.add("open");

        // IMPORTANT: only "ignore" the dropdown zone when the click is INSIDE the title bar
        onDocMouseDown = e => {
            if (!fileDropdown) return;

            const clickInTitleBar = titleBarEl.contains(e.target);

            if (clickInTitleBar && isInDropdownZone(e.clientX)) {
                // let the title bar handler toggle; do not auto-close here
                return;
            }

            if (!fileDropdown.contains(e.target)) {
                closeDropdown();
            }
        };

        // attach in capture so we win over other handlers
        setTimeout(() => {
            document.addEventListener("mousedown", onDocMouseDown, true);
        }, 0);
    }

    // ---------------------------------------------------------
    // Folder button behavior
    // ---------------------------------------------------------
    folderBtn.addEventListener("mousedown", async e => {
        e.preventDefault();
        e.stopPropagation();

        // OPEN FILE MODE
        if (!AppState.fileList) {
            const res = await window.electronAPI.openFileDialog();
            if (res.canceled) return;

            window.electronAPI.emitDataFile({
                folder: res.filePaths[0],
                params: {}
            });
            return;
        }

        // OPEN FOLDER MODE
        const res = await window.electronAPI.openFolderDialog();
        if (res.canceled) return;

        window.electronAPI.emitDataFile({
            folder: res.filePaths[0],
            params: { mode: "folder-session" }
        });
    });

    // ---------------------------------------------------------
    // Hover + click logic (arrow INCLUDED)
    // ---------------------------------------------------------
    titleBarEl.addEventListener("mousemove", e => {
        if (isInDropdownZone(e.clientX)) {
            updateHitZone();
            hitZone.classList.add("active");
        } else {
            hitZone.classList.remove("active");
        }
    });

    titleBarEl.addEventListener("mouseleave", () => {
        hitZone.classList.remove("active");
    });

    titleBarEl.addEventListener("mousedown", e => {
        if (!AppState.fileList) return;

        // Clicking anywhere else on the title bar closes the dropdown
        if (fileDropdown && !isInDropdownZone(e.clientX)) {
            closeDropdown();
            return;
        }

        if (isInDropdownZone(e.clientX)) {
            e.preventDefault();
            e.stopPropagation();
            toggleFileDropdown();
        }
    });

    return {
        updateTitleBar,
        setLifecycle
    };
}
