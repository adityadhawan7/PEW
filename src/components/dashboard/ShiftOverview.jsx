import { SHIFT_CFG } from '../../constants.js';

export default function ShiftOverview({ viewShift, setViewShift, overviewCounts }) {
  return (
    <div>
      <div className="sec-hdr"><div className="sec-title">All shifts overview</div><div className="sc-hint">Tap a shift to view its floor</div></div>
      <div className="shift-compare">
        <div className="sc-hdr"><div></div><div>Shift</div><div>Hours</div><div>Machines</div></div>
        {['day','night','manual'].map(s=>(
          <button key={s} className={`sc-row${viewShift===s?' active-view':''}`} style={{'--sc':SHIFT_CFG[s].color}} onClick={()=>setViewShift(s)}>
            <div className="sc-dot"></div>
            <div className="sc-name">
              <span className="sc-name-t">{SHIFT_CFG[s].label.replace(' Shift','').replace('CNC / VMC — ','CNC/VMC ').replace('Manual / Labour','Manual/Labour')}</span>
              {viewShift===s&&<span className="sc-viewing">Viewing</span>}
            </div>
            <div className="sc-time">{SHIFT_CFG[s].time}</div>
            <div className="sc-count"><b>{overviewCounts[s]}</b> machines</div>
          </button>
        ))}
      </div>
    </div>
  );
}
