'use strict';
/* ---------- 主逻辑 ----------
   玩法逻辑（z 轴深度推进、输入锁定、连击、彩蛋）在本文件；
   渲染交给 scene.js（Three.js），文字标签 / 浮字 / 中文释义用 DOM 叠加层。 */

const typer = $('typer');
const hud = $('hud'), focusHint = $('focus-hint');
const screenStart = $('screen-start'), screenOver = $('screen-over');
const labelsLayer = $('labels'), meaningEl = $('meaning'), cdEl = $('countdown');

/* ---------- 游戏状态 ---------- */
const S = {
  running: false, phase: 'idle',   // idle | countdown | play | ending
  sound: true,
  score: 0, lives: 3, combo: 0, maxCombo: 0,
  destroyed: 0, correctChars: 0, keystrokes: 0, mistakes: 0,
  eggs: 0, overdrive: false,
  rainbow: false,
  elapsed: 0, spawnAcc: 0, shake: 0, cd: 0,
  spawnCount: 0,
  timescale: 1, endingWin: false, endingT: 0,
  enemies: [],
  target: null, words: [], wordIdx: 0, lastTs: performance.now()
};
try{ S.rainbow = localStorage.getItem('wd_rainbow') === '1'; }catch(e){}
try{ S.diffIdx = Math.min(CONFIG.DIFFS.length - 1, Math.max(0, parseInt(localStorage.getItem('wd_diff') || '0', 10) || 0)); }catch(e){ S.diffIdx = 0; }
let hellUnlocked = false;   // 地狱难度：在「终极」获胜后解锁
try{ hellUnlocked = localStorage.getItem('wd_hell') === '1'; }catch(e){}

const multiplier = () => 1 + Math.min(7, Math.floor(S.combo / 3));

/* ---------- GA 埋点（未配置 GA_ID 时静默） ---------- */
function track(event, params){
  if (typeof window.gtag === 'function') window.gtag('event', event, params || {});
}

/* ---------- 开局倒计时 3 · 2 · 1 · GO ---------- */
let cdTimer = null;
function stopCountdown(){
  clearTimeout(cdTimer);
  cdTimer = null;
  cdEl.classList.remove('show', 'go');
}
function runCountdown(){
  S.phase = 'countdown';
  const seq = ['3', '2', '1', 'GO'];
  let i = 0;
  const step = () => {
    if (i >= seq.length){
      S.phase = 'play';
      showToast(CONFIG.DIFFS[S.diffIdx].name + '难度 · 拦截开始');
      track('game_start', { difficulty: CONFIG.DIFFS[S.diffIdx].name });
      return;
    }
    const s = seq[i++];
    cdEl.textContent = s;
    cdEl.classList.toggle('go', s === 'GO');
    cdEl.classList.remove('show');
    void cdEl.offsetWidth;   // 重启 CSS 动画
    cdEl.classList.add('show');
    blip(s === 'GO' ? 880 : 440, .12, 'triangle', .05);
    cdTimer = setTimeout(step, s === 'GO' ? 560 : 760);
  };
  step();
}

function resetGame(){
  stopCountdown();
  S.phase = 'idle';
  for (const e of S.enemies) freeEnemy(e);
  Object.assign(S, {
    score: 0, lives: CONFIG.LIVES, combo: 0, maxCombo: 0,
    destroyed: 0, correctChars: 0, keystrokes: 0, mistakes: 0,
    eggs: 0, overdrive: false,
    elapsed: 0, shake: 0,
    spawnCount: 0,
    timescale: 1, endingWin: false, endingT: 0,
    /* 预填出怪累计：GO 后约 0.6s 第一颗陨石即刻现身 */
    spawnAcc: Math.max(0, CONFIG.DIFFS[S.diffIdx].I0 - 600),
    enemies: [], target: null,
    words: shuffled(getWords().list), wordIdx: 0
  });
  labelsLayer.innerHTML = '';
  document.body.classList.remove('overdrive');
  $('hud-score').textContent = '0';
  $('hud-combo').textContent = '';
  $('hud-combo').classList.remove('flash');
  $('hud-lives').textContent = '♥'.repeat(Math.max(0, CONFIG.LIVES)) || '—';
  $('hud-time').textContent = '0:00';
  updateGoalHud();
}

