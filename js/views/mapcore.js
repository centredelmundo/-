// 勢力図の描画。ゾーン（州・県のまとまり）を、その年の持ち主の色で塗る。
// 国境は「隣り合うゾーンの持ち主がちがう境目」だけを線で引く。
import { esc, fmtYear } from '../core/util.js';
import { nameAtYear } from '../core/places.js';
import { riverLayer, drawGeo, linesPath, GEO_LEVELS } from './mapgeo.js';

const NS = 'http://www.w3.org/2000/svg';
const cache = new WeakMap();

/** zones.json を描ける形にする（一度だけ） */
function prepare(Z) {
  if (cache.has(Z)) return cache.get(Z);
  const pts = Z.arcs.map(a => {
    const out = [[a[0], a[1]]];
    let x = a[0], y = a[1];
    for (let i = 2; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([x, y]); }
    return out;
  });
  const arcPath = pts.map(p => {
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) d += `l${p[i][0] - p[i - 1][0]} ${p[i][1] - p[i - 1][1]}`;
    return d;
  });
  const arcZones = pts.map(() => []);
  const zonePath = Z.zones.map((z, zi) => {
    let d = '';
    for (const ring of z.r) {
      let px = null, py = null;
      for (const ai of ring) {
        const idx = ai < 0 ? ~ai : ai;
        if (!arcZones[idx].includes(zi)) arcZones[idx].push(zi);
        const seq = ai < 0 ? pts[idx].slice().reverse() : pts[idx];
        for (let k = 0; k < seq.length; k++) {
          const [x, y] = seq[k];
          if (px === null) { d += `M${x} ${y}`; } else if (k === 0) continue; else d += `l${x - px} ${y - py}`;
          px = x; py = y;
        }
      }
      d += 'z';
    }
    return d;
  });
  // 隣り合うゾーン（ラベルをまとめるのに使う）
  const nb = Z.zones.map(() => new Set());
  arcZones.forEach(zs => { if (zs.length === 2) { nb[zs[0]].add(zs[1]); nb[zs[1]].add(zs[0]); } });
  const coast = arcPath.filter((_, i) => arcZones[i].length === 1).join('');
  const prep = { arcPath, arcZones, zonePath, nb, coast, index: new Map(Z.zones.map((z, i) => [z.id, i])) };
  cache.set(Z, prep);
  return prep;
}

function hexToRgb(h) {
  const m = String(h).trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  if (!A || !B) return a;
  return `rgb(${A.map((v, i) => Math.round(v * (1 - t) + B[i] * t)).join(' ')})`;
}
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const DEFAULT_COLORS = ['#E9B44C', '#5FA873', '#B08ACF', '#E58867', '#9DC3E6', '#D88FD0', '#8FC77E', '#7F9BDB', '#E0716F', '#F2A04F', '#EADFA8', '#C89270', '#8C9DB0', '#5FB0C4', '#A795D9', '#EFC28F'];
export function polityColor(p) {
  if (p.color) return p.color;
  let h = 0; for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DEFAULT_COLORS[h % DEFAULT_COLORS.length];
}

export class ZoneMap {
  constructor(app, box, opt = {}) {
    this.app = app; this.db = app.db; this.box = box; this.opt = opt;
    this.Z = this.db.zones;
    this.year = opt.year ?? app.year;
    this.selected = null;
    if (!this.Z?.zones) { box.innerHTML = '<div class="notice warn">地図データ（data/map/zones.json）を読み込めませんでした。</div>'; return; }
    this.P = prepare(this.Z);
    this.vb = (this.Z.views[opt.view] || this.Z.views.eurasia || [0, 0, this.Z.W, this.Z.H]).slice();
    this.build();
    this.render();
  }

