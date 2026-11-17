// 用語検索：読み込んだ一問一答の文から探すテスト。問題文はテスト用に作ったもの。
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, searchIchimon, snippet } from '../js/core/ichimon.js';

const data = prepare({
  format: 'yokogushi-ichimon', version: 1, title: 'テスト用', chapters: [{ n: 1, title: 'テスト' }],
  items: [
    { id: 't:1', ch: 1, sec: '1', q: 'テスト国の劇作家ストリンドベリは、架空の作品を書いた人物として【テスト太郎】と並び称された。', y: 1888, yq: 3, r: ['we'] },
    { id: 't:2', ch: 1, sec: '1', q: 'テスト国の劇作家【ストリンドベリ】は『令嬢ジュリー』を著した。', y: 1888, yq: 3, r: ['we'] },
    { id: 't:3', ch: 1, sec: '1', q: '【マルクス=アウレリウス】は『自省録』を書いた。', y: 170, yq: 3, r: ['we'] }
  ]
});

test('一問一答の検索：文の中の語も見つかり、答えの語を先に出す', () => {
  assert.deepEqual(searchIchimon(data, 'ストリンドベリ').map(x => x.id), ['t:2', 't:1']);
  assert.deepEqual(searchIchimon(data, '令嬢ジュリー').map(x => x.id), ['t:2'], '【】の外の語も');
  assert.deepEqual(searchIchimon(data, 'マルクスアウレリウス').map(x => x.id), ['t:3'], '「=」のゆれ');
  assert.deepEqual(searchIchimon(data, 'すとりんどべり').map(x => x.id), ['t:2', 't:1'], 'ひらがなでも');
  assert.deepEqual(searchIchimon(null, 'ストリンドベリ'), [], '読み込んでいないとき');
  assert.deepEqual(searchIchimon(data, ''), []);
});

test('一問一答の検索：結果に出す文の一部', () => {
  const it = data.byId.get('t:1');
  const s = snippet(it, 'テスト太郎', 20);
  assert.ok(s.includes('テスト太郎') && s.startsWith('…') && !s.includes('【'), s);
  assert.equal(snippet(data.byId.get('t:3'), 'x', 60), 'マルクス=アウレリウスは『自省録』を書いた。');
});
