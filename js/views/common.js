// 画面どうしで共通の部品：地域カード、詳細シート、印、王朝の帯
import { $, $$, esc, fmtSpan, fmtYear, yearText } from '../core/util.js';
import { tt, fillImage, ywLink } from './terms.js';
import { timelineItems, linkEvents, parts as ichParts, clock } from '../core/ichimon.js';
import { placesOf } from '../core/places.js';

export const LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true"><line x1="2" y1="20" x2="38" y2="20" style="stroke:var(--shu)" stroke-width="3.2" stroke-linecap="round"/><rect x="7" y="10.5" width="11" height="19" rx="2.6" fill="none" stroke="currentColor" stroke-width="2.8"/><rect x="22" y="10.5" width="11" height="19" rx="2.6" fill="none" stroke="currentColor" stroke-width="2.8"/></svg>';
export const ICON = {
  timeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 7h18M3 12h18M3 17h18"/><path d="M15 4v16" style="stroke:var(--shu)"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"/><path d="M12 17h.01"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4.5h-4.5"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l2.5 2.5L16 9"/><path d="M5 4h14v16H5z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>',
  pin: '<svg class="pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21.5s-6.5-6-6.5-11.5a6.5 6.5 0 0 1 13 0c0 5.5-6.5 11.5-6.5 11.5z"/><circle cx="12" cy="10" r="2.3"/></svg>'
};

/** 確認の印 */
export function badges(x, { culture = true } = {}) {
  let s = '';
  if (x.uncertain) s += `<span class="badge b-warn" title="${esc(x.memo || '年代に自信がない・説が分かれる')}">要確認</span>`;
  if (culture && x.culture) s += '<span class="badge b-cul">文化</span>';
  return s;
}

/** 地域の並び（設定を反映） */
export function visibleRegions(app, y) {
  const { regions } = app.db;
  const order = app.settings.order?.length ? app.settings.order : regions.map(r => r.id);
  const sorted = [...regions].sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return sorted.filter(r => !app.settings.hidden.includes(r.id) && (r.from == null || y >= r.from) && (r.to == null || y <= r.to));
}

/** 一問一答と出来事の結びつき（データを読み込み直すまで使い回す） */
let ichLinks = { data: null, links: null };
export function ichimonLinks(db) {
  if (!db.ichimon) return null;
  if (ichLinks.data !== db.ichimon) ichLinks = { data: db.ichimon, links: linkEvents(db.ichimon, db.events) };
  return ichLinks.links;
}

/** 地域カード（ヨコ年表の中心） */
export function renderCards(app, y, w) {
  const db = app.db, s = app.settings;
  return visibleRegions(app, y).map(reg => {
    const all = db.politiesIn(reg.id, y);
    const isMajor = x => (x.child || x.polity).importance >= 2 || x.polity.importance >= 2 || x.rulers.some(r => r.importance >= 2);
    const pols = all.filter(isMajor), others = all.filter(x => !isMajor(x));
    const evs = db.events.filter(e => e.regions.includes(reg.id) && e.year <= y + w && (e.end ?? e.year) >= y - w
      && e.importance >= (s.minImportance || 1) && (s.culture || !e.culture));
    const links = s.ichTimeline !== false ? ichimonLinks(db) : null;
    if (links && (s.minImportance || 1) <= 1) {
      // 出来事と同じ問題は、その出来事の行に印を付けるだけにする
      for (const it of timelineItems(db.ichimon, reg.id, y - w, y + w)) if (!links.merged.has(it.id)) evs.push({ ich: it, year: it.y });
      evs.sort((a, b) => a.year - b.year);
    }
    if (!all.length && !evs.length && reg.hideEmpty) return '';
    let dyn = pols.map(({ polity, child, rulers }) => {
      const main = child ? `<span class="term">${esc(child.name)}</span><small>${esc(db.nameAt(polity, y))}</small>` : `<span class="term">${esc(db.nameAt(polity, y))}</span>`;
      const ru = rulers.filter(r => r.importance >= 2).map(r => `<span class="ru"> ・ <span class="term">${esc(r.name)}</span>（${fmtSpan(r.from, r.to)}）${badges(r)}</span>`).join('');
      return `<div class="dyn" data-polity="${esc(polity.id)}">${main}${badges(child || polity)}${ru}</div>`;
    }).join('');
    if (others.length) dyn += `<div class="dyn-minor">ほか：${others.map(({ polity, child }) => `<span data-polity="${esc(polity.id)}">${esc(child?.name || db.nameAt(polity, y))}</span>`).join('・')}</div>`;
    const list = evs.length ? `<ul class="evs">${evs.map(e => evRow(e, y, w, links)).join('')}</ul>` : '';
    const empty = !all.length && !evs.length ? '<div class="empty">この期間のデータなし</div>' : '';
    const closed = (s.collapsed || []).includes(reg.id);
    const head = `<h3><a class="rc-name" href="#history/${reg.id}" title="${esc(reg.name)}の歴史を、出来事ごとに縦に見る">${esc(reg.name)}${reg.reference ? '（参考）' : ''}<i class="rc-go" aria-hidden="true"></i></a><button type="button" class="rc-toggle" data-fold="${reg.id}" aria-expanded="${!closed}" title="タップで出来事を${closed ? '開く' : '閉じる'}"><em>${evs.length ? '出来事 ' + evs.length + '件' : '出来事なし'}<i class="chev" aria-hidden="true"></i></em></button></h3>`;
    return `<article class="rc${closed ? ' closed' : ''}" data-region="${reg.id}">${head}${dyn}${list}${empty}</article>`;
  }).join('');
}

