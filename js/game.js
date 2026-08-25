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
  running: false, phase: 'idle',   // idle | countdown | play
  sound: true,
  score: 0, lives: 3, combo: 0, maxCombo: 0,
  destroyed: 0, correctChars: 0, keystrokes: 0, mistakes: 0,
  eggs: 0, overdrive: false,
  rainbow: false,
  elapsed: 0, spawnAcc: 0, shake: 0, cd: 0,
  enemies: [],
  target: null, words: [], wordIdx: 0, lastTs: performance.now()
};
try{ S.rainbow = localStorage.getItem('wd_rainbow') === '1'; }catch(e){}

const multiplier = () => 1 + Math.min(7, Math.floor(S.combo / 3));

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
    if (i >= seq.length){ S.phase = 'play'; return; }
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
    score: 0, lives: 3, combo: 0, maxCombo: 0,
    destroyed: 0, correctChars: 0, keystrokes: 0, mistakes: 0,
    eggs: 0, overdrive: false,
    elapsed: 0, spawnAcc: 1500, shake: 0,
    enemies: [], target: null,
    words: shuffled(getWords().list), wordIdx: 0
  });
  labelsLayer.innerHTML = '';
  document.body.classList.remove('overdrive');
  $('hud-score').textContent = '0';
  $('hud-combo').textContent = '';
  $('hud-combo').classList.remove('flash');
  $('hud-lives').textContent = '♥'.repeat(CONFIG.LIVES);
  $('hud-time').textContent = '0:00';
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
  // 佯攻陨石：开局 8 秒后按比例混入，轨迹与地球擦肩而过、无伤飞离
  const miss = S.elapsed > 8000 && Math.random() < CONFIG.MISS_CHANCE;
  // 世界速度：随得分线性提升，逻辑速度缩放为世界单位/秒
  const speed = Math.min(CONFIG.SPEED_MAX, CONFIG.SPEED_BASE + S.score * CONFIG.SPEED_RAMP) * .1;
  const E = Scene3D.EARTH;
  // 落点：地球朝向镜头半球面上的随机点（玩家能看到撞击面）
  const u = norm3({x: rand(-1, 1), y: rand(-.1, 1), z: rand(.45, 1)});
  const aim = {x: E.x + u.x * E.r, y: E.y + u.y * E.r, z: E.z + u.z * E.r};
  // 起点：从地球外侧深空（更高、更远、横向散开），z 恒在镜头前方很远处
  // 距离下限约 50 单位——保证陨石飞抵地球前留出至少一个单词的输入时间
  const start = {
    x: aim.x + rand(-75, 75),
    y: Math.min(aim.y + rand(45, 82), 56),
    z: E.z - rand(22, 55)
  };
  let target = aim;
  if (miss){
    // 把直线从「指向地心」向随机侧向偏转 δ：最近距离 = 瞄准参数 b > 地球半径，
    // 于是与地球擦肩而过，越过最近点后继续冲出视野
    const w = {x: E.x - start.x, y: E.y - start.y, z: E.z - start.z};
    const L = Math.hypot(w.x, w.y, w.z) || 1;
    const d0 = {x: w.x / L, y: w.y / L, z: w.z / L};
    let n = {x: rand(-1, 1), y: rand(-1, 1), z: rand(-1, 1)};   // 任取侧向
    const k0 = n.x * d0.x + n.y * d0.y + n.z * d0.z;            // 去掉平行分量 → 垂直
    n = {x: n.x - k0 * d0.x, y: n.y - k0 * d0.y, z: n.z - k0 * d0.z};
    let nl = Math.hypot(n.x, n.y, n.z);
    if (nl < .01){ n = {x: -d0.z, y: 0, z: d0.x}; nl = Math.hypot(n.x, n.y, n.z) || 1; }
    n = {x: n.x / nl, y: n.y / nl, z: n.z / nl};
    const b = E.r * rand(1.25, 2.15);            // 最近距离（离地心）
    const dl = Math.asin(Math.min(.95, b / L));  // 偏转角
    const cs = Math.cos(dl), sn = Math.sin(dl);
    const dir = norm3({x: d0.x * cs + n.x * sn, y: d0.y * cs + n.y * sn, z: d0.z * cs + n.z * sn});
    const past = L * cs + rand(45, 75);
    target = {x: start.x + dir.x * past, y: start.y + dir.y * past, z: start.z + dir.z * past};
  }
  const dist = Math.hypot(target.x - start.x, target.y - start.y, target.z - start.z);
  S.enemies.push({
    word, gold, miss, typed: 0, errT: 0, hitT: 0,
    p: 0, start, target, pos: Object.assign({}, start), dist,
    spd: speed * (.92 + Math.random() * .16),   // 波内速度波动收窄，手感更线性
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
  if (S.lives <= 0) gameOver();
}

function rankOf(score){
  if (score === 0)     return '和平主义者';   // 彩蛋：一分未得
  if (score < 850)     return '太空菜鸟';
  if (score < 2100)    return '见习炮手';
  if (score < 4300)    return '轨道卫士';
  if (score < 7800)    return '王牌飞行员';
  if (score < 12800)   return '星际指挥官';
  return '银河传说';
}
function fmtTime(ms){
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function gameOver(){
  S.running = false;
  stopCountdown();
  document.body.classList.remove('overdrive');
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
  try{ best = parseInt(localStorage.getItem('wd_best') || '0', 10) || 0; }catch(e){}
  const isRecord = stats.score > best;
  if (isRecord){ try{ localStorage.setItem('wd_best', String(stats.score)); }catch(e){} }
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
  // 出怪：间隔随得分线性缩短（打得越好来得越快），同屏数量设上限
  S.spawnAcc += dt * 1000;
  const interval = Math.max(CONFIG.SPAWN_MIN, CONFIG.SPAWN_START - S.score * CONFIG.SPAWN_RAMP);
  if (S.spawnAcc >= interval && S.enemies.length < CONFIG.MAX_ENEMIES){
    S.spawnAcc = 0;
    spawnEnemy();
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
      if (e.miss){   // 佯攻陨石：掠过地球，无伤飞出
        e.dead = true;
        if (S.target === e) S.target = null;
        if (e._scr) addFloater(e._scr.x, e._scr.y, '佯攻 · 掠过', '#7d8797');
      } else {
        loseLife(e);
      }
    }
  }
  const dead = S.enemies.filter(e => e.dead);
  for (const e of dead) freeEnemy(e);
  S.enemies = S.enemies.filter(e => !e.dead);
  S.shake = Math.max(0, S.shake - dt * 40);
  if (S.target && S.target.dead) S.target = null;
  $('hud-time').textContent = fmtTime(S.elapsed);
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
  const playing = S.running && S.phase === 'play';
  if (playing) update(dt);
  Scene3D.render(dt, ts / 1000, S.running, S.shake, S.target, playing ? S.enemies : null);
  if (playing) syncLabels();
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
typer.addEventListener('blur', () => { if (S.running) focusHint.classList.remove('hidden'); });
typer.addEventListener('focus', () => focusHint.classList.add('hidden'));
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
  const {list, custom} = getWords();
  $('lib-status').textContent = custom
    ? `当前词库：自定义（${list.length} 词）`
    : `当前词库：内置通用（${list.length} 词）`;
}
$('lib-save').addEventListener('click', () => {
  const arr = parseWords($('lib-text').value);
  if (arr.length < 5){ $('lib-status').textContent = '有效单词太少（至少 5 个），未保存'; return; }
  saveWords(arr);
  refreshLibStatus();
});
$('lib-reset').addEventListener('click', () => {
  clearWords();
  $('lib-text').value = '';
  refreshLibStatus();
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
  try{ best = parseInt(localStorage.getItem('wd_best') || '0', 10) || 0; }catch(e){}
  $('best-line').classList.toggle('hidden', best <= 0);
  $('best-score').textContent = best;
}
Scene3D.init($('game'));
window.addEventListener('resize', () => Scene3D.resize());
refreshBest();
refreshLibStatus();
requestAnimationFrame(frame);
