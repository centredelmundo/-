// 一問一答（利用者が自分で読み込むデータ）。
// 公開しているアプリには含めず、利用者が持っているJSONファイルを読み込んで、このブラウザにだけ保存する。
// ファイルの形：{ format: 'yokogushi-ichimon', version: 1 か 2, title, chapters: [{ n, title }],
//   items: [{ id, ch, sec, q: '…【答え】…', y: 年, yq: 年の確かさ, r: [地域ID], a: 音声ファイル名, t: 秒,
//            （version 2）n: [補足], src: 出典, st: ★の数, p: ページ, g: 1（読み取りに推定がある）,
//            free: [[順不同の空欄の番号…]], img: 写真の指定（"event:<出来事のid>" か "File:…"）, old: [前の版の id] }] }
//   yq … 3 = 文中に年がある、2 = 文中に世紀がある、0 = 年号がなく前後の問題から推定
//   version 2 の文では、【答え】（四角の空欄）のほかに〈赤字〉（問題文の赤い字）も空欄にして答えさせる
// DOMを使わない（テストできる）。
import { matchTerms, base } from './normalize.js';

export const ICHIMON_FORMAT = 'yokogushi-ichimon';
const MARK = /【(.+?)】|〈(.+?)〉/g;
const BOX = /【(.+?)】/g;
export const NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** 文の中の空欄の答え（【答え】と〈赤字〉、出てくる順） */
export const answersOf = text => [...String(text ?? '').matchAll(MARK)].map(m => m[1] ?? m[2]);
/** 四角の空欄（【】）の答えだけ */
export const boxAnswersOf = text => [...String(text ?? '').matchAll(BOX)].map(m => m[1]);

/** 文を「ふつうの文字」と「空欄（何番目の答えか・赤字の空欄か）」に分ける */
export function parts(text) {
  const out = [];
  let p = 0, i = 0;
  const s = String(text ?? '');
  for (const m of s.matchAll(MARK)) {
    if (m.index > p) out.push({ s: s.slice(p, m.index) });
    out.push(m[1] == null ? { i: i++, a: m[2], red: true } : { i: i++, a: m[1] });
    p = m.index + m[0].length;
  }
  if (p < s.length) out.push({ s: s.slice(p) });
  return out;
}

// 空欄のすぐあとに続く漢字・カタカナ・数字（【エドワード1】世 の「世」、【三帝】同盟 の「同盟」）
const TAIL = /^[一-龥々〆ァ-ヴー0-9０-９]{1,6}/;
/**
 * 空欄の答えに、空欄のすぐあとに続く字を付けた語（出てくる順）。概要を探す・年表の見出しに使う。
 * 「【エドワード1】世は」→ エドワード1世、「【アメリカ=イギリス（米英）】戦争」→ アメリカ=イギリス戦争、続く字がなければ答えのまま
 */
export function fullAnswers(text) {
  const s = String(text ?? ''), out = [];
  for (const m of s.matchAll(MARK)) {
    const a = m[1] ?? m[2], t = s.slice(m.index + m[0].length).match(TAIL)?.[0] || '';
    out.push(t ? String(a).replace(/（[^（）]+）$/, '').replace(/［|］/g, '') + t : a);
  }
  return out;
}

/** 答えを外した文（答えを【】〈〉なしで入れた文） */
export const plain = text => String(text ?? '').replace(MARK, (_, a, b) => a ?? b);

const unquote = s => s.replace(/^[『「"]+|[』」"]+$/g, '').trim();
const SUFFIX = /(大統領|国家主席|主席|首相|書記長|政権|政府)$/;
// 文字の種類（かっこの別名で、答えの終わりの部分を置きかえるときに使う）
const kind = c => (/[一-龥々〆]/.test(c) ? 'k' : /[ァ-ヴー=＝・]/.test(c) ? 'K' : /[0-9０-９]/.test(c) ? 'n' : 'o');

/**
 * 正解として認める書き方。
 * 「イェルサレム（エルサレム）」→ イェルサレム／エルサレム、「『コーラン』（クルアーン）」→ コーラン／クルアーン、
 * 「農業調整法（AAA）」→ 農業調整法／AAA、「ブッシュ（父）大統領」→ ブッシュ大統領／ブッシュ、
 * 「1905年」→ 1905、「マッキンリー大統領」→ マッキンリー、
 * 「サルゴン［1世］」（［］はなくてもよい部分）→ サルゴン1世／サルゴン、「X（A、B）」→ X／A／B、
 * 「ロシア二月（三月）」→ ロシア三月、「ドイツ（プロイセン）=フランス」→ ドイツ=フランス／プロイセン=フランス
 */
