// データ確認：用語集などで年号・概要・画像を確かめて「確認した」を付ける。修正もここで。
import { $, $$, esc, fmtYear, fmtSpan, download, toast, today, formatJson, debounce } from '../core/util.js';
import { base } from '../core/normalize.js';
import { load, save } from '../core/store.js';
import { OVERRIDE_KEYS } from '../core/data.js';
import { badges } from './common.js';
import { fillImage, ywLink } from './terms.js';

const KIND = { event: '出来事', polity: '王朝・国家', ruler: '人物' };
// 何を確かめるか：年号（用語集）・概要（1〜2文の説明）・画像（文化史の作品・建築の写真）
const TARGET = {
  year: { label: '年号', flag: 'verified', done: '用語集で確認済み', btn: '確認した' },
  desc: { label: '概要', flag: 'descVerified', done: '概要を確認済み', btn: '概要を確認した' },
  image: { label: '画像', flag: 'imageVerified', done: '画像を確認済み', btn: '画像を確認した' }
};
let S = null;
let observer = null;

export function render(app, el, param) {
  S = { app, el, filter: 'todo', kind: 'all', target: 'year', q: '', open: null, limit: 120 };
  if (param) { S.filter = 'all'; S.open = decodeURIComponent(param); }
  el.innerHTML = `
  <div class="page narrow">
    <h1 class="page-title">データ確認 <small>年号・概要・画像を確かめる</small></h1>
    <div class="panel stack">
      <div class="seg" id="dcTarget" role="group" aria-label="確かめるもの">${Object.entries(TARGET).map(([k, t]) => `<button type="button" data-t="${k}">${t.label}</button>`).join('')}</div>
      <div class="row" style="justify-content:space-between"><span id="dcDoneLabel"></span><span><b class="yr" id="dcDone"></b> / <span id="dcAll"></span>件</span></div>
      <div class="dc-bar"><i id="dcBar"></i></div>
      <p class="small muted" id="dcHelp"></p>
    </div>
    <div id="dcNotices"></div>
    <div class="stack">
      <div class="chips" id="dcFilter">
        <button type="button" class="chip" data-f="todo">未確認</button><button type="button" class="chip" data-f="unc">要確認</button><button type="button" class="chip" data-f="done">確認済み</button><button type="button" class="chip" data-f="changed">このブラウザで変更</button><button type="button" class="chip" data-f="all">すべて</button>
      </div>
      <div class="row"><div class="seg" id="dcKind"><button type="button" data-k="all">すべて</button><button type="button" data-k="event">出来事</button><button type="button" data-k="polity">王朝・国家</button><button type="button" data-k="ruler">人物</button></div>
        <input type="search" id="dcSearch" placeholder="語句・年で絞り込み" style="flex:1;min-width:160px" aria-label="語句・年で絞り込み"></div>
    </div>
    <ul class="dc-list" id="dcList"></ul>
    <div class="q-actions" id="dcMoreBox"></div>
    <div class="panel stack" id="dcExport"></div>
  </div>`;
  const root = el.firstElementChild;
  $$('#dcTarget button', root).forEach(c => c.addEventListener('click', () => { S.target = c.dataset.t; if (S.target !== 'year' && S.filter === 'unc') S.filter = 'todo'; S.limit = 120; draw(); }));
  $$('#dcFilter .chip', root).forEach(c => c.addEventListener('click', () => { S.filter = c.dataset.f; S.limit = 120; draw(); }));
  $$('#dcKind button', root).forEach(c => c.addEventListener('click', () => { S.kind = c.dataset.k; S.limit = 120; draw(); }));
  $('#dcSearch', root).addEventListener('input', debounce(e => { S.q = e.target.value; S.limit = 120; draw(); }, 150));
  $('#dcList', root).addEventListener('click', onListClick);
  draw();
  if (S.open) setTimeout(() => $(`[data-key="${CSS.escape(S.open)}"]`, root)?.scrollIntoView({ block: 'center' }), 50);
}

export function destroy() { observer?.disconnect(); observer = null; S = null; }

function records() {
  const db = S.app.db;
  return db.allRecords().slice().sort((a, b) => db.recordYear(a) - db.recordYear(b));
}

/** 今の「確かめるもの」の対象になる項目 */
const inTarget = x => (S.target === 'image' ? !!x.image : S.target === 'desc' ? true : true);

