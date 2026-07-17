/* ═══════════════════════════════════════════════════════════
   防詐迷宮 SCAM MAZE DEFENSE
   87 關像素塔防・純 HTML+CSS+JS・可部署 GitHub Pages
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ── 版本 ─────────────────────────────────────────── */
const APP_VERSION = 'v2.3.0';
/* ── 分支測試標記（僅供內部測試辨識，合併回 main 前務必清空為 '' ）── */
const BRANCH_TAG = '';

/* ── 多國語系（MVP：zh/en/id/vi，字典在 i18n.js） ─── */
let LANG = (function(){
  try{ const s = localStorage.getItem('asmd_lang'); if (s && I18N[s]) return s; }catch(e){}
  const n = (navigator.language || '').toLowerCase();
  if (n.startsWith('zh')) return 'zh';
  if (n.startsWith('id') || n.startsWith('ms')) return 'id';
  if (n.startsWith('vi')) return 'vi';
  return 'en';
})();
const L = () => I18N[LANG];
function fmt(s, o){ return s.replace(/\{(\w+)\}/g, (_, k) => o[k] !== undefined ? o[k] : ''); }

/* ── 棋盤尺寸（依 layoutMode 動態切換） ───────────── */
const CELL = 48;
const MAJ = 20, MIN = 12;          // 主軸×次軸：迷宮永遠在此空間生成
let COLS = MAJ, ROWS = MIN;        // 直立時轉置為 12×20
let W = COLS * CELL, H = ROWS * CELL;
const MAX_LEVEL = 87;
const HP_START = 10, HP_CAP = 30, LIVES_START = 3, LIVES_CAP = 5;

/* canvas 元素 cv／ctx 宣告在 render.js（載入序在前，後載各檔頂層可安全引用） */

/* ── layoutMode：能力偵測（不猜機型） ─────────────── */
let LAYOUT = 'desktop';            // desktop | mland | mport
function detectLayout(){
  try{
    if (!window.matchMedia) return 'desktop';
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (!coarse) return 'desktop';
    return matchMedia('(orientation: portrait)').matches ? 'mport' : 'mland';
  }catch(e){ return 'desktop'; }
}
function applyLayout(mode){
  LAYOUT = mode;
  if (document.body && document.body.dataset) document.body.dataset.layout = mode;
  const portrait = mode === 'mport';
  COLS = portrait ? MIN : MAJ;
  ROWS = portrait ? MAJ : MIN;
  W = COLS * CELL; H = ROWS * CELL;
  cv.width = W; cv.height = H;
}
applyLayout(detectLayout());

/* ── 檢視（雙指縮放/平移；桌機固定 1×） ──────────── */
const ZOOM_MIN = 1, ZOOM_MAX = 2.5;
let view = { scale:1, ox:0, oy:0 };
function resetView(){ view.scale = 1; view.ox = 0; view.oy = 0; }
function clampView(){
  view.scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.scale));
  view.ox = Math.min(0, Math.max(W * (1 - view.scale), view.ox));
  view.oy = Math.min(0, Math.max(H * (1 - view.scale), view.oy));
}
function zoomAt(ix, iy, factor){         // ix,iy＝內部像素（未經 view）
  const ns = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.scale * factor));
  const wx = (ix - view.ox) / view.scale, wy = (iy - view.oy) / view.scale;
  view.scale = ns;
  view.ox = ix - wx * ns;
  view.oy = iy - wy * ns;
  clampView();
}
function clientToInternal(cx, cy){
  const r = cv.getBoundingClientRect();
  return [ (cx - r.left) * (W / r.width), (cy - r.top) * (H / r.height) ];
}
function internalToWorld(ix, iy){
  return [ (ix - view.ox) / view.scale, (iy - view.oy) / view.scale ];
}

