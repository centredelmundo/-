// 勢力図を拡大したときに出す地名（都市・地方・海・川）と、有名な戦いの場所。
// 地名は data/map/places.json（年によって名前が変わる）、川の線は data/map/rivers.json、
// 戦いの場所は出来事の place（[経度, 緯度] か、[経度, 緯度, "表示名"] の配列）から作る。
import { esc, fmtYear } from '../core/util.js';
import { project } from '../core/projection.js';
import { nameAtYear, placesOf } from '../core/places.js';

export { nameAtYear, placesOf };

/** 拡大の段階：1ピクセルあたりの地図の単位（scale）がこの値以上になったら、その重要度（1〜3）の地名を出す */
export const GEO_LEVELS = [0.9, 1.5, 2.4];
/** 戦いを出す範囲（選んだ年の前後） */
export const BATTLE_YEARS = 5;

const cache = new WeakMap();

function prepare(db) {
  if (cache.has(db)) return cache.get(db);
  const P = db.places || {};
  const pt = (lon, lat) => project(lon, lat);
  const items = [];
  for (const [kind, list] of [['city', P.cities], ['region', P.regions], ['sea', P.seas]]) {
    for (const c of list || []) {
      const [x, y] = pt(c.c[0], c.c[1]);
      items.push({ id: `${kind}:${c.c[0]},${c.c[1]}`, kind, x, y, names: (c.n || []).slice().sort((a, b) => a[0] - b[0]), rank: c.r || 2 });
    }
  }
  const rivers = (db.rivers?.rivers || []).map(r => ({ name: r.n, rank: r.r || 2, lines: r.d }));
  const riverPath = rivers.map(r => linesPath(r.lines));
  const battles = [];
  for (const e of db.events) for (const p of placesOf(e)) {
    const [x, y] = pt(p.lon, p.lat);
    battles.push({ e, x, y, label: p.label || e.title });
  }
  const prep = { items, rivers, riverPath, battles };
  cache.set(db, prep);
  return prep;
}

/** 線の並び（[x0, y0, x1, y1, …] の配列）を SVG の path にする */
export function linesPath(lines) {
  return (lines || []).map(l => {
    let d = `M${l[0]} ${l[1]}`;
    for (let i = 2; i < l.length; i += 2) d += `L${l[i]} ${l[i + 1]}`;
    return d;
  }).join('');
}

/** 川の線（地図を作るときに一度だけ入れる。出す・出さないは drawGeo で切りかえる） */
export function riverLayer(db) {
  const { rivers, riverPath } = prepare(db);
  return rivers.map((r, i) => `<path class="river r${r.rank}" d="${riverPath[i]}"/>`).join('');
}

const inView = (x, y, v, m = 0) => x >= v[0] - m && x <= v[0] + v[2] + m && y >= v[1] - m && y <= v[1] + v[3] + m;
const hit = (b, placed) => placed.some(q => !(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3]));

/**
 * 地名と戦いを描く。placed は国名ラベルの枠（重ならないように避ける）。
 * focus は検索から印をつけた場所（その名前は印の方で描くので、ここでは描かない）。
 * 戻り値 { labels: SVGの文字列, battles: SVGの文字列, level: 出した重要度の上限（0 なら出していない） }
 */
