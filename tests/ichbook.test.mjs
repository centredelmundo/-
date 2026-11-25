// 一問一答の本の版（version 2）：赤字の空欄・順不同・補足・前の版からの引き継ぎのテスト。問題文はテスト用に作ったもの。
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, parts, plain, answersOf, boxAnswersOf, variants, gradeBlank, gradeItem, oldIdMap, pool, imageOf, isDateAnswer, fullAnswers, wordForms } from '../js/core/ichimon.js';
import { migrateIchimon, getProgress, record } from '../js/core/progress.js';

const BOOK = {
  format: 'yokogushi-ichimon', version: 2, title: 'テスト用の本',
  chapters: [{ n: 1, title: '古代' }],
  items: [
    { id: 'B01-01-01', ch: 1, sec: '1 テスト', q: '〈1200〉年、【ミナト】王は〈カワベ〉の町を建てた。', y: 1200, yq: 3, r: ['wa'], st: 3, src: '架空大', p: 20,
      n: ['◆〈カワベ〉は川のほとりの町。'], old: ['v1:1'], img: 'File:Example.jpg' },
    { id: 'B01-01-02', ch: 1, sec: '1 テスト', q: '【ヤマ】と【ウミ】の2国が並び立った。', y: 1210, yq: 0, r: ['wa'], st: 1, free: [[0, 1]], g: 1, old: ['v1:2', 'v1:3'] },
    { id: 'B01-01-03', ch: 1, sec: '1 テスト', q: '【サルゴン［1世］】は【ロシア二月（三月）】を【ドイツ（プロイセン）=フランス】と結んだ。', y: 1220, yq: 0, r: ['wa'], st: 0 }
  ]
};

test('本の版：赤字も空欄になり、補足・★・出典を読む', () => {
  const d = prepare(BOOK);
  assert.equal(d.version, 2);
  const [a, b] = d.items;
  assert.deepEqual(a.answers, ['1200', 'ミナト', 'カワベ'], '赤字〈〉も出てくる順の空欄');
  assert.deepEqual(a.box, ['ミナト'], '見出しは四角の空欄だけから作る');
  assert.equal(a.title, 'ミナト王', '見出しは空欄のあとに続く字も付ける（【ミナト】王 → ミナト王）');
  assert.deepEqual(a.full, ['1200年', 'ミナト王', 'カワベ']);
  assert.deepEqual(wordForms(a, 'ミナト'), ['ミナト王', 'ミナト'], '概要は「ミナト王」から探す');
  assert.deepEqual(fullAnswers('【アメリカ=イギリス（米英）】戦争が【起】こった'), ['アメリカ=イギリス戦争', '起']);
  assert.deepEqual(parts(a.text).filter(p => p.a).map(p => !!p.red), [true, false, true]);
  assert.equal(plain(a.text), '1200年、ミナト王はカワベの町を建てた。');
  assert.deepEqual([a.stars, a.src, a.page, a.notes.length, a.img], [3, '架空大', 20, 1, 'File:Example.jpg']);
  assert.ok(b.guess);
  assert.deepEqual(b.free, [[0, 1]]);
  assert.deepEqual(answersOf('A〈x〉【y】'), ['x', 'y']);
  assert.deepEqual(boxAnswersOf('A〈x〉【y】'), ['y']);
});

test('本の版：version 1 の〈〉は空欄にしない', () => {
  const d = prepare({ ...BOOK, version: 1, items: [{ id: 'x', ch: 1, sec: '', q: '〈注〉の【答え】', r: [] }] });
  assert.deepEqual(d.items[0].answers, ['答え']);
});

