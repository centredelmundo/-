// 設定：表示する地域と並び順、採点の厳しさ、表示、学習記録
import { $, $$, esc, toast } from '../core/util.js';
import { resetProgress } from '../core/progress.js';

export function render(app, el) {
  const db = app.db, s = app.settings;
  const order = s.order?.length ? s.order.filter(id => db.regionById(id)) : db.regions.map(r => r.id);
  for (const r of db.regions) if (!order.includes(r.id)) order.push(r.id);
  const counts = { events: db.events.length, polities: db.polities.length, rulers: db.rulers.length, verified: db.allRecords().filter(x => x.verified).length, uncertain: db.allRecords().filter(x => x.uncertain).length };
  el.innerHTML = `
  <div class="page narrow">
    <h1 class="page-title">設定</h1>
    <div class="panel stack">
      <div class="sec-title"><span>表示する地域と並び順</span></div>
      <ul class="list" id="stRegions">${order.map((id, i) => { const r = db.regionById(id); return `<li><span><input type="checkbox" data-id="${id}" ${s.hidden.includes(id) ? '' : 'checked'} aria-label="${esc(r.name)}を表示"></span><span>${esc(r.name)}${r.reference ? '（参考）' : ''}${r.from ? `<span class="small muted">（${r.from}年以降）</span>` : ''}</span><span class="row"><button class="btn small ghost" type="button" data-up="${i}" aria-label="上へ" ${i ? '' : 'disabled'}>↑</button><button class="btn small ghost" type="button" data-down="${i}" aria-label="下へ" ${i < order.length - 1 ? '' : 'disabled'}>↓</button></span></li>`; }).join('')}</ul>
      <div><button class="btn small" type="button" id="stResetOrder">元の並びに戻す</button></div>
    </div>
    <div class="panel stack">
      <div class="sec-title"><span>年表の表示</span></div>
      <label class="check"><input type="checkbox" id="stCulture" ${s.culture ? 'checked' : ''}>文化史（著作・発明・美術など）を表示・出題する</label>
      <div class="field"><span class="label">表示する出来事の重要度</span><div class="seg" id="stImp">${[1, 2, 3].map(n => `<button type="button" data-v="${n}" class="${(s.minImportance || 1) === n ? 'on' : ''}">${'★'.repeat(n)}${n < 3 ? '以上' : 'のみ'}</button>`).join('')}</div></div>
      <div class="field"><span class="label">画面の色</span><div class="seg" id="stTheme">${[['auto', '端末に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']].map(([k, n]) => `<button type="button" data-v="${k}" class="${s.theme === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    </div>
    <div class="panel stack">
      <div class="sec-title"><span>記述式の採点</span></div>
      <div class="seg" id="stStrict"><button type="button" data-v="0" class="${s.strict ? '' : 'on'}">ふつう</button><button type="button" data-v="1" class="${s.strict ? 'on' : ''}">きびしめ</button></div>
      <p class="small muted">ふつう：表記ゆれ（ェ／エ、ヴ／ブ など）と1〜2文字のちがいは正解。きびしめ：表記ゆれだけ許し、1文字でもちがえば×。どちらも、×のあとに「正解にする」で自分で判定を変えられます。</p>
    </div>
    <div class="panel stack">
      <div class="sec-title"><span>データ</span></div>
      <p class="small">出来事 ${counts.events}件・王朝/国家 ${counts.polities}件・人物 ${counts.rulers}件。用語集で確認済み ${counts.verified}件、要確認の印 ${counts.uncertain}件。</p>
      <p class="small muted">データは <code>data/</code> フォルダのJSONファイルです。編集のしかたは <a href="data/README.md" target="_blank" rel="noopener">data/README.md</a> を見てください。</p>
      <div class="q-actions"><a class="btn" href="#data">データ確認を開く</a><button class="btn" type="button" id="stReload">データを読み込み直す</button></div>
    </div>
    <div class="panel stack">
      <div class="sec-title"><span>学習記録</span></div>
      <p class="small">書き出し・読み込みは「復習」画面にあります。</p>
      <div class="q-actions"><a class="btn" href="#review">復習画面へ</a><button class="btn danger" type="button" id="stReset">学習記録を消す</button></div>
    </div>
    <p class="small muted">ヨコ串世界史 v0.1 ・ 地図データ：Natural Earth（パブリックドメイン）</p>
  </div>`;
  const root = el.firstElementChild;
  const persist = () => { app.saveSettings(); };
  $('#stRegions', root).addEventListener('change', e => {
    const id = e.target.dataset.id; if (!id) return;
    s.hidden = e.target.checked ? s.hidden.filter(x => x !== id) : [...s.hidden, id];
    persist();
  });
  $('#stRegions', root).addEventListener('click', e => {
    const up = e.target.closest('[data-up]'), down = e.target.closest('[data-down]');
    if (!up && !down) return;
    const i = Number((up || down).dataset.up ?? (up || down).dataset.down), j = up ? i - 1 : i + 1;
    [order[i], order[j]] = [order[j], order[i]];
    s.order = order.slice(); persist(); render(app, el);
  });
  $('#stResetOrder', root).addEventListener('click', () => { s.order = []; persist(); render(app, el); });
  $('#stCulture', root).addEventListener('change', e => { s.culture = e.target.checked; persist(); });
  const seg = (id, fn) => $$(`#${id} button`, root).forEach(b => b.addEventListener('click', () => { $$(`#${id} button`, root).forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); persist(); }));
  seg('stImp', v => { s.minImportance = Number(v); });
  seg('stTheme', v => { s.theme = v; app.applyTheme(); });
  seg('stStrict', v => { s.strict = v === '1'; });
  $('#stReload', root).addEventListener('click', () => location.reload());
  $('#stReset', root).addEventListener('click', e => {
    const b = e.currentTarget;
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'もう一度押すと消します（元に戻せません）'; return; }
    resetProgress(); toast('学習記録を消しました（データ確認の印はそのまま）'); b.dataset.sure = ''; b.textContent = '学習記録を消す';
  });
}

export function destroy() {}
