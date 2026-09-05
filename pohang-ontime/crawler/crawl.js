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
const MIN_ROWS = { 'phlib': 20, 'gbelib-yi': 5, 'gsei': 3 };

/* 기관 사이트가 왜 막혔는지는 상태 코드만 봐서는 알기 어렵습니다.
   접속 자체가 안 된 건지, 차단당한 건지, 페이지가 바뀐 건지 구분되도록
   실패 사유를 그대로 남깁니다. */
async function get(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        /* 기본 헤더만 보내면 거르는 기관 사이트가 있습니다 */
        'User-Agent': 'Mozilla/5.0 (compatible; culturepick-pohang/1.0; +https://github.com/kukheehan98-lgtm/p_landing_p)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000)
    });
  } catch (err) {
    throw new Error(`접속 실패 (${err.name}: ${err.message}) ${url}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const body = await res.text();
  if (body.length < 500) throw new Error(`응답이 ${body.length}자뿐 — 차단 가능성 ${url}`);
  return body;
}

async function collectSource(src) {
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
        eventTo:   d.eventTo || d.eventFrom || ev.eventTo
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

function patchHtml(cards) {
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const open  = '<script type="application/json" id="programsData">';
  const close = '</script>';
  const i = html.indexOf(open);
  if (i === -1) throw new Error('index.html 에 programsData 블록이 없습니다');
  const j = html.indexOf(close, i);

  const next = html.slice(0, i + open.length) + '\n' + toEmbeddedJson(cards) + '\n' + html.slice(j);
  if (next === html) return false;
  fs.writeFileSync(HTML_FILE, next);
  return true;
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

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2) + '\n');
  const changed = patchHtml(cards);
  console.log(changed ? '완료 — 데이터가 바뀌었습니다' : '완료 — 바뀐 내용 없음');
}

main().catch(err => {
  console.error('수집 실패:', err.message);
  console.error(err.stack);
  process.exit(1);
});
