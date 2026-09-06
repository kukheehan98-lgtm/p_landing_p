#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   우리동네 컬처픽_포항 — 수집 실행기
   ------------------------------------------------------------------
   기관 홈페이지를 읽어 강좌 데이터를 갱신합니다.
   깃허브 액션이 매일 새벽 이 파일을 실행합니다.

     node crawler/crawl.js            실제 수집 후 파일 갱신
     node crawler/crawl.js --dry      수집만 하고 파일은 건드리지 않음

   내보내는 것 두 가지
     data/programs.json   강좌 데이터 (기록용 · 변경 이력이 git 에 남습니다)
     index.html           안에 박힌 JSON 블록을 같은 내용으로 갈아 끼웁니다
                          → 화면은 네트워크 요청 없이 즉시 그려집니다
   ══════════════════════════════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');

const { SOURCES, parseList, parseDetail, lifecycle } = require('./parser.js');
const { curate } = require('./curate.js');

const ROOT      = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'programs.json');
const HTML_FILE = path.join(ROOT, 'index.html');
const MANUAL    = path.join(__dirname, 'manual.json');

const DRY = process.argv.indexOf('--dry') !== -1;

/* 기관 서버에 부담을 주지 않도록 요청 사이에 쉽니다 */
const DELAY_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 수집이 망가졌을 때 멀쩡한 데이터를 덮어쓰지 않기 위한 최소선 ──
   페이지 구조가 바뀌거나 서버가 장애면 0건이 옵니다. 그때 그대로 반영하면
   사이트가 텅 빕니다. 개별 강좌는 오직 날짜로만 사라지게 하고,
   수집 결과 자체가 수상하면 아예 쓰지 않고 실패로 끝냅니다. */
const MIN_ROWS = { 'phlib': 20, 'gbelib-yi': 5, 'gsei': 3, 'phcf': 2 };

/* 기관 사이트가 왜 막혔는지는 상태 코드만 봐서는 알기 어렵습니다.
   접속 자체가 안 된 건지, 차단당한 건지, 페이지가 바뀐 건지 구분되도록
   실패 사유를 그대로 남깁니다. */
/* 기관 사이트가 첫 방문에 세션 쿠키를 심고, 그게 없으면 목록을 안 주는
   경우가 있습니다. 도메인별로 쿠키를 기억해 다음 요청에 실어 보냅니다. */
const jar = new Map();

function cookieFor(url) {
  return jar.get(new URL(url).host) || '';
}

function rememberCookies(url, res) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (!set.length) return;
  const host = new URL(url).host;
  const have = new Map(
    (jar.get(host) || '').split('; ').filter(Boolean).map(c => [c.split('=')[0], c])
  );
  for (const c of set) {
    const pair = c.split(';')[0];
    have.set(pair.split('=')[0], pair);
  }
  jar.set(host, [...have.values()].join('; '));
}

async function get(url) {
  let res;
  const headers = {
    /* 기본 헤더만 보내면 거르는 기관 사이트가 있습니다 */
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'X-Requested-With': 'XMLHttpRequest'
  };
  const cookie = cookieFor(url);
  if (cookie) headers.Cookie = cookie;

  try {
    res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  } catch (err) {
    throw new Error(`접속 실패 (${err.name}: ${err.message}) ${url}`);
  }
  rememberCookies(url, res);

  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const body = await res.text();
  if (body.length < 500) {
    /* 무엇이 돌아왔는지 알아야 차단인지 세션 문제인지 구분됩니다 */
    const peek = body.replace(/\s+/g, ' ').slice(0, 220);
    throw new Error(`응답이 ${body.length}자뿐 — ${url}\n      돌아온 내용: ${peek}`);
  }
  return body;
}

/* 목록을 요청하기 전에 기관 첫 화면을 한 번 열어 세션을 받아둡니다 */
async function warmUp(src) {
  try {
    await get(src.base + '/');
  } catch (err) {
    /* 첫 화면이 안 열려도 목록은 될 수 있으니 그냥 넘어갑니다 */
  }
  await sleep(DELAY_MS);
}

