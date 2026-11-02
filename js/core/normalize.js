// 記述式の採点で使う「表記をそろえる」処理と照合。DOMに依存しない（テストできる）。

const SMALL = { 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ', 'ヵ': 'カ', 'ヶ': 'ケ' };
const KANJI_NUM = { '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

function kanjiToNumber(m) {
  if (m.includes('十')) {
    const [a, b] = m.split('十');
    return (a ? KANJI_NUM[a] : 1) * 10 + (b ? KANJI_NUM[b] : 0);
  }
  return Number([...m].map(c => KANJI_NUM[c]).join(''));
}

/**
 * 表記をそろえる。
 * 全角/半角、ひらがな→カタカナ、小さい字→大きい字（ェ→エ）、ヴ→バ行、
 * 「一世・第二次」→「1世・第2次」、記号や空白の除去。
 */
export function base(str) {
  let s = String(str ?? '').normalize('NFKC').toLowerCase();
  s = s.replace(/[一二三四五六七八九十〇]+(?=世|次|回|月)/g, kanjiToNumber);
  s = s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  s = s.replace(/ヴァ/g, 'バ').replace(/ヴィ/g, 'ビ').replace(/ヴェ/g, 'ベ').replace(/ヴォ/g, 'ボ').replace(/ヴ/g, 'ブ');
  s = s.replace(/[ァィゥェォッャュョヮヵヶ]/g, c => SMALL[c]);
  s = s.replace(/[\s・･=＝゠\-‐－―—〜~、。,.，．()（）「」『』［］[\]【】!！?？'"“”‘’]/g, '');
  return s;
}

/** さらにゆるくそろえる：ひらがな（送り仮名・助詞）と長音を消す。「明が滅亡した」→「明滅亡」 */
export function loose(str) {
  return base(String(str ?? '').normalize('NFKC').replace(/[ぁ-ゖ]/g, '')).replace(/ー/g, '');
}

/** 編集距離（何文字ちがうか） */
export function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/**
 * 入力が、語句のリスト（正解と別名）・キーワードの組み合わせに当たるか調べる。
 * 戻り値: null か { how: 'exact' | 'part' | 'key' | 'fuzzy', term }
 *   exact … 表記をそろえて一致
 *   part  … 文の中に語句が入っている（2文字以上の語句のみ）
 *   key   … キーワードの組み合わせ（"明+滅亡"）がすべて入っている
 *   fuzzy … 1〜2文字ちがい（strict のときは使わない）
 */
export function matchTerms(input, terms, keys = [], strict = false) {
  const P = base(input), PL = loose(input);
  if (!P) return null;
  let part = null;
  for (const t of terms) {
    const T = base(t), TL = loose(t);
    if (!T) continue;
    if (P === T || (PL && PL === TL)) return { how: 'exact', term: t };
    if (!part && ((TL.length >= 2 && PL.includes(TL)) || (T.length >= 2 && P.includes(T)))) part = { how: 'part', term: t };
  }
  if (part) return part;
  for (const k of keys) {
    const parts = String(k).split('+').map(loose).filter(Boolean);
    if (parts.length && parts.every(x => PL.includes(x))) return { how: 'key', term: k };
  }
  if (strict) return null;
  for (const t of terms) {
    const TL = loose(t);
    if (TL.length < 4 || Math.abs(TL.length - PL.length) > 2) continue;
    if (lev(PL, TL) <= (TL.length >= 9 ? 2 : 1)) return { how: 'fuzzy', term: t };
  }
  return null;
}

/** 答えの欄を「、」や改行で区切って複数の答えにする */
export const splitAnswers = text => String(text ?? '').split(/[、,，/／\n;；]+/).map(s => s.trim()).filter(Boolean);

/** 年の入力を数に（「前221」「BC221」「-221」は紀元前） */
export function parseYear(text) {
  const s = String(text ?? '').normalize('NFKC').replace(/\s/g, '').replace(/年$/, '');
  const m = s.match(/^(前|紀元前|bc|BC|-)?(\d{1,4})$/);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] ? -n : n;
}