/* ── 種子隨機（每關迷宮固定，像 roguelike 的地圖種子） ── */
function RNG(seed){
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ── 資料表（TOWERS／ETYPES／SUPPORT／MODS／CRITTERS／CLEAR_EN）已抽至 data.js ── */

/* ── 遊戲狀態 ─────────────────────────────────────── */
let S = null;            // 當前遊戲 state
let selShop = -1;        // 商店選中的塔
let selTower = null;     // 點選的已建塔
let speedIdx = 0; const SPEEDS = [1,2,3];
let muted = false;
let raf = 0, lastT = 0;
let selSup = -1;       // 支援瞄準模式
let runGen = 0;        // 局次世代：舊局的 setTimeout 回呼不得影響新局
let layoutPauseGen = 0;// 轉向暫停世代：只准最後一次轉向解除暫停
let hitStop = 0;       // 慢動作剩餘秒數
let supportAim = null; // {i,x,y,hits,knockbacks,localHits,globalHits}
let impactFreeze = { remainingMs:0, totalMs:0, label:'', color:'#ffffff' };
const LIGHT_CHARGE_MS = 500;
let lightCharge = { active:false, remainingMs:0, token:0 };
let sellConfirmTower = null, sellConfirmUntil = 0, sellConfirmTimer = 0;
let upgradeLockedUntil = 0;
let towerMenuRefreshAt = 0;
let morePauseWasManual = false;
let scoreToastValue = 0, scoreToastTimer = 0;

const UX_PREF_KEY = 'asmd_ux_v21';
function defaultUxPrefs(){
  let reduceMotion = false;
  try{ reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){}
  return { quality:'auto', reduceMotion, reduceFlash:false, muted:false, lastStable:'full' };
}
function loadUxPrefs(){
  const base = defaultUxPrefs();
  try{
    const saved = JSON.parse(localStorage.getItem(UX_PREF_KEY));
    if (!saved || typeof saved !== 'object') return base;
    if (['auto','full','compact'].includes(saved.quality)) base.quality = saved.quality;
    if (typeof saved.reduceMotion === 'boolean') base.reduceMotion = saved.reduceMotion;
    if (typeof saved.reduceFlash === 'boolean') base.reduceFlash = saved.reduceFlash;
    if (typeof saved.muted === 'boolean') base.muted = saved.muted;
    if (['full','compact','minimum'].includes(saved.lastStable)) base.lastStable = saved.lastStable;
  }catch(e){}
  return base;
}
let uxPrefs = loadUxPrefs();
muted = uxPrefs.muted;
let actualQuality = uxPrefs.quality === 'auto' ? uxPrefs.lastStable : uxPrefs.quality;
let perfState = {
  fps:60, below45At:0, below30At:0, above55At:0,
  lastChange:-Infinity, downgradedWave:0,
};
function saveUxPrefs(){
  try{ localStorage.setItem(UX_PREF_KEY, JSON.stringify(uxPrefs)); }catch(e){}
}
function triggerHaptic(pattern){
  if (uxPrefs.reduceMotion || actualQuality === 'minimum') return false;
  try{
    if (!navigator.vibrate) return false;
    navigator.vibrate(pattern);
    return true;
  }catch(e){ return false; }
}
function qualityLabel(mode){
  const labels = L().ui.qualityModes || {};
  return labels[mode] || mode;
}
function applyQualityClass(){
  if (!document.body) return;
  document.body.classList.toggle('reduce-motion', !!uxPrefs.reduceMotion);
  document.body.classList.toggle('quality-compact', actualQuality === 'compact');
  document.body.classList.toggle('quality-minimum', actualQuality === 'minimum');
  const status = document.getElementById('qualityStatus');
  if (status) status.textContent = fmt(L().ui.qualityStatus, {
    selected:qualityLabel(uxPrefs.quality), active:qualityLabel(actualQuality),
  });
}
function setActualQuality(mode, at, remember=true){
  if (!['full','compact','minimum'].includes(mode) || mode === actualQuality) return false;
  actualQuality = mode;
  perfState.lastChange = Number.isFinite(at) ? at : performance.now();
  perfState.below45At = perfState.below30At = perfState.above55At = 0;
  if (remember && uxPrefs.quality === 'auto'){
    uxPrefs.lastStable = mode;
    saveUxPrefs();
  }
  applyQualityClass();
  if (S) buildGround();
  return true;
}
function performanceSampleAllowed(){
  return !!(S && document.visibilityState !== 'hidden' && !S.paused && !S.over &&
    S.phase === 'wave' && S.waveActive && !S.layoutPaused);
}
function sampleAutoQuality(ts, frameMs){
  if (uxPrefs.quality !== 'auto' || !performanceSampleAllowed() || !Number.isFinite(frameMs) || frameMs <= 0) return;
  const fps = Math.min(120, 1000 / frameMs);
  perfState.fps = perfState.fps * .9 + fps * .1;
  const canChange = ts - perfState.lastChange >= 15000;
  if (perfState.fps < 45){
    if (!perfState.below45At) perfState.below45At = ts;
  } else perfState.below45At = 0;
  if (perfState.fps < 30){
    if (!perfState.below30At) perfState.below30At = ts;
  } else perfState.below30At = 0;
  if (perfState.fps > 55){
    if (!perfState.above55At) perfState.above55At = ts;
  } else perfState.above55At = 0;
  const notYetDowngraded = perfState.downgradedWave !== S.level;
  if (canChange && notYetDowngraded && actualQuality === 'full' && perfState.below45At && ts - perfState.below45At >= 3000){
    if (setActualQuality('compact', ts)) perfState.downgradedWave = S.level;
  } else if (canChange && notYetDowngraded && actualQuality === 'compact' && perfState.below30At && ts - perfState.below30At >= 2000){
    if (setActualQuality('minimum', ts)) perfState.downgradedWave = S.level;
  }
}
function maybeRaiseAutoQuality(ts){
  if (uxPrefs.quality !== 'auto' || !S || S.phase !== 'setup' || !perfState.above55At ||
      ts - perfState.above55At < 12000 || ts - perfState.lastChange < 15000) return;
  if (actualQuality === 'minimum') setActualQuality('compact', ts);
  else if (actualQuality === 'compact') setActualQuality('full', ts);
}

function newState(){
  return {
    level:1, hp:HP_START, lives:LIVES_START, coins:120, score:0, kills:0,
    towers:[], enemies:[], projs:[], fx:[], allies:[],
    path:[], pathWide:[], routes:[], branchCells:[], grid:[], spawnQ:[], spawnT:0,
    playing:false, waveActive:false, over:false, paused:false,
    manualPaused:false, layoutPaused:false,
    phase:'setup', transitionGen:0,
    autoT:0, mod:MODS[0],
    supCd:Array(SUPPORT.length).fill(0), beam:null,
    critter:null, critT: 9 + Math.random()*8,
    stageScoreStart:0,
    routeGuide:{active:false, started:0, duration:1000},
    dangerWaveAlerted:false, dangerHapticDone:false, dangerFinal:false,
    dangerCount:0, dangerLastDom:0, dangerClearSince:0, dangerEdgeTarget:null,
  };
}
function guardedTimeout(cb, delay, transitionToken){
  const gameGen = runGen;
  const state = S;
  return setTimeout(() => {
    if (gameGen !== runGen || state !== S) return;
    if (transitionToken !== undefined && state && state.transitionGen !== transitionToken) return;
    cb();
  }, delay);
}

/* ── 迷宮路徑產生（seed = 關卡編號） ───────────────── */
/* 主軸空間（MAJ×MIN）生成路徑：同種子 → 同迷宮，直橫僅轉置 */
function genMajorPath(lv){
  const rng = RNG(lv * 7919 + 12345);
  const cells = [];
  let r = 2 + Math.floor(rng() * (MIN - 4)), c = 0;
  cells.push([c, r]);
  while (c < MAJ - 1){
    let run = 2 + Math.floor(rng() * 3);
    while (run-- > 0 && c < MAJ - 1){ c++; cells.push([c, r]); }
    if (c >= MAJ - 1) break;
    let nr = 1 + Math.floor(rng() * (MIN - 2));
    while (nr === r) nr = 1 + Math.floor(rng() * (MIN - 2));
    const dir = nr > r ? 1 : -1;
    while (r !== nr){ r += dir; cells.push([c, r]); }
  }
  return cells;
}
/* 支線岔路：主線的水平段岔出去、隔 1 格平行繞行、再併回主線。
   與主線相隔 1 格 → 岔口中間留草地可蓋塔，形成真正的分岔口。
   每關最多 2 段支線；回傳 [{ i, j, det }]（i/j 為主線 fork/併回索引，det 為支線獨有格）。 */
function genBranchRoutes(cells, rng){
  const center = new Set(cells.map(([x,y]) => `${x},${y}`));
  const taken = new Set();          // 已被先前支線占用的格，兩段支線不得互相重疊
  const found = [];
  let i = 0;
  while (i < cells.length && found.length < 2){
    const r0 = cells[i][1];
    let j = i;
    while (j+1 < cells.length && cells[j+1][1] === r0) j++;
    const runLen = j - i + 1;
    if (runLen >= 3 && i > 0 && j < cells.length - 1 && rng() < .55){
      const tryDetour = dir => {
        const nr = r0 + dir*2;
        if (nr < 1 || nr > MIN - 2) return null;
        const x0 = cells[i][0], x1 = cells[j][0];
        const det = [[x0, r0 + dir], [x0, nr]];
        const step = x1 > x0 ? 1 : -1;
        for (let x = x0 + step; x !== x1; x += step) det.push([x, nr]);
        det.push([x1, nr], [x1, r0 + dir]);
        return det.every(([x,y]) => !center.has(`${x},${y}`) && !taken.has(`${x},${y}`)) ? det : null;
      };
      const d = rng() < .5 ? -1 : 1;
      const det = tryDetour(d) || tryDetour(-d);
      if (det){
        for (const c of det) taken.add(`${c[0]},${c[1]}`);
        found.push({ i, j, det });
      }
    }
    i = j + 1;
  }
  return found;
}
/* 把主線 + 支線組合成所有可走路線：主線、各走一段支線、全走（最多 4 條）。routes[0] 恆為主線 */
function buildRoutes(cells, branches){
  const routes = [];
  for (let mask = 0; mask < (1 << branches.length); mask++){
    let route = [], prev = 0;
    for (let b = 0; b < branches.length; b++){
      if (!(mask & (1 << b))) continue;
      const { i, j, det } = branches[b];
      route = route.concat(cells.slice(prev, i + 1), det);
      prev = j;
    }
    routes.push(route.concat(cells.slice(prev)));
  }
  return routes;
}
/* 部分較長的水平段落展開為 2 格寬走道（純加寬，敵人仍走中心線 S.path 不變） */
function genWideShoulders(cells, rng, blocked){
  const centerline = new Set(cells.map(([x,y]) => `${x},${y}`));
  const shoulders = [];
  const MAX_WIDE = 2;
  let widened = 0, i = 0;
  while (i < cells.length && widened < MAX_WIDE){
    const r0 = cells[i][1];
    let j = i;
    while (j+1 < cells.length && cells[j+1][1] === r0) j++;
    const runLen = j - i + 1;
    if (runLen >= 3 && i > 0 && j < cells.length - 1 && rng() < .45){
      let nr = rng() < .5 ? r0 - 1 : r0 + 1;
      const tryRow = row => row >= 1 && row <= MIN - 2 &&
        cells.slice(i, j+1).every(([x]) => !centerline.has(`${x},${row}`) && !(blocked && blocked.has(`${x},${row}`)));
      if (!tryRow(nr)) nr = r0 + (r0 - nr);   // 換另一側再試一次
      if (tryRow(nr)){
        for (let k=i;k<=j;k++) shoulders.push([cells[k][0], nr]);
        widened++;
      }
    }
    i = j + 1;
  }
  return shoulders;
}
function genLevel(lv){
  closeTowerMenu();            // 防幽靈塔選單（換關後殘留的雙重退款漏洞）
  if (typeof closeBuildMenu === 'function') closeBuildMenu();
  if (typeof cancelSupportAction === 'function') cancelSupportAction(false, false);
  const cells = genMajorPath(lv);
  const branches = genBranchRoutes(cells, RNG(lv*15859 + 424243));
  let routes = buildRoutes(cells, branches);
  let branchCells = branches.reduce((a, b) => a.concat(b.det), []);
  let wide = genWideShoulders(routes[0], RNG(lv*40503 + 777773),
    new Set(branchCells.map(([x,y]) => `${x},${y}`)));
  if (LAYOUT === 'mport'){
    routes = routes.map(rt => rt.map(([x, y]) => [y, x]));  // 直立：上→下防守
    branchCells = branchCells.map(([x, y]) => [y, x]);
    wide = wide.map(([x, y]) => [y, x]);
  }
  S.routes = routes;
  S.path = routes[0];
  S.branchCells = branchCells;
  S.pathWide = wide;
  S.grid = Array.from({length:ROWS}, () => Array(COLS).fill(0));
  for (const [x,y] of S.path) S.grid[y][x] = 1;          // 1=路
  for (const [x,y] of branchCells) S.grid[y][x] = 1;     // 支線岔路
  for (const [x,y] of wide) if (S.grid[y] && S.grid[y][x] === 0) S.grid[y][x] = 1;  // 加寬路肩
  // roguelike：每關迷宮重生，舊塔全額退回點數重新佈署
  S.coins += S.towers.reduce((a,t) => a + t.invested, 0);
  S.towers = [];
  S.enemies = []; S.projs = []; S.fx = []; S.allies = [];
  // 關卡修飾事件（前 4 關與魔王關固定平靜日）
  const mrng = RNG(lv*2654435761 + 97);
  mrng(); mrng();  // 混合種子，避免低位偏差
  S.mod = (lv < 5 || lv % 10 === 0) ? MODS[0] : MODS[Math.floor(mrng()*MODS.length)];
  buildGround();
  buildWave(lv);
  S.stageScoreStart = S.score;
  startRouteGuide();
}

/* ── 波次／敵人／塔攻擊／投射物／粒子已抽至 combat.js ── */

/* ── 音效（WebAudio 8-bit 嗶嗶聲） ────────────────── */
let AC = null;
function sfx(freq, dur, type='square'){
  if (muted) return;
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    if (AC.state === 'suspended' && AC.resume) AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(.06, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, AC.currentTime+dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime+dur);
  }catch(e){}
}