function evRow(e, y, w, links) {
  if (e.ich) return ichRow(e.ich, y, w);
  const ich = links?.byEvent.has(e.key) ? '<span class="badge b-ich" title="読み込んだ一問一答に、この出来事の問題があります">一問一答</span>' : '';
  const end = e.end ?? e.year, now = e.year === y || (e.year <= y && y <= end);
  const d = e.year > y ? e.year - y : end < y ? y - end : 0;
  const op = now ? 1 : Math.max(0.55, 1 - d / ((w || 1) * 2.4));
  return `<li class="ev${now ? ' now' : ''}" data-ev="${esc(e.id)}" style="opacity:${op.toFixed(2)}" tabindex="0"><span class="y">${fmtYear(e.year)}</span><span class="t"><span class="term">${esc(e.title)}</span>${e.end ? `<span class="to">（〜${fmtYear(e.end)}）</span>` : ''}${badges(e)}${ich}</span></li>`;
}

/** 一問一答の問題を、年表の出来事の行として出す */
function ichRow(it, y, w) {
  const d = Math.abs(it.y - y), now = d === 0;
  const op = now ? 1 : Math.max(0.55, 1 - d / ((w || 1) * 2.4));
  return `<li class="ev ich${now ? ' now' : ''}" data-ich="${esc(it.id)}" style="opacity:${op.toFixed(2)}" tabindex="0"><span class="y">${fmtYear(it.y)}${it.yq < 3 ? '<small title="ごろ（文中の世紀から）">頃</small>' : ''}</span><span class="t"><span class="term">${esc(it.title)}</span><span class="badge b-ich" title="読み込んだ一問一答の問題">一問一答</span></span></li>`;
}

/** 一問一答の問題の詳細（答えを太字で入れた文） */
export function openIchimon(app, it) {
  const db = app.db;
  const regs = it.regions.map(r => db.regionById(r)?.name || r).join('・');
  const [a, b] = db.range;
  const inRange = it.y != null && it.y >= a && it.y <= b;
  const sentence = ichParts(it.text).map(p => (p.s != null ? esc(p.s) : `<b class="ich-ans">${esc(p.a)}</b>`)).join('');
  const html = `
    <div class="muted small">${esc(regs)} ・ 一問一答</div>
    <h2>${esc(it.title)}</h2>
    <p class="ich-full">${sentence}</p>
    <dl class="kv">
      <dt>年</dt><dd class="yr">${it.y != null ? `${yearText(it.y)}${it.yq === 3 ? '' : it.yq === 2 ? 'ごろ（文中の世紀から）' : 'ごろ（前後の問題からの推定）'}` : '—'}</dd>
      <dt>出典</dt><dd>${db.ichimon?.chapters.find(c => c.n === it.ch) ? `第${it.ch}章 ${esc(db.ichimon.chapters.find(c => c.n === it.ch).title)}・` : ''}${esc(it.sec)}${it.audio ? `<br><span class="small muted">音声 ${esc(it.audio)} ・ ${clock(it.t)}ごろ</span>` : ''}</dd>
    </dl>
    ${inRange ? yokoPanel(app, it.y, 5, it.regions) : ''}
    <div class="q-actions">
      ${inRange ? `<button class="btn primary" type="button" data-act="go">${yearText(it.y)}へ移動</button>` : ''}
      <button class="btn" type="button" data-act="quiz">この問題を解く</button>
      <a class="btn" href="${ywLink(it.answers[0].replace(/（[^（）]+）$/, '').replace(/^[『「]|[』」]$/g, ''))}" target="_blank" rel="noopener">世界史の窓で調べる</a>
    </div>`;
  openSheet(html, sheet => {
    sheet.addEventListener('click', ev => {
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'go') { closeSheet(); app.setYear(it.y); if (!location.hash.startsWith('#timeline') && !location.hash.startsWith('#map')) location.hash = '#timeline'; }
      if (act === 'quiz') { closeSheet(); app.startQuizForIchimon(it); }
    });
  });
}

