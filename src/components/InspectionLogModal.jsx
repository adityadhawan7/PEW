import { useState } from 'react';
import Modal from './Modal.jsx';
import { todayStr } from '../utils.js';

const daysAgoStr=n=>{ const d=new Date(); d.setDate(d.getDate()-n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// ── Inspection Log Modal ─────────────────────────────────────
// Durable audit trail of quality records: standalone line inspections AND setting-approval
// submissions (with the supervisor's decision). Read-only viewer — entries are written by the
// shift flows in Dashboard.jsx. Print builds an HTML report in a new window, matching the
// app's other report modals (intentional pattern — see CLAUDE.md).
export default function InspectionLogModal({inspectionLog,machines,onClose}) {
  const [from,setFrom]=useState(daysAgoStr(30));
  const [to,setTo]=useState(todayStr());
  const [machineFilter,setMachineFilter]=useState('');
  const [expanded,setExpanded]=useState(null);

  const entries=(inspectionLog||[]).filter(e=>
    e.date>=from&&e.date<=to&&(!machineFilter||e.machineId===machineFilter)
  );

  const statusLabel=e=>{
    if(e.kind!=='setting') return null;
    if(e.status==='approved') return <span style={{color:'var(--accent3)'}}>✓ approved by {e.decidedBy}</span>;
    if(e.status==='disapproved') return <span style={{color:'var(--danger)'}}>✗ rejected by {e.decidedBy}</span>;
    return <span style={{color:'var(--warn)'}}>⏳ pending review</span>;
  };

  const printReport=()=>{
    const rowsHtml=entries.map(e=>`
      <div style="border:1px solid #ccc;border-radius:6px;padding:12px;margin-bottom:12px;page-break-inside:avoid">
        <div style="font-weight:600">${e.machineName} — ${e.kind==='setting'?'Setting approval':'Line inspection'}</div>
        <div style="font-size:12px;color:#555;margin:2px 0 8px">
          ${e.date} ${e.time||''} · ${e.shiftKey} shift · operator: ${e.operator||'—'} · recorded by: ${e.recordedBy}
          ${e.kind==='setting'?` · status: ${e.status||'pending'}${e.decidedBy?` (${e.decidedBy})`:''}${e.decisionNote?` — ${e.decisionNote}`:''}`:''}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr><th style="border:1px solid #ccc;padding:4px 6px;text-align:left">Sr.</th><th style="border:1px solid #ccc;padding:4px 6px;text-align:left">Specification</th><th style="border:1px solid #ccc;padding:4px 6px;text-align:left">1st Piece</th><th style="border:1px solid #ccc;padding:4px 6px;text-align:left">2nd Piece</th></tr>
          ${(e.rows||[]).map(r=>`<tr><td style="border:1px solid #ccc;padding:4px 6px">${r.sr}</td><td style="border:1px solid #ccc;padding:4px 6px">${r.specification||'—'}</td><td style="border:1px solid #ccc;padding:4px 6px">${r.piece1||'—'}</td><td style="border:1px solid #ccc;padding:4px 6px">${r.piece2||'—'}</td></tr>`).join('')}
        </table>
      </div>`).join('');
    const html=`<!DOCTYPE html><html><head><title>Inspection Register ${from} to ${to}</title></head>
      <body style="font-family:Arial,sans-serif;padding:32px;color:#111">
        <h2 style="margin:0 0 4px">Inspection Register</h2>
        <div style="font-size:13px;color:#555;margin-bottom:16px">${from} to ${to}${machineFilter?` · ${machines.find(m=>m.id===machineFilter)?.name||machineFilter}`:' · all machines'} · ${entries.length} record${entries.length!==1?'s':''} · generated ${todayStr()}</div>
        ${rowsHtml||'<div>No inspection records in this range.</div>'}
      </body></html>`;
    const w=window.open('','_blank');
    w.document.write(html); w.document.close(); w.print();
  };

  return (
    <Modal onClose={onClose} title="Inspection log" wide>
      <p className="modal-note">Durable audit trail: every line inspection and setting-approval submission with its measurements, who recorded it, and the supervisor's decision. Keeps the last 1,000 records — print a register for customer/audit visits.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:'1rem'}}>
        <div className="field" style={{marginBottom:0}}><label>From</label><input type="date" className="mi" value={from} onChange={e=>setFrom(e.target.value)}/></div>
        <div className="field" style={{marginBottom:0}}><label>To</label><input type="date" className="mi" value={to} onChange={e=>setTo(e.target.value)}/></div>
        <div className="field" style={{marginBottom:0}}><label>Machine</label>
          <select className="mi" value={machineFilter} onChange={e=>setMachineFilter(e.target.value)}>
            <option value="">All machines</option>
            {machines.map(m=><option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
          </select>
        </div>
      </div>
      {!entries.length?<div className="empty">No inspection records in this range</div>:(
        <div className="pj-list">
          {entries.map(e=>(
            <div key={e.id}>
              <div className="pj-row" style={{cursor:'pointer'}} onClick={()=>setExpanded(expanded===e.id?null:e.id)}>
                <div className="pj-info">
                  <div className="pj-name" style={{fontSize:12}}>
                    {e.kind==='setting'?'⚙ Setting approval':'🔍 Line inspection'} <span style={{color:'var(--text2)',fontWeight:400}}>· {e.machineName}</span>
                  </div>
                  <div className="pj-meta">
                    {e.date} {e.time||''} · {e.shiftKey} shift · by {e.recordedBy} · {(e.rows||[]).length} spec{(e.rows||[]).length!==1?'s':''}
                    {e.kind==='setting'&&<> · {statusLabel(e)}</>}
                  </div>
                  {e.decisionNote&&<div className="pj-meta">{e.decisionNote}</div>}
                </div>
                <span style={{fontSize:10,color:'var(--text3)',flexShrink:0}}>{expanded===e.id?'▲':'▼'}</span>
              </div>
              {expanded===e.id&&(
                (e.rows||[]).length?(
                  <table className="insp-table" style={{marginTop:4}}>
                    <thead><tr><th style={{width:40}}>Sr.</th><th>Specification</th><th>1st Piece</th><th>2nd Piece</th></tr></thead>
                    <tbody>
                      {e.rows.map(r=>(
                        <tr key={r.sr}><td className="sr">{r.sr}</td><td style={{padding:'6px 4px'}}>{r.specification||'—'}</td><td style={{padding:'6px 4px'}}>{r.piece1||'—'}</td><td style={{padding:'6px 4px'}}>{r.piece2||'—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ):<div className="empty" style={{padding:'.5rem 0'}}>No rows were filled in</div>
              )}
            </div>
          ))}
        </div>
      )}
      <button className="add-btn" style={{marginTop:'1rem',background:'var(--accent3)',color:'var(--on-accent)'}} onClick={printReport}>🖨 PRINT INSPECTION REGISTER</button>
    </Modal>
  );
}
