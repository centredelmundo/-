// 地図の図法（Natural Earth I）。地図データ作成（tools/build-map.mjs）とアプリの両方で使う。
export const MAP_W = 3000;
export const LAT_TOP = 84;
export const LAT_BOT = -57;
const R = Math.PI / 180;
function raw(lon, lat) {
  const l = lon * R, p = lat * R, p2 = p * p, p4 = p2 * p2;
  return [
    l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
    p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
  ];
}
const X_MAX = raw(180, 0)[0];
const Y_TOP = raw(0, LAT_TOP)[1];
const S = MAP_W / (2 * X_MAX);
/** 経度・緯度 → 地図上の座標（左上が原点、横幅 MAP_W） */
export function project(lon, lat) {
  const [x, y] = raw(lon, lat);
  return [(x + X_MAX) * S, (Y_TOP - y) * S];
}
