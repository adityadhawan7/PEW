import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { todayStr } from '../utils.js';

// ── Wage Register Modal ────────────────────────────────────
export default function WageRegisterModal({attendance,alerts,onClose}) {
  const [users,setUsers]=useState([]);
  useEffect(()=>{ fb.listUserProfiles().then(setUsers); },[]);
  const [from,setFrom]=useState(todayStr());
  const [to,setTo]=useState(todayStr());
  const operators=users.filter(u=>u.role==='operator');

  const dateRange=()=>{
    const out=[];
    let d=new Date(from+'T00:00:00');
    const end=new Date(to+'T00:00:00');
    while(d<=end){ out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); d.setDate(d.getDate()+1); }
    return out;
  };
  const days=dateRange();

  // OT pay comes from production alerts logged at shift-complete (category 'production' or 'shortfall'),
  // which already carry otPay/otHours computed at the moment the shift was completed.
  const otByOperatorDate={};
  alerts.forEach(a=>{
    if(!a.data||!(a.data.category==='production'||a.data.category==='shortfall')) return;
    if(a.data.otPay===undefined||!a.data.operator) return;
    const key=a.data.operator+'|'+(a.date||'');
    otByOperatorDate[key]=(otByOperatorDate[key]||0)+(a.data.otPay||0);
  });

  const rows=operators.map(o=>{
    let presentDays=0,halfDays=0,absentDays=0,basePay=0,otPay=0;
    days.forEach(d=>{
      const status=(attendance[d]||{})[o.username];
      if(status==='present'){presentDays++;basePay+=o.dailyWage||0;}
      else if(status==='half'){halfDays++;basePay+=(o.dailyWage||0)/2;}
      else if(status==='absent'){absentDays++;}
      const key=o.name+'|'+d;
      otPay+=otByOperatorDate[key]||0;
    });
    return {username:o.username,name:o.name,dailyWage:o.dailyWage||0,presentDays,halfDays,absentDays,basePay:Math.round(basePay*100)/100,otPay:Math.round(otPay*100)/100,total:Math.round((basePay+otPay)*100)/100};
  });

  const grandTotal=rows.reduce((s,r)=>s+r.total,0);

  const toCSV=()=>{
    const header=['Operator','Daily Wage','Present Days','Half Days','Absent Days','Base Pay','OT Pay','Total Pay'];
    const body=rows.map(r=>[r.name,r.dailyWage,r.presentDays,r.halfDays,r.absentDays,r.basePay,r.otPay,r.total]);
    const all=[header,...body,[],['','','','','','','Grand total',Math.round(grandTotal*100)/100]];
    const csv=all.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const el=document.createElement('a');
    el.href=url; el.download=`wage-register-${from}-to-${to}.csv`; el.click(); URL.revokeObjectURL(url);
  };

  return (
    <Modal onClose={onClose} title="Wage register" wide>
      <p className="modal-note">Base pay comes from attendance × daily wage. Overtime pay is auto-calculated whenever a completed shift exceeds its target: extra units ÷ units-per-hour rate = OT hours, paid at the operator's plain hourly rate (daily wage ÷ 8).</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:'1rem'}}>
        <div className="field" style={{marginBottom:0}}><label>From</label><input type="date" className="mi" value={from} onChange={e=>setFrom(e.target.value)}/></div>
        <div className="field" style={{marginBottom:0}}><label>To</label><input type="date" className="mi" value={to} onChange={e=>setTo(e.target.value)}/></div>
      </div>
      {!operators.length?<div className="empty">No operator accounts yet</div>:(
        <div className="pj-list">
          {rows.map(r=>(
            <div className="pj-row" key={r.username} style={{alignItems:'flex-start'}}>
              <div className="pj-info">
                <div className="pj-name">{r.name}</div>
                <div className="pj-meta">{r.presentDays}P · {r.halfDays}H · {r.absentDays}A &nbsp;·&nbsp; base ₹{r.basePay} + OT ₹{r.otPay}</div>
              </div>
              <div className="pj-target" style={{fontSize:13}}>₹{r.total}</div>
            </div>
          ))}
        </div>
      )}
      <div className="info-box success" style={{marginTop:'1rem',marginBottom:'1rem'}}>Grand total: <b>₹{Math.round(grandTotal*100)/100}</b> across {rows.length} operator{rows.length!==1?'s':''}, {days.length} day{days.length!==1?'s':''}</div>
      <button className="add-btn" style={{background:'var(--accent3)',color:'#000'}} onClick={toCSV}>↓ DOWNLOAD WAGE REGISTER (CSV)</button>
    </Modal>
  );
}