/* 重武器爆音：sub-bass 下滑 + 白噪爆裂 */
function sfxBoom(freq){
  if (muted) return;
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    if (AC.state === 'suspended' && AC.resume) AC.resume();
    const t0 = AC.currentTime;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq || 90, t0);
    o.frequency.exponentialRampToValueAtTime(24, t0 + .5);
    g.gain.setValueAtTime(.5, t0);
    g.gain.exponentialRampToValueAtTime(.001, t0 + .55);
    o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + .55);
    const len = Math.floor(AC.sampleRate * .3);
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random()*2 - 1) * (1 - i/len);
    const src = AC.createBufferSource(); src.buffer = buf;
    const g2 = AC.createGain(); g2.gain.value = .3;
    src.connect(g2); g2.connect(AC.destination); src.start(t0);
  }catch(e){}
}

/* 全螢幕閃光（DOM 覆蓋層） */
function screenFlash(color){
  const el = document.getElementById('screenFlash');
  if (!el) return;
  if (uxPrefs.reduceFlash){
    color = String(color).replace(/rgba\(([^)]+),\s*([\d.]+)\)/, (_m, rgb, a) =>
      `rgba(${rgb},${Math.min(.12, Number(a) || .12)})`);
  }
  el.style.background = color;
  el.classList.remove('flash-on');
  void el.offsetWidth;   // 重觸發動畫
  el.classList.add('flash-on');
}