export function variants(answer) {
  const a0 = String(answer ?? '').trim();
  const out = new Set([a0]);
  const add = v => { v = unquote(String(v).trim()); if (v) out.add(v); };
  const bases = /［[^］]*］/.test(a0) ? [a0.replace(/［|］/g, ''), a0.replace(/［[^］]*］/g, '')] : [a0];
  for (const a of bases) {
    add(a);
    const end = a.match(/^(.+?)（([^（）]+)）$/);
    if (end) {
      add(end[1]);
      for (const y of end[2].split(/[、，,]/).map(x => x.trim()).filter(Boolean)) {
        if (y.length >= 2) add(y);
        // 答えの終わりの部分の言いかえ（「ロシア二月（三月）」→ ロシア三月）
        const x = end[1], last = x[x.length - 1];
        if (y.length < x.length && last === y[y.length - 1]) {
          let k = x.length;
          while (k > 0 && kind(x[k - 1]) === kind(y[0])) k--;
          if (k > 0) add(x.slice(0, k) + y);
        }
      }
    } else if (/（[^（）]+）/.test(a)) {
      add(a.replace(/（[^（）]+）/g, ''));
      // 「ドイツ（プロイセン）=フランス」→ プロイセン=フランス（かっこの前の語を置きかえる）
      add(a.replace(/([^=＝・（）]*)（([^（）]+)）/g, '$2'));
    }
  }
  for (const v of [...out]) {
    if (SUFFIX.test(v) && v.replace(SUFFIX, '').length >= 2) add(v.replace(SUFFIX, ''));
    if (/^前?\d+年$/.test(v)) add(v.replace(/年$/, ''));
  }
  return [...out];
}

/** 1つの空欄の採点。正解なら { how }、ちがえば null（年・数の答えは、数が同じときだけ正解） */
export function gradeBlank(input, answer, strict = false) {
  const t = String(input ?? '').trim();
  if (!t) return null;
  const num = s => String(s).normalize('NFKC').replace(/[\s年]/g, '').replace(/^紀元前/, '前');
  if (/^前?\d+年?$/.test(String(answer).trim())) return num(t) === num(answer) ? { how: 'exact', term: answer } : null;
  return matchTerms(t, variants(answer), [], strict);
}

/**
 * 1つの問題の採点（すべての空欄）。free … 順不同の空欄の番号の組（[[0, 1]] なら①と②は入れかわってもよい）。
 * 戻り値：空欄ごとに { m: 採点の結果（null ならまちがい）, a: その欄の正解 }。順不同の組では、合った答えを a にする
 */
