// ── Needs-attention strip ──────────────────────────────────
// Staff-only triage row at the top of the floor view: everything that needs a decision today,
// each chip jumping to the right place. Fed by attentionSummary (utils.js) — the same source
// as the Topbar section badges, so the two can never disagree. Renders nothing when all clear.
// salaryDueMonth is passed only when the viewer is an admin (supervisors see the strip but must
// never touch pay), so gating the chip on it also gates it by role.
export default function AttentionStrip({attention, setView, setShowMaintenance, salaryDueMonth, onOpenSalarySheet}) {
  const {orders,maint,lowStock,pendingReviews}=attention;
  if(orders.total+maint.total+lowStock.count+pendingReviews===0&&!salaryDueMonth) return null;
  const seg=(overdue,dueSoon)=>[overdue?`${overdue} overdue`:'',dueSoon?`${dueSoon} due soon`:''].filter(Boolean).join(' · ');
  const scrollToAlerts=()=>document.getElementById('floor-alerts')?.scrollIntoView({behavior:'smooth',block:'start'});
  const monthName=salaryDueMonth?new Date(salaryDueMonth+'-01T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'}):'';
  return (
    <div className="attn-strip">
      {salaryDueMonth&&(
        <button className="attn-chip warn" onClick={onOpenSalarySheet}>
          ₹ {monthName} salary sheet ready — download
        </button>
      )}
      {orders.total>0&&(
        <button className={`attn-chip ${orders.overdue?'danger':'warn'}`} onClick={()=>setView('orders')}>
          ⚠ Orders: {seg(orders.overdue,orders.dueSoon)}
        </button>
      )}
      {maint.total>0&&(
        <button className={`attn-chip ${maint.overdue?'danger':'warn'}`} onClick={()=>setShowMaintenance(true)}>
          ⚙ Maintenance: {seg(maint.overdue,maint.dueSoon)}
        </button>
      )}
      {lowStock.count>0&&(
        <button className="attn-chip danger" title={lowStock.items.map(i=>`${i.name} (${i.balance} ${i.unit})`).join(', ')} onClick={()=>setView('stock')}>
          ▼ Low stock: {lowStock.count} item{lowStock.count!==1?'s':''}
        </button>
      )}
      {pendingReviews>0&&(
        <button className="attn-chip warn" onClick={scrollToAlerts}>
          ⏳ {pendingReviews} pending review{pendingReviews!==1?'s':''}
        </button>
      )}
    </div>
  );
}
