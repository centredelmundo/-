// 地域の歴史：その地域の出来事を年の順に縦に並べる（ヨコ年表の地域名から開く）
// 世紀ごとに見出しを付け、その世紀の主な王朝・国家も添える。いま見ている年の位置に印を出す。
import { $, $$, esc, fmtYear, centuryOf, centuryText } from '../core/util.js';
import { badges, openEvent, openIchimon, ichimonLinks } from './common.js';
import { timelineItems } from '../core/ichimon.js';

let state = null;

export function render(app, el, param) {
  const db = app.db, s = app.settings;
  const reg = db.regionById(param) || db.regions[0];
  state = { app, el, reg, minImp: s.minImportance || 1, culture: s.culture !== false, ich: s.ichTimeline !== false };
  el.innerHTML = `
  <div class="page narrow history">
    <div class="hv-top">
      <a class="btn small ghost" href="#timeline/${app.year}">← ヨコ年表</a>
      <h1 class="page-title">${esc(reg.name)}${reg.reference ? '（参考）' : ''}の歴史 <small>出来事を年の順に</small></h1>
    </div>
    <div class="chips scroll" id="hvRegions">${db.regions.map(r => `<a class="chip${r.id === reg.id ? ' on' : ''}" href="#history/${r.id}">${esc(r.name)}</a>`).join('')}</div>
    <div class="row hv-filters">
      <div class="seg" id="hvImp" role="group" aria-label="重要度">${[1, 2, 3].map(n => `<button type="button" data-v="${n}">${'★'.repeat(n)}${n < 3 ? '以上' : 'のみ'}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="hvCulture">文化史</label>
      ${db.ichimon ? '<label class="check"><input type="checkbox" id="hvIch">一問一答</label>' : ''}
      <button class="btn small" type="button" id="hvNow">いま見ている年へ</button>
    </div>
    <div id="hvBody"></div>
  </div>`;
  $('#hvCulture', el).checked = state.culture;
  if ($('#hvIch', el)) $('#hvIch', el).checked = state.ich;
  $$('#hvImp button', el).forEach(b => b.addEventListener('click', () => { state.minImp = Number(b.dataset.v); draw(); }));
  $('#hvCulture', el).addEventListener('change', e => { state.culture = e.target.checked; draw(); });
  $('#hvIch', el)?.addEventListener('change', e => { state.ich = e.target.checked; draw(); });
  $('#hvNow', el).addEventListener('click', () => scrollToNow(true));
  $('#hvBody', el).addEventListener('click', e => {
    const ich = e.target.closest('[data-ich]');
    if (ich) { const it = db.ichimon?.byId.get(ich.dataset.ich); if (it) openIchimon(app, it); return; }
    const row = e.target.closest('[data-ev]');
    if (row) { const ev = db.events.find(x => x.id === row.dataset.ev); if (ev) openEvent(app, ev); }
  });
  $('#hvBody', el).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('[data-ev], [data-ich]')?.click(); });
  draw();
  scrollToNow(false);
  document.title = `${reg.name}の歴史 — ヨコ串世界史`;
}

/** その地域の出来事（と一問一答）を年の順に */
function rows() {
  const { app, reg, minImp, culture, ich } = state, db = app.db;
  const list = db.events.filter(e => e.regions.includes(reg.id) && e.importance >= minImp && (culture || !e.culture)).map(e => ({ y: e.year, e }));
  const links = ichimonLinks(db);
  if (ich && links && minImp <= 1) {
    for (const it of timelineItems(db.ichimon, reg.id, -Infinity, Infinity)) if (!links.merged.has(it.id)) list.push({ y: it.y, it });
  }
  return list.sort((a, b) => a.y - b.y || (a.e?.month || 0) - (b.e?.month || 0));
}

/** その世紀の主な王朝・国家 */
function politiesIn(c) {
  const { app, reg } = state, db = app.db;
  const a = c > 0 ? (c - 1) * 100 + 1 : c * 100, b = a + 99;
  return db.polities.filter(p => p.region === reg.id && !p.minor && !p.hideInCards && !p.parent && p.periods.some(([s, e]) => s <= b && e >= a))
    .sort((x, y) => (y.importance || 0) - (x.importance || 0) || x.start - y.start).slice(0, 6)
    .sort((x, y) => x.start - y.start)
    .map(p => db.nameAt(p, Math.max(a, p.start)));
}

function draw() {
  const { app, el } = state, db = app.db;
  $$('#hvImp button', el).forEach(b => b.classList.toggle('on', Number(b.dataset.v) === state.minImp));
  const list = rows();
  const links = ichimonLinks(db);
  if (!list.length) { $('#hvBody', el).innerHTML = '<p class="muted small">この地域の出来事はまだありません。</p>'; return; }
  let html = '', cur = null, nowDone = false;
  const now = app.year;
  for (const r of list) {
    const c = centuryOf(r.y);
    if (c !== cur) {
      if (cur !== null) html += '</ol></section>';
      cur = c;
      const pols = politiesIn(c);
      html += `<section class="hv-cent" data-c="${c}"><h2 class="hv-h"><span>${centuryText(c)}</span>${pols.length ? `<small>${pols.map(esc).join('・')}</small>` : ''}</h2><ol class="hv-list">`;
    }
    if (!nowDone && r.y >= now) { html += `<li class="hv-now" id="hvNowMark"><span>いま見ている年：${fmtYear(now)}年</span></li>`; nowDone = true; }
    if (r.e) {
      const e = r.e, ich = links?.byEvent.has(e.key) ? '<span class="badge b-ich">一問一答</span>' : '';
      html += `<li class="hv-ev${e.importance >= 3 ? ' big' : ''}" data-ev="${esc(e.id)}" tabindex="0"><span class="y">${fmtYear(e.year)}${e.end ? `<small>〜${fmtYear(e.end)}</small>` : ''}</span><span class="t"><span class="term">${esc(e.title)}</span>${badges(e)}${ich}${e.desc ? `<span class="d">${esc(e.desc)}</span>` : ''}</span></li>`;
    } else {
      const it = r.it;
      html += `<li class="hv-ev ich" data-ich="${esc(it.id)}" tabindex="0"><span class="y">${fmtYear(it.y)}${it.yq < 3 ? '<small>ごろ</small>' : ''}</span><span class="t"><span class="term">${esc(it.title)}</span><span class="badge b-ich">一問一答</span></span></li>`;
    }
  }
  if (!nowDone) html += `<li class="hv-now" id="hvNowMark"><span>いま見ている年：${fmtYear(now)}年</span></li>`;
  html += '</ol></section>';
  $('#hvBody', el).innerHTML = html;
}

function scrollToNow(smooth) {
  const m = $('#hvNowMark', state?.el);
  if (m) setTimeout(() => m.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' }), smooth ? 0 : 60);
}

export function destroy() { state = null; document.title = 'ヨコ串世界史'; }
