(function(root){
'use strict';
function fmtDT(s){if(!s)return '';const p=String(s).split(/[-\s:]+/);const day=new Date(Date.UTC(Number(p[0]),Number(p[1])-1,Number(p[2]))).getUTCDay();return p[1]+'.'+p[2]+'('+'일월화수목금토'[day]+')'+(p[3]?' '+p[3]+':'+p[4]:'');}
function programPayload(p){return {id:p.id,title:p.title,org:p.orgShort||p.org,openAt:p.openAt||'',deadline:p.deadline||'',applyPeriod:!p.openAt&&!p.deadline?'접수 없이 현장 관람':fmtDT(p.openAt)+' ~ '+fmtDT(p.deadline),capacity:p.capacity==null?'':p.capacity};}
function buildPayloads(entry,ref){const progs=entry.programs||[];return progs.length?progs.map(g=>({name:entry.name,phone:entry.phone,slot:entry.slot,likes:(g.openAt?g.openAt+' · ':'')+g.org+' · '+g.title,likeIds:g.id,programs:JSON.stringify([g]),at:entry.at,ref})): [{name:entry.name,phone:entry.phone,slot:entry.slot,likes:'',likeIds:'',programs:'[]',at:entry.at,ref}];}
async function submit(entry,ref,options={}){const results=[];for(const fields of buildPayloads(entry,ref)){const p=JSON.parse(fields.programs)[0],prior=options.state?.status(p);if(['confirmed','uncertain','sending'].includes(prior)){results.push({ok:prior==='confirmed',duplicate:true,uncertain:prior!=='confirmed'});continue;}
 options.state?.mark(p,'sending');
 try{const res=await fetch(options.endpoint||'/api/test-signup',{method:'POST',body:new URLSearchParams(fields)});const data=await res.json();if(!res.ok||!data.ok){options.state?.mark(p,data.uncertain?'uncertain':'failed');const error=Error(data.message||'저장 실패');error.handled=true;throw error;}options.state?.mark(p,'confirmed');results.push(data);}catch(error){if(!error.handled)options.state?.mark(p,'uncertain');error.results=results;throw error;}}
return results;}
const api={programPayload,buildPayloads,submit};if(typeof module==='object')module.exports=api;else root.SignupAdapter=api;
})(typeof window==='object'?window:this);