function draw() {
  const { app, el } = S, db = app.db, T = TARGET[S.target];
  const all = records().filter(inTarget);
  const doneN = all.filter(x => x[T.flag]).length;
  $('#dcDoneLabel', el).textContent = T.done;
  $('#dcDone', el).textContent = doneN; $('#dcAll', el).textContent = all.length;
  $('#dcBar', el).style.width = (all.length ? doneN / all.length * 100 : 0) + '%';
  $('#dcHelp', el).innerHTML = S.target === 'year'
    ? 'AIが入れた年代はすべて「未確認」から始まります。<span class="badge b-warn">要確認</span>は、AIが年に自信がない・説が分かれると判断したもの（理由はメモ）。用語集で確かめたら「確認した」を押してください。チェックはこのブラウザに保存され、下の「書き出す」でJSONファイルに反映できます。'
    : S.target === 'desc'
      ? '概要（クイズの解答後に用語をタップすると出る1〜2文の説明）を確かめます。AIが自分の言葉で書いたもので、まだ確認されていません。「世界史の窓で調べる」で照らし合わせ、正しければ「概要を確認した」を、直すときは「修正」を押してください。'
      : '文化史の作品・建築の写真を確かめます。写真と作者・ライセンスは、表示するときに Wikimedia から取得しています。正しい作品・建築の写真なら「画像を確認した」を、ちがう場合は「修正」で記事名（例：ja:落穂拾い (ミレー)）かファイル名（例：File:○○.jpg）を変えてください。';
  $$('#dcTarget button', el).forEach(c => c.classList.toggle('on', c.dataset.t === S.target));
  $$('#dcFilter .chip', el).forEach(c => { c.classList.toggle('on', c.dataset.f === S.filter); c.hidden = c.dataset.f === 'unc' && S.target !== 'year'; });
  $$('#dcKind button', el).forEach(c => c.classList.toggle('on', c.dataset.k === S.kind));
  const q = base(S.q);
  const f = T.flag;
  let list = all.filter(x => (S.kind === 'all' || x.kind === S.kind)
    && (S.filter === 'all' || (S.filter === 'todo' && !x[f]) || (S.filter === 'unc' && x.uncertain && !x[f]) || (S.filter === 'done' && x[f]) || (S.filter === 'changed' && x._changed))
    && (!q || base(db.recordTitle(x)).includes(q) || String(db.recordYear(x)).includes(q) || (S.target === 'desc' && base(x.desc || '').includes(q))));
  if (S.open) list = list.sort((a, b) => (b.key === S.open) - (a.key === S.open));
  const limit = S.target === 'image' ? Math.min(S.limit, 40) : S.limit;
  const shown = list.slice(0, limit);
  $('#dcList', el).innerHTML = shown.map(row).join('') || '<li><span></span><span class="muted">該当するデータはありません</span></li>';
  $('#dcMoreBox', el).innerHTML = list.length > shown.length ? `<button class="btn" type="button" id="dcMore">さらに表示（残り${list.length - shown.length}件）</button>` : '';
  $('#dcMore', el)?.addEventListener('click', () => { S.limit += S.target === 'image' ? 40 : 200; draw(); });
  watchImages();
  const notes = [];
  if (db.errors.length) notes.push(`<div class="notice err">${db.errors.map(esc).join('<br>')}</div>`);
  if (db.warnings.length) notes.push(`<details class="notice warn"><summary>データの注意 ${db.warnings.length}件</summary>${db.warnings.slice(0, 80).map(esc).join('<br>')}</details>`);
  $('#dcNotices', el).innerHTML = notes.join('');
  drawExport();
}

/** 画面に入った行だけ画像を読み込む（Wikimedia への問い合わせを減らす） */
function watchImages() {
  observer?.disconnect();
  const figs = $$('[data-dc-img]', S.el);
  if (!figs.length) return;
  const load1 = f => { f.removeAttribute('data-dc-img'); const x = S.app.db.byKey.get(f.dataset.key); if (x) fillImage(f, x, { reveal: true }); };
  if (!('IntersectionObserver' in window)) { figs.forEach(load1); return; }
  observer = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { observer.unobserve(en.target); load1(en.target); } }), { rootMargin: '200px' });
  figs.forEach(f => observer.observe(f));
}

