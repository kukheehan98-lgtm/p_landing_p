/* 컬처픽 — 접수 15분 전 문자 예약 (Apps Script V8)
 * 같은 프로젝트의 apps-script.js와 함께 설치합니다. 저장만 해서는 발송되지 않습니다.
 * 설정/시험 절차: SMS-15MIN-SETUP.md. 비밀키는 스크립트 속성에만 보관합니다.
 */
var CP15 = {
  spreadsheetId: '15umhHSoFrn3lHx1NWDd0ZCvcVBlkAz7It7d5uQMG-rM',
  dataUrl: 'https://kukheehan98-lgtm.github.io/p_landing_p/data/programs.json',
  siteUrl: 'https://kukheehan98-lgtm.github.io/p_landing_p/',
  leadMinutes: 15,
  horizonHours: 24,
  sheet: '15분전예약',
  headers: ['예약키', '상태', '휴대폰', '이름', '강좌ID', '강좌', '접수시작', '예약발송시각',
    '문자내용', '그룹ID', '수정시각', '처리결과', '업체발송시각', '구분'],
  fields: ['key', 'state', 'phone', 'name', 'id', 'title', 'openAt', 'sendAt',
    'text', 'groupId', 'updatedAt', 'result', 'sentAt', 'kind']
};

/* ── 소수 정원 알림 ─────────────────────────────────────────────
   강좌를 담지 않고 「주로 다니는 때」만 고른 신청자를 위한 알림입니다.
   그분들은 찜 ID 가 없어 발송목록에 행이 생기지 않고, 지금까지 문자를 한 통도
   받지 못했습니다. 신청 화면에서는 문자로 알려주겠다고 약속한 상태입니다.

   무엇을 보낼지는 고른 시간대가 아니라 정원으로 정합니다. 시간대로 거르면
   두 가지를 놓치기 때문입니다.
     · 「평일 방과후」에 맞는 강좌는 앞으로 열리는 것 중 하나도 없습니다
     · 6가족 천체관측은 행사가 평일 저녁이라 어느 시간대에도 걸리지 않습니다
       — 정작 알림이 가장 필요한 강좌입니다

   기준은 화면의 「소수 정원 ⚡」 칩과 같은 12명 이하입니다 (index.html 의 isSmall).
   60명짜리는 알림이 없어도 신청되고 6가족은 못 잡습니다. 그 차이가 이 서비스의
   존재 이유이므로, 알림도 화면과 같은 선을 씁니다. */
var CP15_SMALL = {
  kind: '소수정원',
  maxCapacity: 12,     // index.html 의 isSmall 과 같은 값입니다
  from: 'sms'          // GA4 에서 문자 유입을 따로 셉니다
};

// 번호나 비밀키를 출력하지 않는 연결 전 점검입니다. 문자를 발송하지 않습니다.
function 십오분전설정확인() {
  var p = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(CP15.spreadsheetId);
  cp15ReadSubscriptions_(ss);
  var result = {
    leadMinutes: CP15.leadMinutes,
    enabled: p.getProperty('CP15_ENABLED') === 'true',
    smallEnabled: p.getProperty('CP15_SMALL_ENABLED') === 'true',
    apiKeySet: !!cp15RawConfig_().key,
    apiSecretSet: !!cp15RawConfig_().secret,
    senderSet: !!cp15RawConfig_().from,
    sheetTimezone: ss.getSpreadsheetTimeZone(),
    scriptTimezone: Session.getScriptTimeZone(),
    triggers: ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); })
  };
  Logger.log(JSON.stringify(result));
  return result;
}

// 대상과 예정 시각만 시트에 작성합니다. SOLAPI API를 호출하지 않습니다.
function 십오분전미리보기() {
  return cp15Locked_(function () { return cp15Cycle_(false, false); });
}

