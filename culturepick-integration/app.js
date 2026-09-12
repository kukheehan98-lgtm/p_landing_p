/* Isolated integration: local mock submissions and selection IDs only; no external sends. */
'use strict';
let programs=[],audience='all',filter='all',renderedSignature='';
let integrationConfig={mode:'simulation'};let submissionState=SignupState.create(localStorage,'culturepick.integration.simulation.');
const selectionKey='culturepick.integration.likes.v1';
function readSelection(){try{const ids=JSON.parse(localStorage.getItem(selectionKey)||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];}catch{return [];}}
const selected=new Set(readSelection());
const $=s=>document.querySelector(s);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function at(value,end=false){if(!value)return NaN;const iso=String(value).trim().replace(' ','T');return Date.parse(iso.length===10?iso+(end?'T23:59:59+09:00':'T00:00:00+09:00'):/Z$|[+-]\d\d:\d\d$/.test(iso)?iso:iso+'+09:00');}
function phase(p,now=Date.now()){if(now>at(p.eventEnd,true)||now>at(p.deadline,true))return 'closed';if(now<at(p.openAt))return 'upcoming';if(p.capacity&&p.enrolled>=p.capacity)return p.waitCapacity>p.waitEnrolled?'waiting':'full';return p.openAt||p.deadline?'open':'always';}
function matches(p){const presets=p.presets||[];const target=p.target||'';const byAudience=audience==='all'||/누구나|전체/.test(target)||((audience==='kid'||audience==='elem')&&presets.includes(audience))||(audience==='family'&&/가족/.test(target))||(audience==='adult'&&/성인|일반|누구나|전체/.test(target));return byAudience&&(filter==='all'||['weekend','morning','outing'].includes(filter)&&presets.includes(filter)||filter==='upcoming'&&phase(p)==='upcoming'||filter==='small'&&p.capacity>0&&p.capacity<=12);}
function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'#';}catch{return '#';}}
// One abstract composition with category palettes; no implied venue or activity.
const cardPalettes={science:{label:'과학·천체',base:'#547e82',light:'#a8c3be',mid:'#709995',accent:'#d6ded0'},book:{label:'독서·문화',base:'#7b896b',light:'#c5cdb2',mid:'#9fac8c',accent:'#e1dcc5'},art:{label:'문화·전시',base:'#837d95',light:'#c8bfd6',mid:'#a19ab1',accent:'#dfd8cc'},other:{label:'기타 문화',base:'#9b8b74',light:'#d8cdb8',mid:'#bbab91',accent:'#e8dfcc'}};
// Category-matched gradients are rendered in CSS; no pattern artwork.
function cardArtwork(){return '';}
function essentialInfo(p,state){
const lines=[];
if(p.place)lines.push('<dt>장소</dt><dd>'+escapeHTML(p.place)+'</dd>');
if(state==='upcoming'&&p.deadline)lines.push('<dt>접수 마감</dt><dd>'+escapeHTML(p.deadline)+'</dd>');
if(state!=='upcoming'&&state!=='always'&&p.openAt)lines.push('<dt>접수 시작</dt><dd>'+escapeHTML(p.openAt)+'</dd>');
return lines.join('');
}
function applicationNote(p,state){
if(state==='always')return '방문 전 기관 공고에서 휴관일과 관람 시간을 확인해주세요.';
if(p.applyRule==='own-id')return '수강생 본인 ID로 신청하는 강좌입니다. 아이 강좌는 아이 계정을 미리 확인해주세요.';
if(p.applyRule==='guest-ok')return '비회원 신청이 가능한 강좌입니다. 자세한 조건은 기관 공고를 확인해주세요.';
return '기관 공고에서 회원가입·로그인 및 신청 자격을 미리 확인해주세요.';
}
function cardMarkup(p){
const state=phase(p),picked=selected.has(p.id),kind=/과학|천체/.test(p.title+p.org)?'science':/전시|기획전|미술/.test(p.title)?'art':/도서|독서|책/.test(p.title+p.org)?'book':'other';
const exhibition=/전시|기획전/.test(p.title+p.schedule);
const status={upcoming:'접수 예정',open:'접수 중',waiting:'대기 접수',always:exhibition?'전시 안내':'관람 안내'}[state];
const dateLabel=state==='upcoming'?'접수 시작':state==='always'?(exhibition?'전시 기간':'진행 기간'):state==='waiting'?'대기 접수 마감':'접수 마감';
const date=state==='upcoming'?p.openAt:state==='always'?(p.schedule||p.eventEnd):p.deadline;
const dateParts=state!=='always'&&date?String(date).split(' '):[];
const dateHTML=dateParts.length?'<strong>'+escapeHTML(dateParts[0].replace(/-/g,'.'))+'</strong><span class="card-time">'+escapeHTML(dateParts.slice(1).join(' '))+'</span>':'<strong>'+escapeHTML(date||'기관 안내 확인')+'</strong>';
const receipt=submissionState.status(p);const action=state==='upcoming'&&['confirmed','legacy','uncertain','sending'].includes(receipt)?'<button class="pick" disabled>'+(['confirmed','legacy'].includes(receipt)?'신청 기록 있음':['uncertain','sending'].includes(receipt)?'저장 확인 필요':'재시도 가능')+'</button>':state==='upcoming'&&!SignupState.eligible(p)?'<span class="pick">알림 접수 종료</span>':state==='upcoming'?`<button class="pick" data-pick="${escapeHTML(p.id)}" aria-pressed="${picked}">${picked?'✓ 담김':'알림 담기'}</button>`:`<a class="pick" href="${escapeHTML(safeURL(p.url))}" target="_blank" rel="noopener noreferrer">${state==='waiting'?'대기 신청 안내':state==='always'?(exhibition?'전시 안내':'관람 안내'):'기관에서 신청'} ↗</a>`;
return `<article class="card editorial-card" id="program-${escapeHTML(p.id)}" data-state="${state}"><div class="card-cover" data-kind="${kind}">${cardArtwork(kind,p.id)}<div class="cover-badges"><span class="state-badge state-${state}">${status}</span><span class="category-badge">${cardPalettes[kind].label}</span></div><div class="cover-title"><p>${escapeHTML(p.org)}</p><h3>${escapeHTML(p.title)}</h3></div></div><div class="card-body"><div class="card-decision"><div class="card-date"><span class="date-label">${dateLabel}</span>${dateHTML}</div>${action}</div><div class="card-meta"><span class="badge">${escapeHTML(p.fee||'기관 확인')}</span>${p.capacity?`<span>정원 ${p.capacity}${escapeHTML(p.unit||'명')}</span>`:''}${state==='always'?'<span>별도 접수 없음</span>':''}</div><dl>${essentialInfo(p,state)}<dt>대상</dt><dd>${escapeHTML(p.target||'기관 안내 확인')}</dd>${state!=='always'?`<dt>진행 일정</dt><dd>${escapeHTML(p.schedule||p.eventEnd||'기관 안내 확인')}</dd>`:''}</dl><p class="application-note">${escapeHTML(applicationNote(p,state))}</p>${state==='upcoming'?`<a class="official" href="${escapeHTML(safeURL(p.url))}" target="_blank" rel="noopener noreferrer">기관 상세 안내 ↗</a>`:''}</div></article>`;
}
function render(){const labels={all:'전체',kid:'유아',elem:'초등',family:'가족',adult:'어른'};const conditions={weekend:'주말',upcoming:'접수 예정',small:'소수 정원',morning:'오전',outing:'나들이'};$('#programs h2').textContent=(audience==='all'&&filter!=='all'?'':labels[audience]+' ')+(conditions[filter]?conditions[filter]+' ':'')+'프로그램';for(const id of selected){if(!programs.find(p=>p.id===id)||!SignupState.eligible(programs.find(p=>p.id===id)))selected.delete(id);}const visible=programs.filter(p=>!['closed','full'].includes(phase(p))&&matches(p));$('#count').textContent=visible.length+'개 프로그램';$('#cards').innerHTML=visible.length?visible.map(cardMarkup).join(''):'<div class="empty">이 조건에 맞는 프로그램이 아직 없어요.<br><small>다른 대상이나 조건을 선택해보세요.</small></div>';renderedSignature=programs.map(p=>phase(p)+SignupState.eligible(p)).join();updateSelection();}
function updateSelection(){try{localStorage.setItem(selectionKey,JSON.stringify([...selected]));}catch{}updateBasket();$('#selection-bar').hidden=!selected.size||$('#signup-dialog').open||$('#basket-dialog').open;$('#selected-count').textContent=selected.size+'개 담았어요';$('#selected-chips').innerHTML=[...selected].map(id=>{const p=programs.find(p=>p.id===id);return `<div class="chip"><span>${escapeHTML(p.title)}</span><button type="button" data-remove="${escapeHTML(id)}" aria-label="${escapeHTML(p.title)} 담기 취소">×</button></div>`;}).join('');}
$('.audiences').addEventListener('click',e=>{const b=e.target.closest('[data-audience]');if(!b)return;audience=b.dataset.audience;document.querySelectorAll('[data-audience]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
$('.filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
$('#cards').addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(!b)return;const id=b.dataset.pick;if(!SignupState.eligible(programs.find(p=>p.id===id))){render();return;}selected.has(id)?selected.delete(id):selected.add(id);b.setAttribute('aria-pressed',String(selected.has(id)));b.textContent=selected.has(id)?'✓ 담김':'알림 담기';updateSelection();});
$('#open-form').onclick=()=>{render();if(!selected.size)return;$('#form-content').hidden=false;$('#success').hidden=true;$('#form-error').textContent='';$('#signup-dialog').showModal();$('#close-form').focus();updateSelection();};
$('#close-form').onclick=()=>$('#signup-dialog').close();
$('#signup-dialog').addEventListener('close',()=>{$('#preview-form').reset();updateSelection();});
$('#selected-chips').onclick=e=>{const b=e.target.closest('[data-remove]');if(!b)return;selected.delete(b.dataset.remove);render();if(!selected.size)$('#signup-dialog').close();};
let submitting=false;$('#signup-dialog').addEventListener('cancel',e=>{if(submitting)e.preventDefault();});
$('#preview-form').onsubmit=async e=>{e.preventDefault();if(submitting)return;const before=selected.size;render();if(!selected.size||before!==selected.size){$('#form-error').textContent='접수 상태가 바뀐 강좌가 있어요. 다시 확인해주세요.';return;}
const phone=$('#phone').value.replace(/\D/g,'');if(!/^010\d{8}$/.test(phone)){$('#form-error').textContent='010으로 시작하는 11자리 번호를 입력해주세요.';return;}if(!$('#consent').checked)return;
submitting=true;const btn=$('#preview-form button[type=submit]');btn.disabled=true;$('#close-form').disabled=true;document.querySelectorAll('[data-remove]').forEach(b=>b.disabled=true);$('#form-error').textContent='';
const entry={name:'(미입력)',phone,slot:'미선택',at:new Date().toISOString(),programs:[...selected].map(id=>SignupAdapter.programPayload(programs.find(p=>p.id===id)))};
try{const results=await SignupAdapter.submit(entry,location.href,{state:submissionState,endpoint:integrationConfig.mode==='live-test'?'/api/live-test-signup':'/api/test-signup'});if(results.some(r=>r.uncertain))throw Error('저장 여부 확인이 필요한 강좌가 있습니다. 중복 방지를 위해 재전송하지 않았습니다.');$('#integration-result').textContent=results.length+'개 강좌 '+(integrationConfig.mode==='live-test'?'실제 신청 응답 확인':'모의 저장 확인')+' · '+results.filter(r=>r.duplicate).length+'건 중복 방지';$('#preview-form').reset();selected.clear();$('#form-content').hidden=true;$('#success').hidden=false;render();$('#back-to-list').focus();}catch(error){const unknown=[...selected].some(id=>['uncertain','sending'].includes(submissionState.status(programs.find(p=>p.id===id))));$('#form-error').textContent=unknown?'저장 결과를 확인하지 못했습니다. 중복 신청을 막기 위해 재전송을 보류했습니다. 운영 시트 확인이 필요합니다.':error.message||'저장 실패. 다시 시도해주세요.';}finally{submitting=false;btn.disabled=false;$('#close-form').disabled=false;document.querySelectorAll('[data-remove]').forEach(b=>b.disabled=false);}
};
$('#test-failure').onclick=async()=>{const r=await fetch('/api/fail-next',{method:'POST'});$('#form-error').textContent=r.ok?'다음 저장을 실패시킵니다. 모의 저장 버튼을 눌러 확인하세요.':'실패 시험 준비 오류';};
$('#back-to-list').onclick=()=>$('#signup-dialog').close();
function updateBasket(){
$('#basket-count').textContent=String(selected.size);
$('#open-basket').setAttribute('aria-label','담은 강좌 '+selected.size+'개 보기');
$('#basket-empty').hidden=selected.size>0;
$('#basket-next').hidden=!selected.size;
$('#basket-items').innerHTML=[...selected].map(id=>{const p=programs.find(p=>p.id===id);return `<article class="basket-item"><div><h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.org)}</p><span>접수 시작 ${escapeHTML(p.openAt)}</span></div><button type="button" data-basket-remove="${escapeHTML(id)}" aria-label="${escapeHTML(p.title)} 담기 취소">삭제</button></article>`;}).join('');
}
$('#open-basket').onclick=()=>{render();$('#basket-dialog').showModal();$('#close-basket').focus();updateSelection();};
$('#close-basket').onclick=()=>$('#basket-dialog').close();
$('#basket-dialog').addEventListener('close',updateSelection);
$('#basket-browse').onclick=()=>{$('#basket-dialog').close();$('#programs').scrollIntoView({behavior:'smooth'});};
$('#basket-next').onclick=()=>{render();if(!selected.size)return;$('#basket-dialog').close();$('#open-form').click();};
$('#basket-items').onclick=e=>{const b=e.target.closest('[data-basket-remove]');if(!b)return;selected.delete(b.dataset.basketRemove);render();const next=$('#basket-items button');(next||$('#basket-browse')).focus();};
fetch('/api/config').then(r=>r.json()).then(c=>{integrationConfig=c;submissionState=SignupState.create(localStorage,'culturepick.integration.'+c.mode+'.');if(c.mode==='live-test'){$('.preview-note').textContent='실제 연결 시험 · 지정 번호만 신청 가능';$('#phone-help').textContent='지정하신 본인 번호로만 실제 시트 저장을 시험합니다.';$('#test-failure').hidden=true;$('#basket-dialog .form-foot').textContent='실제 연결 시험 · 지정 번호 한 건';$('#preview-form button[type=submit]').textContent='실제 신청 연결 시험';document.querySelectorAll('.privacy-preview').forEach(el=>el.hidden=true);$('.consent small').textContent='기존 운영 Google 시트에 시험 신청이 저장됩니다. 문자 시험은 지정 번호로만 진행합니다.';$('#success h2').textContent='신청 응답을 확인했어요';$('#success p').innerHTML='<span id="integration-result"></span><br>실제 시트 기록과 문자 예약은 별도로 확인합니다.';}return fetch('programs.json');}).then(r=>{if(!r.ok)throw Error('data');return r.json();}).then(data=>{programs=data;restoreLinks();render();renderSources();fetch('metadata.json').then(r=>r.json()).then(m=>{$('.snapshot').textContent='기관 자료 기준 · '+Object.entries(m.sources).map(([k,v])=>({'phlib':'포항시립도서관','gbelib-yi':'경상북도교육청 영일도서관','gsei':'경상북도교육청과학원','phcf':'포항문화재단'}[k]||k)+': '+v).join(' / ');});}).catch(()=>{$('#cards').innerHTML='<p class="empty">자료를 불러오지 못했어요. 미리보기 주소로 다시 열어주세요.</p>';});
async function refreshData(){if(!programs.length||submitting||$('#signup-dialog').open||$('#basket-dialog').open)return;let changed=false;try{const r=await fetch('programs.json',{cache:'no-store'});if(r.ok){const next=await r.json();if(Array.isArray(next)&&next.length){changed=JSON.stringify(next)!==JSON.stringify(programs);programs=next;}}}catch{}const current=programs.map(p=>phase(p)+SignupState.eligible(p)).join();if(changed||renderedSignature!==current||[...selected].some(id=>!SignupState.eligible(programs.find(p=>p.id===id))))render();}
setInterval(refreshData,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshData();});










function renderSources(){const orgs=[...new Set(programs.map(p=>p.org).filter(Boolean))];$('#source-list').textContent=orgs.join(' · ');}

function restoreLinks(){const q=new URLSearchParams(location.search),preset=q.get('preset');if(['kid','elem'].includes(preset))audience=preset;else if(['weekend','small'].includes(preset))filter=preset;else if(preset==='outing')filter='outing';else if(preset==='morning')filter='morning';if(['morning','outing'].includes(filter)&&!document.querySelector('[data-filter='+filter+']')){const b=document.createElement('button');b.type='button';b.dataset.filter=filter;b.textContent=filter==='morning'?'오전':'나들이';$('.filters').append(b);}document.querySelectorAll('[data-audience]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.audience===audience)));document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));if(q.get('open'))requestAnimationFrame(()=>{const card=document.getElementById('program-'+q.get('open'));if(card){card.scrollIntoView();card.classList.add('deep-target');}else{$('.application-tip').textContent='이 링크의 프로그램은 마감되었거나 현재 목록에 없습니다. 다른 프로그램을 확인해주세요.';}});}
