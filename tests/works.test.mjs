// 文化史の作者・作品名クイズ：データ・採点・問題づくりのテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDB } from '../tools/validate.mjs';
import { workEvents, workTitle, workBy, gradeWork, hintText, otherWorks, authorNames } from '../js/core/works.js';
import { build, makeSession } from '../js/core/quizgen.js';
import { summary } from '../js/core/progress.js';

const { db } = openDB();
const byId = id => db.events.find(e => e.id === id);

test('作者・作品名のデータ：文化史の作品に作者と作品名がある', () => {
  const ws = workEvents(db);
  assert.ok(ws.length >= 100, `作品 ${ws.length}件`);
  for (const e of ws) {
    assert.ok(e.culture, `${e.title} は文化史`);
    assert.ok(e.work.by.length && e.work.title.length, e.title);
  }
  assert.equal(workTitle(byId('e1307a')), '『神曲』');
  assert.equal(workBy(byId('e1307a')), 'ダンテ');
  assert.equal(workTitle(byId('e1857b')), '「落穂拾い」', '絵は「」');
  assert.equal(workTitle(byId('e1557b')), 'スレイマン=モスク', '建築はかっこなし');
  assert.equal(workTitle(byId('eb750a')), '『イリアス』『オデュッセイア』');
  assert.equal(workBy(byId('e1848b')), 'マルクス・エンゲルス');
});

test('採点：作者を答える', () => {
  const e = byId('e1513b'); // マキァヴェリ『君主論』
  assert.ok(gradeWork(db, 'マキァヴェリ', e, 'by').ok);
  assert.ok(gradeWork(db, 'マキャベリ', e, 'by').ok, '表記ゆれ');
  assert.ok(gradeWork(db, 'モア', byId('e1516a'), 'by').ok, '「トマス=モア」の「モア」');
  assert.ok(gradeWork(db, 'エンゲルス', byId('e1848b'), 'by').ok, '共作のどちらか');
  const ng = gradeWork(db, 'ミルトン', byId('e1859c'), 'by'); // ミル『自由論』に「ミルトン」
  assert.equal(ng.ok, false, '「ミル」と「ミルトン」は別');
  assert.ok(ng.wrong.some(x => x.id === 'e1667c'), '「ミルトン」は『失楽園』の作者と示す');
  // 同じ名前の作品（『歴史』）は、どちらの作者も正解
  const h = gradeWork(db, 'トゥキディデス', byId('eb425a'), 'by');
  assert.ok(h.ok && h.also?.id === 'eb400c');
  assert.equal(gradeWork(db, '', e, 'by').ok, false);
});

test('採点：作品名を答える', () => {
  assert.ok(gradeWork(db, '『神曲』', byId('e1307a'), 'title').ok, 'かっこつきでも');
  assert.ok(gradeWork(db, 'モナリザ', byId('e1503a'), 'title').ok);
  assert.ok(gradeWork(db, '国富論', byId('e1776b'), 'title').ok, '別名');
  assert.equal(gradeWork(db, '国家論', byId('eb387a'), 'title').ok, false, 'プラトン『国家』に『国家論』はまちがい');
  // 同じ作者のほかの作品も正解（ゲーテ）
  const g = gradeWork(db, 'ファウスト', byId('e1774c'), 'title');
  assert.ok(g.ok && g.also?.id === 'e1808b');
  assert.deepEqual(otherWorks(db, byId('e1774c')).map(x => x.id), ['e1808b']);
});

test('手がかりから答えを伏せる', () => {
  const e = byId('e1924g'); // ブルトン「シュルレアリスム宣言」：概要に「ブルトンが…」
  assert.ok(!hintText(e, 'by').includes('ブルトン'));
  assert.ok(authorNames(byId('e1513b')).includes('マキャヴェリ'));
});

test('問題づくり：作者・作品名の問題を作り直せて、同じ作品を2回出さない', () => {
  const q = build(db, { mode: 'work', id: 'e1307a', ask: 'title' });
  assert.equal(q.key, 'work:title:e1307a');
  assert.equal(summary(q), 'ダンテの作品は？');
  assert.equal(summary(build(db, { mode: 'work', id: 'e1307a', ask: 'by' })), '『神曲』の作者は？');
  assert.equal(build(db, { mode: 'work', id: 'e1801a', ask: 'by' }), null, '作者のない出来事は作れない');
  let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const qs = makeSession(db, { modes: ['work'], count: 30, culture: false }, rand);
  assert.equal(qs.length, 30);
  assert.ok(qs.every(x => x.mode === 'work' && x.event.work));
  assert.equal(new Set(qs.map(x => x.event.id)).size, 30, '同じ作品は1回だけ');
  assert.ok(qs.some(x => x.ask === 'by') && qs.some(x => x.ask === 'title'), '両方の向き');
  const only = makeSession(db, { modes: ['work'], count: 10, workAsk: 'title' }, rand);
  assert.ok(only.every(x => x.ask === 'title'));
  const cult = makeSession(db, { modes: ['work'], count: 10, cultureOnly: true, from: 1500, to: 1600 }, rand);
  assert.ok(cult.length && cult.every(x => x.mode === 'work' && x.y >= 1500 && x.y <= 1600));
});
