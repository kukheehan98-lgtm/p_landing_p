(function(root){'use strict';
function parseTime(s){if(!s)return NaN;const v=String(s).trim().replace(' ','T');return Date.parse(v.length===10?v+'T23:59:59+09:00':/Z$|[+-]\d\d:\d\d$/.test(v)?v:v+'+09:00');}
function eligible(p,now=Date.now()){return p&&Number.isFinite(parseTime(p.openAt))&&parseTime(p.openAt)-15*60000>now&&!(parseTime(p.deadline)<now)&&!(parseTime(p.eventEnd)<now)&&!(p.capacity>0&&p.enrolled>=p.capacity);}
function key(p){return p.id+'|'+p.openAt;}
function create(storage,prefix){
 function read(k,fallback){try{const v=JSON.parse(storage.getItem(prefix+k));return v??fallback;}catch{return fallback;}}
 function receipts(){const v=read('receipts',{});return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
 function status(p){return receipts()[key(p)]?.status||'';}
 function mark(p,status){const r=receipts();r[key(p)]={id:p.id,openAt:p.openAt,status,at:new Date().toISOString()};storage.setItem(prefix+'receipts',JSON.stringify(r));}
 return {status,mark,receipts};
}
function migrateLegacy(storage,programs,state){
 function read(k){try{const x=JSON.parse(storage.getItem(k)||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
 const queued=read('ontime.queue'),history=read('ontime.signups'),submitted=read('ontime.submitted');
 for(const record of history){for(const p of Array.isArray(record.programs)?record.programs:[]){if(p.id&&p.openAt&&!state.status(p))state.mark(p,'legacy');}}
 for(const id of submitted){const current=programs.find(p=>p.id===id);if(!current)continue;const known=history.some(r=>Array.isArray(r.programs)&&r.programs.some(p=>p.id===id));if(!known&&!state.status(current))state.mark(current,'legacy');}
 for(const record of queued){const list=Array.isArray(record.programs)?record.programs:[];for(const p of list){if(p.id&&p.openAt)state.mark(p,'uncertain');}if(!list.length){for(const id of record.likes||[]){const p=programs.find(x=>x.id===id);if(p)state.mark(p,'uncertain');}}}
 return {selected:read('ontime.likes').filter(id=>{const p=programs.find(x=>x.id===id);return p&&eligible(p)&&!state.status(p);}),pendingCount:queued.length};
}
const api={parseTime,eligible,key,create,migrateLegacy};if(typeof module==='object')module.exports=api;else root.SignupState=api;
})(typeof window==='object'?window:this);
