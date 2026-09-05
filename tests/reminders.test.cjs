const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../pohang-ontime/apps-script-reminders.js'), 'utf8');

function setup() {
  let now = Date.parse('2026-09-07T00:00:00Z');
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const properties = {SOLAPI_API_KEY:'dummy', SOLAPI_API_SECRET:'dummy', SOLAPI_FROM:'01000000000'};
  const sheets = new Map();
  const spreadsheet = {getSheetByName: n=>sheets.get(n), insertSheet: n=>{const s=sheet([]); sheets.set(n,s);return s;}, getSpreadsheetTimeZone:()=> 'Asia/Seoul'};
  const context = vm.createContext({Date: Clock, Logger:{log(){}}, Utilities: {
    formatDate(d) { const s = new Date(d.getTime()+9*3600000).toISOString(); return s.slice(5,10).replace('-','/')+' '+s.slice(11,16); },
    computeDigest: (_,v)=>[...crypto.createHash('sha256').update(v).digest()], DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'}
  }, PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null,setProperty:(k,v)=>properties[k]=v})},
  SpreadsheetApp:{openById:()=>spreadsheet, flush(){}}, LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  Session:{getScriptTimeZone:()=> 'Asia/Seoul'}, ScriptApp:{getProjectTriggers:()=>[],newTrigger(){throw Error('unexpected trigger creation');}},
  UrlFetchApp:{fetch(){throw Error('network disabled in test');}}
  });
  vm.runInContext(source,context);
  const job=(extra={})=>context.cp15Job_({phone:'01000000001',name:'시험',id:'program-a',title:'독서',openAt:'2026-09-07 10:00',...extra}, '운영');
  function sheet(values) {
    return {values, getLastRow:()=>values.length, setFrozenRows(){}, appendRow:r=>values.push(r),
      getRange(row,col,rows=1,cols=1) {return {
        getValues:()=>Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>values[row+i-1]?.[col+j-1]??'')),
        getValue:()=>values[row-1]?.[col-1]??'', setNumberFormat(){return this;},
        setValues(v) {v.forEach((r,i)=>{values[row+i-1]??=[];r.forEach((x,j)=>values[row+i-1][col+j-1]=typeof x==='string'&&x.startsWith("'")?x.slice(1):x);});return this;}
      };}
    };
  }
  function installData(programs,subscriptions) {
    context.cp15FetchPrograms_=()=>programs;
    const head=['接','締','강좌','기관','이름','휴대폰','때','발송여부','기간','강좌ID','시각'];
    sheets.set('발송목록',sheet([head,...subscriptions.map(s=>['','','','','시험',s.phone,'',s.state??'','',s.id,''])]));
  }
  return {c:context, job, properties, sheets, sheet, installData, setNow:v=>now=Date.parse(v)};
}

function provider(job, overrides={}) {
  let group=null, messages={}; const calls=[];
  const api=(method,path,body)=>{
    calls.push({method,path,body});
    if(overrides.before) overrides.before(method,path,body);
    let result;
    if(method==='post'&&path==='/groups') { group={groupId:'G4VTEST123',status:'PENDING',count:{total:0}}; result={...group}; }
    else if(method==='get'&&path==='/groups/G4VTEST123') result={...group};
    else if(method==='get'&&path.endsWith('/messages?limit=2')) result={messageList:{...messages}};
    else if(method==='put') {
      messages.M1={...body.messages[0],statusCode:'2000'};group.count.total=1;
      result={errorCount:0,resultList:[{statusCode:'2000'}]};
    } else if(method==='post'&&path.endsWith('/schedule')) {group.status='SCHEDULED';group.scheduledDate=body.scheduledDate;result={...group};}
    else if(method==='delete') {group.status='PENDING';group.scheduledDate=null;result={...group};}
    else throw Error('unexpected '+method+' '+path);
    return overrides.after ? overrides.after(method,path,body,result) : result;
  };
  return {api,calls,get group(){return group;},get messages(){return messages;}};
}
function drive(c,j,p,save=()=>{}) {c.cp15Drive_(j,true,save,p.api,new c.Date());}
const sub=(id='program-a',state='')=>({phone:'01000000001',name:'시험',id,state});
const program=(id='program-a',openAt='2026-09-07 10:00')=>({id,title:'독서',openAt});

for (const [open,send] of [
  ['2026-09-07 10:00','2026-09-07T00:45:00.000Z'],
  ['2026-09-07 10:30','2026-09-07T01:15:00.000Z'],
  ['2026-10-01 00:05','2026-09-30T14:50:00.000Z'],
  ['2027-01-01 00:00','2026-12-31T14:45:00.000Z'],
  ['2026-09-07T01:00:00Z','2026-09-07T00:45:00.000Z']
]) test('KST 15 minutes: '+open,()=>assert.equal(setup().job({openAt:open}).sendAt,send));
for(const invalid of ['','2026-09-07','2026-02-30 10:00','2026-09-31 10:00','2026-13-01 10:00','2026-09-07 25:00','2026-09-07 10:61','오늘 10시'])
  test('rejects ambiguous/invalid time '+invalid,()=>assert.equal(setup().c.cp15Date_(invalid),null));

