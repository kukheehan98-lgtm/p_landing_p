'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,production=path.join(root,'../pohang-ontime'),preview=fs.existsSync(path.join(root,'../culturepick-preview'))?path.join(root,'../culturepick-preview'):production;
const port=Number(process.env.CP_TEST_PORT||4174),testPhone=process.env.CP_TEST_PHONE||'',live=/^010\d{8}$/.test(testPhone),liveAttempts=new Map();
const bind=process.env.CP_TEST_BIND||'127.0.0.1';if(live&&bind!=='127.0.0.1')throw Error('Live test must remain localhost-only');
const rows=new Map(),salt=crypto.randomBytes(32);let failNext=false;
const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/gallery.js':'gallery.js','/signup-adapter.js':'signup-adapter.js','/signup-state.js':'signup-state.js'};
function date(v){return Date.parse(v.replace(' ','T')+(v.length===10?'T23:59:59':'')+'+09:00');}
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
const server=http.createServer(async(req,res)=>{
res.setHeader('Cache-Control','no-store');const route=new URL(req.url,'http://127.0.0.1').pathname;
if(!['127.0.0.1:'+port,'localhost:'+port,bind+':'+port].includes(req.headers.host)){return json(res,403,{ok:false});}
if(req.method==='POST'){
if(!['http://127.0.0.1:'+port,'http://'+bind+':'+port].includes(req.headers.origin))return json(res,403,{ok:false,message:'외부 요청 차단'});
let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)return json(res,413,{ok:false});}
if(route==='/api/fail-next'){failNext=true;return json(res,200,{ok:true});}
if(route==='/api/live-test-signup'){
 if(!live)return json(res,403,{ok:false,message:'실제 시험 연결이 활성화되지 않았습니다.'});
 let fields,current,key;
 try{fields=Object.fromEntries(new URLSearchParams(raw));if(fields.phone!==testPhone)throw Error('지정한 본인 시험 번호만 가능합니다.');const list=JSON.parse(fields.programs);if(list.length!==1||list[0].id!==fields.likeIds)throw Error('한 강좌씩 신청해야 합니다.');current=JSON.parse(fs.readFileSync(path.join(production,'data/programs.json'),'utf8')).find(p=>p.id===fields.likeIds);if(!current||current.openAt!==list[0].openAt||!require('./signup-state.js').eligible(current))throw Error('현재 알림 신청이 가능한 강좌가 아닙니다.');key=current.id+'|'+current.openAt;}catch(e){return json(res,400,{ok:false,message:e.message});}
 if(liveAttempts.has(key))return json(res,409,{ok:false,uncertain:true,message:'이미 전송을 시도했습니다. 시트 확인 전에는 재전송하지 않습니다.'});
 if(liveAttempts.size)return json(res,409,{ok:false,message:'실제 시험은 한 강좌로 제한합니다.'});
 const html=fs.readFileSync(path.join(production,'index.html'),'utf8');const match=html.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/);if(!match)return json(res,500,{ok:false,message:'운영 신청 주소를 찾을 수 없습니다.'});
 liveAttempts.set(key,{status:'sending'});
 try{const response=await fetch(match[0],{method:'POST',body:new URLSearchParams(fields),signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok||data.ok!==true)throw Error('시트 저장 응답을 확인하지 못했습니다.');liveAttempts.set(key,{status:'acknowledged'});return json(res,200,{ok:true,mode:'live-test',duplicate:false});}catch(e){liveAttempts.set(key,{status:'uncertain'});return json(res,502,{ok:false,uncertain:true,message:'전송 후 저장 결과가 불확실합니다. 시트를 확인해야 합니다.'});}
}
if(route!=='/api/test-signup')return json(res,404,{ok:false});
if(failNext){failNext=false;return json(res,503,{ok:false,message:'의도적으로 만든 모의 저장 실패입니다. 선택을 유지했으니 다시 시도해주세요.'});}
try{const fields=Object.fromEntries(new URLSearchParams(raw));if(!/^010\d{8}$/.test(fields.phone))throw Error('번호 형식 오류');const p=JSON.parse(fields.programs);if(p.length!==1||p[0].id!==fields.likeIds)throw Error('강좌별 한 건 형식 오류');const current=JSON.parse(fs.readFileSync(path.join(production,'data/programs.json'),'utf8')).find(g=>g.id===p[0].id);if(!current||current.openAt!==p[0].openAt||date(current.openAt)<=Date.now()||date(current.deadline)<Date.now())throw Error('기관 자료의 접수 상태가 변경되었습니다.');const key=crypto.createHmac('sha256',salt).update(fields.phone+'|'+current.id+'|'+current.openAt).digest('hex');const duplicate=rows.has(key);const reminderAt=new Date(date(current.openAt)-15*60000).toISOString();rows.set(key,{id:current.id,title:current.title,phone:'010-****-****',reminderAt,mode:'simulation',actualSms:false});return json(res,200,{ok:true,duplicate,reminderAt,mode:'simulation'});}catch(e){return json(res,400,{ok:false,message:e.message});}}
if(req.method!=='GET')return json(res,405,{ok:false});
if(route==='/api/config')return json(res,200,{mode:live?'live-test':'simulation'});
if(route==='/api/status')return json(res,200,{mode:'simulation',externalSubmissionEnabled:live,liveAttempts:[...liveAttempts.values()],rows:[...rows.values()]});
if(route==='/metadata.json'){const html=fs.readFileSync(path.join(production,'index.html'),'utf8');const m=html.match(/id="sourceUpdatedAt">([\s\S]*?)<\/script>/);return json(res,200,{sources:m?JSON.parse(m[1]):{},mode:'local-production-files'});}
const candidateFiles=new Set(['index.html','app.js','style.css','signup-state.js','signup-adapter.js','gallery.js','release-runtime.js','favicon.svg','hero-family-v1.png','hero-father-daughter-v1.png','data/programs.json']);const candidateName=route==='/candidate/'?'index.html':route.startsWith('/candidate/')?route.slice(11):'';if(candidateFiles.has(candidateName)){const f=path.join(root,'candidate',candidateName);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]);return fs.createReadStream(f).on('error',()=>res.end()).pipe(res);}
let file=files[route]?path.join(root,files[route]):route==='/programs.json'?path.join(production,'data/programs.json'):['/hero-family-v1.png','/hero-father-daughter-v1.png'].includes(route)?path.join(preview,route.slice(1)):null;
if(!file)return json(res,404,{ok:false});res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'})[path.extname(file)]);fs.createReadStream(file).on('error',()=>res.end()).pipe(res);
});server.listen(port,bind,()=>console.log('Integration test: http://127.0.0.1:'+port+' ('+(live?'restricted live test':'simulation only')+')'));
