/* ══════════════════════════════════════════════════════════════════
   우리동네 컬처픽_포항 — 접수 알림 문자 발송
   ------------------------------------------------------------------
   신청자 시트를 가진 Apps Script 에 붙여넣어 씁니다.
   (신청을 받는 doPost 와 같은 프로젝트에 함께 두어도 됩니다)

   흐름
     준비()    오늘 접수가 열리는 강좌를 담은 사람을 찾아 「발송함」에 적습니다.
               상태는 '대기' 입니다. 아직 아무것도 보내지 않습니다.
     보내기()  「발송함」의 '대기' 줄을 실제로 발송하고 결과를 적습니다.

   왜 둘로 나눴는가
     보낸 문자는 되돌릴 수 없습니다. 날짜 계산이 하나 틀리면 새벽에 문자가
     나가고, 그걸로 서비스가 끝납니다. 처음 몇 주는 준비()만 자동으로 돌리고
     눈으로 확인한 뒤 보내기()를 누르세요. 문제없이 돌아가면 그때
     보내기()에도 트리거를 걸면 됩니다.

   준비물 (솔라피 solapi.com — 개인 계정으로 가입 가능)
     · API Key / API Secret
     · 발신번호 (가입 때 본인인증한 번호가 자동으로 등록됩니다)
   ══════════════════════════════════════════════════════════════════ */

/* ★ 여기 세 줄만 채우면 됩니다 ─────────────────────────────── */
var SOLAPI = {
  apiKey:    '',        // 솔라피 → 개발/연동 → API Key
  apiSecret: '',        // 같은 화면의 API Secret
  from:      ''         // 등록된 발신번호, 숫자만 (예: '01012345678')
};

/* 강좌 정보는 사이트가 매일 갱신하는 파일에서 읽습니다.
   시트에 강좌를 따로 적어둘 필요가 없고, 정원·접수시각이 늘 최신입니다. */
var SITE_DATA = 'https://kukheehan98-lgtm.github.io/p_landing_p/data/programs.json';
var SITE_URL  = 'kukheehan98-lgtm.github.io/p_landing_p';

var SHEET_PEOPLE = '신청자';
var SHEET_OUTBOX = '발송함';

/* 발송함 열 구성 */
var COL = { made: 1, state: 2, name: 3, phone: 4, ids: 5, summary: 6, text: 7, sentAt: 8, result: 9 };

/* ══════════════ ① 준비 — 보낼 대상을 찾아 적습니다 ══════════════ */
function 준비() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = outbox_(ss);
  var programs = fetchPrograms_();
  var today = ymd_(new Date());

  var now = new Date();

  /* ① 오늘 접수가 열리는 강좌 (아직 열리기 전) */
  var opening = programs.filter(function (p) {
    return p.openAt && p.openAt.slice(0, 10) === today && toDate_(p.openAt) > now;
  });

  /* ② 오늘·내일 접수가 마감되는 강좌.
     이미 열려 있는 강좌를 담은 사람은 「접수 시작」 알림 대상이 아니라
     영영 아무 연락도 못 받습니다. 마감 임박이 그들에게 필요한 알림입니다. */
  var closing = programs.filter(function (p) {
    if (!p.deadline || !p.openAt) return false;
    if (toDate_(p.openAt) > now) return false;                 // 아직 안 열림 → ①에서 처리
    var left = (toDate_(p.deadline) - now) / 3600000;
    if (left <= 0 || left > 36) return false;                  // 이미 마감이거나 아직 여유
    return p.capacity == null || p.enrolled < p.capacity;      // 정원이 찼으면 알릴 것이 없음
  });

  if (!opening.length && !closing.length) {
    Logger.log('오늘 알릴 강좌가 없습니다');
    return;
  }

  var byId = {};
  opening.forEach(function (p) { p.why = 'open';  byId[p.id] = p; });
  closing.forEach(function (p) { p.why = 'close'; byId[p.id] = p; });

  /* 사람별로 묶습니다 — 한 사람이 두 강좌를 담았으면 문자도 한 통입니다 */
  var people = readPeople_(ss);
  var already = sentKeys_(out);
  var rows = [];

  Object.keys(people).forEach(function (phone) {
    var who = people[phone];
    var mine = who.ids.filter(function (id) { return byId[id]; })
                     .map(function (id) { return byId[id]; });
    if (!mine.length) return;

    /* 접수 시작을 먼저, 그 다음 마감 임박 */
    mine.sort(function (a, b) {
      if (a.why !== b.why) return a.why === 'open' ? -1 : 1;
      return (a.why === 'open' ? a.openAt < b.openAt : a.deadline < b.deadline) ? -1 : 1;
    });

    var key = phone + '@' + mine.map(function (p) { return p.id; }).join('|') + '@' + today;
    if (already[key]) return;                 // 오늘 이미 보낸 조합

    rows.push([
      new Date(), '대기', who.name, "'" + phone,
      mine.map(function (p) { return p.id; }).join('|'),
      mine.map(function (p) { return p.orgShort + ' ' + p.title; }).join(' / '),
      composeText_(who.name, mine),
      '', ''
    ]);
  });

  if (!rows.length) { Logger.log('보낼 대상이 없습니다 (이미 보냈거나 담은 사람 없음)'); return; }

  out.getRange(out.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log(rows.length + '명 분을 「발송함」에 적었습니다. 확인 후 보내기() 를 실행하세요.');
}

