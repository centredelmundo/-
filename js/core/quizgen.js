// クイズの問題づくり。データから自動で作る。
// どの問題も spec（作り方の記録）から同じ問題を作り直せるので、復習に使える。
import { pick, pickWeighted, shuffle } from './util.js';

export const MODES = {
  cross: 'ヨコ記述',
  ruler: '君主・指導者ヨコ',
  year: '年代当て',
  term: '出来事当て',
  order: '並べ替え',
  choice: '同時代えらび'
};

/** 出題の対象にする出来事 */
export function eventPool(db, opt) {
  const [from, to] = [opt.from ?? db.range[0], opt.to ?? db.range[1]];
  const groups = quizGroups(db, opt);
  const regs = new Set(groups.flatMap(g => g.regions));
  return db.events.filter(e => e.year >= from && e.year <= to
    && e.importance >= (opt.minImportance || 1)
    && (opt.culture !== false || !e.culture)
    && (!opt.verifiedOnly || e.verified)
    && e.regions.some(r => regs.has(r)));
}

export function quizGroups(db, opt) {
  const all = db.groups.length ? db.groups : db.regions.map(r => ({ id: r.id, name: r.name, regions: [r.id] }));
  const chosen = opt.groups?.length ? all.filter(g => opt.groups.includes(g.id)) : all.filter(g => !g.optional);
  return chosen.length ? chosen : all;
}
const groupOf = (groups, regionId) => groups.find(g => g.regions.includes(regionId));
const inWindow = (e, y, w) => e.year <= y + w && (e.end ?? e.year) >= y - w;

/** spec から問題を作る（null なら作れない） */
export function build(db, spec) {
  const ev = id => db.events.find(e => e.id === id);
  switch (spec.mode) {
    case 'cross': {
      const groups = spec.g.map(id => db.groupById(id) || { id, name: db.regionById(id)?.name || id, regions: [id] });
      return { ...base(spec), key: `cross:${spec.y}:${spec.w}:${spec.g.join('+')}`, y: spec.y, w: spec.w, groups, regions: groups.flatMap(g => g.regions) };
    }
    case 'ruler': {
      const ps = spec.p.map(id => db.polityById.get(id)).filter(Boolean);
      if (ps.length < 2) return null;
      return { ...base(spec), key: `ruler:${spec.y}:${spec.p.join('+')}`, y: spec.y, polities: ps, regions: ps.map(p => p.region) };
    }
    case 'year': case 'term': {
      const e = ev(spec.id); if (!e) return null;
      return { ...base(spec), key: `${spec.mode}:${e.id}`, event: e, y: e.year, regions: e.regions };
    }
    case 'order': {
      const es = spec.ids.map(ev);
      if (es.some(x => !x)) return null;
      return { ...base(spec), key: `order:${[...spec.ids].sort().join(',')}`, events: es, y: Math.round(es.reduce((s, e) => s + e.year, 0) / es.length), regions: [...new Set(es.flatMap(e => e.regions))] };
    }
    case 'choice': {
      const a = ev(spec.id), g = db.groupById(spec.g) || { id: spec.g, name: db.regionById(spec.g)?.name || spec.g, regions: [spec.g] };
      if (!a) return null;
      const find = id => (spec.kind === 'ruler' ? db.rulers.find(r => r.id === id) : ev(id));
      const opts = spec.opts.map(find);
      if (opts.some(x => !x)) return null;
      return { ...base(spec), key: `choice:${a.id}:${spec.g}:${spec.ans}`, anchor: a, group: g, options: opts, answer: find(spec.ans), y: a.year, regions: [...a.regions, ...g.regions] };
    }
    default: return null;
  }
}
const base = spec => ({ spec, mode: spec.mode, title: MODES[spec.mode] });

// ---- 形式ごとの作り方
function makeCross(db, opt, rand) {
  const pool = eventPool(db, opt), groups = quizGroups(db, opt);
  if (!pool.length) return null;
  const w = opt.window || 5;
  for (let tries = 0; tries < 20; tries++) {
    const a = pickWeighted(pool, e => e.importance, rand);
    const y = a.year;
    const ok = groups.filter(g => db.events.some(e => e.regions.some(r => g.regions.includes(r)) && inWindow(e, y, w) && e.importance >= 2 && (opt.culture !== false || !e.culture)));
    const own = groupOf(ok, a.regions[0]);
    if (ok.length < 2 || !own) continue;
    const rest = shuffle(ok.filter(g => g !== own), rand).slice(0, 2);
    const g = shuffle([own, ...rest], rand).map(x => x.id);
    return { mode: 'cross', y, w, g };
  }
  return null;
}

