// 勢力図の画面
import { $, $$, esc, fmtYear, fmtSpan, yearText } from '../core/util.js';
import { ZoneMap, polityColor } from './mapcore.js';
import { badges, holdRepeat, openEvent, ICON } from './common.js';
import { toast } from '../core/util.js';
import { resolveFocus, nameAtYear, nearestYear, PLACE_KIND } from '../core/places.js';
import { wireSearch } from './search.js';
import { ywLink } from './terms.js';

let state = null;

/** focusSpec … 検索から開いたときに印をつける場所（#map/年/city:28.98,41.01 の「city:28.98,41.01」） */
export function render(app, el, focusSpec) {
  const db = app.db, [a, b] = db.range;
  const views = db.config.mapViews || [['world', '世界']];
  const isMobile = matchMedia('(max-width: 859px)').matches;
  let view = app.settings.mapView && app.settings.mapView !== 'auto' ? app.settings.mapView : (isMobile ? 'europe' : 'eurasia');
  if (!db.zones?.views?.[view]) view = 'world';
  el.innerHTML = `
  <div class="page map-page">
    <div class="mini-slider">
      <div class="year-big"><span id="mpYear">${fmtYear(app.year)}</span><small>年</small></div>
      <input type="range" id="mpRange" min="${a}" max="${b}" value="${app.year}" aria-label="年を選ぶ">
      <div class="row"><button class="btn small" type="button" data-step="-1" aria-label="1年前">−1</button><button class="btn small" type="button" data-step="1" aria-label="1年後">+1</button></div>
    </div>
    <div class="chips scroll" id="mpViews">${views.map(([k, n]) => `<button class="chip${k === view ? ' on' : ''}" type="button" data-v="${k}">${esc(n)}</button>`).join('')}</div>
    <div class="map-layout">
      <div class="map-wrap">
        <div class="mapbox" id="mpMap"></div>
        <div class="map-find" id="mpFind">
          <button class="find-btn" type="button" id="mpFindBtn" aria-label="地名で探す" title="地名で探す">${ICON.search}</button>
          <div class="search"><span>${ICON.search}</span><input type="search" id="mpSearch" placeholder="地名で探す（例：長安・ナイル川）" autocomplete="off" aria-label="地名で探す"><div class="suggest" id="mpSuggest" hidden></div></div>
        </div>
      </div>
      <div class="map-side">
        <div class="panel info focus-card" id="mpFocus" hidden></div>
        <div class="panel info" id="mpInfo"><p class="muted small">地図の国をタップすると、その年の王朝・君主と出来事が出ます。二本指（PCはホイール）で拡大すると、その時代の都市・地方・川の名前と、前後5年の戦いの場所（✕印。タップで説明）が出ます。地図の左上の「地名で探す」（スマホは虫めがね）で、都市・川・戦いの場所へ飛べます。</p></div>
        <div class="panel"><div class="sec-title" style="margin-bottom:6px"><span>この範囲の勢力</span></div><div class="legend" id="mpLegend"></div></div>
        <p class="small muted">勢力図は概略です。境界は現代の州・県の境界を組み合わせた近似で、斜線は範囲が不確かな所・係争中の所です。地図データ：Natural Earth（パブリックドメイン）。</p>
      </div>
    </div>
  </div>`;
  state = { app, el, selected: null };
  state.map = new ZoneMap(app, $('#mpMap', el), {
    view, fontSize: isMobile ? 11 : 12.5,
    onSelect: p => { state.selected = p; showInfo(); },
    onBattle: ev => openEvent(app, ev),
    onHint: msg => toast(msg),
    onRender: () => drawLegend()
  });
  $('#mpRange', el).addEventListener('input', e => app.setYear(Number(e.target.value), { fromSlider: true }));
  // 押し続けると一定の速さで年が進む
  $$('[data-step]', el).forEach(btn => holdRepeat(btn, n => app.setYear(app.year + n * Number(btn.dataset.step))));
  $$('#mpViews .chip', el).forEach(c => c.addEventListener('click', () => {
    state.map.setView(c.dataset.v); drawLegend();
    app.settings.mapView = c.dataset.v; app.saveSettings();
    $$('#mpViews .chip', el).forEach(x => x.classList.toggle('on', x === c));
  }));
  $('#mpLegend', el).addEventListener('click', e => {
    const id = e.target.closest('[data-p]')?.dataset.p;
    if (!id) return;
    state.selected = db.polityById.get(id); state.map.select(id); showInfo();
  });
  // 地名で探す（スマホでは虫めがねのボタンで開く）
  const find = $('#mpFind', el), input = $('#mpSearch', el);
  const closeFind = () => { find.classList.remove('open'); input.value = ''; };
  $('#mpFindBtn', el).addEventListener('click', () => { find.classList.add('open'); input.focus(); });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { closeFind(); input.blur(); } });
  input.addEventListener('blur', () => setTimeout(() => { if (!input.value && document.activeElement !== input) find.classList.remove('open'); }, 250));
  wireSearch(app, input, $('#mpSuggest', el), {
    terms: false,
    onPlace: ({ spec, year }) => app.showOnMap(spec, year),
    onPick: closeFind
  });
  // 印をつけた場所の欄
  $('#mpFocus', el).addEventListener('click', e => {
    const f = state?.focus;
    if (!f) return;
    const y = e.target.closest('[data-y]')?.dataset.y;
    if (y != null) { app.setYear(Number(y)); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') { state.map.setFocus(f); drawLegend(); }
    if (act === 'clear') clearFocus();
    if (act === 'event') openEvent(app, f.event);
    if (act === 'evyear') app.setYear(f.event.year);
  });
  update();
  if (focusSpec && !focusOn(focusSpec)) toast('その場所は地図にありません');
}

