/* ===== 診断士ドリル app.js ===== */
'use strict';

const APP_VERSION = 'v1.0.0';
const STORE_KEY = 'shindanshi-drill-v1';

/* ---------- 日付ユーティリティ ---------- */
const DAY = 86400000;
function ymd(d){
  const t = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return t.toISOString().slice(0,10);
}
function today(){ return ymd(new Date()); }
function addDays(dateStr, n){
  const [y,m,d] = dateStr.split('-').map(Number);
  return ymd(new Date(y, m-1, d + n));
}
function diffDays(a, b){ // b - a (日数)
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0],pb[1]-1,pb[2]) - Date.UTC(pa[0],pa[1]-1,pa[2]))/DAY);
}

/* ---------- 状態 ---------- */
const DEFAULT_STATE = { v:1, prog:{}, log:{}, flags:[], opts:{ autonext:false, dailycap:40, shuffle:true } };
let S = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const p = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULT_STATE), p, { opts: Object.assign({}, DEFAULT_STATE.opts, p.opts||{}) });
  }catch(e){ return structuredClone(DEFAULT_STATE); }
}
let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
    catch(e){ toast('保存に失敗しました（保存領域が不足しています）'); }
  }, 120);
}

/* ---------- 問題バンク ---------- */
const BANK = (window.QUIZ_BANK || []).slice();
const SUBJ = {};           // id -> subject
const ITEM = {};           // itemId -> {item, subject}
BANK.forEach(s=>{
  SUBJ[s.id] = s;
  s.items.forEach(it => { ITEM[it.id] = { it, s }; });
});
const ALL_ITEMS = BANK.flatMap(s => s.items.map(it => ({ it, s })));
const TIER1 = BANK.filter(s => s.tier === 1);
const TIER2 = BANK.filter(s => s.tier === 2);

/* ---------- 進捗ヘルパ ---------- */
function prog(id){ return S.prog[id]; }
function isDue(id){ const p = S.prog[id]; return !!p && p.due <= today(); }
function isWeak(id){
  const p = S.prog[id];
  if(!p || !p.n) return false;
  return p.lastOk === false || (p.c / p.n) < 0.6;
}
function dueList(scope){
  const src = scope ? scope.items.map(it=>({it, s:scope})) : ALL_ITEMS;
  return src.filter(x => isDue(x.it.id));
}
function weakList(scope){
  const src = scope ? scope.items.map(it=>({it, s:scope})) : ALL_ITEMS;
  return src.filter(x => isWeak(x.it.id));
}
function subjectStat(s){
  let seen=0, n=0, c=0, mastered=0, due=0, weak=0;
  s.items.forEach(it=>{
    const p = S.prog[it.id];
    if(p && p.n){ seen++; n+=p.n; c+=p.c; if(p.streak>=3) mastered++; }
    if(isDue(it.id)) due++;
    if(isWeak(it.id)) weak++;
  });
  return { total:s.items.length, seen, attempts:n, correct:c, rate: n? Math.round(c/n*100):null, mastered, due, weak };
}

/* ---------- SRS（間隔反復） ---------- */
const IV_STEPS = [1, 3, 7];
function applySRS(id, grade){ // grade: 0=不正解 1=あいまい 2=正解
  const t = today();
  let p = S.prog[id] || { n:0, c:0, ef:2.5, iv:0, streak:0, due:t, last:null, lastOk:null };
  p.n++;
  if(grade === 2) p.c++;
  p.last = t;
  p.lastOk = grade === 2;

  if(grade === 0){
    p.streak = 0; p.iv = 0;
    p.ef = Math.max(1.3, p.ef - 0.2);
    p.due = t;                          // その日のうちに再挑戦
  }else if(grade === 1){
    p.ef = Math.max(1.3, p.ef - 0.15);
    p.iv = Math.max(1, Math.round((p.iv || 1) * 0.6));
    p.streak = Math.max(0, p.streak);
    p.due = addDays(t, p.iv);
  }else{
    p.ef = Math.min(2.8, p.ef + 0.1);
    if(p.streak < IV_STEPS.length) p.iv = IV_STEPS[p.streak];
    else p.iv = Math.min(180, Math.round(p.iv * p.ef));
    p.streak++;
    p.due = addDays(t, p.iv);
  }
  S.prog[id] = p;
  return p;
}
function logDay(correct){
  const t = today();
  const d = S.log[t] || { n:0, c:0 };
  d.n++; if(correct) d.c++;
  S.log[t] = d;
}
function streakDays(){
  let n = 0, d = today();
  if(!S.log[d]) d = addDays(d, -1);          // 今日まだなら昨日から数える
  while(S.log[d] && S.log[d].n > 0){ n++; d = addDays(d, -1); }
  return n;
}