export function drawGeo(db, { year, vb, scale: s, placed, on = true, focus = null }) {
  const level = !on ? 0 : s >= GEO_LEVELS[2] ? 3 : s >= GEO_LEVELS[1] ? 2 : s >= GEO_LEVELS[0] ? 1 : 0;
  if (!level) return { labels: '', battles: '', level };
  const G = prepare(db);
  const u = 1 / s; // 1ピクセルの長さ（地図の単位）
  let labels = '', battles = '';
  // 戦い：選んだ年の前後5年。印はいつも出し、名前は空いていれば出す
  const near = G.battles.filter(b => Math.abs(b.e.year - year) <= BATTLE_YEARS && inView(b.x, b.y, vb, 10 * u))
    .sort((a, b) => b.e.importance - a.e.importance || Math.abs(a.e.year - year) - Math.abs(b.e.year - year));
  // 先にすべての印の場所を取ってから、名前を右・左・下・上の順に空いている所へ置く
  const marks = near.map(b => [b.x - 8 * u, b.y - 8 * u, b.x + 8 * u, b.y + 8 * u]);
  const names = near.map((b, i) => {
    if (focus?.event === b.e) return '';
    const fpx = 10.5, txt = `${b.label}（${fmtYear(b.e.year)}）`;
    const w = txt.length * fpx * 0.98 * u, h = fpx * 1.3 * u;
    const others = marks.filter((_, j) => j !== i);
    // 右・左（少し上下にずらした所も）→ 下・上（1行・2行はなれた所も）の順に試す
    const spots = [];
    const hp = fpx * 1.3; // 1行の高さ（ピクセル）
    for (const dy of [0, -hp, hp]) {
      spots.push({ box: [b.x + 10 * u, b.y + (dy - hp / 2) * u, b.x + 10 * u + w, b.y + (dy + hp / 2) * u], x: 11, y: dy, anchor: 'start' });
      spots.push({ box: [b.x - 10 * u - w, b.y + (dy - hp / 2) * u, b.x - 10 * u, b.y + (dy + hp / 2) * u], x: -11, y: dy, anchor: 'end' });
    }
    for (const k of [0, 1]) {
      const dy = 9 + hp / 2 + k * hp;
      spots.push({ box: [b.x - w / 2, b.y + (dy - hp / 2) * u, b.x + w / 2, b.y + (dy + hp / 2) * u], x: 0, y: dy, anchor: 'middle' });
      spots.push({ box: [b.x - w / 2, b.y - (dy + hp / 2) * u, b.x + w / 2, b.y - (dy - hp / 2) * u], x: 0, y: -dy, anchor: 'middle' });
    }
    const spot = spots.find(sp => !hit(sp.box, placed) && !hit(sp.box, others));
    if (spot) placed.push(spot.box);
    return spot ? `<text x="${spot.x}" y="${spot.y.toFixed(1)}" text-anchor="${spot.anchor}" dominant-baseline="central" font-size="${fpx}">${esc(txt)}</text>` : '';
  });
  placed.push(...marks);
  near.forEach((b, i) => {
    battles += `<g class="battle" data-battle="${esc(b.e.id)}" transform="translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) scale(${u.toFixed(4)})">` +
      `<title>${esc(`${b.label}（${fmtYear(b.e.year)}年）`)}</title><circle r="11" class="hit"/><circle r="7.5" class="bg"/><path d="M-4 -4L4 4M4 -4L-4 4" class="x"/>${names[i]}</g>`;
  });
  // 地名：重要度の高いものから。海・地方は少し大きく、都市は点をつける
  const cands = [];
  for (const it of G.items) {
    if (!inView(it.x, it.y, vb) || it.id === focus?.place?.id) continue;
    const n = nameAtYear(it.names, year, it.rank);
    if (!n || n.rank > level) continue;
    cands.push({ ...it, name: n.name, rank: n.rank });
  }
  // 川の名前は、画面の中にある線の点のうち真ん中あたりに置く
  G.rivers.forEach((r, i) => {
    if (r.rank > level || (focus?.kind === 'river' && focus.name === r.name)) return;
    const pts = [];
    for (const l of r.lines) for (let k = 0; k < l.length; k += 2) if (inView(l[k], l[k + 1], vb, -20 * u)) pts.push([l[k], l[k + 1]]);
    if (pts.length < 3) return;
    const [x, y] = pts[Math.floor(pts.length / 2)];
    cands.push({ kind: 'river', x, y, name: r.name, rank: r.rank, i });
  });
  const ORDER = { sea: 0, region: 1, city: 2, river: 3 };
  cands.sort((a, b) => a.rank - b.rank || ORDER[a.kind] - ORDER[b.kind]);
  const shownRivers = new Set();
  for (const c of cands) {
    const fpx = c.kind === 'city' ? (c.rank === 1 ? 11 : 10) : c.kind === 'river' ? 10 : c.rank === 1 ? 12 : 11;
    const spacing = c.kind === 'region' || c.kind === 'sea' ? 1.18 : 1;
    const w = c.name.length * fpx * spacing * u, h = fpx * 1.25 * u;
    const dx = c.kind === 'city' ? 4.5 * u : -w / 2;
    const box = [c.x + dx - 2 * u, c.y - h / 2, c.x + dx + w + 2 * u, c.y + h / 2];
    if (hit(box, placed)) continue;
    placed.push(box);
    const fs = (fpx * u).toFixed(2), sw = (2.6 * u).toFixed(2);
    if (c.kind === 'city') {
      labels += `<circle class="city-dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${(2.2 * u).toFixed(2)}"/>` +
        `<text class="geo city r${c.rank}" x="${(c.x + dx).toFixed(1)}" y="${c.y.toFixed(1)}" font-size="${fs}" dominant-baseline="central" style="stroke-width:${sw}">${esc(c.name)}</text>`;
    } else {
      labels += `<text class="geo ${c.kind}" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" font-size="${fs}" text-anchor="middle" dominant-baseline="central"${spacing > 1 ? ` letter-spacing="${(fpx * 0.18 * u).toFixed(2)}"` : ''} style="stroke-width:${sw}">${esc(c.name)}</text>`;
      if (c.kind === 'river') shownRivers.add(c.i);
    }
  }
  return { labels, battles, level };
}
