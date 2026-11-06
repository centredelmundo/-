// 検索欄の候補（ヨコ年表の「用語・地名で検索」と、勢力図の「地名で探す」で使う）
import { $$, esc, fmtYear, debounce, clamp } from '../core/util.js';
import { base } from '../core/normalize.js';
import { searchPlaces, periodText, placesOf, PLACE_KIND } from '../core/places.js';
import { ICON } from './common.js';

const PIN = ICON.pin.replace('<svg', '<svg aria-hidden="true"');

/**
 * 検索欄に候補を出す。
 *   terms … 出来事・人物・王朝も探す（false のときは地名と出来事の場所だけ。勢力図の画面）
 *   onTerm(item) … 出来事・人物・王朝を選んだとき（item.y は年、item.ev は出来事）
 *   onPlace({ spec, year }) … 地名・出来事の場所を選んだとき（勢力図でその場所を見る。spec は core/places.js の resolveFocus の書き方）
 *   onPick() … 何かを選んだあと（勢力図の検索欄を閉じるのに使う）
 */
export function wireSearch(app, input, box, { terms = true, onTerm, onPlace, onPick } = {}) {
  const db = app.db;
  let items = [], idx = -1;
  const show = debounce(() => {
    const q = base(input.value);
    if (!q) { box.hidden = true; return; }
    items = [];
    // 地名：その名前で呼ばれていた年へ（今の年がその期間に入っていれば、今の年のまま）
    for (const h of searchPlaces(db, input.value, app.year, terms ? 5 : 12)) {
      const note = [h.hint, periodText(h.periods, db.range[0])].filter(Boolean).join('・');
      items.push({ y: h.year, label: note ? `${h.name}（${note}）` : h.name, tag: `${PIN}${PLACE_KIND[h.place.kind]}`, spec: h.place.id });
    }
    const evs = db.events.filter(e => [e.title, ...e.answers].some(t => base(t).includes(q)));
    if (terms) {
      const rest = evs.map(e => ({ y: e.year, label: e.title, tag: e.image ? '写真' : '出来事', ev: e, map: placesOf(e).length > 0 }));
      rest.sort((a, b) => (b.tag === '写真') - (a.tag === '写真'));
      for (const r of db.rulers) if ([r.name, ...r.aliases].some(t => base(t).includes(q))) rest.push({ y: r.from, label: `${r.name}（${r.from}〜${r.to}）`, tag: '人物' });
      for (const p of db.polities) if ([p.name, ...p.aliases].some(t => base(t).includes(q))) rest.push({ y: p.start, label: `${p.name}（${fmtYear(p.start)}〜${fmtYear(p.end)}）`, tag: '王朝・国家' });
      items.push(...rest.slice(0, 30));
    } else {
      for (const e of evs) if (placesOf(e).length) items.push({ y: e.year, label: e.title, tag: `${PIN}${PLACE_KIND.event}`, spec: `event:${e.id}` });
      items = items.slice(0, 30);
    }
    idx = -1;
    box.innerHTML = items.length ? items.map(row).join('') : `<div class="small muted" style="padding:8px 12px">見つかりません${terms ? '' : '（都市・地方・海・川の名前と、戦いなどの出来事の名前で探せます）'}</div>`;
    box.hidden = false;
  }, 120);
  const row = (it, i) => {
    const main = `<button type="button" data-i="${i}"><span class="yr">${fmtYear(it.y)}</span><span>${esc(it.label)} <span class="k">${it.tag}</span></span></button>`;
    // 場所のわかる出来事（戦いなど）は、行の右の「地図」で勢力図のその場所へ
    return it.map ? `<div class="sg-row">${main}<button type="button" class="sg-map" data-map="${i}" title="勢力図で場所を見る" aria-label="${esc(it.label)}の場所を勢力図で見る">${PIN}地図</button></div>` : main;
  };
  const go = (i, map = false) => {
    const it = items[i];
    if (!it) return;
    box.hidden = true; input.blur();
    if (it.spec) onPlace?.({ spec: it.spec, year: it.y });
    else if (map && it.ev) onPlace?.({ spec: `event:${it.ev.id}`, year: it.ev.year });
    else onTerm?.(it);
    onPick?.(it);
  };
  input.addEventListener('input', show);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); idx = clamp(idx + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
      $$('[data-i]', box).forEach((b, i) => b.classList.toggle('on', i === idx));
    }
    if (e.key === 'Enter') { e.preventDefault(); go(idx >= 0 ? idx : 0); }
    if (e.key === 'Escape') box.hidden = true;
  });
  box.addEventListener('click', e => {
    const m = e.target.closest('[data-map]');
    if (m) { go(Number(m.dataset.map), true); return; }
    const b = e.target.closest('[data-i]');
    if (b) go(Number(b.dataset.i));
  });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 200));
}
