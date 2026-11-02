// ブラウザへの保存（localStorage）。使えない環境では保存せずに動く。
const PREFIX = 'yokogushi.';

export function load(key, fallback) {
  try {
    const s = localStorage.getItem(PREFIX + key);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* 何もしない */ }
}

/** 設定の初期値 */
export const DEFAULT_SETTINGS = {
  year: null,            // 最後に見ていた年（null なら config の初期値）
  window: null,          // 前後◯年
  hidden: [],            // 表示しない地域ID
  order: [],             // 地域の並び（空なら regions.json の順）
  culture: true,         // 文化史を表示・出題する
  minImportance: 1,      // 年表に出す重要度の下限
  strict: false,         // 記述式を「きびしめ」で採点
  theme: 'auto',         // auto / light / dark
  sheet: false,          // 赤シート
  mapView: 'auto',
  quiz: { from: null, to: null, count: 10, modes: ['cross', 'ruler', 'year', 'term', 'order', 'choice'], minImportance: 1, verifiedOnly: false, groups: [] }
};

export function loadSettings() {
  const s = load('settings', {});
  return { ...DEFAULT_SETTINGS, ...s, quiz: { ...DEFAULT_SETTINGS.quiz, ...(s.quiz || {}) } };
}
export const saveSettings = s => save('settings', s);