test('per-program subscriptions and duplicate rows',()=>{const {c}=setup();const p=c.cp15Plan_([program(),program('b','2026-09-07 11:00')],[sub(),sub('b'),sub()],{});assert.equal(Object.keys(p).length,2);assert.equal(new Set(Object.values(p).map(j=>j.sendAt)).size,2);});
test('same opening time still retains every selected program',()=>{const {c}=setup();assert.equal(Object.keys(c.cp15Plan_([program(),program('b')],[sub(),sub('b')],{})).length,2);});
for(const state of ['취소','발송완료',true,'수신거부']) test('suppresses status '+state,()=>assert.equal(Object.keys(setup().c.cp15Plan_([program()],[sub('program-a',state)],{})).length,0));
test('a cancelled duplicate suppresses an active duplicate',()=>assert.equal(Object.keys(setup().c.cp15Plan_([program()],[sub(),sub('program-a','취소')],{})).length,0));
test('global opt-out and absent program are excluded',()=>{const {c}=setup();assert.equal(Object.keys(c.cp15Plan_([program()],[sub(),sub('missing')],{'01000000001':true})).length,0);});
test('reservation stores group before adding/scheduling; only one reservation',()=>{const {c,job}=setup();const j=job();let persisted='';const p=provider(j,{before:(m,u)=>{if(m==='put'||u.endsWith('/schedule'))assert.equal(persisted,'G4VTEST123');}});drive(c,j,p,()=>persisted=j.groupId);assert.equal(j.state,'예약');assert.equal(j.sentAt,'');drive(c,j,p);assert.equal(p.calls.filter(x=>x.path.endsWith('/schedule')).length,1);assert.equal(p.group.scheduledDate,'2026-09-07T00:45:00.000Z');});
test('lost schedule response is recovered by GET, never a second send',()=>{const {c,job}=setup();const j=job();let fail=true;const p=provider(j,{after:(m,u,b,r)=>{if(fail&&u.endsWith('/schedule')){fail=false;throw Error('connection lost');}return r;}});drive(c,j,p);assert.equal(j.state,'확인필요');drive(c,j,p);assert.equal(j.state,'예약');assert.equal(p.calls.filter(x=>x.method==='post'&&x.path.endsWith('/schedule')).length,1);});
test('lost add response recovers the same message without adding twice',()=>{const {c,job}=setup();const j=job();let fail=true;const p=provider(j,{after:(m,u,b,r)=>{if(fail&&m==='put'){fail=false;throw Error('connection lost');}return r;}});drive(c,j,p);drive(c,j,p);assert.equal(j.state,'예약');assert.equal(p.calls.filter(x=>x.method==='put').length,1);});
test('failed group persistence cannot schedule a message',()=>{const {c,job}=setup();const j=job();const p=provider(j);assert.throws(()=>drive(c,j,p,()=>{throw Error('write failure');}));assert.equal(p.calls.length,1);});
test('failed registration never schedules',()=>{const {c,job}=setup();const j=job();const p=provider(j,{after:(m,u,b,r)=>m==='put'?{errorCount:1,resultList:[{statusCode:'3040'}]}:r});drive(c,j,p);assert.equal(j.state,'확인필요');assert.equal(p.calls.some(x=>x.path.endsWith('/schedule')),false);});
test('past target never sends immediately',()=>{const {c,job,setNow}=setup();const j=job();setNow('2026-09-07T00:45:01Z');const p=provider(j);drive(c,j,p);assert.equal(j.state,'시각지남');assert.equal(p.calls.length,0);});
test('target passed during registration leaves an unsent pending group',()=>{const {c,job,setNow}=setup();const j=job();const p=provider(j,{after:(m,u,b,r)=>{if(m==='put')setNow('2026-09-07T00:45:01Z');return r;}});drive(c,j,p);assert.equal(j.state,'시각지남');assert.equal(p.group.status,'PENDING');});
test('removal cancels the provider reservation',()=>{const {c,job}=setup();const j=job();const p=provider(j);drive(c,j,p);c.cp15Drive_(j,false,()=>{},p.api,new c.Date());assert.equal(j.state,'취소');assert.equal(p.group.status,'PENDING');});
test('failed cancellation is retained and retried',()=>{const {c,job}=setup();const j=job();let fail=true;const p=provider(j,{before:(m)=>{if(m==='delete'&&fail){fail=false;throw Error('HTTP 500');}}});drive(c,j,p);c.cp15Drive_(j,false,()=>{},p.api,new c.Date());assert.equal(j.state,'확인필요');c.cp15Drive_(j,false,()=>{},p.api,new c.Date());assert.equal(j.state,'취소');});
test('provider time mismatch cancels before rescheduling',()=>{const {c,job}=setup();const j=job();const p=provider(j);drive(c,j,p);p.group.scheduledDate='2026-09-07T00:44:00Z';drive(c,j,p);assert.equal(j.state,'준비');assert.equal(p.group.status,'PENDING');drive(c,j,p);assert.equal(p.group.scheduledDate,j.sendAt);});
test('reservation is not considered delivery; final report required',()=>{const {c,job}=setup();const j=job();const p=provider(j);drive(c,j,p);assert.equal(j.state,'예약');p.group.status='COMPLETE';p.group.count={sentSuccess:1,sentFailed:0};p.group.dateSent=j.sendAt;drive(c,j,p);assert.equal(j.state,'발송완료');assert.equal(j.sentAt,j.sendAt);});
test('provider final failure is retained without resend',()=>{const {c,job}=setup();const j=job();const p=provider(j);drive(c,j,p);p.group.status='COMPLETE';p.group.count={sentSuccess:0,sentFailed:1};drive(c,j,p);assert.equal(j.state,'발송실패');const count=p.calls.length;drive(c,j,p);assert.equal(p.calls.length,count);});
test('different recipient or unaccepted message in existing group halts scheduling',()=>{const {c,job}=setup();const j=job();let fail=true;const p=provider(j,{after:(m,u,b,r)=>{if(m==='put'&&fail){fail=false;throw Error('lost');}return r;}});drive(c,j,p);p.messages.M1.to='01000000002';drive(c,j,p);assert.equal(j.state,'확인필요');assert.equal(p.calls.some(x=>x.path.endsWith('/schedule')),false);});
test('preview uses trusted program data and never calls SOLAPI',()=>{const {c,installData,sheets}=setup();installData([program()],[sub()]);c.cp15Api_=()=>{throw Error('must not call');};const result=c.십오분전미리보기();assert.equal(result.planned,1);assert.equal(sheets.get('15분전예약').values[1][7],'2026-09-07T00:45:00.000Z');c.십오분전미리보기();assert.equal(sheets.get('15분전예약').values.length,2);});
test('missing source schema fails closed',()=>{const {c}=setup();c.cp15FetchPrograms_=()=>[program()];assert.throws(()=>c.십오분전미리보기(),/발송목록/);});
test('empty/failed program feed does not cancel an existing reservation',()=>{const {c,job,sheets,sheet,installData}=setup();installData([program()],[sub()]);const j=job();j.state='예약';j.groupId='G4VTEST123';sheets.set('15분전예약',sheet([Array.from(c.CP15.headers),c.CP15.fields.map(k=>j[k])]));c.cp15FetchPrograms_=()=>{throw Error('data offline');};c.cp15Api_=()=>{throw Error('must not call');};assert.throws(()=>c.cp15Cycle_(true,false),/data offline/);assert.equal(sheets.get('15분전예약').values[1][1],'예약');});
test('disabled mode never reserves an unsent production job',()=>{const {c,installData,sheets}=setup();installData([program()],[sub()]);c.십오분전미리보기();c.cp15Api_=()=>{throw Error('must not call');};c.십오분전자동실행();assert.equal(sheets.get('15분전예약').values[1][1],'취소');});
test('cancellation uncertainty prevents replacement booking',()=>{const {c,job,installData,sheets,sheet}=setup();const old=job();old.state='예약';old.groupId='G4VTEST123';installData([program('program-a','2026-09-07 11:00')],[sub()]);sheets.set('15분전예약',sheet([Array.from(c.CP15.headers),c.CP15.fields.map(k=>old[k])]));const calls=[];c.cp15Api_=(m,u)=>{calls.push(m+' '+u);throw Error('provider offline');};c.cp15Cycle_(true,false);assert.equal(calls.length,1);assert.equal(sheets.get('15분전예약').values[2][9],'');assert.match(sheets.get('15분전예약').values[2][11],/이전 예약/);});
test('legacy immediate sender blocks while automatic reservations are enabled',()=>{const {c,properties}=setup();properties.CP15_ENABLED='true';vm.runInContext(fs.readFileSync(path.join(__dirname,'../pohang-ontime/crawler/apps-script-sender.js'),'utf8'),c);assert.throws(()=>c.보내기(),/중복 발송/);});

