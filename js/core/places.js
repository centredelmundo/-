// 地名（都市・地方・海・川）と出来事の場所を探し、勢力図のどこに当たるかを調べる。DOMを使わない（テストできる）。
//   都市・地方・海 … data/map/places.json（年によって名前が変わる）
//   川 … data/map/rivers.json
//   出来事の場所 … 出来事の place（[経度, 緯度] か、[経度, 緯度, "表示名"] の配列）
import { base } from './normalize.js';
import { project } from './projection.js';
import { fmtYear } from './util.js';

export const PLACE_KIND = { city: '都市', region: '地方', sea: '海', river: '川', event: '出来事の場所' };
const KIND_ORDER = { city: 0, region: 1, sea: 2, river: 3 };

/** [[年, 名前, 重要度?], …] から、その年の名前と重要度を選ぶ（名前が null なら出さない） */
export function nameAtYear(names, y, rank = 2) {
  let cur = null;
  for (const e of names || []) { if (e[0] <= y) cur = e; else break; }
  if (!cur || !cur[1]) return null;
  return { name: cur[1], rank: cur[2] || rank };
}

/** 出来事の place を [{ lon, lat, label }] にする */
export function placesOf(e) {
  const p = e?.place;
  if (!Array.isArray(p) || !p.length) return [];
  const list = Array.isArray(p[0]) ? p : [p];
  return list.filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1])).map(q => ({ lon: q[0], lat: q[1], label: q[2] || null }));
}

/**
 * 地名を探すときの表記ゆれをそろえる。
 * base()（全角半角・ひらがな・小さい字・ヴ）に加えて、長音を消し、ティ/チ・ディ/ジ・ツィ/チ を同じにする
 * （「イスタンブール」で「イスタンブル」、「コンスタンチノープル」で「コンスタンティノープル」が見つかる）
 */
export function placeKey(s) {
  return base(s).replace(/ー/g, '').replace(/テイ/g, 'チ').replace(/デイ/g, 'ジ').replace(/ツイ/g, 'チ').replace(/ヂ/g, 'ジ').replace(/ヅ/g, 'ズ');
}

const cache = new WeakMap();

/**
 * 地名の一覧。1つの場所に名前が2つ以上あるとき（ビザンティウム→コンスタンティノープル→イスタンブル）は、名前ごとに1件。
 * 戻り値 [{ place, name, periods: [[から, まで（その年は含まない）|null], …], key }]
 * place は { id, kind, x, y, rank, names, bbox?, lines? }。id は勢力図の URL に使う（city:28.98,41.01・river:ナイル川）
 */
export function placeEntries(db) {
  if (cache.has(db)) return cache.get(db);
  const P = db.places || {}, out = [];
  for (const [kind, list] of [['city', P.cities], ['region', P.regions], ['sea', P.seas]]) {
    for (const it of list || []) {
      if (!Array.isArray(it.c)) continue;
      const names = (it.n || []).slice().sort((a, b) => a[0] - b[0]);
      const [x, y] = project(it.c[0], it.c[1]);
      const place = { id: `${kind}:${it.c[0]},${it.c[1]}`, kind, x, y, rank: it.r || 2, names };
      // 名前ごとの期間（同じ名前が続くとき（重要度だけ変わるとき）は1つにまとめる）
      const byName = new Map();
      names.forEach((e, i) => {
        if (!e[1]) return;
        const to = names[i + 1]?.[0] ?? null;
        const ps = byName.get(e[1]) || [];
        const last = ps[ps.length - 1];
        if (last && last[1] === e[0]) last[1] = to; else ps.push([e[0], to]);
        byName.set(e[1], ps);
      });
      for (const [name, periods] of byName) out.push({ place, name, periods, key: placeKey(name) });
    }
  }
  for (const r of db.rivers?.rivers || []) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of r.d || []) for (let k = 0; k + 1 < l.length; k += 2) {
      x0 = Math.min(x0, l[k]); x1 = Math.max(x1, l[k]); y0 = Math.min(y0, l[k + 1]); y1 = Math.max(y1, l[k + 1]);
    }
    if (!Number.isFinite(x0)) continue;
    const place = { id: `river:${r.n}`, kind: 'river', x: (x0 + x1) / 2, y: (y0 + y1) / 2, rank: r.r || 2, names: [[-Infinity, r.n]], bbox: [x0, y0, x1, y1], lines: r.d };
    out.push({ place, name: r.n, periods: [[null, null]], key: placeKey(r.n) });
  }
  cache.set(db, out);
  return out;
}

/** periods のうち、y にいちばん近い年（y が期間の中なら y のまま） */
export function nearestYear(periods, y) {
  let best = y, bd = Infinity;
  for (const [a, b] of periods || []) {
    const lo = a ?? -Infinity, hi = b == null ? Infinity : b - 1;
    const t = y < lo ? lo : y > hi ? hi : y;
    if (Math.abs(t - y) < bd) { bd = Math.abs(t - y); best = t; }
  }
  return best;
}