export function gradeItem(answers, inputs, free = [], strict = false) {
  const res = answers.map((a, i) => ({ m: gradeBlank(inputs[i], a, strict), a }));
  for (const group of free || []) {
    const g = group.filter(i => i >= 0 && i < answers.length);
    if (g.length < 2) continue;
    const left = [...g];
    const out = new Map();
    // まず書いた位置の答えに合うもの、つぎに組のほかの答えに合うものを当てる
    for (const i of g) {
      const m = gradeBlank(inputs[i], answers[i], strict);
      if (m) { out.set(i, { m, a: answers[i] }); left.splice(left.indexOf(i), 1); }
    }
    for (const i of g) {
      if (out.has(i)) continue;
      const j = left.find(j => gradeBlank(inputs[i], answers[j], strict));
      if (j != null) { out.set(i, { m: gradeBlank(inputs[i], answers[j], strict), a: answers[j] }); left.splice(left.indexOf(j), 1); }
    }
    for (const i of g) {
      if (out.has(i)) continue;
      const j = left.shift();
      out.set(i, { m: null, a: answers[j ?? i] });
    }
    for (const [i, r] of out) res[i] = r;
  }
  return res;
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
  const v2 = Number(raw.version) >= 2;
  const items = [];
  const seen = new Set();
  const strs = v => (Array.isArray(v) ? v : v ? [v] : []).map(String);
  for (const x of raw.items) {
    if (!x || typeof x.q !== 'string' || !x.id || seen.has(x.id)) continue;
    // version 1 には赤字の空欄がないので、〈〉は空欄にしない
    const text = v2 ? x.q : x.q.replace(/〈/g, '＜').replace(/〉/g, '＞');
    const answers = answersOf(text);
    const box = boxAnswersOf(text);
    if (!box.length) continue;
    const full = fullAnswers(text), red = parts(text).filter(p => p.a != null).map(p => !!p.red);
    seen.add(x.id);
    const y = Number(x.y);
    const free = (Array.isArray(x.free) ? x.free : []).filter(Array.isArray)
      .map(g => g.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < answers.length)).filter(g => g.length >= 2);
    items.push({
      id: String(x.id), ch: Number(x.ch) || 0, sec: String(x.sec ?? ''), text, answers, box,
      y: Number.isFinite(y) ? y : null, yq: Number(x.yq) || 0,
      regions: strs(x.r),
      audio: x.a ? String(x.a) : '', t: Number(x.t) || 0,
      notes: strs(x.n), src: x.src ? String(x.src) : '', stars: Number.isFinite(Number(x.st)) && x.st != null ? Number(x.st) : null,
      page: Number(x.p) || null, guess: !!x.g, free, img: x.img ? String(x.img) : '', old: strs(x.old),
      full, title: titleOf(full.filter((_, i) => !red[i]), text)
    });
  }
  if (!items.length) return null;
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map(c => ({ n: Number(c.n), title: String(c.title ?? '') }))
    .filter(c => Number.isFinite(c.n) && items.some(it => it.ch === c.n));
  return {
    title: String(raw.title || '一問一答'), note: String(raw.note || ''), version: v2 ? 2 : 1,
    items, chapters, byId: new Map(items.map(it => [it.id, it]))
  };
}

/** 前の版の id → この版の id（版を読みかえたときに、復習の記録を引き継ぐため） */
export function oldIdMap(data) {
  const m = new Map();
  for (const it of data?.items || []) for (const o of it.old) if (!data.byId.has(o)) m.set(o, it.id);
  return m;
}