function nextWord(){
  if (S.wordIdx >= S.words.length){ S.words = shuffled(S.words); S.wordIdx = 0; }
  return S.words[S.wordIdx++];
}

/* ---------- 小工具 ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
function norm3(v){
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return {x: v.x / l, y: v.y / l, z: v.z / l};
}

function spawnEnemy(){
  let word, gold = false;
  // 彩蛋陨石：金色、词来自 EGG_WORDS
  if (S.elapsed > 10000 && Math.random() < CONFIG.EGG_CHANCE){
    word = EGG_WORDS[Math.floor(Math.random() * EGG_WORDS.length)];
    gold = true;
  } else {
    word = nextWord();
  }
  // 世界速度：随对局进行线性提升（与难度档位无关），逻辑速度缩放为世界单位/秒
  const k = Math.min(1, S.elapsed / CONFIG.RUN_MS);
  const speed = (CONFIG.SPEED_BASE + (CONFIG.SPEED_MAX - CONFIG.SPEED_BASE) * k) * .1;
  const E = Scene3D.EARTH;
  // 落点：地球朝向镜头半球面上的随机点——每颗陨石都必然冲向地球
  const u = norm3({x: rand(-1, 1), y: rand(-.1, 1), z: rand(.45, 1)});
  const target = {x: E.x + u.x * E.r, y: E.y + u.y * E.r, z: E.z + u.z * E.r};
  // 距离按「基准速度 × 飞行时长」反推（8~12s），实际速度再乘个体系数——
  // 快慢不一的同屏陨石，最快的也保留约 6s 反应窗口，不会出现必死球
  const off = norm3({
    x: rand(-75, 75),
    y: Math.min(rand(45, 82), 56) - target.y,
    z: E.z - rand(22, 55) - target.z
  });
  const dist = Math.min(200, speed * rand(8, 12));
  const spd = speed * rand(.75, 1.35);
  const start = {
    x: target.x + off.x * dist,
    y: target.y + off.y * dist,
    z: Math.min(target.z + off.z * dist, -30)
  };
  S.enemies.push({
    word, gold, typed: 0, errT: 0, hitT: 0,
    p: 0, start, target, pos: Object.assign({}, start), dist,
    spd,
    wr: 14 + word.length * 3.2,   // 单词越长陨石越大（整体已放大）
    rot: Math.random() * 6.28,
    seed: Array.from({length: 9}, () => .72 + Math.random() * .5),
    _mesh: null, _label: null, _labelKey: '', _scr: null
  });
}

function freeEnemy(e){
  Scene3D.free(e);
  if (e._label){ e._label.remove(); e._label = null; }
}

/* ---------- 彩蛋提示浮层 ---------- */
let toastTimer = null;
function showToast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
}

/* ---------- 中文释义（屏幕中央渐显渐隐） ---------- */
function showMeaning(word, gold){
  const m = WORD_DICT[word];
  if (!m) return;
  meaningEl.textContent = m;
  meaningEl.classList.toggle('gold', !!gold);
  meaningEl.classList.remove('show');
  void meaningEl.offsetWidth;   // 重启 CSS 动画
  meaningEl.classList.add('show');
}

/* ---------- DOM 浮字（+分数 / 倍率提示） ---------- */
function addFloater(x, y, text, color){
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.color = color;
  el.addEventListener('animationend', () => el.remove());
  labelsLayer.appendChild(el);
}

