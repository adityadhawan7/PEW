import AlertItem from './AlertItem.jsx';
import { confirmDialog } from '../../confirmDialog.js';

export default function AlertsPanel({ alerts, isAdmin, removeAlert, clearAllAlerts, setDecisionData, setSettingDecisionData }) {
  return (
    <div className="sb-sec">
      <div className="row-between" style={{marginBottom:'.625rem'}}>
        <div className="sb-title" style={{marginBottom:0}}>Live alerts</div>
        {isAdmin&&alerts.length>0&&<button className="small-btn danger" onClick={async()=>{if(await confirmDialog('Clear all alerts?'))clearAllAlerts();}}>Clear all</button>}
      </div>
      {!alerts.length?<div className="empty">No alerts</div>:(
        <div className="alert-list">
          {alerts.map(a=>(
            <AlertItem
              key={a.id}
              a={a}
              isAdmin={isAdmin}
              removeAlert={removeAlert}
              setDecisionData={setDecisionData}
              setSettingDecisionData={setSettingDecisionData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
