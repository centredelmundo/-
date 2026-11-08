// 用語の概要シートと、作品・建築の写真（クイズ・年表・データ確認で共通）
import { esc, fmtYear, fmtSpan, yearText } from '../core/util.js';
import { imageInfo } from '../core/wiki.js';
import { answerRecord, answerLabel, isDateAnswer } from '../core/ichimon.js';
import { searchPlaces, periodText, PLACE_KIND } from '../core/places.js';
import { openSheet, closeSheet, badges, ICON } from './common.js';

export const KIND_LABEL = { event: '出来事', ruler: '人物', polity: '王朝・国家' };
// 人物の title は「皇帝」などの称号なので、名前には使わない（出来事だけ title が名前）
export const itemName = x => (x?.kind === 'event' ? x.title : x?.name ?? x?.title) || '';

/** 世界史の窓（y-history.net）でその用語を調べるリンク（サイト内検索） */
export const ywLink = name => `https://www.google.com/search?q=${encodeURIComponent(`site:y-history.net ${name}`)}`;
const safeUrl = u => (/^https?:\/\//.test(String(u || '')) ? String(u) : '');

/** タップすると概要が出る用語（クイズでは解答後にだけ反応する） */
export function tt(x, label) {
  const text = esc(label ?? itemName(x));
  return x?.key ? `<span class="tt" data-term="${esc(x.key)}">${text}</span>` : text;
}

/**
 * 一問一答の答えの語（タップすると概要。年・日付だけの答えは押せない）。
 * it は一問一答の問題（地域と年で、同じ名前の出来事を見分ける）
 */
export function ichWord(it, a, cls = 'ich-ans') {
  if (isDateAnswer(a)) return `<b class="${cls}">${esc(a)}</b>`;
  return `<b class="${cls} tt" data-word="${esc(a)}"${it?.id ? ` data-ich="${esc(it.id)}"` : ''}>${esc(a)}</b>`;
}

/**
 * 一問一答の答えの語の概要を出す。
 * アプリのデータに同じ名前の出来事・人物・王朝/国家があればその概要、勢力図の地名ならその場所（勢力図へ）、
 * どちらもなければ「世界史の窓で調べる」だけのシート
 */
export function openWord(app, word, it = null) {
  const db = app.db;
  const rec = answerRecord(db, word, it ? { y: it.y, regions: it.regions } : {});
  if (rec) { openTerm(app, rec.key); return; }
  const label = answerLabel(word);
  const hit = searchPlaces(db, label, it?.y ?? app.year, 3).find(h => h.how === 0);
  if (hit) {
    const period = periodText(hit.periods, db.range[0]);
    openSheet(`
      <div class="muted small">${PLACE_KIND[hit.place.kind]}（勢力図の地名）</div>
      <h2>${esc(hit.name)}</h2>
      ${period ? `<div class="yr term-when">${esc(period)}</div>` : ''}
      <p class="term-desc"><span class="muted">地名の概要はまだありませんが、勢力図でその場所を見られます。</span></p>
      <div class="q-actions">
        <button class="btn primary" type="button" data-act="map">${ICON.pin.replace('<svg', '<svg width="16" height="16" aria-hidden="true"')}勢力図で場所を見る</button>
        <a class="btn" href="${ywLink(hit.name)}" target="_blank" rel="noopener">世界史の窓で調べる</a>
      </div>`, sheet => {
      sheet.querySelector('[data-act="map"]').addEventListener('click', () => { closeSheet(); app.showOnMap(hit.place.id, hit.year); });
    });
    return;
  }
  openSheet(`
    <div class="muted small">一問一答の答え</div>
    <h2>${esc(label)}</h2>
    <p class="term-desc"><span class="muted">この語の概要は、アプリのデータにはまだありません。</span></p>
    <div class="q-actions"><a class="btn" href="${ywLink(label)}" target="_blank" rel="noopener">世界史の窓で調べる</a></div>`);
}

/** 用語の概要シート */
export function openTerm(app, key) {
  const db = app.db, x = db.byKey?.get(key);
  if (!x) return;
  let meta = '', when = '';
  if (x.kind === 'event') {
    meta = x.regions.map(r => db.regionById(r)?.name || r).join('・');
    when = x.end ? `${yearText(x.year)}〜${yearText(x.end)}` : `${yearText(x.year)}${x.month ? `${x.month}月` : ''}`;
  } else if (x.kind === 'ruler') {
    const p = db.polityById.get(x.polity);
    meta = [p && db.nameAt(p, x.from), x.title].filter(Boolean).join('・');
    when = `在位・在職 ${fmtSpan(x.from, x.to)}年`;
  } else {
    meta = db.regionById(x.region)?.name || '';
    when = x.periods.map(([a, b]) => `${fmtYear(a)}〜${fmtYear(b)}年`).join('、');
  }
  const src = safeUrl(x.source);
  const html = `
    <div class="muted small">${KIND_LABEL[x.kind]}${meta ? ` ・ ${esc(meta)}` : ''}</div>
    <h2>${esc(itemName(x))}${badges(x)}</h2>
    <div class="yr term-when">${esc(when)}</div>
    ${x.image ? '<figure class="qimg" data-fill-img></figure>' : ''}
    <p class="term-desc">${x.desc ? esc(x.desc) : '<span class="muted">（概要はまだありません）</span>'}</p>
    <dl class="kv small">
      ${x.uncertain ? '<dt>年号</dt><dd><span class="badge b-warn">要確認</span> 説が分かれる・数え方がちがう年があります（メモ参照）</dd>' : ''}
      <dt>概要</dt><dd>${x.descVerified ? '✓ 確認済み' : '未確認'}</dd>
      ${x.memo ? `<dt>メモ</dt><dd>${esc(x.memo)}</dd>` : ''}
    </dl>
    <div class="q-actions">
      <a class="btn" href="${ywLink(itemName(x))}" target="_blank" rel="noopener">世界史の窓で調べる</a>
      ${src ? `<a class="btn" href="${esc(src)}" target="_blank" rel="noopener">参照ページ</a>` : ''}
      <a class="btn ghost" href="#data/${encodeURIComponent(x.key)}">データ確認で開く</a>
    </div>`;
  openSheet(html, sheet => {
    const fig = sheet.querySelector('[data-fill-img]');
    if (fig) fillImage(fig, x, { reveal: true });
  });
}

/**
 * 作品・建築の写真を figure 要素に入れる。
 * reveal = false のときは作品名を出さない（クイズの答えを明かさないため）。作者とライセンスはいつも出す。
 */
export async function fillImage(fig, x, { reveal = true } = {}) {
  if (!x?.image) { fig.remove(); return; }
  fig.classList.add('qimg');
  if (!fig.querySelector('img')) fig.innerHTML = '<div class="img-msg">画像を読み込み中…</div>';
  const info = await imageInfo(x.image);
  if (!fig.isConnected) return;
  if (!info) {
    fig.innerHTML = '<div class="img-msg">画像を表示できません（通信できないか、利用条件のはっきりした画像が見つかりません）</div>';
    return;
  }
  const lic = info.licenseUrl ? `<a href="${esc(safeUrl(info.licenseUrl))}" target="_blank" rel="noopener">${esc(info.license)}</a>` : esc(info.license);
  fig.innerHTML = `<img src="${esc(info.src)}" alt="${reveal ? esc(info.title) : '出題に関係する作品・建築の写真'}" loading="lazy" decoding="async"${info.width ? ` width="${info.width}" height="${info.height}"` : ''}>
    <figcaption>${reveal ? `<span class="cap-title">${esc(info.title)}</span>` : ''}<span class="credit">画像：<a href="${esc(safeUrl(info.page))}" target="_blank" rel="noopener">${esc(info.author)}</a> ／ ${lic}（Wikimedia Commons）${x.imageVerified ? '' : '<span class="badge b-gray" title="この画像が正しい作品・建築かはまだ確認されていません">画像は未確認</span>'}</span></figcaption>`;
  fig.querySelector('img').addEventListener('error', () => { fig.innerHTML = '<div class="img-msg">画像を表示できませんでした</div>'; }, { once: true });
}
