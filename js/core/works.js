// 文化史の「作者・作品名」。出来事の work（作者 by・作品名 title と、その別表記）を使う。DOMに依存しない（テストできる）。
import { base, matchTerms, splitAnswers } from './normalize.js';
import { hideAnswers } from './util.js';

const cache = new WeakMap();
/** 作者・作品名のある出来事（年の順） */
export function workEvents(db) {
  if (!cache.has(db)) cache.set(db, db.events.filter(e => e.work));
  return cache.get(db);
}

/**
 * 作品名をくくるかっこ。データの mark があればそれ（建築などは ""）、
 * なければ出来事の名前・答え・概要で使っているかっこ（絵や詩は「」）、それもなければ『』
 */
export function marksOf(e) {
  const w = e.work;
  if (typeof w.mark === 'string') return w.mark.length === 2 ? [w.mark[0], w.mark[1]] : ['', ''];
  const text = [e.title, ...(e.answers || []), ...(e.keywords || []), e.desc || ''].join(' ');
  for (const t of w.title) {
    if (text.includes(`「${t}」`)) return ['「', '」'];
    if (text.includes(`『${t}』`)) return ['『', '』'];
  }
  return ['『', '』'];
}
/** 作品名（かっこつき。2つ以上の作品は並べる） */
export const workTitle = e => { const [a, b] = marksOf(e); return e.work.title.map(t => `${a}${t}${b}`).join(''); };
/** 作者（共作は「・」でつなぐ） */
export const workBy = e => e.work.by.join('・');
/** 建築など（かっこでくくらない作品）か */
export const isBuilding = e => marksOf(e)[0] === '';

/** 作者として認める書き方：名前・別表記・共作をまとめた書き方と、「トマス=モア」の「モア」のような「=」のあとの部分 */
export function authorNames(e) {
  const names = [...e.work.by, ...(e.work.byAlt || [])];
  if (e.work.by.length > 1) names.push(e.work.by.join('・'));
  const out = new Set(names);
  for (const n of names) {
    const seg = n.split(/[=＝]/);
    for (let i = 1; i < seg.length; i++) { const s = seg.slice(i).join('='); if (base(s).length >= 2) out.add(s); }
  }
  return [...out];
}
/** 作品名として認める書き方 */
export const titleNames = e => [...e.work.title, ...(e.work.titleAlt || [])];

const strip = s => String(s ?? '').trim().replace(/^[『「]+|[』」]+$/g, '').trim();
/** 表記ゆれを許して一致するか（文の中に入っているだけ（part）は認めない：「ミル」と「ミルトン」、「国家」と「国家論」を分けるため） */
function same(input, terms, strict) {
  const m = matchTerms(strip(input), terms, [], strict);
  return m && m.how !== 'part' ? m : null;
}
const sameAuthor = (a, b) => authorNames(a).some(n => authorNames(b).some(m => base(n) === base(m)));
/** 同じ作者のほかの作品（データにあるもの） */
export const otherWorks = (db, e) => workEvents(db).filter(x => x !== e && sameAuthor(x, e));

/**
 * 採点。ask は 'by'（作者を答える）か 'title'（作品名を答える）。
 * 戻り値 { input, ok, how?, also?, wrong? }
 *   also  … 正解あつかいにした別の出来事（同じ作者のほかの作品・同じ名前の作品の作者）
 *   wrong … まちがいのとき、答えた語がほかの作品の作者・作品名なら、その出来事の一覧
 */
export function gradeWork(db, text, e, ask, strict = false) {
  const input = (ask === 'by' ? splitAnswers(text)[0] : String(text ?? '').split(/[、,，\n]+/)[0])?.trim() || '';
  if (!input) return { input, ok: false };
  const all = workEvents(db);
  const names = ask === 'by' ? authorNames : titleNames;
  const m = same(input, names(e), strict);
  if (m) return { input, ok: true, how: m.how };
  // 作者を答える：同じ名前の作品（ヘロドトスとトゥキディデスの『歴史』）の作者も正解
  // 作品名を答える：同じ作者のほかの作品も正解
  const alike = ask === 'by'
    ? all.filter(x => x !== e && x.work.title.some(t => e.work.title.some(u => base(t) === base(u))))
    : otherWorks(db, e);
  for (const x of alike) {
    const mm = same(input, names(x), strict);
    if (mm) return { input, ok: true, how: mm.how, also: x };
  }
  return { input, ok: false, wrong: all.filter(x => x !== e && same(input, names(x), true)) };
}

/** 手がかり（概要）から答えを伏せる */
export function hintText(e, ask) {
  const names = ask === 'by' ? authorNames(e) : titleNames(e);
  return hideAnswers(e.desc || '', { title: names[0], answers: names.slice(1) });
}