/* ---------- DOM ヘルパ ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function el(tag, cls, txt){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(txt != null) e.textContent = txt;
  return e;
}
function show(view){
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + view).classList.add('active');
  const sc = $('#view-' + view + ' .scroll');
  if(sc) sc.scrollTop = 0;
}
let toastTimer;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}

/* ================= ホーム ================= */
function renderHome(){
  const t = today();
  const due = ALL_ITEMS.filter(x => isDue(x.it.id)).length;
  const weak = ALL_ITEMS.filter(x => isWeak(x.it.id)).length;
  $('#due-count').textContent = due;
  $('#streak-days').textContent = streakDays();
  $('#today-solved').textContent = (S.log[t] || {n:0}).n;

  let n=0, c=0;
  Object.values(S.prog).forEach(p => { n += p.n; c += p.c; });
  $('#overall-rate').textContent = n ? Math.round(c/n*100) + '%' : '–';

  $('#review-sub').textContent = due ? due + '問' : '予定なし';
  $('#weak-sub').textContent = weak + '問';

  renderSubjectCards($('#subject-list'), TIER1);
  renderSubjectCards($('#case-list'), TIER2);
}
function renderSubjectCards(host, list){
  host.innerHTML = '';
  list.forEach(s=>{
    const st = subjectStat(s);
    const card = el('button','subject-card');
    card.innerHTML =
      '<span class="sc-bar" style="background:'+s.color+'"></span>' +
      '<span class="sc-body">' +
        '<span class="sc-name">'+esc(s.name)+'</span>' +
        '<span class="sc-meta">'+st.total+'問中 '+st.seen+'問 学習済／定着 '+st.mastered+'問'+(st.weak?'／苦手 '+st.weak+'問':'')+'</span>' +
        '<span class="sc-prog">' +
          '<i class="p-ok" style="width:'+(st.total?Math.round((st.mastered/st.total)*100):0)+'%"></i>' +
          '<i class="p-ng" style="width:'+(st.total?Math.round((st.weak/st.total)*100):0)+'%"></i>' +
        '</span>' +
      '</span>' +
      '<span class="sc-right">' +
        '<span class="sc-rate">'+(st.rate!=null?st.rate+'<small>正答率</small>':'–<small>未学習</small>')+'</span>' +
        (st.due ? '<span class="sc-due">復習'+st.due+'</span>' : '') +
      '</span>';
    card.addEventListener('click', ()=> openSheet(s));
    host.appendChild(card);
  });
}
function esc(s){ return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

/* ================= 出題設定シート ================= */
let sheetSubject = null;
let sheetTopics = new Set();

function openSheet(s){
  sheetSubject = s;
  sheetTopics = new Set();
  $('#sheet-title').textContent = s.name;

  const topics = [...new Set(s.items.map(i => i.topic))];
  const wrap = $('#sheet-topics'); wrap.innerHTML = '';
  const all = el('button','chip on','すべての論点');
  all.addEventListener('click', ()=>{
    sheetTopics.clear();
    $$('#sheet-topics .chip').forEach((c,i)=> c.classList.toggle('on', i===0));
  });
  wrap.appendChild(all);
  topics.forEach(tp=>{
    const cnt = s.items.filter(i => i.topic === tp).length;
    const c = el('button','chip', tp + ' ' + cnt);
    c.addEventListener('click', ()=>{
      if(sheetTopics.has(tp)) sheetTopics.delete(tp); else sheetTopics.add(tp);
      c.classList.toggle('on', sheetTopics.has(tp));
      all.classList.toggle('on', sheetTopics.size === 0);
    });
    wrap.appendChild(c);
  });

  // 2次（暗記カード中心）は出題形式セグメントを隠す
  const hasOX = s.items.some(i => i.type === 'ox');
  const hasMC = s.items.some(i => i.type === 'mc');
  $('#field-type').style.display = (hasOX && hasMC) ? '' : 'none';
  $('#sheet-exam').style.display = s.exam ? '' : 'none';

  $('#sheet-backdrop').classList.add('show');
  $('#sheet-start').classList.add('show');
}
function closeSheet(){
  $('#sheet-backdrop').classList.remove('show');
  $('#sheet-start').classList.remove('show');
}
function segValue(id){
  const on = $('#'+id+' .on');
  return on ? on.dataset.v : null;
}
function bindSeg(id){
  $$('#'+id+' button').forEach(b=>{
    b.addEventListener('click', ()=>{
      $$('#'+id+' button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
  });
}

/* ---------- 出題リスト作成 ---------- */
function shuffle(a){
  const r = a.slice();
  for(let i=r.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; }
  return r;
}
function smartSort(list){
  const t = today();
  const score = x=>{
    const p = S.prog[x.it.id];
    if(!p) return 100;                                   // 未学習を最優先
    if(p.due <= t) return 200 + Math.min(60, diffDays(p.due, t)); // 期限超過ほど優先
    const acc = p.n ? p.c/p.n : 0;
    return 50 * (1 - acc);
  };
  return list.map(x => ({ x, k: score(x) + Math.random()*8 }))
             .sort((a,b) => b.k - a.k)
             .map(o => o.x);
}
function buildFromSheet(){
  const s = sheetSubject;
  let list = s.items.map(it => ({ it, s }));
  if(sheetTopics.size) list = list.filter(x => sheetTopics.has(x.it.topic));
  const tp = segValue('seg-type');
  if(tp === 'ox') list = list.filter(x => x.it.type === 'ox');
  if(tp === 'mc') list = list.filter(x => x.it.type === 'mc');
  if(!list.length){ toast('条件に合う問題がありません'); return null; }

  const order = segValue('seg-order');
  if(order === 'random') list = shuffle(list);
  else if(order === 'smart') list = smartSort(list);

  const cnt = parseInt(segValue('seg-count'), 10);
  if(cnt > 0) list = list.slice(0, cnt);
  return list;
}

/* ================= セッション ================= */
let Q = null;

function startSession(list, opt){
  if(!list || !list.length){ toast('出題できる問題がありません'); return; }
  Q = {
    list, i: 0,
    answers: new Array(list.length).fill(null), // {ok, picked, grade}
    mode: (opt && opt.mode) || 'practice',
    title: (opt && opt.title) || '',
    limitSec: (opt && opt.limitSec) || 0,
    startedAt: Date.now(),
    answered: false,
    order: null
  };
  closeSheet();
  show('quiz');
  startTimer();
  renderQuestion();
}

/* ---------- タイマー ---------- */
let timerId = null;
function startTimer(){
  clearInterval(timerId);
  tickTimer();
  timerId = setInterval(tickTimer, 1000);
}
function tickTimer(){
  if(!Q) return;
  const elapsed = Math.floor((Date.now() - Q.startedAt)/1000);
  const box = $('#quiz-timer');
  if(Q.limitSec){
    const left = Q.limitSec - elapsed;
    box.textContent = fmtTime(Math.max(0,left));
    box.classList.toggle('warn', left <= 300);
    if(left <= 0){ clearInterval(timerId); toast('制限時間になりました'); finish(); }
  }else{
    box.textContent = fmtTime(elapsed);
    box.classList.remove('warn');
  }
}
function fmtTime(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return m + ':' + String(s).padStart(2,'0');
}

/* ---------- 出題描画 ---------- */
function renderQuestion(){
  const { it, s } = Q.list[Q.i];
  Q.answered = false;
  $('#q-index').textContent = Q.i + 1;
  $('#q-total').textContent = Q.list.length;
  $('#progress-fill').style.width = ((Q.i)/Q.list.length*100) + '%';
  $('#q-subject').textContent = s.short;
  $('#q-subject').style.background = s.color;
  $('#q-topic').textContent = it.topic;
  $('#q-type').textContent = it.type === 'ox' ? '○×' : it.type === 'mc' ? '4択' : '記述・暗記';

  const qt = $('#q-text');
  qt.innerHTML = (it.lead ? '<span class="lead">'+esc(it.lead)+'</span>' : '') + esc(it.q);

  $('#explain').classList.add('hidden');
  const flagged = S.flags.includes(it.id);
  $('#btn-flag').classList.toggle('on', flagged);
  $('#btn-flag').textContent = flagged ? '★ 見直し' : '☆ 見直し';
  $('#btn-next').textContent = (Q.i === Q.list.length - 1) ? '採点する' : '次へ';
  $('#btn-next').style.visibility = Q.mode === 'exam' ? 'visible' : 'hidden';

  const area = $('#answer-area');
  area.innerHTML = '';
  if(it.type === 'ox') renderOX(area, it);
  else if(it.type === 'mc') renderMC(area, it);
  else renderKW(area, it);
  $('.quiz-scroll').scrollTop = 0;
}

function renderOX(area, it){
  const row = el('div','ox-row');
  [['○', true, '正しい'], ['×', false, '誤り']].forEach(([label, val, sub])=>{
    const b = el('button','ox-btn ' + (val?'o':'x'));
    b.innerHTML = label + '<small>' + sub + '</small>';
    b.dataset.val = val;
    b.addEventListener('click', ()=> answerAuto(val === it.a, val, row));
    row.appendChild(b);
  });
  area.appendChild(row);
}

function renderMC(area, it){
  const list = el('div','opt-list');
  let idx = it.choices.map((c,i)=>i);
  if(S.opts.shuffle && Q.mode !== 'exam') idx = shuffle(idx);
  else if(S.opts.shuffle) idx = shuffle(idx);
  Q.order = idx;
  idx.forEach((orig, pos)=>{
    const b = el('button','opt');
    b.innerHTML = '<span class="n">'+(pos+1)+'</span><span>'+esc(it.choices[orig])+'</span>';
    b.dataset.orig = orig;
    b.addEventListener('click', ()=> answerAuto(orig === it.a, orig, list));
    list.appendChild(b);
  });
  area.appendChild(list);
}

function renderKW(area, it){
  const btn = el('button','kw-reveal','タップして答えを表示');
  btn.addEventListener('click', ()=>{
    area.innerHTML = '';
    const ans = el('div','kw-answer', it.a);
    area.appendChild(ans);
    const g = el('div','self-grade');
    [['もう一度','sg-again',0,'思い出せない'],['あいまい','sg-hard',1,'半分は言えた'],['できた','sg-good',2,'説明できる']].forEach(([lab,cls,grade,sub])=>{
      const b = el('button',cls);
      b.innerHTML = lab + '<small>' + sub + '</small>';
      b.addEventListener('click', ()=> answerGraded(grade, it));
      g.appendChild(b);
    });
    area.appendChild(g);
    if(it.exp){
      $('#explain').classList.remove('hidden');
      $('#explain-verdict').className = 'explain-verdict neutral';
      $('#explain-verdict').textContent = 'ポイント';
      $('#explain-body').textContent = it.exp;
      $('#explain-meta').textContent = '';
    }
  });
  area.appendChild(btn);
}

/* ---------- 解答処理 ---------- */
function answerAuto(ok, picked, container){
  if(Q.answered) return;
  Q.answered = true;
  const { it } = Q.list[Q.i];
  Q.answers[Q.i] = { ok, picked };

  if(Q.mode === 'exam'){
    // 模試モードは正誤を見せずに進む
    markSelectedOnly(container, picked, it);
    setTimeout(next, 180);
    return;
  }
  applySRS(it.id, ok ? 2 : 0);
  logDay(ok);
  save();
  paintResult(container, it, picked);
  showExplain(it, ok);
  $('#btn-next').style.visibility = 'visible';
  if(ok && S.opts.autonext) setTimeout(()=>{ if(Q && Q.answered) next(); }, 1200);
}
function answerGraded(grade, it){
  if(Q.answered) return;
  Q.answered = true;
  const ok = grade === 2;
  Q.answers[Q.i] = { ok, picked: grade, grade };
  applySRS(it.id, grade);
  logDay(ok);
  save();
  const p = S.prog[it.id];
  $('#explain').classList.remove('hidden');
  $('#explain-verdict').className = 'explain-verdict ' + (ok ? 'ok' : grade === 1 ? 'neutral' : 'ng');
  $('#explain-verdict').textContent = ok ? '定着' : grade === 1 ? 'もう少し' : '要復習';
  if(it.exp) $('#explain-body').textContent = it.exp;
  $('#explain-meta').textContent = nextDueText(p);
  next(300);
}
function markSelectedOnly(container, picked, it){
  Array.from(container.children).forEach(b=>{
    const v = it.type === 'ox' ? (b.dataset.val === 'true') : parseInt(b.dataset.orig,10);
    if(v === picked) b.classList.add('correct');
    b.disabled = true;
  });
}
function paintResult(container, it, picked){
  Array.from(container.children).forEach(b=>{
    const v = it.type === 'ox' ? (b.dataset.val === 'true') : parseInt(b.dataset.orig,10);
    b.disabled = true;
    if(v === it.a) b.classList.add('correct');
    else if(v === picked) b.classList.add('wrong');
    else b.classList.add('dim');
  });
}
function nextDueText(p){
  if(!p) return '';
  const d = diffDays(today(), p.due);
  const when = d <= 0 ? '本日中' : d === 1 ? '明日' : d + '日後';
  return '次回の復習：' + when + '（' + p.due + '）／ 正答 ' + p.c + '/' + p.n + '回';
}
function showExplain(it, ok){
  const box = $('#explain');
  box.classList.remove('hidden');
  const v = $('#explain-verdict');
  v.className = 'explain-verdict ' + (ok ? 'ok' : 'ng');
  let head = ok ? '正解' : '不正解';
  if(it.type === 'ox') head += '　答え：' + (it.a ? '○' : '×');
  if(it.type === 'mc') head += '　答え：' + (it.choices[it.a].length > 24 ? it.choices[it.a].slice(0,24) + '…' : it.choices[it.a]);
  v.textContent = head;
  $('#explain-body').textContent = it.exp || '';
  $('#explain-meta').textContent = nextDueText(S.prog[it.id]);
}

function next(delay){
  if(!Q) return;                                   // 中断済みのセッションには進まない
  if(delay){ setTimeout(()=>next(0), delay); return; }
  if(Q.i >= Q.list.length - 1){ finish(); return; }
  Q.i++;
  renderQuestion();
}

/* ---------- 採点 ---------- */
function finish(){
  if(!Q) return;
  clearInterval(timerId);
  const total = Q.list.length;
  const answered = Q.answers.filter(a => a !== null).length;
  const correct = Q.answers.filter(a => a && a.ok).length;

  // 模試モードは終了時にまとめてSRS反映
  if(Q.mode === 'exam'){
    Q.answers.forEach((a, i)=>{
      if(a === null) return;
      applySRS(Q.list[i].it.id, a.ok ? 2 : 0);
      logDay(a.ok);
    });
    save();
  }
  const rate = answered ? Math.round(correct/answered*100) : 0;
  const rateAll = Math.round(correct/total*100);

  $('#res-correct').textContent = correct;
  $('#res-total').textContent = total;
  $('#res-rate').textContent = '正答率 ' + rateAll + '%' + (answered < total ? '（未解答 '+(total-answered)+'問）' : '');

  const judge = $('#res-judge');
  if(Q.mode === 'exam'){
    judge.textContent = rateAll >= 60 ? '合格ライン到達（60%以上）'
      : rateAll >= 40 ? 'あと一歩（40%以上60%未満）'
      : '足切りライン（40%未満）';
  }else{
    judge.textContent = rateAll >= 80 ? 'よく仕上がっています'
      : rateAll >= 60 ? '合格ラインです' : rateAll >= 40 ? '復習で伸びます' : 'ここが伸びしろです';
  }

  const sec = Math.floor((Date.now() - Q.startedAt)/1000);
  const facts = $('#result-facts');
  facts.innerHTML = '';
  [['所要時間', fmtTime(sec)], ['1問あたり', answered? Math.round(sec/answered)+'秒' : '–'], ['連続日数', streakDays()+'日']]
    .forEach(([lab,val])=>{
      const f = el('div','fact');
      f.innerHTML = '<b>'+esc(val)+'</b><small>'+lab+'</small>';
      facts.appendChild(f);
    });

  renderResultList();
  $('#btn-redo-wrong').style.display = (correct < answered || answered < total) ? '' : 'none';
  show('result');
}

function renderResultList(){
  const host = $('#result-list');
  host.innerHTML = '';
  Q.list.forEach((x, i)=>{
    const a = Q.answers[i];
    const it = x.it;
    const row = el('button','res-item');
    const mk = a === null ? '–' : a.ok ? '○' : '×';
    const cls = a === null ? '' : a.ok ? 'ok' : 'ng';
    const short = it.q.length > 46 ? it.q.slice(0,46) + '…' : it.q;
    row.innerHTML = '<span class="mk '+cls+'">'+mk+'</span>' +
      '<span class="res-q">'+esc(short)+'<em>'+esc(x.s.short + '／' + it.topic)+'</em></span>';
    const detail = el('div','res-detail');
    detail.style.display = 'none';
    let ansTxt = '';
    if(it.type === 'ox') ansTxt = '答え：' + (it.a ? '○' : '×');
    else if(it.type === 'mc') ansTxt = '答え：' + it.choices[it.a];
    else ansTxt = it.a;
    detail.textContent = ansTxt + (it.exp ? '\n\n' + it.exp : '');
    row.addEventListener('click', ()=>{
      detail.style.display = detail.style.display === 'none' ? '' : 'none';
    });
    host.appendChild(row);
    host.appendChild(detail);
  });
}

/* ================= 学習記録 ================= */
function renderStats(){
  let n=0, c=0;
  Object.values(S.prog).forEach(p => { n += p.n; c += p.c; });
  const seen = Object.keys(S.prog).length;
  const mastered = Object.values(S.prog).filter(p => p.streak >= 3).length;
  const totalItems = ALL_ITEMS.length;

  const grid = $('#stat-grid');
  grid.innerHTML = '';
  [
    [seen + '<small style="font-size:14px">/' + totalItems + '</small>', '学習した問題'],
    [mastered, '定着した問題'],
    [n ? Math.round(c/n*100) + '%' : '–', '通算正答率'],
    [n, '通算の解答回数']
  ].forEach(([v,l])=>{
    const b = el('div','stat-box');
    b.innerHTML = '<b>'+v+'</b><small>'+l+'</small>';
    grid.appendChild(b);
  });

  // ヒートマップ（16週）
  const hm = $('#heatmap'); hm.innerHTML = '';
  const end = new Date();
  const endDow = end.getDay();
  const startDate = new Date(end.getTime() - (16*7 - 1 + endDow) * DAY);
  for(let i=0; i<16*7 + endDow + 1; i++){
    const d = ymd(new Date(startDate.getTime() + i*DAY));
    if(d > today()) break;
    const cnt = (S.log[d] || {n:0}).n;
    const lvl = cnt === 0 ? 0 : cnt < 10 ? 1 : cnt < 25 ? 2 : cnt < 50 ? 3 : 4;
    const cell = el('i','l' + lvl);
    cell.title = d + '：' + cnt + '問';
    hm.appendChild(cell);
  }

  // 科目別
  const ss = $('#subject-stats'); ss.innerHTML = '';
  BANK.forEach(s=>{
    const st = subjectStat(s);
    const row = el('div','ss-row');
    row.innerHTML =
      '<div class="ss-top">'+esc(s.name)+'<span>'+(st.rate!=null?st.rate+'%':'未学習')+'　'+st.seen+'/'+st.total+'</span></div>' +
      '<div class="ss-bar">' +
        '<i style="width:'+Math.round(st.mastered/st.total*100)+'%;background:'+s.color+'"></i>' +
        '<i style="width:'+Math.round(Math.max(0,(st.seen-st.mastered))/st.total*100)+'%;background:color-mix(in srgb,'+s.color+' 35%,transparent)"></i>' +
      '</div>';
    ss.appendChild(row);
  });

  // 復習予定（今日〜7日後）
  const fc = $('#forecast'); fc.innerHTML = '';
  const buckets = [];
  for(let i=0;i<8;i++) buckets.push(0);
  const t = today();
  Object.values(S.prog).forEach(p=>{
    const d = diffDays(t, p.due);
    if(d <= 0) buckets[0]++;
    else if(d <= 7) buckets[d]++;
  });
  const max = Math.max(1, ...buckets);
  buckets.forEach((v,i)=>{
    const col = el('div','fc-col');
    col.innerHTML = '<b>'+(v||'')+'</b><i style="height:'+Math.round(v/max*70)+'%"></i><small>'+(i===0?'今日':i+'日後')+'</small>';
    fc.appendChild(col);
  });
}

/* ================= イベント ================= */
function bind(){
  bindSeg('seg-type'); bindSeg('seg-count'); bindSeg('seg-order');

  $('#sheet-cancel').addEventListener('click', closeSheet);
  $('#sheet-backdrop').addEventListener('click', closeSheet);
  $('#sheet-go').addEventListener('click', ()=>{
    const list = buildFromSheet();
    if(list) startSession(list, { title: sheetSubject.name });
  });
  $('#sheet-exam').addEventListener('click', ()=>{
    const s = sheetSubject;
    if(!s.exam) return;
    const pool = s.items.map(it => ({ it, s }));
    const cnt = Math.min(s.exam.count, pool.length);
    const list = shuffle(pool).slice(0, cnt);
    const min = Math.round(s.exam.minutes * cnt / s.exam.count);
    if(cnt < s.exam.count) toast('収録数の都合で ' + cnt + '問／' + min + '分で実施します');
    startSession(list, { mode:'exam', title: s.name + ' 模試', limitSec: min*60 });
  });

  $('#btn-review').addEventListener('click', ()=>{
    const cap = parseInt(S.opts.dailycap, 10) || 40;
    const list = smartSort(dueList(null)).slice(0, cap);
    if(!list.length){ toast('今日の復習予定はありません。科目から新しい問題を解きましょう'); return; }
    startSession(list, { title:'復習' });
  });
  $('#btn-weak').addEventListener('click', ()=>{
    const list = smartSort(weakList(null)).slice(0, 40);
    if(!list.length){ toast('苦手として記録された問題はまだありません'); return; }
    startSession(list, { title:'苦手克服' });
  });
  $('#btn-random').addEventListener('click', ()=>{
    const pool = TIER1.flatMap(s => s.items.map(it => ({ it, s })));
    startSession(shuffle(pool).slice(0,20), { title:'全科目ランダム' });
  });

  $('#btn-next').addEventListener('click', ()=> next());
  $('#btn-quit').addEventListener('click', ()=>{
    if(Q && Q.answers.some(a => a !== null)){
      if(!confirm('中断しますか？ ここまでの解答結果は記録されています。')) return;
    }
    clearInterval(timerId);
    Q = null; renderHome(); show('home');
  });
  $('#btn-flag').addEventListener('click', ()=>{
    const id = Q.list[Q.i].it.id;
    const i = S.flags.indexOf(id);
    if(i >= 0){ S.flags.splice(i,1); toast('見直しリストから外しました'); }
    else { S.flags.push(id); toast('見直しリストに追加しました'); }
    save();
    $('#btn-flag').classList.toggle('on', i < 0);
    $('#btn-flag').textContent = i < 0 ? '★ 見直し' : '☆ 見直し';
  });

  $('#btn-redo-wrong').addEventListener('click', ()=>{
    const wrong = Q.list.filter((x,i) => !Q.answers[i] || !Q.answers[i].ok);
    if(!wrong.length){ toast('間違えた問題はありません'); return; }
    startSession(shuffle(wrong), { title:'間違い直し' });
  });
  $('#btn-result-home').addEventListener('click', ()=>{ Q = null; renderHome(); show('home'); });

  $('#btn-stats').addEventListener('click', ()=>{ renderStats(); show('stats'); });
  $('#btn-stats-back').addEventListener('click', ()=>{ renderHome(); show('home'); });
  $('#btn-settings').addEventListener('click', ()=>{ renderSettings(); show('settings'); });
  $('#btn-settings-back').addEventListener('click', ()=>{ renderHome(); show('home'); });

  $('#opt-autonext').addEventListener('change', e=>{ S.opts.autonext = e.target.checked; save(); });
  $('#opt-shuffle').addEventListener('change', e=>{ S.opts.shuffle = e.target.checked; save(); });
  $('#opt-dailycap').addEventListener('change', e=>{ S.opts.dailycap = parseInt(e.target.value,10); save(); });

  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', ()=> $('#import-file').click());
  $('#import-file').addEventListener('change', importData);
  $('#btn-reset').addEventListener('click', ()=>{
    if(!confirm('すべての学習履歴・復習予定を消去します。よろしいですか？')) return;
    if(!confirm('元に戻せません。本当に実行しますか？')) return;
    S = structuredClone(DEFAULT_STATE);
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
    renderSettings(); renderHome(); toast('学習履歴をリセットしました');
  });

  // キーボード（PC用）
  document.addEventListener('keydown', e=>{
    if(!$('#view-quiz').classList.contains('active') || !Q) return;
    const { it } = Q.list[Q.i];
    if(e.key === 'Enter' || e.key === ' '){
      if($('#btn-next').style.visibility === 'visible'){ e.preventDefault(); next(); }
      return;
    }
    if(Q.answered) return;
    if(it.type === 'ox'){
      if(e.key === 'o' || e.key === 'ArrowLeft' || e.key === '1') $$('.ox-btn')[0].click();
      if(e.key === 'x' || e.key === 'ArrowRight' || e.key === '2') $$('.ox-btn')[1].click();
    }else if(it.type === 'mc'){
      const n = parseInt(e.key,10);
      if(n >= 1 && n <= 4){ const b = $$('.opt')[n-1]; if(b) b.click(); }
    }
  });
}

function renderSettings(){
  $('#opt-autonext').checked = !!S.opts.autonext;
  $('#opt-shuffle').checked = !!S.opts.shuffle;
  $('#opt-dailycap').value = String(S.opts.dailycap);
  $('#app-version').textContent = APP_VERSION;
  const ox = ALL_ITEMS.filter(x=>x.it.type==='ox').length;
  const mc = ALL_ITEMS.filter(x=>x.it.type==='mc').length;
  const kw = ALL_ITEMS.filter(x=>x.it.type==='kw').length;
  $('#bank-info').textContent = '収録 ' + ALL_ITEMS.length + '問（○× ' + ox + '／4択 ' + mc + '／2次 ' + kw + '）';
}

function exportData(){
  const blob = new Blob([JSON.stringify(S)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shindanshi-drill-' + today() + '.json';
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
  toast('学習データを書き出しました');
}
function importData(e){
  const f = e.target.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const p = JSON.parse(r.result);
      if(!p || typeof p !== 'object' || !p.prog) throw new Error('形式が違います');
      if(!confirm('現在の学習データを、読み込んだデータで上書きします。よろしいですか？')) return;
      S = Object.assign(structuredClone(DEFAULT_STATE), p, { opts: Object.assign({}, DEFAULT_STATE.opts, p.opts||{}) });
      save(); renderSettings(); renderHome(); toast('学習データを読み込みました');
    }catch(err){ toast('読み込めませんでした：' + err.message); }
  };
  r.readAsText(f);
  e.target.value = '';
}

/* ================= 起動 ================= */
function boot(){
  if(!BANK.length){
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-size:15px;line-height:2">問題データを読み込めませんでした。<br>data フォルダが同じ場所にあるか確認してください。</div>';
    return;
  }
  bind();
  renderHome();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}
boot();