function makeRuler(db, opt, rand) {
  const pool = eventPool(db, opt);
  if (!pool.length) return null;
  for (let tries = 0; tries < 20; tries++) {
    const y = pick(pool, rand).year;
    const cands = db.polities.filter(p => !p.parent && !p.hideInCards && !p.noQuiz && db.isActive(p, y)).filter(p => {
      const ids = [p.id, ...p.children.map(c => c.id)];
      return db.rulers.some(r => ids.includes(r.polity) && r.from <= y && y <= r.to && r.importance >= 2);
    });
    const byRegion = new Map();
    for (const p of shuffle(cands, rand)) if (!byRegion.has(p.region)) byRegion.set(p.region, p);
    const chosen = [...byRegion.values()].slice(0, 3);
    if (chosen.length >= 2) return { mode: 'ruler', y, p: chosen.map(p => p.id) };
  }
  return null;
}

function makeYear(db, opt, rand) {
  const pool = eventPool(db, opt);
  if (!pool.length) return null;
  return { mode: 'year', id: pickWeighted(pool, e => e.importance * e.importance, rand).id };
}

function makeTerm(db, opt, rand) {
  const pool = eventPool(db, opt).filter(e => e.desc);
  if (!pool.length) return null;
  return { mode: 'term', id: pickWeighted(pool, e => e.importance * e.importance, rand).id };
}

function makeOrder(db, opt, rand) {
  const pool = eventPool(db, opt).filter(e => e.importance >= 2);
  for (let tries = 0; tries < 30; tries++) {
    const a = pick(pool, rand);
    if (!a) return null;
    const span = 15 + Math.floor(rand() * 45);
    const near = shuffle(pool.filter(e => Math.abs(e.year - a.year) <= span), rand);
    const out = [a], years = new Set([a.year]), regs = new Set([a.regions[0]]);
    for (const e of near) {
      if (out.length >= 4) break;
      if (years.has(e.year) || regs.has(e.regions[0])) continue;
      out.push(e); years.add(e.year); regs.add(e.regions[0]);
    }
    if (out.length === 4) return { mode: 'order', ids: shuffle(out, rand).map(e => e.id) };
  }
  return null;
}

function makeChoice(db, opt, rand) {
  const pool = eventPool(db, opt).filter(e => e.importance >= 2);
  const groups = quizGroups(db, opt);
  for (let tries = 0; tries < 30; tries++) {
    const a = pick(pool, rand);
    if (!a) return null;
    const own = groupOf(groups, a.regions[0]);
    const g = pick(groups.filter(x => x !== own), rand);
    if (!g) continue;
    const inG = x => x.regions.some(r => g.regions.includes(r));
    // 人物で出す（同じ国の別の時代の君主をまちがいの選択肢に）
    if (rand() < 0.4) {
      const cands = db.rulers.filter(r => g.regions.includes(r.region) && r.from <= a.year && a.year <= r.to && r.importance >= 2);
      const ans = pick(cands, rand);
      if (ans) {
        const far = shuffle(db.rulers.filter(r => r.polity === ans.polity && r.importance >= 2 && (r.to < a.year - 30 || r.from > a.year + 30)), rand).slice(0, 3);
        if (far.length === 3) return { mode: 'choice', kind: 'ruler', id: a.id, g: g.id, ans: ans.id, opts: shuffle([ans, ...far], rand).map(r => r.id) };
      }
    }
    const right = db.events.filter(e => inG(e) && inWindow(e, a.year, 3) && e.importance >= 2 && e.id !== a.id);
    const ans = pick(right, rand);
    if (!ans) continue;
    const wrong = shuffle(db.events.filter(e => inG(e) && e.importance >= 2 && Math.abs(e.year - a.year) >= 30
      && e.year >= db.range[0] - 100 && e.year <= db.range[1]), rand);
    const used = new Set([ans.title]), opts = [ans];
    for (const e of wrong) { if (opts.length >= 4) break; if (!used.has(e.title)) { opts.push(e); used.add(e.title); } }
    if (opts.length === 4) return { mode: 'choice', id: a.id, g: g.id, ans: ans.id, opts: shuffle(opts, rand).map(e => e.id) };
  }
  return null;
}

const MAKERS = { cross: makeCross, ruler: makeRuler, year: makeYear, term: makeTerm, order: makeOrder, choice: makeChoice };

/** 問題のセットを作る */
export function makeSession(db, opt, rand = Math.random) {
  const modes = (opt.modes?.length ? opt.modes : Object.keys(MODES)).filter(m => MAKERS[m]);
  const out = [], keys = new Set();
  for (let i = 0; out.length < (opt.count || 10) && i < (opt.count || 10) * 8; i++) {
    const mode = modes[i % modes.length];
    const spec = MAKERS[mode](db, opt, rand);
    if (!spec) continue;
    const q = build(db, spec);
    if (!q || keys.has(q.key)) continue;
    keys.add(q.key); out.push(q);
  }
  return shuffle(out, rand);
}

/** 1つの出来事について問題を作る（年表のカードから「この出来事で練習」） */
export function questionsForEvent(db, e) {
  const out = [build(db, { mode: 'year', id: e.id })];
  if (e.desc) out.push(build(db, { mode: 'term', id: e.id }));
  return out.filter(Boolean);
}
