import { useMemo } from 'react';
import PageView from './PageView.jsx';
import { todayStr, buildProductionPlan } from '../utils.js';

// ── Production planning (full-page view) ───────────────────
// Read-only "what to run next" summary over the next ~3 days: puts each casting type's open-order
// demand next to what's actually available (finished stock + work-in-process + raw material) and
// flags where raw material would run short, plus how many of each assembly can be built now given
// BOM material on hand. All the math is buildProductionPlan() in utils.js — this component only
// renders it. It writes nothing and never assigns machines; it's advisory (admin + supervisor).
const HORIZON_DAYS = 3;

const fmt = n => (Math.round((Number(n) || 0) * 100) / 100).toString();

// Verdict chip per casting row — colour follows severity via theme tokens (never hardcoded alpha).
function VerdictChip({ row }) {
  const map = {
    shortRaw: { color: 'var(--danger)', label: `Short raw — order ${fmt(row.rawShortfall)} ${row.unit || ''}`.trim() },
    rawReady: { color: 'var(--accent)', label: `Raw ready — make ${fmt(row.notYetStarted)}` },
    inProcess: { color: 'var(--text2)', label: 'Already in process' },
    covered: { color: 'var(--accent3)', label: 'Covered by stock' },
  };
  const v = map[row.verdict] || map.inProcess;
  return (
    <span style={{
      flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      color: v.color, background: `color-mix(in srgb, ${v.color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${v.color} 35%, transparent)`, whiteSpace: 'nowrap',
    }}>{v.label}</span>
  );
}

function dueBadge(row) {
  if (!row.earliestDue) return <span style={{ color: 'var(--text3)' }}>no due date</span>;
  if (row.dueState === 'overdue') return <span style={{ color: 'var(--danger)' }}>OVERDUE · was due {row.earliestDue}</span>;
  if (row.dueState === 'dueSoon') return <span style={{ color: 'var(--warn)' }}>due {row.earliestDue}</span>;
  return <span>due {row.earliestDue}</span>;
}

export default function PlanningView({ castingTypes = [], assemblyModels = [], purchasedComponents = [], orders = [], wip = {}, machines = [], onBack }) {
  const today = todayStr();
  const plan = useMemo(
    () => buildProductionPlan({ castingTypes, assemblyModels, purchasedComponents, orders, wip, machines, today, horizonDays: HORIZON_DAYS }),
    [castingTypes, assemblyModels, purchasedComponents, orders, wip, machines, today]
  );
  const { castings, assemblies, toOrder, lowRawNoOrders, capacity } = plan;

  return (
    <PageView title="Planning — next 3 days" onBack={onBack}>
      <p className="modal-note">
        What to run next, from your open orders and the material you have on hand. For each casting type: what's still
        owed to customers vs. finished stock, work-in-process, and raw material — with the pieces you'd still need to make
        (and any raw shortfall). Advisory only — nothing here changes machine assignments. Shift estimates are rough.
      </p>

      <div className="pj-meta" style={{ marginBottom: '1rem' }}>
        Capacity over the next {capacity.horizonDays} days ≈ <b>{capacity.machineShifts}</b> machine-shifts
        ({capacity.cncCount} CNC/VMC × {2 * capacity.horizonDays} + {capacity.manualCount} manual × {capacity.horizonDays}). A rough gut-check, not a schedule.
      </div>

      {/* To order — material gaps first */}
      {toOrder.length > 0 && (
        <div className="prod-entry" style={{ marginTop: 0, borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)' }}>
          <div className="prod-entry-title" style={{ color: 'var(--danger)' }}>⚠ Material to order</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {toOrder.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
                <span>{t.name}{t.kind === 'purchased' && t.vendor ? <span style={{ color: 'var(--text3)' }}> · {t.vendor}</span> : null}</span>
                <span style={{ whiteSpace: 'nowrap', color: 'var(--danger)' }}>
                  {t.kind === 'casting' ? `short ${fmt(t.shortfall)} ${t.unit || ''}` : `low — ${fmt(t.balance)} ${t.unit || ''} left`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Casting production */}
      <div className="prod-entry-title" style={{ marginTop: '1.25rem' }}>Casting production</div>
      {!castings.length ? (
        <div className="empty">No open orders — nothing to plan against.</div>
      ) : (
        <div className="pj-list">
          {castings.map(row => (
            <div className="pj-row" key={row.id} style={{ alignItems: 'flex-start', gap: 8 }}>
              <div className="pj-info">
                <div className="pj-name">{row.name}</div>
                <div className="pj-meta">{dueBadge(row)} · ordered {fmt(row.demand)} {row.unit}</div>
                <div className="pj-meta">
                  {fmt(row.finishedReady)} finished ready · {fmt(row.inProcess)} in process · {fmt(row.rawBalance)} raw ·
                  <b> {fmt(row.notYetStarted)} still to make</b>
                  {row.shiftsNeeded != null ? ` · ≈ ${row.shiftsNeeded} shift${row.shiftsNeeded === 1 ? '' : 's'}` : ''}
                </div>
              </div>
              <VerdictChip row={row} />
            </div>
          ))}
        </div>
      )}

      {/* Assemblies */}
      {assemblies.length > 0 && (
        <>
          <div className="prod-entry-title" style={{ marginTop: '1.25rem' }}>Assemblies — buildable now</div>
          <div className="pj-list">
            {assemblies.map(a => (
              <div className="pj-row" key={a.id} style={{ alignItems: 'flex-start', gap: 8 }}>
                <div className="pj-info">
                  <div className="pj-name">{a.name}</div>
                  <div className="pj-meta">
                    {a.builtOnHand} built on hand
                    {a.bottleneck ? ` · limited by ${a.bottleneck.itemName} (${fmt(a.bottleneck.available)} ${a.bottleneck.unit || ''} available)` : ''}
                  </div>
                </div>
                <span style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                  color: a.canBuildNow > 0 ? 'var(--accent)' : 'var(--danger)',
                  background: `color-mix(in srgb, ${a.canBuildNow > 0 ? 'var(--accent)' : 'var(--danger)'} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${a.canBuildNow > 0 ? 'var(--accent)' : 'var(--danger)'} 35%, transparent)`,
                }}>{a.canBuildNow > 0 ? `Build up to ${a.canBuildNow}` : 'No material'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Low on raw, no open orders — a heads-up */}
      {lowRawNoOrders.length > 0 && (
        <>
          <div className="prod-entry-title" style={{ marginTop: '1.25rem' }}>Low on raw material (no open orders)</div>
          <div className="pj-list">
            {lowRawNoOrders.map(r => (
              <div className="pj-row" key={r.id}>
                <div className="pj-info">
                  <div className="pj-name">{r.name}</div>
                  <div className="pj-meta">{fmt(r.rawBalance)} {r.unit} raw · at or below its low mark ({fmt(r.lowThreshold)})</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--warn)' }}>keep an eye</span>
              </div>
            ))}
          </div>
        </>
      )}
    </PageView>
  );
}
