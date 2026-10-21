// 問題データの点検: node check-bank.js
// 形式の誤りに加えて、答えを推測できてしまう偏り（○×の○の比率、4択で正解がいちばん長い比率）を科目ごとに表示する
'use strict';
const fs = require('fs');
const path = require('path');

global.window = {};
const dir = path.join(__dirname, 'data');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  new Function('window', fs.readFileSync(path.join(dir, f), 'utf8'))(window);
}

const ids = new Set();
const errors = [];
const rows = {};
for (const b of window.QUIZ_BANK) {
  for (const it of b.items) {
    if (ids.has(it.id)) errors.push('IDの重複: ' + it.id);
    ids.add(it.id);
    if (it.type === 'mc') {
      if (!Array.isArray(it.choices) || it.choices.length < 4) errors.push('選択肢が4つ未満: ' + it.id);
      if (!(it.a >= 0 && it.a < it.choices.length)) errors.push('正解の添字が範囲外: ' + it.id);
      if (it.lv === 2 && (!it.why || it.why.length !== it.choices.length)) errors.push('why の数が選択肢と不一致: ' + it.id);
    }
    if (it.type === 'kw') continue;
    const key = b.id + (it.lv === 2 ? '（本試験レベル）' : '（基礎）');
    const r = rows[key] = rows[key] || { ox: 0, oxTrue: 0, mc: 0, longest: 0, suspects: [] };
    if (it.type === 'ox') { r.ox++; if (it.a) r.oxTrue++; }
    if (it.type === 'mc') {
      r.mc++;
      const L = it.choices.map(c => c.length);
      const others = L.filter((_, i) => i !== it.a);
      const mean = others.reduce((x, y) => x + y, 0) / others.length;
      if (L[it.a] > Math.max(...others)) r.longest++;
      if (L[it.a] > 8 && L[it.a] / mean >= 1.3) r.suspects.push(it.id);
    }
  }
}

const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
console.log('科目（区分）          ○×の○率  4択で正解が最長');
for (const k in rows) {
  const r = rows[k];
  console.log(k.padEnd(20), pct(r.oxTrue, r.ox).padStart(6), pct(r.longest, r.mc).padStart(10),
    r.suspects.length ? '  正解が目立って長い: ' + r.suspects.join(' ') : '');
}
console.log('\n目安：○の比率は40〜60%、正解が最長の比率は25%前後（4択なら偶然でこの程度）。');
if (errors.length) { console.log('\n形式エラー:\n' + errors.join('\n')); process.exit(1); }
console.log('形式エラーなし（' + ids.size + '問）');
