// 学習記録（解答の履歴・復習・★）。ブラウザに保存する。
import { load, save, loadSettings, saveSettings } from './store.js';
import { nextReview, LEARNED, streakDays } from './srs.js';
import { centuryOf } from './util.js';

const KEY = 'progress';
const empty = () => ({ v: 1, items: {}, log: [], days: [], stars: {}, extra: [] });
let P = { ...empty(), ...load(KEY, {}) };
const listeners = new Set();

const persist = () => { save(KEY, P); listeners.forEach(f => f()); };
export const onProgress = f => listeners.add(f);
export const getProgress = () => P;
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** 問題の短い説明（一覧用） */
export function summary(q) {
  switch (q.mode) {
    case 'cross': return `${q.y}年ごろの${q.groups.map(g => g.name).join('・')}`;
    case 'ruler': return `${q.y}年の${q.polities.map(p => p.name).join('・')}の君主`;
    case 'year': return `「${q.event.title}」は何年？`;
    case 'term': return `${q.event.year}年：${q.event.title}`;
    case 'order': return `並べ替え：${q.events.map(e => e.title).join('／')}`;
    case 'choice': return `「${q.anchor.title}」と同じころの${q.group.name}`;
    default: return q.key;
  }
}

/** 解答を記録する。まちがえた問題と★の問題は復習リストに入る */
export function record(q, ok, now = Date.now()) {
  P.log.push({ t: now, k: q.key, ok: !!ok, y: q.y, r: q.regions, m: q.mode });
  if (P.log.length > 6000) P.log.splice(0, P.log.length - 6000);
  const dk = dayKey(now);
  if (!P.days.includes(dk)) P.days.push(dk);
  if (P.days.length > 800) P.days.splice(0, P.days.length - 800);
  const prev = P.items[q.key];
  if (!ok || prev) P.items[q.key] = { ...prev, key: q.key, spec: q.spec, title: summary(q), y: q.y, regions: q.regions, ...nextReview(prev, ok, now) };
  persist();
}

// 自分で判定を変えたときに、直前の記録を取り消せるようにしておく
let lastSnap = null;
/** 解答を記録する（あとで判定を変えられる） */
export function recordWithUndo(q, ok, now = Date.now()) {
  lastSnap = { key: q.key, before: P.items[q.key] ? { ...P.items[q.key] } : null };
  record(q, ok, now);
}
/** 直前の解答の判定を変える */
export function changeJudgement(q, ok, now = Date.now()) {
  const i = P.log.map(x => x.k).lastIndexOf(q.key);
  if (i >= 0) P.log.splice(i, 1);
  if (lastSnap?.key === q.key) { if (lastSnap.before) P.items[q.key] = lastSnap.before; else delete P.items[q.key]; }
  record(q, ok, now);
}

export function star(q, now = Date.now()) {
  P.stars[q.key] = { spec: q.spec, title: summary(q), t: now };
  if (!P.items[q.key]) P.items[q.key] = { key: q.key, spec: q.spec, title: summary(q), y: q.y, regions: q.regions, box: 0, due: now, lapses: 0, last: now };
  persist();
}
export function unstar(key) { delete P.stars[key]; persist(); }
export const isStarred = key => !!P.stars[key];
export function forget(key) { delete P.items[key]; delete P.stars[key]; persist(); }

/** データにない答えを自分で正解にしたもの（データに足す候補） */
export function addCandidate(text, q) {
  P.extra.unshift({ t: Date.now(), text, q: summary(q), y: q.y, r: q.regions });
  P.extra = P.extra.slice(0, 200);
  persist();
}
export function clearCandidates() { P.extra = []; persist(); }

// ---- 集計
export function stats(now = Date.now()) {
  const recent = P.log.filter(x => x.t >= now - 30 * 86400e3);
  const items = Object.values(P.items);
  return {
    answered: P.log.length,
    accuracy: recent.length ? Math.round(recent.filter(x => x.ok).length / recent.length * 100) : null,
    recentCount: recent.length,
    learned: items.filter(x => (x.box ?? 0) >= LEARNED).length,
    reviewing: items.filter(x => (x.box ?? 0) < LEARNED).length,
    streak: streakDays(P.days.map(k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }).map(dayKey), now)
  };
}

/** 地域×世紀の正答率。groups: [{id, name, regions}] */
export function heatmap(groups, centuries) {
  const cell = {};
  for (const x of P.log) {
    if (x.y == null) continue;
    const c = centuryOf(x.y);
    const gs = new Set(groups.filter(g => (x.r || []).some(r => g.regions.includes(r))).map(g => g.id));
    for (const g of gs) { const k = `${g}:${c}`; (cell[k] ||= { n: 0, ok: 0 }).n++; if (x.ok) cell[k].ok++; }
  }
  return groups.map(g => ({ group: g, cells: centuries.map(c => ({ c, ...(cell[`${g.id}:${c}`] || { n: 0, ok: 0 }) })) }));
}

export function recentMistakes(n = 12) {
  const out = [], seen = new Set();
  for (let i = P.log.length - 1; i >= 0 && out.length < n; i--) {
    const x = P.log[i];
    if (x.ok || seen.has(x.k)) continue;
    seen.add(x.k);
    const it = P.items[x.k];
    out.push({ key: x.k, t: x.t, title: it?.title || x.k, y: x.y, misses: P.log.filter(l => l.k === x.k && !l.ok).length, item: it });
  }
  return out;
}

// ---- 書き出し・読み込み
export function exportAll() {
  return JSON.stringify({ app: 'yokogushi', v: 1, exportedAt: new Date().toISOString(), progress: P, settings: loadSettings(), verify: load('verify', {}) });
}

export function importAll(text) {
  const d = JSON.parse(text);
  if (d.app !== 'yokogushi' || !d.progress) throw new Error('ヨコ串世界史の学習記録ファイルではありません');
  const q = d.progress;
  for (const [k, it] of Object.entries(q.items || {})) {
    const cur = P.items[k];
    if (!cur || (it.last || 0) > (cur.last || 0)) P.items[k] = it;
  }
  const seen = new Set(P.log.map(x => `${x.t}:${x.k}`));
  for (const x of q.log || []) if (!seen.has(`${x.t}:${x.k}`)) P.log.push(x);
  P.log.sort((a, b) => a.t - b.t);
  if (P.log.length > 6000) P.log.splice(0, P.log.length - 6000);
  P.days = [...new Set([...P.days, ...(q.days || [])])];
  P.stars = { ...(q.stars || {}), ...P.stars };
  P.extra = [...(q.extra || []), ...P.extra].slice(0, 200);
  persist();
  if (d.verify) {
    const v = load('verify', {});
    for (const [k, o] of Object.entries(d.verify)) if (!v[k] || (o.at || '') > (v[k].at || '')) v[k] = o;
    save('verify', v);
  }
  if (d.settings) saveSettings({ ...loadSettings(), ...d.settings });
  return { items: Object.keys(q.items || {}).length, log: (q.log || []).length };
}

export function resetProgress() { P = empty(); persist(); }
