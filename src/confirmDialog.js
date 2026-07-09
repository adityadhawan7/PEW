// Imperative, promise-based confirm dialog — a styled drop-in replacement for window.confirm.
// Usage: if (!await confirmDialog('Remove this?')) return;
let showFn = null;

export function registerConfirmDialog(fn) {
  showFn = fn;
}

export function confirmDialog(message) {
  if (!showFn) return Promise.resolve(window.confirm(message)); // safety net if the host isn't mounted yet
  return showFn(message);
}
