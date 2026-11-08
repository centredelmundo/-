// 一問一答の答えの語から、アプリのデータの項目（概要を出すもの）を探すテスト。問題文はテスト用に作ったもの。
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, answerRecord, answerLabel, isDateAnswer } from '../js/core/ichimon.js';
import { openDB } from '../tools/validate.mjs';

const { db } = openDB();
const data = prepare({
  format: 'yokogushi-ichimon', version: 1, title: 'テスト用', chapters: [{ n: 1, title: 'テスト' }],
  items: [
    { id: 't:1', ch: 1, sec: '1', q: '【エドワード1世】の時代に【模範議会】が開かれた。', y: 1295, yq: 3, r: ['we'] },
    { id: 't:2', ch: 1, sec: '1', q: '1763年の【パリ条約】で七年戦争が終わった。', y: 1763, yq: 3, r: ['we'] },
    { id: 't:3', ch: 1, sec: '1', q: '【1789年】に革命が始まった。', y: 1789, yq: 3, r: ['we'] },
    { id: 't:4', ch: 1, sec: '1', q: '聖地【イェルサレム（エルサレム）】を占領した。', y: 1099, yq: 3, r: ['wa'] }
  ]
});
const ctx = id => { const it = data.byId.get(id); return { y: it.y, regions: it.regions }; };

test('答えの語：出来事・人物の概要に結びつく', () => {
  const ev = answerRecord(db, '模範議会', ctx('t:1'));
  assert.equal(ev?.kind, 'event');
  assert.equal(ev.title, '模範議会');
  const ru = answerRecord(db, 'エドワード1世', ctx('t:1'));
  assert.equal(ru?.kind, 'ruler');
  assert.equal(ru.name, 'エドワード1世');
  assert.ok(db.byKey.get(ev.key) && db.byKey.get(ru.key), '概要シートで開ける key');
});

test('答えの語：同じ名前がいくつかあれば、問題の年・地域に近いもの', () => {
  const pt = answerRecord(db, 'パリ条約', ctx('t:2'));
  assert.equal(pt?.kind, 'event');
  assert.equal(pt.year, 1763);
});

test('答えの語：年だけの答え・データにない語', () => {
  assert.ok(isDateAnswer('1789年') && isDateAnswer('前221年') && !isDateAnswer('模範議会'));
  assert.equal(answerRecord(db, '1789年', ctx('t:3')), null);
  assert.equal(answerRecord(db, 'テスト用のない語', {}), null);
  assert.equal(answerLabel('イェルサレム（エルサレム）'), 'イェルサレム');
  assert.equal(answerLabel('『コーラン』'), 'コーラン');
});