// 이 함수의 실행은 실제 신청자 대상 자동 예약을 활성화합니다.
function 십오분전자동설치() {
  cp15Config_();
  var check = 십오분전설정확인();
  if (check.sheetTimezone !== 'Asia/Seoul' || check.scriptTimezone !== 'Asia/Seoul') {
    throw new Error('시트와 Apps Script의 시간대를 Asia/Seoul로 설정하세요.');
  }
  if (check.triggers.indexOf('보내기') >= 0) {
    throw new Error('기존 보내기 트리거를 확인하고 해제한 뒤 설치하세요. 중복 발송을 막기 위한 확인입니다.');
  }
  // 먼저 검증합니다. 실패하면 활성화하거나 트리거를 만들지 않습니다.
  십오분전미리보기();
  cp15EnsureTrigger_();
  PropertiesService.getScriptProperties().setProperty('CP15_ENABLED', 'true');
  Logger.log('접수 15분 전 예약 활성화. 1분마다 새 신청과 예약 결과를 확인합니다.');
}

// 비활성화는 이미 SOLAPI에 맡긴 예약도 취소 요청합니다. 실패 건은 재확인합니다.
function 십오분전자동중지() {
  PropertiesService.getScriptProperties().setProperty('CP15_ENABLED', 'false');
  cp15EnsureTrigger_();
  return cp15Locked_(function () { return cp15Cycle_(true, true, true); });
}

function 십오분전자동실행() {
  var enabled = PropertiesService.getScriptProperties().getProperty('CP15_ENABLED') === 'true';
  return cp15Locked_(function () { return cp15Cycle_(true, !enabled); });
}

/* ── 소수 정원 알림 켜고 끄기 ───────────────────────────────────
   번호는 출력하지 않습니다. 사람 수와 강좌만 봅니다. SOLAPI 를 부르지 않습니다. */
function 소수정원미리보기() {
  var ss = SpreadsheetApp.openById(CP15.spreadsheetId);
  var people = cp15SlotSubscribers_(ss);
  var blocked = cp15Blocked_(ss);
  var 대상 = people.filter(function (s) { return /^01\d{8,9}$/.test(s.phone) && !blocked[s.phone]; });
  var groups = cp15SmallGroups_(cp15FetchPrograms_());
  var now = new Date();
  var times = Object.keys(groups).filter(function (at) { return new Date(at) > now; }).sort();
  var 예약 = times.map(function (at) {
    var send = new Date(new Date(at).getTime() - CP15.leadMinutes * 60000);
    return {
      발송시각: Utilities.formatDate(send, 'Asia/Seoul', 'MM/dd(E) HH:mm'),
      강좌: groups[at].map(function (p) { return p.title + ' ' + p.capacity + (p.unit || '명'); }),
      문자: 대상.length + '통',
      곧예약함: (send - now) <= CP15.horizonHours * 3600000
    };
  });
  var result = {
    켜짐: cp15SmallEnabled_(),
    정원기준: CP15_SMALL.maxCapacity + '명 이하',
    대상인원: 대상.length,
    제외: people.length - 대상.length,     // 번호 형식 이상 또는 수신거부
    예약: 예약,
    본문예시: times.length
      ? cp15SmallJob_({phone: '01000000000', name: ''}, groups[times[0]], times[0]).text
      : '(보낼 강좌 없음)'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

// 이 함수의 실행은 실제 신청자 대상 발송을 활성화합니다.
function 소수정원알림켜기() {
  var check = 십오분전설정확인();
  if (!check.enabled) {
    throw new Error('접수 15분 전 예약(십오분전자동설치)이 먼저 켜져 있어야 합니다.');
  }
  var preview = 소수정원미리보기();   // 먼저 검증합니다. 실패하면 켜지 않습니다.
  PropertiesService.getScriptProperties().setProperty('CP15_SMALL_ENABLED', 'true');
  cp15EnsureTrigger_();
  Logger.log('소수 정원 알림 켜짐. 대상 ' + preview.대상인원 + '명.');
  return preview;
}

// 끄면 다음 실행(1분 안)이 아직 발송되지 않은 예약을 업체에서 취소합니다.
function 소수정원알림끄기() {
  PropertiesService.getScriptProperties().setProperty('CP15_SMALL_ENABLED', 'false');
  return cp15Locked_(function () { return cp15Cycle_(true, false); });
}

// 테스트도 실제 문자를 예약합니다. 명시적으로 지정한 본인 번호만 사용합니다.
// CP15_TEST_PHONE, CP15_TEST_OPEN_AT(예: 2026-09-06 10:00)를 속성에 먼저 설정합니다.
function 십오분전시험예약() {
  cp15Config_();
  var p = PropertiesService.getScriptProperties();
  var phone = cp15Phone_(p.getProperty('CP15_TEST_PHONE'));
  var open = cp15Date_(p.getProperty('CP15_TEST_OPEN_AT'));
  if (!/^01\d{8,9}$/.test(phone) || !open || open.getTime() - Date.now() < 17 * 60000) {
    throw new Error('본인 시험 번호와 현재보다 17분 이상 뒤인 가상 접수시각을 설정하세요.');
  }
  return cp15Locked_(function () {
    var ss = SpreadsheetApp.openById(CP15.spreadsheetId);
    var out = cp15Outbox_(ss);
    var rows = cp15ReadJobs_(out);
    var job = cp15Job_({phone: phone, name: '', id: 'self-test', title: '수신 시각 확인용 시험',
      openAt: open.toISOString()}, '시험');
    var previous = rows.filter(function (r) { return r.key === job.key; })[0];
    job = previous || job;
    cp15Save_(out, job);
    cp15EnsureTrigger_(); // 운영 모드가 꺼져 있어도 명시적으로 예약한 시험 결과만 조회합니다.
    cp15Drive_(job, true, function () { cp15Save_(out, job); }, cp15Api_, new Date());
    return {state: job.state, sendAt: job.sendAt, openAt: job.openAt};
  });
}

function cp15EnsureTrigger_() {
  var found = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === '십오분전자동실행';
  });
  if (!found.length) ScriptApp.newTrigger('십오분전자동실행').timeBased().everyMinutes(1).create();
  found.slice(1).forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function cp15Locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {busy: true};
  try { return fn(); } finally { lock.releaseLock(); }
}