/** 答えたあとに出す「同じころの世界」 */
export function yokoPanel(app, y, w = 5, focusRegions = []) {
  const db = app.db;
  const groups = db.groups.filter(g => !g.optional || g.regions.some(r => focusRegions.includes(r)));
  const rows = groups.map(g => {
    const evs = db.events.filter(e => e.regions.some(r => g.regions.includes(r)) && e.year <= y + w && (e.end ?? e.year) >= y - w && e.importance >= 2)
      .sort((a, b) => b.importance - a.importance || Math.abs(a.year - y) - Math.abs(b.year - y)).slice(0, 2);
    const pols = g.regions.flatMap(r => db.politiesIn(r, y)).slice(0, 2)
      .map(({ polity, child, rulers }) => { const ru = rulers.filter(r => r.importance >= 2)[0]; return tt(child || polity, child?.name || db.nameAt(polity, y)) + (ru ? `（${tt(ru)}）` : ''); });
    if (!evs.length && !pols.length) return '';
    const items = [...evs.map(e => `${fmtYear(e.year)} ${tt(e)}`), ...pols].slice(0, 3);
    return `<li><b>${esc(g.name)}</b><span>${items.join('、')}</span></li>`;
  }).join('');
  return `<div class="yoko"><h4>同じころの世界（${yearText(y)}・前後${w}年）</h4><ul>${rows}</ul></div>`;
}

