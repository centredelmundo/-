// クイズの画面
// 解答中の状態はブラウザに保存するので、別の画面に移ったりアプリを閉じたりしても続きから再開できる。
import { $, $$, esc, fmtYear, fmtSpan, yearText, hasYear, hideYear, hideAnswers, shuffle, toast, centuryOf, centuryText } from '../core/util.js';
import { MODES, CULTURE_MODES, ORDER_GAPS, build, makeSession, doneSet, eventPool, quizGroups, ichimonPool, lastingPolities, rulersIn, workPool } from '../core/quizgen.js';
import { parts as ichParts, gradeItem, NUM, clock, isDateAnswer, imageOf } from '../core/ichimon.js';
import { gradeCross, gradeRuler, gradeTerm, gradeYear, CLS_TEXT } from '../core/grade.js';
import { recordWithUndo, changeJudgement, star, isStarred, addCandidate, getUndo, setUndo, getProgress } from '../core/progress.js';
import { load, save, remove } from '../core/store.js';
import { yokoPanel, badges, ICON } from './common.js';
import { tt, fillImage, itemName, ichWord } from './terms.js';
import { countryEvents } from '../core/countryevents.js';
import { gradeWork, hintText, workTitle, workBy, isBuilding, otherWorks } from '../core/works.js';

const MODE_HELP = {
  cross: '◯年ごろ、A・B・Cで何が起きていた？',
  ruler: '◯年の各国の君主・指導者は？',
  year: '出来事は何年？（数字で答える）',
  term: '年と説明から出来事の名前を答える',
  order: '地域のちがう4つの出来事を古い順に',
  choice: '同じころの出来事・人物を4択で',
  work: '文化史の作品の作者、作者の作品名を答える',
  ichimon: '読み込んだ一問一答の【　】を答える（本の版の赤字はヒントとして出せる）'
};
const SKEY = 'quizSession'; // 解答中のクイズ

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
  if (resume()) return;
  setup();
}

export function destroy() { if (S?.el) S.el.onkeydown = null; S = null; }

// ---- 中断と再開
const freshCur = () => ({ inputs: {}, order: [], choice: null, graded: false, skip: false, ok: null, snap: null, reveal: [] });

function saveSession() {
  if (!S?.questions) return;
  save(SKEY, {
    v: 1, t: Date.now(), opts: S.opts,
    specs: S.questions.map(q => q.spec), i: S.i,
    results: S.results.map(r => ({ spec: r.q.spec, ok: r.ok })),
    cur: S.cur
  });
}

/** 前回のクイズが途中なら続きから再開する。再開したら true */
function resume() {
  const st = load(SKEY, null);
  if (!st || st.v !== 1 || !Array.isArray(st.specs) || !st.specs.length) return false;
  const db = S.app.db;
  const rebuild = sp => { try { return build(db, sp); } catch { return null; } };
  const built = st.specs.map(rebuild);
  const qs = built.filter(Boolean);
  const i = built.slice(0, st.i).filter(Boolean).length; // データが変わって作れなくなった問題は飛ばす
  if (!qs.length || i >= qs.length) { remove(SKEY); return false; }
  S.questions = qs; S.i = i; S.opts = st.opts || {};
  S.results = (st.results || []).map(r => ({ q: rebuild(r.spec), ok: !!r.ok })).filter(r => r.q);
  S.cur = built[st.i] ? { ...freshCur(), ...(st.cur || {}) } : freshCur();
  show(true);
  toast(`前回の続きから再開します（${S.i + 1} / ${S.questions.length}問目）`);
  return true;
}

/** これまでに答えた問題（学習記録の解答の履歴と復習の記録）の名前の集まり */
function answered() {
  const P = getProgress();
  return doneSet(S.app.db, [...P.log.map(l => l.k), ...Object.keys(P.items)]);
}

