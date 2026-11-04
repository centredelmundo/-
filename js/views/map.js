// 勢力図の画面
import { $, $$, esc, fmtYear, fmtSpan, yearText } from '../core/util.js';
import { ZoneMap, polityColor } from './mapcore.js';
import { badges, holdRepeat, openEvent } from './common.js';
import { toast } from '../core/util.js';

let state = null;

export function render(app, el) {
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
      <div class="mapbox" id="mpMap"></div>
      <div class="map-side">
        <div class="panel info" id="mpInfo"><p class="muted small">地図の国をタップすると、その年の王朝・君主と出来事が出ます。二本指（PCはホイール）で拡大すると、その時代の都市・地方・川の名前と、前後5年の戦いの場所（✕印。タップで説明）が出ます。</p></div>
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
  update();
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
}

export function destroy() { state = null; }
