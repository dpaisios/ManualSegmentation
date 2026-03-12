// -------------------------------------------------------------
// title_bar.js
// Title bar controller:
// - file / folder buttons
// - filename display
// - folder dropdown + navigation
// - settings button
// -------------------------------------------------------------

export function attachTitleBar({
    titleBarEl,
    AppState
}) {
    let fileDropdown = null;
    let lifecycle = null;
    let prevBtn = null;
    let onDocMouseDown = null;
    let settingsToggleHandler = null;
    let settingsHasError = false;
    let settingsErrorMessage = "";

    const left  = titleBarEl.querySelector(".title-left");
    const label = titleBarEl.querySelector(".title-label");
    const arrow = titleBarEl.querySelector(".dropdown-arrow");
    const nav   = titleBarEl.querySelector(".title-nav");

    // =========================================================
    // FILE BUTTON
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
    // FOLDER BUTTON
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
    // SETTINGS BUTTON
    // =========================================================
    const settingsBtn = document.createElement("button");
    settingsBtn.className = "title-settings-btn";
    settingsBtn.title = "Settings";

    const settingsIcon = document.createElement("span");
    settingsIcon.className = "title-icon title-settings-icon";
    settingsBtn.appendChild(settingsIcon);

    settingsBtn.dataset.state = "idle";

    settingsBtn.addEventListener("mouseenter", () => {
        if (settingsHasError) {
            settingsBtn.dataset.state = "hover-error";
            settingsBtn.title = settingsErrorMessage || "Some variables could not be mapped";
            return;
        }

        if (settingsBtn.dataset.state !== "active") {
            settingsBtn.dataset.state = "hover";
        }
    });

    settingsBtn.addEventListener("mouseleave", () => {

        if (settingsHasError) {
            settingsBtn.dataset.state = "idle-error";
            settingsBtn.title = "Settings";
            return;
        }

        if (settingsBtn.dataset.state !== "active") {
            settingsBtn.dataset.state = "idle";
        }
    });

    settingsBtn.addEventListener("mousedown", e => {
        e.preventDefault();
        e.stopPropagation();
        settingsToggleHandler?.();
    });

    function setSettingsMenuOpen(isOpen) {

        if (settingsHasError) {
            settingsBtn.dataset.state = isOpen
                ? "hover-error"
                : "idle-error";

            settingsBtn.title = isOpen
                ? (settingsErrorMessage || "Some variables could not be mapped")
                : "Settings";

            return;
        }

        settingsBtn.dataset.state =
            isOpen ? "active" : "idle";
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
    // TITLE BAR UPDATE
    // =========================================================
    function updateTitleBar() {
        titleBarEl.style.display = "flex";
        nav.innerHTML = "";
        prevBtn = null;

        if (!AppState.dataLoaded) {
            label.textContent = "";
            arrow.style.display = "none";

            hitZone.classList.remove("active");
            closeDropdown();

            if (exportBtn.parentNode) exportBtn.remove();
            if (settingsBtn.parentNode !== nav) {
                nav.appendChild(settingsBtn);
            }

            return;
        }

        label.textContent = AppState.originalFileName ?? "";

        const inFolderMode =
            Array.isArray(AppState.fileList) &&
            AppState.fileList.length > 0;

        arrow.style.display = inFolderMode ? "" : "none";
        folderBtn.dataset.state = "folder-idle";

        const exportParent = exportBtn.parentNode;
        if (!inFolderMode) {
            hitZone.classList.remove("active");
            closeDropdown();

            if (exportParent !== left || exportBtn.previousSibling !== folderBtn) {
                left.insertBefore(exportBtn, label);
            }

            nav.appendChild(settingsBtn);
            return;
        }

        if (exportParent !== left || exportBtn.nextSibling !== arrow) {
            left.insertBefore(exportBtn, arrow);
        }

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

        nav.append(prev, next, settingsBtn);
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

        const maxWidth = Math.max(160, navRect.left - labelRect.left);
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

            if (tracked && tracked.exportPath) {
                const deleteBtn = document.createElement("button");
                deleteBtn.className = "fileDropdownDelete";
                deleteBtn.title = "Delete exported segmentation";

                deleteBtn.innerHTML = `<span class="trashIconImg"></span>`;

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

                    delete AppState.exportTracker[fullPath];
                    delete AppState.lastExportedVersionByFile[fullPath];

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

        onDocMouseDown = e => {
            if (!fileDropdown) return;

            const clickInTitleBar = titleBarEl.contains(e.target);

            if (clickInTitleBar && isInDropdownZone(e.clientX)) {
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

        setSettingsError(hasError, message = "") {

            settingsHasError = !!hasError;
            settingsErrorMessage = message;

            if (settingsHasError) {
                settingsBtn.dataset.state = "idle-error";
                settingsBtn.title = settingsErrorMessage || "Some variables could not be mapped";
            }
            else {
                settingsBtn.dataset.state = "idle";
                settingsBtn.title = "Settings";
            }
        },

        setExportHandler(fn) {
            exportBtn.onclick = fn;
        },

        setExportSuccess,

        setSettingsHandler(fn) {
            settingsToggleHandler = fn;
        },

        setSettingsMenuOpen,

        getSettingsButtonElement() {
            return settingsBtn;
        }
    };
}