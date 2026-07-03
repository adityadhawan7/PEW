import { AC } from '../../constants.js';
import { initials } from '../../utils.js';

export default function Topbar({
  viewShift, setViewShift, clock, isAdmin, currentUser, onLogout,
  setShowOnline, setShowDownload, setShowBreakdownHistory, setShowProd,
  setShowAssign, setShowStock, setShowAttendance, setShowWageRegister, setShowUser,
}) {
  return (
    <div className="topbar">
      <div style={{display:'flex',alignItems:'center',gap:'1.25rem',minWidth:0,flexWrap:'wrap'}}>
        <div className="logo-mark"><div className="logo-dot"></div>FACTORY OS · DEV</div>
        <div className="shift-tabs">
          <div className="st-group">
            <button className={`st-tab t-day${viewShift==='day'?' active':''}`} onClick={()=>setViewShift('day')}><div className="dot"></div>CNC/VMC Day</button>
            <button className={`st-tab t-night${viewShift==='night'?' active':''}`} onClick={()=>setViewShift('night')}><div className="dot"></div>CNC/VMC Night</button>
          </div>
          <div className="st-divider"></div>
          <div className="st-group">
            <button className={`st-tab t-manual${viewShift==='manual'?' active':''}`} onClick={()=>setViewShift('manual')}><div className="dot"></div>Manual</button>
          </div>
        </div>
      </div>
      <div className="topbar-right">
        <div className="live-clock">{clock.toLocaleTimeString('en-IN',{hour12:false})}</div>
        <button className="icon-btn" onClick={()=>setShowOnline(true)}>Online</button>
        {isAdmin&&<button className="icon-btn" onClick={()=>setShowDownload(true)}>↓ Report</button>}
        {isAdmin&&<button className="icon-btn" onClick={()=>setShowBreakdownHistory(true)}>⚠ Breakdown history</button>}
        {isAdmin&&<button className="icon-btn" onClick={()=>setShowProd(true)}>Production jobs</button>}
        {isAdmin&&<button className="icon-btn" onClick={()=>setShowAssign(true)}>Assign jobs</button>}
        {isAdmin&&<button className="icon-btn" onClick={()=>setShowStock(true)}>Stock</button>}
        {isAdmin&&<button className="icon-btn" onClick={()=>setShowAttendance(true)}>Attendance</button>}
        {isAdmin&&<button className="icon-btn" onClick={()=>setShowWageRegister(true)}>Wages</button>}
        {currentUser.role==='admin'&&<button className="icon-btn" onClick={()=>setShowUser(true)}>Manage users</button>}
        <div className="user-badge">
          <div className="user-avatar" style={{background:AC[currentUser.role]||'#888'}}>{initials(currentUser.name)}</div>
          <span style={{fontSize:12}}>{currentUser.name} · {currentUser.role}</span>
        </div>
        <button className="icon-btn" onClick={onLogout}>Sign out</button>
      </div>
    </div>
  );
}
