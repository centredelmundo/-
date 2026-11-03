#!/usr/bin/env node
// データ（data/）の点検。
// JSON の書き間違い・id の重複・地域やゾーンや国の参照・年の前後・フラグの書き方などを調べる。
//
//   node tools/validate.mjs            … data/ を点検（エラーがあると終了コード 1）
//   node tools/validate.mjs 別のフォルダ  … そのフォルダを点検
//
// 「エラー」は直さないとアプリが正しく動かないもの、「注意」は念のため確かめてほしいもの。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DB, locateJsonError } from '../js/core/data.js';
import { parseImageSpec } from '../js/core/wiki.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const asArray = v => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isInt = v => Number.isInteger(v);
const TERRITORY_KEYS = new Set(['year', 'add', 'vassal', 'contested', 'colony', 'remove', 'note', 'uncertain']);

function readJson(dir, file, errors) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, file), 'utf8');
  } catch {
    errors.push(`${file}：ファイルが見つかりません（manifest.json の書き方を確かめてください）`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    const loc = locateJsonError(text);
    errors.push(`${file}：${loc ? `${loc.line}行目 ${loc.col}文字目あたり … ${loc.message}` : 'JSON の書式に誤りがあります'}`);
    return null;
  }
}

/** data/ を読み、アプリと同じ形のデータ（まだ index() する前）を作る */
export function readData(dir = DATA) {
  const errors = [];
  const manifest = readJson(dir, 'manifest.json', errors);
  if (!manifest) return { db: null, errors };
  const read = f => (f ? readJson(dir, f, errors) : null);
  const list = (files, kind) => asArray(files).flatMap(f => {
    const d = read(f);
    if (d == null) return [];
    if (!Array.isArray(d)) { errors.push(`${f}：中身は [ と ] で囲んだ一覧にします`); return []; }
    return d.map((x, i) => ({ ...x, _file: f, _index: i, kind }));
  });
  const db = new DB();
  db.base = dir;
  db.manifest = manifest;
  db.config = read(manifest.config) || {};
  const regions = read(manifest.regions) || {};
  db.regions = asArray(regions.regions).map(r => ({ ...r }));
  db.groups = asArray(regions.groups);
  db.zones = read(manifest.zones);
  db.polities = list(manifest.polities, 'polity');
  db.rulers = list(manifest.rulers, 'ruler');
  db.events = list(manifest.events, 'event');
  db.overrides = {};
  return { db, errors };
}

/** 読みこんで index() まで済ませたデータ（テストなどで使う） */
export function openDB(dir = DATA) {
  const { db, errors } = readData(dir);
  if (db) db.index();
  return { db, errors };
}