/* 制裁技命中停格：只凍結戰場模擬，暫停／音效等介面仍可操作。 */
function resetImpactFreeze(){
  impactFreeze = { remainingMs:0, totalMs:0, label:'', color:'#ffffff' };
  if (document.body){
    document.body.classList.remove('impact-freeze');
    if (document.body.style) document.body.style.removeProperty('--impact-color');
  }
  const stage = document.getElementById('stage');
  if (stage && stage.style) stage.style.removeProperty('--impact-color');
}
function startImpactFreeze(durationMs, label, color){
  if (!S || S.over || impactFreeze.remainingMs > 0) return false;
  const ms = uxPrefs.reduceMotion ? Math.min(100, durationMs) : durationMs;
  impactFreeze = { remainingMs:ms, totalMs:ms, label, color:color || '#ffffff' };
  if (document.body){
    document.body.classList.add('impact-freeze');
    if (document.body.style) document.body.style.setProperty('--impact-color', impactFreeze.color);
  }
  const stage = document.getElementById('stage');
  if (stage && stage.style) stage.style.setProperty('--impact-color', impactFreeze.color);
  updateHUD();
  draw();
  return true;
}
function updateImpactFreeze(elapsedMs){
  if (impactFreeze.remainingMs <= 0) return false;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return true;
  impactFreeze.remainingMs = Math.max(0, impactFreeze.remainingMs - Math.min(50, elapsedMs));
  if (impactFreeze.remainingMs <= 0){
    resetImpactFreeze();
    updateHUD();
  }
  return true;
}

/* ── 特種部隊支援施放（制裁技）已抽至 combat.js ── */

/* ── 草地小幫手 ───────────────────────────────────── */
function spawnCritter(){
  // 找一塊空草地（避開路與塔）
  for (let tries = 0; tries < 30; tries++){
    const gx = 1 + Math.floor(Math.random()*(COLS-2));
    const gy = 1 + Math.floor(Math.random()*(ROWS-2));
    if (S.grid[gy][gx] !== 0) continue;
    const k = CRITTERS[Math.floor(Math.random()*CRITTERS.length)];
    S.critter = { k, x:gx*CELL+CELL/2, y:gy*CELL+CELL/2, t:0, acts:0, actT:1.0, done:false };
    return;
  }
}
function updateCritter(dt, now){
  const c = S.critter;
  c.t += dt;
  if (c.k === 'squirrel'){                      // 松鼠：丟 3 顆橡果攻擊最近的詐騙
    c.actT -= dt;
    if (c.actT <= 0 && c.acts < 3){
      let best = null, bd = 240*240;
      for (const e of S.enemies){
        if (e.dead) continue;
        const d = (e.x-c.x)**2 + (e.y-c.y)**2;
        if (d < bd){ bd = d; best = e; }
      }
      if (best){
        S.projs.push({ x:c.x, y:c.y-8, tx:best, dmg:6, spd:400, color:'#b06f37', ti:-1, splash:0, slow:0, slowT:0, stun:0, bounty:0, mark:0, knock:0, execute:0 });
        if (!c.acts) S.fx.push({ txt:L().critters.squirrel, x:c.x, y:c.y-26, life:1.2 });
        c.acts++; c.actT = .65;
        sfx(700,.05,'triangle');
      }
    }
    if (c.t > 4) c.done = true;
  } else if (!c.acts && c.t > .9){              // 其他三種：現身後做一次好事
    c.acts = 1;
    if (c.k === 'bee'){                         // 蜜蜂：螫最近的詐騙（傷害＋減速）
      let best = null, bd = 260*260;
      for (const e of S.enemies){
        if (e.dead) continue;
        const d = (e.x-c.x)**2 + (e.y-c.y)**2;
        if (d < bd){ bd = d; best = e; }
      }
      if (best){
        hitEnemy(best, 5, null);
        best.slowLeft = 1.4; best.slowPct = .5;
        S.fx.push({ zap:true, x1:c.x, y1:c.y-6, x2:best.x, y2:best.y, life:.2, color:'#f5c211' });
      }
      S.fx.push({ txt:L().critters.bee, x:c.x, y:c.y-26, life:1.2 });
      sfx(900,.08,'triangle');
    } else if (c.k === 'worm'){                 // 蚯蚓：翻土翻出零錢
      S.coins += 8;
      burst(c.x, c.y, '#ffd166', 8);
      S.fx.push({ txt:L().critters.worm, x:c.x, y:c.y-26, life:1.2 });
      sfx(500,.08);
    } else {                                    // 瓢蟲：幸運 +1 血
      S.hp = Math.min(HP_CAP, S.hp + 1);
      burst(c.x, c.y, '#9be79b', 8);
      S.fx.push({ txt:L().critters.bug, x:c.x, y:c.y-26, life:1.2 });
      sfx(660,.08); 
    }
  }
  if (c.t > 3.6 && c.k !== 'squirrel') c.done = true;
  if (c.done){
    burst(c.x, c.y+6, '#4caf50', 5);            // 鑽回草叢
    S.critter = null;
    S.critT = 11 + Math.random()*11;
  }
}

