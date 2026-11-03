// 一問一答（利用者が自分で読み込むデータ）。
// 公開しているアプリには含めず、利用者が持っているJSONファイルを読み込んで、このブラウザにだけ保存する。
// ファイルの形：{ format: 'yokogushi-ichimon', version: 1, title, chapters: [{ n, title }],
//   items: [{ id, ch, sec, q: '…【答え】…', y: 年, yq: 年の確かさ, r: [地域ID], a: 音声ファイル名, t: 秒 }] }
//   yq … 3 = 文中に年がある、2 = 文中に世紀がある、0 = 年号がなく前後の問題から推定
// DOMを使わない（テストできる）。
import { matchTerms, base } from './normalize.js';

export const ICHIMON_FORMAT = 'yokogushi-ichimon';
const MARK = /【(.+?)】/g;
export const NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** 文の中の【答え】を取り出す */
export const answersOf = text => [...String(text ?? '').matchAll(MARK)].map(m => m[1]);

/** 文を「ふつうの文字」と「空欄（何番目の答えか）」に分ける */
export function parts(text) {
  const out = [];
  let p = 0, i = 0;
  const s = String(text ?? '');
  for (const m of s.matchAll(MARK)) {
    if (m.index > p) out.push({ s: s.slice(p, m.index) });
    out.push({ i: i++, a: m[1] });
    p = m.index + m[0].length;
  }
  if (p < s.length) out.push({ s: s.slice(p) });
  return out;
}

/** 答えを外した文（答えを【】なしで入れた文） */
export const plain = text => String(text ?? '').replace(MARK, '$1');

const unquote = s => s.replace(/^[『「"]+|[』」"]+$/g, '').trim();
const SUFFIX = /(大統領|国家主席|主席|首相|書記長|政権|政府)$/;

/**
 * 正解として認める書き方。
 * 「イェルサレム（エルサレム）」→ イェルサレム／エルサレム、「『コーラン』（クルアーン）」→ コーラン／クルアーン、
 * 「農業調整法（AAA）」→ 農業調整法／AAA、「ブッシュ（父）大統領」→ ブッシュ大統領／ブッシュ、
 * 「1905年」→ 1905、「マッキンリー大統領」→ マッキンリー
 */
export function variants(answer) {
  const a = String(answer ?? '').trim();
  const out = new Set([a]);
  const add = v => { v = unquote(v.trim()); if (v) out.add(v); };
  add(a);
  const end = a.match(/^(.+?)（([^（）]+)）$/);
  if (end) {
    add(end[1]);
    if (end[2].length >= 2) add(end[2]);
  } else if (/（[^（）]+）/.test(a)) {
    add(a.replace(/（[^（）]+）/g, ''));
  }
  for (const v of [...out]) {
    if (SUFFIX.test(v) && v.replace(SUFFIX, '').length >= 2) add(v.replace(SUFFIX, ''));
    if (/^前?\d+年$/.test(v)) add(v.replace(/年$/, ''));
  }
  return [...out];
}

/** 1つの空欄の採点。正解なら { how }、ちがえば null */
export function gradeBlank(input, answer, strict = false) {
  const t = String(input ?? '').trim();
  if (!t) return null;
  return matchTerms(t, variants(answer), [], strict);
}

/** 年表に出すときの見出し（答えをつなげる）。答えが年だけのときは、文の書き出しを使う */
const DATE = /^前?\d+年(\d+月)?(\d+日)?$/;
export function titleOf(answers, text = '') {
  const names = answers.filter(a => !DATE.test(a)).map(a => unquote(a.replace(/（[^（）]+）$/, '')));
  if (!names.length && text) {
    const s = plain(text).replace(/^[^、。]*?前?\d+年(\d+月)?(\d+日)?(の|に|には|、)?/, '').replace(/。$/, '');
    return s.length > 18 ? `${s.slice(0, 17)}…` : s;
  }
  if (!names.length) return answers.join('・');
  return names.length <= 2 ? names.join('・') : `${names.slice(0, 2).join('・')}ほか`;
}