test('live append-only people sheet retains all per-program selections',()=>{const {c,sheets,sheet}=setup();sheets.set('신청자',sheet([['신청시각','이름','휴대폰','때','프로그램','찜 ID','유입'],['','시험',"'01000000001",'','','program-a|b',''],['','시험','01000000001','','','c','']]));const ss=c.SpreadsheetApp.openById('unused');assert.deepEqual(Array.from(c.cp15ReadSubscriptions_(ss),x=>x.id),['program-a','b','c']);});
test('existing configured sender can be reused without copying secrets',()=>{const {c,properties}=setup();delete properties.SOLAPI_API_KEY;delete properties.SOLAPI_API_SECRET;delete properties.SOLAPI_FROM;c.SOLAPI={apiKey:'existing-key',apiSecret:'existing-secret',from:'01000000000'};assert.equal(c.cp15Config_().key,'existing-key');});

test('preview cancelled during test mode can resume when production is enabled',()=>{const {c,installData,sheets}=setup();installData([program()],[sub()]);c.십오분전미리보기();c.십오분전자동실행();assert.equal(sheets.get('15분전예약').values[1][1],'취소');c.십오분전미리보기();assert.equal(sheets.get('15분전예약').values[1][1],'준비');assert.equal(sheets.get('15분전예약').values.length,2);});