/* ── 主迴圈 ───────────────────────────────────────── */
function stopLoop(){
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}
function ensureLoop(){
  if (raf || !S || S.paused || S.over || S.phase === 'clearing') return;
  lastT = performance.now();
  raf = requestAnimationFrame(loop);
}
function syncPauseState(){
  if (!S) return;
  S.paused = !!(S.manualPaused || S.layoutPaused);
  const btn = document.getElementById('btnPause');
  if (btn) btn.textContent = S.paused ? '▶' : '❚❚';
  applyControlA11y();
  if (S.paused) stopLoop(); else ensureLoop();
}
function startWave(){
  if (!S || S.over || S.phase !== 'setup' || S.waveActive) return false;
  S.waveActive = true;
  S.phase = 'wave';
  S.autoT = 0;
  banner(fmt(L().ui.waveBanner, {lv:S.level}));
  updateHUD();
  ensureLoop();
  return true;
}
function loop(ts){
  raf = 0;
  if (!S || S.paused || S.over || S.phase === 'clearing'){ lastT = ts; return; }
  const frameMs = Math.max(1, ts - lastT);
  if (typeof sampleAutoQuality === 'function') sampleAutoQuality(ts, frameMs);
  if (typeof maybeRaiseAutoQuality === 'function') maybeRaiseAutoQuality(ts);
  const rawDt = Math.min(.05, frameMs/1000);
  lastT = ts;
  if (typeof impactFreeze !== 'undefined' && impactFreeze.remainingMs > 0){
    if (typeof updateImpactFreeze === 'function') updateImpactFreeze(frameMs);
    draw();
    ensureLoop();
    return;
  }
  if (typeof updateLightCharge === 'function') updateLightCharge(rawDt * 1000);
  let dt = rawDt * SPEEDS[speedIdx];
  if (hitStop > 0){ hitStop -= rawDt; dt *= .22; }   // 破門錘慢動作
  const now = performance.now();
  for (let i = 0; i < S.supCd.length; i++) if (S.supCd[i] > 0) S.supCd[i] = Math.max(0, S.supCd[i] - dt);
  // 草地小幫手
  if (!S.critter){
    S.critT -= dt;
    if (S.critT <= 0 && S.waveActive) spawnCritter();
  } else updateCritter(dt, now);
  // 強光手電筒光束
  if (S.beam){
    const b = S.beam;
    const prev = b.pos;
    const limit = (b.axis === 'x' ? W : H) + 60;
    const next = Math.min(limit, prev + b.spd * dt);
    const lo = Math.min(prev, next) - 28;
    const hi = Math.max(prev, next) + 28;
    const dmg = 30 + S.level * 2;
    for (const e of S.enemies){
      if (e.dead || b.hit.has(e)) continue;
      const ep = b.axis === 'x' ? e.x : e.y;
      if (ep >= lo && ep <= hi){
        b.hit.add(e);
        e.markLeft = 4;
        hitEnemy(e, dmg, null);
      }
    }
    b.pos = next;
    if (b.pos >= limit) S.beam = null;
  }

  // 自動出怪倒數（可提前手動按）
  if (S.phase === 'setup' && !S.waveActive && !S.over && S.autoT > 0){
    S.autoT -= dt;
    if (S.autoT <= 0) startWave();
  }
  // 出怪
  if (S.waveActive && S.spawnQ.length){
    S.spawnT -= dt;
    if (S.spawnT <= 0){
      const it = S.spawnQ.shift();
      spawnEnemy(it);
      S.spawnT = it.gap;
    }
  }
  // 敵人
  for (const e of S.enemies){
    if (e.dead) continue;
    e.wob += dt*8;
    if (e.slowLeft > 0){
      e.slowLeft = Math.max(0, e.slowLeft - dt);
      if (!e.slowLeft) e.slowPct = 0;
    }
    if (e.stunLeft > 0) e.stunLeft = Math.max(0, e.stunLeft - dt);
    if (e.tripLeft > 0) e.tripLeft = Math.max(0, e.tripLeft - dt);
    if (e.markLeft > 0) e.markLeft -= dt;
    if (moveEnemy(e, dt)){
      e.dead = true;
      S.hp -= ETYPES[e.ti].dmg;
      burst(e.x, e.y, '#ff5555', 12);
      sfx(60, .25, 'sawtooth');
      shake(6);
      if (S.hp <= 0){ loseLife(); break; }   // 一幀最多扣一命（loseLife 已重置敵人陣列）
    }
  }
  S.enemies = S.enemies.filter(e => !e.dead);
  if (typeof updateDangerState === 'function') updateDangerState(now);
  if (typeof supportAim !== 'undefined' && supportAim && (!supportAim.lastRender || now - supportAim.lastRender >= 250)){
    supportAim.lastRender = now;
    if (typeof renderSupportConfirm === 'function') renderSupportConfirm();
  }
  // gameOver 可能在敵人移動中發生；同一幀不得再讓塔、投射物或志工加分。
  if (S.over){ updateHUD(); draw(); return; }
  // 塔與投射物
  for (const t of S.towers){ t.flash = Math.max(0, t.flash-dt); towerAct(t, dt, now); }
  S.projs = S.projs.filter(p => !moveProj(p, dt));
  // 志工（反向行走，撞擊詐騙，走回傳送門 +1 血）
  for (const a of S.allies){
    a.hitCd = Math.max(0, a.hitCd - dt);
    a.p -= (a.spd / CELL) * dt;
    const P = (S.routes && S.routes[a.ri]) || S.path;
    const seg = Math.max(0, Math.floor(a.p)), prog = Math.max(0, a.p - seg);
    const c = P[Math.min(seg, P.length-1)];
    const n = P[Math.min(seg+1, P.length-1)];
    a.x = (c[0] + (n[0]-c[0])*prog) * CELL + CELL/2;
    a.y = (c[1] + (n[1]-c[1])*prog) * CELL + CELL/2;
    if (a.hitCd <= 0){
      for (const e of S.enemies){
        if (e.dead) continue;
        if ((e.x-a.x)**2 + (e.y-a.y)**2 < 24*24){ hitEnemy(e, 15, null); a.hitCd = .6; break; }
      }
    }
    if (a.p <= 0){
      a.done = true;
      S.hp = Math.min(HP_CAP, S.hp + 1);
      burst(a.x, a.y, '#9be79b', 12);
    }
  }
  S.allies = S.allies.filter(a => !a.done);
  // 粒子
  for (const f of S.fx){
    if (f.zap){ f.life -= dt; continue; }
    if (f.txt){ f.y -= 26*dt; f.life -= dt; continue; }
    if (f.ring){ f.r += (f.max/f.dur)*dt; f.life -= dt; continue; }
    if (f.skid || f.atmGrab || f.roomBlast){ f.life -= dt; continue; }
    f.x+=f.vx*dt; f.y+=f.vy*dt; f.vy+=160*dt; f.life-=dt;
  }
  S.fx = S.fx.filter(f => f.life > 0);

  // 波次結束 → 過關
  if (S.phase === 'wave' && S.waveActive && !S.spawnQ.length && !S.enemies.length && !S.over){
    levelClear();
  }
  updateHUD();
  draw();
  ensureLoop();
}