  build() {
    const id = 'm' + Math.random().toString(36).slice(2, 7);
    this.hid = id + 'h';
    const { zonePath } = this.P;
    const zones = this.Z.zones.map((z, i) => z.r.length ? `<path class="zone" data-i="${i}" d="${zonePath[i]}" fill-rule="evenodd"/>` : '').join('');
    this.box.innerHTML = `<svg xmlns="${NS}" role="img" aria-label="勢力図">
      <defs><pattern id="${this.hid}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.6" height="8" fill="rgb(20 24 32 / .34)"/></pattern></defs>
      <rect x="-9000" y="-9000" width="21000" height="21000" style="fill:var(--sea)"/>
      <g class="zones">${zones}</g>
      <g class="hatch"></g><g class="dots"></g>
      <g class="rivers">${this.opt.geo === false ? '' : riverLayer(this.db)}</g>
      <path class="coast" d="${this.P.coast}"/><path class="border"/><path class="sel"/>
      <g class="labels"></g><g class="geo"></g><g class="battles"></g><g class="focus"></g></svg>
      ${this.opt.zoom === false ? '' : `<div class="map-zoom"><button type="button" data-z="in" aria-label="拡大">＋</button><button type="button" data-z="out" aria-label="縮小">−</button>${this.opt.geo === false ? '' : `<button type="button" data-z="geo" class="geo-btn" aria-pressed="${this.geoOn()}" title="拡大したときに地名と戦いの場所を出す">地名</button>`}</div>`}
      ${this.opt.showYear ? '<div class="map-year"></div>' : ''}`;
    this.svg = this.box.querySelector('svg');
    this.paths = [...this.svg.querySelectorAll('.zone')].reduce((m, el) => (m[el.dataset.i] = el, m), {});
    this.gHatch = this.svg.querySelector('.hatch');
    this.gDots = this.svg.querySelector('.dots');
    this.pBorder = this.svg.querySelector('.border');
    this.pSel = this.svg.querySelector('.sel');
    this.gLabels = this.svg.querySelector('.labels');
    this.gGeo = this.svg.querySelector('.geo');
    this.gBattles = this.svg.querySelector('.battles');
    this.gFocus = this.svg.querySelector('.focus');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.applyView();
    this.wire();
  }

  setYear(y) { this.year = y; this.render(); }
  /** 地名・戦いの場所を出すか（地図の「地名」ボタンで切りかえ、設定に覚える） */
  geoOn() { return this.opt.geo !== false && this.app.settings.mapPlaces !== false; }
  setView(name) { const v = this.Z?.views[name]; if (v) { this.vb = v.slice(); this.applyView(); this.drawLabels(); } }
  select(polityId) { this.selected = polityId; this.drawSelection(); }

  /**
   * 検索した場所に印をつける（core/places.js の resolveFocus で作ったもの。null で消す）。
   * zoom のときは、その場所が真ん中に来るように拡大する
   */
  setFocus(f, { zoom = true } = {}) {
    this.focus = f || null;
    this._pulse = !!this.focus; // 印をつけた直後だけ、波紋で場所を知らせる
    if (this.focus && zoom && this.svg) this.focusView(this.focus);
    this.drawLabels();
  }

  /** 印の場所へ移る。都市・出来事の場所は地方が見えるくらい、地方・海は少し広く、川は全体が入るように */
  focusView(f) {
    const r = this.svg.getBoundingClientRect();
    const W = r.width || 600, H = r.height || 400;
    let cx = f.x, cy = f.y, s;
    if (f.bbox) {
      const [x0, y0, x1, y1] = f.bbox;
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
      s = Math.min(W / Math.max((x1 - x0) * 1.3, 1), H / Math.max((y1 - y0) * 1.3, 1));
    } else {
      const rk = Math.min(Math.max(f.rank || 2, 1), 3) - 1;
      const span = f.kind === 'region' ? [460, 330, 230][rk] : f.kind === 'sea' ? [400, 300, 230][rk] : 210;
      s = Math.min(W, H) / span;
    }
    // 地名が出る拡大（GEO_LEVELS[0]）より小さくしない。拡大の上限は zoomAt と同じ（横幅 90）
    s = Math.min(Math.max(s, GEO_LEVELS[0] * 1.05), W / 90);
    this.vb = [cx - W / 2 / s, cy - H / 2 / s, W / s, H / s];
    this.applyView();
  }

  /** 印（検索した場所）の名前。都市・地方・海はその年の名前（その年に名前がなければ、検索した名前を薄く出す） */
  focusLabel() {
    const f = this.focus;
    if (f.kind === 'event') return { text: `${f.label}（${fmtYear(f.event.year)}）`, off: false };
    if (f.kind === 'river') return { text: f.name, off: false };
    const n = nameAtYear(f.place.names, this.year);
    return n ? { text: n.name, off: false } : { text: f.name, off: true };
  }

