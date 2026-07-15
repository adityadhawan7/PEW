// Imperative toast helper — same register pattern as confirmDialog.js. Fire-and-forget save
// confirmations for actions whose modal closes silently (shift complete, breakdown, decisions).
// Usage: toast('✓ Progress saved');
let showFn = null;

export function registerToast(fn) {
  showFn = fn;
}

export function toast(message) {
  if (!showFn) { console.log('[toast]', message); return; } // safety net if the host isn't mounted yet
  showFn(message);
}