/* ── 損命／結束 ───────────────────────────────────── */
function loseLife(){
  S.lives--;
  if (S.lives <= 0){ gameOver(false); return; }
  S.hp = HP_START;
  // 只重排仍存活與尚未出現的敵人；不重建已擊破者，避免重複刷獎勵。
  // 存活者保留目前血量，防止行員每次損命後重新對滿血敵人刷命中獎勵。
  const active = S.enemies
    .filter(e => !e.dead)
    .map(e => ({
      ti:e.ti, gap:.25, hpMul:e.hpMax / ETYPES[e.ti].hp,
      hp:e.hp, hpMax:e.hpMax,
      ...(e.dangerWarned ? {dangerWarned:true} : {}),
    }));
  S.spawnQ = active.concat(S.spawnQ);
  S.enemies = []; S.projs = []; S.allies = []; S.beam = null;
  S.critter = null; S.critT = 9 + Math.random()*8;
  S.spawnT = 0;
  S.waveActive = true;
  S.phase = 'wave';
  banner(fmt(L().ui.lifeLost, {n:S.lives}));
}
function gameOver(win){
  if (!S || S.over) return false;
  S.over = true;
  S.waveActive = false;
  S.phase = 'over';
  S.transitionGen++;
  stopLoop();
  if (typeof resetImpactFreeze === 'function') resetImpactFreeze();
  cancelPendingTap();
  if (typeof cancelSupportAction === 'function') cancelSupportAction(false, false);
  if (document.body) document.body.classList.remove('danger-active');
  const dangerEdge = document.getElementById('dangerEdge');
  if (dangerEdge) dangerEdge.classList.add('hidden');
  const t = document.getElementById('endTitle');
  t.textContent = win ? L().ui.winTitle : L().ui.loseTitle;
  // 敗北＝最接近受害者的時刻：切換為安慰提醒場景，絕不嘲諷
  const panel = document.querySelector('#endScreen .panel');
  if (panel && panel.classList) panel.classList.toggle('lose', !win);
  const art = document.getElementById('endArt');
  if (art) art.classList.toggle('hidden', win);
  const cf = document.getElementById('endComfort');
  if (cf){
    cf.classList.toggle('hidden', win);
    if (!win) cf.innerHTML = L().ui.loseComfort;
  }
  document.getElementById('endStats').innerHTML =
    (win ? L().ui.endWin : L().ui.endLose) +
    fmt(L().ui.endStats, {lv:S.level, k:S.kills, s:S.score, t:escapeHtml(L().ui.tip165)});
  document.getElementById('btnSaveScore').disabled = false;
  document.getElementById('btnSaveScore').textContent = L().ui.btnSave;
  show('endScreen');
  if (win){ sfx(880, .5); }
  else {   // 溫柔的上行三音：安慰與希望，而非失敗嘲弄
    sfx(392, .25, 'sine');
    guardedTimeout(() => sfx(494, .3, 'sine'), 220);
    guardedTimeout(() => sfx(587, .5, 'sine'), 470);
  }
  announceStatus(t.textContent);
  return true;
}