/* ══════════════ ② 보내기 — '대기' 줄을 실제로 발송 ══════════════ */
function 보내기() {
  if (!SOLAPI.apiKey || !SOLAPI.apiSecret || !SOLAPI.from) {
    throw new Error('SOLAPI 설정(apiKey / apiSecret / from)을 먼저 채워주세요');
  }

  var out = outbox_(SpreadsheetApp.getActiveSpreadsheet());
  var last = out.getLastRow();
  if (last < 2) { Logger.log('발송함이 비어 있습니다'); return; }

  var values = out.getRange(2, 1, last - 1, COL.result).getValues();
  var targets = [];

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][COL.state - 1]).trim() !== '대기') continue;
    targets.push({
      row: i + 2,
      to: digits_(values[i][COL.phone - 1]),
      text: String(values[i][COL.text - 1])
    });
  }
  if (!targets.length) { Logger.log('대기 중인 발송이 없습니다'); return; }

  /* 한 통씩 보냅니다. 한 건이 실패해도 나머지는 나갑니다. */
  targets.forEach(function (t) {
    var res = sendOne_(t.to, t.text);
    out.getRange(t.row, COL.state).setValue(res.ok ? '완료' : '실패');
    out.getRange(t.row, COL.sentAt).setValue(new Date());
    out.getRange(t.row, COL.result).setValue(res.message);
    Utilities.sleep(300);
  });

  Logger.log(targets.length + '건 처리했습니다');
}

/* ══════════════ ③ 시험 발송 — 본인 번호로 한 통 ══════════════
   실제 신청자에게 보내기 전에 반드시 한 번 해보세요.
   글자 깨짐, 발신번호 표시, 도착 속도를 여기서 확인합니다. */
function 시험발송() {
  var res = sendOne_(digits_(SOLAPI.from),
    '[컬처픽] 시험 발송입니다. 이 문자가 보이면 연결이 정상입니다.');
  Logger.log(res.ok ? '성공: ' + res.message : '실패: ' + res.message);
}

/* ══════════════ 문자 내용 ══════════════
   짧을수록 좋습니다. 한글 45자를 넘으면 SMS(18원)가 LMS(45원)가 됩니다.
   무엇보다, 접수 직전에 읽는 문자는 짧아야 눈에 들어옵니다. */
function composeText_(name, list) {
  var who = name && name !== '(미입력)' ? name + '님, ' : '';

  if (list.length === 1) {
    var p = list[0];
    var head = p.why === 'open'
      ? '오늘 ' + hhmm_(p.openAt) + ' 접수 시작'
      : deadlineText_(p) + ' 접수 마감';
    return '[컬처픽] ' + who + '담아두신 「' + p.title + '」 ' + head + seatText_(p) + '.\n' +
           '접수 전 로그인 필수!\n' + SITE_URL + '\n수신거부 \'그만\'';
  }

  var lines = list.map(function (p) {
    return p.why === 'open'
      ? '· ' + hhmm_(p.openAt) + ' 접수시작 ' + p.title + seatText_(p)
      : '· ' + deadlineText_(p) + ' 마감 ' + p.title + seatText_(p);
  }).join('\n');

  return '[컬처픽] ' + who + '담아두신 강좌 소식입니다.\n' +
         lines + '\n접수 전 로그인 필수!\n' + SITE_URL + '\n수신거부 \'그만\'';
}

/* 남은 자리는 정원보다 강한 신호입니다.
   단위가 기관마다 달라 그대로 씁니다 — 과학원은 '가족'으로 뽑습니다. */
function seatText_(p) {
  var unit = p.unit || '명';
  if (p.capacity == null) return '';
  if (p.why === 'close' && p.enrolled != null) {
    return ' (' + Math.max(0, p.capacity - p.enrolled) + unit + ' 남음)';
  }
  return ' (정원 ' + p.capacity + unit + ')';
}