/* ---------- 输入处理 ---------- */
function laserColor(){
  if (S.rainbow) return `hsl(${Math.floor(performance.now() / 4) % 360},100%,65%)`;
  if (S.overdrive) return '#ffb454';
  return '#53f5ff';
}
function fireLaser(e){
  Scene3D.fire(e, laserColor());
}
function registerMistake(){
  S.mistakes++;
  S.combo = 0;
  S.shake = Math.max(S.shake, 5);
  blip(150, .12, 'sawtooth', .05);
}
function destroyEnemy(e){
  e.dead = true;
  S.combo++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  S.destroyed++;
  let gained = e.word.length * 15 * multiplier();
  const pos = e._scr || {x: window.innerWidth / 2, y: window.innerHeight / 2};
  addFloater(pos.x, pos.y, '+' + gained, '#53f5ff');
  if (e.gold){  // 彩蛋陨石：额外加分 + 特殊提示
    gained += CONFIG.EGG_BONUS;
    S.eggs++;
    addFloater(pos.x, pos.y - 34, '彩蛋 +' + CONFIG.EGG_BONUS, '#ffb454');
    arpeggio();
  }
  S.score += gained;
  if (S.combo > 0 && S.combo % 4 === 0)
    addFloater(pos.x, pos.y - 34, '倍率 x' + multiplier(), '#ffb454');
  showMeaning(e.word, e.gold);
  Scene3D.explode(e);
  boomSound();
  if (S.target === e) S.target = null;
  $('hud-score').textContent = S.score;
  $('hud-combo').textContent = S.combo >= 2 ? `COMBO ${S.combo} · 倍率 x${multiplier()}` : '';
}
function processChar(raw){
  const ch = raw.toLowerCase();
  if (!/^[a-z'\-]$/.test(ch)) return;
  S.keystrokes++;
  const t = S.target;
  if (t && !t.dead){
    if (t.word[t.typed] === ch){
      t.typed++; S.correctChars++;
      t.hitT = performance.now();          // 击中白闪
      Scene3D.chip(t, laserColor());       // 单字母碎屑特效
      fireLaser(t);
      blip(500 + t.typed * 40, .04);
      if (t.typed >= t.word.length) destroyEnemy(t);
    } else {
      t.errT = performance.now();
      registerMistake();
    }
    return;
  }
  // 无锁定目标：找以该字母开头、离地球最近（进度最大）的陨石
  let best = null;
  for (const e of S.enemies){
    if (e.dead || e.typed > 0) continue;
    if (e.word[0] === ch && (!best || e.p > best.p)) best = e;
  }
  if (best){
    S.target = best;
    best.typed = 1;
    best.hitT = performance.now();
    S.correctChars++;
    Scene3D.chip(best, laserColor());
    fireLaser(best);
    blip(520, .04);
    if (best.word.length === 1) destroyEnemy(best);
  } else {
    registerMistake();
  }
}
typer.addEventListener('input', () => {
  const v = typer.value;
  typer.value = '';
  if (!S.running || S.phase !== 'play' || !v) return;
  for (const ch of v) processChar(ch);
});
/* ESC：放弃当前输入进度，解除锁定以便切换目标 */
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !S.running || S.phase !== 'play' || !S.target) return;
  S.target.typed = 0;
  S.target._labelKey = '';   // 强制刷新单词标签
  S.target = null;
  blip(300, .08, 'square', .03);
});

/* ---------- 生命 / 结束 ---------- */
function loseLife(e){
  e.dead = true;
  if (S.target === e) S.target = null;
  Scene3D.explode(e, 0xff5d5d);
  S.lives--;
  S.combo = 0;
  S.shake = 22;
  $('hud-lives').textContent = '♥'.repeat(Math.max(0, S.lives)) || '—';
  $('hud-combo').textContent = '';
  blip(90, .4, 'sawtooth', .08);
  boomSound();
  document.body.style.background = '#2a0d14';
  setTimeout(() => document.body.style.background = '', 130);
  if (S.lives <= 0) beginEnding(false);
}