function cp15Cycle_(live, stop, stopTests) {
  var ss = SpreadsheetApp.openById(CP15.spreadsheetId);
  // 설치 전에는 매분 트리거가 없으며, 정지 후에는 기존 예약 결과/취소만 확인합니다.
  var out = ss.getSheetByName(CP15.sheet);
  if (stop && !out) return {active: 0};
  out = out || cp15Outbox_(ss);
  var jobs = cp15ReadJobs_(out);
  var wanted = {};
  var now = new Date();
  if (!stop) {
    var data = cp15FetchPrograms_(); // 데이터 조회 실패 시 기존 예약을 삭제하지 않고 실행 오류로 남깁니다.
    var blocked = cp15Blocked_(ss);
    wanted = cp15Plan_(data, cp15ReadSubscriptions_(ss), blocked);
    // 소수 정원 알림을 같은 목록에 얹습니다. 예약·취소·결과 확인은 아래 로직을 그대로 씁니다.
    // 꺼져 있으면 wanted 에서 빠지므로 이미 잡아둔 예약은 다음 실행이 취소합니다.
    if (cp15SmallEnabled_()) {
      var small = cp15SmallPlan_(data, cp15SlotSubscribers_(ss), blocked);
      Object.keys(small).forEach(function (key) { wanted[key] = small[key]; });
    }
    var keys = {};
    jobs.forEach(function (j) { keys[j.key] = j; });
    Object.keys(wanted).forEach(function (key) {
      var j = wanted[key];
      if (keys[key]) {
        // 미리보기 후 시험/운영 중지로 취소된 미발송 예약은 재활성화할 수 있습니다.
        var previous = keys[key];
        if (previous.state === '취소' && new Date(j.sendAt) > now) {
          previous.state = '준비'; previous.result = '활성 신청의 예약 재확인'; cp15Save_(out, previous);
        }
        return;
      }
      if (new Date(j.openAt) <= now || new Date(j.sendAt) - now > CP15.horizonHours * 3600000) return;
      if (new Date(j.sendAt) <= now) {
        j.state = '시각지남'; j.result = '15분 전 시각이 지나 예약하지 않음';
      }
      cp15Save_(out, j);
      jobs.push(j);
    });
  }
  if (!live) return {planned: jobs.filter(function (j) { return j.state === '준비'; }).length};
  var started = Date.now();
  // 이전 시각 예약의 취소 확인을 먼저 합니다. 확인 전 새 시각으로 중복 예약하지 않습니다.
  jobs.sort(function (a, b) { return Number(!!wanted[a.key]) - Number(!!wanted[b.key]); });
  jobs.forEach(function (job) {
    if (Date.now() - started > 45000 || cp15Terminal_(job.state)) return;
    var desired = job.kind === '시험' ? !stopTests : !!wanted[job.key];
    var save = function () { cp15Save_(out, job); };
    if (desired && job.kind !== '시험' && !job.groupId) {
      var conflict = jobs.some(function (old) {
        return old.key !== job.key && old.phone === job.phone && old.id === job.id &&
          old.kind === job.kind && ['취소', '시각지남'].indexOf(old.state) < 0;
      });
      if (conflict) { job.result = '이전 예약의 취소/발송 결과를 먼저 확인해야 함'; save(); return; }
    }
    cp15Drive_(job, desired, save, cp15Api_, new Date());
  });
  return {active: jobs.filter(function (j) { return !cp15Terminal_(j.state); }).length};
}

