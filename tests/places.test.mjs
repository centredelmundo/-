// 地名の検索と、勢力図で印をつける場所のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDB } from '../tools/validate.mjs';
import { placeKey, placeEntries, searchPlaces, nearestYear, periodText, resolveFocus, zoneAtPoint } from '../js/core/places.js';

const { db } = openDB();
const first = (q, y) => searchPlaces(db, q, y)[0];

test('placeKey：長音・ティ/チ・ひらがなの書き方のちがいをそろえる', () => {
  assert.equal(placeKey('イスタンブール'), placeKey('イスタンブル'));
  assert.equal(placeKey('コンスタンチノープル'), placeKey('コンスタンティノープル'));
  assert.equal(placeKey('ベネチア'), placeKey('ヴェネツィア'));
  assert.equal(placeKey('ろーま'), placeKey('ローマ'));
});

test('nearestYear・periodText：その名前で呼ばれていた年と、期間の書き方', () => {
  assert.equal(nearestYear([[330, 1453]], 1648), 1452);
  assert.equal(nearestYear([[330, 1453]], 1000), 1000);
  assert.equal(nearestYear([[1453, null]], 1300), 1453);
  assert.equal(nearestYear([[1368, 1403], [1928, 1949]], 1940), 1940);
  assert.equal(nearestYear([[1368, 1403], [1928, 1949]], 1500), 1402);
  assert.equal(periodText([[330, 1453]]), '330〜1453年');
  assert.equal(periodText([[1453, null]]), '1453年〜');
  assert.equal(periodText([[-800, -100]], -800), '〜前100年');
  assert.equal(periodText([[1403, 1928], [1949, null]]), '1403〜1928年、1949年〜');
  assert.equal(periodText([[-800, null]], -800), '');
});

test('地名の検索：コンスタンティノープルは、その名前の時代の地図へ', () => {
  const h = first('コンスタンティノープル', 1648);
  assert.equal(h.name, 'コンスタンティノープル');
  assert.equal(h.place.kind, 'city');
  assert.equal(h.year, 1452); // 1648年はイスタンブルなので、コンスタンティノープルと呼ばれた最後の年へ
  assert.equal(first('コンスタンティノープル', 1000).year, 1000); // その名前の時代なら年はそのまま
  // 同じ場所の別の名前・書き方のちがいでも見つかる
  for (const q of ['イスタンブール', 'ビザンティウム', 'コンスタンチノープル']) assert.equal(first(q, 1648).place.id, h.place.id, q);
  assert.equal(first('エルサレム', 1648).name, 'イェルサレム');
});

test('地名の検索：川・海も探せて、同じ名前の場所は見分けがつく', () => {
  const nile = first('ナイル', 1648);
  assert.equal(nile.name, 'ナイル川');
  assert.equal(nile.place.kind, 'river');
  assert.equal(nile.year, 1648);
  assert.equal(searchPlaces(db, '太平洋', 1648).length, 1); // 海の名前が2か所にあっても候補は1つ
  const thebes = searchPlaces(db, 'テーベ', 1648).filter(h => h.name === 'テーベ');
  assert.equal(thebes.length, 2);
  assert.ok(thebes.every(h => h.hint) && thebes[0].hint !== thebes[1].hint, thebes.map(h => h.hint).join(' / '));
  assert.deepEqual(searchPlaces(db, '', 1648), []);
});

test('勢力図の印：URL の書き方から場所を作れる', () => {
  const c = resolveFocus(db, 'city:28.98,41.01');
  assert.equal(c.kind, 'city');
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
  assert.ok(resolveFocus(db, 'river:ナイル川').bbox);
  assert.equal(resolveFocus(db, 'city:0,0'), null);
  assert.equal(resolveFocus(db, 'こわれた書き方'), null);
  // 場所のわかる出来事（戦いなど）はすべて印をつけられる
  for (const e of db.events.filter(x => Array.isArray(x.place) && x.place.length)) assert.ok(resolveFocus(db, `event:${e.id}`), e.title);
});

test('地名のデータ：場所の id が重ならず、都市はどれも地図のゾーンに入る', () => {
  const places = [...new Map(placeEntries(db).map(e => [e.place.id, e.place])).values()];
  assert.ok(places.length > 400);
  for (const p of places) assert.ok(resolveFocus(db, p.id), p.id);
  for (const p of places.filter(x => x.kind === 'city')) assert.ok(zoneAtPoint(db.zones, p.x, p.y), `${p.names.map(n => n[1]).join('/')} がどのゾーンにも入らない`);
  assert.equal(zoneAtPoint(db.zones, resolveFocus(db, 'city:28.98,41.01').x, resolveFocus(db, 'city:28.98,41.01').y).id, 'thrace-e');
});