function rankOf(score){
  if (score === 0)     return '和平主义者';   // 彩蛋：一分未得
  if (score < 2000)    return '太空菜鸟';
  if (score < 6500)    return '见习炮手';
  if (score < 13000)   return '轨道卫士';
  if (score < 21000)   return '王牌飞行员';
  if (score < 30000)   return '星际指挥官';
  return '银河传说';
}
function fmtTime(ms){
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* ---------- 结局：慢动作演出 → 结算页 ---------- */
// 进入终局：胜利清场庆祝 / 失败红震，时间膨胀到子弹时间后弹出结算
function beginEnding(win){
  if (S.phase === 'ending') return;
  S.phase = 'ending';
  S.endingWin = win;
  S.endingT = 0;
  stopCountdown();
  document.body.classList.remove('overdrive');
  $('hud-combo').classList.remove('flash');
  if (win){
    for (const e of S.enemies)
      if (!e.dead){ e.dead = true; Scene3D.explode(e, 0x8affc1); }
    S.target = null;
    meaningEl.classList.remove('gold');
    meaningEl.textContent = '地 球 得 救 了';
    meaningEl.classList.remove('show');
    void meaningEl.offsetWidth;
    meaningEl.classList.add('show');
    arpeggio();
    boomSound();
  } else {
    S.shake = 30;
    blip(60, .6, 'sawtooth', .09);
    boomSound();
  }
}
function finishEnding(){
  const win = S.endingWin;
  S.running = false;
  S.phase = 'idle';
  S.timescale = 1;
  typer.blur();
  for (const e of S.enemies) freeEnemy(e);
  S.enemies = [];
  S.target = null;
  const min = Math.max(S.elapsed, 5000) / 60000;
  const stats = {
    score: S.score,
    kill: S.destroyed,
    combo: S.maxCombo,
    wpm: Math.round((S.correctChars / 5) / min),
    acc: S.keystrokes ? Math.max(0, Math.round((S.keystrokes - S.mistakes) / S.keystrokes * 100)) : 100,
    time: fmtTime(S.elapsed),
    rank: rankOf(S.score),
    eggs: S.eggs
  };
  let best = 0;
  const bestKey = 'wd_best_' + S.diffIdx;   // 各难度独立记录
  try{ best = parseInt(localStorage.getItem(bestKey) || '0', 10) || 0; }catch(e){}
  const isRecord = stats.score > best;
  if (isRecord){ try{ localStorage.setItem(bestKey, String(stats.score)); }catch(e){} }
  /* 在「终极」获胜 → 解锁地狱难度 */
  if (win && S.diffIdx === CONFIG.DIFFS.length - 2 && !hellUnlocked){
    hellUnlocked = true;
    try{ localStorage.setItem('wd_hell', '1'); }catch(e){}
    showToast('新难度解锁 · 地狱');
    arpeggio();
    track('hell_unlock');
  }
  track('game_end', {
    difficulty: CONFIG.DIFFS[S.diffIdx].name,
    result: win ? 'win' : 'lose',
    score: S.score,
    kills: S.destroyed,
    duration_sec: Math.round(S.elapsed / 1000)
  });
  $('over-title').textContent = win ? '地 球 得 救 了' : '防 线 告 破';
  $('over-title').classList.toggle('win', win);
  const total = CONFIG.DIFFS[S.diffIdx].total;
  $('over-sub').textContent = win
    ? `${total} 枚陨石全部击碎 · 防线固若金汤`
    : `击碎 ${S.destroyed} / ${total} 枚 · 地球等你再次出征`;
  $('over-rank').textContent = stats.rank;
  $('over-record').classList.toggle('hidden', !isRecord);
  $('over-egg').classList.toggle('hidden', stats.eggs <= 0);
  $('st-egg').textContent = stats.eggs;
  $('st-score').textContent = stats.score;
  $('st-kill').textContent = stats.kill;
  $('st-combo').textContent = stats.combo;
  $('st-wpm').textContent = stats.wpm;
  $('st-acc').textContent = stats.acc + '%';
  $('st-time').textContent = stats.time;
  drawCard(stats);
  hud.classList.add('hidden');
  focusHint.classList.add('hidden');
  screenOver.classList.remove('hidden');
}

/* ---------- 主循环 ---------- */
function update(dt){
  S.elapsed += dt * 1000;
  // 狂暴模式：连击达到阈值，激光变金、边框脉冲
  const od = S.combo >= CONFIG.OVERDRIVE_COMBO;
  if (od !== S.overdrive){
    S.overdrive = od;
    document.body.classList.toggle('overdrive', od);
    $('hud-combo').classList.toggle('flash', od);
    if (od){ showToast('OVERDRIVE · 狂暴模式'); arpeggio(); }
  }
  /* 出怪：把本局固定配额按难度曲线铺满 3 分钟；
     时间走到头，剩余配额作为「终局波」一次全部现身 */
  const D = CONFIG.DIFFS[S.diffIdx];
  if (S.phase === 'play' && S.spawnCount < D.total){
    const k = Math.min(1, S.elapsed / CONFIG.RUN_MS);
    const due = Math.floor(k * D.total);
    if (k >= 1){
      while (S.spawnCount < D.total){ S.spawnCount++; spawnEnemy(); }
      showToast('终局波 · 陨石倾巢而出');
      boomSound();
    } else if (S.spawnCount < due){
      S.spawnAcc += dt * 1000;
      if (S.spawnAcc >= 280 && S.enemies.length < D.cap){
        S.spawnAcc = 0;
        S.spawnCount++;
        spawnEnemy();
      }
    } else {
      S.spawnAcc = 0;
    }
  }
  // 陨石逼近地球
  for (const e of S.enemies){
    if (e.dead) continue;
    e.p += (e.spd * dt) / e.dist;
    e.rot += dt * .6;
    e.pos.x = e.start.x + (e.target.x - e.start.x) * e.p;
    e.pos.y = e.start.y + (e.target.y - e.start.y) * e.p;
    e.pos.z = e.start.z + (e.target.z - e.start.z) * e.p;
    if (e.p >= 1){
      if (S.phase === 'ending'){ e.dead = true; }   // 慢动作演出中落地只作视觉效果
      else loseLife(e);
    }
  }
  const dead = S.enemies.filter(e => e.dead);
  for (const e of dead) freeEnemy(e);
  S.enemies = S.enemies.filter(e => !e.dead);
  S.shake = Math.max(0, S.shake - dt * 40);
  if (S.target && S.target.dead) S.target = null;
  $('hud-time').textContent = fmtTime(S.elapsed);
  updateGoalHud();
  /* 胜利：配额全部出现且已全部击碎 */
  if (S.phase === 'play' && S.spawnCount >= D.total && !S.enemies.length) beginEnding(true);
}
function updateGoalHud(){
  const D = CONFIG.DIFFS[S.diffIdx];
  $('hud-goal').textContent = `${Math.min(S.destroyed, D.total)} / ${D.total}`;
}

/* ---------- DOM 单词标签 ---------- */
function labelHTML(e){
  const typed = e.word.slice(0, e.typed);
  const next = e.word[e.typed] || '';
  const rest = e.word.slice(e.typed + 1);
  const err = performance.now() - e.errT < 220;
  return `<span class="${err ? 'err' : 'typed'}">${typed}</span>` +
    (S.target === e && next ? `<span class="next">${next}</span>` : next ? `<span class="rest">${next}</span>` : '') +
    (rest ? `<span class="rest">${rest}</span>` : '');
}
function syncLabels(){
  for (const e of S.enemies){
    const scr = Scene3D.toScreen(e);
    e._scr = scr;
    if (!e._label){
      e._label = document.createElement('div');
      e._label.className = 'word-label';
      labelsLayer.appendChild(e._label);
      e._labelKey = '';
    }
    const el = e._label;
    const fs = Math.min(24, Math.max(10, 1700 / Math.max(1, scr.d)));
    // 标签钳制在屏幕内，防止贴近边缘的陨石文字被裁掉
    const lw = e.word.length * fs * .62;
    const lx = Math.min(Math.max(scr.x, lw / 2 + 6), window.innerWidth - lw / 2 - 6);
    el.style.transform = `translate(-50%,-100%) translate(${lx}px,${scr.y - scr.rPx - 6}px)`;
    el.style.fontSize = fs + 'px';
    el.style.zIndex = Math.round(20000 - scr.d);
    el.classList.toggle('gold', !!e.gold);
    const key = e.typed + '|' + (performance.now() - e.errT < 220 ? 'e' : '') + '|' + (S.target === e);
    if (key !== e._labelKey){
      el.innerHTML = labelHTML(e);
      e._labelKey = key;
    }
  }
}

/* ---------- 帧循环 ---------- */
function frame(ts){
  requestAnimationFrame(frame);
  const dt = Math.min(.05, Math.max(0, (ts - S.lastTs) / 1000));
  S.lastTs = ts;
  if (S.running && S.phase === 'ending'){
    /* 终局慢动作：时间膨胀到子弹时间，演出后弹出结算 */
    S.timescale += (0.12 - S.timescale) * Math.min(1, dt * 2.4);
    S.endingT += dt;
    update(dt * S.timescale);
    if (S.endingT > 2.4) finishEnding();
  } else if (S.running && S.phase === 'play'){
    S.timescale = 1;
    update(dt);
  }
  const active = S.running && (S.phase === 'play' || S.phase === 'ending');
  /* 暂停时给场景传 running=false → 相机呼吸/慢速星空待机 */
  Scene3D.render(dt, ts / 1000, S.running && S.phase !== 'paused', S.shake, S.target, active ? S.enemies : null);
  if (active) syncLabels();
}

/* ---------- 流程控制 ---------- */
function startGame(){
  resetGame();
  S.running = true;
  screenStart.classList.add('hidden');
  screenOver.classList.add('hidden');
  hud.classList.remove('hidden');
  focusHint.classList.add('hidden');
  typer.value = '';
  typer.focus();
  runCountdown();   // 倒计时结束才进入 play，开始出怪
}
$('btn-start').addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);
$('btn-home').addEventListener('click', () => {
  screenOver.classList.add('hidden');
  screenStart.classList.remove('hidden');
  refreshBest();
});
document.addEventListener('pointerdown', () => {
  if (S.running && document.activeElement !== typer) typer.focus();
});
/* ---------- 暂停 / 继续：失去输入焦点即暂停，回车恢复（重播倒计时） ---------- */
function pauseGame(){
  if (!S.running || (S.phase !== 'play' && S.phase !== 'countdown')) return;
  stopCountdown();
  S.phase = 'paused';
  focusHint.textContent = '已 暂 停 · 按 回 车 继 续';
  focusHint.classList.remove('hidden');
}
function resumeGame(){
  if (!S.running || S.phase !== 'paused') return;
  focusHint.classList.add('hidden');
  if (document.activeElement !== typer) typer.focus();
  runCountdown();   // 恢复前重播 3·2·1·GO
}
window.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (S.running){ resumeGame(); return; }
  /* 未开局时：回车快速进入游戏 */
  if (!screenOver.classList.contains('hidden')){ $('btn-retry').click(); return; }
  if (!screenStart.classList.contains('hidden')) startGame();
});
typer.addEventListener('blur', pauseGame);
typer.addEventListener('focus', () => { if (S.phase !== 'paused') focusHint.classList.add('hidden'); });
window.addEventListener('blur', pauseGame);   // 切走窗口同样暂停
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
$('btn-sound').addEventListener('click', e => {
  S.sound = !S.sound;
  e.target.classList.toggle('off', !S.sound);
});
// 视角切换：第三人称（看飞船全貌） ⇄ 第一人称（驾驶舱）
$('btn-view').addEventListener('click', () => {
  const mode = Scene3D.toggleView();
  showToast(mode === 'third' ? '第三人称视角' : '第一人称视角');
  typer.focus();
});