// ---- 詳細シート（下から出る画面）
let sheetBack = null;
export function openSheet(html, onMount) {
  closeSheet();
  sheetBack = document.createElement('div');
  sheetBack.className = 'sheet-back';
  sheetBack.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button class="iconbtn close" type="button" aria-label="閉じる">${ICON.close}</button>${html}</div>`;
  document.body.appendChild(sheetBack);
  const sheet = $('.sheet', sheetBack);
  sheetBack.addEventListener('click', e => { if (e.target === sheetBack || e.target.closest('.close')) closeSheet(); });
  document.addEventListener('keydown', escClose);
  sheet.querySelector('button, a, input')?.focus();
  onMount?.(sheet);
  return sheet;
}
const escClose = e => { if (e.key === 'Escape') closeSheet(); };
export function closeSheet() {
  if (sheetBack) { sheetBack.remove(); sheetBack = null; }
  document.removeEventListener('keydown', escClose);
}

/** 出来事の詳細 */
export function openEvent(app, e) {
  const db = app.db;
  const regs = e.regions.map(r => db.regionById(r)?.name || r).join('・');
  const when = e.end ? `${yearText(e.year)}〜${yearText(e.end)}` : `${yearText(e.year)}${e.month ? `${e.month}月` : ''}`;
  const ichs = ichimonLinks(db)?.byEvent.get(e.key) || [];
  const html = `
    <div class="muted small">${esc(regs)} ・ ${'★'.repeat(e.importance)}</div>
    <h2>${esc(e.title)}${badges(e)}</h2>
    ${e.image ? '<figure class="qimg" data-fill-img></figure>' : ''}
    <dl class="kv">
      <dt>年</dt><dd class="yr">${esc(when)}</dd>
      ${e.desc ? `<dt>概要</dt><dd>${esc(e.desc)}<span class="small muted">（${e.descVerified ? '確認済み' : '概要は未確認'}）</span></dd>` : ''}
      ${e.answers.length ? `<dt>別の言い方</dt><dd>${e.answers.map(esc).join('、')}</dd>` : ''}
      ${e.memo ? `<dt>メモ</dt><dd>${esc(e.memo)}</dd>` : ''}
      ${ichs.length ? `<dt>一問一答</dt><dd>${ichs.map(it => `<p class="ich-full small">${ichParts(it.text).map(p => (p.s != null ? esc(p.s) : `<b class="ich-ans">${esc(p.a)}</b>`)).join('')} <button class="btn small" type="button" data-ich-q="${esc(it.id)}">解く</button></p>`).join('')}</dd>` : ''}
    </dl>
    ${yokoPanel(app, e.year, 5, e.regions)}
    <div class="q-actions">
      <button class="btn primary" type="button" data-act="go">${yearText(e.year)}へ移動</button>
      <button class="btn" type="button" data-act="quiz">この出来事で練習</button>
      <button class="btn" type="button" data-act="star">${ICON.star.replace('<svg', '<svg width="16" height="16"')}苦手に追加</button>
      ${placesOf(e).length ? `<button class="btn" type="button" data-act="map">${ICON.pin.replace('<svg', '<svg width="16" height="16" aria-hidden="true"')}勢力図で場所を見る</button>` : ''}
      <a class="btn" href="${ywLink(e.title)}" target="_blank" rel="noopener">世界史の窓で調べる</a>
      <a class="btn" href="#data/${encodeURIComponent(e.key)}">データ確認で開く</a>
    </div>`;
  openSheet(html, sheet => {
    const fig = sheet.querySelector('[data-fill-img]');
    if (fig) fillImage(fig, e, { reveal: true });
    sheet.addEventListener('click', ev => {
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'go') { closeSheet(); app.setYear(e.year); if (!location.hash.startsWith('#timeline') && !location.hash.startsWith('#map')) location.hash = '#timeline'; }
      if (act === 'quiz') { closeSheet(); app.startQuizForEvent(e); }
      if (act === 'map') { closeSheet(); app.showOnMap(`event:${e.id}`, e.year); }
      const iq = ev.target.closest('[data-ich-q]');
      if (iq) { const it = db.ichimon?.byId.get(iq.dataset.ichQ); if (it) { closeSheet(); app.startQuizForIchimon(it); } }
      if (act === 'star') { app.starEvent(e); }
    });
  });
}

/** 王朝・国家の詳細 */
export function openPolity(app, p, y) {
  const db = app.db;
  const child = p.children.find(c => db.isActive(c, y));
  const ids = [p.id, ...p.children.map(c => c.id)];
  const rulers = db.rulers.filter(r => ids.includes(r.polity) && r.from <= y && y <= r.to);
  const periods = p.periods.map(([a, b]) => `${fmtYear(a)}〜${fmtYear(b)}年`).join('、');
  const notes = (p.territory || []).filter(t => t.note && Math.abs(t.year - y) <= 30).map(t => `<li><span class="yr">${fmtYear(t.year)}</span> ${esc(t.note)}${t.uncertain ? '<span class="badge b-warn">要確認</span>' : ''}</li>`).join('');
  const html = `
    <div class="muted small">${esc(db.regionById(p.region)?.name || '')}</div>
    <h2>${esc(db.nameAt(p, y))}${child ? ` <small class="muted">${esc(child.name)}</small>` : ''}${badges(p)}</h2>
    <dl class="kv">
      <dt>期間</dt><dd class="yr">${esc(periods)}</dd>
      ${rulers.length ? `<dt>${yearText(y)}</dt><dd>${rulers.map(r => `${esc(r.name)}（${fmtSpan(r.from, r.to)}）`).join('、')}</dd>` : ''}
      ${p.desc ? `<dt>概要</dt><dd>${esc(p.desc)}<span class="small muted">（${p.descVerified ? '確認済み' : '概要は未確認'}）</span></dd>` : ''}
      ${p.memo ? `<dt>メモ</dt><dd>${esc(p.memo)}</dd>` : ''}
    </dl>
    ${notes ? `<div class="yoko"><h4>領土の変化（${yearText(y)}の前後30年）</h4><ul class="plainlist">${notes}</ul></div>` : ''}
    <div class="q-actions"><a class="btn" href="${ywLink(p.name)}" target="_blank" rel="noopener">世界史の窓で調べる</a><a class="btn" href="#data/${encodeURIComponent(p.key)}">データ確認で開く</a></div>`;
  openSheet(html);
}

/** 出来事の多い年（スライダーの上の棒グラフ） */
export function densitySvg(app) {
  const [a, b] = app.db.range, n = b - a + 1;
  const cnt = new Array(n).fill(0);
  for (const e of app.db.events) if (e.year >= a && e.year <= b) cnt[e.year - a] += e.importance >= 3 ? 1.5 : 1;
  const mx = Math.max(1, ...cnt);
  return `<svg class="density" viewBox="0 0 ${n} 20" preserveAspectRatio="none" aria-hidden="true">${cnt.map((c, i) => c ? `<rect x="${i}" y="${20 - c / mx * 19}" width="1" height="${c / mx * 19}" style="fill:var(--ai)" opacity=".4"/>` : '').join('')}<rect class="cur" x="0" y="0" width="${Math.max(1, n / 250)}" height="20" style="fill:var(--shu)"/></svg>`;
}

/** 王朝の帯 */
export function ganttSvg(app, y) {
  const db = app.db, rows = db.config.ganttRows || [];
  const [a, b] = db.range;
  const W = 1180, x0 = 112, x1 = W - 6, rowH = 21, gap = 5, top = 4;
  const X = v => x0 + (Math.min(Math.max(v, a), b) - a) / (b - a) * (x1 - x0);
  let s = '';
  rows.forEach((row, i) => {
    const ty = top + i * (rowH + gap);
    s += `<text x="0" y="${ty + rowH / 2}" dominant-baseline="central" font-size="12" style="fill:var(--ink-2)">${esc(row.label)}</text>`;
    let j = 0;
    for (const item of row.polities) {
      const [id, from, to] = Array.isArray(item) ? item : [item];
      const p = db.polityById.get(id);
      if (!p) continue;
      const periods = from != null ? [[from, to ?? from]] : p.periods;
      for (const [s0, s1] of periods) {
        if (s1 < a || s0 > b) continue;
        const xa = X(s0), xb = X(s1), w = Math.max(xb - xa - 1, 1);
        const fill = p.color && !p.ganttNeutral ? p.color : (j % 2 ? 'var(--land)' : 'var(--minor)');
        const txt = p.color && !p.ganttNeutral ? '#1b1f27' : 'var(--ink)';
        s += `<g class="bar" data-y="${Math.max(s0, a)}"><title>${esc(p.name)}（${fmtYear(s0)}〜${fmtYear(s1)}）</title><rect x="${xa + 0.5}" y="${ty}" width="${w}" height="${rowH}" rx="3" style="fill:${fill}"/>`;
        if (w > p.name.length * 11.5 + 8) s += `<text x="${xa + 6}" y="${ty + rowH / 2}" dominant-baseline="central" font-size="11.5" style="fill:${txt}">${esc(p.name)}</text>`;
        s += '</g>';
      }
      j++;
    }
  });
  const h = top + rows.length * (rowH + gap) + 20;
  const step = (b - a) > 600 ? 100 : 50;
  for (let v = Math.ceil(a / step) * step; v <= b; v += step) {
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${top}" y2="${h - 18}" style="stroke:var(--line)" ${v % 100 ? 'stroke-dasharray="2 3"' : ''}/>`;
    s += `<text x="${X(v)}" y="${h - 6}" text-anchor="middle" font-size="11" style="fill:var(--ink-3)">${fmtYear(v)}</text>`;
  }
  s += `<g class="cursor"><line x1="${X(y)}" x2="${X(y)}" y1="0" y2="${h - 16}" style="stroke:var(--shu)" stroke-width="2"/><rect x="${X(y) - 21}" y="${h - 18}" width="42" height="16" rx="8" style="fill:var(--shu)"/><text x="${X(y)}" y="${h - 10}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" fill="#fff">${fmtYear(y)}</text></g>`;
  return `<svg class="gantt" viewBox="0 0 ${W} ${h}" role="img" aria-label="王朝・政体の移り変わり">${s}</svg>`;
}

