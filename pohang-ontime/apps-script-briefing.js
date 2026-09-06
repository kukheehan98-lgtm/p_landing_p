/* 컬처픽 — 매일 아침 운영 브리핑 메일 (Apps Script V8)
 *
 * 접수15분전예약.gs 와 같은 프로젝트에 설치합니다. CP15 설정과 도우미 함수를
 * 그대로 함께 씁니다(같은 프로젝트의 파일은 서로를 부를 수 있습니다).
 *
 * 왜 만드나 — 이 서비스에서 잘못될 수 있는 것들은 대부분 "조용히" 잘못됩니다.
 * 잔액이 떨어져도, 크롤러가 막혀도, 발송이 실패해도 아무도 알려주지 않고
 * 시트에만 흔적이 남습니다. 매일 시트를 열어보는 대신 메일이 찾아오게 합니다.
 *
 * 설치: 브리핑시험() 로 한 번 받아보고 → 브리핑설치() 로 매일 아침 예약.
 */
var BRIEF = {
  to: 'ddak1998@naver.com',
  lowBalance: 2000,   // 이 아래면 제목에 경고를 붙입니다
  hour: 7             // 매일 이 시각대(7~8시)에 보냅니다
};

/* ══════════════ 실행 진입점 ══════════════ */

// 지금 한 통 받아봅니다. 트리거를 만들지 않습니다.
function 브리핑시험() {
  return 아침브리핑();
}

// 매일 아침 자동 발송을 켭니다.
function 브리핑설치() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === '아침브리핑') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('아침브리핑').timeBased().atHour(BRIEF.hour).everyDays(1).create();
  Logger.log('매일 아침 ' + BRIEF.hour + '시경 ' + BRIEF.to + ' 로 브리핑을 보냅니다.');
}

// 자동 발송을 멈춥니다. 알림 문자 발송에는 영향이 없습니다.
function 브리핑중지() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === '아침브리핑') { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('브리핑 트리거 ' + n + '개를 해제했습니다.');
}

/* ══════════════ 브리핑 본체 ══════════════ */

function 아침브리핑() {
  var ss = SpreadsheetApp.openById(CP15.spreadsheetId);
  var now = new Date();
  var today = brf_(now, 'yyyy-MM-dd');

  /* 한 항목이 실패해도 나머지는 보냅니다 — 브리핑이 안 오는 게 가장 나쁩니다.
     실패한 항목은 메일에 「확인 못 함」으로 적힙니다. */
  var jobs      = brfTry_(function () { return brfJobs_(ss); }, []);
  var signups   = brfTry_(function () { return brfSignups_(ss); }, null);
  var programs  = brfTry_(function () { return cp15FetchPrograms_(); }, null);
  var balance   = brfTry_(function () { return brfBalance_(); }, null);
  var freshness = brfTry_(function () { return brfFreshness_(); }, null);

  var todaySend = jobs.filter(function (j) {
    return j.sendAt && !brfDone_(j.state) && brf_(new Date(j.sendAt), 'yyyy-MM-dd') === today;
  });
  var sentToday = jobs.filter(function (j) {
    return j.sentAt && brf_(new Date(j.sentAt), 'yyyy-MM-dd') === today;
  });
  var trouble = jobs.filter(function (j) {
    return j.state === '확인필요' || j.state === '발송실패';
  });
  var opensToday = (programs || []).filter(function (p) {
    var d = cp15Date_(p.openAt);
    return d && brf_(d, 'yyyy-MM-dd') === today;
  });

  var lowCash = balance !== null && balance.balance < BRIEF.lowBalance;
  var stale   = freshness !== null && freshness !== today;

  MailApp.sendEmail({
    to: BRIEF.to,
    subject: brfSubject_(now, trouble, lowCash, stale, todaySend, signups),
    htmlBody: brfBody_(now, {
      todaySend: todaySend, sentToday: sentToday, trouble: trouble,
      opensToday: opensToday, signups: signups, balance: balance,
      freshness: freshness, today: today, stale: stale, lowCash: lowCash
    })
  });
  Logger.log('브리핑을 보냈습니다 → ' + BRIEF.to);
}

/* 제목만 보고 열어볼지 정할 수 있어야 합니다.
   문제가 있으면 무엇이 문제인지까지 제목에 넣습니다. */
