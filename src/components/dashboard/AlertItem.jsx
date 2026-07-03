export default function AlertItem({ a, isAdmin, removeAlert, setDecisionData, setSettingDecisionData }) {
  if(a.type==='shortfall'&&a.data){
    return (
      <div className="al-item shortfall" key={a.id}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',marginBottom:4}}>
          <span className="al-msg" style={{color:'var(--danger)'}}>⚠ Shortfall — {a.data.machine}</span>
          <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
            <span className="al-time">{a.time}</span>
            {isAdmin&&<button className="al-dismiss" onClick={()=>removeAlert(a.id)}>×</button>}
          </div>
        </div>
        <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text2)',lineHeight:1.8,marginBottom:6,width:'100%'}}>
          <div>Operator: <b style={{color:'var(--text)'}}>{a.data.operator}</b></div>
          <div>Job: <b style={{color:'var(--text)'}}>{a.data.job}</b></div>
          <div>Total: <b style={{color:'var(--danger)'}}>{a.data.produced}</b> / Target: <b style={{color:'var(--text)'}}>{a.data.target}</b> (–{a.data.shortfall})</div>
          {a.data.newPieces!==undefined&&<div>New: <b style={{color:'var(--text)'}}>{a.data.newPieces}</b> · Rework: <b style={{color:'var(--text)'}}>{a.data.reworkPieces}</b></div>}
          <div style={{marginTop:4,padding:'5px 7px',background:'var(--bg4)',borderRadius:'var(--r)',color:'var(--text)',fontFamily:'var(--font)',fontSize:11}}>"{a.data.reason}"</div>
        </div>
        {isAdmin&&a.data.status==='pending'?(
          <div style={{display:'flex',gap:5,width:'100%'}}>
            <button className="md-btn primary" style={{fontSize:10,padding:'6px 8px'}} onClick={()=>setDecisionData({alertId:a.id,decision:'approved'})}>✓ Approve</button>
            <button className="md-btn danger" style={{fontSize:10,padding:'6px 8px'}} onClick={()=>setDecisionData({alertId:a.id,decision:'disapproved'})}>✗ Disapprove</button>
          </div>
        ):a.data.status&&a.data.status!=='pending'?(
          <div style={{fontSize:10,fontFamily:'var(--mono)',color:a.data.status==='approved'?'var(--accent3)':'var(--danger)',lineHeight:1.6}}>
            {a.data.status==='approved'?'✓ Approved':'✗ Disapproved'} by {a.data.decidedBy}
            {a.data.decisionNote&&<div style={{color:'var(--text2)',fontFamily:'var(--font)',fontSize:11,marginTop:2}}>{a.data.decisionNote}</div>}
          </div>
        ):(!isAdmin&&<div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)'}}>Awaiting review</div>)}
      </div>
    );
  }
  if(a.type==='setting_review'&&a.data){
    const filledRows=(a.data.rows||[]).filter(r=>r.specification.trim()||r.piece1.trim()||r.piece2.trim());
    return (
      <div className="al-item" style={{borderLeft:'3px solid var(--warn)'}} key={a.id}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',marginBottom:4}}>
          <span className="al-msg" style={{color:'var(--warn)'}}>⚙ Setting inspection — {a.data.machine}</span>
          <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
            <span className="al-time">{a.time}</span>
            {isAdmin&&<button className="al-dismiss" onClick={()=>removeAlert(a.id)}>×</button>}
          </div>
        </div>
        <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text2)',lineHeight:1.8,marginBottom:6,width:'100%'}}>
          <div>Operator: <b style={{color:'var(--text)'}}>{a.data.operator}</b></div>
          <div>Shift: <b style={{color:'var(--text)'}}>{a.data.shiftKey==='night'?'Night':'Day'}</b></div>
          {filledRows.length?filledRows.map(r=>(
            <div key={r.sr} style={{marginTop:2}}>#{r.sr} {r.specification||'—'}: <b style={{color:'var(--text)'}}>{r.piece1||'—'}</b> / <b style={{color:'var(--text)'}}>{r.piece2||'—'}</b></div>
          )):<div style={{marginTop:2,color:'var(--text3)'}}>No rows filled in</div>}
        </div>
        {isAdmin&&a.data.status==='pending'?(
          <div style={{display:'flex',gap:5,width:'100%'}}>
            <button className="md-btn primary" style={{fontSize:10,padding:'6px 8px'}} onClick={()=>setSettingDecisionData({alertId:a.id,decision:'approved'})}>✓ Approve</button>
            <button className="md-btn danger" style={{fontSize:10,padding:'6px 8px'}} onClick={()=>setSettingDecisionData({alertId:a.id,decision:'disapproved'})}>✗ Reject</button>
          </div>
        ):a.data.status&&a.data.status!=='pending'?(
          <div style={{fontSize:10,fontFamily:'var(--mono)',color:a.data.status==='approved'?'var(--accent3)':'var(--danger)',lineHeight:1.6}}>
            {a.data.status==='approved'?'✓ Approved':'✗ Rejected'} by {a.data.decidedBy}
            {a.data.decisionNote&&<div style={{color:'var(--text2)',fontFamily:'var(--font)',fontSize:11,marginTop:2}}>{a.data.decisionNote}</div>}
          </div>
        ):(!isAdmin&&<div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)'}}>Awaiting review</div>)}
      </div>
    );
  }
  return (
    <div className={`al-item${a.type==='warn'?' warn':a.type==='info'?' info':''}`} key={a.id}>
      <div><div className="al-msg">{a.msg}</div><div className="al-time">{a.time}</div></div>
      {isAdmin&&<button className="al-dismiss" onClick={()=>removeAlert(a.id)}>×</button>}
    </div>
  );
}
