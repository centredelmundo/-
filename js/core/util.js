// 共通の小さな道具
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

/** 年の表示。紀元前は負の数で持ち、「前221」と表示する */
export const fmtYear = y => (y < 0 ? `前${-y}` : `${y}`);

/** 期間の表示（1643〜61、1589〜1792、前221〜前206） */
export function fmtSpan(a, b) {
  if (b == null || a === b) return fmtYear(a);
  if (a >= 0 && b >= 0 && Math.floor(a / 100) === Math.floor(b / 100)) return `${a}〜${String(b).slice(-2).padStart(2, '0')}`;
  return `${fmtYear(a)}〜${fmtYear(b)}`;
}

/** 「1648年」「前221年」 */
export const yearText = y => `${fmtYear(y)}年`;

/** 名前に年が入っているか（「パリ条約（1763年）」） */
export const hasYear = (title, y) => String(title ?? '').includes(yearText(y));

/** 名前に入っている年を伏せる（年代当ての問題文用）：「パリ条約（〇〇〇〇年）」 */
export const hideYear = (title, y) => String(title ?? '').split(yearText(y)).join('〇'.repeat(String(Math.abs(y)).length) + '年');

/** 世紀（1601〜1700年 = 17世紀。紀元前は負） */
export const centuryOf = y => (y > 0 ? Math.floor((y - 1) / 100) + 1 : -(Math.floor((-y - 1) / 100) + 1));
export const centuryText = c => (c > 0 ? `${c}世紀` : `前${-c}世紀`);

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** 乱数（再現できるように種を指定できる） */
export function rng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
/** 重み付きで1つ選ぶ */
export function pickWeighted(arr, weight, rand = Math.random) {
  const total = arr.reduce((s, x) => s + weight(x), 0);
  let r = rand() * total;
  for (const x of arr) { r -= weight(x); if (r <= 0) return x; }
  return arr[arr.length - 1];
}

/** ファイルとして保存させる */
export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

let toastTimer;
export function toast(msg, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const isPrim = v => v === null || typeof v !== 'object';
const isFlat = v => isPrim(v) || (Array.isArray(v) && v.every(isPrim));

/**
 * 編集しやすいJSONの書き方。
 * - オブジェクトは1項目1行（2段目以降で中身が単純なものは1行にまとめる）
 * - 文字や数字だけの配列は1行
 */
export function formatJson(value, depth = 0) {
  const pad = '  '.repeat(depth), pad1 = '  '.repeat(depth + 1);
  if (isPrim(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.every(isPrim)) return `[${value.map(v => JSON.stringify(v)).join(', ')}]`;
    if (!value.length) return '[]';
    return `[\n${value.map(v => pad1 + formatJson(v, depth + 1)).join(',\n')}\n${pad}]`;
  }
  const keys = Object.keys(value).filter(k => value[k] !== undefined);
  if (!keys.length) return '{}';
  if (depth >= 2 && keys.every(k => isFlat(value[k]))) {
    return `{ ${keys.map(k => `${JSON.stringify(k)}: ${formatJson(value[k], depth + 1)}`).join(', ')} }`;
  }
  return `{\n${keys.map(k => `${pad1}${JSON.stringify(k)}: ${formatJson(value[k], depth + 1)}`).join(',\n')}\n${pad}}`;
}

/** 今日の日付（YYYY-MM-DD） */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
