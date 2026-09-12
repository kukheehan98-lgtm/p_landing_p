const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {create,migrateLegacy}=require('./signup-state.js');
function memory(initial={}){const m=new Map(Object.entries(initial).map(([k,v])=>[k,JSON.stringify(v)]));return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};}
test('migration retains previous keys and detects uncertain queue',()=>{
 const p={id:'a',openAt:'2099-09-23 09:00'},q={id:'b',openAt:'2099-09-23 09:00'};
 const store=memory({'ontime.submitted':['a'],'ontime.signups':[{programs:[p]}],'ontime.queue':[{programs:[p]}],'ontime.likes':['a','b']});
 const before=store.getItem('ontime.queue');const state=create(store,'v2.');const m=migrateLegacy(store,[p,q],state);
 assert.equal(state.status(p),'uncertain');assert.deepEqual(m.selected,['b']);assert.equal(m.pendingCount,1);assert.equal(store.getItem('ontime.queue'),before);
});
test('old opening receipt does not suppress a changed schedule',()=>{
 const old={id:'a',openAt:'2099-09-23 09:00'},current={...old,openAt:'2099-09-24 09:00'};
 const store=memory({'ontime.submitted':['a'],'ontime.signups':[{programs:[old]}]});const state=create(store,'v2.');migrateLegacy(store,[current],state);assert.equal(state.status(current),'');assert.equal(state.status(old),'legacy');
});
test('crawler JSON block contract preserved exactly',()=>{
 const prod=fs.readFileSync('pohang-ontime/index.html','utf8'),candidate=fs.readFileSync(__dirname+'/candidate/index.html','utf8');
 for(const id of ['programsData','sourceUpdatedAt','dataUpdatedAt']){const marker='<script type="application/json" id="'+id+'">';function extract(s){const i=s.indexOf(marker);assert(i>=0);return s.slice(i,s.indexOf('</script>',i)+9);}assert.equal(extract(candidate),extract(prod));}
});
test('production transport preserves URL encoding and does not pretend opaque response verifies storage',async()=>{
 const calls=[],ctx={window:{},URLSearchParams,fetch:async(u,o)=>{calls.push({u,o});return {type:'opaque'};}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/candidate/signup-adapter.js','utf8'),ctx);
 const p={id:'a',openAt:'2099-09-23 09:00'},state=create(memory(),'v2.');const r=await ctx.window.SignupAdapter.submit({programs:[p]},'test',{state,endpoint:'https://example.invalid/mock',production:true});assert.equal(calls[0].o.mode,'no-cors');assert.equal(r[0].verified,false);assert.equal(state.status(p),'sent');
 await ctx.window.SignupAdapter.submit({programs:[p]},'test',{state,endpoint:'https://example.invalid/mock',production:true});assert.equal(calls.length,1);
});
test('release never activates external submission or analytics on localhost',()=>{
 const ctx={window:{},location:{origin:'http://127.0.0.1:4174',pathname:'/candidate/'},document:{getElementById:()=>({textContent:JSON.stringify({endpoint:'https://example.invalid',ga:'G-test'})})}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/release-runtime.js','utf8'),ctx);assert.equal(ctx.window.CulturePickRelease.config.mode,'simulation');assert.equal(ctx.window.gtag,undefined);
});