/** 読み込んだJSONを確かめて、アプリで使う形にする。使えなければ null */
export function prepare(raw) {
  if (!raw || raw.format !== ICHIMON_FORMAT || !Array.isArray(raw.items)) return null;
  const items = [];
  const seen = new Set();
  for (const x of raw.items) {
    if (!x || typeof x.q !== 'string' || !x.id || seen.has(x.id)) continue;
    const answers = answersOf(x.q);
    if (!answers.length) continue;
    seen.add(x.id);
    const y = Number(x.y);
    items.push({
      id: String(x.id), ch: Number(x.ch) || 0, sec: String(x.sec ?? ''), text: x.q, answers,
      y: Number.isFinite(y) ? y : null, yq: Number(x.yq) || 0,
      regions: (Array.isArray(x.r) ? x.r : x.r ? [x.r] : []).map(String),
      audio: x.a ? String(x.a) : '', t: Number(x.t) || 0,
      title: titleOf(answers, x.q)
    });
  }
  if (!items.length) return null;
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map(c => ({ n: Number(c.n), title: String(c.title ?? '') }))
    .filter(c => Number.isFinite(c.n) && items.some(it => it.ch === c.n));
  return {
    title: String(raw.title || '一問一答'), note: String(raw.note || ''),
    items, chapters, byId: new Map(items.map(it => [it.id, it]))
  };
}

/** JSONの文字列を読む。エラーなら { error } */
export function parseFile(text) {
  let raw;
  try { raw = JSON.parse(String(text ?? '').replace(/^﻿/, '')); } catch { return { error: 'JSONとして読めませんでした' }; }
  if (raw?.format !== ICHIMON_FORMAT) return { error: '一問一答のデータではありません（format が yokogushi-ichimon ではありません）' };
  const data = prepare(raw);
  if (!data) return { error: '問題が1つも見つかりませんでした' };
  return { raw, data };
}

/**
 * 出題の対象。
 * opt.from / opt.to … 年の範囲（全範囲の端なら、それより前・後の問題も含める）
 * opt.chapters … 章の番号（空ならすべて）
 * opt.groups と regionsOf … 地域をえらんだときだけ地域でしぼる
 */
export function pool(data, opt = {}, range = [-Infinity, Infinity], regionsOf = null) {
  if (!data) return [];
  const lo = opt.from == null || opt.from <= range[0] ? -Infinity : opt.from;
  const hi = opt.to == null || opt.to >= range[1] ? Infinity : opt.to;
  const chs = new Set((opt.chapters || []).map(Number));
  const regs = opt.groups?.length && regionsOf ? new Set(regionsOf(opt.groups)) : null;
  return data.items.filter(it => (it.y == null || (it.y >= lo && it.y <= hi))
    && (!chs.size || chs.has(it.ch))
    && (!regs || it.regions.some(r => regs.has(r))));
}

/** 年表に出す問題（文中に年か世紀があるもの）。地域・年の範囲で取り出す */
export function timelineItems(data, regionId, a, b) {
  if (!data) return [];
  return data.items.filter(it => it.yq >= 2 && it.y != null && it.y >= a && it.y <= b && it.regions.includes(regionId));
}

/**
 * 一問一答の問題と、アプリの出来事を結びつける（答えの語が出来事の名前・別名と同じで、地域と年が近いもの）。
 * 結びついた問題は年表に別の行を作らず、その出来事の行に「一問一答」の印を付ける。
 * 戻り値 { byEvent: Map(出来事のkey → 問題の配列), merged: Set(問題のid) }
 */
export function linkEvents(data, events) {
  const byEvent = new Map(), merged = new Set();
  if (!data) return { byEvent, merged };
  const names = new Map();
  for (const e of events) {
    for (const n of [e.title, ...(e.answers || [])]) {
      const k = base(n);
      if (k.length < 2) continue;
      if (!names.has(k)) names.set(k, []);
      names.get(k).push(e);
    }
  }
  const tol = { 3: 3, 2: 60, 0: 80 };
  for (const it of data.items) {
    if (it.y == null) continue;
    let hit = null;
    for (const a of it.answers) {
      for (const v of variants(a)) {
        const cands = (names.get(base(v)) || []).filter(e => e.regions.some(r => it.regions.includes(r)) && Math.abs(e.year - it.y) <= (tol[it.yq] ?? 80));
        if (cands.length) { hit = cands.sort((x, y) => Math.abs(x.year - it.y) - Math.abs(y.year - it.y))[0]; break; }
      }
      if (hit) break;
    }
    if (!hit) continue;
    merged.add(it.id);
    if (!byEvent.has(hit.key)) byEvent.set(hit.key, []);
    byEvent.get(hit.key).push(it);
  }
  return { byEvent, merged };
}

/** 音声の位置（秒）を「12:34」に */
export const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
