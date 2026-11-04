// 作品・建築の写真の取得（Wikipedia / Commons の API）のテスト。通信の代わりに作りものの応答を使う
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImageSpec, isFreeLicense, imageInfo } from '../js/core/wiki.js';

test('parseImageSpec：記事名・ファイル名の書き方', () => {
  assert.deepEqual(parseImageSpec('ja:落穂拾い (ミレー)'), { wiki: 'ja', article: '落穂拾い (ミレー)' });
  assert.deepEqual(parseImageSpec('en:The Gleaners'), { wiki: 'en', article: 'The Gleaners' });
  assert.deepEqual(parseImageSpec('File:Example.jpg'), { wiki: 'commons', file: 'Example.jpg' });
  assert.equal(parseImageSpec('落穂拾い'), null);
  assert.equal(parseImageSpec(''), null);
});

test('isFreeLicense：自由に使えるライセンスだけ', () => {
  for (const s of ['Public domain', 'CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'PD-old']) assert.ok(isFreeLicense(s), s);
  for (const s of ['Non-free', 'Fair use', '', 'All rights reserved']) assert.ok(!isFreeLicense(s), s);
});

const fake = (license = 'CC BY-SA 4.0', pageimage = 'Foo.jpg') => {
  const calls = [];
  const f = async url => {
    calls.push(url);
    const u = new URL(url);
    const body = u.searchParams.get('prop') === 'pageimages'
      ? { query: { pages: [pageimage ? { pageimage } : {}] } }
      : { query: { pages: [{ imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x/640px-Foo.jpg', thumbwidth: 640, thumbheight: 480, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Foo.jpg',
        extmetadata: { Artist: { value: '<a href="https://example.org/u">山田 太郎</a>' }, LicenseShortName: { value: license }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, ObjectName: { value: 'テストの建物' } } }] }] } };
    return { ok: true, json: async () => body };
  };
  f.calls = calls;
  return f;
};

test('imageInfo：記事の代表画像と、作者・ライセンスを取得する', async () => {
  const f = fake();
  const info = await imageInfo('ja:テスト記事A', { fetch: f });
  assert.equal(info.src, 'https://upload.wikimedia.org/x/640px-Foo.jpg');
  assert.equal(info.author, '山田 太郎');
  assert.equal(info.license, 'CC BY-SA 4.0');
  assert.equal(info.title, 'テストの建物');
  assert.match(f.calls[0], /^https:\/\/ja\.wikipedia\.org\/w\/api\.php\?.*prop=pageimages/);
  assert.match(f.calls[1], /titles=File%3AFoo\.jpg/);
  await imageInfo('ja:テスト記事A', { fetch: f });
  assert.equal(f.calls.length, 2, '同じ指定は2回目から問い合わせない');
});

test('imageInfo：自由に使えない画像・画像のない記事は使わない', async () => {
  assert.equal(await imageInfo('ja:テスト記事B', { fetch: fake('Non-free') }), null);
  assert.equal(await imageInfo('ja:テスト記事C', { fetch: fake('CC BY 4.0', null) }), null);
});

test('imageInfo：通信できないときは null で、あとでもう一度試せる', async () => {
  let n = 0;
  const down = async () => { n++; throw new Error('offline'); };
  assert.equal(await imageInfo('File:Offline.jpg', { fetch: down }), null);
  assert.equal(await imageInfo('File:Offline.jpg', { fetch: down }), null);
  assert.equal(n, 2);
});

test('imageInfo：記事の名前が変わって見つからないときは、検索でいちばん近い記事の画像を使う', async () => {
  const calls = [];
  const f = async url => {
    calls.push(url);
    const u = new URL(url);
    let body;
    if (u.searchParams.get('generator') === 'search') body = { query: { pages: [{ title: '落穂拾い (絵画)', pageimage: 'Gleaners.jpg' }] } };
    else if (u.searchParams.get('prop') === 'pageimages') body = { query: { pages: [{ title: '旧い記事名', missing: true }] } };
    else body = { query: { pages: [{ imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x/Gleaners.jpg', extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: 'Millet' } } }] }] } };
    return { ok: true, json: async () => body };
  };
  const info = await imageInfo('ja:旧い記事名 (テスト)', { fetch: f });
  assert.equal(info?.src, 'https://upload.wikimedia.org/x/Gleaners.jpg');
  assert.equal(new URL(calls[1]).searchParams.get('gsrsearch'), '旧い記事名 テスト');
  assert.match(calls[2], /titles=File%3AGleaners\.jpg/);
});
