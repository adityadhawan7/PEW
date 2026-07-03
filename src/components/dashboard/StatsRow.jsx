export default function StatsRow({ stats }) {
  return (
    <div className="stats-row">
      <div className="stat-card s-run"><div className="stat-label">Running</div><div className="stat-val c-green">{stats.run}</div><div className="stat-sub">machines active</div></div>
      <div className="stat-card s-idle"><div className="stat-label">Idle</div><div className="stat-val c-amber">{stats.idle}</div><div className="stat-sub">awaiting jobs</div></div>
      <div className="stat-card s-down"><div className="stat-label">Breakdown</div><div className="stat-val c-red">{stats.down}</div><div className="stat-sub">needs attention</div></div>
      <div className="stat-card s-eff"><div className="stat-label">Efficiency</div><div className="stat-val c-blue">{stats.eff}%</div><div className="stat-sub">output vs target</div></div>
    </div>
  );
}
