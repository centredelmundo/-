// ヨコ年表：年を選ぶと、同じ年の各地域の王朝・出来事が並ぶ
import { $, $$, esc, fmtYear, debounce, clamp } from '../core/util.js';
import { base } from '../core/normalize.js';
import { renderCards, densitySvg, ganttSvg, openEvent, openPolity, wireSheet, ICON } from './common.js';
import { ZoneMap } from './mapcore.js';

let state = null;

export function render(app, el) {
  const db = app.db, [a, b] = db.range;
  const wins = db.config.windows || [3, 5, 10, 25];
  const anchors = (db.config.anchors || []).filter(([y]) => y >= a && y <= b);
  const pct = y => ((y - a) / (b - a) * 100).toFixed(2) + '%';
  const step = (b - a) > 600 ? 100 : (b - a) > 250 ? 50 : 25;
  const ticks = []; for (let v = Math.ceil(a / step) * step; v <= b; v += step) ticks.push(v);
  const mapViews = db.config.mapViews || [];
  el.innerHTML = `
  <div class="yearbar"><div class="yearbar-in">
    <div class="year-big"><input id="tlYear" inputmode="numeric" aria-label="年" value="${fmtYear(app.year)}"><small>年</small></div>
    <div class="yb-mobile">
      <button class="btn small" id="tlSheet2" type="button" aria-pressed="false">赤シート</button>
      <button class="iconbtn" id="tlSearchBtn" type="button" aria-label="用語で検索">${ICON.search}</button>
    </div>
    <div class="yb-ctrl">
      <div class="yb-steps">
        <button class="btn small" data-step="-10" type="button" aria-label="10年前">−10</button><button class="btn small" data-step="-1" type="button" aria-label="1年前">−1</button><button class="btn small" data-step="1" type="button" aria-label="1年後">+1</button><button class="btn small" data-step="10" type="button" aria-label="10年後">+10</button>
      </div>
      <div class="seg" id="tlWin" role="group" aria-label="前後何年を表示するか">${wins.map(w => `<button type="button" data-w="${w}">±${w}<span class="u">年</span></button>`).join('')}</div>
    </div>
    <div class="yb-right">
      <div class="slider">
        <div class="anchors">${anchors.map(([y, n, p], i) => `<span class="${(y - a) / (b - a) > 0.86 ? 'end' : ''}${i % 2 ? ' low' : ''}" data-p="${Number(p) || 2}" style="left:${pct(y)}" title="${fmtYear(y)}年">${esc(n)}</span>`).join('')}</div>        ${densitySvg(app)}
        <input type="range" id="tlRange" min="${a}" max="${b}" value="${app.year}" aria-label="年を選ぶ">
        <div class="ticks">${ticks.map((v, i) => `<span style="left:${pct(v)}">${fmtYear(v)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="yb-tools">
      <div class="search"><span>${ICON.search}</span><input type="search" id="tlSearch" placeholder="用語で検索（例：ナントの王令）" autocomplete="off" aria-label="用語で検索"><div class="suggest" id="tlSuggest" hidden></div></div>
      <button class="btn small" id="tlSheet" type="button" aria-pressed="false">赤シート</button>
    </div>
  </div></div>
  <div class="page">
    <div class="search mobile-search" id="tlMobileSearch" hidden><span>${ICON.search}</span><input type="search" id="tlSearchM" placeholder="用語で検索" autocomplete="off" aria-label="用語で検索"><div class="suggest" id="tlSuggestM" hidden></div></div>
    <div class="tl-main">
      <div class="tl-map" id="tlMapCol">
        <div class="chips scroll" id="tlViews">${mapViews.map(([k, n]) => `<button class="chip" type="button" data-v="${k}">${esc(n)}</button>`).join('')}</div>
        <div class="mapbox" id="tlMap"></div>
        <div class="legend" id="tlLegend"></div>
      </div>
      <div class="cards-col">
        <div class="fold-bar"><span class="fold-hint">地域名をタップすると出来事を開閉</span><button class="btn small" type="button" data-fold-all="open">すべて開く</button><button class="btn small" type="button" data-fold-all="close">すべて閉じる</button></div>
        <div class="cards wide" id="tlCards"></div>
      </div>
    </div>
    <details class="more" id="tlGanttBox" open><summary>王朝・政体の移り変わり（帯をタップするとその年へ）</summary><div class="gantt-box" id="tlGantt"></div></details>
  </div>`;
  const isMobile = matchMedia('(max-width: 859px)').matches;
  if (isMobile) $('#tlGanttBox', el).open = false;

  state = { app, el, map: null, ro: null };
  const slider = $('.slider', el);
  if ('ResizeObserver' in window) { state.ro = new ResizeObserver(() => layoutSlider(slider)); state.ro.observe(slider); }
  else layoutSlider(slider);
  const cards = $('#tlCards', el);
  wireSheet(cards);
  cards.classList.toggle('sheet-on', !!app.settings.sheet);
  cards.addEventListener('click', e => {
    const fold = e.target.closest('[data-fold]');
    if (fold) { toggleFold(app, fold.dataset.fold, fold.closest('.rc')); return; }
    const row = e.target.closest('[data-ev]');
    if (row) { const ev = db.events.find(x => x.id === row.dataset.ev); if (ev) openEvent(app, ev); return; }
    const dyn = e.target.closest('[data-polity]');
    if (dyn) { const p = db.polityById.get(dyn.dataset.polity); if (p) openPolity(app, p, app.year); }
  });
  cards.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('[data-ev]')?.click(); });
  $$('[data-fold-all]', el).forEach(btn => btn.addEventListener('click', () => {
    const ids = btn.dataset.foldAll === 'close' ? db.regions.map(r => r.id) : [];
    app.settings.collapsed = ids; app.saveSettings();
    $$('.rc', cards).forEach(c => setFold(c, ids.includes(c.dataset.region)));
  }));

  // 年の操作
  $$('[data-step]', el).forEach(btn => btn.addEventListener('click', () => app.setYear(app.year + Number(btn.dataset.step))));
  const range = $('#tlRange', el);
  range.addEventListener('input', () => app.setYear(Number(range.value), { fromSlider: true }));
  const yIn = $('#tlYear', el);
  yIn.addEventListener('focus', () => yIn.select());
  yIn.addEventListener('change', () => {
    const s = yIn.value.normalize('NFKC').trim();
    const m = s.match(/^(前|-)?(\d{1,4})$/);
    if (m) app.setYear(m[1] ? -Number(m[2]) : Number(m[2])); else yIn.value = fmtYear(app.year);
  });
  yIn.addEventListener('keydown', e => { if (e.key === 'Enter') yIn.blur(); });
  $$('#tlWin button', el).forEach(btn => btn.addEventListener('click', () => app.setWindow(Number(btn.dataset.w))));
  const toggleSheet = () => {
    app.settings.sheet = !app.settings.sheet; app.saveSettings();
    cards.classList.toggle('sheet-on', app.settings.sheet);
    $$('#tlSheet, #tlSheet2', el).forEach(b => { b.classList.toggle('on', app.settings.sheet); b.setAttribute('aria-pressed', app.settings.sheet); });
    $$('.term.open', cards).forEach(t => t.classList.remove('open'));
  };
  $$('#tlSheet, #tlSheet2', el).forEach(b => { b.classList.toggle('on', !!app.settings.sheet); b.addEventListener('click', toggleSheet); });
  $('#tlSearchBtn', el).addEventListener('click', () => { const box = $('#tlMobileSearch', el); box.hidden = !box.hidden; if (!box.hidden) $('#tlSearchM', el).focus(); });
  wireSearch(app, $('#tlSearch', el), $('#tlSuggest', el));
  wireSearch(app, $('#tlSearchM', el), $('#tlSuggestM', el));
  $('#tlGantt', el).addEventListener('click', e => { const bar = e.target.closest('.bar'); if (bar) app.setYear(Number(bar.dataset.y)); });

  // 地図（PCのみ）
  if (!isMobile && db.zones) {
    const view = app.settings.mapView && app.settings.mapView !== 'auto' ? app.settings.mapView : 'eurasia';
    state.map = new ZoneMap(app, $('#tlMap', el), {
      view, showYear: true, fontSize: 11.5,
      onSelect: p => { if (p) openPolity(app, p, app.year); },
      onRender: m => drawLegend(m)
    });
    $$('#tlViews .chip', el).forEach(c => {
      c.classList.toggle('on', c.dataset.v === view);
      c.addEventListener('click', () => {
        state.map.setView(c.dataset.v); drawLegend(state.map);
        app.settings.mapView = c.dataset.v; app.saveSettings();
        $$('#tlViews .chip', el).forEach(x => x.classList.toggle('on', x === c));
      });
    });
  } else {
    $('#tlMapCol', el).hidden = true;
  }
  update();
}

/**
 * スライダーの上の出来事名（ヒジュラ・十字軍…）と下の目盛りの年を、重ならないように出し分ける。
 * 年の範囲が長い（500〜2000年）ので、幅が狭いときは間引く。幅が変わるたびに呼ぶ。
 */
function layoutSlider(slider) {
  const w = slider.clientWidth;
  if (!w) return;
  const ticks = [...slider.querySelectorAll('.ticks span')];
  const per = ticks.length > 1 ? w / (ticks.length - 1) : w;
  const k = [1, 2, 3, 5, 10].find(c => per * c >= 44) ?? 10;
  ticks.forEach((t, i) => { t.style.visibility = i % k ? 'hidden' : ''; });
  const box = slider.querySelector('.anchors');
  if (!box || !box.offsetParent) return; // スマホでは出来事名は出さない
  // 優先度（config.anchors の3つ目の数）の高いものから、上の段・下の段の空いているところに置く。置けないものは省く
  const items = [...box.querySelectorAll('span')].map(s => { s.hidden = false; return { s, r: s.getBoundingClientRect(), p: Number(s.dataset.p) }; });
  items.sort((x, y) => y.p - x.p || x.r.left - y.r.left);
  const rows = [[], []];
  for (const { s, r } of items) {
    const row = rows.findIndex(placed => placed.every(q => r.left >= q.right + 8 || r.right + 8 <= q.left));
    s.classList.toggle('low', row === 1);
    s.hidden = row < 0;
    if (row >= 0) rows[row].push(r);
  }
}

/** 地域の出来事を開閉する（設定に覚える） */
function toggleFold(app, id, card) {
  const set = new Set(app.settings.collapsed || []);
  const close = !set.has(id);
  if (close) set.add(id); else set.delete(id);
  app.settings.collapsed = [...set]; app.saveSettings();
  if (card) setFold(card, close);
}
function setFold(card, closed) {
  card.classList.toggle('closed', closed);
  const b = card.querySelector('[data-fold]');
  if (b) { b.setAttribute('aria-expanded', String(!closed)); b.title = `タップで出来事を${closed ? '開く' : '閉じる'}`; }
}

function drawLegend(m) {
  const box = $('#tlLegend', state.el);
  if (!box) return;
  box.innerHTML = m.visiblePolities().filter(p => !p.minor).slice(0, 14).map(p => `<span><i style="background:${esc(p.color || '#ccc')}"></i>${esc(m.db.nameAt(p, m.year))}</span>`).join('') +
    '<span class="sym"><i class="v"></i>淡い色＝属国・従属地域</span><span class="sym"><i class="h"></i>斜線＝範囲が不確か・係争中</span>';
}

/** 年や幅が変わったときに描き直す */
export function update() {
  if (!state) return;
  const { app, el } = state;
  const y = app.year, w = app.window, [a, b] = app.db.range;
  const yIn = $('#tlYear', el); if (document.activeElement !== yIn) yIn.value = fmtYear(y);
  yIn.style.width = `${fmtYear(y).length * 0.62 + 0.25}em`;
  const range = $('#tlRange', el); if (Number(range.value) !== y) range.value = y;
  const cur = $('.density .cur', el); if (cur) cur.setAttribute('x', y - a);
  $$('#tlWin button', el).forEach(btn => btn.classList.toggle('on', Number(btn.dataset.w) === w));
  const cards = $('#tlCards', el);
  cards.innerHTML = renderCards(app, y, w);
  $('#tlGantt', el).innerHTML = ganttSvg(app, y);
  state.map?.setYear(y);
  if (state.hit) { const r = $(`[data-ev="${CSS.escape(state.hit)}"]`, cards); if (r) { r.classList.add('hit'); setTimeout(() => r.classList.remove('hit'), 2200); } state.hit = null; }
  document.title = `${fmtYear(y)}年 — ヨコ串世界史`;
  if (y < a || y > b) range.value = clamp(y, a, b);
}

export function destroy() { state?.ro?.disconnect(); state = null; document.title = 'ヨコ串世界史'; }

// ---- 用語で検索
function wireSearch(app, input, box) {
  const db = app.db;
  let items = [], idx = -1;
  const show = debounce(() => {
    const q = base(input.value);
    if (!q) { box.hidden = true; return; }
    items = [];
    for (const e of db.events) if ([e.title, ...e.answers].some(t => base(t).includes(q))) items.push({ y: e.year, label: e.title, kind: '出来事', ev: e });
    for (const r of db.rulers) if ([r.name, ...r.aliases].some(t => base(t).includes(q))) items.push({ y: r.from, label: `${r.name}（${r.from}〜${r.to}）`, kind: '人物' });
    for (const p of db.polities) if ([p.name, ...p.aliases].some(t => base(t).includes(q))) items.push({ y: p.start, label: `${p.name}（${fmtYear(p.start)}〜${fmtYear(p.end)}）`, kind: '王朝・国家' });
    items = items.slice(0, 30); idx = -1;
    box.innerHTML = items.length ? items.map((it, i) => `<button type="button" data-i="${i}"><span class="yr">${fmtYear(it.y)}</span><span>${esc(it.label)} <span class="k">${it.kind}</span></span></button>`).join('') : '<div class="small muted" style="padding:8px 12px">見つかりません</div>';
    box.hidden = false;
  }, 120);
  const go = i => {
    const it = items[i]; if (!it) return;
    box.hidden = true; input.blur();
    if (state && it.ev) state.hit = it.ev.id;
    app.setYear(it.y);
  };
  input.addEventListener('input', show);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); idx = clamp(idx + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
      $$('button', box).forEach((b, i) => b.classList.toggle('on', i === idx));
    }
    if (e.key === 'Enter') { e.preventDefault(); go(idx >= 0 ? idx : 0); }
    if (e.key === 'Escape') box.hidden = true;
  });
  box.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) go(Number(b.dataset.i)); });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 200));
}
