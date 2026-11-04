// 勢力図の川の線（data/map/rivers.json）を Natural Earth から作る。ふつうは使わない。
//   NE_RIVERS=ne_10m_rivers_lake_centerlines.geojson node tools/build-rivers.mjs
// 元データ：Natural Earth 1:10m Rivers + lake centerlines（パブリックドメイン）
//   https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/
// 世界史に出てくる主な川だけを選び、地図と同じ図法（js/core/projection.js）で座標に直して、点を間引く。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project } from '../js/core/projection.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.NE_RIVERS;
if (!SRC) { console.error('NE_RIVERS に Natural Earth の川のファイル（GeoJSON）を指定してください'); process.exit(1); }

// 英語名 → [日本語名, 重要度（1〜3。地図をどこまで拡大したら出すか）, 範囲（同じ名前の別の川を除く。[西, 南, 東, 北]）]
const RIVERS = {
  'Nile': ['ナイル川', 1], 'White Nile': ['ナイル川', 1], 'Blue Nile': ['青ナイル川', 3], 'Albert Nile': ['ナイル川', 1], 'Mountain Nile': ['ナイル川', 1], 'Victoria Nile': ['ナイル川', 2],
  'Tigris': ['ティグリス川', 1], 'Euphrates': ['ユーフラテス川', 1], 'Jordan': ['ヨルダン川', 2],
  'Indus': ['インダス川', 1], 'Ganges': ['ガンジス川', 1], 'Brahmaputra': ['ブラマプトラ川', 3], 'Yamuna': ['ヤムナー川', 3], 'Narmada': ['ナルマダ川', 3],
  'Huang': ['黄河', 1], 'Yangtze': ['長江', 1], 'Huai': ['淮河', 2], 'Wei': ['渭水', 2, [103, 33, 111, 36]], 'Xi': ['珠江', 2, [104, 21, 114, 25]], 'Pearl': ['珠江', 2, [104, 21, 115, 25]],
  'Liao': ['遼河', 3, [119, 40, 125, 45]], 'Amur': ['アムール川', 2], 'Yalu': ['鴨緑江', 3], 'Han': ['漢江', 3, [126, 36.5, 129.5, 38.5]], 'Tarim': ['タリム川', 3],
  'Mekong': ['メコン川', 1], 'Irrawaddy': ['エーヤワディー川', 2], 'Chao Phraya': ['チャオプラヤ川', 2], 'Red': ['紅河', 2, [100, 20, 107, 25]],
  'Amu  Darya': ['アム川', 1], 'Syr  Darya': ['シル川', 1], 'Kerulen': ['ケルレン川', 3], 'Ural': ['ウラル川', 3, [50, 46, 61, 55]],
  'Ob': ['オビ川', 2], 'Yenisey': ['エニセイ川', 2], 'Lena': ['レナ川', 2],
  'Danube': ['ドナウ川', 1], 'Rhine': ['ライン川', 1], 'Volga': ['ヴォルガ川', 1], 'Dnieper': ['ドニエプル川', 2], 'Don': ['ドン川', 2, [36, 46, 42, 54]], 'Dniester': ['ドニエストル川', 3],
  'Elbe': ['エルベ川', 2], 'Oder': ['オーデル川', 2], 'Vistula': ['ヴィスワ川', 2], 'Neva': ['ネヴァ川', 3], 'Weser': ['ヴェーザー川', 3], 'Main': ['マイン川', 3, [7, 49, 12.5, 51]],
  'Seine': ['セーヌ川', 2], 'Loire': ['ロワール川', 2], 'Rhône': ['ローヌ川', 2], 'Garonne': ['ガロンヌ川', 3], 'Thames': ['テムズ川', 2],
  'Po': ['ポー川', 2, [6, 44, 13, 46.5]], 'Tiber': ['ティベル川', 2], 'Ebro': ['エブロ川', 3], 'Tagus': ['テージョ川', 3], 'Tajo': ['テージョ川', 3],
  'Niger': ['ニジェール川', 1, [-12, 3, 10, 18]], 'Congo': ['コンゴ川', 1], 'Zambezi': ['ザンベジ川', 2], 'Limpopo': ['リンポポ川', 3], 'Orange': ['オレンジ川', 3, [15, -32, 30, -26]],
  'Mississippi': ['ミシシッピ川', 1], 'Missouri': ['ミズーリ川', 2], 'Ohio': ['オハイオ川', 3], 'St. Lawrence': ['セントローレンス川', 2], 'Hudson': ['ハドソン川', 3], 'Potomac': ['ポトマック川', 3], 'Rio Grande': ['リオグランデ川', 3, [-110, 25, -95, 38]],
  'Amazonas': ['アマゾン川', 1], 'Orinoco': ['オリノコ川', 2], 'Paraná': ['パラナ川', 2]
};

// 線を間引く（ダグラス=ポイカー法）。tol は地図の単位
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L;
      if (d > bd) { bd = d; best = i; }
    }
    if (bd > tol && best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const gj = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const out = new Map();
for (const f of gj.features) {
  const p = f.properties || {};
  const en = p.name_en || p.name || '';
  const spec = RIVERS[en];
  if (!spec || p.featurecla === 'Lake Centerline') continue;
  const [ja, rank, bbox] = spec;
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
  for (const line of lines) {
    if (bbox) {
      const [lon, lat] = line[Math.floor(line.length / 2)];
      if (lon < bbox[0] || lat < bbox[1] || lon > bbox[2] || lat > bbox[3]) continue;
    }
    const pts = simplify(line.map(([lon, lat]) => project(lon, lat)), 0.6);
    if (pts.length < 2) continue;
    if (!out.has(ja)) out.set(ja, { n: ja, r: rank, d: [] });
    const r = out.get(ja);
    r.r = Math.min(r.r, rank);
    r.d.push(pts.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
  }
}
const rivers = [...out.values()].sort((a, b) => a.r - b.r || a.n.localeCompare(b.n, 'ja'));
const file = path.join(ROOT, 'data/map/rivers.json');
const body = rivers.map(r => JSON.stringify(r)).join(',\n  ');
fs.writeFileSync(file, `{\n  "note": "Natural Earth 1:10m の川（パブリックドメイン）から tools/build-rivers.mjs で作成。座標は地図の単位",\n  "rivers": [\n  ${body}\n  ]\n}\n`);
const missing = [...new Set(Object.values(RIVERS).map(v => v[0]))].filter(n => !out.has(n));
console.log(`川 ${rivers.length}本・${(fs.statSync(file).size / 1024).toFixed(0)}KB → data/map/rivers.json`);
if (missing.length) console.log('見つからなかった川：', missing.join('、'));
