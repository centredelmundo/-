// 一問一答（利用者が読み込むデータ）の読み込み・採点・出題のテスト。問題文はテスト用に作ったもの。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFile, prepare, parts, variants, gradeBlank, titleOf, pool, timelineItems, answersOf, linkEvents } from '../js/core/ichimon.js';
import { makeSession, build } from '../js/core/quizgen.js';
import { rng } from '../js/core/util.js';
import { openDB } from '../tools/validate.mjs';

const SAMPLE = {
  format: 'yokogushi-ichimon', version: 1, title: 'テスト用',
  chapters: [{ n: 1, title: '古代' }, { n: 2, title: '近代' }],
  items: [
    { id: 'a:1', ch: 1, sec: '1 オリエント', q: '前3000年ごろ、【エジプト】で統一王朝が成立した。', y: -3000, yq: 3, r: ['wa'] },
    { id: 'a:2', ch: 1, sec: '2 ギリシア', q: '前5世紀、【アテネ】では【民主政】が完成した。', y: -450, yq: 2, r: ['ee'] },
    { id: 'b:1', ch: 2, sec: '1 ウィーン体制', q: '1814年、【ウィーン会議】が開かれた。', y: 1814, yq: 3, r: ['ce'] },
    { id: 'b:2', ch: 2, sec: '1 ウィーン体制', q: '会議の議長は【メッテルニヒ】が務めた。', y: 1814, yq: 0, r: ['ce'] },
    { id: 'b:3', ch: 2, sec: '2 宗教', q: '聖地【イェルサレム（エルサレム）】をめぐって争いが起きた。', y: 1853, yq: 0, r: ['wa'] },
    { id: 'b:x', ch: 2, sec: '2 宗教', q: '答えのない文は使わない。', y: 1853, yq: 0, r: ['wa'] }
  ]
};

test('一問一答：読み込みと文の分解', () => {
  assert.ok(parseFile('{').error);
  assert.ok(parseFile('{"format":"other","items":[]}').error);
  const { data } = parseFile(JSON.stringify(SAMPLE));
  assert.equal(data.items.length, 5, '答えのない文は除く');
  assert.equal(data.chapters.length, 2);
  assert.deepEqual(answersOf(SAMPLE.items[1].q), ['アテネ', '民主政']);
  assert.deepEqual(parts('A【x】B【y】'), [{ s: 'A' }, { i: 0, a: 'x' }, { s: 'B' }, { i: 1, a: 'y' }]);
  assert.equal(titleOf(['アテネ', '民主政']), 'アテネ・民主政');
  assert.equal(titleOf(['a', 'b', 'c']), 'a・bほか');
});

test('一問一答：答えの書き方のゆれを認める', () => {
  assert.deepEqual(variants('イェルサレム（エルサレム）').sort(), ['イェルサレム', 'イェルサレム（エルサレム）', 'エルサレム'].sort());
  assert.ok(variants('『コーラン』（クルアーン）').includes('コーラン'));
  assert.ok(variants('ブッシュ（父）大統領').includes('ブッシュ'));
  assert.ok(!variants('ブッシュ（父）大統領').includes('父'));
  assert.ok(variants('1905年').includes('1905'));
  assert.ok(gradeBlank('エルサレム', 'イェルサレム（エルサレム）'));
  assert.ok(gradeBlank('くるあーん', '『コーラン』（クルアーン）'));
  assert.ok(gradeBlank('第一次バルカン戦争', '第1次バルカン戦争'));
  assert.ok(gradeBlank('マッキンリー', 'マッキンリー大統領'));
  assert.ok(gradeBlank('ウィーン会議', 'ウィーン会議'));
  assert.equal(gradeBlank('', 'ウィーン会議'), null);
  assert.equal(gradeBlank('パリ会議', 'ウィーン会議'), null);
  assert.ok(gradeBlank('メッテルニッヒ', 'メッテルニヒ'), 'ふつうの採点では1文字ちがいは正解');
  assert.equal(gradeBlank('メッテルニッヒ', 'メッテルニヒ', true), null, 'きびしめでは×');
});

test('一問一答：章・年・地域でしぼり、年表に出すのは年か世紀のある問題だけ', () => {
  const data = prepare(SAMPLE);
  assert.equal(pool(data, {}, [-800, 2000]).length, 5);
  assert.equal(pool(data, { from: -800, to: 2000 }, [-800, 2000]).length, 5, '全範囲なら範囲より前の問題も出す');
  assert.deepEqual(pool(data, { from: 1800, to: 1900 }, [-800, 2000]).map(x => x.id), ['b:1', 'b:2', 'b:3']);
  assert.deepEqual(pool(data, { chapters: [1] }, [-800, 2000]).map(x => x.id), ['a:1', 'a:2']);
  assert.deepEqual(pool(data, { groups: ['wa'] }, [-800, 2000], g => g).map(x => x.id), ['a:1', 'b:3']);
  assert.deepEqual(timelineItems(data, 'ce', 1800, 1830).map(x => x.id), ['b:1'], '年号のない問題（推定）は年表に出さない');
  assert.deepEqual(timelineItems(data, 'ee', -500, -400).map(x => x.id), ['a:2']);
});

test('一問一答：クイズに出て、復習用の spec から作り直せる', () => {
  const { db } = openDB();
  db.setIchimon(SAMPLE);
  const qs = makeSession(db, { count: 5, modes: ['ichimon'], from: db.range[0], to: db.range[1] }, rng(3));
  assert.equal(qs.length, 5);
  for (const q of qs) {
    assert.equal(q.mode, 'ichimon');
    assert.equal(build(db, JSON.parse(JSON.stringify(q.spec)))?.key, q.key);
  }
  const mixed = makeSession(db, { count: 12, modes: ['year', 'ichimon'], from: 1500, to: 2000 }, rng(4));
  assert.ok(mixed.some(q => q.mode === 'ichimon') && mixed.some(q => q.mode === 'year'));
  db.setIchimon(null);
  assert.equal(build(db, { mode: 'ichimon', id: 'b:1' }), null, 'データを消したら作れない');
  assert.equal(makeSession(db, { count: 5, modes: ['ichimon'] }, rng(3)).length, 0);
});

test('一問一答：アプリの出来事と同じ問題は、その出来事に結びつける', () => {
  const { db } = openDB();
  db.setIchimon(SAMPLE);
  const { byEvent, merged } = linkEvents(db.ichimon, db.events);
  const vienna = db.events.find(e => e.title === 'ウィーン会議');
  assert.ok(vienna, 'データにウィーン会議がある');
  assert.deepEqual((byEvent.get(vienna.key) || []).map(x => x.id), ['b:1']);
  assert.ok(merged.has('b:1') && !merged.has('a:2'));
  db.setIchimon(null);
});

test('一問一答：答えが年の問題の見出し', () => {
  assert.equal(titleOf(['1941年', '真珠湾']), '真珠湾');
  assert.equal(titleOf(['1795年'], '【1795年】の第3回ポーランド分割で王国は消滅した。'), '第3回ポーランド分割で王国は消滅した');
});
