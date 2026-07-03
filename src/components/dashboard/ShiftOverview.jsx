import { SHIFT_CFG } from '../../constants.js';

export default function ShiftOverview({ viewShift, setViewShift, overviewCounts }) {
  return (
    <div>
      <div className="sec-hdr"><div className="sec-title">All shifts overview</div></div>
      <div className="shift-compare">
        <div className="sc-hdr"><div></div><div>Shift</div><div>Hours</div><div>Machines</div></div>
        {['day','night','manual'].map(s=>(
          <button key={s} className={`sc-row${viewShift===s?' active-view':''}`} onClick={()=>setViewShift(s)}>
            <div className="sc-dot" style={{background:SHIFT_CFG[s].color}}></div>
            <div className="sc-name">{SHIFT_CFG[s].label.replace(' Shift','').replace('CNC / VMC — ','CNC/VMC ').replace('Manual / Labour','Manual/Labour')}</div>
            <div className="sc-time">{SHIFT_CFG[s].time}</div>
            <div className="sc-count">{overviewCounts[s]} machines</div>
          </button>
        ))}
      </div>
    </div>
  );
}
