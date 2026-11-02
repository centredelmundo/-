// 記述式の採点で使う「表記をそろえる」処理のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { base, loose, lev, matchTerms, splitAnswers, parseYear } from '../js/core/normalize.js';

test('base：表記ゆれをそろえる', () => {
  assert.equal(base('ルイ十四世'), base('ルイ14世'));
  assert.equal(base('第二次世界大戦'), base('第2次世界大戦'));
  assert.equal(base('ヴェルサイユ条約'), base('ベルサイユ条約'));
  assert.equal(base('ウェストファリア条約'), base('ウエストファリア条約'));
  assert.equal(base('ムハンマド=アリー'), base('ムハンマド・アリー'));
  assert.equal(base('みん'), base('ミン'));
  assert.equal(base('ＡＢＣ　１２３'), 'abc123');
});

test('loose：送り仮名と長音を消す', () => {
  assert.equal(loose('明が滅亡した'), '明滅亡');
  assert.equal(loose('ヨーロッパ'), loose('ヨロッパ'));
});

test('lev：編集距離', () => {
  assert.equal(lev('kitten', 'sitting'), 3);
  assert.equal(lev('', 'abc'), 3);
  assert.equal(lev('同じ', '同じ'), 0);
});

test('matchTerms：一致・部分・キーワード・誤字', () => {
  assert.equal(matchTerms('ウエストファリア条約', ['ウェストファリア条約'])?.how, 'exact');
  assert.equal(matchTerms('1648年にウェストファリア条約が結ばれた', ['ウェストファリア条約'])?.how, 'part');
  assert.equal(matchTerms('ナポレオンが教皇と和解', ['宗教協約'], ['ナポレオン+教皇'])?.how, 'key');
  assert.equal(matchTerms('ナポレオンが即位', ['宗教協約'], ['ナポレオン+教皇']), null);
  assert.equal(matchTerms('ウェストファリヤ条約', ['ウェストファリア条約'])?.how, 'fuzzy');
  assert.equal(matchTerms('ウェストファリヤ条約', ['ウェストファリア条約'], [], true), null, '厳しめの採点では誤字を認めない');
  assert.equal(matchTerms('三十年戦争', ['ウェストファリア条約']), null);
  assert.equal(matchTerms('', ['明']), null);
});

test('splitAnswers：複数の答えに分ける', () => {
  assert.deepEqual(splitAnswers('明、清,ムガル帝国\nオスマン帝国 / サファヴィー朝'), ['明', '清', 'ムガル帝国', 'オスマン帝国', 'サファヴィー朝']);
  assert.deepEqual(splitAnswers('  '), []);
});

test('parseYear：年の入力を数に', () => {
  assert.equal(parseYear('1648'), 1648);
  assert.equal(parseYear('1648年'), 1648);
  assert.equal(parseYear('１６４８'), 1648);
  assert.equal(parseYear('前221'), -221);
  assert.equal(parseYear('紀元前221年'), -221);
  assert.equal(parseYear('BC221'), -221);
  assert.equal(parseYear('-221'), -221);
  assert.equal(parseYear('せんろっぴゃく'), null);
  assert.equal(parseYear('12345'), null);
  assert.equal(parseYear(''), null);
});
