// クイズの画面
import { $, $$, esc, fmtYear, fmtSpan, yearText, shuffle } from '../core/util.js';
import { MODES, makeSession, eventPool, quizGroups } from '../core/quizgen.js';
import { gradeCross, gradeRuler, gradeTerm, gradeYear, CLS_TEXT } from '../core/grade.js';
import { recordWithUndo, changeJudgement, star, isStarred, addCandidate } from '../core/progress.js';
import { yokoPanel, badges, ICON } from './common.js';

const MODE_HELP = {
  cross: '◯年ごろ、A・B・Cで何が起きていた？',
  ruler: '◯年の各国の君主・指導者は？',
  year: '出来事は何年？（数字で答える）',
  term: '年と説明から出来事の名前を答える',
  order: '地域のちがう4つの出来事を古い順に',
  choice: '同じころの出来事・人物を4択で'
};

let S = null;
let pending = null;

/** 外から問題を渡して始める（復習・年表のカードから） */
export function startWith(app, questions, opts = {}) {
  pending = { questions, opts };
  if (location.hash.startsWith('#quiz')) render(app, document.getElementById('view'));
  else location.hash = '#quiz';
}

export function render(app, el) {
  S = { app, el };
  if (pending && pending.questions.length) {
    const p = pending; pending = null;
    begin(p.questions, p.opts);
    return;
  }
  pending = null;
  setup();
}

export function destroy() { if (S?.el) S.el.onkeydown = null; S = null; }

