import { lazy } from 'react';

// React.lazy with stale-deploy recovery. Netlify deploys are atomic: a phone still holding
// yesterday's index.html will 404 when it tries to fetch an old hashed chunk after a new
// deploy. Instead of a broken error screen, reload once to pick up the fresh index.html
// (guarded by a sessionStorage flag so a genuinely broken chunk can't cause a reload loop).
export function lazyWithReload(importFn) {
  return lazy(() =>
    importFn().catch(err => {
      const key = 'fos_chunk_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return new Promise(() => {}); // never resolves — the reload takes over
      }
      throw err; // second failure: real problem, let the ErrorBoundary show it
    })
  );
}