// 같은 강좌라도 접수시각이 다르면 독립 예약입니다. 명단의 모든 사람×강좌 조합을 사용합니다.
function cp15Plan_(programs, subscriptions, blocked) {
  var byId = {};
  programs.forEach(function (p) { if (p && p.id) byId[p.id] = p; });
  var desired = {};
  var suppressed = {};
  subscriptions.forEach(function (s) {
    if (!cp15Active_(s.state)) suppressed[s.phone + '|' + s.id] = true;
  });
  subscriptions.forEach(function (s) {
    var p = byId[s.id];
    if (!/^01\d{8,9}$/.test(s.phone) || blocked[s.phone] || suppressed[s.phone + '|' + s.id] ||
        !cp15Active_(s.state) || !p || !cp15Date_(p.openAt)) return;
    var job = cp15Job_({phone: s.phone, name: s.name, id: s.id, title: p.title, openAt: p.openAt}, '운영');
    desired[job.key] = job;
  });
  return desired;
}

function cp15SmallEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('CP15_SMALL_ENABLED') === 'true';
}

/* 강좌를 담지 않은 사람만 골라냅니다.
   담은 사람은 발송목록으로 이미 알림을 받고 있어, 여기서 빼지 않으면 같은
   강좌로 두 통을 받게 됩니다. 나중에 강좌를 담으면 자동으로 이 명단에서 빠집니다. */
function cp15SlotSubscribers_(ss) {
  var sh = ss.getSheetByName('신청자');
  if (!sh) throw new Error('신청자 탭이 없습니다.');
  var header = sh.getRange(1, 1, 1, 7).getValues()[0];
  if (header[2] !== '휴대폰' || header[5] !== '찜 ID') {
    throw new Error('신청자 열 구성을 확인하세요. C열이 휴대폰, F열이 찜 ID 여야 합니다.');
  }
  if (sh.getLastRow() < 2) return [];
  var seen = {};
  var out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().forEach(function (r) {
    if (String(r[5] || '').trim()) return;        // 찜한 강좌가 있는 사람
    var phone = cp15Phone_(r[2]);
    if (!phone || seen[phone]) return;            // 같은 번호가 두 줄이어도 한 번만
    seen[phone] = true;
    out.push({phone: phone, name: String(r[1] || '')});
  });
  return out;
}

/* 정원이 작은 강좌를 접수 시각별로 묶습니다.
   같은 시각에 두 건이 열리면 문자가 두 통 가는 게 아니라 한 통에 담깁니다. */