test('本の版：答えの書き方のゆれ', () => {
  assert.ok(variants('サルゴン［1世］').includes('サルゴン1世'));
  assert.ok(variants('サルゴン［1世］').includes('サルゴン'));
  assert.ok(variants('ロシア二月（三月）').includes('ロシア三月'));
  assert.ok(variants('ドイツ（プロイセン）=フランス').includes('プロイセン=フランス'));
  assert.ok(variants('ドイツ（プロイセン）=フランス').includes('ドイツ=フランス'));
  assert.ok(variants('生命工学（遺伝子工学、バイオテクノロジー）').includes('バイオテクノロジー'));
  assert.ok(gradeBlank('1200', '1200'));
  assert.ok(gradeBlank('1200年', '1200'));
  assert.equal(gradeBlank('1201', '1200'), null, '数はほぼ正解にしない');
  assert.ok(isDateAnswer('1200'));
});

test('本の版：すべての空欄が合っていたら正解、順不同の組は入れかえてよい', () => {
  const d = prepare(BOOK);
  const [a, b, c] = d.items;
  assert.ok(gradeItem(a.answers, ['1200', 'ミナト', 'カワベ']).every(r => r.m));
  assert.ok(!gradeItem(a.answers, ['1200', 'ミナト', '']).every(r => r.m), '赤字の空欄をまちがえたら×');
  const sw = gradeItem(b.answers, ['ウミ', 'ヤマ'], b.free);
  assert.ok(sw.every(r => r.m));
  assert.deepEqual(sw.map(r => r.a), ['ウミ', 'ヤマ'], '合った答えを出す');
  const one = gradeItem(b.answers, ['ウミ', 'ウミ'], b.free);
  assert.deepEqual(one.map(r => !!r.m), [false, true], '同じ答えを2回は数えない（書いた位置の答えに合うほうを正解にする）');
  assert.equal(one[0].a, 'ヤマ');
  assert.ok(!gradeItem(b.answers, ['ウミ', 'ヤマ']).some(r => r.m), '順不同でなければ順番どおり');
  assert.ok(gradeItem(c.answers, ['サルゴン', 'ロシア三月', 'プロイセン=フランス']).every(r => r.m));
});

test('本の版：★でしぼる・写真の指定', () => {
  const d = prepare(BOOK);
  assert.deepEqual(pool(d, { stars: [3] }).map(it => it.id), ['B01-01-01']);
  assert.deepEqual(pool(d, { stars: [0, 1] }).map(it => it.id), ['B01-01-02', 'B01-01-03']);
  assert.equal(pool(d, {}).length, 3);
  assert.deepEqual(imageOf(null, d.items[0]), { image: 'File:Example.jpg', imageVerified: false });
  const db = { byKey: new Map([['event:e1', { key: 'event:e1', image: 'ja:例', imageVerified: true }]]) };
  assert.deepEqual(imageOf(db, { img: 'event:e1' }), { image: 'ja:例', imageVerified: true, key: 'event:e1' });
  assert.equal(imageOf(db, { img: 'event:none' }), null);
});

test('本の版：前の版の復習の記録を引き継ぐ', () => {
  const d = prepare(BOOK);
  const map = oldIdMap(d);
  assert.equal(map.get('v1:1'), 'B01-01-01');
  assert.equal(map.get('v1:3'), 'B01-01-02');
  const q = id => ({ key: `ichimon:${id}`, spec: { mode: 'ichimon', id }, mode: 'ichimon', y: 1200, regions: ['wa'], item: { answers: ['x'] } });
  record(q('v1:1'), false, 1000);
  record(q('v1:2'), false, 2000);
  record(q('v1:3'), false, 3000);
  record(q('zzz'), false, 4000);
  assert.equal(migrateIchimon(map), 3);
  const P = getProgress();
  assert.ok(P.items['ichimon:B01-01-01']);
  assert.equal(P.items['ichimon:B01-01-01'].spec.id, 'B01-01-01');
  assert.equal(P.items['ichimon:B01-01-02'].lapses, 2, '同じ問題に来た2つの記録はまとめる');
  assert.ok(!P.items['ichimon:v1:1']);
  assert.ok(P.items['ichimon:zzz'], '本にない問題の記録はそのまま');
  assert.ok(P.log.some(l => l.k === 'ichimon:B01-01-01'));
});