function brfSubject_(now, trouble, lowCash, stale, todaySend, signups) {
  var day = brf_(now, 'M/d');
  var alerts = [];
  if (trouble.length) alerts.push('확인필요 ' + trouble.length + '건');
  if (lowCash)        alerts.push('잔액 부족');
  if (stale)          alerts.push('강좌정보 지연');
  if (alerts.length) return '⚠️ [컬처픽] ' + day + ' — ' + alerts.join(' · ');

  var parts = ['오늘 문자 ' + todaySend.length + '건'];
  if (signups && signups.recent) parts.push('신규 ' + signups.recent + '명');
  return '[컬처픽] ' + day + ' · ' + parts.join(' · ');
}

function brfBody_(now, d) {
  var h = [];
  h.push('<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
         'max-width:520px;font-size:15px;line-height:1.7;color:#0f172a">');
  h.push('<h2 style="font-size:19px;margin:0 0 4px">컬처픽 ' + brf_(now, 'M월 d일') + ' 브리핑</h2>');
  h.push('<p style="margin:0 0 20px;color:#64748b;font-size:13px">' + brf_(now, 'yyyy-MM-dd HH:mm') + ' 기준</p>');

  if (d.trouble.length) {
    h.push(brfBox_('⚠️ 확인이 필요합니다', d.trouble.map(function (j) {
      return brfEsc_(j.title || j.id) + ' — <b>' + brfEsc_(j.state) + '</b><br>' +
             '<span style="color:#64748b;font-size:13px">' + brfEsc_(j.result || '') + '</span>';
    }).join('<br><br>'), '#fef2f2', '#fecaca'));
  }

  h.push(brfSection_('오늘 나갈 문자', d.todaySend.length + '건',
    d.todaySend.length
      ? d.todaySend.map(function (j) {
          return '<b>' + brf_(new Date(j.sendAt), 'HH:mm') + '</b> · ' + brfEsc_(j.title) +
                 ' <span style="color:#64748b">(' + brfEsc_(j.state) + ')</span>';
        }).join('<br>')
      : '<span style="color:#94a3b8">없습니다</span>'));

  if (d.sentToday.length) {
    h.push(brfSection_('오늘 이미 나간 문자', d.sentToday.length + '건',
      d.sentToday.map(function (j) {
        return brf_(new Date(j.sentAt), 'HH:mm') + ' · ' + brfEsc_(j.title) +
               ' <span style="color:#64748b">(' + brfEsc_(j.state) + ')</span>';
      }).join('<br>')));
  }

  h.push(brfSection_('오늘 접수 열리는 강좌', d.opensToday === null ? '' : d.opensToday.length + '건',
    d.opensToday === null
      ? '<span style="color:#94a3b8">확인 못 함</span>'
      : (d.opensToday.length
          ? d.opensToday.map(function (p) {
              var seat = p.capacity ? ' · 정원 ' + p.capacity + (p.unit || '명') : '';
              return '<b>' + brfEsc_(String(p.openAt).slice(11, 16)) + '</b> · ' +
                     brfEsc_(p.title) + '<span style="color:#64748b">' + brfEsc_(seat) + '</span>';
            }).join('<br>')
          : '<span style="color:#94a3b8">없습니다</span>')));

  h.push(brfSection_('신규 신청 (최근 24시간)',
    d.signups ? d.signups.recent + '명' : '',
    d.signups
      ? '누적 <b>' + d.signups.total + '명</b>' +
        (d.signups.recent ? '<br><span style="color:#64748b;font-size:13px">' +
          brfEsc_(d.signups.names.join(', ')) + '</span>' : '')
      : '<span style="color:#94a3b8">확인 못 함</span>'));

  h.push(brfSection_('문자 잔액', '',
    d.balance === null
      ? '<span style="color:#94a3b8">확인 못 함</span>'
      : '<b' + (d.lowCash ? ' style="color:#dc2626"' : '') + '>' +
        brfWon_(d.balance.balance) + '원</b>' +
        ' <span style="color:#64748b">(LMS 약 ' + Math.floor(d.balance.balance / 45) + '건)</span>' +
        (d.lowCash ? '<br><span style="color:#dc2626;font-size:13px">충전이 필요합니다 — ' +
          '잔액이 떨어지면 문자가 조용히 실패합니다</span>' : '')));

  h.push(brfSection_('강좌 정보 기준일', '',
    d.freshness === null
      ? '<span style="color:#94a3b8">확인 못 함</span>'
      : d.freshness + (d.stale
          ? ' <span style="color:#dc2626">— 오늘 갱신 안 됨. 수집이 막혔을 수 있습니다</span>'
          : ' <span style="color:#16a34a">✓ 최신</span>')));

  h.push('<p style="margin:24px 0 0;padding-top:14px;border-top:1px solid #e2e8f0;' +
         'color:#94a3b8;font-size:12px">' +
         '이 메일은 앱스크립트가 자동으로 보냅니다. 멈추려면 브리핑중지() 를 실행하세요.<br>' +
         '<a href="' + CP15.siteUrl + '" style="color:#2563eb">사이트 열기</a> · ' +
         '<a href="https://docs.google.com/spreadsheets/d/' + CP15.spreadsheetId +
         '" style="color:#2563eb">시트 열기</a></p>');
  h.push('</div>');
  return h.join('');
}