function cp15SmallGroups_(programs) {
  var groups = {};
  programs.forEach(function (p) {
    if (!p || !p.id) return;
    if (p.capacity == null || !(Number(p.capacity) <= CP15_SMALL.maxCapacity)) return;
    var open = cp15Date_(p.openAt);
    if (!open) return;
    var at = open.toISOString();
    (groups[at] = groups[at] || []).push(p);
  });
  // 수집 순서가 바뀌어도 예약키가 흔들리지 않도록 강좌 순서를 고정합니다
  Object.keys(groups).forEach(function (at) {
    groups[at].sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  });
  return groups;
}

function cp15SmallPlan_(programs, subscribers, blocked) {
  var groups = cp15SmallGroups_(programs);
  var times = Object.keys(groups);
  var desired = {};
  subscribers.forEach(function (s) {
    if (!/^01\d{8,9}$/.test(s.phone) || blocked[s.phone]) return;
    times.forEach(function (at) {
      var job = cp15SmallJob_(s, groups[at], at);
      desired[job.key] = job;
    });
  });
  return desired;
}

/* 한 건이면 그 강좌로 바로 가는 링크를, 여러 건이면 목록을 담습니다.
   눌러서 다시 찾게 만들면 그 사이에 마감됩니다. */
function cp15SmallJob_(s, list, at) {
  var open = new Date(at);
  var send = new Date(open.getTime() - CP15.leadMinutes * 60000);
  var ids = list.map(function (p) { return p.id; }).join(',');
  var size = function (p) { return p.capacity + (p.unit || '명'); };
  var head, link;
  if (list.length === 1) {
    head = '「' + String(list[0].title || '').slice(0, 120) + '」 ' + size(list[0]);
    link = CP15.siteUrl + '?open=' + encodeURIComponent(list[0].id) + '&from=' + CP15_SMALL.from;
  } else {
    head = '정원 작은 강좌 ' + list.length + '건\n' + list.map(function (p) {
      return '· ' + String(p.title || '').slice(0, 60) + ' ' + size(p);
    }).join('\n');
    link = CP15.siteUrl + '?from=' + CP15_SMALL.from;
  }
  return {
    key: CP15_SMALL.kind + '|' + s.phone + '|' + ids + '|' + open.toISOString(),
    state: '준비', phone: s.phone, name: s.name || '', id: ids,
    title: list.map(function (p) { return String(p.title || ''); }).join(' / ').slice(0, 250),
    openAt: open.toISOString(), sendAt: send.toISOString(),
    text: '[컬처픽] 접수 15분 전 알림\n' + head +
      '\n접수 시작: ' + Utilities.formatDate(open, 'Asia/Seoul', 'MM/dd HH:mm') +
      '\n정원이 작아 금방 마감됩니다. 로그인을 미리 준비해 주세요.\n' + link +
      '\n수신거부: 그만 회신',
    groupId: '', updatedAt: '', result: '', sentAt: '', kind: CP15_SMALL.kind
  };
}

function cp15Active_(state) { return ['', '대기', '미발송', 'FALSE'].indexOf(String(state == null ? '' : state).trim().toUpperCase()) >= 0; }
function cp15Terminal_(state) { return ['취소', '시각지남', '발송완료', '발송실패'].indexOf(state) >= 0; }

function cp15Job_(s, kind) {
  var open = cp15Date_(s.openAt);
  var send = new Date(open.getTime() - CP15.leadMinutes * 60000);
  return {key: kind + '|' + s.phone + '|' + s.id + '|' + open.toISOString(), state: '준비',
    phone: s.phone, name: s.name || '', id: s.id, title: String(s.title || ''),
    openAt: open.toISOString(), sendAt: send.toISOString(),
    text: (kind === '시험' ? '[컬처픽 시험]' : '[컬처픽]') + ' 접수 15분 전 알림\n「' +
      String(s.title || '').slice(0, 180) + '」\n접수 시작: ' +
      Utilities.formatDate(open, 'Asia/Seoul', 'MM/dd HH:mm') + '\n접수 전 로그인을 준비해 주세요.\n' +
      CP15.siteUrl + '\n수신거부: 그만 회신', groupId: '', updatedAt: '', result: '', sentAt: '', kind: kind};
}

