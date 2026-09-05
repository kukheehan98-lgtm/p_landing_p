#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   우리동네 컬처픽_포항 — 접수 마감 속도 관측
   ------------------------------------------------------------------
   접수가 열리는 순간 정원이 얼마나 빨리 차는지 기록합니다.

   이 서비스는 「선착순이라 알림이 없으면 못 잡는다」를 전제로 만들어졌는데,
   그게 사실인지 우리는 아직 모릅니다. 정원 6가족이 30초에 차는지 사흘
   걸리는지에 따라 알림을 언제 보내야 하는지, 어떤 강좌를 골라야 하는지가
   완전히 달라집니다. 추측 대신 재려고 만든 도구입니다.

   접수일을 적어두지 않습니다. data/programs.json 에서 「오늘 열리는 강좌」를
   찾아 그 시각에 맞춰 스스로 깨어납니다.

     node crawler/observe.js          예정된 관측이 있으면 수행 (없으면 즉시 종료)
     node crawler/observe.js --now    지금 한 번만 찍어보기 (점검용)

   결과: data/fill-log.csv  (한 줄 = 한 시점의 한 강좌)
   ══════════════════════════════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { SOURCES, parseList } = require('./parser.js');

const ROOT     = path.join(__dirname, '..');
const DATA     = path.join(ROOT, 'data', 'programs.json');
const LOG      = path.join(ROOT, 'data', 'fill-log.csv');
const HEADER   = 'at,minutesAfterOpen,id,org,title,enrolled,capacity,waitEnrolled,waitCapacity,openAt\n';

/* 접수 시작을 기준으로 몇 분 뒤에 찍을지.
   앞쪽을 촘촘하게 둔 이유: 1분 안에 마감되는지가 가장 알고 싶은 것입니다.
   -1 은 시작 직전 기준값입니다. */
/* 예행연습 때는 OBSERVE_OFFSETS 로 짧게 바꿔 씁니다 (예: "-0.2,0,0.3,0.6") */
const OFFSETS = (process.env.OBSERVE_OFFSETS || '-1,0,0.5,1,2,3,5,8,12,20,30,45,60,90,120')
  .split(',').map(Number);

/* 이 시간 안에 열리는 강좌가 있으면 대기했다가 관측합니다.
   윈도우 작업 스케줄러가 5분마다 깨우므로 그보다 넉넉하게 잡습니다. */
const LOOKAHEAD_MIN = 7;

const NOW_MODE = process.argv.includes('--now');
const DRY      = process.argv.includes('--dry');   /* 기록은 하되 올리지 않음 (예행연습) */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function toDate(s) {
  const p = String(s).split(/[-\s:]+/);
  return new Date(+p[0], +p[1] - 1, +p[2], +(p[3] || 0), +(p[4] || 0));
}

function stamp(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/* 오늘 접수가 열리는 강좌를 시각별로 묶습니다.
   같은 시각에 여러 강좌가 열리면 한 번의 요청으로 함께 봅니다. */
function todaysOpenings() {
  const all = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const today = stamp(new Date()).slice(0, 10);
  const groups = new Map();

  for (const p of all) {
    if (!p.openAt || p.openAt.slice(0, 10) !== today) continue;
    if (!groups.has(p.openAt)) groups.set(p.openAt, []);
    groups.get(p.openAt).push(p);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/* 이미 관측을 마친 시각인지 — 5분마다 깨어나므로 중복 실행을 막아야 합니다 */
function alreadyObserved(openAt) {
  if (!fs.existsSync(LOG)) return false;
  return fs.readFileSync(LOG, 'utf8').includes(',' + openAt + '\n');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function append(rows) {
  if (!fs.existsSync(LOG)) {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.writeFileSync(LOG, HEADER);
  }
  fs.appendFileSync(LOG, rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n');
}

/* 관측 대상이 속한 기관만 긁습니다. 필요 없는 곳을 부르지 않습니다. */
async function snapshot(targets) {
  const keys = [...new Set(targets.map(t => t.id.replace(/-[^-]*$/, '')))];
  const found = new Map();

  for (const src of SOURCES) {
    if (!keys.some(k => k === src.key)) continue;
    try {
      const rows = parseList(await get(src.base + src.listPath), src);
      for (const r of rows) found.set(r.id, r);
    } catch (err) {
      console.warn(`  ${src.name} 실패: ${err.message}`);
    }
  }
  return found;
}

async function observe(openAt, targets) {
  const open = toDate(openAt);
  console.log(`관측 시작 — ${openAt} 접수 ${targets.length}건`);
  targets.forEach(t => console.log(`  · ${t.org} ${t.title} (정원 ${t.capacity})`));

  for (const off of OFFSETS) {
    const when = new Date(open.getTime() + off * 60000);
    const wait = when - Date.now();
    if (wait > 0) await sleep(wait);
    else if (wait < -90000) continue;          // 한참 지난 시점은 건너뜁니다

    const found = await snapshot(targets);
    const rows = [];
    for (const t of targets) {
      const live = found.get(t.id);
      if (!live) continue;
      rows.push([stamp(new Date()), off, t.id, t.org, t.title,
                 live.enrolled, live.capacity, live.waitEnrolled, live.waitCapacity, openAt]);
    }
    if (rows.length) {
      append(rows);
      console.log(`  ${off >= 0 ? '+' : ''}${off}분  ` +
        rows.map(r => `${r[4].slice(0, 14)} ${r[5]}/${r[6]}`).join(' | '));
    }
  }
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (err) {
    console.warn('git 실패:', err.message);
    return '';
  }
}

function publish(openAt) {
  if (DRY) { console.log('예행연습 — 올리지 않습니다'); return; }
  if (!git('status', '--porcelain', '--', 'data/fill-log.csv')) return;
  git('add', 'data/fill-log.csv');
  git('commit', '-q', '-m', `Log how fast ${openAt} filled up`);
  git('push', '-q', 'origin', 'main');
  console.log('기록을 올렸습니다');
}

async function main() {
  if (NOW_MODE) {
    const all = JSON.parse(fs.readFileSync(DATA, 'utf8')).filter(p => p.openAt && p.capacity);
    const targets = all.slice(0, 3);
    console.log('점검 모드 — 지금 한 번만 찍습니다');
    const found = await snapshot(targets);
    targets.forEach(t => {
      const l = found.get(t.id);
      console.log(`  ${t.org} ${t.title}: ${l ? l.enrolled + '/' + l.capacity : '목록에 없음'}`);
    });
    return;
  }

  const openings = todaysOpenings();
  if (!openings.length) { console.log('오늘 접수가 열리는 강좌가 없습니다'); return; }

  for (const [openAt, targets] of openings) {
    if (alreadyObserved(openAt)) continue;
    const minsAway = (toDate(openAt) - Date.now()) / 60000;
    if (minsAway > LOOKAHEAD_MIN) continue;      // 아직 이릅니다 — 다음 호출에서
    if (minsAway < -5) continue;                 // 이미 지났습니다

    await observe(openAt, targets);
    publish(openAt);
    return;                                      // 한 번에 한 시각만
  }
  console.log('지금 관측할 것이 없습니다');
}

main().catch(err => { console.error('관측 실패:', err.message); process.exit(1); });