/**
 * 勢力図のその場所に印をつけて、拡大して見せる。year を渡すとその年の地図にする。
 * 印をつけられたら true（場所が見つからないときは false）
 */
export function focusOn(spec, year) {
  if (!state) return false;
  const f = resolveFocus(state.app.db, spec);
  if (!f) return false;
  state.focus = f;
  if (year != null) state.app.setYear(year);
  state.map.setFocus(f);
  drawLegend(); // 凡例を拡大したあとの範囲の国にする
  showFocus();
  return true;
}

/** URL の年のあとにつける印（年を動かしても印を覚えておくため） */
export function hashTail() { return state?.focus ? `/${encodeURI(state.focus.spec)}` : ''; }

function clearFocus() {
  state.focus = null;
  state.map.setFocus(null, { zoom: false });
  showFocus();
  history.replaceState(null, '', `#map/${state.app.year}`);
}

/** その場所の名前の移り変わり（[{ name, from, to }]。データの最初の年から続く名前は from を null に） */
function nameHistory(names, start) {
  const out = [];
  names.forEach((e, i) => {
    if (!e[1]) return;
    const to = names[i + 1]?.[0] ?? null, last = out[out.length - 1];
    if (last && last.name === e[1] && last.to === e[0]) { last.to = to; return; }
    out.push({ name: e[1], from: e[0] > start ? e[0] : null, to });
  });
  return out;
}

function showFocus() {
  const { app, el, focus: f } = state, db = app.db, y = app.year;
  const box = $('#mpFocus', el);
  if (!f) { box.hidden = true; box.innerHTML = ''; return; }
  const [start] = db.range;
  let title, sub = '', names = '', acts = '';
  if (f.kind === 'event') {
    const e = f.event;
    title = e.title;
    sub = `${yearText(e.year)}${f.label !== e.title ? ` ・ ${esc(f.label)}` : ''}${Math.abs(y - e.year) > 5 ? ' ・ 戦いなどの✕印は、その年の前後5年だけ出ます' : ''}`;
    acts = `<button class="btn small" type="button" data-act="event">出来事の説明</button>${y !== e.year ? `<button class="btn small" type="button" data-act="evyear">${yearText(e.year)}へ</button>` : ''}`;
  } else if (f.kind === 'river') {
    title = f.name;
  } else {
    const now = nameAtYear(f.place.names, y);
    title = now?.name || f.name;
    if (!now) sub = `${yearText(y)}の地図には、この名前を出していません`;
    const hist = nameHistory(f.place.names, start);
    // 名前が変わる場所・ある時期だけの場所は、名前と期間を並べる（押すとその名前の時代へ）
    if (hist.length > 1 || hist.some(h => h.from != null || h.to != null)) {
      names = `<div class="names" role="group" aria-label="名前の移り変わり">${hist.map(h => {
        const on = (h.from ?? -Infinity) <= y && (h.to == null || y < h.to);
        const span = h.from != null || h.to != null ? `${h.from != null ? fmtYear(h.from) : ''}〜${h.to != null ? fmtYear(h.to) : ''}` : '';
        const go = Math.min(Math.max(nearestYear([[h.from, h.to]], y), start), db.range[1]);
        return `<button type="button" class="chip${on ? ' on' : ''}" data-y="${go}">${esc(h.name)}${span ? `<small>${span}</small>` : ''}</button>`;
      }).join('')}</div>`;
    }
  }
  box.innerHTML = `
    <div class="focus-kind">${ICON.pin.replace('<svg', '<svg aria-hidden="true"')}${PLACE_KIND[f.kind]}</div>
    <h3>${esc(title)}</h3>
    ${sub ? `<div class="meta">${sub}</div>` : ''}
    ${names ? `<div class="small muted" style="margin-top:6px">名前の移り変わり（押すとその時代へ）</div>${names}` : ''}
    <div class="row focus-acts">${acts}<button class="btn small" type="button" data-act="back">この場所へ戻る</button><a class="btn small" href="${ywLink(title)}" target="_blank" rel="noopener">世界史の窓で調べる</a><button class="btn small ghost" type="button" data-act="clear">印を消す</button></div>`;
  box.hidden = false;
}

