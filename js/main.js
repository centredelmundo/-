// ヨコ串世界史：起動と画面の切り替え
import { DB } from './core/data.js';
import { loadSettings, saveSettings } from './core/store.js';
import { $, $$, esc, toast, clamp, debounce } from './core/util.js';
import { getProgress, onProgress, star } from './core/progress.js';
import { dueItems } from './core/srs.js';
import { build, questionsForEvent } from './core/quizgen.js';
import { LOGO, ICON } from './views/common.js';
import { openTerm } from './views/terms.js';
import * as timeline from './views/timeline.js';
import * as mapView from './views/map.js';
import * as quiz from './views/quiz.js';
import * as review from './views/review.js';
import * as datacheck from './views/datacheck.js';
import * as settingsView from './views/settings.js';
import * as historyView from './views/history.js';

const VIEWS = { timeline, map: mapView, quiz, review, data: datacheck, settings: settingsView, history: historyView };
const TABS = [['timeline', 'ヨコ年表', ICON.timeline], ['map', '勢力図', ICON.map], ['quiz', 'クイズ', ICON.quiz], ['review', '復習', ICON.review]];

const saveSoon = debounce(() => saveSettings(app.settings), 400);

export const app = {
  db: null,
  settings: loadSettings(),
  year: 1648,
  window: 5,
  current: null,
  toast,
  saveSettings() { saveSettings(app.settings); },
  reloadSettings() { app.settings = loadSettings(); app.applyTheme(); },
  applyTheme() {
    const t = app.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  },
  setYear(y, opt = {}) {
    const [a, b] = app.db.range;
    const ny = clamp(Math.round(y), a, b);
    if (ny === app.year && !opt.force) return;
    app.year = ny; app.settings.year = ny; saveSoon();
    const v = VIEWS[app.current];
    if (v?.update) v.update(opt);
    if (!opt.fromSlider && (app.current === 'timeline' || app.current === 'map')) history.replaceState(null, '', `#${app.current}/${ny}${v?.hashTail?.() || ''}`);
  },
  /** 勢力図でその場所を見る（spec は core/places.js の resolveFocus の書き方。year はその年の地図） */
  showOnMap(spec, year) {
    const hash = `#map/${year}/${encodeURI(spec)}`;
    if (app.current === 'map' && mapView.focusOn(spec, year)) history.replaceState(null, '', hash);
    else location.hash = hash;
  },
  setWindow(w) { app.window = w; app.settings.window = w; saveSoon(); VIEWS[app.current]?.update?.(); },
  startQuizForEvent(e) { quiz.startWith(app, questionsForEvent(app.db, e), { title: e.title }); },
  startQuizForIchimon(it) { const q = build(app.db, { mode: 'ichimon', id: it.id }); if (q) quiz.startWith(app, [q], { title: '一問一答' }); },
  starEvent(e) {
    const q = build(app.db, { mode: 'year', id: e.id });
    if (q) { star(q); toast(`「${e.title}」を苦手に追加しました（復習に出ます）`); }
  }
};

function shell() {
  document.body.innerHTML = `
  <header class="appbar">
    <a class="brand" href="#timeline">${LOGO}<span>ヨコ串世界史</span></a>
    <nav class="tabs" aria-label="画面">${TABS.map(([k, n]) => `<a href="#${k}" data-tab="${k}">${n}${k === 'review' ? '<i class="count" data-due></i>' : ''}</a>`).join('')}</nav>
    <div class="tools">
      <a class="iconbtn" href="#data" data-tab="data" title="データ確認" aria-label="データ確認">${ICON.data}</a>
      <a class="iconbtn" href="#settings" data-tab="settings" title="設定" aria-label="設定">${ICON.settings}</a>
    </div>
  </header>
  <main id="view" tabindex="-1"><div class="loading">データを読み込んでいます…</div></main>
  <nav class="tabbar" aria-label="画面">${TABS.map(([k, n, icon]) => `<a href="#${k}" data-tab="${k}">${icon}${n}${k === 'review' ? '<i class="count" data-due></i>' : ''}</a>`).join('')}</nav>`;
}

function updateDue() {
  const n = dueItems(getProgress().items).length;
  $$('[data-due]').forEach(el => { el.textContent = n ? String(n) : ''; });
}

const decodeHash = s => { try { return decodeURIComponent(s); } catch { return s; } };

function route() {
  const hash = location.hash.replace(/^#/, '') || 'timeline';
  const [name, param, ...rest] = hash.split('/');
  const key = VIEWS[name] ? name : 'timeline';
  if (key === 'timeline' || key === 'map') {
    const y = Number(param);
    if (param && Number.isFinite(y)) { const [a, b] = app.db.range; app.year = clamp(y, a, b); }
  }
  if (app.current && VIEWS[app.current]?.destroy) VIEWS[app.current].destroy();
  app.current = key;
  // 地域の歴史はヨコ年表から開く画面なので、ヨコ年表のタブを選んだままにする
  $$('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === (key === 'history' ? 'timeline' : key)));
  const el = $('#view');
  el.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    // データ確認・地域の歴史は項目や地域、勢力図は印をつける場所（#map/年/city:28.98,41.01）
    const arg = key === 'data' || key === 'history' ? param : key === 'map' && rest.length ? decodeHash(rest.join('/')) : undefined;
    VIEWS[key].render(app, el, arg);
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="page narrow"><div class="notice err">画面を表示できませんでした：${esc(err.message)}</div></div>`;
  }
}

async function boot() {
  app.applyTheme();
  shell();
  const db = new DB();
  try {
    await db.load('data/');
  } catch (err) {
    $('#view').innerHTML = `<div class="page narrow"><div class="notice err">データを読み込めませんでした：${esc(err.message)}<br>data/manifest.json を確認してください。</div></div>`;
    return;
  }
  app.db = db;
  const [a, b] = db.range;
  app.year = clamp(app.settings.year ?? db.config.defaultYear ?? a, a, b);
  app.window = app.settings.window ?? db.config.defaultWindow ?? 5;
  if (db.errors.length) setTimeout(() => toast(`データの読み込みに失敗したファイルがあります（データ確認の画面に詳細）`, 5000), 600);
  window.addEventListener('hashchange', route);
  // 点線の下線の用語をタップすると概要を出す（クイズでは解答後だけ）
  document.addEventListener('click', e => {
    const t = e.target.closest('.tt[data-term]');
    if (!t) return;
    const card = t.closest('.q-card');
    if (card && !card.classList.contains('graded')) return;
    e.preventDefault();
    openTerm(app, t.dataset.term);
  });
  route();
  updateDue();
  onProgress(updateDue);
  setInterval(updateDue, 60e3);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (app.current === 'timeline' || app.current === 'map') VIEWS[app.current].update?.(); });
  // ← → で年を動かす（入力欄にいないとき）
  document.addEventListener('keydown', e => {
    if (!(app.current === 'timeline' || app.current === 'map')) return;
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      app.setYear(app.year + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
    }
  });
  // 画面幅がPCとスマホで切り替わったら描き直す
  const mq = matchMedia('(max-width: 859px)');
  mq.addEventListener?.('change', () => { if (app.current === 'timeline' || app.current === 'map') route(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