function brfSection_(title, badge, inner) {
  return '<div style="margin:0 0 18px">' +
    '<div style="font-size:13px;color:#64748b;margin-bottom:3px">' + brfEsc_(title) +
      (badge ? ' <b style="color:#0f172a">' + brfEsc_(badge) + '</b>' : '') + '</div>' +
    '<div>' + inner + '</div></div>';
}

function brfBox_(title, inner, bg, border) {
  return '<div style="margin:0 0 18px;padding:12px 14px;background:' + bg +
    ';border:1px solid ' + border + ';border-radius:10px">' +
    '<b style="display:block;margin-bottom:6px">' + brfEsc_(title) + '</b>' + inner + '</div>';
}

/* ══════════════ 자료 모으기 ══════════════ */

function brfJobs_(ss) {
  var sh = ss.getSheetByName(CP15.sheet);
  return sh ? cp15ReadJobs_(sh) : [];
}

/* 신청자 탭은 신청마다 한 줄이 늘어납니다. 첫 칸이 신청시각입니다. */
function brfSignups_(ss) {
  var sh = ss.getSheetByName('신청자');
  if (!sh || sh.getLastRow() < 2) return {total: 0, recent: 0, names: []};
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  var since = new Date(Date.now() - 24 * 3600000);
  var names = [];
  var recent = 0;
  rows.forEach(function (r) {
    var at = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (!isNaN(at.getTime()) && at > since) {
      recent++;
      names.push(String(r[1] || '(이름 없음)'));
    }
  });
  return {total: rows.length, recent: recent, names: names};
}

/* 남은 캐시. 발송 API 와 같은 서명 방식이고 주소만 다릅니다. */
function brfBalance_() {
  var cfg = cp15Config_();
  var date = new Date().toISOString();
  var salt = Utilities.getUuid().replace(/-/g, '');
  var signature = cp15Hex_(Utilities.computeHmacSha256Signature(date + salt, cfg.secret));
  var res = UrlFetchApp.fetch('https://api.solapi.com/cash/v1/balance', {
    method: 'get', muteHttpExceptions: true,
    headers: {Authorization: 'HMAC-SHA256 apiKey=' + cfg.key + ', date=' + date +
              ', salt=' + salt + ', signature=' + signature}
  });
  if (res.getResponseCode() !== 200) throw new Error('잔액 조회 실패');
  var j = JSON.parse(res.getContentText());
  return {balance: Number(j.balance || 0), point: Number(j.point || 0)};
}

/* 화면이 말하는 「정보 기준일」을 그대로 읽습니다. 기관 하나라도 수집이
   막히면 이 날짜가 오늘로 넘어오지 않으므로, 크롤러 상태 점검이 됩니다. */
function brfFreshness_() {
  var res = UrlFetchApp.fetch(CP15.siteUrl, {muteHttpExceptions: true});
  if (res.getResponseCode() !== 200) throw new Error('사이트 조회 실패');
  var m = res.getContentText().match(/id="dataUpdatedAt">"(\d{4}-\d{2}-\d{2})"/);
  if (!m) throw new Error('기준일을 찾지 못함');
  return m[1];
}

/* ══════════════ 잔손질 ══════════════ */

function brfTry_(fn, fallback) {
  try { return fn(); } catch (err) { return fallback; }
}
function brfDone_(state) {
  return ['취소', '시각지남', '발송완료', '발송실패'].indexOf(state) >= 0;
}
function brf_(date, fmt) {
  return Utilities.formatDate(date, 'Asia/Seoul', fmt);
}
function brfWon_(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function brfEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
