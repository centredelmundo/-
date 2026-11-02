// データ（data/ のJSON）の読み込みと検索。
import { load } from './store.js';

/** JSONの書き間違いの場所（行・文字）を探す。ブラウザによってはエラーに位置が出ないため自前で調べる */
export function locateJsonError(text) {
  let i = 0;
  const n = text.length;
  const fail = msg => { throw Object.assign(new Error(msg), { pos: i }); };
  const ws = () => { while (i < n && /[\s﻿]/.test(text[i])) i++; };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    for (const w of ['true', 'false', 'null']) if (text.startsWith(w, i)) { i += w.length; return; }
    fail(c === undefined ? 'ファイルが途中で終わっています' : `「${c}」はここに書けません`);
  };
  const object = () => {
    i++; ws();
    if (text[i] === '}') { i++; return; }
    for (;;) {
      ws();
      if (text[i] !== '"') fail('項目名は " " で囲みます（直前の , が余分かもしれません）');
      string(); ws();
      if (text[i] !== ':') fail('項目名のあとに : がありません');
      i++; value(); ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return; }
      fail(', か } が足りません');
    }
  };
  const array = () => {
    i++; ws();
    if (text[i] === ']') { i++; return; }
    for (;;) {
      value(); ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return; }
      fail(', か ] が足りません');
    }
  };
  const string = () => {
    i++;
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\') i++;
      else if (text[i] === '\n') fail('文字列が " で閉じられていません');
      i++;
    }
    if (i >= n) fail('文字列が " で閉じられていません');
    i++;
  };
  const number = () => {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail('数の書き方が正しくありません');
    i += m[0].length;
  };
  try {
    value(); ws();
    if (i < n) fail('余分な文字があります');
    return null;
  } catch (e) {
    const before = text.slice(0, e.pos ?? i);
    const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n');
    return { line, col, message: e.message };
  }
}

