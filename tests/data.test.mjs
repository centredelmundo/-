// 同梱データの点検と、データから作るクイズ・勢力図のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { locateJsonError } from '../js/core/data.js';
import { makeSession, build, MODES } from '../js/core/quizgen.js';
import { rng } from '../js/core/util.js';
import { validate, openDB } from '../tools/validate.mjs';

test('locateJsonError：書き間違いの行と文字を示す', () => {
  const loc = locateJsonError('{\n  "a": 1,\n  "b": 2,\n}');
  assert.deepEqual([loc.line, loc.col], [4, 1]);
  assert.match(loc.message, /余分/);
  assert.equal(locateJsonError('[{"a": [1, 2.5, -3]}, "x", true, null]'), null);
  assert.equal(locateJsonError('{"a": "閉じていない}').line, 1);
});

test('同梱データにエラーがない', () => {
  const { errors, stats } = validate();
  assert.deepEqual(errors, []);
  assert.ok(stats.events > 900 && stats.polities > 200 && stats.rulers > 300);
});

const { db } = openDB();

test('クイズ：全形式で作れて、復習用の spec から同じ問題を作り直せる', () => {
  for (const mode of Object.keys(MODES)) {
    const qs = makeSession(db, { count: 12, modes: [mode], from: 1500, to: 2000 }, rng(7));
    assert.ok(qs.length >= 8, `${mode}: ${qs.length}問しかできない`);
    for (const q of qs) assert.equal(build(db, JSON.parse(JSON.stringify(q.spec)))?.key, q.key);
  }
});

test('勢力図：どの時代にも塗られる地域がある', () => {
  for (const y of [1500, 1648, 1789, 1815, 1914, 1945, 2000]) {
    const own = db.ownersAt(y);
    assert.ok(own.size > 200, `${y}年: ${own.size}ゾーン`);
    for (const { p } of own.values()) assert.ok(db.isActive(db.polityById.get(p), y), `${y}年に終わった国 ${p} が残っている`);
  }
});

test('クイズ：文化史だけにすると文化史の出来事だけで出題する', () => {
  const qs = makeSession(db, { count: 15, modes: Object.keys(MODES), cultureOnly: true, from: 1500, to: 2000 }, rng(11));
  assert.ok(qs.length >= 10);
  for (const q of qs) {
    assert.ok(['year', 'term', 'order', 'choice'].includes(q.mode), q.mode);
    const evs = q.event ? [q.event] : q.events || [q.anchor, ...(q.options || [])];
    for (const e of evs) assert.ok(e.culture, `${q.mode}: ${e.title} は文化史ではない`);
  }
});
