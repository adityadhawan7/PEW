import { isActive } from '../../utils.js';

export default function ShiftBanner({ viewShift, cfg }) {
  return (
    <div className="shift-banner" style={{borderBottomColor:`${cfg.color}25`}}>
      <div className="sb-dot" style={{background:cfg.color,boxShadow:`0 0 6px ${cfg.color}`}}></div>
      <span style={{fontWeight:500,color:cfg.color}}>{cfg.label}</span>
      <span style={{color:'var(--text2)'}}>{cfg.time}</span>
      <span className="sb-status" style={{color:isActive(viewShift)?'var(--accent3)':'var(--text3)'}}>{isActive(viewShift)?'ACTIVE NOW':'NOT ACTIVE'}</span>
    </div>
  );
}
