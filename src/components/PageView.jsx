import { useEffect } from 'react';

// ── Full-page view shell ───────────────────────────────────
// The AnalyticsView pattern (Dashboard's `view` state swaps the .main-layout block while
// Topbar/ShiftBanner stay), plus a Back button and a width-constrained body — these views were
// originally laid out for a 580px wide modal, so unconstrained full-width would look sparse.
export default function PageView({title, onBack, children}) {
  useEffect(()=>{ window.scrollTo(0,0); },[]);
  return (
    <div className="content-area" style={{flex:1}}>
      <div className="page-body">
        <div className="sec-hdr">
          <div className="sec-title">{title}</div>
          <button className="icon-btn" onClick={onBack}>← Back to floor</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
