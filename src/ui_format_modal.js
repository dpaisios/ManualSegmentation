// -------------------------------------------------------------
// ui_format_modal.js
// Promise-based modal for folder format selection (with counts)
// -------------------------------------------------------------

export function showFormatSelectionModal(formatCounts) {

    const modal   = document.getElementById("formatModal");
    const buttons = document.getElementById("formatModalButtons");
    const cancel  = document.getElementById("formatModalCancel");

    if (!modal || !buttons || !cancel) {
        console.error("Format modal DOM elements missing");
        return Promise.resolve(null);
    }

    buttons.innerHTML = "";

    const formats = Object.keys(formatCounts);

    return new Promise(resolve => {

        function cleanup(result) {
            modal.classList.add("hidden");
            buttons.innerHTML = "";
            cancel.onclick = null;
            resolve(result);
        }

        // -----------------------------------------------------
        // All formats
        // -----------------------------------------------------
        const summary = formats
            .map(f => `${f}: ${formatCounts[f]}`)
            .join(", ");

        const allBtn = document.createElement("button");
        allBtn.textContent = `All accepted formats (${summary})`;
        allBtn.onclick = () => cleanup([...formats]);
        buttons.appendChild(allBtn);

        // -----------------------------------------------------
        // Individual formats
        // -----------------------------------------------------
        for (const f of formats) {
            const n = formatCounts[f];
            const btn = document.createElement("button");
            btn.textContent =
                `Only ${f.toUpperCase()} (${n} file${n !== 1 ? "s" : ""})`;
            btn.onclick = () => cleanup([f]);
            buttons.appendChild(btn);
        }

        cancel.onclick = () => cleanup(null);

        modal.classList.remove("hidden");
    });
}
