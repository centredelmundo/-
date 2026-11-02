// 復習の画面：期限の来た問題、苦手マップ、学習記録の書き出し
import { $, $$, esc, fmtYear, download, toast, today, centuryOf, centuryText } from '../core/util.js';
import { getProgress, stats, heatmap, recentMistakes, forget, unstar, exportAll, importAll, clearCandidates } from '../core/progress.js';
import { dueItems, LEARNED } from '../core/srs.js';
import { build, makeSession } from '../core/quizgen.js';
import { startWith } from './quiz.js';

export function render(app, el) {
  const db = app.db, P = getProgress(), st = stats();
  const due = dueItems(P.items);
  const [a, b] = db.range;
  const cents = []; for (let c = centuryOf(a); c <= centuryOf(b); c++) cents.push(c);
  const groups = db.groups.filter(g => !g.optional);
  const hm = heatmap(groups, cents);
  const lvl = c => (!c.n ? 0 : c.ok / c.n >= 0.85 ? 1 : c.ok / c.n >= 0.65 ? 2 : c.ok / c.n >= 0.4 ? 3 : 4);
  const stars = Object.entries(P.stars).sort((x, y) => y[1].t - x[1].t);
  const mistakes = recentMistakes(12);
  const upcoming = Object.values(P.items).filter(x => x.due != null && x.due > Date.now()).sort((x, y) => x.due - y.due).slice(0, 5);
  el.innerHTML = `
  <div class="page">
    <h1 class="page-title">復習 <small>学習記録はこの端末のブラウザに保存されます</small></h1>
    <div class="due">
      <div><small>今日の復習</small><div><b>${due.length}</b> <small>問</small></div><small>${upcoming.length ? `次は ${new Date(upcoming[0].due).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} から` : ''}</small></div>
      <div class="q-actions"><button class="btn" type="button" id="rvStart" ${due.length ? '' : 'disabled'}>復習をはじめる</button></div>
    </div>
    <div class="stat-row">
      <div class="stat"><b>${st.streak}</b><span>日連続</span></div>
      <div class="stat"><b>${st.accuracy == null ? '—' : st.accuracy + '%'}</b><span>正答率（30日・${st.recentCount}問）</span></div>
      <div class="stat"><b>${st.reviewing}</b><span>復習中の問題</span></div>
      <div class="stat"><b>${st.learned}</b><span>覚えた問題</span></div>
    </div>
    <div class="two-col">
      <div class="panel stack">
        <div class="sec-title"><span>苦手マップ（地域×世紀の正答率）</span></div>
        <div class="heat" style="grid-template-columns: 7em repeat(${cents.length}, minmax(0, 1fr))">
          <span></span>${cents.map(c => `<span class="h">${centuryText(c)}</span>`).join('')}
          ${hm.map(row => `<span class="r">${esc(row.group.name)}</span>${row.cells.map(c => `<button type="button" class="l${lvl(c)}" data-g="${row.group.id}" data-c="${c.c}" title="${esc(row.group.name)}・${centuryText(c.c)}：${c.n ? `${c.ok}/${c.n}問正解` : '未学習'}">${c.n ? Math.round(c.ok / c.n * 100) : ''}</button>`).join('')}`).join('')}
        </div>
        <div class="heat-key">得意 <i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> 苦手 ・ <i class="l0"></i> 未学習 ・ マスを押すとその地域・世紀だけで練習</div>
      </div>
      <div class="stack">
        <div class="sec-title"><span>最近まちがえた問題</span></div>
        <ul class="list">${mistakes.map(m => `<li><span class="y">${m.y != null ? fmtYear(m.y) : ''}</span><span>${esc(m.title)}</span><span class="x">×${m.misses}</span></li>`).join('') || '<li><span></span><span class="muted small">まだありません</span><span></span></li>'}</ul>
        <div class="sec-title"><span>★ 苦手に追加した問題</span></div>
        <ul class="list">${stars.map(([k, s]) => `<li><span class="y">${P.items[k]?.y != null ? fmtYear(P.items[k].y) : ''}</span><span>${esc(s.title)}</span><button class="btn small ghost" type="button" data-unstar="${esc(k)}">外す</button></li>`).join('') || '<li><span></span><span class="muted small">年表のカードやクイズから追加できます</span><span></span></li>'}</ul>
      </div>
    </div>
    ${P.extra.length ? `<div class="panel stack"><div class="sec-title"><span>データに足す候補（自分で正解にした答え）</span><button class="btn small ghost" type="button" id="rvClearCand">消す</button></div>
      <ul class="list">${P.extra.slice(0, 30).map(x => `<li><span class="y">${x.y != null ? fmtYear(x.y) : ''}</span><span>${esc(x.text)} <span class="small muted">— ${esc(x.q)}</span></span><span></span></li>`).join('')}</ul>
      <p class="small muted">データにない語でも正解だったものです。必要なら events のJSONに出来事として足すか、answers（別の言い方）に加えてください。</p></div>` : ''}
    <div class="panel stack">
      <div class="sec-title"><span>学習記録の書き出し・読み込み</span></div>
      <p class="small">PCとスマホでは記録が別々です。片方で「書き出す」→ もう片方で「読み込む」と、記録を合わせられます。ブラウザのデータを消すと記録も消えるので、ときどき書き出して控えを取ってください。</p>
      <div class="q-actions">
        <button class="btn" type="button" id="rvExport">ファイルに書き出す</button>
        <button class="btn" type="button" id="rvCopy">文字としてコピー</button>
        <label class="btn" for="rvFile">ファイルを読み込む</label><input type="file" id="rvFile" accept="application/json,.json" hidden>
        <button class="btn" type="button" id="rvPasteBtn">貼り付けて読み込む</button>
      </div>
      <div id="rvPaste" hidden class="stack"><textarea id="rvPasteText" placeholder="書き出した文字をここに貼り付け"></textarea><div><button class="btn primary" type="button" id="rvPasteGo">読み込む</button></div></div>
    </div>
  </div>`;
  const root = el.firstElementChild;
  $('#rvStart', root).addEventListener('click', () => {
    const qs = dueItems(getProgress().items).slice(0, 30).map(it => build(db, it.spec)).filter(Boolean);
    if (!qs.length) { toast('復習できる問題がありません（データが変わった可能性があります）'); return; }
    startWith(app, qs, { title: '復習' });
  });
  root.addEventListener('click', e => {
    const cell = e.target.closest('[data-g][data-c]');
    if (cell) {
      const g = db.groupById(cell.dataset.g), c = Number(cell.dataset.c);
      const from = c > 0 ? (c - 1) * 100 + 1 : c * 100, to = c > 0 ? c * 100 : (c + 1) * 100 - 1;
      const opt = { ...app.settings.quiz, culture: app.settings.culture, groups: [g.id], from: Math.max(from, db.range[0]), to: Math.min(to, db.range[1]), count: 10, window: 5 };
      const qs = makeSession(db, opt);
      if (!qs.length) { toast('この地域・世紀ではまだ問題を作れません'); return; }
      startWith(app, qs, { title: `${g.name}・${centuryText(c)}`, again: opt });
    }
    const un = e.target.closest('[data-unstar]');
    if (un) { unstar(un.dataset.unstar); render(app, el); }
  });
  $('#rvClearCand', root)?.addEventListener('click', () => { clearCandidates(); render(app, el); });
  $('#rvExport', root).addEventListener('click', () => { download(`yokogushi-record-${today()}.json`, exportAll()); toast('学習記録を書き出しました'); });
  $('#rvCopy', root).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(exportAll()); toast('コピーしました。もう一方の端末で「貼り付けて読み込む」を使ってください'); }
    catch { toast('コピーできませんでした。ファイルに書き出してください'); }
  });
  const doImport = text => {
    try { const r = importAll(text); toast(`読み込みました（問題 ${r.items}件・解答 ${r.log}件）`); app.reloadSettings(); render(app, el); }
    catch (err) { toast(err.message.includes('JSON') ? '読み込めませんでした（形式がちがいます）' : err.message); }
  };
  $('#rvFile', root).addEventListener('change', async e => { const f = e.target.files[0]; if (f) doImport(await f.text()); });
  $('#rvPasteBtn', root).addEventListener('click', () => { $('#rvPaste', root).hidden = false; $('#rvPasteText', root).focus(); });
  $('#rvPasteGo', root).addEventListener('click', () => doImport($('#rvPasteText', root).value));
}

export function destroy() {}
export { forget, LEARNED };