// ---- 出題の設定
function setup() {
  const { app, el } = S, db = app.db, q = app.settings.quiz;
  el.onkeydown = null;
  const [a, b] = db.range;
  const cents = [];
  for (let c = Math.floor(a / 100) * 100; c < b; c += 100) cents.push([Math.max(a, c), Math.min(b, c + 99)]);
  const groups = db.groups.length ? db.groups : [];
  const chosen = new Set(q.groups || []);
  const ich = db.ichimon, ichCh = new Set((q.ichChapters || []).map(Number)), ichSt = new Set((q.ichStars || []).map(Number));
  const hasStars = !!ich?.items.some(it => it.stars != null);
  // 年代・章・地域の欄は閉じておける（画面を広く使うため）。開いているかはこの端末に覚えておく
  const fold = load('quizFold', {}) || {};
  el.innerHTML = `
  <div class="page narrow quiz-setup">
    <h1 class="page-title">クイズ <small>データから自動で出題</small></h1>
    <div class="panel stack">
      <div class="field"><span class="label">形式</span>
        <div class="mode-grid">${Object.entries(MODES).map(([k, n]) => {
          const off = k === 'ichimon' && !ich;
          return `<label${off ? ' class="off"' : ''}><input type="checkbox" name="mode" value="${k}" ${q.modes.includes(k) && !off ? 'checked' : ''}${off ? ' disabled' : ''}><span>${n}<small>${off ? 'データを読み込むと使えます（設定画面）' : MODE_HELP[k]}</small></span></label>`;
        }).join('')}</div>
      </div>
      ${ich ? `<details class="field fold" id="qzIchBox" data-fold="ich"${fold.ich ? ' open' : ''}><summary><span class="label">一問一答の章${hasStars ? '・★' : ''}</span><span class="fold-sum" id="qzSumIch"></span></summary>
        <span class="label">一問一答の章（選ばなければすべて）</span>
        <div class="chips" id="qzIch">${ich.chapters.map(c => `<button type="button" class="chip${ichCh.has(c.n) ? ' on' : ''}" data-ch="${c.n}" title="${esc(c.title)}">第${c.n}章</button>`).join('')}</div>
        ${hasStars ? `<span class="label">一問一答の★（本の重要度。選ばなければすべて）</span>
        <div class="chips" id="qzIchSt">${[3, 2, 1, 0].map(n => `<button type="button" class="chip${ichSt.has(n) ? ' on' : ''}" data-st="${n}">${n ? '★'.repeat(n) : '★なし'}</button>`).join('')}</div>` : ''}
        <p class="small muted">一問一答は「年代の範囲」と、地域をえらんだときは地域でもしぼります（全範囲なら、範囲より前の古代オリエントなども出ます）。</p></details>` : ''}
      <div class="field" id="qzOrderBox"><span class="label">並べ替えの年の間隔</span>
        <div class="seg" id="qzOrder">${Object.entries(ORDER_GAPS).map(([k, v]) => `<button type="button" data-v="${k}" class="${(q.orderGap || 'near') === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
        <p class="small muted">4つの出来事の年が、どのくらいはなれて出るか。間隔が広いほどやさしくなります（「近い年も」はこれまでどおり）。</p></div>
      <div class="field" id="qzWorkBox"><span class="label">文化史の作者・作品名で答えるもの</span>
        <div class="seg" id="qzWork">${[['both', '両方'], ['by', '作者'], ['title', '作品名']].map(([k, n]) => `<button type="button" data-v="${k}" class="${(q.workAsk || 'both') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <p class="small muted">「両方」は、作品を見て作者を答える問題と、作者を見て作品名を答える問題をまぜて出します。</p></div>
      <details class="field fold" data-fold="range"${fold.range ? ' open' : ''}><summary><span class="label">年代の範囲</span><span class="fold-sum" id="qzSumRange"></span></summary>
        <div class="chips" id="qzCents"><button type="button" class="chip" data-from="${a}" data-to="${b}">全範囲</button>${cents.map(([x, y]) => `<button type="button" class="chip" data-from="${x}" data-to="${y}">${centuryText(centuryOf(x + 1))}</button>`).join('')}</div>
        <div class="row"><input type="number" id="qzFrom" min="${a}" max="${b}" value="${q.from ?? a}" style="width:7em" aria-label="開始年"> 〜 <input type="number" id="qzTo" min="${a}" max="${b}" value="${q.to ?? b}" style="width:7em" aria-label="終了年"> 年</div>
      </details>
      <details class="field fold" data-fold="groups"${fold.groups ? ' open' : ''}><summary><span class="label">地域</span><span class="fold-sum" id="qzSumGroups"></span></summary>
        <div class="chips" id="qzGroups">${groups.map(g => `<button type="button" class="chip${chosen.has(g.id) ? ' on' : ''}" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>
        <p class="small muted">選ばなければすべての地域から出します。</p>
      </details>
      <div class="field" id="qzRulerBox"><span class="label">君主・指導者の出し方</span>
        <div class="seg" id="qzRulerScope"><button type="button" data-v="all" class="${q.rulerScope === 'one' ? '' : 'on'}">いろいろな国</button><button type="button" data-v="one" class="${q.rulerScope === 'one' ? 'on' : ''}">1つの国だけ</button></div>
        <p class="small muted" id="qzRulerAll">ある年の、いろいろな国の君主・指導者を答えます（これまでどおり）。</p>
        <div id="qzRulerOne" hidden>
          <p class="small muted" id="qzRulerNote"></p>
          <div class="ruler-pick" id="qzRulerList" role="radiogroup" aria-label="出題する国"></div>
        </div>
      </div>
      <div class="row" style="gap:18px">
        <div class="field" id="qzImpBox"><span class="label">重要度</span><div class="seg" id="qzImp">${[1, 2, 3].map(n => `<button type="button" data-v="${n}" class="${(q.minImportance || 1) === n ? 'on' : ''}">${'★'.repeat(n)}${n < 3 ? '以上' : 'のみ'}</button>`).join('')}</div></div>
        <div class="field"><span class="label">問題数</span><div class="seg" id="qzCount">${[5, 10, 20, 30].map(n => `<button type="button" data-v="${n}" class="${(q.count || 10) === n ? 'on' : ''}">${n}問</button>`).join('')}</div></div>
      </div>
      <label class="check"><input type="checkbox" id="qzSkipDone" ${q.skipDone ? 'checked' : ''}>1度解いた問題は出さない（正解・不正解にかかわらず、これまでに答えた問題を除く）</label>
      <label class="check"><input type="checkbox" id="qzCulture" ${app.settings.culture ? 'checked' : ''}>文化史（著作・発明・美術など）も出す</label>
      <label class="check"><input type="checkbox" id="qzCultureOnly" ${q.cultureOnly ? 'checked' : ''}>文化史だけで出題する（作品・建築の写真つき。形式は年代当て・出来事当て・並べ替え・同時代えらび・文化史の作者・作品名）</label>
      <p class="small muted" id="qzPool"></p>
      <div class="q-actions"><button class="btn primary" type="button" id="qzStart">はじめる</button></div>
    </div>
  </div>`;
  const read = () => {
    const cultureOnly = $('#qzCultureOnly', el).checked;
    return {
      modes: $$('input[name="mode"]:checked', el).map(x => x.value),
      from: Number($('#qzFrom', el).value) || a, to: Number($('#qzTo', el).value) || b,
      groups: $$('#qzGroups .chip.on', el).map(x => x.dataset.g),
      minImportance: Number($('#qzImp .on', el)?.dataset.v || 1),
      count: Number($('#qzCount .on', el)?.dataset.v || 10),
      ichChapters: $$('#qzIch .chip.on', el).map(x => Number(x.dataset.ch)),
      ichStars: $$('#qzIchSt .chip.on', el).map(x => Number(x.dataset.st)),
      orderGap: $('#qzOrder .on', el)?.dataset.v || 'near',
      workAsk: $('#qzWork .on', el)?.dataset.v || 'both',
      rulerScope: $('#qzRulerScope .on', el)?.dataset.v || 'all',
      rulerOne,
      culture: cultureOnly || $('#qzCulture', el).checked,
      cultureOnly,
      skipDone: $('#qzSkipDone', el).checked
    };
  };
  // 君主・指導者の「1つの国だけ」で選んだ国（年代の範囲を変えて一覧から外れたら、選んでいないことにする）
  let rulerOne = q.rulerOne || '', picked = null;
  const drawRulerList = (list, o) => {
    const span = `${fmtYear(o.from)}〜${fmtYear(o.to)}年`;
    $('#qzRulerNote', el).textContent = list.length
      ? `${span}のあいだ、ずっと続いていた国です（人数はこの期間の君主・指導者。重要度の設定でしぼれます）。国を選ぶと、その国の君主・指導者を1人1問ずつ、いろいろな年で出題します。`
      : `${span}のあいだ、ずっと続いていた国が見つかりません。年代の範囲を短くしてください${o.groups.length ? '（地域をしぼっているときは、地域も見直してください）' : ''}。`;
    const byGroup = new Map();
    for (const x of list) { if (!byGroup.has(x.group)) byGroup.set(x.group, []); byGroup.get(x.group).push(x); }
    $('#qzRulerList', el).innerHTML = [...byGroup].map(([g, xs]) => `<div class="rp-group"><span class="rp-g">${esc(g.name)}</span><div class="chips">${xs.map(x => {
      const on = x.polity.id === rulerOne;
      return `<button type="button" class="chip${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-pol="${esc(x.polity.id)}" title="${esc(x.rulers.map(r => r.name).join('・'))}">${esc(x.label)}<small>${x.rulers.length}人</small></button>`;
    }).join('')}</div></div>`).join('');
  };
  const refresh = () => {
    const o = read();
    const n = eventPool(db, o).length;
    const usable = o.cultureOnly ? (o.modes.filter(m => CULTURE_MODES.includes(m)).length ? o.modes.filter(m => CULTURE_MODES.includes(m)) : CULTURE_MODES) : o.modes;
    const useIch = !o.cultureOnly && o.modes.includes('ichimon') && !!db.ichimon;
    const ni = useIch ? ichimonPool(db, o).length : 0;
    const box = $('#qzIchBox', el); if (box) box.hidden = !useIch;
    $('#qzOrderBox', el).hidden = !usable.includes('order');
    const useWork = usable.includes('work'), nw = useWork ? workPool(db, o).length : 0;
    $('#qzWorkBox', el).hidden = !useWork;
    // 君主・指導者：1つの国だけのときは、期間のあいだずっと続いた国の一覧から選ぶ
    $('#qzRulerBox', el).hidden = !usable.includes('ruler');
    const oneRuler = usable.includes('ruler') && o.rulerScope === 'one';
    $('#qzRulerOne', el).hidden = !oneRuler;
    $('#qzRulerAll', el).hidden = oneRuler;
    picked = null;
    if (oneRuler) {
      const list = lastingPolities(db, o.from, o.to, o);
      picked = list.find(x => x.polity.id === rulerOne) || null;
      drawRulerList(list, o);
    }
    const others = usable.filter(m => m !== 'ichimon');
    // 一問一答だけのときは、アプリの重要度は使わない（一問一答は本の★でしぼる）ので出さない
    $('#qzImpBox', el).hidden = useIch && !others.length;
    const evModes = others.filter(m => !(oneRuler && m === 'ruler') && m !== 'work');
    const parts = [];
    if (evModes.length || (!useIch && !oneRuler && !useWork)) parts.push(`出題の元になる出来事：${n}件`);
    if (useWork) parts.push(`作者・作品名のわかる文化史の作品：${nw}件`);
    if (oneRuler) parts.push(picked ? `${picked.label}の君主・指導者：${picked.rulers.length}人（1人1問まで）` : '君主・指導者：出題する国を選んでください');
    if (useIch) {
      const dn = o.skipDone ? answered() : null;
      parts.push(`一問一答：${ni}問${dn ? `（まだ解いていない問題 ${ichimonPool(db, o).filter(it => !dn.has(`ichimon:${it.id}`)).length}問）` : ''}`);
    }
    // 閉じた欄の見出しに、いまの選び方を出す
    const sum = (id, t) => { const x = $(id, el); if (x) x.textContent = t; };
    sum('#qzSumRange', o.from <= a && o.to >= b ? '全範囲' : `${fmtYear(o.from)}〜${fmtYear(o.to)}年`);
    sum('#qzSumGroups', o.groups.length ? groups.filter(g => o.groups.includes(g.id)).map(g => g.name).join('・') : 'すべて');
    sum('#qzSumIch', `${o.ichChapters.length ? `第${[...o.ichChapters].sort((x, y) => x - y).join('・')}章` : 'すべての章'}${o.ichStars?.length ? `・${[...o.ichStars].sort((x, y) => y - x).map(n => (n ? '★'.repeat(n) : '★なし')).join('/')}` : ''}`);
    $('#qzPool', el).textContent = `${parts.join('・')}${o.cultureOnly ? `（文化史・形式：${usable.map(m => MODES[m]).join('・')}）` : ''}`;
    $('#qzStart', el).disabled = !o.modes.length || (oneRuler && !picked) || (!(evModes.length && n) && !(oneRuler && picked) && !(useIch && ni) && !(useWork && nw));
  };
  const root = el.firstElementChild;
  root.addEventListener('change', refresh);
  $$('details.fold', root).forEach(d => d.addEventListener('toggle', () => { fold[d.dataset.fold] = d.open; save('quizFold', fold); }));
  root.addEventListener('click', e => {
    const c = e.target.closest('#qzCents .chip');
    if (c) { $('#qzFrom', el).value = c.dataset.from; $('#qzTo', el).value = c.dataset.to; refresh(); }
    const g = e.target.closest('#qzGroups .chip, #qzIch .chip, #qzIchSt .chip');
    if (g) { g.classList.toggle('on'); refresh(); }
    const sg = e.target.closest('#qzImp button, #qzCount button, #qzOrder button, #qzRulerScope button, #qzWork button');
    if (sg) { $$('button', sg.parentElement).forEach(x => x.classList.toggle('on', x === sg)); refresh(); }
    const pol = e.target.closest('#qzRulerList [data-pol]');
    if (pol) { rulerOne = pol.dataset.pol; refresh(); }
  });
  $('#qzStart', el).addEventListener('click', () => {
    const o = read();
    app.settings.quiz = { ...app.settings.quiz, ...o, culture: undefined, verifiedOnly: undefined };
    if (!o.cultureOnly) app.settings.culture = o.culture;
    app.saveSettings();
    const one = picked && o.rulerScope === 'one' && !o.cultureOnly && o.modes.includes('ruler') ? picked : null;
    const opt = { ...o, rulerOne: one ? one.polity.id : '' };
    const qs = makeSession(db, { ...opt, window: 5, done: opt.skipDone ? answered() : null });
    if (!qs.length) { $('#qzPool', el).textContent = opt.skipDone ? 'この条件では、まだ解いていない問題が見つかりませんでした。範囲や形式を広げるか、「1度解いた問題は出さない」を外してください。' : '条件に合う問題を作れませんでした。範囲や地域を広げてください。'; return; }
    if (opt.skipDone && qs.length < o.count && !(one && o.modes.length === 1)) toast(`まだ解いていない問題が${qs.length}問しか見つからなかったので、${qs.length}問にしました`, 3600);
    const onlyRuler = one && o.modes.length === 1;
    if (onlyRuler && qs.length < o.count) toast(`${one.label}の君主・指導者は、この期間に${one.rulers.length}人なので、${qs.length}問にしました`);
    begin(qs, { title: o.cultureOnly ? '文化史クイズ' : onlyRuler ? `君主・指導者：${one.label}` : o.modes.length === 1 && o.modes[0] === 'ichimon' ? '一問一答' : o.modes.length === 1 && o.modes[0] === 'work' ? '文化史の作者・作品名' : 'クイズ', again: opt });
  });
  refresh();
}

// ---- 出題
function begin(questions, opts) {
  S.questions = questions; S.i = 0; S.results = []; S.opts = opts || {}; S.cur = freshCur();
  show();
}

/**
 * カード右上の「○世紀」（一問一答は章）。
 * 年代当ては世紀が答えのヒントになるので、採点するまで出さない（show で空にして、grade で入れる）
 */
const eraText = q => (q.mode === 'ichimon' ? `第${q.item.ch}章` : q.y != null ? centuryText(centuryOf(q.y)) : '');

function show(restore = false) {
  const { el } = S, q = S.questions[S.i], n = S.questions.length;
  S.graded = false; S.ok = null; S.order = []; S.choice = null;
  if (!restore) S.cur = freshCur();
  el.innerHTML = `
  <div class="page narrow">
    <div class="row" style="justify-content:space-between"><span class="small muted">${esc(S.opts.title || 'クイズ')} ・ ${S.i + 1} / ${n}</span><button class="btn small ghost" type="button" id="qzQuit">やめる</button></div>
    <div class="progressbar"><i style="width:${S.i / n * 100}%"></i></div>
    <div class="q-card" id="qzCard">
      <div class="q-meta"><span>${esc(q.title)}</span><span id="qzEra">${q.mode === 'year' ? '' : esc(eraText(q))}</span></div>
      ${body(q)}
      <div class="q-actions" id="qzActs"><button class="btn primary" type="button" id="qzGrade">採点する</button><button class="btn" type="button" id="qzSkip">わからない</button></div>
      <div id="qzAfter"></div>
    </div>
  </div>`;
  $('#qzQuit', el).addEventListener('click', finish);
  $('#qzGrade', el).addEventListener('click', () => grade());
  $('#qzSkip', el).addEventListener('click', () => grade(true));
  $('#qzCard', el).addEventListener('input', e => {
    if (S.graded || !/^qa\d+$/.test(e.target.id || '')) return;
    S.cur.inputs[e.target.id] = e.target.value;
    saveSession();
  });
  wireBody(q);
  fillImages(false);
  if (restore) restoreCur(q);
  if (!S.graded) saveSession();
  const first = $('#qzCard input', el); if (first && !S.graded && !matchMedia('(max-width: 859px)').matches) first.focus();
  el.onkeydown = e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
    e.preventDefault();
    if (S.graded) next(); else grade();
  };
}

/** 保存しておいた入力・選択・採点結果を戻す */
function restoreCur(q) {
  const c = S.cur, el = S.el;
  for (const [id, v] of Object.entries(c.inputs || {})) { const inp = el.querySelector(`#${CSS.escape(id)}`); if (inp) inp.value = v; }
  if (q.mode === 'order' && c.order?.length) { S.order = c.order.filter(i => i >= 0 && i < q.events.length); S.drawOrder?.(); }
  if (c.graded) { S.choice = c.choice; setUndo(c.snap); grade(c.skip, true); }
}

// 作品・建築の写真（文化史の出来事に画像の指定があるとき。一問一答は問題の写真の指定）
const img = e => (e?.image ? `<figure class="qimg" data-img-key="${esc(e.key)}"></figure>` : '');
const ichImg = it => (imageOf(S.app.db, it) ? `<figure class="qimg" data-img-ich="${esc(it.id)}"></figure>` : '');
function fillImages(reveal) {
  $$('[data-img-key]', S.el).forEach(f => {
    const x = S.app.db.byKey.get(f.dataset.imgKey);
    if (x) fillImage(f, x, { reveal }); else f.remove();
  });
  $$('[data-img-ich]', S.el).forEach(f => {
    const x = imageOf(S.app.db, S.app.db.ichimon?.byId.get(f.dataset.imgIch));
    if (x) fillImage(f, x, { reveal }); else f.remove();
  });
}

function body(q) {
  const db = S.app.db;
  switch (q.mode) {
    case 'cross':
      return `<p class="q-text"><span class="yr">${yearText(q.y)}</span>ごろ（前後${q.w}年）、次の地域では何が起きていた？ 出来事・王朝・人物のどれでもよい。いくつ書いてもOK（「、」で区切る）。</p>` +
        q.groups.map((g, i) => `<div class="q-field"><label for="qa${i}">${esc(g.name)}</label><input type="text" id="qa${i}" autocomplete="off" enterkeyhint="next"><div class="res" id="qr${i}" aria-live="polite"></div></div>`).join('');
    case 'ruler':
      if (q.one) {
        const p = q.polities[0];
        return `<p class="q-text"><span class="yr">${yearText(q.y)}</span>の<b>${tt(p, db.nameAt(p, q.y))}</b>の君主（指導者）は？</p>` +
          '<div class="q-field"><label for="qa0">君主・指導者</label><input type="text" id="qa0" autocomplete="off"><div class="res" id="qr0" aria-live="polite"></div></div>';
      }
      return `<p class="q-text"><span class="yr">${yearText(q.y)}</span>の、次の国の君主（指導者）は？</p>` +
        q.polities.map((p, i) => `<div class="q-field"><label for="qa${i}">${tt(p, db.nameAt(p, q.y))}</label><input type="text" id="qa${i}" autocomplete="off"><div class="res" id="qr${i}" aria-live="polite"></div></div>`).join('');
    case 'year': {
      const e = q.event;
      // 「20世紀を代表する」のような世紀も答えのヒントになるので、採点まで伏せる（採点後に data-full で戻す）
      const hide = s => hideYear(s, e.year).replace(/前?\d+世紀/g, '〇〇世紀');
      return `${img(e)}<p class="q-text">「<b class="tt q-title" data-term="${esc(e.key)}" data-full="${esc(e.title)}">${esc(hide(e.title))}</b>」${e.end ? 'が始まったの' : ''}は何年？</p>${e.desc ? `<p class="q-hint"${hide(e.desc) !== e.desc ? ` data-full="${esc(e.desc)}"` : ''}>${esc(hide(e.desc))}</p>` : ''}
        <div class="q-field"><label for="qa0">年（紀元前は「前221」のように）</label><input type="text" id="qa0" inputmode="numeric" autocomplete="off"><div class="res" id="qr0" aria-live="polite"></div></div>`;
    }
    case 'term': {
      const e = q.event, regs = e.regions.map(r => db.regionById(r)?.name || r).join('・');
      return `${img(e)}<p class="q-text"><span class="yr">${e.end ? `${fmtYear(e.year)}〜${fmtYear(e.end)}` : fmtYear(e.year)}年</span>（${esc(regs)}）</p><p class="q-hint" data-full="${esc(e.desc)}">${esc(hideAnswers(e.desc, e))}</p>
        <div class="q-field"><label for="qa0">この出来事の名前は？</label><input type="text" id="qa0" autocomplete="off"><div class="res" id="qr0" aria-live="polite"></div></div>`;
    }
    case 'order':
      return `<p class="q-text">次の4つを<b>古い順</b>にタップしてください。</p><div class="order-list" id="qzOrder">${q.events.map((e, i) => `<button type="button" data-i="${i}"><span class="n"></span><span>${esc(e.title)}<br><span class="meta">${esc(e.regions.map(r => db.regionById(r)?.name || r).join('・'))}</span></span></button>`).join('')}</div><button class="btn small" type="button" id="qzOrderReset">やり直す</button><div class="res" id="qr0"></div>`;
    case 'work': {
      // 作品を見せて作者を答える（by）か、作者を見せて作品名を答える（title）。写真は答えが見えるので採点のあとに出す
      const e = q.event, regs = e.regions.map(r => db.regionById(r)?.name || r).join('・');
      const when = `<span class="yr">${e.end ? `${fmtYear(e.year)}〜${fmtYear(e.end)}` : fmtYear(e.year)}年</span>（${esc(regs)}）`;
      const ask = q.ask === 'title'
        ? `<b>${esc(workBy(e))}</b>の作品は？`
        : `<b>${esc(workTitle(e))}</b>${isBuilding(e) ? 'を手がけた人物' : 'の作者'}は？`;
      const hint = hintText(e, q.ask);
      return `<p class="q-text">${when}<br>${ask}</p>${e.desc ? `<p class="q-hint"${hint !== e.desc ? ` data-full="${esc(e.desc)}"` : ''}>${esc(hint)}</p>` : ''}
        <div class="q-field"><label for="qa0">${q.ask === 'title' ? '作品名' : '作者'}</label><input type="text" id="qa0" autocomplete="off"><div class="res" id="qr0" aria-live="polite"></div></div>`;
    }
    case 'ichimon': {
      // 本の版は、四角の空欄【】のほかに問題文の赤字〈〉も空欄にする（赤字の空欄は赤い下線）。写真は作品名を伏せて先に出す
      const it = q.item, ps = ichParts(it.text), red = new Set(ps.filter(p => p.red).map(p => p.i));
      const sentence = ps.map(p => (p.s != null ? esc(p.s) : `<span class="blank${p.red ? ' red' : ''}" data-b="${p.i}">（${NUM[p.i] || p.i + 1}）</span>`)).join('');
      const free = (it.free || []).map(g => `${g.map(i => NUM[i] || i + 1).join('・')}は順不同`).join('、');
      const stars = it.stars != null ? ` <span class="ich-st" title="本の重要度">${it.stars ? '★'.repeat(it.stars) : '★なし'}</span>` : '';
      // 赤字の空欄はヒント：答えても答えなくてもよく、○×（と復習）には入れない。ボタンで全部・1つずつ出せる（文の赤字の空欄を押しても出る）
      const reds = red.size ? `<div class="red-tools"><span class="small muted">赤い下線の空欄は問題文の赤字（ヒント。○×には入りません）</span>
        <span class="row"><button class="btn small" type="button" id="qzRedOne">赤字を1つ出す</button><button class="btn small" type="button" id="qzRedAll">赤字をすべて出す</button></span></div>` : '';
      return `${ichImg(it)}<p class="q-src">${esc(it.sec)}${stars}</p><p class="q-text ich-text">${sentence}</p>` +
        reds + (free ? `<p class="small muted">${esc(free)}</p>` : '') +
        it.answers.map((a, i) => `<div class="q-field${red.has(i) ? ' red-field' : ''}"><label for="qa${i}">${NUM[i] || i + 1}${red.has(i) ? '<small class="red-mark">赤字・答えなくてもよい</small>' : ''}</label><input type="text" id="qa${i}" autocomplete="off" enterkeyhint="${i + 1 < it.answers.length ? 'next' : 'done'}"><div class="res" id="qr${i}" aria-live="polite"></div></div>`).join('');
    }
    case 'choice': {
      const a = q.anchor;
      const what = q.spec.kind === 'ruler' ? '君主（人物）' : a.culture && q.answer?.culture ? '文化' : '出来事';
      return `${img(a)}<p class="q-text">「<b>${tt(a)}</b>」${hasYear(a.title, a.year) ? '' : `（${yearText(a.year)}）`}と同じころ、<b>${esc(q.group.name)}</b>の${what}はどれ？</p><div class="choices" id="qzChoices">${q.options.map((o, i) => `<button type="button" data-i="${i}">${esc(itemName(o))}</button>`).join('')}</div><div class="res" id="qr0"></div>`;
    }
  }
  return '';
}

/** 一問一答の赤字の空欄を出す（i を出す。出したものは S.cur.reveal に覚えておき、再開しても出したまま） */
function revealRed(q, i, save = true) {
  const el = S.el, it = q.item, b = $(`.blank.red[data-b="${i}"]`, el);
  if (!b || b.classList.contains('shown')) return;
  b.textContent = it.answers[i]; b.classList.add('shown');
  const inp = $(`#qa${i}`, el); if (inp && !S.graded) { inp.value = ''; inp.disabled = true; inp.placeholder = `表示した：${it.answers[i]}`; }
  delete S.cur.inputs[`qa${i}`];
  if (!S.cur.reveal.includes(i)) S.cur.reveal.push(i);
  const left = $$('.blank.red:not(.shown)', el).length;
  for (const id of ['#qzRedOne', '#qzRedAll']) { const btn = $(id, el); if (btn) btn.disabled = !left; }
  if (save) saveSession();
}

function wireBody(q) {
  const el = S.el;
  if (q.mode === 'ichimon' && $('.blank.red', el)) {
    const reds = () => $$('.blank.red', el).map(b => Number(b.dataset.b));
    $('#qzRedOne', el)?.addEventListener('click', () => { const i = reds().find(i => !S.cur.reveal.includes(i)); if (i != null) revealRed(q, i); });
    $('#qzRedAll', el)?.addEventListener('click', () => reds().forEach(i => revealRed(q, i)));
    $('.ich-text', el).addEventListener('click', e => {
      const b = e.target.closest('.blank.red:not(.shown)');
      if (!b || S.graded) return;
      e.stopPropagation(); revealRed(q, Number(b.dataset.b));
    });
    for (const i of S.cur.reveal || []) revealRed(q, i, false);
  }
  if (q.mode === 'order') {
    S.order = [];
    S.drawOrder = () => $$('#qzOrder button', el).forEach(b => {
      const k = S.order.indexOf(Number(b.dataset.i));
      b.classList.toggle('picked', k >= 0); $('.n', b).textContent = k >= 0 ? k + 1 : '';
    });
    $('#qzOrder', el).addEventListener('click', e => {
      if (S.graded) return;
      const b = e.target.closest('[data-i]'); if (!b) return;
      e.stopPropagation(); // 答えを選んだタップで、すぐに用語の概要が開かないように
      const i = Number(b.dataset.i);
      if (S.order.includes(i)) S.order = S.order.filter(x => x !== i); else S.order.push(i);
      S.drawOrder();
      S.cur.order = [...S.order]; saveSession();
      if (S.order.length === 4) grade();
    });
    $('#qzOrderReset', el).addEventListener('click', () => { if (!S.graded) { S.order = []; S.drawOrder(); S.cur.order = []; saveSession(); } });
  }
  if (q.mode === 'choice') {
    $('#qzChoices', el).addEventListener('click', e => {
      if (S.graded) return;
      const b = e.target.closest('[data-i]'); if (!b) return;
      e.stopPropagation(); // 答えを選んだタップで、すぐに用語の概要が開かないように
      S.choice = Number(b.dataset.i); grade();
    });
    $('#qzGrade', el).hidden = true;
  }
}

// ---- 採点（replay = 再開したときに、記録し直さずに結果だけ表示する）
function grade(skip = false, replay = false) {
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
        if (cls === 3) return { lv: best.m.how === 'fuzzy' ? 2 : 3, html: `<span class="v">${best.m.how === 'fuzzy' ? '○ ほぼ正解' : '○ 正解'}</span>${tt(it.ref, it.name)}（${it.label}・${when}）${badges(it.ref, { culture: false })}${best.m.how === 'fuzzy' ? `<br>表記を確認：正しくは「${esc(it.name)}」` : ''}` };
        return { lv: 1, html: `<span class="v">△ ${CLS_TEXT[cls]}</span>「${tt(it.ref, it.name)}」は${esc(where)}の${it.label}（${when}）` };
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
      const ans = right.map(r => `${tt(r)}（${fmtSpan(r.from, r.to)}）`).join('、');
      if (res?.cls === 3) { setRes(i, 'ok', `<div><span class="v">${res.best.m.how === 'fuzzy' ? '○ ほぼ正解' : '○ 正解'}</span>${ans}</div>`); return true; }
      const why = res?.best ? `「${tt(res.best.it.ref, res.best.it.name)}」は${spanText(res.best.it)}（${esc(res.best.it.regions.map(r => db.regionById(r)?.name || r).join('・'))}）` : (res ? `「${esc(res.input)}」はデータに見つかりません` : '未回答');
      setRes(i, res?.best ? 'half' : 'ng', `<div><span class="v">${res?.best ? '△ ちがう人物' : '×'}</span>${why}</div><span class="also">正解：${ans}</span>`);
      return false;
    });
    ok = verdicts.every(Boolean);
    if (q.one) $('#qr0', el)?.insertAdjacentHTML('beforeend', rulerLine(db, q));
  } else if (q.mode === 'year') {
    const e = q.event, r = gradeYear(val(0), e);
    ok = !!r.ok;
    if (!r.valid) setRes(0, 'ng', `<div><span class="v">×</span>正解は <b class="yr">${yearText(e.year)}</b>${e.memo ? `（メモ：${esc(e.memo)}）` : ''}</div>`);
    else if (r.ok) setRes(0, 'ok', `<div><span class="v">○ 正解</span><b class="yr">${yearText(e.year)}</b>${badges(e, { culture: false })}</div>`);
    else setRes(0, r.close ? 'half' : 'ng', `<div><span class="v">${r.close ? '△ 惜しい' : '×'}</span>${r.diff > 0 ? `${r.diff}年おそい` : `${-r.diff}年はやい`}。正解は <b class="yr">${yearText(e.year)}</b>${badges(e, { culture: false })}</div>`);
  } else if (q.mode === 'term') {
    const e = q.event, r = gradeTerm(db, val(0), e, strict);
    ok = r.ok;
    if (r.ok) setRes(0, 'ok', `<div><span class="v">${r.how === 'fuzzy' ? '○ ほぼ正解' : '○ 正解'}</span>${tt(e)}${badges(e, { culture: false })}</div>`);
    else {
      const other = r.other ? `<div>「${tt(r.other.it.ref, r.other.it.name)}」は${spanText(r.other.it)}の${r.other.it.label}です。</div>` : '';
      setRes(0, 'ng', `<div><span class="v">×</span>正解は「<b>${tt(e)}</b>」${e.answers.length ? `（${e.answers.map(esc).join('、')}）` : ''}</div>${other}${r.input ? `<button class="btn small" type="button" data-self="0" data-text="${esc(r.input)}">正解にする</button>` : ''}`);
    }
  } else if (q.mode === 'work') {
    const e = q.event, r = gradeWork(db, val(0), e, q.ask, strict);
    ok = r.ok;
    const ans = q.ask === 'title' ? workTitle(e) : workBy(e);
    const src = `<div class="small">${tt(e)}（${yearText(e.year)}）${badges(e, { culture: false })}</div>`;
    if (r.ok) {
      const also = r.also ? `<br>${q.ask === 'title' ? `同じ作者の${esc(workTitle(r.also))}（${yearText(r.also.year)}）も正解にしました。この問題の作品は${esc(ans)}です。` : `${esc(workTitle(r.also))}は${esc(workBy(r.also))}の作品にもあるので正解にしました。この問題は${esc(ans)}です。`}` : '';
      setRes(0, 'ok', `<div><span class="v">${r.how === 'fuzzy' ? '○ ほぼ正解' : '○ 正解'}</span><b>${esc(ans)}</b>${r.how === 'fuzzy' ? `<br>表記を確認：正しくは「${esc(ans)}」` : ''}${also}</div>${src}`);
    } else {
      const wrong = r.wrong?.length ? `<div>${q.ask === 'title'
        ? `「${esc(r.input)}」は${r.wrong.map(x => `${esc(workBy(x))}の作品（${yearText(x.year)}）`).join('、')}です。`
        : `「${esc(r.input)}」は${r.wrong.map(x => esc(workTitle(x))).join('')}の作者です。`}</div>` : '';
      setRes(0, 'ng', `<div><span class="v">${r.input ? '×' : '未回答'}</span>正解は「<b>${esc(ans)}</b>」</div>${src}${wrong}${r.input && !r.wrong?.length ? `<button class="btn small" type="button" data-self="0" data-text="${esc(r.input)}">正解にする</button>` : ''}`);
    }
    // 同じ作者のほかの作品（データにあるもの）
    const more = otherWorks(db, e);
    if (more.length) $('#qr0', el)?.insertAdjacentHTML('beforeend', `<div class="small muted">${esc(workBy(e))}のほかの作品：${more.map(x => `${tt(x, workTitle(x))}（${yearText(x.year)}）`).join('、')}</div>`);
  } else if (q.mode === 'order') {
    const right = q.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.year - b.e.year || (a.e.month || 0) - (b.e.month || 0)).map(x => x.i);
    ok = !skip && S.order.length === 4 && S.order.every((v, k) => q.events[v].year === q.events[right[k]].year);
    setRes(0, ok ? 'ok' : 'ng', `<div><span class="v">${ok ? '○ 正解' : '×'}</span>古い順：</div>${right.map((i, k) => `<div>${k + 1}. <span class="yr">${fmtYear(q.events[i].year)}</span> ${tt(q.events[i])}</div>`).join('')}`);
  } else if (q.mode === 'ichimon') {
    // すべての空欄（赤字の空欄も）が合っていたら正解。順不同の組は入れかわってもよい
    const it = q.item, redIdx = new Set(ichParts(it.text).filter(p => p.red).map(p => p.i));
    const res = gradeItem(it.answers, it.answers.map((_, i) => val(i)), it.free, strict);
    const verdicts = res.map(({ m, a }, i) => {
      const b = $(`.blank[data-b="${i}"]`, el);
      if (redIdx.has(i)) {
        // 赤字の空欄は○×に入れない（書いていればその結果だけ見せる）
        const shown = (S.cur.reveal || []).includes(i), wrote = val(i).trim();
        if (b) { b.textContent = a; b.classList.add(m ? 'ok' : shown || !wrote ? 'shown' : 'ng'); if (!isDateAnswer(a)) { b.classList.add('tt'); b.dataset.word = a; b.dataset.ich = it.id; } }
        setRes(i, m ? 'ok' : 'info', `<div><span class="v">${m ? '○' : shown ? '表示した' : wrote ? '×' : '赤字'}</span>${ichWord(it, a, 'ans')}<span class="small muted">（赤字は○×に入れません）</span></div>`);
        return true;
      }
      if (b) {
        b.textContent = a; b.classList.add(m ? 'ok' : 'ng');
        // 採点のあとは、答えの語をタップすると概要（アプリのデータにある語なら）
        if (!isDateAnswer(a)) { b.classList.add('tt'); b.dataset.word = a; b.dataset.ich = it.id; }
      }
      if (m) setRes(i, 'ok', `<div><span class="v">${m.how === 'fuzzy' ? '○ ほぼ正解' : '○ 正解'}</span>${ichWord(it, a, 'ans')}${m.how === 'fuzzy' ? `<br>表記を確認：正しくは「${esc(a)}」` : ''}</div>`);
      else setRes(i, 'ng', `<div><span class="v">${val(i).trim() ? '×' : '未回答'}</span>正解は「${ichWord(it, a, 'ans')}」</div>`);
      return !!m;
    });
    ok = verdicts.every(Boolean);
  } else if (q.mode === 'choice') {
    const ansIdx = q.options.indexOf(q.answer);
    ok = !skip && S.choice === ansIdx;
    $$('#qzChoices button', el).forEach((b, i) => {
      const o = q.options[i];
      b.classList.toggle('right', i === ansIdx); b.classList.toggle('wrong', i === S.choice && i !== ansIdx);
      // 人物にも title（称号）があるので、出来事かどうかは kind で見分ける
      const isEv = o.kind === 'event', [a, z] = S.app.db.recordSpan(o);
      b.innerHTML = isEv && hasYear(o.title, o.year) ? esc(o.title) : `${esc(itemName(o))} <span class="small muted">（${isEv ? spanText({ spans: [[a, z ?? a]] }) : fmtSpan(a, z)}）</span>`;
    });
    setRes(0, ok ? 'ok' : 'ng', `<div><span class="v">${ok ? '○ 正解' : '×'}</span>「${tt(q.answer)}」</div>`);
  }
  S.graded = true;
  if (replay) {
    S.ok = S.cur.ok ?? ok;
  } else {
    S.ok = ok;
    S.results.push({ q, ok });
    recordWithUndo(q, ok);
    S.cur.snap = getUndo();
  }
  Object.assign(S.cur, { graded: true, skip, ok: S.ok, choice: S.choice ?? null, order: [...(S.order || [])] });
  saveSession();
  $('#qzCard', el)?.classList.add('graded');
  if (q.mode === 'year') { const era = $('#qzEra', el); if (era) era.textContent = eraText(q); }
  after(q, S.ok);
}