function row(x) {
  const db = S.app.db, T = TARGET[S.target];
  const [a, b] = db.recordSpan(x);
  const yearTxt = b != null && b !== a ? fmtSpan(a, b) : fmtYear(a);
  const regs = x.kind === 'event' ? x.regions.map(r => db.regionById(r)?.name || r).join('・') : db.regionById(x.region)?.name || '';
  const editing = S.open === x.key && S.editing;
  const on = x[T.flag];
  let extra = '';
  if (S.target === 'desc') extra = `<div class="dc-desc">${x.desc ? esc(x.desc) : '<span class="muted">（概要なし）</span>'}</div><a class="small" href="${ywLink(db.recordTitle(x))}" target="_blank" rel="noopener">世界史の窓で調べる</a>`;
  if (S.target === 'image') extra = `<figure class="qimg dc-img" data-dc-img data-key="${esc(x.key)}"><div class="img-msg">画像を読み込み中…</div></figure><div class="meta">画像の指定：${esc(x.image || '')}</div>`;
  if (S.target === 'year' && x.memo) extra = `<div class="memo">メモ：${esc(x.memo)}</div>`;
  return `<li data-key="${esc(x.key)}"${S.open === x.key ? ' style="background:var(--ai-soft)"' : ''}>
    <span class="y">${yearTxt}</span>
    <span><span>${esc(db.recordTitle(x))}</span>${badges(x)}${x._changed ? '<span class="badge b-gray">変更あり</span>' : ''}<br><span class="meta">${KIND[x.kind]} ・ ${esc(regs)} ・ ${esc(x._file)}</span>${extra}</span>
    <span class="acts"><button class="btn small${on ? ' done' : ''}" type="button" data-act="verify">${on ? '✓ 確認済み' : T.btn}</button><button class="btn small" type="button" data-act="edit">修正</button></span>
    ${editing ? editForm(x) : ''}
  </li>`;
}

function editForm(x) {
  const yearFields = x.kind === 'event' ? [['year', '年'], ['end', '終わりの年（あれば）']] : x.kind === 'polity' ? [['start', '始まり'], ['end', '終わり']] : [['from', '在位の始まり'], ['to', '在位の終わり']];
  return `<div class="edit-form">
    ${yearFields.map(([k, label]) => `<div class="field"><label for="ef-${k}">${label}</label><input type="text" inputmode="numeric" id="ef-${k}" value="${x[k] ?? ''}"></div>`).join('')}
    <label class="check"><input type="checkbox" id="ef-unc" ${x.uncertain ? 'checked' : ''}>要確認の印</label>
    <div class="field wide"><label for="ef-memo">メモ（別の説、用語集のページなど）</label><input type="text" id="ef-memo" value="${esc(x.memo || '')}"></div>
    <div class="field wide"><label for="ef-desc">概要（1〜2文）</label><textarea id="ef-desc" rows="3">${esc(x.desc || '')}</textarea></div>
    ${x.kind === 'event' ? `<div class="field wide"><label for="ef-image">画像の指定（文化史のみ・空欄で画像なし）</label><input type="text" id="ef-image" value="${esc(x.image || '')}" placeholder="ja:記事名 または File:ファイル名.jpg"></div>` : ''}
    <div class="q-actions wide"><button class="btn primary small" type="button" data-act="save">保存</button><button class="btn small" type="button" data-act="cancel">やめる</button>${x._changed ? '<button class="btn small danger" type="button" data-act="revert">このブラウザでの変更を取り消す</button>' : ''}</div>
  </div>`;
}