async function collectSource(src) {
  /* JSON 주소는 세션을 요구하지 않으므로 첫 화면을 열 필요가 없습니다 */
  if (src.format !== 'json') await warmUp(src);

  const rows = parseList(await get(src.base + src.listPath), src);
  console.log(`  ${src.name}: 목록 ${rows.length}건`);

  const floor = MIN_ROWS[src.key] || 1;
  if (rows.length < floor) {
    throw new Error(`${src.name} 수집 결과가 ${rows.length}건 — 최소 ${floor}건 미만이라 중단합니다`);
  }
  if (!src.needDetail) return rows;

  /* 목록에 접수기간이 없는 기관만 상세를 봅니다.
     이미 끝난 강좌는 볼 필요가 없어 요청 수를 줄입니다. */
  const today = new Date().toISOString().slice(0, 10);
  let looked = 0;

  for (const ev of rows) {
    if (ev.eventTo && ev.eventTo < today) continue;
    try {
      const d = parseDetail(await get(ev.url));
      const seats = /(\d+)\s*명\s*\/\s*(\d+)\s*명/.exec(d.seats || '');
      Object.assign(ev, {
        openAt:   d.openAt   || ev.openAt,
        deadline: d.deadline || ev.deadline,
        fee:      d.fee      || ev.fee,
        teacher:  d.teacher  || ev.teacher,
        enrolled: seats ? +seats[1] : ev.enrolled,
        capacity: seats ? +seats[2] : ev.capacity,
        eventFrom: d.eventFrom || ev.eventFrom,
        eventTo:   d.eventTo || d.eventFrom || ev.eventTo,
        applyRule: d.applyRule || ev.applyRule
      });
      looked++;
    } catch (err) {
      /* 한 건이 실패해도 전체를 버리지 않습니다 — 접수기간이 비면 화면에서 빠집니다 */
      console.warn(`    상세 실패 ${ev.id}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`  ${src.name}: 상세 ${looked}건 확인`);
  return rows;
}

/* JSON 을 <script> 안에 넣으므로 '<' 를 이스케이프합니다.
   제목에 <아침놀> 같은 꺾쇠가 실제로 들어 있습니다. */
function toEmbeddedJson(cards) {
  return JSON.stringify(cards, null, 2).replace(/</g, '\\u003c');
}

/* 호스트(윈도우 PC 는 이미 KST, 깃허브 액션은 UTC)와 무관하게 항상 한국 날짜를 얻습니다.
   "정보 기준일" 이 실제 수집 시각을 보여주게 하는 데 씁니다. */
function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function replaceJsonBlock(html, id, value) {
  const open  = `<script type="application/json" id="${id}">`;
  const close = '</script>';
  const i = html.indexOf(open);
  if (i === -1) throw new Error(`index.html 에 ${id} 블록이 없습니다`);
  const j = html.indexOf(close, i);
  return html.slice(0, i + open.length) + JSON.stringify(value) + html.slice(j);
}

function patchHtml(cards, freshnessDate, sourceDates) {
  let html = fs.readFileSync(HTML_FILE, 'utf8');

  const open = '<script type="application/json" id="programsData">';
  const i = html.indexOf(open);
  if (i === -1) throw new Error('index.html 에 programsData 블록이 없습니다');
  const j = html.indexOf('</script>', i);
  const nextCards = html.slice(0, i + open.length) + '\n' + toEmbeddedJson(cards) + '\n' + html.slice(j);
  const cardsChanged = nextCards !== html;
  html = nextCards;

  /* 날짜 문자열은 하루에 한 번만 실제로 바뀝니다 — 같은 날 두 번째 실행에서는
     이 부분이 그대로라, 강좌 내용도 안 바뀌었다면 커밋이 새로 생기지 않습니다.

     freshnessDate 는 오늘이 아니라 "가장 오래 확인 못 한 기관" 의 날짜입니다.
     예전에는 기관 하나가 막혀도 무조건 오늘 날짜를 찍어서, 그 기관 몫이
     실제로는 며칠 전 데이터인데 화면은 "오늘 확인함"이라고 말했습니다. */
  html = replaceJsonBlock(html, 'dataUpdatedAt', freshnessDate);
  html = replaceJsonBlock(html, 'sourceUpdatedAt', sourceDates);

  const original = fs.readFileSync(HTML_FILE, 'utf8');
  if (html === original) return { cardsChanged: false };
  fs.writeFileSync(HTML_FILE, html);
  return { cardsChanged };
}

/* 지금 화면에 실려 있는 데이터. 어느 기관이 막혔을 때 그 기관 몫을
   그대로 이어받기 위해 읽습니다 — 못 봤다고 지우면 안 됩니다. */
function previousCards() {
  try {
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    const open = '<script type="application/json" id="programsData">';
    const i = html.indexOf(open);
    const j = html.indexOf('</script>', i);
    return JSON.parse(html.slice(i + open.length, j).replace(/\\u003c/g, '<'));
  } catch (err) {
    return [];
  }
}

/* 기관별로 "마지막으로 실제 확인에 성공한 날"을 기억합니다.
   실패한 기관은 이 값을 갱신하지 않고 예전 값을 그대로 들고 갑니다. */
function previousSourceDates() {
  try {
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    const open = '<script type="application/json" id="sourceUpdatedAt">';
    const i = html.indexOf(open);
    const j = html.indexOf('</script>', i);
    return JSON.parse(html.slice(i + open.length, j));
  } catch (err) {
    return {};
  }
}

async function main() {
  console.log(`수집 시작 — ${new Date().toISOString()}`);

  const prev = previousCards();
  let all = [];
  const failed = [];

  for (const src of SOURCES) {
    try {
      all = all.concat(await collectSource(src));
    } catch (err) {
      /* 한 기관이 막혀도 나머지는 갱신합니다. 막힌 기관의 강좌는
         지난번 것을 그대로 두고, 지난 프로그램은 화면에서 날짜로 걸러집니다. */
      console.warn(`  ${src.name}: 실패 — ${err.message}`);
      failed.push(src.key);
    }
    await sleep(DELAY_MS);
  }

  if (failed.length === SOURCES.length) {
    throw new Error('모든 기관 수집 실패 — 기존 데이터를 그대로 둡니다');
  }

  const manual = JSON.parse(fs.readFileSync(MANUAL, 'utf8')).filter(m => m.id);
  all = all.concat(manual);
  console.log(`수집 합계 ${all.length}건 (실패한 기관: ${failed.join(', ') || '없음'})`);

  let cards = curate(all, lifecycle, new Date().toISOString());

  /* 막힌 기관 몫을 지난 데이터에서 이어붙입니다 */
  if (failed.length) {
    const seen = {};
    cards.forEach(c => { seen[c.id] = true; });
    const carried = prev.filter(c =>
      !seen[c.id] && failed.some(k => c.id.indexOf(k + '-') === 0));
    console.log(`  이어받은 기존 강좌 ${carried.length}건`);
    cards = cards.concat(carried);
  }

  console.log(`큐레이션 후 ${cards.length}건`);
  if (!cards.length) throw new Error('큐레이션 결과가 0건 — 반영하지 않습니다');

  if (DRY) {
    console.log(cards.slice(0, 5).map(c => `  ${c.id} ${c.enrolled}/${c.capacity} ${c.openAt} ${c.title}`).join('\n'));
    return;
  }

  /* 성공한 기관만 오늘 날짜로 갱신하고, 실패한 기관은 예전 날짜를 유지합니다.
     화면에 보여줄 "정보 기준일"은 그중 가장 오래된 날짜 — 가장 약한 고리
     기준으로 정직하게 말합니다. 하나라도 실패하면 "오늘"이라고 못 박지 않습니다. */
  const today = seoulToday();
  const sourceDates = previousSourceDates();
  SOURCES.forEach(src => {
    if (failed.indexOf(src.key) === -1) sourceDates[src.key] = today;
  });
  const known = Object.keys(sourceDates).map(k => sourceDates[k]).filter(Boolean);
  const freshnessDate = known.length ? known.reduce((a, b) => (a < b ? a : b)) : today;
  if (freshnessDate !== today) {
    console.log(`  기준일은 ${freshnessDate} — 아직 확인 못 한 기관이 있습니다`);
  }

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2) + '\n');
  const { cardsChanged } = patchHtml(cards, freshnessDate, sourceDates);
  console.log(cardsChanged ? '완료 — 데이터가 바뀌었습니다' : '완료 — 강좌 내용은 그대로 (기준일만 확인)');
}

main().catch(err => {
  console.error('수집 실패:', err.message);
  console.error(err.stack);
  process.exit(1);
});
