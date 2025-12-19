// -------------------------------------------------------------
// title_bar.js
// Title bar controller:
// - file / folder buttons
// - filename display
// - folder dropdown + navigation
// -------------------------------------------------------------

export function attachTitleBar({
    titleBarEl,
    AppState
}) {
    // ---------------------------------------------------------
    // Internal state
    // ---------------------------------------------------------
    let fileDropdown = null;
    let lifecycle = null;
    let prevBtn = null;
    let onDocMouseDown = null;

    // ---------------------------------------------------------
    // Static DOM references
    // ---------------------------------------------------------
    const left  = titleBarEl.querySelector(".title-left");
    const label = titleBarEl.querySelector(".title-label");
    const arrow = titleBarEl.querySelector(".dropdown-arrow");
    const nav   = titleBarEl.querySelector(".title-nav");

    // =========================================================
    // FILE BUTTON (file-only)
    // =========================================================
    const fileBtn = document.createElement("button");
    fileBtn.className = "title-file-btn";
    fileBtn.title = "Open file";

    const fileIcon = document.createElement("span");
    fileIcon.className = "title-icon title-file-icon";
    fileBtn.appendChild(fileIcon);

    fileBtn.dataset.state = "idle";

    fileBtn.addEventListener("mouseenter", () => {
        fileBtn.dataset.state = "hover";
    });

    fileBtn.addEventListener("mouseleave", () => {
        fileBtn.dataset.state = "idle";
    });

    fileBtn.addEventListener("mousedown", async e => {
        e.preventDefault();
        e.stopPropagation();

        const res = await window.electronAPI.openFileDialog();
        if (res.canceled || !res.filePaths?.length) return;

        window.electronAPI.emitDataFile({
            folder: res.filePaths[0],
            params: { reset: true }
        });
    });

    // =========================================================
    // FOLDER BUTTON (folder-only)
    // =========================================================
    const folderBtn = document.createElement("button");
    folderBtn.className = "title-folder-btn";
    folderBtn.title = "Open folder";

    const folderIcon = document.createElement("span");
    folderIcon.className = "title-icon title-folder-icon";
    folderBtn.appendChild(folderIcon);

    folderBtn.dataset.state = "folder-idle";

    folderBtn.addEventListener("mouseenter", () => {
        folderBtn.dataset.state = "folder-hover";
    });

    folderBtn.addEventListener("mouseleave", () => {
        folderBtn.dataset.state = "folder-idle";
    });

    folderBtn.addEventListener("mousedown", async e => {
        e.preventDefault();
        e.stopPropagation();

        const res = await window.electronAPI.openFolderDialog();
        if (res.canceled || !res.filePaths?.length) return;

        window.electronAPI.emitDataFile({
            folder: res.filePaths[0],
            params: { mode: "folder-session", reset: true }
        });
    });

    // Insert buttons in stable order
    left.insertBefore(folderBtn, arrow);
    left.insertBefore(fileBtn, folderBtn);

    // =========================================================
    // EXPORT BUTTON
    // =========================================================
    const exportBtn = document.createElement("button");
    exportBtn.className = "title-export-btn";
    exportBtn.title = "Save segmentation";

    const exportIcon = document.createElement("span");
    exportIcon.className = "title-icon title-export-icon";
    exportBtn.appendChild(exportIcon);

    exportBtn.dataset.state = "idle";

    exportBtn.addEventListener("mouseenter", () => {
        if (exportBtn.dataset.state === "idle") {
            exportBtn.dataset.state = "hover";
        }
    });

    exportBtn.addEventListener("mouseleave", () => {
        if (exportBtn.dataset.state === "hover") {
            exportBtn.dataset.state = "idle";
        }
    });

    function setExportSuccess(progress) {
        if (progress > 0) {
            exportBtn.dataset.state = "success";
            exportBtn.style.pointerEvents = "none";
        } else {
            exportBtn.dataset.state = "idle";
            exportBtn.style.pointerEvents = "";
        }
    }

    // =========================================================
    // DROPDOWN HIT ZONE
    // =========================================================
    const hitZone = document.createElement("div");
    hitZone.className = "dropdownHitZone";
    titleBarEl.appendChild(hitZone);

    // =========================================================
    // LIFECYCLE BINDING
    // =========================================================
    function setLifecycle(lc) {
        lifecycle = lc;
    }

    // =========================================================
    // TITLE BAR UPDATE (AUTHORITATIVE)
    // =========================================================
    function updateTitleBar() {

        // -----------------------------------------------------
        // 1. Title bar is ALWAYS visible
        // -----------------------------------------------------
        titleBarEl.style.display = "flex";

        // -----------------------------------------------------
        // 2. Reset dynamic elements
        // -----------------------------------------------------
        nav.innerHTML = "";
        prevBtn = null;

        // -----------------------------------------------------
        // 3. No data loaded yet → minimal mode
        // -----------------------------------------------------
        if (!AppState.dataLoaded) {

            label.textContent = "";
            arrow.style.display = "none";

            hitZone.classList.remove("active");
            closeDropdown();

            // Export disabled
            if (exportBtn.parentNode) {
                exportBtn.remove();
            }

            return;
        }

        // -----------------------------------------------------
        // 4. Update title text
        // -----------------------------------------------------
        label.textContent = AppState.originalFileName ?? "";

        // -----------------------------------------------------
        // 5. Determine mode
        // -----------------------------------------------------
        const inFolderMode =
            Array.isArray(AppState.fileList) &&
            AppState.fileList.length > 0;

        arrow.style.display = inFolderMode ? "" : "none";
        folderBtn.dataset.state = "folder-idle";

        // -----------------------------------------------------
        // 6. Ensure export button placement (stable DOM)
        // -----------------------------------------------------
        const exportParent = exportBtn.parentNode;

        if (!inFolderMode) {
            // FILE MODE
            // No dropdown, no navigation

            hitZone.classList.remove("active");
            closeDropdown();

            if (exportParent !== left || exportBtn.previousSibling !== folderBtn) {
                left.insertBefore(exportBtn, label);
            }

            return;
        }

        // -----------------------------------------------------
        // 7. Folder mode layout
        // -----------------------------------------------------
        if (exportParent !== left || exportBtn.nextSibling !== arrow) {
            left.insertBefore(exportBtn, arrow);
        }

        // -----------------------------------------------------
        // 8. Prev / Next navigation
        // -----------------------------------------------------
        const prev = document.createElement("button");
        prev.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M15 6l-6 6 6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"/>
            </svg>`;
        prev.disabled = AppState.fileIndex <= 0;
        prev.onclick = () => lifecycle?.prevFile();

        const next = document.createElement("button");
        next.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M9 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"/>
            </svg>`;
        next.disabled = AppState.fileIndex >= AppState.fileList.length - 1;
        next.onclick = () => lifecycle?.nextFile();

        nav.append(prev, next);
        prevBtn = prev;

        updateHitZone();
    }

    // =========================================================
    // HIT ZONE + DROPDOWN HELPERS
    // =========================================================
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

    function isInDropdownZone(x) {
        if (!prevBtn || arrow.style.display === "none") return false;

        const a = arrow.getBoundingClientRect();
        const p = prevBtn.getBoundingClientRect();
        return x >= a.left && x <= p.left;
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
            const count =
                (tracked && Number.isFinite(tracked.exportCount))
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

            // -------------------------------------------------
            // Delete exported selection button (right edge)
            // -------------------------------------------------
            if (tracked && tracked.exportPath) {
                const deleteBtn = document.createElement("button");
                deleteBtn.className = "fileDropdownDelete";
                deleteBtn.title = "Delete exported segmentation";

                deleteBtn.innerHTML = `
                    <span class="trashIconImg"></span>
                `;

                deleteBtn.onclick = e => {
                    e.stopPropagation();

                    const ok = window.confirm(
                        `Delete exported segmentation for:\n${fileName}?`
                    );
                    if (!ok) return;

                    const success =
                        window.electronAPI.deleteFile(tracked.exportPath);

                    if (!success) {
                        alert("Failed to delete export file.");
                        return;
                    }

                    // Update AppState
                    delete AppState.exportTracker[fullPath];
                    delete AppState.lastExportedVersionByFile[fullPath];

                    // Rebuild dropdown to reflect state
                    closeDropdown();
                    toggleFileDropdown();
                };

                item.appendChild(deleteBtn);
            }

            if (idx === AppState.fileIndex) {
                item.classList.add("active");
            }

            item.onclick = e => {
                e.stopPropagation();
                closeDropdown();

                const tracked = AppState.exportTracker?.[fullPath] ?? null;

                if (tracked && tracked.exportPath) {
                    lifecycle.loadFileAtIndex(idx, {
                        hasSegmentedExport: true
                    });
                    return;
                }

                if (idx !== AppState.fileIndex) {
                    lifecycle.loadFileAtIndex(idx);
                }
            };

            fileDropdown.appendChild(item);
        });

        document.body.appendChild(fileDropdown);
        arrow.classList.add("open");

        // ---------------------------------------------------------
        // Outside click handling (capture phase)
        // ---------------------------------------------------------
        onDocMouseDown = e => {
            if (!fileDropdown) return;

            const clickInTitleBar = titleBarEl.contains(e.target);

            if (clickInTitleBar && isInDropdownZone(e.clientX)) {
                // let title bar toggle logic handle it
                return;
            }

            if (!fileDropdown.contains(e.target)) {
                closeDropdown();
            }
        };

        setTimeout(() => {
            document.addEventListener("mousedown", onDocMouseDown, true);
        }, 0);
    }

    // =========================================================
    // TITLE BAR INTERACTION
    // =========================================================
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

    // =========================================================
    // PUBLIC API
    // =========================================================
    return {
        updateTitleBar,
        setLifecycle,
        setExportHandler(fn) {
            exportBtn.onclick = fn;
        },
        setExportSuccess
    };
}
