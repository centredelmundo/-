// 採点。データ（DB）の語句と照らし合わせ、時期・地域も調べる。
import { matchTerms, splitAnswers, parseYear } from './normalize.js';

const HOW = { exact: 4, key: 3, part: 2, fuzzy: 1 };
const overlaps = (spans, a, b) => spans.some(([s, e]) => s <= b && e >= a);

function bestMatch(db, text, strict, score) {
  let best = null;
  for (const it of db.items) {
    const m = matchTerms(text, it.terms, it.keys, strict);
    if (!m) continue;
    const s = score(it, m);
    if (s == null) continue;
    if (!best || s > best.score) best = { it, m, score: s };
  }
  return best;
}

/**
 * ヨコ記述：regions（地域IDの配列）で、y の前後 w 年にあった出来事・人物・王朝を答える。
 * 1つの欄に「、」区切りで複数書ける。各答えを判定して返す。
 *   cls 3 = 正解、2 = 地域ちがい、1 = 時期ちがい、0 = 時期も地域もちがう、null = 見つからない
 */
export function gradeCross(db, text, regions, y, w, strict) {
  return splitAnswers(text).map(input => {
    const best = bestMatch(db, input, strict, (it, m) => {
      const inWin = overlaps(it.spans, y - w, y + w), inReg = it.regions.some(r => regions.includes(r));
      const cls = inWin && inReg ? 3 : inWin ? 2 : inReg ? 1 : 0;
      return cls * 10 + HOW[m.how];
    });
    return { input, best, cls: best ? Math.floor(best.score / 10) : null };
  });
}

/** 君主：polityIds（国家と王朝のID）の君主で、y の前後1年に在位した人を答える */
export function gradeRuler(db, text, polityIds, y, strict) {
  return splitAnswers(text).slice(0, 1).map(input => {
    const best = bestMatch(db, input, strict, (it, m) => {
      if (it.kind !== 'ruler') return null;
      const r = it.ref;
      const same = it.kind === 'ruler' && polityIds.includes(r.polity);
      const inTime = overlaps(it.spans, y - 1, y + 1);
      const cls = same && inTime ? 3 : inTime ? 2 : same ? 1 : 0;
      return cls * 10 + HOW[m.how];
    });
    return { input, best, cls: best ? Math.floor(best.score / 10) : null };
  });
}

/** 出来事当て：event の名前を答える。同じ年・同じ地域の別の出来事なら「別の出来事」 */
export function gradeTerm(db, text, event, strict) {
  const input = splitAnswers(text)[0] || '';
  const m = matchTerms(input, [event.title, ...event.answers], event.keywords, strict);
  if (m) return { input, ok: true, how: m.how };
  const other = bestMatch(db, input, strict, (it, mm) => {
    const near = overlaps(it.spans, event.year - 1, (event.end ?? event.year) + 1);
    const reg = it.regions.some(r => event.regions.includes(r));
    return (near && reg ? 3 : near ? 2 : reg ? 1 : 0) * 10 + HOW[mm.how];
  });
  return { input, ok: false, other };
}

/** 年代当て */
export function gradeYear(text, event) {
  const y = parseYear(text);
  if (y == null) return { valid: false };
  const accept = [event.year, ...(event.acceptYears || [])];
  if (accept.includes(y)) return { valid: true, ok: true, y };
  const d = y - event.year;
  return { valid: true, ok: false, y, diff: d, close: Math.abs(d) <= 2 };
}

/** 判定の言葉 */
export const CLS_TEXT = { 3: '正解', 2: '地域ちがい', 1: '時期ちがい', 0: '時期も地域もちがう' };