/** 1つの国だけの君主の問題：採点のあとに、その国の前後10年の出来事（名前が出てこない同じ地域の出来事は分けて出す） */
function countryPanel(db, q) {
  const p = q.polities[0], name = db.nameAt(p, q.y), r = countryEvents(db, p, q.y, 10);
  const when = e => (e.end && e.end !== e.year ? fmtSpan(e.year, e.end) : fmtYear(e.year));
  const list = (evs, total, cls = '') => `<ul${cls ? ` class="${cls}"` : ''}>${evs.map(e => `<li><b>${esc(when(e))}</b><span>${tt(e)}</span></li>`).join('')}${total > evs.length ? `<li><b></b><span class="small muted">ほか${total - evs.length}件</span></li>` : ''}</ul>`;
  return `<div class="yoko cev">
    <h4>${esc(name)}の出来事（${fmtYear(r.from)}〜${fmtYear(r.to)}年・前後10年）</h4>
    ${r.own.length ? list(r.own, r.ownTotal) : `<p class="small muted">この期間に${esc(name)}の名前が出てくる出来事は、データにありません。</p>`}
    ${r.region.length ? `<h4>同じ地域（${esc(db.regionById(p.region)?.name || '')}）のそのほかの出来事</h4>${list(r.region, r.regionTotal, 'sub')}` : ''}
  </div>`;
}