  /** 印の名前の枠（国名・地名がこれと重ならないように、先に場所を取る） */
  focusBox(s) {
    const f = this.focus, u = 1 / s, fpx = 13;
    const { text } = this.focusLabel();
    const w = text.length * fpx * 1.02 * u, h = fpx * 1.35 * u;
    let x = f.x, y = f.y;
    if (f.kind === 'river') {
      const p = this.riverLabelPoint(u);
      if (!p) return null;
      [x, y] = p;
    }
    if (f.kind === 'region' || f.kind === 'sea' || f.kind === 'river') return { box: [x - w / 2 - 3 * u, y - h / 2, x + w / 2 + 3 * u, y + h / 2], x, y, anchor: 'middle', fpx };
    // 都市・出来事の場所：点の右に。地図の右はしからはみ出すときは左に
    const off = (f.kind === 'event' ? 15 : 11) * u;
    const right = x + off + w <= this.vb[0] + this.vb[2] - 4 * u;
    return right
      ? { box: [x + off - 2 * u, y - h / 2, x + off + w + 2 * u, y + h / 2], x: x + off, y, anchor: 'start', fpx }
      : { box: [x - off - w - 2 * u, y - h / 2, x - off + 2 * u, y + h / 2], x: x - off, y, anchor: 'end', fpx };
  }

  /** 川の名前を置く点（画面の中にある線の点のうち、真ん中あたり） */
  riverLabelPoint(u) {
    const v = this.vb, m = 20 * u, pts = [];
    for (const l of this.focus.lines || []) for (let k = 0; k + 1 < l.length; k += 2) {
      if (l[k] >= v[0] + m && l[k] <= v[0] + v[2] - m && l[k + 1] >= v[1] + m && l[k + 1] <= v[1] + v[3] - m) pts.push([l[k], l[k + 1]]);
    }
    return pts.length ? pts[Math.floor(pts.length / 2)] : null;
  }

  drawFocus(s, fb) {
    const f = this.focus;
    if (!f) { this.gFocus.innerHTML = ''; return; }
    const u = 1 / s;
    let out = '';
    if (f.kind === 'river') out += `<path class="focus-river" d="${linesPath(f.lines)}"/>`;
    if (f.kind === 'city' || f.kind === 'event') {
      out += `<g class="focus-pt" transform="translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${u.toFixed(4)})">${this._pulse ? '<circle r="13" class="pulse"/>' : ''}<circle r="${f.kind === 'event' ? 12.5 : 7}" class="ring"/>${f.kind === 'city' ? '<circle r="3" class="dot"/>' : ''}</g>`;
    }
    this._pulse = false;
    if (fb) {
      const { text, off } = this.focusLabel();
      out += `<text class="focus-lbl${off ? ' off' : ''}" x="${fb.x.toFixed(1)}" y="${fb.y.toFixed(1)}" font-size="${(fb.fpx * u).toFixed(2)}" text-anchor="${fb.anchor}" dominant-baseline="central" style="stroke-width:${(3.2 * u).toFixed(2)}">${esc(text)}</text>`;
    }
    this.gFocus.innerHTML = out;
  }

  applyView() { this.svg?.setAttribute('viewBox', this.vb.map(v => Math.round(v * 10) / 10).join(' ')); }
  scale() { const r = this.svg.getBoundingClientRect(); return Math.min((r.width || 600) / this.vb[2], (r.height || 300) / this.vb[3]); }