function onListClick(e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const li = btn.closest('[data-key]'); const key = li.dataset.key;
  const db = S.app.db, x = db.allRecords().find(r => r.key === key);
  if (!x) return;
  const ov = load('verify', {});
  const act = btn.dataset.act;
  if (act === 'verify') {
    const f = TARGET[S.target].flag;
    const o = { ...(ov[key] || {}) };
    o[f] = !x[f]; o.at = today();
    ov[key] = o; x[f] = o[f]; x._changed = true;
    save('verify', ov);
    draw();
  }
  if (act === 'edit') { S.open = key; S.editing = true; draw(); }
  if (act === 'cancel') { S.editing = false; draw(); }
  if (act === 'revert') {
    delete ov[key]; save('verify', ov);
    if (x._original) Object.assign(x, x._original);
    x._changed = false; S.editing = false;
    toast('変更を取り消しました（画面を再読み込みすると完全に元に戻ります）');
    draw();
  }
  if (act === 'save') {
    const o = { ...(ov[key] || {}) };
    const num = id => { const v = $(`#ef-${id}`, li)?.value.normalize('NFKC').trim(); if (v == null) return undefined; if (v === '') return null; const m = v.match(/^(前|-)?(\d{1,4})$/); return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : NaN; };
    for (const k of ['year', 'end', 'start', 'from', 'to']) {
      if (!$(`#ef-${k}`, li)) continue;
      const v = num(k);
      if (Number.isNaN(v)) { toast('年は数字で入れてください（紀元前は「前221」）'); return; }
      if (v !== (x[k] ?? null)) { o[k] = v; x[k] = v; }
    }
    o.uncertain = $('#ef-unc', li).checked; x.uncertain = o.uncertain;
    o.memo = $('#ef-memo', li).value.trim(); x.memo = o.memo;
    const desc = $('#ef-desc', li).value.trim();
    if (desc !== (x.desc || '')) { o.desc = desc || null; x.desc = desc; o.descVerified = false; x.descVerified = false; }
    const imgIn = $('#ef-image', li);
    if (imgIn) {
      const im = imgIn.value.trim();
      if (im !== (x.image || '')) { o.image = im || null; x.image = im || undefined; o.imageVerified = false; x.imageVerified = false; }
    }
    o.at = today();
    ov[key] = o; save('verify', ov); x._changed = true; S.editing = false;
    toast('保存しました。年を変えた場合は、画面を再読み込みすると年表に反映されます');
    draw();
  }
}

/** 変更をJSONファイルとして書き出す */
function drawExport() {
  const db = S.app.db;
  const changed = db.allRecords().filter(x => x._changed);
  const files = [...new Set(changed.map(x => x._file))];
  const box = $('#dcExport', S.el);
  box.innerHTML = `<div class="sec-title"><span>変更をJSONファイルに反映する</span></div>
    ${files.length ? `<p class="small">このブラウザで変更した ${changed.length}件 を含むファイルを書き出します。書き出したファイルで、GitHub上の同じ名前のファイルを置き換えてください（GitHubのファイル画面 → 「Upload files」または鉛筆マークで中身を貼り替え）。置き換えたあとは、このブラウザの変更は消してかまいません。</p>
    <div class="q-actions">${files.map(f => `<button class="btn" type="button" data-file="${esc(f)}">${esc(f)} を書き出す</button>`).join('')}</div>
    <div class="q-actions"><button class="btn small danger" type="button" id="dcClear">このブラウザの変更をすべて消す</button></div>` : '<p class="small muted">まだ変更はありません。</p>'}`;
  $$('[data-file]', box).forEach(b => b.addEventListener('click', () => exportFile(b.dataset.file)));
  $('#dcClear', box)?.addEventListener('click', e => {
    if (e.currentTarget.dataset.sure !== '1') { e.currentTarget.dataset.sure = '1'; e.currentTarget.textContent = 'もう一度押すと消します'; return; }
    save('verify', {}); toast('このブラウザでの変更を消しました。再読み込みします'); setTimeout(() => location.reload(), 900);
  });
}

async function exportFile(file) {
  const db = S.app.db;
  try {
    const res = await fetch(db.base + file, { cache: 'no-cache' });
    const data = await res.json();
    const ov = load('verify', {});
    const has = (v, f) => v === f || (Array.isArray(v) && v.includes(f));
    const kind = has(db.manifest.events, file) ? 'event' : has(db.manifest.rulers, file) ? 'ruler' : 'polity';
    for (const x of data) {
      const o = ov[`${kind}:${x.id}`];
      if (!o) continue;
      for (const k of OVERRIDE_KEYS) {
        if (!(k in o)) continue;
        if (o[k] === null) delete x[k]; else x[k] = o[k];
      }
      if (!x.image) delete x.imageVerified;
    }
    download(file.split('/').pop(), formatJson(data) + '\n');
    toast(`${file} を書き出しました`);
  } catch (err) {
    toast('書き出せませんでした：' + err.message);
  }
}