// ---- 出題の設定
function setup() {
  const { app, el } = S, db = app.db, q = app.settings.quiz;
  el.onkeydown = null;
  const [a, b] = db.range;
  const cents = [];
  for (let c = Math.floor(a / 100) * 100; c < b; c += 100) cents.push([Math.max(a, c), Math.min(b, c + 99)]);
  const groups = db.groups.length ? db.groups : [];
  const chosen = new Set(q.groups || []);
  el.innerHTML = `
  <div class="page narrow quiz-setup">
    <h1 class="page-title">クイズ <small>データから自動で出題</small></h1>
    <div class="panel stack">
      <div class="field"><span class="label">形式</span>
        <div class="mode-grid">${Object.entries(MODES).map(([k, n]) => `<label><input type="checkbox" name="mode" value="${k}" ${q.modes.includes(k) ? 'checked' : ''}><span>${n}<small>${MODE_HELP[k]}</small></span></label>`).join('')}</div>
      </div>
      <div class="field"><span class="label">年代の範囲</span>
        <div class="chips" id="qzCents"><button type="button" class="chip" data-from="${a}" data-to="${b}">全範囲</button>${cents.map(([x, y]) => `<button type="button" class="chip" data-from="${x}" data-to="${y}">${Math.floor((x + 1) / 100) + 1}世紀</button>`).join('')}</div>
        <div class="row"><input type="number" id="qzFrom" min="${a}" max="${b}" value="${q.from ?? a}" style="width:7em" aria-label="開始年"> 〜 <input type="number" id="qzTo" min="${a}" max="${b}" value="${q.to ?? b}" style="width:7em" aria-label="終了年"> 年</div>
      </div>
      <div class="field"><span class="label">地域（選ばなければすべて）</span>
        <div class="chips" id="qzGroups">${groups.map(g => `<button type="button" class="chip${chosen.has(g.id) ? ' on' : ''}" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>
      </div>
      <div class="row" style="gap:18px">
        <div class="field"><span class="label">重要度</span><div class="seg" id="qzImp">${[1, 2, 3].map(n => `<button type="button" data-v="${n}" class="${(q.minImportance || 1) === n ? 'on' : ''}">${'★'.repeat(n)}${n < 3 ? '以上' : 'のみ'}</button>`).join('')}</div></div>
        <div class="field"><span class="label">問題数</span><div class="seg" id="qzCount">${[5, 10, 20, 30].map(n => `<button type="button" data-v="${n}" class="${(q.count || 10) === n ? 'on' : ''}">${n}問</button>`).join('')}</div></div>
      </div>
      <label class="check"><input type="checkbox" id="qzCulture" ${app.settings.culture ? 'checked' : ''}>文化史（著作・発明・美術など）も出す</label>
      <label class="check"><input type="checkbox" id="qzVerified" ${q.verifiedOnly ? 'checked' : ''}>用語集で確認済みのデータだけ出す</label>
      <p class="small muted" id="qzPool"></p>
      <div class="q-actions"><button class="btn primary" type="button" id="qzStart">はじめる</button></div>
    </div>
  </div>`;
  const read = () => ({
    modes: $$('input[name="mode"]:checked', el).map(x => x.value),
    from: Number($('#qzFrom', el).value) || a, to: Number($('#qzTo', el).value) || b,
    groups: $$('#qzGroups .chip.on', el).map(x => x.dataset.g),
    minImportance: Number($('#qzImp .on', el)?.dataset.v || 1),
    count: Number($('#qzCount .on', el)?.dataset.v || 10),
    culture: $('#qzCulture', el).checked,
    verifiedOnly: $('#qzVerified', el).checked
  });
  const refresh = () => {
    const o = read();
    const n = eventPool(db, o).length;
    $('#qzPool', el).textContent = `出題の元になる出来事：${n}件${o.verifiedOnly && !n ? '（確認済みのデータがまだありません。データ確認の画面で「確認した」を付けると出題されます）' : ''}`;
    $('#qzStart', el).disabled = !n || !o.modes.length;
  };
  const root = el.firstElementChild;
  root.addEventListener('change', refresh);
  root.addEventListener('click', e => {
    const c = e.target.closest('#qzCents .chip');
    if (c) { $('#qzFrom', el).value = c.dataset.from; $('#qzTo', el).value = c.dataset.to; refresh(); }
    const g = e.target.closest('#qzGroups .chip');
    if (g) { g.classList.toggle('on'); refresh(); }
    const sg = e.target.closest('#qzImp button, #qzCount button');
    if (sg) { $$('button', sg.parentElement).forEach(x => x.classList.toggle('on', x === sg)); refresh(); }
  });
  $('#qzStart', el).addEventListener('click', () => {
    const o = read();
    app.settings.quiz = { ...app.settings.quiz, ...o, culture: undefined };
    app.settings.culture = o.culture;
    app.saveSettings();
    const qs = makeSession(db, { ...o, window: 5 });
    if (!qs.length) { $('#qzPool', el).textContent = '条件に合う問題を作れませんでした。範囲や地域を広げてください。'; return; }
    begin(qs, { title: 'クイズ', again: o });
  });
  refresh();
}

// ---- 出題
function begin(questions, opts) {
  S.questions = questions; S.i = 0; S.results = []; S.opts = opts || {};
  show();
}

function show() {
  const { app, el } = S, q = S.questions[S.i], n = S.questions.length;
  S.graded = false; S.ok = null;
  el.innerHTML = `
  <div class="page narrow">
    <div class="row" style="justify-content:space-between"><span class="small muted">${esc(S.opts.title || 'クイズ')} ・ ${S.i + 1} / ${n}</span><button class="btn small ghost" type="button" id="qzQuit">やめる</button></div>
    <div class="progressbar"><i style="width:${S.i / n * 100}%"></i></div>
    <div class="q-card" id="qzCard">
      <div class="q-meta"><span>${esc(q.title)}</span><span>${q.y != null ? `${Math.floor((q.y - 1) / 100) + 1}世紀` : ''}</span></div>
      ${body(q)}
      <div class="q-actions" id="qzActs"><button class="btn primary" type="button" id="qzGrade">採点する</button><button class="btn" type="button" id="qzSkip">わからない</button></div>
      <div id="qzAfter"></div>
    </div>
  </div>`;
  $('#qzQuit', el).addEventListener('click', finish);
  $('#qzGrade', el).addEventListener('click', () => grade());
  $('#qzSkip', el).addEventListener('click', () => grade(true));
  wireBody(q);
  const first = $('#qzCard input', el); if (first && !matchMedia('(max-width: 859px)').matches) first.focus();
  el.onkeydown = e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    if (S.graded) next(); else grade();
  };
}

function body(q) {
  const db = S.app.db;
  switch (q.mode) {
    case 'cross':
      return `<p class="q-text"><span class="yr">${yearText(q.y)}</span>ごろ（前後${q.w}年）、次の地域では何が起きていた？ 出来事・王朝・人物のどれでもよい。いくつ書いてもOK（「、」で区切る）。</p>` +
        q.groups.map((g, i) => `<div class="q-field"><label for="qa${i}">${esc(g.name)}</label><input type="text" id="qa${i}" autocomplete="off" enterkeyhint="next"><div class="res" id="qr${i}" aria-live="polite"></div></div>`).join('');
    case 'ruler':
      return `<p class="q-text"><span class="yr">${yearText(q.y)}</span>の、次の国の君主（指導者）は？</p>` +
        q.polities.map((p, i) => `<div class="q-field"><label for="qa${i}">${esc(db.nameAt(p, q.y))}</label><input type="text" id="qa${i}" autocomplete="off"><div class="res" id="qr${i}" aria-live="polite"></div></div>`).join('');
    case 'year': {
      const e = q.event;
      return `<p class="q-text">「<b>${esc(e.title)}</b>」${e.end ? 'が始まったの' : ''}は何年？</p>${e.desc ? `<p class="q-hint">${esc(e.desc)}</p>` : ''}
        <div class="q-field"><label for="qa0">年（紀元前は「前221」のように）</label><input type="text" id="qa0" inputmode="numeric" autocomplete="off"><div class="res" id="qr0" aria-live="polite"></div></div>`;
    }
    case 'term': {
      const e = q.event, regs = e.regions.map(r => db.regionById(r)?.name || r).join('・');
      return `<p class="q-text"><span class="yr">${e.end ? `${fmtYear(e.year)}〜${fmtYear(e.end)}` : fmtYear(e.year)}年</span>（${esc(regs)}）</p><p class="q-hint">${esc(e.desc)}</p>
        <div class="q-field"><label for="qa0">この出来事の名前は？</label><input type="text" id="qa0" autocomplete="off"><div class="res" id="qr0" aria-live="polite"></div></div>`;
    }
    case 'order':
      return `<p class="q-text">次の4つを<b>古い順</b>にタップしてください。</p><div class="order-list" id="qzOrder">${q.events.map((e, i) => `<button type="button" data-i="${i}"><span class="n"></span><span>${esc(e.title)}<br><span class="meta">${esc(e.regions.map(r => db.regionById(r)?.name || r).join('・'))}</span></span></button>`).join('')}</div><button class="btn small" type="button" id="qzOrderReset">やり直す</button><div class="res" id="qr0"></div>`;
    case 'choice': {
      const a = q.anchor;
      const what = q.spec.kind === 'ruler' ? '君主（人物）' : '出来事';
      return `<p class="q-text">「<b>${esc(a.title)}</b>」（${yearText(a.year)}）と同じころ、<b>${esc(q.group.name)}</b>の${what}はどれ？</p><div class="choices" id="qzChoices">${q.options.map((o, i) => `<button type="button" data-i="${i}">${esc(o.title || o.name)}</button>`).join('')}</div><div class="res" id="qr0"></div>`;
    }
  }
  return '';
}

function wireBody(q) {
  const el = S.el;
  if (q.mode === 'order') {
    S.order = [];
    const draw = () => $$('#qzOrder button', el).forEach(b => {
      const k = S.order.indexOf(Number(b.dataset.i));
      b.classList.toggle('picked', k >= 0); $('.n', b).textContent = k >= 0 ? k + 1 : '';
    });
    $('#qzOrder', el).addEventListener('click', e => {
      if (S.graded) return;
      const b = e.target.closest('[data-i]'); if (!b) return;
      const i = Number(b.dataset.i);
      if (S.order.includes(i)) S.order = S.order.filter(x => x !== i); else S.order.push(i);
      draw();
      if (S.order.length === 4) grade();
    });
    $('#qzOrderReset', el).addEventListener('click', () => { if (!S.graded) { S.order = []; draw(); } });
  }
  if (q.mode === 'choice') {
    $('#qzChoices', el).addEventListener('click', e => {
      if (S.graded) return;
      const b = e.target.closest('[data-i]'); if (!b) return;
      S.choice = Number(b.dataset.i); grade();
    });
    $('#qzGrade', el).hidden = true;
  }
}

// ---- 採点
function grade(skip = false) {
  if (S.graded) return;
  const { app, el } = S, db = app.db, q = S.questions[S.i], strict = app.settings.strict;
  const val = i => (skip ? '' : ($(`#qa${i}`, el)?.value || ''));
  let ok = false;
  const setRes = (i, cls, html) => { const r = $(`#qr${i}`, el); if (r) { r.className = `res ${cls}`; r.innerHTML = html; } };
  if (q.mode === 'cross') {
    const verdicts = q.groups.map((g, i) => {
      const res = gradeCross(db, val(i), g.regions, q.y, q.w, strict);
      const lines = res.map(({ input, best, cls }) => {
        if (!best) return { lv: 0, html: `<span class="v">× 該当なし</span>「${esc(input)}」はデータに見つかりません。<button class="btn small" type="button" data-self="${i}" data-text="${esc(input)}">正解にする</button>` };
        const it = best.it, when = spanText(it), where = it.regions.map(r => db.regionById(r)?.name || r).join('・');
        if (cls === 3) return { lv: best.m.how === 'fuzzy' ? 2 : 3, html: `<span class="v">${best.m.how === 'fuzzy' ? '○ ほぼ正解' : '○ 正解'}</span>${esc(it.name)}（${it.label}・${when}）${badges(it.ref, { culture: false })}${best.m.how === 'fuzzy' ? `<br>表記を確認：正しくは「${esc(it.name)}」` : ''}` };
        return { lv: 1, html: `<span class="v">△ ${CLS_TEXT[cls]}</span>「${esc(it.name)}」は${esc(where)}の${it.label}（${when}）` };
      });
      const top = lines.length ? Math.max(...lines.map(l => l.lv)) : -1;
      const more = examples(db, g.regions, q.y, q.w);
      setRes(i, top >= 2 ? 'ok' : top === 1 ? 'half' : 'ng', (lines.length ? lines.map(l => `<div>${l.html}</div>`).join('') : '<div><span class="v">未回答</span></div>') + `<span class="also">この時期の${esc(g.name)}：${more.join('、') || '（データなし）'}</span>`);
      return top >= 2;
    });
    ok = verdicts.every(Boolean);
  } else if (q.mode === 'ruler') {
    const verdicts = q.polities.map((p, i) => {
      const ids = [p.id, ...p.children.map(c => c.id)];
      const right = db.rulers.filter(r => ids.includes(r.polity) && r.from <= q.y + 1 && r.to >= q.y - 1);
      const [res] = gradeRuler(db, val(i), ids, q.y, strict);
      const ans = right.map(r => `${esc(r.name)}（${fmtSpan(r.from, r.to)}）`).join('、');
      if (res?.cls === 3) { setRes(i, 'ok', `<div><span class="v">${res.best.m.how === 'fuzzy' ? '○ ほぼ正解' : '○ 正解'}</span>${ans}</div>`); return true; }
      const why = res?.best ? `「${esc(res.best.it.name)}」は${spanText(res.best.it)}（${esc(res.best.it.regions.map(r => db.regionById(r)?.name || r).join('・'))}）` : (res ? `「${esc(res.input)}」はデータに見つかりません` : '未回答');
      setRes(i, res?.best ? 'half' : 'ng', `<div><span class="v">${res?.best ? '△ ちがう人物' : '×'}</span>${why}</div><span class="also">正解：${ans}</span>`);
      return false;
    });
    ok = verdicts.every(Boolean);
  } else if (q.mode === 'year') {
    const e = q.event, r = gradeYear(val(0), e);
    ok = !!r.ok;
    if (!r.valid) setRes(0, 'ng', `<div><span class="v">×</span>正解は <b class="yr">${yearText(e.year)}</b>${e.memo ? `（メモ：${esc(e.memo)}）` : ''}</div>`);
    else if (r.ok) setRes(0, 'ok', `<div><span class="v">○ 正解</span><b class="yr">${yearText(e.year)}</b>${badges(e, { culture: false })}</div>`);
    else setRes(0, r.close ? 'half' : 'ng', `<div><span class="v">${r.close ? '△ 惜しい' : '×'}</span>${r.diff > 0 ? `${r.diff}年おそい` : `${-r.diff}年はやい`}。正解は <b class="yr">${yearText(e.year)}</b>${badges(e, { culture: false })}</div>`);
  } else if (q.mode === 'term') {
    const e = q.event, r = gradeTerm(db, val(0), e, strict);
    ok = r.ok;
    if (r.ok) setRes(0, 'ok', `<div><span class="v">${r.how === 'fuzzy' ? '○ ほぼ正解' : '○ 正解'}</span>${esc(e.title)}${badges(e, { culture: false })}</div>`);
    else {
      const other = r.other ? `<div>「${esc(r.other.it.name)}」は${spanText(r.other.it)}の${r.other.it.label}です。</div>` : '';
      setRes(0, 'ng', `<div><span class="v">×</span>正解は「<b>${esc(e.title)}</b>」${e.answers.length ? `（${e.answers.map(esc).join('、')}）` : ''}</div>${other}${r.input ? `<button class="btn small" type="button" data-self="0" data-text="${esc(r.input)}">正解にする</button>` : ''}`);
    }
  } else if (q.mode === 'order') {
    const right = q.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.year - b.e.year || (a.e.month || 0) - (b.e.month || 0)).map(x => x.i);
    ok = !skip && S.order.length === 4 && S.order.every((v, k) => q.events[v].year === q.events[right[k]].year);
    setRes(0, ok ? 'ok' : 'ng', `<div><span class="v">${ok ? '○ 正解' : '×'}</span>古い順：</div>${right.map((i, k) => `<div>${k + 1}. <span class="yr">${fmtYear(q.events[i].year)}</span> ${esc(q.events[i].title)}</div>`).join('')}`);
  } else if (q.mode === 'choice') {
    const ansIdx = q.options.indexOf(q.answer);
    ok = !skip && S.choice === ansIdx;
    $$('#qzChoices button', el).forEach((b, i) => {
      const o = q.options[i];
      b.classList.toggle('right', i === ansIdx); b.classList.toggle('wrong', i === S.choice && i !== ansIdx);
      b.innerHTML = `${esc(o.title || o.name)} <span class="small muted">（${o.title ? spanText({ spans: [[o.year, o.end ?? o.year]] }) : fmtSpan(o.from, o.to)}）</span>`;
    });
    setRes(0, ok ? 'ok' : 'ng', `<div><span class="v">${ok ? '○ 正解' : '×'}</span>「${esc(q.answer.title || q.answer.name)}」</div>`);
  }
  S.graded = true; S.ok = ok;
  S.results.push({ q, ok });
  recordWithUndo(q, ok);
  after(q, ok);
}

