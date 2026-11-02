// 復習の間隔（間隔反復）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextReview, dueItems, boxCounts, streakDays, DAY, LEARNED, RETRY_MINUTES } from '../js/core/srs.js';

const T0 = Date.UTC(2026, 0, 1);

test('正解するたびに箱が進み、1→3→7→14→30日と間がのびる', () => {
  let s;
  const waits = [];
  for (let i = 0; i < LEARNED; i++) {
    s = nextReview(s, true, T0);
    waits.push(s.due == null ? null : (s.due - T0) / DAY);
  }
  assert.deepEqual(waits, [1, 3, 7, 14, 30, null]);
  assert.equal(s.box, LEARNED, '箱6で「覚えた」');
  assert.equal(nextReview(s, true, T0).box, LEARNED, '箱6より先には進まない');
});

test('まちがえると箱0に戻り、10分後にもう一度', () => {
  const s = nextReview({ box: 4, due: T0, lapses: 1 }, false, T0);
  assert.deepEqual(s, { box: 0, due: T0 + RETRY_MINUTES * 60e3, lapses: 2, last: T0 });
});

test('dueItems：期限が来たものだけを古い順に', () => {
  const items = { a: { id: 'a', due: 300 }, b: { id: 'b', due: 100 }, c: { id: 'c', due: null }, d: { id: 'd', due: 900 } };
  assert.deepEqual(dueItems(items, 500).map(x => x.id), ['b', 'a']);
  assert.deepEqual(dueItems(undefined, 500), []);
});

test('boxCounts：箱ごとの件数', () => {
  assert.deepEqual(boxCounts({ x: { box: 0 }, y: { box: 6 }, z: { box: 2 }, w: {} }), [2, 0, 1, 0, 0, 0, 1]);
});

test('streakDays：連続学習日数', () => {
  const now = new Date(2026, 0, 10, 12).getTime();
  assert.equal(streakDays(['2026-1-10', '2026-1-9', '2026-1-8', '2026-1-6'], now), 3);
  assert.equal(streakDays(['2026-1-9', '2026-1-8'], now), 2, '今日まだでも昨日まで続いていれば数える');
  assert.equal(streakDays(['2026-1-7'], now), 0);
  assert.equal(streakDays([], now), 0);
});
