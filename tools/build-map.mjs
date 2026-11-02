// 勢力図用のゾーン地図 data/map/zones.json を作る。
//   npm install        （初回のみ。mapshaper を入れる）
//   npm run build:map
// 元データ: Natural Earth 1:10m Admin 1 – States, Provinces（パブリックドメイン）
// 環境変数 NE_ADMIN1 に GeoJSON のパスを渡すと、ダウンロードを省略できる。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ZONES, SPLITS, VIEWS } from './zones.mjs';
import { project, MAP_W, LAT_TOP, LAT_BOT } from '../js/core/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', '.cache');
const SRC_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const SRC = process.env.NE_ADMIN1 || path.join(CACHE, 'ne_10m_admin_1.geojson');
const OUT = path.join(ROOT, 'data', 'map', 'zones.json');
const OUT_MD = path.join(ROOT, 'data', 'map', 'ZONES.md');
const SIMPLIFY = process.env.SIMPLIFY || '7%';

fs.mkdirSync(CACHE, { recursive: true });
if (!fs.existsSync(SRC)) {
  console.log('Natural Earth のデータをダウンロードします…');
  execFileSync('curl', ['-sSL', '--fail', '-o', SRC, SRC_URL], { stdio: 'inherit' });
}

// ---- 条件の解釈
function parseRule(s) {
  let m;
  const list = x => x.split(',').map(v => v.trim());
  if ((m = s.match(/^([A-Z]{3}):(.+)$/))) { const v = list(m[2]); return { a3: m[1], test: p => v.includes(p.iso_3166_2), specific: true }; }
  if ((m = s.match(/^([A-Z]{3})@(.+)$/))) { const v = list(m[2]); return { a3: m[1], test: p => v.includes(p.geonunit), specific: true }; }
  if ((m = s.match(/^([A-Z]{3})#(.+)$/))) { const v = list(m[2]); return { a3: m[1], test: p => v.includes(p.region), specific: true }; }
  if ((m = s.match(/^([A-Z]{3})\?(.+)$/))) { const f = new Function('p', `return (${m[2]});`); return { a3: m[1], test: f, specific: true }; }
  if (/^[A-Z]{3}$/.test(s)) return { a3: s, test: () => true, specific: false };
  throw new Error('ゾーンの条件が読めません: ' + s);
}
const zoneDefs = ZONES.map(([id, name, ...rules]) => ({ id, name, rules: rules.map(parseRule) }));
const names = new Map(zoneDefs.map(z => [z.id, z.name]));
const splitDefs = SPLITS.map(s => {
  for (const side of ['south', 'north']) if (Array.isArray(s[side])) { names.set(s[side][0], s[side][1]); s[side] = s[side][0]; }
  return { ...s, r: parseRule(s.rule) };
});

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const main = [], splitParts = splitDefs.map(() => ({ south: [], north: [] }));
const fallback = new Map();
for (const f of src.features) {
  const p = f.properties;
  if (['ATA', 'ATF', 'HMD', 'SGS'].includes(p.adm0_a3)) continue;
  const si = splitDefs.findIndex(s => s.r.a3 === p.adm0_a3 && s.r.test(p));
  if (si >= 0) {
    splitParts[si].south.push({ type: 'Feature', properties: { zone: splitDefs[si].south }, geometry: f.geometry });
    splitParts[si].north.push({ type: 'Feature', properties: { zone: splitDefs[si].north }, geometry: f.geometry });
    continue;
  }
  let zone = null;
  for (const pass of [true, false]) {
    for (const z of zoneDefs) {
      if (z.rules.some(r => r.specific === pass && r.a3 === p.adm0_a3 && r.test(p))) { zone = z.id; break; }
    }
    if (zone) break;
  }
  if (!zone) {
    zone = 'x-' + p.adm0_a3.toLowerCase();
    if (!names.has(zone)) { names.set(zone, p.admin); fallback.set(zone, p.admin); }
  }
  main.push({ type: 'Feature', properties: { zone }, geometry: f.geometry });
}
if (fallback.size) console.log(`定義のない国 ${fallback.size}件は国単位のゾーンにしました: ${[...fallback.keys()].join(' ')}`);

const tmp = path.join(CACHE, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
const write = (name, features) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify({ type: 'FeatureCollection', features })); return f; };
const inputs = [write('main.json', main)];
const clipArgs = [];
splitDefs.forEach((s, i) => {
  inputs.push(write(`s${i}s.json`, splitParts[i].south), write(`s${i}n.json`, splitParts[i].north));
  clipArgs.push('-clip', `bbox=-180,-90,180,${s.lat}`, `target=s${i}s`, '-clip', `bbox=-180,${s.lat},180,90`, `target=s${i}n`);
});
const req = createRequire(import.meta.url);
const msBin = path.join(path.dirname(req.resolve('mapshaper/package.json')), 'bin', 'mapshaper');
const topoFile = path.join(tmp, 'zones.topo.json'), ptsFile = path.join(tmp, 'zones.pts.json');
execFileSync(process.execPath, [msBin, '-i', 'combine-files', ...inputs, 'snap', ...clipArgs,
  '-merge-layers', 'target=*', 'force', 'name=z',
  '-clip', `bbox=-180,${LAT_BOT},180,${LAT_TOP}`,
  '-dissolve2', 'zone',
  '-each', 'area=Math.round(this.area/1e6)',
  '-simplify', SIMPLIFY, 'keep-shapes',
  '-points', 'inner', '+', 'name=pts',
  '-filter-islands', 'min-area=250km2', 'target=z',
  '-o', 'target=z', 'format=topojson', 'no-quantization', 'precision=0.0001', topoFile,
  '-o', 'target=pts', 'format=geojson', 'precision=0.001', ptsFile
], { stdio: 'inherit' });

// ---- 投影して整数座標の弧（arc）にする
const topo = JSON.parse(fs.readFileSync(topoFile, 'utf8'));
const obj = Object.values(topo.objects)[0];
const arcs = topo.arcs.map(arc => {
  const out = []; let px = null, py = null;
  for (const [lon, lat] of arc) {
    const [fx, fy] = project(lon, lat); const x = Math.round(fx), y = Math.round(fy);
    if (px === null) { out.push(x, y); px = x; py = y; continue; }
    if (x === px && y === py) continue;
    out.push(x - px, y - py); px = x; py = y;
  }
  return out;
});
const arcBox = arcs.map(a => {
  let x = a[0], y = a[1]; const b = [x, y, x, y];
  for (let i = 2; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return b;
});
const pts = new Map(JSON.parse(fs.readFileSync(ptsFile, 'utf8')).features.map(f => [f.properties.zone, f.geometry && f.geometry.coordinates]));
const order = [...zoneDefs.map(z => z.id), ...splitDefs.flatMap(s => [s.south, s.north])];
const rank = id => { const i = order.indexOf(id); return i < 0 ? 1e6 : i; };
const zones = obj.geometries.map(g => {
  const id = g.properties.zone;
  const rings = !g.type ? [] : g.type === 'Polygon' ? g.arcs : g.arcs.flat(1);
  let b = null;
  for (const ring of rings) for (const ai of ring) {
    const ab = arcBox[ai < 0 ? ~ai : ai];
    b = b ? [Math.min(b[0], ab[0]), Math.min(b[1], ab[1]), Math.max(b[2], ab[2]), Math.max(b[3], ab[3])] : ab.slice();
  }
  const pt = pts.get(id); const p = pt ? project(pt[0], pt[1]).map(Math.round) : b ? [Math.round((b[0] + b[2]) / 2), Math.round((b[1] + b[3]) / 2)] : null;
  return { id, n: names.get(id) || id, r: rings, a: g.properties.area || 0, p, b: b || (p ? [p[0], p[1], p[0], p[1]] : null) };
}).sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));

const H = Math.round(project(0, LAT_BOT)[1]);
const views = {};
for (const [k, [w, s, e, n]] of Object.entries(VIEWS)) {
  const ps = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) ps.push(project(w + (e - w) * i / 8, s + (n - s) * j / 8));
  const xs = ps.map(q => q[0]), ys = ps.map(q => q[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  views[k] = [Math.round(x0), Math.round(y0), Math.round(Math.max(...xs) - x0), Math.round(Math.max(...ys) - y0)];
}
const out = { v: 1, source: 'Natural Earth 1:10m admin-1（パブリックドメイン）を簡略化', projection: 'Natural Earth I', W: MAP_W, H, views, arcs, zones };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`ゾーン ${zones.length}件・弧 ${arcs.length}本 → ${path.relative(ROOT, OUT)}（${Math.round(fs.statSync(OUT).size / 1024)} KB）`);

// ゾーン一覧（データを書くときの参照用）
const lines = ['# 勢力図のゾーン一覧', '', '`polities.json` の `territory` には、ここにあるゾーンIDを書きます。地図上の大きさ（km²）は簡略化後の目安です。', '', '| ID | 名前 | 面積（km²） |', '| --- | --- | ---: |'];
for (const z of zones) lines.push(`| \`${z.id}\` | ${z.n}${z.r.length ? '' : '（小さいため点で表示）'} | ${z.a.toLocaleString('en-US')} |`);
fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