/** 点検する。{ errors, warnings, stats } を返す */
export function validate(dir = DATA) {
  const { db, errors } = readData(dir);
  const warnings = [];
  if (!db) return { errors, warnings, stats: null };
  const label = x => `${x._file}：${x.title || x.name || x.id || `${x._index + 1}番目`}`;
  const E = (x, m) => errors.push(`${label(x)} … ${m}`);
  const W = (x, m) => warnings.push(`${label(x)} … ${m}`);

  // ---- フラグ（すべての項目に共通）
  const flags = x => {
    for (const k of ['verified', 'uncertain']) {
      if (!(k in x)) W(x, `${k} がありません（false とみなします）`);
      else if (typeof x[k] !== 'boolean') E(x, `${k} は true か false にします（"" で囲まない）`);
    }
    if (x.memo != null && typeof x.memo !== 'string') E(x, 'memo は文字列（" " で囲む）にします');
    // 概要（1〜2文）とその確認の印
    if (x.desc != null && typeof x.desc !== 'string') E(x, 'desc（概要）は文字列にします');
    if (!('descVerified' in x)) W(x, 'descVerified（概要の確認済み）がありません（false とみなします）');
    else if (typeof x.descVerified !== 'boolean') E(x, 'descVerified は true か false にします');
    if (x.source != null && !/^https?:\/\//.test(String(x.source))) W(x, 'source は http:// か https:// で始まるURLにします');
    // 作品・建築の写真
    if (x.image != null) {
      if (!parseImageSpec(x.image)) E(x, 'image は "ja:記事名"・"en:記事名"・"File:ファイル名" のどれかの形にします');
      if (typeof x.imageVerified !== 'boolean') E(x, 'image があるときは imageVerified（画像の確認済み）を true か false で書きます');
    }
    if (x.importance != null && ![1, 2, 3].includes(x.importance)) W(x, 'importance は 1・2・3 のどれかにします');
    if (x.verified === true && x.uncertain === true) W(x, '確認済みなのに「要確認」の印が残っています');
  };
  const strings = (x, k) => {
    if (x[k] != null && !asArray(x[k]).every(s => typeof s === 'string' && s.trim())) E(x, `${k} は文字列の一覧にします`);
  };

  // ---- 出来事
  for (const e of db.events) {
    if (!e.id) E(e, 'id がありません');
    if (typeof e.title !== 'string' || !e.title.trim()) E(e, 'title（出来事の名前）がありません');
    if (!isInt(e.year)) E(e, 'year は整数にします（紀元前はマイナス）');
    if (e.end != null && (!isInt(e.end) || e.end < e.year)) E(e, 'end は year 以上の整数にします');
    if (e.month != null && !(isInt(e.month) && e.month >= 1 && e.month <= 12)) E(e, 'month は 1〜12 にします');
    if (!asArray(e.regions).length) E(e, 'regions（地域）がありません');
    if (e.acceptYears != null && !asArray(e.acceptYears).every(isInt)) E(e, 'acceptYears は整数の一覧にします');
    strings(e, 'answers'); strings(e, 'keywords'); strings(e, 'tags');
    flags(e);
  }
  // ---- 王朝・国家
  for (const p of db.polities) {
    if (!p.id) E(p, 'id がありません');
    if (typeof p.name !== 'string' || !p.name.trim()) E(p, 'name がありません');
    if (!p.region && !p.parent) E(p, 'region か parent のどちらかが必要です');
    const periods = p.periods ?? [[p.start, p.end ?? p.start]];
    if (!Array.isArray(periods) || !periods.length || !periods.every(q => Array.isArray(q) && isInt(q[0]) && isInt(q[1]) && q[0] <= q[1])) {
      E(p, p.periods ? 'periods は [[はじめ, おわり], …] の形にします' : 'start と end は整数で、start ≦ end にします');
      continue;
    }
    const first = Math.min(...periods.map(q => q[0])), last = Math.max(...periods.map(q => q[1]));
    if (p.color != null && !/^#[0-9a-fA-F]{6}$/.test(p.color)) W(p, 'color は #RRGGBB の形にします');
    for (const n of asArray(p.names)) if (!Array.isArray(n) || !isInt(n[0]) || typeof n[1] !== 'string') E(p, 'names は [年, "名前"] の一覧にします');
    for (const t of asArray(p.territory)) {
      if (!isInt(t.year)) { E(p, 'territory の year は整数にします'); continue; }
      for (const k of Object.keys(t)) if (!TERRITORY_KEYS.has(k)) W(p, `territory（${t.year}年）の「${k}」は使われません（add / vassal / contested / colony / remove のどれか）`);
      for (const k of ['add', 'vassal', 'contested', 'colony', 'remove']) if (t[k] != null && !asArray(t[k]).every(z => typeof z === 'string')) E(p, `territory（${t.year}年）の ${k} はゾーン名の一覧にします`);
      if (t.year < first || t.year > last) W(p, `territory の ${t.year}年が、国の続いた期間（${first}〜${last}年）の外です`);
    }
    flags(p);
  }
  // ---- 人物
  for (const r of db.rulers) {
    if (!r.id) E(r, 'id がありません');
    if (typeof r.name !== 'string' || !r.name.trim()) E(r, 'name がありません');
    if (!isInt(r.from) || (r.to != null && (!isInt(r.to) || r.to < r.from))) E(r, 'from と to は整数で、from ≦ to にします');
    strings(r, 'aliases');
    flags(r);
  }

  // ---- アプリと同じ方法で索引を作り、参照の切れ・id の重複を調べる（ここで出る指摘はエラー）
  db.index();
  errors.push(...db.warnings);
  const [from, to] = db.range;
  for (const r of db.rulers) {
    const p = db.polityById.get(r.polity);
    if (p && (r.from > p.end || r.to < p.start)) W(r, `在位（${r.from}〜${r.to}年）が「${p.name}」の期間（${p.start}〜${p.end}年）と重なりません`);
  }
  for (const e of db.events) if (e.year < from - 100 || e.year > to) W(e, `${e.year}年は config.json の range（${from}〜${to}年）の外です`);

  // ---- 設定・地域
  const C = db.config;
  if (!Array.isArray(C.range) || C.range.length !== 2 || !(C.range[0] < C.range[1])) errors.push('config.json … range は [はじめの年, おわりの年] にします');
  if (C.defaultYear != null && (C.defaultYear < from || C.defaultYear > to)) errors.push('config.json … defaultYear が range の外です');
  for (const a of asArray(C.anchors)) if (!Array.isArray(a) || !isInt(a[0]) || a[0] < from || a[0] > to) warnings.push(`config.json … anchors の ${JSON.stringify(a)} が range の外か、形がちがいます`);
  for (const row of asArray(C.ganttRows)) {
    for (const it of asArray(row.polities)) {
      const id = Array.isArray(it) ? it[0] : it;
      if (!db.polityById.has(id)) errors.push(`config.json … ganttRows「${row.label}」の ${id} は王朝・国家のデータにありません`);
    }
  }
  const regionIds = new Set();
  for (const r of db.regions) {
    if (!r.id || !r.name) errors.push(`regions.json … 地域に id と name が必要です（${JSON.stringify(r)}）`);
    if (regionIds.has(r.id)) errors.push(`regions.json … 地域の id「${r.id}」が重複しています`);
    regionIds.add(r.id);
  }
  for (const g of db.groups) for (const r of asArray(g.regions)) if (!regionIds.has(r)) errors.push(`regions.json … グループ「${g.name}」の地域「${r}」がありません`);
  if (db.manifest.zones && !Array.isArray(db.zones?.zones)) errors.push('地図のデータ（map/zones.json）が読めません');

  const all = [...db.events, ...db.polities, ...db.rulers];
  const stats = {
    events: db.events.length, culture: db.events.filter(e => e.culture).length,
    polities: db.polities.length, rulers: db.rulers.length,
    verified: all.filter(x => x.verified).length, uncertain: all.filter(x => x.uncertain).length, total: all.length,
    descs: all.filter(x => x.desc).length, descVerified: all.filter(x => x.descVerified).length,
    images: all.filter(x => x.image).length, imageVerified: all.filter(x => x.image && x.imageVerified).length
  };
  return { errors, warnings, stats };
}

// ---- コマンドとして実行したとき
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dir = path.resolve(process.argv[2] || DATA);
  const { errors, warnings, stats } = validate(dir);
  console.log(`データの点検：${path.relative(process.cwd(), dir) || '.'}`);
  if (stats) {
    console.log(`  出来事 ${stats.events}件（うち文化 ${stats.culture}件）・王朝/国家 ${stats.polities}件・人物 ${stats.rulers}件`);
    console.log(`  用語集で確認済み ${stats.verified}/${stats.total}件・要確認の印 ${stats.uncertain}件`);
    console.log(`  概要 ${stats.descs}件（確認済み ${stats.descVerified}件）・作品の写真の指定 ${stats.images}件（確認済み ${stats.imageVerified}件）`);
  }
  for (const m of errors) console.log(`  ✗ ${m}`);
  for (const m of warnings) console.log(`  △ ${m}`);
  console.log(errors.length ? `エラー ${errors.length}件・注意 ${warnings.length}件` : `エラーはありません（注意 ${warnings.length}件）`);
  process.exitCode = errors.length ? 1 : 0;
}