/** 写真の指定。"event:<id>" ならアプリの出来事の写真（なければ null） */
export function imageOf(db, it) {
  if (!it?.img) return null;
  if (it.img.startsWith('event:')) {
    const e = db?.byKey?.get(it.img);
    return e?.image ? { image: e.image, imageVerified: !!e.imageVerified, key: e.key } : null;
  }
  return { image: it.img, imageVerified: false };
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
 * opt.stars … ★の数（空ならすべて。★のない版の問題はしぼらない）
 */
export function pool(data, opt = {}, range = [-Infinity, Infinity], regionsOf = null) {
  if (!data) return [];
  const lo = opt.from == null || opt.from <= range[0] ? -Infinity : opt.from;
  const hi = opt.to == null || opt.to >= range[1] ? Infinity : opt.to;
  const chs = new Set((opt.chapters || []).map(Number));
  const regs = opt.groups?.length && regionsOf ? new Set(regionsOf(opt.groups)) : null;
  const stars = new Set((opt.stars || []).map(Number));
  return data.items.filter(it => (it.y == null || (it.y >= lo && it.y <= hi))
    && (!chs.size || chs.has(it.ch))
    && (!stars.size || it.stars == null || stars.has(it.stars))
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
    for (const a of [...new Set([...(it.full || []).filter((_, i) => (it.box || []).includes(it.answers[i])), ...(it.box || it.answers)])]) {
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

/** 答えが年・日付だけか（「1295年」など。概要を出す語ではない） */
export const isDateAnswer = a => DATE.test(String(a ?? '').trim()) || /^前?\d+$/.test(String(a ?? '').trim());

const recCache = new WeakMap();
/** アプリのデータの名前の索引（表記をそろえた名前 → 出来事・人物・王朝/国家） */
function recordIndex(db) {
  if (recCache.has(db)) return recCache.get(db);
  const idx = new Map();
  const add = (name, rec) => {
    const k = base(name);
    if (!k) return;
    if (!idx.has(k)) idx.set(k, []);
    if (!idx.get(k).includes(rec)) idx.get(k).push(rec);
  };
  for (const e of db.events) for (const t of [e.title, ...(e.answers || [])]) add(t, e);
  for (const r of db.rulers) for (const t of [r.name, ...(r.aliases || [])]) add(t, r);
  for (const p of db.polities) for (const t of [p.name, ...(p.aliases || []), ...(p.names || []).map(n => n[1])]) add(t, p);
  recCache.set(db, idx);
  return idx;
}

/**
 * 一問一答の答えの語に当たる、アプリのデータの項目（出来事・人物・王朝/国家）。なければ null。
 * 名前・別名が（表記ゆれをそろえて）同じものだけを使い、いくつかあれば、ctx（その問題の地域と年）に近いものを選ぶ
 * （「パリ条約」なら、問題の年にいちばん近いパリ条約）。
 */
export function answerRecord(db, answer, ctx = {}) {
  if (isDateAnswer(answer)) return null;
  const idx = recordIndex(db);
  const cands = [...new Set(variants(answer).flatMap(v => idx.get(base(v)) || []))];
  if (cands.length <= 1) return cands[0] || null;
  const y = ctx.y, regs = ctx.regions || [];
  const span = x => (x.kind === 'event' ? [x.year, x.end ?? x.year] : x.kind === 'ruler' ? [x.from, x.to] : [x.start, x.end]);
  const regOf = x => (x.kind === 'event' ? x.regions : [x.region || db.polityById?.get(x.parent)?.region]);
  const score = x => {
    const [a, b] = span(x);
    const d = y == null ? 0 : y < a ? a - y : y > b ? y - b : 0;
    const far = regs.length && !regOf(x).some(r => regs.includes(r)) ? 1000 : 0;
    return far + Math.min(d, 999) + ({ event: 0, ruler: 0.1, polity: 0.2 }[x.kind] || 0.3);
  };
  return cands.sort((p, q) => score(p) - score(q))[0];
}

/** 問題の答えの語を探すときの候補（空欄のあとに続く字を付けた語、答えそのもの） */
export function wordForms(it, a) {
  const i = it?.answers?.indexOf(a) ?? -1;
  const f = i >= 0 ? it.full?.[i] : null;
  if (!f || f === a) return [a];
  // 続く字は長いものから順に短くして試す（【エドワード1】世時代 → エドワード1世時代・エドワード1世時・エドワード1世）
  const label = String(a).replace(/（[^（）]+）$/, '').replace(/［|］/g, '');
  if (!f.startsWith(label)) return [f, a];
  const tail = f.slice(label.length), out = [];
  for (let k = tail.length; k >= 1; k--) out.push(label + tail.slice(0, k));
  return [...out, a];
}

/** 答えの語の見出し（「（エルサレム）」のような別名や『』を外す） */
export const answerLabel = a => unquote(String(a ?? '').replace(/（[^（）]+）$/, '').trim()) || String(a ?? '');

/** 音声の位置（秒）を「12:34」に */
export const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---- 用語検索：読み込んだ一問一答の文から探す
const textKey = new WeakMap();
const baseText = it => { if (!textKey.has(it)) textKey.set(it, base(plain(it.text))); return textKey.get(it); };

/**
 * 一問一答の文に query が入っている問題（答えの語に入っているものを先に、そのあとは問題の順）。
 * アプリのデータ（出来事・人物・王朝）にない語も、一問一答に出てくれば見つかる
 */
export function searchIchimon(data, query, limit = 8) {
  const q = base(query);
  if (!data || !q) return [];
  const hits = [];
  for (const it of data.items) {
    if (!baseText(it).includes(q)) continue;
    hits.push({ it, inAnswer: it.answers.some(a => base(a).includes(q)) });
  }
  hits.sort((a, b) => b.inAnswer - a.inAnswer);
  return hits.slice(0, limit).map(h => h.it);
}

/** 検索結果に出す、問題文の一部（探した語のまわり） */
export function snippet(it, query, len = 40) {
  const s = plain(it.text), q = String(query ?? '').trim();
  if (s.length <= len) return s;
  const i = q ? s.indexOf(q) : -1;
  const from = i < 0 ? 0 : Math.max(0, Math.min(i - 12, s.length - len));
  return `${from > 0 ? '…' : ''}${s.slice(from, from + len)}${from + len < s.length ? '…' : ''}`;
}