const spanText = it => it.spans.map(([a, b]) => (a === b ? `${fmtYear(a)}年` : `${fmtYear(a)}〜${fmtYear(b)}年`)).join('、');

function examples(db, regions, y, w) {
  const evs = db.events.filter(e => e.regions.some(r => regions.includes(r)) && e.year <= y + w && (e.end ?? e.year) >= y - w)
    .sort((a, b) => b.importance - a.importance || Math.abs(a.year - y) - Math.abs(b.year - y)).slice(0, 4).map(e => `${e.title}（${fmtYear(e.year)}）`);
  const pols = regions.flatMap(r => db.politiesIn(r, y)).map(({ polity, child }) => child?.name || db.nameAt(polity, y));
  return [...evs, ...new Set(pols)].slice(0, 6).map(esc);
}

function after(q, ok) {
  const { app, el } = S;
  $('#qzActs', el).innerHTML = `
    <button class="btn primary" type="button" id="qzNext">${S.i + 1 < S.questions.length ? '次へ' : '結果を見る'}</button>
    <button class="btn" type="button" id="qzFlip">${ok ? 'まちがいにする' : '正解にする'}</button>
    <button class="btn" type="button" id="qzStar">${ICON.star.replace('<svg', '<svg width="16" height="16"')}${isStarred(q.key) ? '苦手に登録済み' : '苦手に追加'}</button>`;
  $('#qzAfter', el).innerHTML = yokoPanel(app, q.y, 5, q.regions || []);
  $('#qzNext', el).addEventListener('click', next);
  $('#qzFlip', el).addEventListener('click', () => flip(q));
  $('#qzStar', el).addEventListener('click', e => { star(q); e.currentTarget.lastChild.textContent = '苦手に登録済み'; });
  el.querySelectorAll('[data-self]').forEach(b => b.addEventListener('click', () => {
    addCandidate(b.dataset.text, q);
    b.closest('div').innerHTML = '<span class="v">○ 自分で正解にした</span>データに足す候補として「復習」画面に記録しました。';
    const allOk = $$('.res', el).every(r => !r.classList.contains('ng') || r.querySelector('[data-self]') == null);
    if (!S.ok && allOk) flip(q, true);
  }));
  $('#qzNext', el).focus({ preventScroll: true });
}

