import { useState, useEffect } from 'react';
import { fb } from '../../firebase.js';
import { todayStr, computeShiftPay, daysInMonth, aggregateDailyOutput, aggregateMachineEff, aggregateOperatorPerf, aggregateDefects, aggregateBreakdowns, aggregateMaintCost, aggregateFoundryScore } from '../../utils.js';

const daysAgoStr=n=>{ const d=new Date(); d.setDate(d.getDate()-n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// Horizontal bar row in the OutputChart idiom — label, filled track, value.
function BarRow({label,pct,color,value}){
  return (
    <div className="ob-row">
      <div className="ob-label" title={label}>{label}</div>
      <div className="ob-track"><div className="ob-fill" style={{width:`${Math.min(100,Math.max(0,pct))}%`,background:color}}></div></div>
      <div className="ob-pct" style={{width:'auto',minWidth:64}}>{value}</div>
    </div>
  );
}

// ── Analytics View ─────────────────────────────────────────
// Full-page trends from the durable logs (wage_log/stock_log/maintenance_log + alerts).
// All aggregation math is pure and unit-tested in utils.js — this component only renders.
export default function AnalyticsView({wageLog,stockLog,alerts,maintLog,machines,castingTypes}) {
  const [range,setRange]=useState('30'); // '7' | '30' | 'custom'
  const [customFrom,setCustomFrom]=useState(daysAgoStr(30));
  const [customTo,setCustomTo]=useState(todayStr());
  // Wages needed for the OT ₹ KPI — computed at read time like the wage register.
  const [users,setUsers]=useState([]);
  useEffect(()=>{ fb.listUserProfiles().then(setUsers); },[]);

  const from=range==='custom'?customFrom:daysAgoStr(Number(range)-1);
  const to=range==='custom'?customTo:todayStr();

  const daily=aggregateDailyOutput(wageLog,from,to);
  const machineEff=aggregateMachineEff(wageLog,from,to);
  const operatorPerf=aggregateOperatorPerf(wageLog,from,to);
  const defects=aggregateDefects(stockLog,from,to);
  const breakdowns=aggregateBreakdowns(alerts,from,to);
  const maintCost=aggregateMaintCost(maintLog,from,to);
  const foundryScore=aggregateFoundryScore(stockLog,from,to);
  const maxFoundryRate=Math.max(...foundryScore.map(f=>f.rate),1);

  const totalProduced=daily.reduce((s,d)=>s+d.produced,0);
  const totalTarget=daily.reduce((s,d)=>s+d.target,0);
  const avgEff=totalTarget>0?Math.round(totalProduced/totalTarget*100):0;
  const totalDefects=defects.reduce((s,d)=>s+d.castingDefects+d.machiningDefects,0);
  const totalConsumed=defects.reduce((s,d)=>s+d.consumed,0);
  const defectRate=totalConsumed>0?Math.round(totalDefects/totalConsumed*1000)/10:0;
  const totalBreakdowns=breakdowns.reduce((s,b)=>s+b.count,0);
  const totalMaintSpend=maintCost.reduce((s,m)=>s+m.cost,0);
  const userByUsername={}; users.forEach(u=>{userByUsername[u.username]=u;});
  // Effective per-day rate for OT purposes — monthly staff use salary/daysInMonth(that date),
  // same substitution as computeOperatorDayPay in utils.js.
  const otRateFor=e=>{
    const u=userByUsername[e.username];
    if(!u) return 0;
    return u.wageType==='monthly'?(u.monthlySalary||0)/daysInMonth(e.date):(u.dailyWage||0);
  };
  const totalOtPay=Math.round((wageLog||[]).reduce((s,e)=>{
    if(!e.date||e.date<from||e.date>to) return s;
    return s+computeShiftPay(e,otRateFor(e)).otPay;
  },0)*100)/100;

  const maxDaily=Math.max(...daily.map(d=>Math.max(d.produced,d.target)),1);
  const labelEvery=daily.length>14?Math.ceil(daily.length/10):1;
  const effColor=eff=>eff>=100?'var(--accent3)':eff>=80?'var(--warn)':'var(--danger)';
  const maxBreak=Math.max(...breakdowns.map(b=>b.count),1);
  const maxMaint=Math.max(...maintCost.map(m=>m.cost),1);

  return (
    <div className="content-area" style={{flex:1}}>
      <div className="sec-hdr">
        <div className="sec-title">Analytics — {from} to {to}</div>
        <div className="filter-row" style={{alignItems:'center'}}>
          <button className={`fbtn${range==='7'?' active':''}`} onClick={()=>setRange('7')}>Last 7 days</button>
          <button className={`fbtn${range==='30'?' active':''}`} onClick={()=>setRange('30')}>Last 30 days</button>
          <button className={`fbtn${range==='custom'?' active':''}`} onClick={()=>setRange('custom')}>Custom</button>
          {range==='custom'&&<>
            <input type="date" className="mi" style={{width:'auto',minHeight:30,padding:'2px 6px'}} value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/>
            <input type="date" className="mi" style={{width:'auto',minHeight:30,padding:'2px 6px'}} value={customTo} onChange={e=>setCustomTo(e.target.value)}/>
          </>}
        </div>
      </div>

      <div className="stats-row" style={{gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>
        <div className="stat-card s-run"><div className="stat-label">Produced</div><div className="stat-val c-green">{totalProduced}</div><div className="stat-sub">vs {totalTarget} target</div></div>
        <div className="stat-card s-eff"><div className="stat-label">Avg efficiency</div><div className="stat-val c-blue">{avgEff}%</div><div className="stat-sub">produced ÷ target</div></div>
        <div className="stat-card s-down"><div className="stat-label">Defects</div><div className="stat-val c-red">{totalDefects}</div><div className="stat-sub">{defectRate}% of {totalConsumed} processed</div></div>
        <div className="stat-card s-idle"><div className="stat-label">Breakdowns</div><div className="stat-val c-amber">{totalBreakdowns}</div><div className="stat-sub">from recent alerts</div></div>
        <div className="stat-card s-idle"><div className="stat-label">Maintenance</div><div className="stat-val c-amber">₹{totalMaintSpend}</div><div className="stat-sub">{maintCost.reduce((s,m)=>s+m.entries,0)} jobs</div></div>
        <div className="stat-card s-run"><div className="stat-label">Overtime paid</div><div className="stat-val c-green">₹{totalOtPay}</div><div className="stat-sub">at current wages</div></div>
      </div>

      <div>
        <div className="sec-hdr"><div className="sec-title">Daily output vs target</div></div>
        {totalProduced===0&&totalTarget===0?<div className="empty">No completed shifts in this range</div>:(
          <div style={{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r2)',padding:'12px 12px 4px'}}>
            <div style={{display:'flex',alignItems:'flex-end',gap:2,height:120}}>
              {daily.map(d=>(
                <div key={d.date} style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'flex-end',height:'100%',position:'relative'}} title={`${d.date}: ${d.produced} produced / ${d.target} target`}>
                  {d.target>0&&<div style={{position:'absolute',left:0,right:0,bottom:`${d.target/maxDaily*100}%`,borderTop:'1px dashed var(--text3)'}}></div>}
                  <div style={{height:`${d.produced/maxDaily*100}%`,background:d.produced>=d.target?'var(--accent3)':d.produced>0?'var(--warn)':'transparent',borderRadius:'2px 2px 0 0',minHeight:d.produced>0?2:0}}></div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:2,marginTop:4}}>
              {daily.map((d,i)=>(
                <div key={d.date} style={{flex:1,fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',textAlign:'center',overflow:'visible',whiteSpace:'nowrap'}}>
                  {i%labelEvery===0?d.date.slice(5):''}
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:'var(--text3)',padding:'6px 0 4px'}}>Green = met target · amber = below · dashed line = that day's total target</div>
          </div>
        )}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:'1.125rem'}}>
        <div>
          <div className="sec-hdr"><div className="sec-title">Machine efficiency</div></div>
          {!machineEff.length?<div className="empty">No shifts in range</div>:(
            <div className="ob-wrap">
              {machineEff.map(m=><BarRow key={m.machineId} label={m.machine} pct={m.eff} color={effColor(m.eff)} value={`${m.eff}% · ${m.shifts} sh`}/>)}
            </div>
          )}
        </div>

        <div>
          <div className="sec-hdr"><div className="sec-title">Operator performance</div></div>
          {!operatorPerf.length?<div className="empty">No shifts in range</div>:(
            <div className="ob-wrap">
              {operatorPerf.map(o=>(
                <div key={o.username}>
                  <BarRow label={o.operatorName} pct={o.eff} color={effColor(o.eff)} value={`${o.eff}% · ${o.shifts} sh`}/>
                  <div style={{fontSize:10,color:'var(--text3)',margin:'-2px 0 4px 88px'}}>
                    {o.produced}/{o.target} pcs{o.shortfalls>0&&<span style={{color:'var(--warn)'}}> · {o.shortfalls} shortfall{o.shortfalls>1?'s':''}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="sec-hdr"><div className="sec-title">Quality — defects by casting type</div></div>
          {!defects.length?<div className="empty">No production in range</div>:(
            <div className="ob-wrap">
              {defects.map(d=>{
                const total=d.castingDefects+d.machiningDefects;
                return (
                  <div key={d.itemId}>
                    <div className="ob-row">
                      <div className="ob-label" title={d.itemName}>{d.itemName}</div>
                      <div className="ob-track">
                        <div style={{display:'flex',height:'100%'}}>
                          <div style={{width:`${d.consumed>0?d.castingDefects/d.consumed*100:0}%`,background:'var(--danger)'}} title={`Casting defects: ${d.castingDefects}`}></div>
                          <div style={{width:`${d.consumed>0?d.machiningDefects/d.consumed*100:0}%`,background:'var(--warn)'}} title={`Machining defects: ${d.machiningDefects}`}></div>
                        </div>
                      </div>
                      <div className="ob-pct" style={{width:'auto',minWidth:64}}>{d.rate}% ({total})</div>
                    </div>
                    <div style={{fontSize:10,color:'var(--text3)',margin:'-2px 0 4px 88px'}}>
                      <span style={{color:'var(--danger)'}}>{d.castingDefects} casting</span> · <span style={{color:'var(--warn)'}}>{d.machiningDefects} machining</span> · {d.consumed} processed
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="sec-hdr"><div className="sec-title">Foundry scorecard — casting rejection by supplier</div></div>
          {!foundryScore.length?<div className="empty">No stock-ins or casting defects in range — record the foundry name when adding stock</div>:(
            <div className="ob-wrap">
              {foundryScore.map(f=>(
                <div key={f.supplier}>
                  <BarRow label={f.supplier} pct={f.rate/maxFoundryRate*100} color="var(--danger)" value={`${f.rate}% (${f.castingDefects})`}/>
                  <div style={{fontSize:10,color:'var(--text3)',margin:'-2px 0 4px 88px'}}>
                    supplied {f.supplied} pcs · {f.processed} processed{f.castingTypes.length?` · ${f.castingTypes.join(', ')}`:''}
                    {f.supplier==='(unspecified)'&&<span style={{color:'var(--warn)'}}> — record the foundry name when adding stock so these attribute correctly</span>}
                  </div>
                </div>
              ))}
              <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>Casting defects only (foundry's fault) — machining defects are excluded. Rate = defects ÷ pieces processed.</div>
            </div>
          )}
        </div>

        <div>
          <div className="sec-hdr"><div className="sec-title">Downtime & maintenance cost</div></div>
          {!breakdowns.length&&!maintCost.length?<div className="empty">No breakdowns or maintenance in range</div>:(
            <div className="ob-wrap">
              {breakdowns.map(b=><BarRow key={'b'+b.machine} label={b.machine} pct={b.count/maxBreak*100} color="var(--danger)" value={`${b.count} brkdn`}/>)}
              {maintCost.map(m=><BarRow key={'m'+m.machineId} label={m.machineName} pct={m.cost/maxMaint*100} color="var(--night)" value={`₹${m.cost}`}/>)}
              <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>Red = breakdown count (from the recent alert feed only) · purple = maintenance spend</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