  render() {
    if (!this.svg) return;
    const db = this.db, y = this.year;
    this.owners = db.ownersAt(y);
    const land = cssVar('--land') || '#E7E2D6';
    const keyOf = [];
    let hatch = '', dots = '';
    const s = this.scale();
    this.Z.zones.forEach((z, i) => {
      const o = this.owners.get(z.id);
      const p = o && db.polityById.get(o.p);
      keyOf[i] = p ? p.id : '';
      let fill = land;
      if (p) {
        // 小さな国もそれぞれの色で塗る（以前はすべて薄い灰色で、色がないように見えた）
        const c = polityColor(p);
        fill = o.st === 'v' ? mix(c, land, 0.5) : c;
      }
      const el = this.paths[i];
      if (el) { el.style.fill = fill; el.style.stroke = fill; }
      if (p && o.st === 'c' && el) hatch += `<path d="${this.P.zonePath[i]}" fill="url(#${this.hid})" fill-rule="evenodd"/>`;
      if (!z.r.length && p && z.p) dots += `<circle cx="${z.p[0]}" cy="${z.p[1]}" r="${(3.2 / s).toFixed(2)}" style="fill:${fill};stroke:#1b1f27" stroke-width="${(0.8 / s).toFixed(2)}" data-i="${i}"/>`;
    });
    this.keyOf = keyOf;
    this.gHatch.innerHTML = hatch;
    this.gDots.innerHTML = dots;
    let border = '';
    this.P.arcZones.forEach((zs, ai) => { if (zs.length === 2 && keyOf[zs[0]] !== keyOf[zs[1]]) border += this.P.arcPath[ai]; });
    this.pBorder.setAttribute('d', border);
    const yl = this.box.querySelector('.map-year'); if (yl) yl.textContent = `${y < 0 ? '前' + -y : y}年`;
    this.computeClusters();
    this.drawLabels();
    this.drawSelection();
    this.opt.onRender?.(this);
  }

  /** 同じ国の隣り合うゾーンをまとめる（ラベル用） */
  computeClusters() {
    const Z = this.Z.zones, seen = new Set(), clusters = [];
    Z.forEach((z, i) => {
      const k = this.keyOf[i];
      if (!k || seen.has(i)) return;
      const stack = [i], members = [];
      seen.add(i);
      while (stack.length) {
        const j = stack.pop(); members.push(j);
        for (const n of this.P.nb[j]) if (!seen.has(n) && this.keyOf[n] === k) { seen.add(n); stack.push(n); }
      }
      let area = 0, cx = 0, cy = 0, colony = 0;
      for (const j of members) { const a = Z[j].a || 1; area += a; cx += Z[j].p[0] * a; cy += Z[j].p[1] * a; if (this.owners.get(Z[j].id)?.st === 'o') colony += a; }
      cx /= area; cy /= area;
      // 中心に近く、大きいゾーンにラベルを置く
      let best = members[0], bestScore = -Infinity;
      for (const j of members) { const d = Math.hypot(Z[j].p[0] - cx, Z[j].p[1] - cy); const sc = Math.sqrt(Z[j].a || 1) - d * 3; if (sc > bestScore) { bestScore = sc; best = j; } }
      clusters.push({ key: k, area, x: Z[best].p[0], y: Z[best].p[1], colony: colony > area / 2 });
    });
    this.clusters = clusters.sort((a, b) => b.area - a.area);
  }

  drawLabels() {
    if (!this.clusters) return;
    const s = this.scale(), fpx = this.opt.fontSize || 12, fs = fpx / s, placed = [], v = this.vb;
    // 検索した場所の名前は、国名・地名より先に場所を取る
    const fb = this.focus ? this.focusBox(s) : null;
    if (fb) placed.push(fb.box);
    let out = '';
    const seenIn = new Map();
    for (const c of this.clusters) {
      if (c.x < v[0] || c.x > v[0] + v[2] || c.y < v[1] || c.y > v[1] + v[3]) continue;
      const p = this.db.polityById.get(c.key);
      let name = this.db.nameAt(p, this.year);
      if (c.colony && !/領$/.test(name)) name += '領';
      const wpx = name.length * fpx * 1.02, hpx = fpx * 1.3;
      const areaPx = c.area / 178 * s * s;
      if (areaPx < wpx * hpx * (p.minor ? 2.2 : 1.1)) continue;
      const n = seenIn.get(c.key) || 0;
      if (n >= 3) continue;
      const bx = [c.x - wpx / 2 / s, c.y - hpx / 2 / s, c.x + wpx / 2 / s, c.y + hpx / 2 / s];
      if (placed.some(q => !(bx[2] < q[0] || bx[0] > q[2] || bx[3] < q[1] || bx[1] > q[3]))) continue;
      placed.push(bx); seenIn.set(c.key, n + 1);
      out += `<text class="lbl" x="${c.x}" y="${c.y}" font-size="${fs.toFixed(2)}" text-anchor="middle" dominant-baseline="central" style="stroke-width:${(2.8 / s).toFixed(2)}">${esc(name)}</text>`;
    }
    this.gLabels.innerHTML = out;
    // 拡大したときの地名（都市・地方・海・川）と、前後5年の戦いの場所
    if (this.opt.geo !== false) {
      const g = drawGeo(this.db, { year: this.year, vb: v, scale: s, placed, on: this.geoOn(), focus: this.focus });
      this.gGeo.innerHTML = g.labels;
      this.gBattles.innerHTML = g.battles;
      this.svg.dataset.geo = String(g.level);
    }
    this.drawFocus(s, fb);
  }

