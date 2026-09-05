/* ══════════════════════════════════════════════════════════════════
   우리동네 컬처픽_포항 — 강좌 수집 파서
   ------------------------------------------------------------------
   기관 홈페이지의 HTML 을 우리 서비스의 강좌 데이터로 번역합니다.

   ★ 이 파일은 나중에 Google Apps Script 에 그대로 붙여넣습니다.
     그래서 브라우저 전용 기능(DOMParser, fetch, 화살표 함수)을
     일부러 쓰지 않고, 정규식과 var 만으로 작성했습니다.

   기관마다 목록 화면 구조가 다르므로 「어댑터」를 하나씩 둡니다.
   새 기관을 붙일 때 하는 일은 어댑터 하나를 추가하는 것뿐이고,
   출력 형태(normalize)는 모든 기관이 똑같습니다.
   ══════════════════════════════════════════════════════════════════ */

/* ── 수집 대상 기관 ─────────────────────────────────────────────
   adapter : 목록 화면을 읽는 방식
     'phlib'  — 표(table) 구조. 접수기간이 목록에 없어 상세 요청이 필요합니다.
     'gbelib' — 라벨(label) 구조. 접수기간까지 목록에 있어 상세가 필요 없습니다. */
var SOURCES = [
  {
    key: 'phlib',
    name: '포항시립도서관',
    adapter: 'phlib',
    base: 'https://phlib.pohang.go.kr',
    listPath: '/phlib/module/teach/index.do?menu_idx=24',
    detailPath: '/phlib/module/teach/detail.do?menu_idx=24&group_idx={group}&teach_idx={id}',
    needDetail: true
  },
  {
    key: 'gbelib-yi',
    name: '경상북도교육청 영일도서관',
    adapter: 'gbelib',
    base: 'https://www.gbelib.kr',
    listPath: '/yi/module/teach/index.do?menu_idx=209&searchCate1=16,17,18',
    detailPath: '/yi/module/teach/detail.do?menu_idx=209&group_idx={group}&teach_idx={id}',
    needDetail: false
  }
];

/* ══════════════ 문자열 도구 ══════════════ */

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ');
}

