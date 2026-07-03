export default function OutputChart({ running, maxTarget }) {
  return (
    <div>
      <div className="sec-hdr"><div className="sec-title">Output vs target — running machines</div></div>
      {!running.length?<div className="empty">No running machines in this shift</div>:(
        <div className="ob-wrap">
          {running.map(m=>{
            const pct=Math.min(100,Math.round(m.output/m.target*100));
            const col=pct>=90?'var(--accent3)':pct>=60?'var(--warn)':'var(--danger)';
            return (
              <div className="ob-row" key={m.id}>
                <div className="ob-label">{m.id}</div>
                <div className="ob-track">
                  <div className="ob-fill" style={{width:`${Math.round(m.output/maxTarget*100)}%`,background:col}}></div>
                  <div className="ob-target" style={{left:`${Math.round(m.target/maxTarget*100)}%`}}></div>
                </div>
                <div className="ob-pct">{pct}%</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
