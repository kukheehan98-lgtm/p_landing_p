/* ══════════════════════════════════════════════════════════════════
   우리동네 컬처픽_포항 — 큐레이션 규칙
   ------------------------------------------------------------------
   「어떤 프로그램을 보여줄지」와 「어느 칩에 넣을지」를 규칙으로 정합니다.

   사람이 시트에 손으로 적어두는 방식이 아니라 코드로 두는 이유:
     · 매일 새벽 수집이 돌아도 큐레이션이 날아가지 않습니다
     · 기준이 한 곳에 적혀 있어 나중에 왜 이렇게 뽑혔는지 알 수 있습니다
     · 새 강좌가 들어와도 사람이 손대지 않아도 분류됩니다

   타깃: 30~40대 유아·초등 학부모
   메시지: 「작은 정원 · 선착순」 — 알림이 실제로 자리를 가르는 프로그램
   ══════════════════════════════════════════════════════════════════ */

/* ── 대상 분류 ───────────────────────────────────────────────── */
function segment(target) {
  var t = String(target || '');
  if (/시니어|60세|어르신|노인/.test(t))        return 'senior';
  if (/가족/.test(t))                           return 'family';
  /* '누구나'·'전체'는 나이 제한이 없다는 뜻이라 아이도 갈 수 있습니다.
     성인 전용으로 묶으면 주말 칩에서 빠져 학부모 눈에 안 띕니다.
     대상이 아예 비어 있는 것도 같게 봅니다 (전시·축제가 그렇습니다). */
  if (!t || /누구나|전체|제한 ?없음/.test(t))    return 'anyone';
  if (/유아|미취학/.test(t) && !/초등/.test(t)) return 'toddler';
  if (/초등|어린이|학생|청소년/.test(t))        return 'elementary';
  if (/학부모|부모/.test(t))                    return 'parent';
  return 'adult';
}

/* ── 시간대 ─────────────────────────────────────────────────── */
function timeSlot(ev) {
  var wd = ev.weekday || '';
  var h  = parseInt(String(ev.eventTime || '').slice(0, 2), 10);
  if (/토|일/.test(wd))  return 'weekend';
  if (!wd)               return 'unknown';
  if (isNaN(h))          return 'unknown';
  if (h < 13)            return 'weekday-morning';
  if (h < 18)            return 'weekday-afternoon';
  return 'weekday-evening';
}

/* ── 유료 걸러내기 ──────────────────────────────────────────────
   도서관·교육청 프로그램은 무료가 원칙이라 수강료 항목이 비어 있기도 합니다.
   금액이 명시된 것만 제외합니다 — 비어 있다고 유료로 보면 다 사라집니다. */
function isPaid(ev) {
  var fee = String(ev.fee || '');
  return /[0-9][0-9,]*\s*원/.test(fee);
}

/* ── 화면에 올릴지 결정 ─────────────────────────────────────────
   full(정원 마감)을 일부 남기는 이유: 「이런 건 이렇게 빨리 찬다」가
   알림을 신청할 이유 그 자체입니다. 다만 대기라도 걸 수 있는 것만 남깁니다. */
function shouldShow(ev, state) {
  if (isPaid(ev))                            return false;
  if (state === 'closed' || state === 'ended') return false;
  if (state === 'archived')                  return false;

  var seg = segment(ev.target);
  if (seg === 'senior') return false;                       // 공급이 거의 없어 빈 화면이 됩니다

  /* 전시·축제는 기간 중 아무 때나 가면 되므로 시간대 규칙을 적용하지 않습니다 */
  if (ev.kind === 'exhibit') return true;

  /* 성인 대상은 학부모 본인이 갈 만한 시간대만 (주말 · 평일 오전) */
  if (seg === 'adult') {
    var slot = timeSlot(ev);
    if (slot !== 'weekend' && slot !== 'weekday-morning') return false;
  }

  if (state === 'full') {
    var waitOpen = (ev.waitCapacity || 0) > (ev.waitEnrolled || 0);
    return waitOpen && ev.capacity != null && ev.capacity <= 12;
  }
  return true;
}

/* full 상태는 화면을 잡아먹으므로 정원이 작은 순으로 이만큼만 남깁니다 */
var FULL_LIMIT = 6;

/* ── 칩 분류 ────────────────────────────────────────────────── */
function presetsFor(ev) {
  var t = String(ev.target || '');
  var seg = segment(t);
  var slot = timeSlot(ev);
  var out = [];

  if (/유아|미취학|[5-7]\s*세|6~7|6-7/.test(t))     out.push('kid');
  if (/초등|어린이/.test(t))                        out.push('elem');
  if (seg === 'family')                             out.push('kid', 'elem');
  if (slot === 'weekend' &&
      seg !== 'adult' && seg !== 'senior')          out.push('weekend');
  if (seg === 'anyone' && slot === 'weekend')       out.push('weekend');
  if (slot === 'weekday-morning')                   out.push('morning');

  /* 전시는 기간이 길어 대개 주말이 끼지만, 하루짜리 상영·행사는 아닙니다.
     실제로 주말이 걸쳐 있을 때만 주말 칩에 넣습니다. */
  if (ev.kind === 'exhibit') {
    out.push('outing');
    if (spansWeekend(ev.eventFrom, ev.eventTo)) out.push('weekend');
  }

  /* 중복 제거 */
  var seen = {}, uniq = [];
  for (var i = 0; i < out.length; i++) {
    if (!seen[out[i]]) { seen[out[i]] = 1; uniq.push(out[i]); }
  }
  return uniq;
}

