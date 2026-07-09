import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { todayStr, nowStr, fullTs, computeOperatorDayPay } from '../utils.js';
import { confirmDialog } from '../confirmDialog.js';

const ADJ_TYPES={
  food:      {lbl:'Food (OT meal)',  sign:+1},
  conveyance:{lbl:'Conveyance',      sign:+1},
  advance:   {lbl:'Salary advance',  sign:-1},
};

// ── Wage Register Modal ────────────────────────────────────
// Money is computed here at read time from wage_log FACTS (produced/target/rate/status) ×
// each operator's CURRENT dailyWage — entries never store amounts. See computeShiftPay /
// computeOperatorDayPay in utils.js for the pay rules (piece-rate vs daily, shortfall gating).
// The adjustments ledger (manual food/conveyance allowances and salary advances) is entered
// on the second tab; the register nets it against the period's pay.
export default function WageRegisterModal({attendance,wageLog,adjustments,writeAdjustments,currentUser,onClose}) {
  const [users,setUsers]=useState([]);
  useEffect(()=>{ fb.listUserProfiles().then(setUsers); },[]);
  const [from,setFrom]=useState(todayStr());
  const [to,setTo]=useState(todayStr());
  const [tab,setTab]=useState('register');
  const [expanded,setExpanded]=useState(null); // username whose per-shift detail is open
  const [adjForm,setAdjForm]=useState({username:'',date:todayStr(),type:'advance',amount:'',note:''});
  const [adjMsg,setAdjMsg]=useState('');
  const operators=users.filter(u=>u.role==='operator');

  const dateRange=()=>{
    const out=[];
    let d=new Date(from+'T00:00:00');
    const end=new Date(to+'T00:00:00');
    while(d<=end){ out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); d.setDate(d.getDate()+1); }
    return out;
  };
  const days=dateRange();
  const inRange=date=>date>=from&&date<=to;

  // Index the durable wage log by username+date (username is the unique join key — display
  // names can collide). The old register summed OT out of the alerts doc, which is capped at
  // 200 entries and silently dropped older overtime from long ranges; wage_log fixes that.
  const entriesByUserDate={};
  (wageLog||[]).forEach(e=>{
    if(!e.username||!e.date) return;
    const key=e.username+'|'+e.date;
    (entriesByUserDate[key]=entriesByUserDate[key]||[]).push(e);
  });

  const rows=operators.map(o=>{
    const wageType=o.wageType||'daily';
    let presentDays=0,halfDays=0,absentDays=0,basePay=0,otPay=0,pendingCount=0,prodShifts=0;
    const dayDetails=[];
    days.forEach(d=>{
      const status=(attendance[d]||{})[o.username];
      if(status==='present')presentDays++;
      else if(status==='half')halfDays++;
      else if(status==='absent')absentDays++;
      const entries=entriesByUserDate[o.username+'|'+d]||[];
      const pay=computeOperatorDayPay({entries,attendanceStatus:status,dailyWage:o.dailyWage||0,monthlySalary:o.monthlySalary||0,wageType,date:d});
      basePay+=pay.basePay; otPay+=pay.otPay; pendingCount+=pay.pendingCount;
      if(pay.source==='production') prodShifts+=entries.length;
      entries.forEach(e=>dayDetails.push(e));
    });
    let food=0,conveyance=0,advances=0;
    (adjustments||[]).forEach(adj=>{
      if(adj.username!==o.username||!inRange(adj.date)) return;
      if(adj.type==='food')food+=adj.amount||0;
      else if(adj.type==='conveyance')conveyance+=adj.amount||0;
      else if(adj.type==='advance')advances+=adj.amount||0;
    });
    const total=Math.round((basePay+otPay)*100)/100;
    return {
      username:o.username,name:o.name,dailyWage:o.dailyWage||0,monthlySalary:o.monthlySalary||0,wageType,
      presentDays,halfDays,absentDays,prodShifts,pendingCount,dayDetails,
      basePay:Math.round(basePay*100)/100,otPay:Math.round(otPay*100)/100,total,
      food:Math.round(food*100)/100,conveyance:Math.round(conveyance*100)/100,advances:Math.round(advances*100)/100,
      net:Math.round((total+food+conveyance-advances)*100)/100,
    };
  });

  const grandNet=rows.reduce((s,r)=>s+r.net,0);
  const anyPending=rows.some(r=>r.pendingCount>0);

  const addAdjustment=async()=>{
    setAdjMsg('');
    const amount=Number(adjForm.amount);
    if(!adjForm.username) return setAdjMsg('Select an operator.');
    if(!adjForm.date) return setAdjMsg('Pick a date.');
    if(!amount||amount<=0||isNaN(amount)) return setAdjMsg('Amount must be a number greater than 0.');
    const op=operators.find(u=>u.username===adjForm.username);
    const entry={id:Date.now(),username:adjForm.username,operatorName:op?op.name:adjForm.username,date:adjForm.date,type:adjForm.type,amount,note:adjForm.note.trim(),recordedBy:currentUser.name,ts:fullTs(),time:nowStr()};
    writeAdjustments([entry,...(adjustments||[])].slice(0,3000));
    setAdjForm({...adjForm,amount:'',note:''});
    setAdjMsg('Entry added.');
  };

  const removeAdjustment=async adj=>{
    if(!await confirmDialog(`Delete this entry? ${ADJ_TYPES[adj.type]?.lbl||adj.type} ₹${adj.amount} for ${adj.operatorName} on ${adj.date}.`)) return;
    writeAdjustments((adjustments||[]).filter(x=>x.id!==adj.id));
  };

  const recentAdjustments=(adjustments||[]).slice(0,50);

  const toCSV=()=>{
    const header=['Operator','Wage Type','Daily Wage','Monthly Salary','Present Days','Half Days','Absent Days','Production Shifts','Base Pay','OT Pay','Pending Shifts','Food','Conveyance','Advances','Net Payable'];
    const body=rows.map(r=>[r.name,r.wageType==='production'?'Piece-rate':r.wageType==='monthly'?'Monthly':'Daily',r.wageType==='monthly'?'':r.dailyWage,r.wageType==='monthly'?r.monthlySalary:'',r.presentDays,r.halfDays,r.absentDays,r.prodShifts,r.basePay,r.otPay,r.pendingCount,r.food,r.conveyance,r.advances,r.net]);
    const all=[header,...body,[],['','','','','','','','','','','','','','Grand total',Math.round(grandNet*100)/100]];
    const csv=all.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const el=document.createElement('a');
    el.href=url; el.download=`wage-register-${from}-to-${to}.csv`; el.click(); URL.revokeObjectURL(url);
  };

  return (
    <Modal onClose={onClose} title="Wage register" wide>
      <div className="role-chips" style={{marginBottom:'1rem'}}>
        <div className={`role-chip${tab==='register'?' active':''}`} onClick={()=>setTab('register')}>Register</div>
        <div className={`role-chip${tab==='adjust'?' active':''}`} onClick={()=>setTab('adjust')}>Allowances &amp; advances</div>
      </div>

      {tab==='register'&&(
        <>
          <p className="modal-note">
            <b>Piece-rate operators</b>: each completed shift pays daily wage × (produced ÷ target) — full wage when the target is met,
            overtime at the extra-production ratio above it. Under-target shifts follow the shortfall review: approved = full wage,
            disapproved = proportional, awaiting review = proportional (flagged ⚠, total updates when decided). Days with no completed
            shift fall back to attendance. <b>Daily-wage staff</b>: attendance × wage, plus any overtime.
            <b> Monthly-salary staff</b>: salary is prorated across the selected range by each day's calendar month, docked for
            absent/half days, plus overtime on the same rule as daily-wage staff.
            Food/conveyance allowances add and salary advances deduct (entered on the other tab). Amounts use each operator's
            <b> current</b> wage/salary — download the CSV before changing it.
          </p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:'1rem'}}>
            <div className="field" style={{marginBottom:0}}><label>From</label><input type="date" className="mi" value={from} onChange={e=>setFrom(e.target.value)}/></div>
            <div className="field" style={{marginBottom:0}}><label>To</label><input type="date" className="mi" value={to} onChange={e=>setTo(e.target.value)}/></div>
          </div>
          {!operators.length?<div className="empty">No operator accounts yet</div>:(
            <div className="pj-list">
              {rows.map(r=>(
                <div key={r.username}>
                  <div className="pj-row" style={{alignItems:'flex-start',cursor:r.dayDetails.length?'pointer':'default'}} onClick={()=>r.dayDetails.length&&setExpanded(expanded===r.username?null:r.username)}>
                    <div className="pj-info">
                      <div className="pj-name">{r.name} <span style={{fontSize:10,color:'var(--text3)'}}>· {r.wageType==='production'?'piece-rate':r.wageType==='monthly'?'monthly':'daily'}</span></div>
                      <div className="pj-meta">
                        {r.wageType==='production'?`${r.prodShifts} shift${r.prodShifts!==1?'s':''} · `:''}
                        {r.presentDays}P · {r.halfDays}H · {r.absentDays}A &nbsp;·&nbsp; base ₹{r.basePay} + OT ₹{r.otPay}
                        {(r.food>0||r.conveyance>0)?` + allowances ₹${Math.round((r.food+r.conveyance)*100)/100}`:''}
                        {r.advances>0?` − advances ₹${r.advances}`:''}
                      </div>
                      {r.pendingCount>0&&<div style={{fontSize:10,color:'var(--warn)',marginTop:2}}>⚠ {r.pendingCount} shift{r.pendingCount!==1?'s':''} awaiting shortfall review — counted at proportional pay for now</div>}
                      {r.net<0&&<div style={{fontSize:10,color:'var(--danger)',marginTop:2}}>Advances exceed pay this period — settle or carry over manually</div>}
                    </div>
                    <div className="pj-target" style={{fontSize:13,color:r.net<0?'var(--danger)':'var(--text)'}}>₹{r.net}</div>
                  </div>
                  {expanded===r.username&&r.dayDetails.length>0&&(
                    <div style={{margin:'4px 0 6px 12px',display:'flex',flexDirection:'column',gap:3}}>
                      {r.dayDetails.map(e=>(
                        <div key={e.id} style={{fontSize:11,color:'var(--text2)',display:'flex',justifyContent:'space-between',gap:8}}>
                          <span>{e.date} · {e.machine} · {e.job}</span>
                          <span style={{whiteSpace:'nowrap'}}>{e.produced}/{e.target}{e.status==='pending'?' · ⚠ pending':e.status==='approved'?' · ✓ approved':e.status==='disapproved'?' · ✗ disapproved':''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="info-box success" style={{marginTop:'1rem',marginBottom:'1rem'}}>
            Grand total (net payable): <b>₹{Math.round(grandNet*100)/100}</b> across {rows.length} operator{rows.length!==1?'s':''}, {days.length} day{days.length!==1?'s':''}
            {anyPending&&<span style={{color:'var(--warn)'}}> · includes shifts pending review at proportional pay</span>}
          </div>
          <button className="add-btn" style={{background:'var(--accent3)',color:'#000'}} onClick={toCSV}>↓ DOWNLOAD WAGE REGISTER (CSV)</button>
        </>
      )}

      {tab==='adjust'&&(
        <>
          <p className="modal-note">Record manual pay adjustments: food allowance for overtime days, travel conveyance, and salary advances handed out (advances are deducted from the register's net payable for whatever period includes their date).</p>
          <div className="field"><label>Operator</label>
            <select className="mi" value={adjForm.username} onChange={e=>setAdjForm({...adjForm,username:e.target.value})}>
              <option value="">— Select operator —</option>
              {operators.map(o=><option key={o.username} value={o.username}>{o.name} ({o.username})</option>)}
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="field"><label>Date</label><input type="date" className="mi" value={adjForm.date} onChange={e=>setAdjForm({...adjForm,date:e.target.value})}/></div>
            <div className="field"><label>Amount (₹)</label><input type="number" min="0" className="mi" value={adjForm.amount} onChange={e=>setAdjForm({...adjForm,amount:e.target.value})} placeholder="e.g. 100"/></div>
          </div>
          <div className="field"><label>Type</label>
            <div className="role-chips">
              {Object.entries(ADJ_TYPES).map(([k,v])=>(
                <div key={k} className={`role-chip${adjForm.type===k?' active':''}`} onClick={()=>setAdjForm({...adjForm,type:k})}>{v.lbl} {v.sign>0?'+':'−'}</div>
              ))}
            </div>
          </div>
          <div className="field"><label>Note (optional)</label><input className="mi" value={adjForm.note} onChange={e=>setAdjForm({...adjForm,note:e.target.value})} placeholder="e.g. night OT meal / bus fare / medical advance"/></div>
          {adjMsg&&<div className="save-msg" style={{color:adjMsg==='Entry added.'?'var(--accent3)':'var(--danger)'}}>{adjMsg}</div>}
          <button className="add-btn" onClick={addAdjustment}>+ ADD ENTRY</button>

          <div className="sb-title" style={{marginTop:'1.25rem'}}>Recent entries</div>
          {!recentAdjustments.length?<div className="empty">No entries yet</div>:(
            <div className="pj-list">
              {recentAdjustments.map(adj=>(
                <div className="pj-row" key={adj.id}>
                  <div className="pj-info">
                    <div className="pj-name" style={{fontSize:12}}>
                      {adj.type==='advance'?'−':'+'}₹{adj.amount} · {ADJ_TYPES[adj.type]?.lbl||adj.type} · {adj.operatorName}
                    </div>
                    <div className="pj-meta">{adj.date}{adj.note?` · ${adj.note}`:''} · by {adj.recordedBy}</div>
                  </div>
                  <button className="small-btn danger" onClick={()=>removeAdjustment(adj)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
