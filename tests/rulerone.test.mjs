// 君主・指導者クイズの「1つの国だけ」のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDB } from '../tools/validate.mjs';
import { makeSession, build, lastingPolities, rulersIn } from '../js/core/quizgen.js';
import { rng } from '../js/core/util.js';

const { db } = openDB();

test('期間のあいだずっと続いていた国の一覧', () => {
  const list = lastingPolities(db, 1500, 1599);
  const ids = list.map(x => x.polity.id);
  assert.ok(ids.includes('ottoman') && ids.includes('france'), ids.join(','));
  assert.ok(!ids.includes('qing'), '清は1500年にはまだない');
  for (const { polity: p, rulers } of list) {
    assert.ok(p.periods.some(([a, b]) => a <= 1500 && b >= 1599), `${p.name} は期間の途中で終わる・始まる`);
    assert.ok(!p.parent && !p.noQuiz && rulers.length > 0, p.name);
  }
  // 地域をしぼると、その地域の国だけ
  const eu = lastingPolities(db, 1500, 1599, { groups: ['eu'] });
  assert.ok(eu.length > 0 && eu.every(x => x.group.id === 'eu'));
  // 名前が変わる国は「はじめの名前→終わりの名前」
  assert.equal(lastingPolities(db, 1500, 1800).find(x => x.polity.id === 'britain')?.label, 'イングランド→イギリス');
  // ずっと続いた国がない期間・範囲が逆のとき
  assert.deepEqual(lastingPolities(db, db.range[0], db.range[1]), []);
  assert.deepEqual(lastingPolities(db, 1600, 1500), []);
});

test('1つの国だけ：その国の君主・指導者を1人1問、在位の途中の年で出す', () => {
  const opt = { modes: ['ruler'], rulerScope: 'one', rulerOne: 'ottoman', from: 1500, to: 1599, count: 10 };
  const all = rulersIn(db, db.polityById.get('ottoman'), 1500, 1599);
  for (const seed of [1, 2, 3, 4, 5]) {
    const qs = makeSession(db, opt, rng(seed));
    assert.equal(qs.length, all.length, '人数より多くは出さない（同じ人を2回出さない）');
    const who = new Set();
    for (const q of qs) {
      assert.ok(q.one && q.polities.length === 1 && q.polities[0].id === 'ottoman');
      assert.ok(q.y >= 1500 && q.y <= 1599, String(q.y));
      // 採点で正解になる人（前後1年に在位）が1人に決まる
      const right = all.filter(r => r.from <= q.y + 1 && r.to >= q.y - 1);
      assert.equal(right.length, 1, `${q.y}年：${right.map(r => r.name).join('・')}`);
      who.add(right[0].id);
      assert.equal(build(db, JSON.parse(JSON.stringify(q.spec)))?.key, q.key, '復習用の spec から作り直せる');
    }
    assert.equal(who.size, all.length, 'みんな別の人');
  }
  // 重要度をしぼると、その重要度以上の人だけ
  const imp = makeSession(db, { ...opt, minImportance: 3 }, rng(9));
  assert.equal(imp.length, rulersIn(db, db.polityById.get('ottoman'), 1500, 1599, 3).length);
  // ほかの形式とまぜると、君主の問題はその国だけ・ほかの形式はこれまでどおり
  const mixed = makeSession(db, { ...opt, modes: ['ruler', 'year'], rulerOne: 'britain', from: 1500, to: 1800 }, rng(4));
  assert.ok(mixed.some(q => q.mode === 'year') && mixed.some(q => q.mode === 'ruler'));
  for (const q of mixed.filter(x => x.mode === 'ruler')) assert.ok(q.one && q.polities[0].id === 'britain');
});

test('いろいろな国（これまでどおり）：2か国以上の問題のまま', () => {
  for (const o of [{}, { rulerScope: 'all', rulerOne: 'ottoman' }, { rulerScope: 'one', rulerOne: '' }]) {
    const qs = makeSession(db, { modes: ['ruler'], from: 1500, to: 1599, count: 8, ...o }, rng(2));
    assert.ok(qs.length >= 6);
    for (const q of qs) assert.ok(!q.one && q.polities.length >= 2, JSON.stringify(q.spec));
  }
  // 古い spec（1か国で one がない）は作らない
  assert.equal(build(db, { mode: 'ruler', y: 1550, p: ['ottoman'] }), null);
});
