const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateSourceRows} = require('../pohang-ontime/crawler/crawl.js');
const source = {key:'gbelib-yi', name:'영일도서관', adapter:'gbelib'};
const row = n => ({id:'gbelib-yi-'+n, title:'학부모 프로그램', openAt:'2026-10-01 10:00', deadline:'2026-10-26 18:00', eventFrom:'2026-11-04'});

test('a valid seasonal list of four or one program can refresh', () => {
  assert.doesNotThrow(() => validateSourceRows(source, [1,2,3,4].map(row)));
  assert.doesNotThrow(() => validateSourceRows(source, [row(1)]));
});
test('empty or blocked lists still preserve previous data', () => {
  assert.throws(() => validateSourceRows(source, []), /최소/);
});
test('a changed page missing required program fields is rejected', () => {
  for (const field of ['id','title','openAt','deadline','eventFrom']) {
    assert.throws(() => validateSourceRows(source, [{...row(1), [field]:''}]), /누락/);
  }
  assert.throws(() => validateSourceRows(source, [{...row(1), openAt:'접수 예정'}]), /누락/);
});
test('duplicate or foreign program IDs are rejected', () => {
  assert.throws(() => validateSourceRows(source, [row(1),row(1)]), /중복/);
  assert.throws(() => validateSourceRows(source, [{...row(1),id:'phlib-1'}]), /누락/);
});
test('other institution minimum protections are preserved', () => {
  assert.throws(() => validateSourceRows({key:'phlib',name:'포항시립도서관'}, [row(1)]), /최소/);
});
