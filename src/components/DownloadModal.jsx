import { useState } from 'react';
import Modal from './Modal.jsx';
import { todayStr } from '../utils.js';

// ── Download Report Modal ──────────────────────────────────
export default function DownloadModal({alerts,onClose}) {
  const [from,setFrom]=useState(todayStr());
  const [to,setTo]=useState(todayStr());
  const [groupBy,setGroupBy]=useState('all_machines');
  const [filterCat,setFilterCat]=useState('all');
  const [filterVal,setFilterVal]=useState('');

  const machineIds=[...new Set(alerts.filter(a=>a.data&&a.data.machine).map(a=>a.data.machine))].sort();
  const operatorNames=[...new Set(alerts.filter(a=>a.data&&a.data.operator).map(a=>a.data.operator))].sort();

  const baseFiltered=alerts.filter(a=>{
    const d=a.date||todayStr();
    if(d<from||d>to) return false;
    if(filterCat==='production') return a.data&&(a.data.category==='production'||a.data.category==='shortfall');
    if(filterCat==='shortfall') return a.type==='shortfall'||(a.data&&a.data.category==='shortfall');
    if(filterCat==='breakdown') return a.type==='danger'||(a.data&&a.data.category==='breakdown');
    return true;
  });

  const filtered=baseFiltered.filter(a=>{
    if(!filterVal) return true;
    if(groupBy==='per_machine') return a.data&&a.data.machine===filterVal;
    if(groupBy==='per_operator') return a.data&&a.data.operator===filterVal;
    return true;
  });

  const buildRows=()=>{
    const header=['Date','Time','Category','Machine','Operator','Job','Total Produced','New Pieces','Rework Pieces','Target','Shortfall','Reason','Decision','Decision Note','Decided By'];
    const rows=[header];
    filtered.forEach(a=>{
      if(!a.data) return;
      const cat=a.data.category||(a.type==='shortfall'?'shortfall':a.type==='danger'?'breakdown':'alert');
      rows.push([a.date||'',a.time||'',cat.charAt(0).toUpperCase()+cat.slice(1),a.data.machine||'',a.data.operator||'',a.data.job||'',a.data.produced??'',a.data.newPieces??'',a.data.reworkPieces??'',a.data.target??'',a.data.shortfall||'',a.data.reason||'',a.data.status&&a.data.status!=='pending'?a.data.status:'',a.data.decisionNote||'',a.data.decidedBy||'']);
    });
    return rows;
  };

  const buildSummary=()=>{
    const groups={};
    filtered.forEach(a=>{
      if(!a.data) return;
      const key=groupBy==='per_operator'?(a.data.operator||'Unknown'):(a.data.machine||'Unknown');
      if(!groups[key]) groups[key]={key,production:0,totalProduced:0,newPieces:0,reworkPieces:0,shortfalls:0,breakdowns:0,shortfallUnits:0};
      const g=groups[key];
      const cat=a.data.category||(a.type==='shortfall'?'shortfall':a.type==='danger'?'breakdown':'');
      if(cat==='production'||cat==='shortfall'){g.production++;g.totalProduced+=Number(a.data.produced)||0;g.newPieces+=Number(a.data.newPieces)||0;g.reworkPieces+=Number(a.data.reworkPieces)||0;}
      if(cat==='shortfall'){g.shortfalls++;g.shortfallUnits+=Number(a.data.shortfall)||0;}
      if(cat==='breakdown') g.breakdowns++;
    });
    const label=groupBy==='per_operator'?'Operator':'Machine';
    const header=[label,'Shifts Completed','Total Produced','New Pieces','Rework Pieces','Shortfall Shifts','Shortfall Units','Breakdowns'];
    const rows=[header];
    Object.values(groups).sort((a,b)=>a.key.localeCompare(b.key)).forEach(g=>{
      rows.push([g.key,g.production,g.totalProduced,g.newPieces,g.reworkPieces,g.shortfalls,g.shortfallUnits,g.breakdowns]);
    });
    return rows;
  };

  const toCSV=rows=>rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');

  const downloadCSV=()=>{
    const csv='SUMMARY\n'+toCSV(buildSummary())+'\n\nDETAIL\n'+toCSV(buildRows());
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const el=document.createElement('a');
    el.href=url; el.download=`factoryos-report-${from}-to-${to}.csv`; el.click(); URL.revokeObjectURL(url);
  };

  const downloadPDF=()=>{
    const detail=buildRows();
    const summary=buildSummary();
    const groupLabel={'all_machines':'All Machines','all_operators':'All Operators','per_machine':'Per Machine','per_operator':'Per Operator'}[groupBy];
    const catLabel={'all':'All','production':'Production','shortfall':'Shortfalls','breakdown':'Breakdowns'}[filterCat];
    const thS='background:#1f2330;color:#dde2ef;padding:6px 8px;text-align:left;border:1px solid #2e3445;font-family:monospace;font-size:10px';
    const tdS='padding:5px 8px;border:1px solid #2e3445;color:#dde2ef;vertical-align:top;font-size:11px';
    const makeTable=(rows,title)=>{
      if(rows.length<=1) return `<h3 style="font-family:monospace;font-size:11px;text-transform:uppercase;color:#7d849a;margin:0 0 8px">${title}</h3><p style="color:#7d849a;font-size:12px">No data</p>`;
      const [hdr,...data]=rows;
      return `<h3 style="font-family:monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7d849a;margin:0 0 8px">${title}</h3>
      <table style="border-collapse:collapse;width:100%;margin-bottom:28px">
        <thead><tr>${hdr.map(h=>`<th style="${thS}">${h}</th>`).join('')}</tr></thead>
        <tbody>${data.map((r,i)=>`<tr style="background:${i%2===0?'#111318':'#181b23'}">${r.map(v=>`<td style="${tdS}">${v??''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    };
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>FactoryOS Report</title>
    <style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body style="background:#0c0e13;color:#dde2ef;font-family:Barlow,sans-serif;padding:32px;margin:0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="width:8px;height:8px;border-radius:50%;background:#00c8f0"></div>
        <span style="font-family:monospace;font-size:12px;letter-spacing:.15em;color:#00c8f0">FACTORY OS — PRODUCTION REPORT</span>
      </div>
      <div style="font-size:11px;color:#7d849a;margin-bottom:4px;font-family:monospace">Period: ${from} to ${to}</div>
      <div style="font-size:11px;color:#7d849a;margin-bottom:28px;font-family:monospace">Group: ${groupLabel} · Category: ${catLabel}${filterVal?' · Filter: '+filterVal:''} · ${filtered.length} records</div>
      ${makeTable(summary,'Summary')}
      ${makeTable(detail,'Detail log')}
    </body></html>`;
    const w=window.open('','_blank');
    if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),600);}
  };

  const showFilter=groupBy==='per_machine'||groupBy==='per_operator';
  const filterOptions=groupBy==='per_machine'?machineIds:operatorNames;

  return (
    <Modal onClose={onClose} title="Download report" wide>
      <p className="modal-note">Select a date range, grouping, and category. Download as CSV (Excel/Sheets) or PDF.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:'1rem'}}>
        <div className="field" style={{marginBottom:0}}><label>From</label><input type="date" className="mi" value={from} onChange={e=>setFrom(e.target.value)}/></div>
        <div className="field" style={{marginBottom:0}}><label>To</label><input type="date" className="mi" value={to} onChange={e=>setTo(e.target.value)}/></div>
      </div>
      <div className="field">
        <label>Group by</label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          {[['all_machines','All Machines'],['all_operators','All Operators'],['per_machine','Per Machine'],['per_operator','Per Operator']].map(([v,l])=>(
            <div key={v} className={`role-chip${groupBy===v?' active':''}`} onClick={()=>{setGroupBy(v);setFilterVal('');}}>{l}</div>
          ))}
        </div>
      </div>
      {showFilter&&(
        <div className="field">
          <label>{groupBy==='per_machine'?'Select machine':'Select operator'}</label>
          <select className="mi" value={filterVal} onChange={e=>setFilterVal(e.target.value)}>
            <option value="">— All —</option>
            {filterOptions.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label>Category</label>
        <div className="role-chips">
          {[['all','All'],['production','Production'],['shortfall','Shortfalls'],['breakdown','Breakdowns']].map(([v,l])=>(
            <div key={v} className={`role-chip${filterCat===v?' active':''}`} onClick={()=>setFilterCat(v)}>{l}</div>
          ))}
        </div>
      </div>
      <div className="info-box neutral" style={{marginBottom:'1rem'}}>{filtered.length} record{filtered.length!==1?'s':''} found</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <button className="add-btn" style={{background:'var(--accent3)',color:'#000',opacity:filtered.length?1:0.4,padding:'10px'}} onClick={()=>{if(filtered.length)downloadCSV();}}>↓ EXCEL / CSV</button>
        <button className="add-btn" style={{background:'var(--accent)',color:'#000',opacity:filtered.length?1:0.4,padding:'10px'}} onClick={()=>{if(filtered.length)downloadPDF();}}>↓ PDF</button>
      </div>
    </Modal>
  );
}