/* ---------- 难度选择 ---------- */
function renderDiffPicker(){
  document.querySelectorAll('#diff-picker .diff-btn').forEach((b, i) => {
    const locked = i === CONFIG.DIFFS.length - 1 && !hellUnlocked;
    b.classList.toggle('active', i === S.diffIdx);
    b.classList.toggle('locked', locked);
    b.disabled = locked;
    b.textContent = CONFIG.DIFFS[i].name + (locked ? ' · 未解锁' : '');
  });
}
$('diff-picker').addEventListener('click', e => {
  const b = e.target.closest('.diff-btn');
  if (!b || b.disabled) return;
  const i = parseInt(b.dataset.i, 10) || 0;
  if (i === S.diffIdx) return;
  S.diffIdx = i;
  try{ localStorage.setItem('wd_diff', String(i)); }catch(err){}
  renderDiffPicker();
  refreshBest();
});

// 战绩卡下载
$('btn-card').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = $('card-canvas').toDataURL('image/png');
  a.download = '星际打字防线_战绩卡.png';
  a.click();
});

// 彩蛋：开始界面连点标题 5 次，解锁彩虹激光（本地持久保存）
let titleClicks = 0;
$('title').addEventListener('click', () => {
  if (S.rainbow) return;
  titleClicks++;
  if (titleClicks >= 5){
    S.rainbow = true;
    try{ localStorage.setItem('wd_rainbow', '1'); }catch(e){}
    showToast('彩蛋解锁 · 彩虹激光');
    arpeggio();
  }
});