// 모든 전송 단계는 먼저 groupId를 저장합니다. 예약 응답이 끊겨도 같은 그룹을 조회하며 재발송하지 않습니다.
function cp15Drive_(job, desired, save, api, now) {
  if (cp15Terminal_(job.state)) return;
  try {
    if (!desired && !job.groupId) { job.state = '취소'; job.result = '신청 취소/수신거부/접수시각 변경 또는 운영 중지'; save(); return; }
    if (!job.groupId && new Date(job.sendAt) <= now) { job.state = '시각지남'; job.result = '예약 시각이 지나 즉시 발송하지 않음'; save(); return; }
    var group;
    if (!job.groupId) {
      group = api('post', '/groups', {allowDuplicates: false, customFields: {culturepick: cp15Hash_(job.key)}});
      if (!group || !/^G4V[A-Za-z0-9]+$/.test(group.groupId || '')) throw new Error('그룹 생성 응답 확인 필요');
      job.groupId = group.groupId;
      save(); // 저장 실패 시 이후의 메시지 추가/예약 요청에 절대 진입하지 않습니다.
    } else {
      group = api('get', '/groups/' + encodeURIComponent(job.groupId));
    }
    if (!group || group.groupId !== job.groupId) throw new Error('다른 그룹 응답 또는 응답 누락');
    var count = group.count || {};
    if (group.status === 'COMPLETE' || group.status === 'SENDING') {
      job.sentAt = group.dateSent || job.sentAt;
      if (group.status === 'COMPLETE') {
        job.state = Number(count.sentSuccess) === 1 && Number(count.sentFailed || 0) === 0 ? '발송완료' : '발송실패';
        job.result = '업체 결과: 성공 ' + Number(count.sentSuccess || 0) + ', 실패 ' + Number(count.sentFailed || 0);
      } else { job.state = '발송중'; job.result = '업체 발송 처리 중'; }
      if (!desired) job.result += ' (취소 요청 전에 발송이 진행됨)';
      save(); return;
    }
    if (!desired) {
      if (group.status === 'SCHEDULED') group = api('delete', '/groups/' + encodeURIComponent(job.groupId) + '/schedule');
      if (!group || group.status !== 'PENDING') throw new Error('예약 취소 결과 확인 필요');
      job.state = '취소'; job.result = '업체 예약 취소 확인'; save(); return;
    }
    if (group.status === 'SCHEDULED') {
      if (new Date(group.scheduledDate).getTime() !== new Date(job.sendAt).getTime()) {
        // 잘못된 시각이면 먼저 취소합니다. 다음 실행에서 저장된 예정 시각으로 예약합니다.
        var cancelled = api('delete', '/groups/' + encodeURIComponent(job.groupId) + '/schedule');
        if (!cancelled || cancelled.status !== 'PENDING') throw new Error('잘못된 예약시각의 취소 확인 필요');
        job.state = '준비'; job.result = '예약시각 불일치 취소, 다음 실행에 재검증';
      } else { job.state = '예약'; job.result = '접수 15분 전 예약 확인 (휴대폰 수신 확인 전)'; }
      save(); return;
    }
    if (group.status !== 'PENDING') throw new Error('업체 그룹 상태 확인 필요: ' + String(group.status || '없음'));
    if (new Date(job.sendAt).getTime() <= Date.now() + 5000) {
      job.state = '시각지남'; job.result = '예약 가능 시각을 지나 즉시 발송하지 않음'; save(); return;
    }
    var path = '/groups/' + encodeURIComponent(job.groupId);
    var messages = api('get', path + '/messages?limit=2');
    if (!messages || !messages.messageList) throw new Error('그룹 메시지 조회 응답 확인 필요');
    var list = Object.keys(messages.messageList).map(function (id) { return messages.messageList[id]; });
    if (list.length === 0) {
      var cfg = cp15Config_();
      var added = api('put', path + '/messages', {messages: [{to: job.phone, from: cfg.from, text: job.text, autoTypeDetect: true}]});
      if (!added || added.errorCount !== 0 || !added.resultList || added.resultList.length !== 1 ||
          String(added.resultList[0].statusCode) !== '2000') throw new Error('문자 등록 실패: 발신번호/잔액/차단 상태를 업체에서 확인하세요.');
    } else if (list.length !== 1 || messages.nextKey || cp15Phone_(list[0].to) !== job.phone ||
        list[0].text !== job.text || String(list[0].statusCode) !== '2000') {
      throw new Error('그룹의 수신자/문자 내용 불일치 — 예약 중단');
    }
    // 지난 시각을 즉시 전송하는 send-many 대신 미래 시각만 받는 그룹 예약 API를 씁니다.
    if (new Date(job.sendAt).getTime() <= Date.now() + 5000) {
      job.state = '시각지남'; job.result = '문자 등록 중 예약 시각 경과, 발송하지 않음'; save(); return;
    }
    job.state = '확인중'; job.result = '업체 예약 요청 중'; save();
    group = api('post', path + '/schedule', {scheduledDate: job.sendAt});
    if (!group || group.status !== 'SCHEDULED' || new Date(group.scheduledDate).getTime() !== new Date(job.sendAt).getTime()) {
      throw new Error('예약 요청 결과 확인 필요');
    }
    job.state = '예약'; job.result = '접수 15분 전 예약 확인 (휴대폰 수신 확인 전)'; save();
  } catch (err) {
    job.state = '확인필요';
    job.result = String(err.message || '처리 오류').slice(0, 200);
    save(); // groupId가 있으면 다음 실행에서 조회로 복구하며 새 그룹으로 중복 예약하지 않습니다.
  }
}

