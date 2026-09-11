/* 접수 관측은 이 PC 와 깃허브가 동시에 돌면서 같은 줄을 두 번 적을 수 있습니다.
   observe.js 의 dedupeLog() 가 올리기 직전에 그걸 하나로 줄이는데, 여기서
   가장 중요한 건 «양쪽이 각자 정리해도 결과가 같은가» 입니다.
   결과가 갈리면 서로의 정리를 뒤집으며 커밋이 끝없이 오갑니다. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../pohang-ontime/crawler/observe.js'), 'utf8');

const CRAWLER = path.join(path.sep, 'x', 'crawler');
const LOG  = path.join(CRAWLER, '..', 'data', 'fill-log.csv');
const DATA = path.join(CRAWLER, '..', 'data', 'programs.json');
const HEADER = 'at,minutesAfterOpen,id,org,title,enrolled,capacity,waitEnrolled,waitCapacity,openAt\n';

/* observe.js 는 불러오는 순간 main() 이 돕니다. --plan 으로 띄우고 강좌 목록을
   비워 두면 오늘 볼 것이 없다며 곧장 끝나서, 네트워크도 깃도 건드리지 않습니다. */
function load(logText) {
  const files = new Map([[DATA, '[]']]);
  if (logText != null) files.set(LOG, logText);

  const fakeFs = {
    existsSync:     p => files.has(p),
    readFileSync:   p => { if (!files.has(p)) throw new Error('ENOENT ' + p); return files.get(p); },
    writeFileSync:  (p, v) => { files.set(p, v); },
    appendFileSync: (p, v) => { files.set(p, (files.get(p) || '') + v); },
    mkdirSync:      () => {},
  };

  const context = vm.createContext({
    __dirname: CRAWLER,
    console: {log(){}, warn(){}, error(){}},
    process: {argv: ['node', 'observe.js', '--plan'], env: {}, exit(){}},
    setTimeout, clearTimeout,
    require: name => {
      if (name === 'fs' || name === 'node:fs')     return fakeFs;
      if (name === 'path' || name === 'node:path') return path;
      if (name === 'child_process')                return {execFileSync: () => ''};
      if (name === './parser.js')                  return {SOURCES: [], parseList: () => []};
      throw new Error('예상 못 한 require: ' + name);
    },
  });
  vm.runInContext(source, context);
  return {dedupeLog: context.dedupeLog, read: () => files.get(LOG)};
}

const file = (...lines) => HEADER + lines.join('\n') + '\n';

/* 같은 강좌 · 같은 접수 · 같은 경과분. 관측 시각만 3초 다릅니다. */
const 이PC    = '2026-09-09 09:00:30,0.5,gsei-1467,과학원,천체관측,0,6,0,2,2026-09-09 09:00';
const 깃허브  = '2026-09-09 09:00:33,0.5,gsei-1467,과학원,천체관측,0,6,0,2,2026-09-09 09:00';
const 다른시점 = '2026-09-09 09:01:00,1,gsei-1467,과학원,천체관측,3,6,0,2,2026-09-09 09:00';

test('겹친 줄은 하나만 남고, 먼저 찍은 쪽을 남긴다', () => {
  const {dedupeLog, read} = load(file(이PC, 깃허브, 다른시점));
  assert.equal(dedupeLog(), 1);
  assert.equal(read(), file(이PC, 다른시점));
});

test('어느 쪽이 먼저 합쳐지든 결과가 같다 — 서로의 정리를 뒤집지 않는다', () => {
  const 이PC먼저   = load(file(이PC, 다른시점, 깃허브));
  const 깃허브먼저 = load(file(깃허브, 이PC, 다른시점));
  이PC먼저.dedupeLog();
  깃허브먼저.dedupeLog();
  assert.equal(이PC먼저.read(), 깃허브먼저.read());

  /* 이미 정리된 파일을 다시 정리해도 더 바뀌지 않아야 합니다. */
  const 두번째 = load(이PC먼저.read());
  assert.equal(두번째.dedupeLog(), 0);
  assert.equal(두번째.read(), 이PC먼저.read());
});

test('지운 줄이 없어도 순서가 틀렸으면 파일을 고쳐 쓴다 — 반환값 0 이 「안 바뀜」을 뜻하지 않는다', () => {
  /* 2026-09-11 관측에서 이 성질 때문에 정돈된 파일이 커밋되지 않았습니다.
     publish() 가 반환값 대신 파일 상태를 보도록 고쳤고, 그 근거를 여기 남깁니다. */
  const 뒤집힌순서 = file(다른시점, 이PC);          // 경과분 1 이 0.5 보다 앞에 옴
  const {dedupeLog, read} = load(뒤집힌순서);
  assert.equal(dedupeLog(), 0);                      // 지운 줄은 없지만
  assert.notEqual(read(), 뒤집힌순서);               // 파일은 바뀌었다
  assert.equal(read(), file(이PC, 다른시점));        // 경과분 순으로 정돈됨
});

test('겹친 게 없으면 파일을 건드리지 않는다', () => {
  const 원본 = file(이PC, 다른시점);
  const {dedupeLog, read} = load(원본);
  assert.equal(dedupeLog(), 0);
  assert.equal(read(), 원본);
});

test('제목에 든 쉼표가 칸을 밀지 않는다 — 다른 접수를 같은 줄로 보지 않는다', () => {
  /* 쉼표로 그냥 자르면 접수시각 칸이 밀려 두 줄이 같아 보이고, 서로 다른
     날짜의 관측이 하나로 뭉개집니다. */
  const 구월구일   = '2026-09-09 09:00:30,0.5,gsei-1467,과학원,"천체관측, 4회",0,6,0,2,2026-09-09 09:00';
  const 구월십육일 = '2026-09-16 09:00:30,0.5,gsei-1467,과학원,"천체관측, 4회",0,6,0,2,2026-09-16 09:00';
  const {dedupeLog, read} = load(file(구월구일, 구월십육일));
  assert.equal(dedupeLog(), 0);
  assert.equal(read(), file(구월구일, 구월십육일));
});
