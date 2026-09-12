'use strict';
(function(){
const input=JSON.parse(document.getElementById('releaseConfig').textContent);
const production=location.origin==='https://kukheehan98-lgtm.github.io'&&location.pathname.startsWith('/p_landing_p/');
const config={mode:production?'production':'simulation',endpoint:input.endpoint};
function track(name,data){if(production&&window.gtag)window.gtag('event',name,data||{});}
if(production&&input.ga){window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(input.ga);document.head.append(s);gtag('js',new Date());const from=(new URLSearchParams(location.search).get('from')||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40);gtag('config',input.ga,from?{campaign_source:from,campaign_medium:'referral'}:{});}
function prepareUI(){
 document.querySelector('.preview-note').hidden=true;
 document.querySelector('meta[name=robots]')?.remove();
 document.querySelector('#phone-help').textContent='010으로 시작하는 문자 수신 번호를 입력해주세요. 접수 시작 15분 전까지 신청할 수 있습니다.';
 document.querySelector('#test-failure').hidden=true;
 document.querySelector('#preview-form button[type=submit]').textContent='무료 알림 신청하기';
 document.querySelector('#basket-dialog .form-foot').textContent='담기는 신청 전 선택입니다. 이미 신청한 알림의 수신거부는 운영자에게 요청해주세요.';
 document.querySelector('.consent small').textContent='휴대폰 번호를 선택한 강좌의 접수 알림에 사용합니다. 수신거부 요청 또는 서비스 종료 시 파기합니다. 동의를 거부할 수 있으나 알림 신청은 이용할 수 없습니다.';
 document.querySelector('#success h2').textContent='알림 신청을 전송했어요';
 document.querySelector('#success p').innerHTML='<span id="integration-result"></span><br>실제 수강 신청은 기관 홈페이지에서 진행해주세요.';
 document.querySelector('footer a[href^="mailto:"]').textContent='알림 중지·개인정보 삭제 요청';
 document.querySelector('.data-note').textContent='기관 공고를 바탕으로 안내합니다. 최종 일정과 신청 조건은 기관 홈페이지에서 확인해주세요.';
 document.querySelector('footer>span').textContent='접수 알림은 기관의 수강 신청을 대신하지 않습니다.';
 const sections=[
 ['수집 항목 및 목적','휴대폰 번호, 선택한 강좌와 신청 시각을 접수 알림 제공에 사용합니다. 기존 신청자의 선택 입력 이름은 기존 기록에 남아 있을 수 있습니다.'],
 ['보유 및 이용 기간','수신거부 요청 또는 서비스 종료 시 파기합니다.'],
 ['처리 서비스','신청 정보는 Google Sheets에 저장하고, Google Apps Script와 SOLAPI를 통해 문자 알림을 처리합니다. 알림 처리에 필요한 정보만 사용합니다.'],
 ['방문 통계','Google Analytics를 이용해 방문과 강좌 선택 통계를 수집합니다. 이름·휴대폰 번호를 분석 이벤트에 넣지 않습니다. 브라우저 설정으로 쿠키를 차단할 수 있습니다.'],
 ['동의 거부와 수신거부','동의를 거부할 수 있으나 문자 알림 신청은 이용할 수 없습니다. 수신거부·열람·정정·삭제 요청은 petercat2004@daum.net으로 보내주세요.'],
 ['신청과 담기의 차이','담기 취소는 신청 전 목록에서 빼는 기능입니다. 이미 신청한 문자 알림은 운영자에게 수신거부를 요청해주세요.'],
 ['고지','처리방침 변경 시 시행일과 변경 내용을 이 화면에 알립니다. 디자인 전환 시 연락처 수집 화면과 처리 서비스 안내를 정리했습니다.']
 ];
 document.querySelectorAll('.privacy-preview').forEach(el=>{el.innerHTML='<summary>개인정보 및 이용 안내</summary>'+sections.map(x=>'<h3>'+x[0]+'</h3><p>'+x[1]+'</p>').join('');});
}
window.CulturePickRelease={config,track,prepareUI};
})();