async function fetchJson(base, file) {
  const res = await fetch(base + file, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${file} を読み込めませんでした（${res.status}）`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const loc = locateJsonError(text);
    const where = loc ? `${loc.line}行目 ${loc.col}文字目あたり：${loc.message}` : '書式に誤りがあります';
    throw new Error(`${file} の ${where}`);
  }
}

const asArray = v => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** データ全体 */
export class DB {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  async load(base = 'data/') {
    this.base = base;
    const manifest = await fetchJson(base, 'manifest.json');
    this.manifest = manifest;
    const files = {
      config: manifest.config, regions: manifest.regions, zones: manifest.zones,
      polities: asArray(manifest.polities), rulers: asArray(manifest.rulers), events: asArray(manifest.events)
    };
    const get = async f => { try { return await fetchJson(base, f); } catch (e) { this.errors.push(e.message); return null; } };
    const [config, regions, zones, polities, rulers, events] = await Promise.all([
      get(files.config), get(files.regions), files.zones ? get(files.zones) : null,
      Promise.all(files.polities.map(f => get(f).then(d => ({ f, d })))),
      Promise.all(files.rulers.map(f => get(f).then(d => ({ f, d })))),
      Promise.all(files.events.map(f => get(f).then(d => ({ f, d }))))
    ]);
    this.config = config || { range: [1500, 2000], defaultYear: 1648, windows: [3, 5, 10, 25], defaultWindow: 5 };
    this.regions = (regions?.regions || []).map(r => ({ ...r }));
    this.groups = regions?.groups || [];
    this.zones = zones;
    const tagFile = (list, kind) => list.flatMap(({ f, d }) => asArray(d).map((x, i) => ({ ...x, _file: f, _index: i, kind })));
    this.polities = tagFile(polities, 'polity');
    this.rulers = tagFile(rulers, 'ruler');
    this.events = tagFile(events, 'event');
    this.applyOverrides();
    this.index();
    return this;
  }

  /** データ確認画面で付けた印や修正を重ねる */
  applyOverrides() {
    const ov = load('verify', {});
    this.overrides = ov;
    for (const list of [this.events, this.polities, this.rulers]) {
      for (const x of list) {
        const o = ov[`${x.kind}:${x.id}`];
        if (!o) continue;
        x._original = { verified: x.verified, uncertain: x.uncertain, memo: x.memo, year: x.year, end: x.end, start: x.start, from: x.from, to: x.to };
        for (const k of ['verified', 'uncertain', 'memo', 'year', 'end', 'start', 'from', 'to']) if (k in o) x[k] = o[k];
        x._changed = true;
      }
    }
  }

  index() {
    const seen = new Map();
    const warn = (x, msg) => this.warnings.push(`${x._file}：${x.title || x.name || x.id || '(名前なし)'} … ${msg}`);
    const regionIds = new Set(this.regions.map(r => r.id));
    for (const list of [this.events, this.polities, this.rulers]) {
      for (const x of list) {
        if (!x.id) warn(x, 'id がありません');
        else if (seen.has(`${x.kind}:${x.id}`)) warn(x, `id「${x.id}」が重複しています`);
        seen.set(`${x.kind}:${x.id}`, x);
        x.key = `${x.kind}:${x.id}`;
        x.verified = x.verified === true;
        x.uncertain = x.uncertain === true;
        x.importance = Number(x.importance) || 2;
      }
    }
    // 出来事
    for (const e of this.events) {
      e.year = Number(e.year);
      if (!Number.isFinite(e.year)) warn(e, 'year が数ではありません');
      if (e.end != null) e.end = Number(e.end);
      e.regions = asArray(e.regions);
      for (const r of e.regions) if (!regionIds.has(r)) warn(e, `地域「${r}」は regions.json にありません`);
      e.tags = asArray(e.tags);
      e.culture = e.tags.includes('文化');
      e.span = [e.year, e.end ?? e.year];
      e.answers = asArray(e.answers);
      e.keywords = asArray(e.keywords);
    }
    this.events.sort((a, b) => a.year - b.year || (a.month || 0) - (b.month || 0));
    // 王朝・国家
    this.polityById = new Map();
    for (const p of this.polities) {
      p.periods = p.periods ? p.periods.map(([a, b]) => [Number(a), Number(b)]) : [[Number(p.start), Number(p.end ?? p.start)]];
      p.start = Math.min(...p.periods.map(x => x[0]));
      p.end = Math.max(...p.periods.map(x => x[1]));
      p.aliases = asArray(p.aliases);
      if (p.region && !regionIds.has(p.region)) warn(p, `地域「${p.region}」は regions.json にありません`);
      this.polityById.set(p.id, p);
    }
    for (const p of this.polities) {
      if (p.parent && !this.polityById.has(p.parent)) warn(p, `parent「${p.parent}」が見つかりません`);
      p.children = this.polities.filter(c => c.parent === p.id);
      if (!p.region && p.parent) p.region = this.polityById.get(p.parent)?.region;
    }
    // 君主
    for (const r of this.rulers) {
      r.from = Number(r.from); r.to = Number(r.to ?? r.from);
      r.aliases = asArray(r.aliases);
      const p = this.polityById.get(r.polity);
      if (!p) warn(r, `polity「${r.polity}」が見つかりません`);
      r.region = r.region || p?.region || (p?.parent && this.polityById.get(p.parent)?.region);
    }
    this.rulers.sort((a, b) => a.from - b.from);
    // 勢力図の変化
    const zoneIds = new Set((this.zones?.zones || []).map(z => z.id));
    this.changes = [];
    for (const p of this.polities) {
      for (const t of asArray(p.territory)) {
        const y = Number(t.year);
        const add = (list, st) => asArray(list).forEach(z => {
          if (zoneIds.size && !zoneIds.has(z)) warn(p, `ゾーン「${z}」は地図にありません（${y}年）`);
          this.changes.push({ y, p: p.id, z, st, t });
        });
        add(t.add, ''); add(t.vassal, 'v'); add(t.contested, 'c'); add(t.colony, 'o');
        asArray(t.remove).forEach(z => this.changes.push({ y, p: p.id, z, rm: true, t }));
      }
    }
    this.changes.sort((a, b) => a.y - b.y);
    this._owners = new Map();
    // 採点用の語句
    this.items = [
      ...this.events.map(e => ({ kind: 'event', label: '出来事', ref: e, name: e.title, terms: [e.title, ...e.answers], keys: e.keywords, regions: e.regions, spans: [e.span] })),
      ...this.rulers.map(r => ({ kind: 'ruler', label: '人物', ref: r, name: r.name, terms: [r.name, ...r.aliases], keys: [], regions: [r.region], spans: [[r.from, r.to]] })),
      ...this.polities.filter(p => !p.noQuiz).map(p => ({ kind: 'polity', label: '王朝・国家', ref: p, name: p.name, terms: [p.name, ...p.aliases], keys: [], regions: [p.region], spans: p.periods }))
    ];
  }

  get range() { return this.config.range || [1500, 2000]; }

  regionById(id) { return this.regions.find(r => r.id === id); }
  groupById(id) { return this.groups.find(g => g.id === id); }

  isActive(p, y) { return p.periods.some(([a, b]) => a <= y && y <= b); }

  /** その年の表示名（国名が途中で変わる場合） */
  nameAt(p, y) {
    let n = p.name;
    for (const [yr, name] of asArray(p.names)) if (y >= yr) n = name;
    return n;
  }

  /** 地域カードに出す国家・王朝（親子をまとめる） */
  politiesIn(regionId, y) {
    const tops = this.polities.filter(p => !p.parent && p.region === regionId && !p.hideInCards && this.isActive(p, y));
    // 親の国家が別地域でも、子の王朝がこの地域なら出す
    const orphans = this.polities.filter(p => p.parent && p.region === regionId && this.isActive(p, y) && this.polityById.get(p.parent)?.region !== regionId);
    return [...tops, ...orphans].map(p => {
      const child = p.parent ? null : p.children.find(c => this.isActive(c, y));
      const ids = [p.id, ...(child ? [child.id] : [])];
      const rulers = this.rulers.filter(r => ids.includes(r.polity) && r.from <= y && y <= r.to);
      return { polity: p, child, rulers };
    });
  }

  eventsBetween(a, b) {
    return this.events.filter(e => e.year <= b && (e.end ?? e.year) >= a);
  }

  /**
   * その年の勢力図：ゾーンID → { p: 国家ID, st: ''|'v'|'c'|'o' }
   * いちばん新しく「得た」国が持ち主。その国がなくなっていたり手放したりしたら、
   * 1つ前の持ち主（まだ存在する国）に戻る。占領が終われば元の国に戻る、という意味。
   */
  ownersAt(y) {
    if (this._owners.has(y)) return this._owners.get(y);
    const stacks = new Map();
    for (const c of this.changes) {
      if (c.y > y) break;
      let st = stacks.get(c.z);
      if (!st) { st = []; stacks.set(c.z, st); }
      const i = st.findIndex(o => o.p === c.p);
      if (i >= 0) st.splice(i, 1);
      if (!c.rm) st.push({ p: c.p, st: c.st });
    }
    const own = new Map();
    for (const [z, st] of stacks) {
      for (let i = st.length - 1; i >= 0; i--) {
        const p = this.polityById.get(st[i].p);
        if (p && this.isActive(p, y)) { own.set(z, st[i]); break; }
      }
    }
    if (this._owners.size > 60) this._owners.clear();
    this._owners.set(y, own);
    return own;
  }

  /** 全項目（データ確認用） */
  allRecords() {
    return [...this.events, ...this.polities, ...this.rulers];
  }

  recordYear(x) { return x.kind === 'event' ? x.year : x.kind === 'polity' ? x.start : x.from; }
  recordTitle(x) { return x.kind === 'event' ? x.title : x.name; }
  recordSpan(x) {
    if (x.kind === 'event') return [x.year, x.end ?? null];
    if (x.kind === 'polity') return [x.start, x.end];
    return [x.from, x.to];
  }
}