/* ── 過關流程：轉場 →（每3關測驗）→ 下一關 ────────── */
function levelClear(){
  if (!S || S.over || S.phase === 'clearing') return false;
  if (S.phase !== 'wave' || S.spawnQ.length || S.enemies.length) return false;
  S.phase = 'clearing';
  S.waveActive = false;
  S.autoT = 0;
  const token = ++S.transitionGen;
  stopLoop();
  if (typeof resetImpactFreeze === 'function') resetImpactFreeze();
  cancelPendingTap();
  closeTowerMenu();
  closeBuildMenu();
  if (typeof cancelSupportAction === 'function') cancelSupportAction(false, false);
  const clearScoreGain = 50 + S.level * 5;
  S.score += clearScoreGain;
  if (typeof queueScoreGain === 'function') queueScoreGain(clearScoreGain);
  S.coins += 40 + Math.floor(S.level * 2) + Math.floor(S.coins * .05); // 過關獎勵＋5% 利息
  if (typeof guardedTimeout === 'function') guardedTimeout(() => {
    if (document.body) document.body.classList.remove('danger-active');
    const edge = document.getElementById('dangerEdge');
    const alert = document.getElementById('dangerAlert');
    const wave = document.getElementById('waveBanner');
    if (edge) edge.classList.add('hidden');
    if (alert) alert.textContent = '';
    if (wave && wave.textContent === L().ui.dangerAlert) wave.classList.add('hidden');
  }, 2000, token);
  if (S.level >= MAX_LEVEL){ playClearFx(() => gameOver(true), token); return true; }
  playClearFx(() => {
    if (S.level % 3 === 0) showQuiz(() => afterQuiz(token), token);
    else afterQuiz(token);
  }, token);
  return true;
}
function afterQuiz(token){
  if (!S || S.over || S.phase !== 'clearing' || S.transitionGen !== token) return;
  S.level++;
  genLevel(S.level);
  S.autoT = 10;
  if (S.level === 4) maybeOfferInstall();          // 玩家已投入：溫和提議加入主畫面
  const modName = L().ui.mods[S.mod.key];
  const modTag = modName ? `　${modName}` : '';
  const supNews = SUPPORT.map((s,i) => ({s,i})).filter(o => o.s.unlock === S.level);
  if (supNews.length){
    banner(fmt(L().support.unlock, {name:L().support.names[supNews[0].i]}));
    sfx(520,.1); sfx(780,.1); sfx(1040,.15);
    updateHUD();
    ensureLoop();
    return;
  }
  const news = TOWERS.map((t,i) => ({t,i})).filter(o => o.t.unlock === S.level);
  banner(news.length
    ? fmt(L().ui.unlockBanner, {names:news.map(o => L().towers[o.i]).join(LANG === 'zh' ? '、' : ', '), mod:modTag})
    : fmt(L().ui.stageBanner, {lv:S.level, boss:S.level%10===0?L().ui.bossTag:'', mod:modTag}));
  if (news.length){ sfx(520,.1); sfx(780,.1); sfx(1040,.15); }
  updateHUD();
  ensureLoop();
}

/* ── 快打旋風式過關轉場 ───────────────────────────── */
function playClearFx(cb, token){
  if (!S || S.phase !== 'clearing' || S.transitionGen !== token) return;
  const fx = document.getElementById('stageClear');
  document.getElementById('clearWordEn').textContent =
    `STAGE ${S.level} ` + CLEAR_EN[Math.floor(Math.random()*CLEAR_EN.length)];
  document.getElementById('clearWordZh').textContent =
    L().ui.clear[Math.floor(Math.random()*L().ui.clear.length)];
  const clearScore = document.getElementById('clearScore');
  if (clearScore) clearScore.textContent = fmt(L().ui.clearScore, {
    gain:Math.max(0, S.score - S.stageScoreStart), total:S.score,
  });
  document.getElementById('clearTip').textContent = '💡 ' + L().tips[(S.level - 1) % L().tips.length];
  fx.classList.remove('hidden','out');
  fx.setAttribute('aria-hidden', 'false');
  announceStatus(document.getElementById('clearWordZh').textContent);
  sfx(660,.1);
  guardedTimeout(()=>sfx(880,.12),120,token);
  guardedTimeout(()=>sfx(1180,.2),260,token);
  guardedTimeout(() => fx.classList.add('out'), 2000, token);
  guardedTimeout(() => {
    fx.classList.add('hidden');
    fx.setAttribute('aria-hidden', 'true');
    cb();
  }, 2350, token);
}

/* ── 續命測驗（避開詐騙 → +1 命） ─────────────────── */
let quizUsed = [];
function showQuiz(cb, token){
  if (!S || S.phase !== 'clearing' || S.transitionGen !== token) return;
  const QZ = L().quiz;
  let pool = QZ.map((q,i)=>i).filter(i => !quizUsed.includes(i));
  if (!pool.length){ quizUsed = []; pool = QZ.map((q,i)=>i); }
  const qi = pool[Math.floor(Math.random()*pool.length)];
  quizUsed.push(qi);
  const q = QZ[qi];
  document.getElementById('quizMsg').textContent = q.m;
  const bGood = document.getElementById('quizGood');
  const bBad  = document.getElementById('quizBad');
  const res   = document.getElementById('quizResult');
  res.className = 'quiz-result hidden'; res.textContent = '';
  // 左右隨機
  const goodLeft = Math.random() < .5;
  (goodLeft?bBad:bGood).style.order = 2;
  (goodLeft?bGood:bBad).style.order = 1;
  bGood.textContent = q.good; bBad.textContent = q.bad;
  bGood.disabled = bBad.disabled = false;
  let settled = false;
  const done = (ok) => {
    if (settled || !S || S.phase !== 'clearing' || S.transitionGen !== token) return;
    settled = true;
    bGood.disabled = bBad.disabled = true;
    res.classList.remove('hidden');
    if (ok){
      const gained = S.lives < LIVES_CAP;
      if (gained) S.lives++;
      res.classList.add('ok');
      res.textContent = (gained ? L().ui.quizOkLife : L().ui.quizOkFull) + '\n' + q.why;
      if (!gained){
        S.score += 100;
        if (typeof queueScoreGain === 'function') queueScoreGain(100);
      }
      sfx(880,.15); guardedTimeout(()=>sfx(1320,.2),130,token);
    } else {
      S.hp = Math.max(1, S.hp - 5);
      res.classList.add('no');
      res.textContent = L().ui.quizNo + '\n' + q.why;
      sfx(70,.3,'sawtooth');
    }
    updateHUD();
    guardedTimeout(() => { hide('quizScreen'); cb(); }, 2600, token);
  };
  bGood.onclick = () => done(true);
  bBad.onclick  = () => done(false);
  show('quizScreen');
}

/* ══ 繪圖與詐團造型（draw／paintGround／shake／SCAM_BODY 等）已抽至 render.js ══ */
/* ══ UI／建造面板／畫布互動／塔選單／商店／排行榜（含 $ 與 escapeHtml）已抽至 ui.js ══ */

