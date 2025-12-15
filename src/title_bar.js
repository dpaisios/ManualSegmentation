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

        if (!AppState.fileList || AppState.fileList.length === 0) return;

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

        const barRect  = titleBarEl.getBoundingClientRect();
        const leftRect = left.getBoundingClientRect();
        const prevRect = prevBtn.getBoundingClientRect();

        const x0 = leftRect.left - barRect.left;
        const w  = prevRect.left - leftRect.left;

        if (w <= 0) {
            hitZone.classList.remove("active");
            return;
        }

        hitZone.style.left  = `${x0}px`;
        hitZone.style.width = `${w}px`;
    }

    function isInDropdownZone(clientX) {
        if (!prevBtn) return false;

        const leftRect = left.getBoundingClientRect();
        const prevRect = prevBtn.getBoundingClientRect();

        return (
            clientX >= leftRect.left &&
            clientX <= (prevRect.left)
        );
    }

    function closeDropdown() {
        if (!fileDropdown) return;
        fileDropdown.remove();
        fileDropdown = null;
        arrow.classList.remove("open");
    }

    function toggleFileDropdown() {
        if (fileDropdown) {
            closeDropdown();
            return;
        }

        if (!AppState.fileList || !lifecycle) return;

        const leftRect = left.getBoundingClientRect();
        const navRect  = nav.getBoundingClientRect();

        fileDropdown = document.createElement("div");
        fileDropdown.className = "fileDropdown";

        fileDropdown.style.left = `${leftRect.left}px`;
        fileDropdown.style.top  = `${leftRect.bottom + 4}px`;

        const maxWidth =
            Math.max(160, navRect.left - leftRect.left);

        fileDropdown.style.width = `${maxWidth}px`;

        AppState.fileList.forEach((fullPath, idx) => {
            const item = document.createElement("div");
            item.className = "fileDropdownItem";
            item.textContent = fullPath.split(/[/\\]/).pop();

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

        const onDocMouseDown = e => {
            if (isInDropdownZone(e.clientX)) return;

            if (
                fileDropdown &&
                !fileDropdown.contains(e.target)
            ) {
                closeDropdown();
                document.removeEventListener("mousedown", onDocMouseDown, true);
            }
        };

        setTimeout(() => {
            document.addEventListener("mousedown", onDocMouseDown, true);
        }, 0);
    }

    // ---------------------------------------------------------
    // Hover + click logic
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
