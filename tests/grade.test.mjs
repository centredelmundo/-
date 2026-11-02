// 採点のテスト（小さな作りもののデータで）
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeCross, gradeYear, gradeTerm } from '../js/core/grade.js';

const item = (kind, name, regions, from, to, terms = []) => ({ kind, ref: { name }, name, terms: [name, ...terms], keys: [], regions, spans: [[from, to]] });
const db = {
  items: [
    item('event', 'ウェストファリア条約', ['ce'], 1648, 1648),
    item('event', '名誉革命', ['we'], 1688, 1689),
    item('polity', '清', ['cn'], 1636, 1912, ['清朝'])
  ]
};

test('gradeCross：時期と地域の両方を見る', () => {
  const r = gradeCross(db, 'ウェストファリア条約、名誉革命、清朝、ナントカ', ['ce', 'we'], 1650, 5, false);
  // 正解 / 時期ちがい / 地域ちがい / 見つからない
  assert.deepEqual(r.map(x => x.cls), [3, 1, 2, null]);
  assert.equal(r[2].best.it.name, '清');
});

test('gradeYear：別の年も正解にできる', () => {
  const ev = { year: 1648, acceptYears: [1649] };
  assert.equal(gradeYear('1648', ev).ok, true);
  assert.equal(gradeYear('1649年', ev).ok, true);
  assert.deepEqual(gradeYear('1650', ev), { valid: true, ok: false, y: 1650, diff: 2, close: true });
  assert.equal(gradeYear('1660', ev).close, false);
  assert.equal(gradeYear('わからない', ev).valid, false);
});

test('gradeTerm：別の出来事を答えたら、それが何かを示す', () => {
  const ev = { title: '名誉革命', answers: ['イギリス名誉革命'], keywords: ['ウィリアム3世+即位'], year: 1688, end: 1689, regions: ['we'] };
  assert.equal(gradeTerm(db, '名誉革命', ev).ok, true);
  assert.equal(gradeTerm(db, 'ウィリアム3世の即位', ev).how, 'key');
  const wrong = gradeTerm(db, 'ウェストファリア条約', ev);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.other.it.name, 'ウェストファリア条約');
});
