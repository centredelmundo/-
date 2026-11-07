// 「1つの国だけ」の君主の問題で、採点後に出すその国の出来事（前後10年）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDB } from '../tools/validate.mjs';
import { countryEvents, nameRe } from '../js/core/countryevents.js';

const { db } = openDB();
const titles = list => list.map(e => e.title);

test('nameRe：ほかの語の一部には当たらない', () => {
  assert.ok(nameRe('アメリカ').test('アメリカ独立戦争'));
  assert.ok(!nameRe('アメリカ').test('ラテンアメリカの独立'));
  assert.ok(nameRe('明').test('明の援軍が来た'));
  assert.ok(nameRe('明').test('明朝の皇帝'));
  assert.ok(!nameRe('明').test('明治維新'));
  assert.ok(!nameRe('明').test('理由を説明した'));
  assert.ok(nameRe('ルイ14世').test('ルイ14世の親政'));
});

test('その国の出来事：名前が出てくる出来事と、同じ地域のそのほかの出来事', () => {
  const ot = countryEvents(db, db.polityById.get('ottoman'), 1572);
  assert.ok(titles(ot.own).includes('レパントの海戦'), titles(ot.own).join('・'));
  const us = countryEvents(db, db.polityById.get('usa'), 1863);
  assert.ok(titles(us.own).includes('奴隷解放宣言'));
  assert.ok(titles(us.region).includes('南北戦争'), '国の名前が出てこない同じ地域の出来事は「そのほか」に');
  const jp = countryEvents(db, db.polityById.get('japan'), 1600);
  assert.ok(titles(jp.own).includes('関ヶ原の戦い'), '君主（徳川家康）の名前からも拾う');
  // どれも前後10年に入っていて、2つのまとまりは重ならない
  for (const r of [ot, us, jp, countryEvents(db, db.polityById.get('britain'), 1945)]) {
    for (const e of [...r.own, ...r.region]) assert.ok(e.year <= r.to && (e.end ?? e.year) >= r.from, `${e.title}（${e.year}）は ${r.from}〜${r.to} の外`);
    assert.ok(!r.own.some(e => r.region.includes(e)));
    assert.ok(r.own.length <= 12 && r.region.length <= 6);
    assert.deepEqual(r.own.map(e => e.year), [...r.own.map(e => e.year)].sort((a, b) => a - b), '年の順');
  }
  // 出来事の多い時代は、多すぎない数にしぼる
  const gb = countryEvents(db, db.polityById.get('britain'), 1945);
  assert.ok(gb.ownTotal > gb.own.length && gb.own.length === 12);
});
