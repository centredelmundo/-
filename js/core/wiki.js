// 作品・建築の写真を Wikipedia / Wikimedia Commons から取得する。
// 画像そのものと作者・ライセンスは、表示するときに端末から Wikimedia に問い合わせる
// （作者・ライセンスは Commons に登録された情報をそのまま表示する）。
// データには「どの記事（またはどのファイル）の画像か」だけを書く：
//   "ja:落穂拾い (ミレー)"   … 日本語版ウィキペディアの記事の代表画像
//   "en:The Gleaners"         … 英語版ウィキペディアの記事の代表画像
//   "File:Example.jpg"        … Wikimedia Commons のファイルを直接指定
const API = {
  ja: 'https://ja.wikipedia.org/w/api.php',
  en: 'https://en.wikipedia.org/w/api.php',
  commons: 'https://commons.wikimedia.org/w/api.php'
};
// 利用条件がはっきりした（自由に使える）ライセンスだけを使う
const FREE = /public domain|パブリックドメイン|^pd\b|\bpd-|cc0|cc[ -]?by|gfdl|free art license|attribution/i;
const cache = new Map();

/** "ja:記事名" / "en:Article" / "File:名前" を読む。読めなければ null */
export function parseImageSpec(spec) {
  const s = String(spec ?? '').trim();
  let m;
  if ((m = s.match(/^(?:File|Image|ファイル|画像):(.+)$/i))) return { wiki: 'commons', file: m[1].trim() };
  if ((m = s.match(/^(ja|en):(.+)$/))) return { wiki: m[1], article: m[2].trim() };
  return null;
}

/** ライセンス名が自由利用できるものか */
export const isFreeLicense = name => FREE.test(String(name ?? ''));

const strip = html => String(html ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

async function api(wiki, params, fetchImpl) {
  const url = `${API[wiki]}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 画像の情報を返す：{ src, width, height, page, file, author, license, licenseUrl, title }
 * 画像がない・自由に使えるライセンスでないときは null。通信できないときも null（あとでもう一度試す）。
 */
export function imageInfo(spec, { fetch: fetchImpl = globalThis.fetch?.bind(globalThis), width = 640 } = {}) {
  const key = `${spec}|${width}`;
  if (!cache.has(key)) {
    cache.set(key, lookup(spec, fetchImpl, width).catch(() => { cache.delete(key); return null; }));
  }
  return cache.get(key);
}

async function lookup(spec, fetchImpl, width) {
  const p = parseImageSpec(spec);
  if (!p || !fetchImpl) return null;
  let file = p.file;
  if (p.article) {
    const d = await api(p.wiki, { action: 'query', prop: 'pageimages', piprop: 'name', pilicense: 'free', redirects: '1', titles: p.article }, fetchImpl);
    const page = d?.query?.pages?.[0];
    file = page?.pageimage;
    // 記事の名前が変わって見つからないとき（Wikipedia の記事は改名されることがある）は、
    // 記事名で検索していちばん近い記事の代表画像を使う
    if (!file && page?.missing) {
      const q = p.article.replace(/[()（）]/g, ' ').replace(/\s+/g, ' ').trim();
      const s = await api(p.wiki, { action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '1', gsrnamespace: '0', prop: 'pageimages', piprop: 'name', pilicense: 'free' }, fetchImpl);
      file = s?.query?.pages?.[0]?.pageimage;
    }
    if (!file) return null;
  }
  const d = await api(p.wiki, {
    action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(width),
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|UsageTerms|ObjectName',
    iiextmetadatalanguage: 'ja', titles: `File:${file}`
  }, fetchImpl);
  const ii = d?.query?.pages?.[0]?.imageinfo?.[0];
  if (!ii) return null;
  const md = ii.extmetadata || {};
  const license = strip(md.LicenseShortName?.value || md.UsageTerms?.value);
  if (!isFreeLicense(license)) return null;
  let author = strip(md.Artist?.value) || '作者不明';
  if (author.length > 70) author = author.slice(0, 68) + '…';
  return {
    src: ii.thumburl || ii.url,
    width: ii.thumbwidth || ii.width || null,
    height: ii.thumbheight || ii.height || null,
    page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
    file,
    author,
    license,
    licenseUrl: md.LicenseUrl?.value || '',
    title: strip(md.ObjectName?.value) || file.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ')
  };
}