function deadlineText_(p) {
  var d = toDate_(p.deadline);
  var sameDay = ymd_(d) === ymd_(new Date());
  return (sameDay ? '오늘 ' : '내일 ') + hhmm_(p.deadline);
}

/* ══════════════ 솔라피 ══════════════ */
function sendOne_(to, text) {
  var date = new Date().toISOString();
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 20);

  /* 서명 = HMAC-SHA256(날짜 + salt, API Secret) 를 16진수로 */
  var sig = toHex_(Utilities.computeHmacSha256Signature(date + salt, SOLAPI.apiSecret));

  var res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send-many/detail', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'HMAC-SHA256 apiKey=' + SOLAPI.apiKey +
                     ', date=' + date + ', salt=' + salt + ', signature=' + sig
    },
    payload: JSON.stringify({
      messages: [{ to: to, from: digits_(SOLAPI.from), text: text }]
    })
  });

  var code = res.getResponseCode();
  var body = res.getContentText();

  if (code < 200 || code >= 300) return { ok: false, message: 'HTTP ' + code + ' ' + body.slice(0, 180) };

  /* 200 이어도 개별 건이 실패할 수 있어 실패 목록을 확인합니다 */
  try {
    var j = JSON.parse(body);
    if (j.failedMessageList && j.failedMessageList.length) {
      return { ok: false, message: JSON.stringify(j.failedMessageList[0]).slice(0, 180) };
    }
    return { ok: true, message: '발송 요청됨' + (j.groupId ? ' (' + j.groupId + ')' : '') };
  } catch (err) {
    return { ok: true, message: body.slice(0, 120) };
  }
}

function toHex_(bytes) {
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/* ══════════════ 시트 읽기 ══════════════ */

/* 신청자 시트를 휴대폰 기준으로 묶습니다.
   같은 사람이 강좌마다 한 줄씩 남기므로 합쳐야 문자가 한 통이 됩니다.
   예전 줄은 찜 ID 가 'a|b' 로 붙어 있어 그것도 받아줍니다. */
function readPeople_(ss) {
  var sh = ss.getSheetByName(SHEET_PEOPLE);
  if (!sh || sh.getLastRow() < 2) return {};

  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var map = {};

  for (var i = 0; i < v.length; i++) {
    var phone = digits_(v[i][2]);
    if (phone.length < 10) continue;

    if (!map[phone]) map[phone] = { name: String(v[i][1] || '').trim(), ids: [] };
    if (!map[phone].name) map[phone].name = String(v[i][1] || '').trim();

    String(v[i][5] || '').split('|').forEach(function (id) {
      id = id.trim();
      if (id && map[phone].ids.indexOf(id) === -1) map[phone].ids.push(id);
    });
  }
  return map;
}

/* 이미 보낸(또는 대기 중인) 조합 — 같은 날 두 번 보내지 않기 위해 */
function sentKeys_(out) {
  var keys = {};
  var last = out.getLastRow();
  if (last < 2) return keys;

  var v = out.getRange(2, 1, last - 1, COL.result).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][COL.state - 1]).trim() === '실패') continue;   // 실패는 다시 시도할 수 있게
    keys[digits_(v[i][COL.phone - 1]) + '@' + String(v[i][COL.ids - 1]) + '@' + ymd_(v[i][COL.made - 1])] = true;
  }
  return keys;
}

function outbox_(ss) {
  var sh = ss.getSheetByName(SHEET_OUTBOX);
  if (!sh) sh = ss.insertSheet(SHEET_OUTBOX);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['만든시각', '상태', '이름', '휴대폰', '강좌ID', '강좌', '보낼 내용', '발송시각', '결과']);
    sh.setFrozenRows(1);
    sh.getRange('A1:I1').setFontWeight('bold');
    sh.setColumnWidth(6, 260);
    sh.setColumnWidth(7, 380);
  }
  return sh;
}

/* ══════════════ 강좌 데이터 ══════════════ */
function fetchPrograms_() {
  var res = UrlFetchApp.fetch(SITE_DATA, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('강좌 데이터를 읽지 못했습니다: ' + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

/* ══════════════ 자잘한 것들 ══════════════ */
function digits_(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

function ymd_(v) {
  var d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return '';
  return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
}

function hhmm_(s) {
  var p = String(s).split(/[-\s:]+/);
  return p[3] ? p[3] + ':' + p[4] : '';
}

function toDate_(s) {
  var p = String(s).split(/[-\s:]+/);
  return new Date(+p[0], +p[1] - 1, +p[2], +(p[3] || 0), +(p[4] || 0));
}
