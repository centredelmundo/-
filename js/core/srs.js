// 復習の間隔（間隔反復）。DOMに依存しない（テストできる）。
// まちがえたら箱0（当日中・10分後）に戻る。正解するたびに箱が1つ進み、
// 1日後 → 3日後 → 7日後 → 14日後 → 30日後 と間をのばす。箱6で「覚えた」。
export const DAY = 86400e3;
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
export const LEARNED = 6;
export const RETRY_MINUTES = 10;

/** 解答結果から次の状態を作る */
export function nextReview(prev, ok, now = Date.now()) {
  const lapses = prev?.lapses || 0;
  if (!ok) return { box: 0, due: now + RETRY_MINUTES * 60e3, lapses: lapses + 1, last: now };
  const box = Math.min((prev?.box ?? 0) + 1, LEARNED);
  return { box, due: box >= LEARNED ? null : now + INTERVAL_DAYS[box] * DAY, lapses, last: now };
}

/** 期限が来ている復習 */
export function dueItems(items, now = Date.now()) {
  return Object.values(items || {})
    .filter(it => it.due != null && it.due <= now)
    .sort((a, b) => a.due - b.due);
}

/** 箱ごとの件数 */
export function boxCounts(items) {
  const c = Array(LEARNED + 1).fill(0);
  for (const it of Object.values(items || {})) c[Math.min(it.box ?? 0, LEARNED)]++;
  return c;
}

/** 連続学習日数（今日か昨日まで続いている日数） */
export function streakDays(days, now = Date.now()) {
  const set = new Set(days || []);
  const key = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  let t = now;
  if (!set.has(key(t))) t -= DAY;
  let n = 0;
  while (set.has(key(t))) { n++; t -= DAY; }
  return n;
}
