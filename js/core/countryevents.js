// その国の出来事を探す（クイズで「1つの国だけ」の君主の問題を採点したあとに出す）。DOMを使わない（テストできる）。
// 出来事のデータには国の印がなく地域しかないので、国名・別名・時代ごとの名前・王朝・その期間の君主の名前が、
// 名前・別の言い方・概要に出てくる出来事を「その国の出来事」とする。名前が出てこない同じ地域の出来事は、別にまとめて返す。

const KATA = '\\p{Script=Katakana}ー';
const HAN = '\\p{Script=Han}';
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 名前を、ほかの語の一部に当たらないように探す正規表現にする。
 *   カタカナだけの名前 … 前後がカタカナでないとき（「アメリカ」は「ラテンアメリカ」に当たらない）
 *   漢字1字の名前（明・清・宋など）… 前が漢字でなく、後が「の・は・が・朝・軍」などのとき（「明治」「説明」に当たらない）
 */
export function nameRe(name) {
  const n = String(name).normalize('NFKC');
  if (/^[\p{Script=Katakana}ー=・]+$/u.test(n)) return new RegExp(`(?<![${KATA}=・])${reEsc(n)}(?![${KATA}])`, 'u');
  if (/^\p{Script=Han}$/u.test(n)) return new RegExp(`(?<![${HAN}])${reEsc(n)}(?=[のはがとをにでへもや朝軍代帝国・、。）」]|$)`, 'u');
  return new RegExp(reEsc(n), 'u');
}

/** その国を指す名前（国名・別名・時代ごとの名前・王朝とその別名・[from, to] に在位した君主とその別名） */
export function countryNames(db, p, from, to) {
  const out = new Set([p.name, ...(p.aliases || []), ...(p.names || []).map(n => n[1])]);
  for (const c of p.children || []) { out.add(c.name); for (const a of c.aliases || []) out.add(a); }
  const ids = new Set([p.id, ...(p.children || []).map(c => c.id)]);
  for (const r of db.rulers) {
    if (!ids.has(r.polity) || r.from > to || r.to < from) continue;
    out.add(r.name);
    for (const a of r.aliases || []) out.add(a);
    // 「スレイマン1世」は「スレイマン=モスク」、「ピョートル1世」は「ピョートル大帝」にも当たるように、番号を除いた名前も使う（カタカナ3字以上のとき）
    const stem = String(r.name).normalize('NFKC').match(/^([\p{Script=Katakana}ー=・]{3,})\d+世$/u)?.[1];
    if (stem) out.add(stem);
  }
  return [...out].filter(n => n && String(n).trim());
}

/**
 * その国の、y の前後 w 年の出来事。
 * 戻り値 { from, to, own: その国の名前が出てくる出来事, region: 同じ地域のそのほかの出来事 }（どちらも年の順。多いときは重要なもの・y に近いものから）
 */
export function countryEvents(db, p, y, w = 10, { own: maxOwn = 12, region: maxRegion = 6 } = {}) {
  const from = y - w, to = y + w;
  const res = countryNames(db, p, from, to).map(nameRe);
  const own = [], region = [];
  for (const e of db.events) {
    if (e.year > to || (e.end ?? e.year) < from) continue;
    const text = [e.title, ...(e.answers || []), e.desc || ''].join(' ').normalize('NFKC');
    if (res.some(re => re.test(text))) own.push(e);
    else if (e.regions.includes(p.region)) region.push(e);
  }
  const pickTop = (list, n) => list
    .sort((a, b) => b.importance - a.importance || Math.abs(a.year - y) - Math.abs(b.year - y))
    .slice(0, n)
    .sort((a, b) => a.year - b.year || (a.month || 0) - (b.month || 0));
  return { from, to, own: pickTop(own, maxOwn), region: pickTop(region, maxRegion), ownTotal: own.length, regionTotal: region.length };
}
