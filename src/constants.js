export const MACHINES_SEED = [
  {id:'CNC-1',name:'CNC 1',type:'cnc',shift:'cnc_vmc'},
  {id:'CNC-2',name:'CNC 2',type:'cnc',shift:'cnc_vmc'},
  {id:'CNC-3',name:'CNC 3',type:'cnc',shift:'cnc_vmc'},
  {id:'VMC-1',name:'VMC 1',type:'vmc',shift:'cnc_vmc'},
  {id:'VMC-2',name:'VMC 2',type:'vmc',shift:'cnc_vmc'},
  {id:'MIL-1',name:'Milling M/C 1',type:'milling',shift:'manual'},
  {id:'MIL-2',name:'Milling M/C 2',type:'milling',shift:'manual'},
  {id:'MIL-3',name:'Milling M/C 3',type:'milling',shift:'manual'},
  {id:'DRL-1',name:'Drilling M/C 1',type:'drilling',shift:'manual'},
  {id:'DRL-2',name:'Drilling M/C 2',type:'drilling',shift:'manual'},
  {id:'DRL-3',name:'Drilling M/C 3',type:'drilling',shift:'manual'},
  {id:'DRL-4',name:'Drilling M/C 4',type:'drilling',shift:'manual'},
  {id:'DRL-5',name:'Drilling M/C 5',type:'drilling',shift:'manual'},
  {id:'DRL-6',name:'Drilling M/C 6',type:'drilling',shift:'manual'},
  {id:'DRL-7',name:'Drilling M/C 7',type:'drilling',shift:'manual'},
  {id:'DRL-8',name:'Drilling M/C 8',type:'drilling',shift:'manual'},
  {id:'LTH-1',name:'Lathe 1',type:'lathe',shift:'manual'},
  {id:'LTH-2',name:'Lathe 2',type:'lathe',shift:'manual'},
  {id:'LTH-3',name:'Lathe 3',type:'lathe',shift:'manual'},
  {id:'LTH-4',name:'Lathe 4',type:'lathe',shift:'manual'},
  {id:'ASM-1',name:'Assembly 1',type:'assembly',shift:'manual'},
  {id:'ASM-2',name:'Assembly 2',type:'assembly',shift:'manual'},
  {id:'DCK-1',name:'Dock Chuck',type:'dockchuck',shift:'manual'},
  {id:'BAL-1',name:'Balance 1',type:'balance',shift:'manual'},
  {id:'BAL-2',name:'Balance 2',type:'balance',shift:'manual'},
];

export const SHIFT_CFG = {
  day:   {label:'CNC / VMC — Day Shift',  time:'08:00 – 19:00',color:'#eab048',shiftKey:'cnc_vmc',check:h=>h>=8&&h<19},
  night: {label:'CNC / VMC — Night Shift',time:'20:00 – 07:00',color:'#8f96e8',shiftKey:'cnc_vmc',check:h=>h>=20||h<7},
  manual:{label:'Manual / Labour Shift',  time:'09:00 – 17:00',color:'#37c978',shiftKey:'manual', check:h=>h>=9&&h<17},
};

export const BADGE = {
  cnc:      {color:'#57a5ff',bg:'#57a5ff15',lbl:'CNC'},
  vmc:      {color:'#8f96e8',bg:'#8f96e815',lbl:'VMC'},
  milling:  {color:'#c678dd',bg:'#c678dd15',lbl:'MILLING'},
  drilling: {color:'#d9b84a',bg:'#d9b84a15',lbl:'DRILLING'},
  lathe:    {color:'#45c4a0',bg:'#45c4a015',lbl:'LATHE'},
  assembly: {color:'#f4794b',bg:'#f4794b15',lbl:'ASSEMBLY'},
  dockchuck:{color:'#9fb0f5',bg:'#9fb0f515',lbl:'DOCK CHUCK'},
  balance:  {color:'#e0c25a',bg:'#e0c25a15',lbl:'BALANCE'},
};

export const JOB_POOL = ['Shaft Batch #S1','Gear Profile #G4','Cam Cut #C7','Flange Set B','Drill Run #D3','Turn Series T2','Mill Block #M9','Plate Bend P1'];
export const AC = {admin:'#f4794b',supervisor:'#57a5ff',operator:'#37c978'};

export const DEFAULT_USERS = [
  {username:'admin',     password:'admin123',name:'Admin',     role:'admin',     shift:'day',    dailyWage:0},
  {username:'supervisor',password:'super123',name:'Supervisor',role:'supervisor',shift:'day',    dailyWage:0},
  {username:'operator1', password:'op123',   name:'Operator 1',role:'operator',  shift:'manual', dailyWage:500},
];

// A casting type is the raw cast-iron piece that arrives pre-cast from the foundry. It defines its
// own routing: an ordered, variable-length list of stages it must pass through before becoming a
// finished, sellable unit. Each stage names a MACHINE TYPE (not a specific machine) and carries its
// own target/rate/shiftHours, same shape as the old per-job fields, used for wage OT calculation.
export const DEFAULT_CASTING_TYPES = [];