/** 1つの国だけの君主の問題：出題した期間のその国の君主・指導者を在位の順に（正解の人は太字。前後3人まで） */
function rulerLine(db, q) {
  const p = q.polities[0], list = rulersIn(db, p, q.one.from, q.one.to);
  const hit = list.map((r, i) => (r.from <= q.y && q.y <= r.to ? i : -1)).filter(i => i >= 0);
  if (list.length < 2 || !hit.length) return '';
  const a = Math.max(0, hit[0] - 3), b = Math.min(list.length, hit[hit.length - 1] + 4);
  const items = list.slice(a, b).map((r, k) => { const t = `${tt(r)}（${fmtSpan(r.from, r.to)}）`; return hit.includes(a + k) ? `<b>${t}</b>` : t; });
  return `<span class="also">在位の順（${fmtYear(q.one.from)}〜${fmtYear(q.one.to)}年）：${a > 0 ? '…・' : ''}${items.join('・')}${b < list.length ? '・…' : ''}</span>`;
}

const spanText = it => it.spans.map(([a, b]) => (a === b ? `${fmtYear(a)}年` : `${fmtYear(a)}〜${fmtYear(b)}年`)).join('、');

function examples(db, regions, y, w) {
  const evs = db.events.filter(e => e.regions.some(r => regions.includes(r)) && e.year <= y + w && (e.end ?? e.year) >= y - w)
    .sort((a, b) => b.importance - a.importance || Math.abs(a.year - y) - Math.abs(b.year - y)).slice(0, 4)
    .map(e => (hasYear(e.title, e.year) ? tt(e) : `${tt(e)}（${fmtYear(e.year)}）`));
  const seen = new Set(), pols = [];
  for (const { polity, child } of regions.flatMap(r => db.politiesIn(r, y))) {
    const x = child || polity, name = child?.name || db.nameAt(polity, y);
    if (seen.has(name)) continue;
    seen.add(name); pols.push(tt(x, name));
  }
  return [...evs, ...pols].slice(0, 6);
}