/* ---------- 词库面板 ---------- */
function refreshLibStatus(){
  const {list, custom, preset} = getWords();
  const active = LIB_PRESETS[preset] || LIB_PRESETS.general;
  $('lib-status').textContent = custom
    ? `当前词库：自定义（${list.length} 词）`
    : `当前词库：${active.name}（${list.length} 词）`;
  document.querySelectorAll('.lib-preset').forEach(btn => {
    btn.classList.toggle('active', !custom && btn.dataset.preset === active.key);
  });
}
$('lib-save').addEventListener('click', () => {
  const arr = parseWords($('lib-text').value);
  if (arr.length < 5){ $('lib-status').textContent = '有效单词太少（至少 5 个），未保存'; return; }
  saveWords(arr);
  refreshLibStatus();
});
$('lib-reset').addEventListener('click', () => {
  clearWords();
  setPreset('general');
  $('lib-text').value = '';
  refreshLibStatus();
});
// 内置词库：点击直接应用，无需手动粘贴
document.querySelectorAll('.lib-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = LIB_PRESETS[btn.dataset.preset] ? btn.dataset.preset : 'general';
    clearWords();                          // 自定义词库优先，先清空以确保内置预设生效
    setPreset(key);
    $('lib-text').value = '';              // 内置词库直接应用，无需手动粘贴
    refreshLibStatus();
    showToast('已应用 · ' + LIB_PRESETS[key].name + '（' + LIB_PRESETS[key].words.length + ' 词）');
  });
});
$('lib-file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { $('lib-text').value = String(r.result || ''); };
  r.readAsText(f);
  e.target.value = '';
});

/* ---------- 初始化 ---------- */
function refreshBest(){
  let best = 0;
  try{ best = parseInt(localStorage.getItem('wd_best_' + S.diffIdx) || '0', 10) || 0; }catch(e){}
  $('best-line').classList.toggle('hidden', best <= 0);
  $('best-label').textContent = '历史最佳 · ' + CONFIG.DIFFS[S.diffIdx].name;
  $('best-score').textContent = best;
}
Scene3D.init($('game'));
window.addEventListener('resize', () => Scene3D.resize());
renderDiffPicker();
refreshBest();
refreshLibStatus();
requestAnimationFrame(frame);
