// -------------------------------------------------------------
// selection_manager.js — faithful to your original app
// -------------------------------------------------------------

// Delete by reference — identical to original app.js
export function deleteSelection(target, selections) {
    return selections.filter(s => s !== target);
}