// 운영 프로젝트에 이미 설정된 SOLAPI 값을 그대로 사용할 수 있습니다. 비밀값을 복사/출력하지 않습니다.
function cp15RawConfig_() {
  var p = PropertiesService.getScriptProperties();
  var existing = typeof SOLAPI === 'undefined' ? {} : SOLAPI;
  return {key: p.getProperty('SOLAPI_API_KEY') || existing.apiKey,
    secret: p.getProperty('SOLAPI_API_SECRET') || existing.apiSecret,
    from: cp15Phone_(p.getProperty('SOLAPI_FROM') || existing.from)};
}
function cp15Config_() {
  var cfg = cp15RawConfig_();
  if (!cfg.key || !cfg.secret || !/^\d{8,12}$/.test(cfg.from)) throw new Error('SOLAPI 스크립트 속성 설정이 필요합니다.');
  return cfg;
}

function cp15Api_(method, path, body) {
  var cfg = cp15Config_();
  var date = new Date().toISOString();
  var salt = Utilities.getUuid().replace(/-/g, '');
  var signature = cp15Hex_(Utilities.computeHmacSha256Signature(date + salt, cfg.secret));
  var options = {method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: {Authorization: 'HMAC-SHA256 apiKey=' + cfg.key + ', date=' + date + ', salt=' + salt + ', signature=' + signature}};
  if (body) options.payload = JSON.stringify(body);
  var response = UrlFetchApp.fetch('https://api.solapi.com/messages/v4' + path, options);
  var code = response.getResponseCode();
  // 오류 원문에는 번호 등 개인정보가 있을 수 있어 기록하지 않습니다.
  if (code < 200 || code >= 300) throw new Error('SOLAPI HTTP ' + code + ' — 업체 내역 확인 필요');
  try { return JSON.parse(response.getContentText()); } catch (err) { throw new Error('SOLAPI 응답 해석 실패 — 다음 실행에서 그룹 조회'); }
}