/** 名前の期間の書き方：「330〜1453年」「1453年〜」「〜前100年」「1403〜1928年、1949年〜」（データの最初の年から続くときは書かない） */
export function periodText(periods, start = -Infinity) {
  return (periods || []).map(([a, b]) => {
    const from = a != null && a > start ? fmtYear(a) : '';
    const to = b != null ? fmtYear(b) : '';
    return from && to ? `${from}〜${to}年` : from ? `${from}年〜` : to ? `〜${to}年` : '';
  }).filter(Boolean).join('、');
}

/**
 * 地名を探す。y は今の年。
 * 戻り値 [{ place, name, periods, how（0 一致・1 前方一致・2 部分一致）, year（その名前で呼ばれていた年のうち y にいちばん近い年）, hint }]
 * 同じ名前の場所が2つあるとき（テーベ）は、hint にその場所のゾーン（現在の地域）の名前を入れる。海の同じ名前（太平洋が2か所）は1つにまとめる。
 */
export function searchPlaces(db, query, y, limit = 5) {
  const q = placeKey(query);
  if (!q) return [];
  const [a, b] = db.range || [-Infinity, Infinity];
  const hits = [];
  for (const en of placeEntries(db)) {
    const how = en.key === q ? 0 : en.key.startsWith(q) ? 1 : en.key.includes(q) ? 2 : -1;
    if (how < 0) continue;
    const year = Math.min(Math.max(nearestYear(en.periods, y), a), b);
    hits.push({ ...en, how, year });
  }
  hits.sort((p, q2) => p.how - q2.how || p.place.rank - q2.place.rank || KIND_ORDER[p.place.kind] - KIND_ORDER[q2.place.kind] || p.name.length - q2.name.length);
  const out = [], seen = new Map();
  for (const h of hits) {
    const k = `${h.place.kind}|${h.name}`;
    if (seen.has(k)) {
      if (h.place.kind === 'sea' || h.place.kind === 'river') continue;
      seen.get(k).dup = true; h.dup = true;
    } else seen.set(k, h);
    out.push(h);
  }
  for (const h of out) if (h.dup) h.hint = zoneAtPoint(db.zones, h.place.x, h.place.y)?.n || '';
  return out.slice(0, limit);
}

/** 勢力図の URL の印（'city:28.98,41.01'・'river:ナイル川'・'event:<出来事のid>'）から、印をつける場所を作る */
export function resolveFocus(db, spec) {
  const m = String(spec ?? '').match(/^(city|region|sea|river|event):(.+)$/);
  if (!m) return null;
  const [, kind, val] = m;
  if (kind === 'event') {
    const e = db.events.find(x => x.id === val);
    const pl = e && placesOf(e)[0];
    if (!pl) return null;
    const [x, y] = project(pl.lon, pl.lat);
    return { spec, kind, x, y, event: e, label: pl.label || e.title };
  }
  const en = placeEntries(db).find(x => x.place.id === `${kind}:${val}`);
  if (!en) return null;
  const p = en.place;
  return { spec, kind, x: p.x, y: p.y, rank: p.rank, place: p, bbox: p.bbox || null, lines: p.lines || null, name: en.name };
}

// ---- 地図上の点がどのゾーン（州・県のまとまり）に入るか

const zcache = new WeakMap();
/** zones.json の線（差分で書いてある）を、そのままの座標の並びにする */
function decodedArcs(Z) {
  if (zcache.has(Z)) return zcache.get(Z);
  const arcs = Z.arcs.map(a => {
    const out = [a[0], a[1]];
    let x = a[0], y = a[1];
    for (let i = 2; i + 1 < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push(x, y); }
    return out;
  });
  zcache.set(Z, arcs);
  return arcs;
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * 地図上の点（地図の座標）を含むゾーン。
 * 海岸線を簡単にしてあるため、港町が少し海に出ることがある。そのときは margin 以内でいちばん近いゾーンにする（小さな島の点も含む）
 */
export function zoneAtPoint(Z, x, y, margin = 6) {
  if (!Z?.zones || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const arcs = decodedArcs(Z);
  let near = null, nd = margin;
  for (const z of Z.zones) {
    const bb = z.b;
    if (bb && (x < bb[0] - margin || x > bb[2] + margin || y < bb[1] - margin || y > bb[3] + margin)) continue;
    if (!z.r?.length) {
      if (z.p) { const d = Math.hypot(z.p[0] - x, z.p[1] - y); if (d < nd) { nd = d; near = z; } }
      continue;
    }
    let inside = false, dmin = Infinity;
    for (const ring of z.r) for (const ai of ring) {
      const a = arcs[ai < 0 ? ~ai : ai];
      if (!a) continue;
      for (let k = 2; k + 1 < a.length; k += 2) {
        const x1 = a[k - 2], y1 = a[k - 1], x2 = a[k], y2 = a[k + 1];
        if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside;
        const d = segDist(x, y, x1, y1, x2, y2);
        if (d < dmin) dmin = d;
      }
    }
    if (inside) return z;
    if (dmin < nd) { nd = dmin; near = z; }
  }
  return near;
}