/* ── 中途轉向：場上狀態無損轉置 ───────────────────── */
function relayout(){
  const mode = detectLayout();
  if (mode === LAYOUT) return;
  const flip = (LAYOUT === 'mport') !== (mode === 'mport');   // 直↔橫才需轉置
  applyLayout(mode);
  if (S && flip){
    S.routes = (S.routes && S.routes.length ? S.routes : [S.path]).map(rt => rt.map(([x, y]) => [y, x]));
    S.path = S.routes[0];
    S.pathWide = (S.pathWide || []).map(([x, y]) => [y, x]);
    S.branchCells = (S.branchCells || []).map(([x, y]) => [y, x]);
    S.grid = Array.from({length:ROWS}, () => Array(COLS).fill(0));
    for (const [x, y] of S.path) S.grid[y][x] = 1;
    for (const [x, y] of S.branchCells) S.grid[y][x] = 1;
    for (const [x, y] of S.pathWide) if (S.grid[y] && S.grid[y][x] === 0) S.grid[y][x] = 1;
    for (const t of S.towers){
      const ngx = t.gy, ngy = t.gx;
      t.gx = ngx; t.gy = ngy;
      t.x = t.gx*CELL + CELL/2; t.y = t.gy*CELL + CELL/2;
      S.grid[t.gy][t.gx] = 2;
    }
    // 正方格：像素座標轉置＝x/y 互換
    for (const e of S.enemies){ const tx = e.x; e.x = e.y; e.y = tx; }
    for (const a of S.allies){ const tx = a.x; a.x = a.y; a.y = tx; }
    if (S.critter){ const tx = S.critter.x; S.critter.x = S.critter.y; S.critter.y = tx; }
    for (const p of S.projs){ const tx = p.x; p.x = p.y; p.y = tx; }
    for (const f of S.fx){
      if (Number.isFinite(f.x) && Number.isFinite(f.y)){
        const tx = f.x; f.x = f.y; f.y = tx;
      }
      if (Number.isFinite(f.x1) && Number.isFinite(f.y1)){
        const tx1 = f.x1; f.x1 = f.y1; f.y1 = tx1;
      }
      if (Number.isFinite(f.x2) && Number.isFinite(f.y2)){
        const tx2 = f.x2; f.x2 = f.y2; f.y2 = tx2;
      }
      if (Number.isFinite(f.vx) && Number.isFinite(f.vy)){
        const tv = f.vx; f.vx = f.vy; f.vy = tv;
      }
    }
    if (S.beam) S.beam.axis = S.beam.axis === 'x' ? 'y' : 'x';
    if (kbFocus){
      const kgx = kbFocus.gx;
      kbFocus.gx = Math.min(COLS - 1, kbFocus.gy);
      kbFocus.gy = Math.min(ROWS - 1, kgx);
    }
    buildGround();
    cancelPendingTap();
    closeTowerMenu(); closeBuildMenu(); resetView(); selShop = -1;
    if (typeof cancelSupportAction === 'function') cancelSupportAction(false, false);
    // 暫停 0.6 秒讓玩家重新定位
    S.layoutPaused = true;
    const state = S;
    const gen = runGen;
    const pauseGen = ++layoutPauseGen;
    syncPauseState();
    setTimeout(() => {
      if (gen !== runGen || state !== S || pauseGen !== layoutPauseGen) return;
      state.layoutPaused = false;
      syncPauseState();
    }, 600);
    banner(L().ui.viewSwitched);
    updateHUD();
    draw();
  } else if (S){
    buildGround();
  }
}
window.addEventListener('resize', relayout);
try{
  if (window.matchMedia){
    const mq = matchMedia('(orientation: portrait)');
    if (mq.addEventListener) mq.addEventListener('change', relayout);
  }
}catch(e){}

/* ── 套用語言／畫面切換／PWA 安裝提示已抽至 ui.js ── */

/* ── Service Worker 更新交接與快取命中統計 ───────── */
let cHit = 0, cMiss = 0;
let swRegistration = null;
let updateReloading = false;
function showPwaUpdate(){
  const bar = document.getElementById('pwaUpdateBar');
  const install = document.getElementById('pwaBar');
  if (install) install.classList.add('hidden');
  if (bar) bar.classList.remove('hidden');
}
function requestPwaUpdate(){
  if (updateReloading) return;
  updateReloading = true;
  if (swRegistration && swRegistration.waiting){
    swRegistration.waiting.postMessage({type:'SKIP_WAITING'});
    return;
  }
  window.location.reload();
}
const pwaUpdateNow = document.getElementById('pwaUpdateNow');
if (pwaUpdateNow) pwaUpdateNow.addEventListener('click', requestPwaUpdate);
function paintCache(){
  const total = cHit + cMiss;
  $('cacheStat').textContent = APP_VERSION + (BRANCH_TAG ? ` 🔧${BRANCH_TAG}` : '') + (total
    ? ` | CACHE ${Math.round(cHit/total*100)}% (${cHit}/${total})`
    : ' | CACHE --');
}
if ('serviceWorker' in navigator){
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(registration => {
    swRegistration = registration;
    if (registration.waiting && navigator.serviceWorker.controller) showPwaUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showPwaUpdate();
      });
    });
  }).catch(()=>{});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController){ hadController = true; return; }
    if (updateReloading) window.location.reload();
    else showPwaUpdate();
  });
  navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data && ev.data.asmdCache !== undefined){
      ev.data.asmdCache ? cHit++ : cMiss++;
      paintCache();
    }
  });
}
// 後備：用 Performance API 估算（transferSize 0 = 來自快取）
window.addEventListener('load', () => {
  paintCache();
  setTimeout(() => {
    if (cHit + cMiss) return; // SW 已回報
    const res = performance.getEntriesByType('resource');
    res.forEach(r => { (r.transferSize === 0 && r.decodedBodySize > 0) ? cHit++ : cMiss++; });
    paintCache();
  }, 1200);
});

/* ── 開機：套用初始語言（applyI18n 定義在 ui.js，需等全部 script 載入後執行） ── */
applyI18n();
