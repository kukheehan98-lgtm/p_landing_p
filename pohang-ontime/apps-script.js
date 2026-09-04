/* ══════════════════════════════════════════════════════════════════
   우리동네 컬처픽_포항 — 신청 수집 스크립트
   ------------------------------------------------------------------
   Apps Script 편집기에 이 파일 내용을 통째로 붙여넣고 저장(Ctrl+S) 후
   배포 → 배포 관리 → 연필(✏️) → 버전: 새 버전 → 배포
   ( /exec 주소는 그대로 유지되므로 웹페이지는 손댈 필요 없습니다 )

   두 개 탭에 나눠 씁니다.

   ① 「신청자」    — 사람 1명 = 1줄 (기존과 동일, 명단 관리용)
   ② 「발송목록」  — 사람×강좌 = 1줄 (알림 발송용) ★ 새로 추가

   ②가 핵심입니다. 강좌 열에 필터를 걸면 "이 강좌를 신청한 사람" 명단이
   바로 나오고, 발송여부를 강좌별로 체크할 수 있습니다.
   ══════════════════════════════════════════════════════════════════ */

var SHEET_PEOPLE = '신청자';
var SHEET_SEND   = '발송목록';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);                       // 동시 신청 시 행 겹침 방지
  try {
    var p  = (e && e.parameter) || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var at = p.at ? new Date(p.at) : new Date();

    writePerson_(ss, p, at);
    var added = writeSendRows_(ss, p, at);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, sendRowsAdded: added }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/* ── ① 신청자 탭: 사람 1명 = 1줄 ─────────────────────────────
   같은 휴대폰이 다시 신청하면 새 줄을 만들지 않고 기존 줄을 갱신합니다.
   (지금까지는 같은 사람이 두 줄로 쌓여 어느 게 최신인지 헷갈렸습니다) */
function writePerson_(ss, p, at) {
  var sh = ss.getSheetByName(SHEET_PEOPLE);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PEOPLE);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(['신청시각', '이름', '휴대폰', '주로 다니는 때',
                  '찜한 프로그램', '찜 ID', '유입 경로']);
    sh.setFrozenRows(1);
    sh.getRange('A1:G1').setFontWeight('bold');
  }

  var phone = normPhone_(p.phone);
  var row = [
    at,
    p.name    || '',
    "'" + phone,                              // 앞자리 0 이 사라지지 않도록
    p.slot    || '',
    p.likes   || '',
    p.likeIds || '',
    p.ref     || ''
  ];

  var found = findRowByPhone_(sh, 3, phone);
  if (found > 0) {
    sh.getRange(found, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
}

/* ── ② 발송목록 탭: 사람 × 강좌 = 1줄 ───────────────────────
   「휴대폰 + 강좌ID」가 이미 있으면 건너뜁니다.
   그래야 재신청해도 중복되지 않고, 이미 체크한 발송여부가 지워지지 않습니다. */
function writeSendRows_(ss, p, at) {
  var programs = [];
  try {
    programs = JSON.parse(p.programs || '[]');
  } catch (err) {
    programs = [];
  }
  if (!programs.length) return 0;              // 강좌를 담지 않은 신청

  var sh = ss.getSheetByName(SHEET_SEND);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SEND);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(['접수시작', '접수마감', '강좌', '기관',
                  '이름', '휴대폰', '주로 다니는 때',
                  '발송여부', '접수기간(원문)', '강좌ID', '신청시각']);
    sh.setFrozenRows(1);
    sh.getRange('A1:K1').setFontWeight('bold');
    sh.setColumnWidth(3, 280);
    sh.setColumnWidth(9, 300);
    sh.getRange('A2:B').setNumberFormat('yyyy-mm-dd');
  }

  var phone = normPhone_(p.phone);
  var existing = existingKeys_(sh);
  var rows = [];

  for (var i = 0; i < programs.length; i++) {
    var g = programs[i] || {};
    var key = phone + '@' + (g.id || '');
    if (existing[key]) continue;               // 이미 있는 조합

    rows.push([
      g.openAt   ? new Date(g.openAt)   : '',
      g.deadline ? new Date(g.deadline) : '',
      g.title || '',
      g.org   || '',
      p.name  || '',
      "'" + phone,
      p.slot  || '',
      '',                                      // 발송여부 — 운영자가 체크
      g.applyPeriod || '',
      g.id || '',
      at
    ]);
    existing[key] = true;
  }

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return rows.length;
}

/* ── 헬퍼 ───────────────────────────────────────────────── */

/* 010-1234-5678 / 01012345678 / 010 1234 5678 → 01012345678
   사용자가 하이픈을 넣기도 하고 안 넣기도 해서, 중복 판정을 위해 통일합니다. */
function normPhone_(v) {
  return String(v || '').replace(/[^0-9]/g, '');
}

function findRowByPhone_(sh, col, phone) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (normPhone_(vals[i][0]) === phone) return i + 2;
  }
  return 0;
}

/* 발송목록의 「휴대폰 + 강좌ID」 조합을 미리 읽어 중복을 막습니다 */
function existingKeys_(sh) {
  var map = {};
  var last = sh.getLastRow();
  if (last < 2) return map;
  var vals = sh.getRange(2, 6, last - 1, 5).getValues();   // F(휴대폰) ~ J(강좌ID)
  for (var i = 0; i < vals.length; i++) {
    map[normPhone_(vals[i][0]) + '@' + String(vals[i][4] || '')] = true;
  }
  return map;
}
