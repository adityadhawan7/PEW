import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Breakdown History Card ───────────────────────────────────
export default function BreakdownHistoryModal({alerts,machines,onClose}) {
  const [selM,setSelM]=useState('all');
  const uniqueMachines=Object.values(machines.reduce((acc,m)=>{ if(!acc[m.id]) acc[m.id]={id:m.id,name:m.name}; return acc; },{}));

  const rowsForMachine=machineName=>{
    const bds=alerts.filter(a=>a.data&&a.data.category==='breakdown'&&a.data.machine===machineName).slice().sort((a,b)=>new Date(a.ts)-new Date(b.ts));
    const rps=alerts.filter(a=>a.data&&a.data.category==='repair'&&a.data.machine===machineName).slice().sort((a,b)=>new Date(a.ts)-new Date(b.ts));
    const used=new Set();
    return bds.map((bd,i)=>{
      let matched=null;
      for(let j=0;j<rps.length;j++){
        if(used.has(j)) continue;
        if(new Date(rps[j].ts)>=new Date(bd.ts)){ matched=rps[j]; used.add(j); break; }
      }
      const hours=matched?((new Date(matched.ts)-new Date(bd.ts))/3600000):null;
      return {
        sr:i+1, date:bd.date, nature:bd.data.reason||'',
        action:matched?matched.data.reason:'', from:bd.time, to:matched?matched.time:'',
        hours:hours!==null?hours.toFixed(1):'', remarks:matched?'':'Breakdown ongoing'
      };
    });
  };

  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const buildCard=(machineName,machineId,rows,pageIdx,totalPages)=>{
    const MIN_ROWS=7;
    const dataRows=rows.map(r=>`
      <tr>
        <td style="text-align:center">${r.sr}</td>
        <td style="text-align:center">${esc(r.date)}</td>
        <td>${esc(r.nature)}</td>
        <td>${esc(r.action)}</td>
        <td style="text-align:center">${esc(r.from)}</td>
        <td style="text-align:center">${esc(r.to)}</td>
        <td style="text-align:center">${esc(r.hours)}</td>
        <td>${esc(r.remarks)}</td>
      </tr>`).join('');
    const blankCount=Math.max(0,MIN_ROWS-rows.length);
    const blankRows=Array.from({length:blankCount}).map(()=>`<tr>${Array.from({length:8}).map(()=>'<td>&nbsp;</td>').join('')}</tr>`).join('');
    return `
    <div class="card">
      <table class="hdr">
        <tr>
          <td class="logo" rowspan="6">P<span>E</span>W</td>
          <td class="company" rowspan="3">PUNJAB ENGINEERING WORKS<br/><span class="sub">(JAIPUR SOUTH)</span></td>
          <td class="dk">Doc. No.</td><td class="dv">PEW/MNT/F04</td>
        </tr>
        <tr><td class="dk">Page No.</td><td class="dv">Page ${pageIdx} of ${totalPages}</td></tr>
        <tr><td class="dk">Issue No.</td><td class="dv">01</td></tr>
        <tr>
          <td class="title" rowspan="3">Machine Breakdown Record<br/><span class="sub">(History Card)</span></td>
          <td class="dk">Issue Date</td><td class="dv">Apr. 01, 2021</td>
        </tr>
        <tr><td class="dk">Rev. No.</td><td class="dv">00</td></tr>
        <tr><td class="dk">Rev. Date</td><td class="dv">----</td></tr>
      </table>
      <div class="mline"><span>Name of Machine: <b>${esc(machineName)}</b></span><span>Identification No.: <b>${esc(machineId)}</b></span></div>
      <table class="main">
        <thead>
          <tr>
            <th rowspan="2" style="width:34px">S.<br/>No.</th>
            <th rowspan="2" style="width:80px">Date</th>
            <th rowspan="2">Nature of Breakdown</th>
            <th rowspan="2">Action taken</th>
            <th colspan="2">Breakdown time</th>
            <th rowspan="2" style="width:70px">Total Breakdown Hours</th>
            <th rowspan="2" style="width:90px">Remarks</th>
          </tr>
          <tr><th style="width:50px">From</th><th style="width:50px">To</th></tr>
        </thead>
        <tbody>${dataRows}${blankRows}</tbody>
      </table>
    </div>`;
  };

  const download=()=>{
    const targets=selM==='all'?uniqueMachines:uniqueMachines.filter(m=>m.id===selM);
    if(!targets.length) return;
    const cards=targets.map((m,i)=>buildCard(m.name,m.id,rowsForMachine(m.name),i+1,targets.length)).join('');
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Breakdown History Card</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;padding:24px;background:#fff}
      .card{border:5px solid #1565c0;padding:10px;max-width:1000px;margin:0 auto 24px;page-break-after:always}
      .card:last-child{page-break-after:auto}
      table.hdr{width:100%;border-collapse:collapse;margin-bottom:14px}
      table.hdr td{border:1px solid #000;padding:4px 8px;font-size:12px;vertical-align:middle}
      .logo{width:90px;text-align:center;font-size:26px;font-weight:bold;color:#1565c0;font-family:'Arial Black',sans-serif;letter-spacing:2px}
      .logo span{color:#000}
      .company{font-weight:bold;font-size:15px;text-align:center}
      .title{font-weight:bold;font-size:13px;text-align:center}
      .sub{font-weight:normal;font-size:12px}
      .dk{font-size:11px;width:80px}
      .dv{font-size:11px;width:130px}
      .mline{display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px;padding:0 4px}
      table.main{width:100%;border-collapse:collapse}
      table.main th,table.main td{border:1px solid #000;padding:6px;font-size:11px}
      table.main th{background:#f0f0f0;font-weight:bold;text-align:center}
      table.main td{height:26px;vertical-align:top}
      @media print{.card{page-break-after:always}}
    </style>
    </head><body>${cards}</body></html>`;
    const w=window.open('','_blank');
    if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),600);}
  };

  return (
    <Modal onClose={onClose} title="Breakdown history card">
      <p className="modal-note">Generates a printable Machine Breakdown Record (History Card), in the same format as your maintenance team's existing template, using the breakdown and repair entries logged in the app.</p>
      <div className="field"><label>Machine</label>
        <select className="mi" value={selM} onChange={e=>setSelM(e.target.value)}>
          <option value="all">— All machines (one card each) —</option>
          {uniqueMachines.map(m=><option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
        </select>
      </div>
      <button className="add-btn" style={{background:'var(--accent)',color:'#000'}} onClick={download}>↓ DOWNLOAD HISTORY CARD</button>
    </Modal>
  );
}