function flip(q, quiet = false) {
  S.ok = !S.ok;
  S.results[S.results.length - 1].ok = S.ok;
  changeJudgement(q, S.ok);
  const b = $('#qzFlip', S.el); if (b) b.textContent = S.ok ? 'まちがいにする' : '正解にする';
  if (!quiet) S.app.toast?.(S.ok ? '正解として記録しました' : 'まちがいとして記録し、復習リストに入れました');
}

function next() {
  S.i++;
  if (S.i >= S.questions.length) finish(); else show();
}

function finish() {
  const { app, el } = S;
  el.onkeydown = null;
  const done = S.results, right = done.filter(r => r.ok).length;
  el.innerHTML = `
  <div class="page narrow">
    <h1 class="page-title">結果</h1>
    <div class="panel row" style="justify-content:space-between">
      <div><div class="score-big">${right}<small style="font-size:.4em"> / ${done.length}</small></div><div class="small muted">まちがえた問題は復習リストに入りました</div></div>
      <div class="q-actions">${S.opts.again ? '<button class="btn primary" type="button" id="qzAgain">同じ条件でもう一度</button>' : ''}<a class="btn" href="#review">復習へ</a><button class="btn" type="button" id="qzSetup">設定を変える</button></div>
    </div>
    <ul class="result-list">${done.map(r => `<li><span class="${r.ok ? 'mark-ok' : 'mark-ng'}">${r.ok ? '○' : '×'}</span><span>${esc(titleOf(r.q))}</span></li>`).join('') || '<li><span></span><span class="muted">解答した問題はありません</span></li>'}</ul>
  </div>`;
  $('#qzSetup', el).addEventListener('click', () => setup());
  $('#qzAgain', el)?.addEventListener('click', () => {
    const qs = makeSession(app.db, { ...S.opts.again, window: 5 });
    begin(qs, S.opts);
  });
}

function titleOf(q) {
  switch (q.mode) {
    case 'cross': return `${q.y}年ごろの${q.groups.map(g => g.name).join('・')}`;
    case 'ruler': return `${q.y}年の${q.polities.map(p => p.name).join('・')}の君主`;
    case 'year': return `${q.event.title}（${fmtYear(q.event.year)}年）`;
    case 'term': return `${fmtYear(q.event.year)}年：${q.event.title}`;
    case 'order': return `並べ替え：${q.events.map(e => e.title).join('／')}`;
    case 'choice': return `${q.anchor.title}と同じころの${q.group.name}：${q.answer.title || q.answer.name}`;
  }
  return q.key;
}

export { shuffle, quizGroups };