  drawSelection() {
    if (!this.pSel || !this.keyOf) return;
    let d = '';
    if (this.selected) this.Z.zones.forEach((z, i) => { if (this.keyOf[i] === this.selected) d += this.P.zonePath[i]; });
    this.pSel.setAttribute('d', d);
  }

  /** 表示中の範囲にある国（凡例用）。面積の大きい順 */
  visiblePolities() {
    const v = this.vb, m = new Map();
    for (const c of this.clusters || []) {
      if (c.x < v[0] || c.x > v[0] + v[2] || c.y < v[1] || c.y > v[1] + v[3]) continue;
      m.set(c.key, (m.get(c.key) || 0) + c.area);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => this.db.polityById.get(k));
  }

  // ---- 拡大・移動
  zoomAt(f, cx, cy) {
    const [x, y, w, h] = this.vb;
    const nw = Math.min(Math.max(w / f, 90), this.Z.W * 1.15), nh = nw * h / w;
    const px = cx ?? x + w / 2, py = cy ?? y + h / 2;
    this.vb = [px - (px - x) * nw / w, py - (py - y) * nh / h, nw, nh];
    this.applyView(); this.queueLabels();
  }
  queueLabels() { cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this.drawLabels()); }
  toMap(clientX, clientY) {
    const pt = this.svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const m = this.svg.getScreenCTM(); if (!m) return [0, 0];
    const r = pt.matrixTransform(m.inverse()); return [r.x, r.y];
  }

  wire() {
    const svg = this.svg, pointers = new Map();
    let start = null, moved = false, pinch = null;
    this.box.querySelector('.map-zoom')?.addEventListener('click', e => {
      const b = e.target.closest('[data-z]'), z = b?.dataset.z;
      if (z === 'geo') {
        this.app.settings.mapPlaces = !this.geoOn(); this.app.saveSettings();
        b.setAttribute('aria-pressed', String(this.geoOn()));
        this.drawLabels();
        if (this.geoOn() && this.svg.dataset.geo === '0') this.opt.onHint?.('地名と戦いの場所は、地図をもう少し拡大すると出ます');
        return;
      }
      if (z) this.zoomAt(z === 'in' ? 1.5 : 1 / 1.5);
    });
    svg.addEventListener('wheel', e => {
      if (this.opt.wheel === false) return;
      e.preventDefault();
      const [mx, my] = this.toMap(e.clientX, e.clientY);
      this.zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, mx, my);
    }, { passive: false });
    svg.addEventListener('pointerdown', e => {
      svg.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) { start = { x: e.clientX, y: e.clientY, vb: this.vb.slice() }; moved = false; }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: this.vb.slice(), c: this.toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
      }
    });
    svg.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const f = Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d;
        this.vb = pinch.vb.slice();
        this.zoomAt(f, pinch.c[0], pinch.c[1]);
        moved = true;
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      const s = this.scale();
      this.vb = [start.vb[0] - dx / s, start.vb[1] - dy / s, start.vb[2], start.vb[3]];
      this.applyView();
    });
    const end = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (moved) this.drawLabels();
        else if (e.type === 'pointerup') this.pick(e);
        start = null;
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  pick(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const bt = el?.closest?.('[data-battle]');
    if (bt) {
      const ev = this.db.events.find(x => x.id === bt.dataset.battle);
      if (ev) { this.opt.onBattle?.(ev); return; }
    }
    const i = el?.closest?.('[data-i]')?.dataset.i;
    const z = i != null ? this.Z.zones[+i] : null;
    const o = z && this.owners.get(z.id);
    const p = o && this.db.polityById.get(o.p);
    this.selected = p?.id || null;
    this.drawSelection();
    this.opt.onSelect?.(p || null, z, o);
  }
}