function cp15ReadSubscriptions_(ss) {
  var sh = ss.getSheetByName('발송목록');
  if (!sh) {
    // 2026-09-05 운영본 Code.gs는 신청마다 한 행을 추가합니다. 모든 행의 찜 ID를 읽습니다.
    var people = ss.getSheetByName('신청자');
    if (!people) throw new Error('발송목록/신청자 탭이 없습니다.');
    var header = people.getRange(1, 1, 1, 7).getValues()[0];
    if (header[2] !== '휴대폰' || header[5] !== '찜 ID') throw new Error('신청자 열 구성을 확인하세요.');
    var subscriptions = [];
    if (people.getLastRow() < 2) return subscriptions;
    people.getRange(2, 1, people.getLastRow() - 1, 7).getValues().forEach(function (row) {
      String(row[5] || '').split('|').forEach(function (id) {
        if (id.trim()) subscriptions.push({phone: cp15Phone_(row[2]), name: String(row[1] || ''), id: id.trim(), state: ''});
      });
    });
    return subscriptions;
  }
  var headers = sh.getRange(1, 1, 1, 11).getValues()[0];
  if (headers[5] !== '휴대폰' || headers[7] !== '발송여부' || headers[9] !== '강좌ID') throw new Error('발송목록 열 구성이 예상과 다릅니다. 운영 시트를 확인하세요.');
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues().map(function (r) {
    return {phone: cp15Phone_(r[5]), name: String(r[4] || ''), id: String(r[9] || '').trim(), state: r[7]};
  });
}

function cp15Blocked_(ss) {
  var sh = ss.getSheetByName('수신거부');
  var blocked = {};
  if (!sh || sh.getLastRow() < 2) return blocked;
  if (sh.getRange(1, 1).getValue() !== '휴대폰') throw new Error('수신거부 탭 A1은 휴대폰이어야 합니다.');
  sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { blocked[cp15Phone_(r[0])] = true; });
  return blocked;
}

function cp15Outbox_(ss) {
  var sh = ss.getSheetByName(CP15.sheet) || ss.insertSheet(CP15.sheet);
  if (!sh.getLastRow()) { sh.appendRow(CP15.headers); sh.setFrozenRows(1); }
  return sh;
}

function cp15ReadJobs_(sh) {
  if (sh.getLastRow() < 1 || sh.getRange(1, 1, 1, CP15.headers.length).getValues()[0].join('|') !== CP15.headers.join('|')) {
    throw new Error('15분전예약 탭의 열 구성이 변경되었습니다.');
  }
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, CP15.fields.length).getValues().map(function (r, i) {
    var job = {row: i + 2};
    CP15.fields.forEach(function (field, j) { job[field] = String(r[j] == null ? '' : r[j]); });
    job.phone = cp15Phone_(job.phone);
    return job;
  });
}

function cp15Save_(sh, job) {
  job.updatedAt = new Date().toISOString();
  if (!job.row) job.row = sh.getLastRow() + 1;
  var values = CP15.fields.map(function (field) {
    var value = String(job[field] == null ? '' : job[field]);
    return field === 'phone' || /^[=+\-@]/.test(value) ? "'" + value : value;
  });
  sh.getRange(job.row, 1, 1, values.length).setNumberFormat('@').setValues([values]);
  SpreadsheetApp.flush();
}

function cp15FetchPrograms_() {
  var response = UrlFetchApp.fetch(CP15.dataUrl, {muteHttpExceptions: true});
  if (response.getResponseCode() !== 200) throw new Error('강좌 데이터 조회 실패. 기존 예약은 유지됩니다.');
  var programs = JSON.parse(response.getContentText());
  if (!Array.isArray(programs) || !programs.length) throw new Error('강좌 데이터가 비어 있거나 잘못되었습니다. 기존 예약은 유지됩니다.');
  return programs;
}

// 오프셋 없는 수집기 시각은 항상 한국시간으로 해석하며 날짜만 있는 값은 예약하지 않습니다.
function cp15Date_(value) {
  var raw = String(value || '');
  var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) return null;
  var y = +match[1], mo = +match[2], day = +match[3], hour = +match[4], minute = +match[5], second = +(match[6] || 0);
  if (mo < 1 || mo > 12 || day < 1 || day > new Date(Date.UTC(y, mo, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return null;
  var iso = raw.replace(' ', 'T');
  if (!match[8]) iso += '+09:00';
  var date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}
function cp15Phone_(v) { return String(v || '').replace(/\D/g, ''); }
function cp15Hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function cp15Hash_(value) { return cp15Hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)); }