/**
 * 年の −10・−1・+1・+10 ボタン：押した瞬間に1回、押し続けると一定の速さ（1秒に rate 回）でくり返す。
 * 回数は押してからの時間で決めるので、描画が重い年でも速さは変わらない。
 * キーボード（Enter・Space）で押したときは1回だけ。
 */
export function holdRepeat(btn, step, { delay = 400, rate = 10 } = {}) {
  let t0 = 0, done = 0, raf = 0, pid = null;
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; btn.classList.remove('holding');
    if (pid != null) { try { btn.releasePointerCapture(pid); } catch { /* もう離れている */ } pid = null; }
  };
  const tick = now => {
    const n = now - t0 < delay ? 0 : Math.floor((now - t0 - delay) * rate / 1000) + 1;
    if (n > done) { step(n - done); done = n; }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); // 長押しで文字の選択やメニューが出ないように
    stop();
    pid = e.pointerId;
    try { btn.setPointerCapture(pid); } catch { /* 古いブラウザ */ }
    step(1); done = 0; t0 = performance.now(); btn.classList.add('holding');
    raf = requestAnimationFrame(tick);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, stop);
  btn.addEventListener('click', e => { if (e.detail === 0) step(1); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.classList.add('hold-btn');
}

/** 赤シート：隠れた語をタップでめくる */
export function wireSheet(container) {
  container.addEventListener('click', e => {
    if (!container.classList.contains('sheet-on')) return;
    const t = e.target.closest('.term');
    if (t) { t.classList.toggle('open'); e.stopPropagation(); }
  }, true);
}

export const plural = (n, unit) => `${n}${unit}`;
export { $$ };