function decodeEnt(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/* 태그 제거 → 엔티티 복원 → 공백 정리. 파서 전체가 이 함수를 거칩니다. */
function clean(s) {
  return decodeEnt(stripTags(s)).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
}

function toInt(s) {
  var n = parseInt(String(s).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : n;
}

/* '2026-09-08  10:30' / '2026.9.8' → '2026-09-08 10:30'
   시각이 없으면 날짜만 돌려줍니다. 선착순 강좌는 분 단위가 생명이라
   있는 그대로 살려 둡니다. */
function normDateTime(s) {
  var t = clean(s);
  var d = t.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (!d) return '';
  var out = d[1] + '-' + pad2(d[2]) + '-' + pad2(d[3]);
  var rest = t.slice(t.indexOf(d[0]) + d[0].length);
  var h = rest.match(/^[^0-9]{0,6}(\d{1,2}):(\d{2})/);
  if (h) out += ' ' + pad2(h[1]) + ':' + h[2];
  return out;
}

function pad2(v) {
  var s = String(v);
  return s.length < 2 ? '0' + s : s;
}

/* '2026-09-01 10:30 ~ 2026-09-10 23:59' → { from:…, to:… } */
function splitPeriod(s) {
  var t = clean(s);
  var parts = t.split(/~/);
  return {
    from: normDateTime(parts[0] || ''),
    to:   normDateTime(parts[1] || '')
  };
}

/* 'n / m' 을 순서대로 모두 뽑습니다. 앞이 신청, 뒤가 대기입니다. */
function pickRatios(s) {
  var t = clean(s);
  var re = /(\d+)\s*\/\s*(\d+)/g;
  var out = [], m;
  while ((m = re.exec(t)) !== null) out.push([toInt(m[1]), toInt(m[2])]);
  return out;
}

/* ══════════════ 공통 출력 형태 ══════════════
   어느 기관에서 왔든 결과는 이 모양으로 통일됩니다.
   화면과 시트는 이 형태만 알면 되고, 기관이 늘어도 바뀌지 않습니다. */
function normalize(src, raw) {
  return {
    id:        src.key + '-' + raw.srcId,   // 기관코드-원본ID · 절대 바뀌지 않는 열쇠
    source:    src.key,
    org:       raw.org || src.name,
    title:     raw.title || '',
    target:    raw.target || '',
    place:     raw.place || '',
    teacher:   raw.teacher || '',
    fee:       raw.fee || '',
    enrolled:  raw.enrolled,
    capacity:  raw.capacity,
    waitEnrolled: raw.waitEnrolled,
    waitCapacity: raw.waitCapacity,
    openAt:    raw.openAt || '',      // 접수 시작 (분 단위)
    deadline:  raw.deadline || '',    // 접수 마감
    eventFrom: raw.eventFrom || '',   // 강의/행사 시작일
    eventTo:   raw.eventTo || raw.eventFrom || '',
    eventTime: raw.eventTime || '',
    weekday:   raw.weekday || '',
    url:       raw.url || '',
    srcId:     raw.srcId,
    groupIdx:  raw.groupIdx || ''
  };
}

function detailUrl(src, groupIdx, srcId) {
  return src.base + src.detailPath
    .replace('{group}', groupIdx || '')
    .replace('{id}', srcId);
}

/* ══════════════ 어댑터 ① 포항시립도서관 (표 구조) ══════════════
   한 줄(tr)에 detail-btn 앵커가 있으면 강좌 행으로 봅니다.
   접수기간은 목록에 없으므로 상세 페이지에서 채워야 합니다. */
function parsePhlibList(html, src) {
  var out = [];
  var rows = html.split(/<tr[\s>]/i);

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var a = row.match(/<a\b([^>]*class="[^"]*detail-btn[^"]*"[^>]*)>([\s\S]*?)<\/a>/i);
    if (!a) continue;

    var srcId = (a[1].match(/keyValue3="(\d+)"/i) || [])[1];
    var group = (a[1].match(/keyValue1="(\d+)"/i) || [])[1];
    if (!srcId) continue;

    var code   = (row.match(/<span class="codeName[^"]*">([^<]*)<\/span>/i) || [])[1];
    var target = (row.match(/대상\s*:\s*([^<]*)/) || [])[1];
    var place  = (row.match(/장소\s*:\s*([^<]*)/) || [])[1];

    /* 신청/대기 현황은 'visit' 칸에만 있습니다.
       모집방법 칸에도 같은 숫자가 보이므로 칸을 특정해야 합니다. */
    var visit = row.match(/<td[^>]*class="[^"]*visit[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    var r = visit ? pickRatios(visit[1]) : [];

    /* 행사일이 들어 있는 칸을 찾습니다 (날짜 + 시각이 함께 있는 칸) */
    var ev = findEventCell(row);

    /* 버튼이 알려주는 접수 가능 여부
         없음 → 접수기간이 아님   1 → 접수하기(자리 있음)   2 → 대기신청(정원 마감) */
    var st = (row.match(/apply_status="(\d+)"/i) || [])[1];

    out.push(normalize(src, {
      srcId: srcId,
      groupIdx: group,
      org: resolveOrg(clean(code), clean(place)),
      title: clean(a[2]),
      target: stripSeatCount(clean(target)),
      place: clean(place),
      enrolled:     r[0] ? r[0][0] : null,
      capacity:     r[0] ? r[0][1] : null,
      waitEnrolled: r[1] ? r[1][0] : null,
      waitCapacity: r[1] ? r[1][1] : null,
      eventFrom: ev.from,
      eventTo:   ev.to,
      eventTime: ev.time,
      weekday:   ev.weekday,
      applyStatus: st ? toInt(st) : 0,
      url: detailUrl(src, group, srcId)
    }));
  }
  return out;
}

/* 기관명 정하기.
   목록의 분류 딱지는 관 이름이 아닐 때가 있습니다 — 「작은도서관」,「독서대전」은
   분류이지 도서관 이름이 아닙니다. 그럴 때는 장소에서 실제 관 이름을 꺼냅니다.
   ('연일 미르작은도서관 …' → '연일 미르작은도서관') */
function resolveOrg(code, place) {
  var generic = /^(작은도서관|독서대전|기타|일반)$/;
  if (code && !generic.test(code)) {
    return /도서관$/.test(code) ? code : code + '도서관';
  }
  var m = String(place || '').match(/^(.*?도서관)/);
  return m ? m[1] : (code || '');
}

/* '성인 8명' → '성인' · 정원은 따로 세는 값이 있으므로 대상에서 떼어냅니다 */
function stripSeatCount(s) {
  return String(s || '').replace(/\s*\d+\s*명\s*$/, '');
}

/* 행사일 칸 찾기 — '2026-09-12 14:00 ~ 15:30 (토)' 또는
   '2026-09-11 ~ 2026-12-11 10:00 ~ 12:00' 형태를 모두 받습니다. */
function findEventCell(row) {
  var cells = row.split(/<td\b/i);
  for (var i = 1; i < cells.length; i++) {
    var txt = clean(cells[i]);
    if (!/\d{4}-\d{2}-\d{2}/.test(txt)) continue;
    if (/대상\s*:|장소\s*:/.test(txt)) continue;

    var dates = txt.match(/\d{4}-\d{2}-\d{2}/g) || [];
    var time  = (txt.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/) || [])[0] || '';
    var wd    = (txt.match(/\(\s*([월화수목금토일])\s*\)/) || [])[1] || '';
    return { from: dates[0] || '', to: dates[1] || dates[0] || '', time: time, weekday: wd };
  }
  return { from: '', to: '', time: '', weekday: '' };
}

/* ══════════════ 어댑터 ② 경북교육청 도서관 (라벨 구조) ══════════════
   숨겨진 #list_mode 블록에 라벨이 붙은 값이 모여 있습니다.
   접수기간·모집대상·접수현황까지 전부 있어 상세 요청이 필요 없습니다. */
function parseGbelibList(html, src) {
  var out = [];
  var start = html.indexOf('id="list_mode"');
  if (start === -1) return out;

  var chunks = html.slice(start).split(/class="op_title category"/i);

  for (var i = 1; i < chunks.length; i++) {
    var c = chunks[i];

    /* 같은 강좌에 앵커가 둘(제목 · 상세보기)이라 제목 쪽만 고릅니다 */
    var anchors = c.match(/<a\b[^>]*class="[^"]*detail-btn[^"]*"[^>]*>[\s\S]*?<\/a>/gi) || [];
    var titleTag = null;
    for (var j = 0; j < anchors.length; j++) {
      if (!/상세보기/.test(anchors[j])) { titleTag = anchors[j]; break; }
    }
    if (!titleTag) continue;

    var srcId = (titleTag.match(/keyValue3="(\d+)"/i) || [])[1];
    var group = (titleTag.match(/keyValue1="(\d+)"/i) || [])[1];
    if (!srcId) continue;

    var period = splitPeriod(labelValue(c, '접수기간'));
    var ev = parseGbelibEventDay(labelValue(c, '강좌일'));
    var r = pickRatios(labelValue(c, '접수현황'));

    out.push(normalize(src, {
      srcId: srcId,
      groupIdx: group,
      org: src.name,
      title: clean(titleTag.replace(/<a\b[^>]*>/i, '')),
      target: labelValue(c, '모집대상'),
      place: labelValue(c, '장소'),
      teacher: labelValue(c, '강사명'),
      fee: labelValue(c, '준비물 및 재료비'),
      enrolled:     r[0] ? r[0][0] : null,
      capacity:     r[0] ? r[0][1] : null,
      waitEnrolled: r[1] ? r[1][0] : null,
      waitCapacity: r[1] ? r[1][1] : null,
      openAt:   period.from,
      deadline: period.to,
      eventFrom: ev.from,
      eventTo:   ev.to,
      eventTime: ev.time,
      weekday:   ev.weekday,
      url: detailUrl(src, group, srcId)
    }));
  }
  return out;
}

/* <label>접수기간 </label> : 값 </div> 에서 값만 꺼냅니다 */
function labelValue(chunk, name) {
  var re = new RegExp('<label>\\s*' + name + '\\s*<\\/label>\\s*:?([\\s\\S]*?)<\\/div>', 'i');
  var m = chunk.match(re);
  if (!m) return '';
  return clean(m[1]).replace(/^:\s*/, '');
}

/* '2026-09-12 ( 토 ) 14:00 ~ 16:00' 을 쪼갭니다 */
function parseGbelibEventDay(s) {
  var txt = clean(s);
  var dates = txt.match(/\d{4}-\d{2}-\d{2}/g) || [];
  return {
    from: dates[0] || '',
    to:   dates[1] || dates[0] || '',
    time: (txt.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/) || [])[0] || '',
    weekday: (txt.match(/\(\s*([월화수목금토일])\s*\)/) || [])[1] || ''
  };
}

/* ══════════════ 상세 페이지 ══════════════
   포항시립도서관·경북교육청 도서관 모두 상세 화면은 같은 표 구조라
   하나의 함수로 처리됩니다. (목록만 서로 다릅니다) */
function parseDetail(html) {
  return {
    openAt:   splitPeriod(thValue(html, '접수기간')).from,
    deadline: splitPeriod(thValue(html, '접수기간')).to,
    fee:      thValue(html, '수강료'),
    teacher:  thValue(html, '강사명'),
    target:   thValue(html, '강의대상'),
    place:    thValue(html, '강의장소'),
    eventFrom: (thValue(html, '강의기간').match(/\d{4}-\d{2}-\d{2}/g) || [])[0] || '',
    eventTo:   (thValue(html, '강의기간').match(/\d{4}-\d{2}-\d{2}/g) || [])[1] || '',
    eventTime: thValue(html, '강의시간'),
    weekday:   thValue(html, '강의요일'),
    seats:     thValue(html, '현재 참여 / 모집')
  };
}

/* <th>이름</th><td>값</td> 에서 값만 꺼냅니다.
   같은 항목이 PC용·모바일용으로 두 번 나오므로 첫 번째만 씁니다. */
function thValue(html, name) {
  var re = new RegExp('<th[^>]*>\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                      '[^<]*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>', 'i');
  var m = html.match(re);
  return m ? clean(m[1]) : '';
}

/* ══════════════ 목록 파싱 진입점 ══════════════ */
function parseList(html, src) {
  if (src.adapter === 'gbelib') return parseGbelibList(html, src);
  return parsePhlibList(html, src);
}

/* ══════════════ 생애주기 — 자동 파기의 실체 ══════════════
   상태를 저장하지 않고 매번 계산합니다.
   크롤러가 멈춰도 지난 강좌는 스스로 화면에서 사라집니다.

     upcoming  접수 시작 전      → 「D-n 접수 시작」
     open      접수중 · 자리 있음 → 「n자리 남음」
     full      정원 마감          → 대기 가능 여부까지 표시
     closed    접수 마감          → 행사일까지는 보관, 화면에서는 내림
     archived  행사까지 끝남      → 완전 파기 */
function lifecycle(ev, now) {
  var t = now ? new Date(now) : new Date();

  if (ev.eventTo && t > endOfDay(ev.eventTo)) return 'archived';
  if (ev.deadline && t > new Date(ev.deadline.replace(' ', 'T'))) return 'closed';
  if (ev.openAt && t < new Date(ev.openAt.replace(' ', 'T'))) return 'upcoming';
  if (ev.capacity && ev.enrolled !== null && ev.enrolled >= ev.capacity) return 'full';
  return 'open';
}

function endOfDay(dateStr) {
  var d = new Date(String(dateStr).slice(0, 10).replace(/-/g, '/') + ' 23:59:59');
  return d;
}

/* 남은 자리 — 「D-4」보다 강한 신호 */
function seatsLeft(ev) {
  if (ev.capacity === null || ev.enrolled === null) return null;
  return Math.max(0, ev.capacity - ev.enrolled);
}

/* Apps Script 로 옮길 때는 이 줄이 무시됩니다 (module 이 없으므로) */
if (typeof module !== 'undefined') {
  module.exports = { SOURCES: SOURCES, parseList: parseList, parseDetail: parseDetail,
                     lifecycle: lifecycle, seatsLeft: seatsLeft, normalize: normalize };
}