function after(q, ok) {
  const { app, el } = S;
  $('#qzActs', el).innerHTML = `
    <button class="btn primary" type="button" id="qzNext">${S.i + 1 < S.questions.length ? '次へ' : '結果を見る'}</button>
    <button class="btn" type="button" id="qzFlip">${ok ? 'まちがいにする' : '正解にする'}</button>
    <button class="btn" type="button" id="qzStar">${ICON.star.replace('<svg', '<svg width="16" height="16"')}${isStarred(q.key) ? '苦手に登録済み' : '苦手に追加'}</button>`;
  // 解答後は、問題文・選択肢の用語をタップすると概要が出る
  $$('.q-title, .q-hint[data-full]', el).forEach(b => { b.textContent = b.dataset.full; });
  $$('#qzChoices button', el).forEach((b, i) => { const o = q.options?.[i]; if (o?.key) { b.classList.add('tt'); b.dataset.term = o.key; } });
  $$('#qzOrder button', el).forEach((b, i) => { const e = q.events?.[i]; if (e?.key) { b.classList.add('tt'); b.dataset.term = e.key; } });
  fillImages(true);
  const [ra, rb] = app.db.range;
  const inRange = q.y != null && q.y >= ra && q.y <= rb;
  const src = q.mode === 'ichimon' ? `<p class="small muted">${ichSource(q.item)}${q.item.yq ? '' : ' ・ 年代は前後の問題からの推定'}</p>` : '';
  $('#qzAfter', el).innerHTML = q.mode === 'ichimon'
    ? `${ichNotes(q.item)}<p class="tt-hint">答えの語をタップすると、概要が見られます（アプリのデータにない語は、世界史の窓で調べられます）。</p>${src}${inRange ? yokoPanel(app, q.y, 5, q.regions || []) : ''}`
    : `${q.mode === 'work' ? img(q.event) : ''}<p class="tt-hint">点線の下線がある用語をタップすると、1〜2文の概要が見られます。</p>${q.one ? countryPanel(app.db, q) : ''}${yokoPanel(app, q.y, 5, q.regions || [])}`;
  if (q.mode === 'work') fillImages(true);
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

/** 一問一答の補足（◆・☞・▲。中の〈赤字〉は太字にする。採点のあとに出す） */
function ichNotes(it) {
  const notes = it.notes || [];
  const guess = it.guess ? '<p class="small muted">この問題の文には、本の写真から読み取りにくく、前後から推定した所があります。</p>' : '';
  if (!notes.length) return guess;
  const fmt = n => esc(n).replace(/〈(.+?)〉/g, '<b class="ich-red">$1</b>');
  return `<ul class="ich-notes">${notes.map(n => `<li>${fmt(n)}</li>`).join('')}</ul>${guess}`;
}
/** 一問一答の出どころ（音声版はファイルと時刻、本の版は大学名・ページ） */
const ichSource = it => [it.audio ? `${esc(it.audio)} ・ ${clock(it.t)}ごろ` : '', it.src ? `出題：${esc(it.src)}` : '', it.page ? `本のp.${it.page}` : ''].filter(Boolean).join(' ・ ');

function flip(q, quiet = false) {
  S.ok = !S.ok;
  if (S.results.length) S.results[S.results.length - 1].ok = S.ok;
  changeJudgement(q, S.ok);
  S.cur.ok = S.ok; S.cur.snap = getUndo();
  saveSession();
  const b = $('#qzFlip', S.el); if (b) b.textContent = S.ok ? 'まちがいにする' : '正解にする';
  if (!quiet) toast(S.ok ? '正解として記録しました' : 'まちがいとして記録し、復習リストに入れました');
}

function next() {
  S.i++;
  if (S.i >= S.questions.length) finish(); else show();
}

function finish() {
  const { app, el } = S;
  remove(SKEY);
  el.onkeydown = null;
  const done = S.results || [], right = done.filter(r => r.ok).length;
  el.innerHTML = `
  <div class="page narrow">
    <h1 class="page-title">結果</h1>
    <div class="panel row" style="justify-content:space-between">
      <div><div class="score-big">${right}<small style="font-size:.4em"> / ${done.length}</small></div><div class="small muted">まちがえた問題は復習リストに入りました</div></div>
      <div class="q-actions">${S.opts?.again ? '<button class="btn primary" type="button" id="qzAgain">同じ条件でもう一度</button>' : ''}<a class="btn" href="#review">復習へ</a><button class="btn" type="button" id="qzSetup">設定を変える</button></div>
    </div>
    <ul class="result-list">${done.map(r => `<li><span class="${r.ok ? 'mark-ok' : 'mark-ng'}">${r.ok ? '○' : '×'}</span><span>${esc(titleOf(r.q))}</span></li>`).join('') || '<li><span></span><span class="muted">解答した問題はありません</span></li>'}</ul>
  </div>`;
  $('#qzSetup', el).addEventListener('click', () => setup());
  $('#qzAgain', el)?.addEventListener('click', () => {
    const qs = makeSession(app.db, { ...S.opts.again, window: 5, done: S.opts.again.skipDone ? answered() : null });
    if (qs.length) begin(qs, S.opts); else setup();
  });
}

function titleOf(q) {
  switch (q.mode) {
    case 'cross': return `${q.y}年ごろの${q.groups.map(g => g.name).join('・')}`;
    case 'ruler': return `${q.y}年の${q.polities.map(p => p.name).join('・')}の君主`;
    case 'year': return hasYear(q.event.title, q.event.year) ? q.event.title : `${q.event.title}（${fmtYear(q.event.year)}年）`;
    case 'term': return `${fmtYear(q.event.year)}年：${q.event.title}`;
    case 'work': return `${q.ask === 'title' ? `${workBy(q.event)}の作品` : `${workTitle(q.event)}の作者`}：${q.event.title}`;
    case 'order': return `並べ替え：${q.events.map(e => e.title).join('／')}`;
    case 'choice': return `${q.anchor.title}と同じころの${q.group.name}：${itemName(q.answer)}`;
    case 'ichimon': return `一問一答：${(q.item.box || q.item.answers).join('・')}`;
  }
  return q.key;
}

export { shuffle, quizGroups };