function drawLegend() {
  if (!state?.map?.clusters) return;
  const m = state.map, box = $('#mpLegend', state.el);
  box.innerHTML = m.visiblePolities().slice(0, 24).map(p => `<button type="button" data-p="${esc(p.id)}"><i style="background:${esc(polityColor(p))}"></i>${esc(m.db.nameAt(p, m.year))}</button>`).join('') +
    '<span class="sym"><i class="v"></i>淡い色＝属国・従属地域</span><span class="sym"><i class="h"></i>斜線＝範囲が不確か・係争中</span>';
}

function showInfo() {
  const { app, el, selected: p } = state, db = app.db, y = app.year;
  const box = $('#mpInfo', el);
  if (!p) { box.innerHTML = '<p class="muted small">ここには主要な国家が入っていません（またはデータ未入力）。</p>'; return; }
  if (!db.isActive(p, y)) { box.innerHTML = `<h3>${esc(p.name)}</h3><p class="muted small">${yearText(y)}には存在しません。</p>`; return; }
  const child = p.children.find(c => db.isActive(c, y));
  const ids = [p.id, ...p.children.map(c => c.id)];
  const rulers = db.rulers.filter(r => ids.includes(r.polity) && r.from <= y && y <= r.to);
  const evs = db.events.filter(e => e.regions.includes(p.region) && Math.abs(e.year - y) <= 5).slice(0, 6);
  const changes = (p.territory || []).filter(t => t.note && t.year <= y && t.year >= y - 40).slice(-3);
  box.innerHTML = `
    <h3>${esc(db.nameAt(p, y))}${badges(child || p)}</h3>
    <div class="meta">${p.periods.map(([a, b]) => `${fmtYear(a)}〜${fmtYear(b)}年`).join('、')}${child ? ` ・ ${esc(child.name)}` : ''}</div>
    ${rulers.length ? `<p><b>${yearText(y)}：</b>${rulers.map(r => `${esc(r.name)}（${fmtSpan(r.from, r.to)}）`).join('、')}</p>` : ''}
    ${p.desc ? `<p class="small">${esc(p.desc)}</p>` : ''}
    ${changes.length ? `<p class="small"><b>最近の領土の変化：</b>${changes.map(t => `${fmtYear(t.year)} ${esc(t.note)}`).join('／')}</p>` : ''}
    ${evs.length ? `<p class="small"><b>前後5年の出来事：</b>${evs.map(e => `${fmtYear(e.year)} ${esc(e.title)}`).join('、')}</p>` : ''}`;
}

export function update() {
  if (!state) return;
  const { app, el } = state;
  $('#mpYear', el).textContent = fmtYear(app.year);
  const r = $('#mpRange', el); if (Number(r.value) !== app.year) r.value = app.year;
  state.map.setYear(app.year);
  if (state.selected) showInfo();
  if (state.focus) showFocus();
}

export function destroy() { state = null; }