/* 기간 안에 토요일이나 일요일이 하루라도 들어 있는지 */
function spansWeekend(from, to) {
  if (!from) return false;
  var a = new Date(String(from).slice(0, 10).replace(/-/g, '/'));
  var b = to ? new Date(String(to).slice(0, 10).replace(/-/g, '/')) : a;
  if (isNaN(a) || isNaN(b)) return false;
  /* 7일 이상이면 주말이 반드시 끼어 있습니다 */
  if ((b - a) / 86400000 >= 6) return true;
  for (var d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) return true;
  }
  return false;
}

/* ── 기관 짧은 이름 (카드 배지용) ────────────────────────────── */
function shortOrg(org) {
  var s = String(org || '')
    .replace(/^경상북도교육청\s*/, '')
    .replace(/작은도서관$/, '')
    .replace(/도서관$/, '')
    .replace(/\s+$/, '');
  return s || org;
}

/* ── 진행 일정 문구 ─────────────────────────────────────────── */
function scheduleText(ev) {
  var f = String(ev.eventFrom || '').slice(0, 10).replace(/-/g, '.');
  var t = String(ev.eventTo   || '').slice(0, 10).replace(/-/g, '.');
  var wd = ev.weekday ? '(' + ev.weekday + ')' : '';
  var time = ev.eventTime || '';
  if (!f) return '';
  if (!t || f === t) return (f + wd + ' ' + time).replace(/\s+/g, ' ').trim() + ' (1회)';

  /* 해를 넘기면 끝나는 해도 적습니다 — '2026.06.12 ~ 05.30' 은 오해를 삽니다 */
  var tail = f.slice(0, 4) === t.slice(0, 4) ? t.slice(5) : t;
  return (f + ' ~ ' + tail + (ev.weekday ? ' 매주 ' + ev.weekday : '') + ' ' + time)
    .replace(/\s+/g, ' ').trim();
}

/* ── 화면이 쓰는 형태로 변환 ─────────────────────────────────── */
function toCard(ev) {
  return {
    id:        ev.id,
    org:       ev.org,
    orgShort:  ev.orgShort || shortOrg(ev.org),
    title:     ev.title,
    place:     ev.place,
    target:    ev.target,
    fee:       ev.fee || '무료',
    capacity:     ev.capacity,
    enrolled:     ev.enrolled,
    waitCapacity: ev.waitCapacity || 0,
    waitEnrolled: ev.waitEnrolled || 0,
    openAt:    ev.openAt || null,
    deadline:  ev.deadline || null,
    eventEnd:  ev.eventTo || ev.eventFrom || null,
    schedule:  ev.schedule || scheduleText(ev),
    applyRule: ev.applyRule || '',
    presets:   ev.presets || presetsFor(ev),
    url:       ev.url
  };
}

/* 같은 프로그램의 여러 회차(10시·13시·15시반 등)는 접수 시각이 같아
   알림 관점에서 하나입니다. 카드 세 장이 되면 목록만 지저분해집니다.
   반 편성이 다른 것(A반·B반)은 대상 학년이 달라 따로 둡니다. */
function dedupeKey(ev) {
  var t = String(ev.title || '')
    .replace(/\([^)]*\)\s*$/, '')     // 끝에 붙은 (일반) 같은 꼬리표
    .replace(/\s+/g, '');
  return ev.org + '|' + t + '|' + (ev.openAt || '') + '|' + (ev.target || '');
}

/* ── 전체 큐레이션 ──────────────────────────────────────────── */
function curate(all, lifecycle, now) {
  var kept = [], full = [], seen = {};

  for (var i = 0; i < all.length; i++) {
    var ev = all[i];
    /* 전시도 날짜 검사를 그대로 받습니다. 예전에는 손으로 넣은 전시에
       날짜가 없어 건너뛰었는데, 그 예외 때문에 끝난 전시 수백 건이
       한꺼번에 통과했습니다. */
    var state = lifecycle(ev, now);
    if (!shouldShow(ev, state)) continue;

    var k = dedupeKey(ev);
    if (seen[k]) continue;
    seen[k] = true;

    (state === 'full' ? full : kept).push(ev);
  }

  full.sort(function (a, b) { return (a.capacity || 99) - (b.capacity || 99); });

  /* 파일에 적히는 순서를 id 로 고정합니다.
     이 PC 와 깃허브 서버가 기관을 도는 순서가 달라, 같은 내용인데도
     배열이 통째로 뒤바뀌어 매번 파일 전체가 바뀐 것처럼 보였습니다.
     (화면에 보이는 순서는 여기와 무관하게 renderCards 가 따로 정합니다) */
  return kept.concat(full.slice(0, FULL_LIMIT))
    .map(toCard)
    .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
}

if (typeof module !== 'undefined') {
  module.exports = { curate: curate, toCard: toCard, segment: segment, timeSlot: timeSlot,
                     presetsFor: presetsFor, shortOrg: shortOrg, scheduleText: scheduleText,
                     shouldShow: shouldShow };
}
