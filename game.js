/* ═══════════════════════════════════════════════════════════
   防詐迷宮 SCAM MAZE DEFENSE
   87 關像素塔防・純 HTML+CSS+JS・可部署 GitHub Pages
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ── 版本 ─────────────────────────────────────────── */
const APP_VERSION = 'v2.1.1';

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

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

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

/* ── 武器（防詐塔）資料 ───────────────────────────── */
const TOWERS = [
  { name:'超商工讀生', cost:40,  range:85,  dmg:4,  rate:.35, color:'#57e389', glyph:'🏪', unlock:1 },
  { name:'165專線塔', cost:60,  range:115, dmg:7,  rate:.45, color:'#26a269', glyph:'165', unlock:1 },
  { name:'查證雷達',   cost:80,  range:105, dmg:3,  rate:.7,  color:'#33d0ff', glyph:'🔍', slow:.45, slowT:1.6, unlock:1 },
  { name:'銀行行員',   cost:90,  range:100, dmg:5,  rate:.8,  color:'#f5c211', glyph:'🏦', bounty:3, unlock:1 },
  { name:'防火牆',     cost:100, range:95,  dmg:10, rate:1.0, color:'#e5a50a', glyph:'🛡', splash:60, unlock:1 },
  { name:'警察',       cost:120, range:125, dmg:18, rate:1.2, color:'#1a5fb4', glyph:'👮', stun:.6, unlock:1 },
  { name:'宣導廣播',   cost:140, range:185, dmg:26, rate:1.5, color:'#ef476f', glyph:'📢', unlock:1 },
  /* ── 隨關卡解鎖的進階武器 ── */
  { name:'里長廣播站', cost:110, range:120, dmg:0,  rate:0,   color:'#ff9e36', glyph:'🔊', buff:1/1.3, unlock:5 },  // 範圍內塔攻速+30%（冷卻×0.769）
  { name:'記者爆料塔', cost:130, range:135, dmg:2,  rate:.9,  color:'#c061cb', glyph:'📰', mark:2.5, unlock:8  },  // 被標記者受傷+50%
  { name:'現身說法志工',cost:180, range:110, dmg:0,  rate:0,   color:'#ffd166', glyph:'🎗', convert:.35, unlock:10 }, // 陣亡詐騙轉化為志工
  { name:'電信攔截塔', cost:150, range:140, dmg:80, rate:6,   color:'#00b8a9', glyph:'📵', zap:true, unlock:13 },  // 定期已讀刪除最弱詐騙
  { name:'阿嬤智慧塔', cost:160, range:100, dmg:8,  rate:1.4, color:'#f66151', glyph:'👵', knock:2, unlock:16 },  // 罵到倒退嚕
  { name:'檢察官起訴塔',cost:200, range:130, dmg:6,  rate:1.0, color:'#813d9c', glyph:'⚖', execute:.2, unlock:20 }, // 低血量直接定罪
];
const UP_MULT = { dmg:1.55, range:1.12 };
const MAX_TLV = 3;

/* ── 詐騙敵人資料 ─────────────────────────────────── */
const ETYPES = [
  { key:'phish',  name:'釣魚簡訊', hp:15,  spd:62, gold:6,  dmg:1, score:10,  c1:'#6fc3df', c2:'#2b6a84', face:'✉' },
  { key:'shop',   name:'假網拍',   hp:30,  spd:46, gold:8,  dmg:1, score:15,  c1:'#b78ef0', c2:'#5d3f8f', face:'¥' },
  { key:'invest', name:'假投資',   hp:55,  spd:40, gold:12, dmg:2, score:25,  c1:'#f0c419', c2:'#8f7311', face:'$' },
  { key:'police', name:'假檢警',   hp:120, spd:27, gold:20, dmg:3, score:50,  c1:'#8a94a6', c2:'#3d4451', face:'⚖' },
  { key:'boss',   name:'AI深偽魔王',hp:420, spd:20, gold:90, dmg:5, score:300, c1:'#ef476f', c2:'#7a1030', face:'AI', boss:true },
];

/* ── 過關轉場英文字（各語言共用的視覺元素） ──────── */
const CLEAR_EN = ['STAGE CLEAR!','SCAM BUSTED!','PERFECT!','YOU WIN!','K.O.!','GREAT!'];

/* ── 特種部隊支援（主動技能：冷卻制、點地圖施放） ── */
const SUPPORT = [
  { key:'ram',   cd:40, unlock:3,  color:'#ff7b39' },   // 破門錘
  { key:'flash', cd:55, unlock:7,  color:'#fff3b0' },   // 震撼彈
  { key:'light', cd:50, unlock:11, color:'#9be7ff' },   // 強光手電筒
];

/* ── 草地小幫手（隨機跳出協助的小動物） ──────────── */
const CRITTERS = ['squirrel','bee','worm','bug'];

/* ── 關卡修飾事件（數值定義；顯示名稱在 i18n.js） ─── */
const MODS = [
  { key:'none',  spd:1,    range:1,   gold:0, count:1,   hpAdj:1 },
  { key:'rush',  spd:1.25, range:1,   gold:0, count:1,   hpAdj:.95 },
  { key:'fog',   spd:1,    range:.85, gold:0, count:1,   hpAdj:1 },
  { key:'gold',  spd:1,    range:1,   gold:2, count:1,   hpAdj:1.05 },
  { key:'horde', spd:1,    range:1,   gold:0, count:1.3, hpAdj:.8 },
];

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
    path:[], grid:[], spawnQ:[], spawnT:0,
    playing:false, waveActive:false, over:false, paused:false,
    manualPaused:false, layoutPaused:false,
    phase:'setup', transitionGen:0,
    autoT:0, mod:MODS[0],
    supCd:[0,0,0], beam:null,
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
function genLevel(lv){
  closeTowerMenu();            // 防幽靈塔選單（換關後殘留的雙重退款漏洞）
  if (typeof closeBuildMenu === 'function') closeBuildMenu();
  if (typeof cancelSupportAction === 'function') cancelSupportAction(false, false);
  let cells = genMajorPath(lv);
  if (LAYOUT === 'mport') cells = cells.map(([x, y]) => [y, x]);  // 直立：上→下防守
  S.path = cells;
  S.grid = Array.from({length:ROWS}, () => Array(COLS).fill(0));
  for (const [x,y] of cells) S.grid[y][x] = 1;           // 1=路
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

/* ── 波次組成 ─────────────────────────────────────── */
function buildWave(lv){
  const q = [];
  const hpMul = (1 + lv * .12 + Math.pow(lv/16, 2)) * (S.mod ? S.mod.hpAdj : 1); // 曲線軟化＋事件調整
  const push = (ti, n, gap) => { for(let i=0;i<n;i++) q.push({ti, gap, hpMul}); };
  if (lv % 10 === 0){                                    // 魔王關
    push(4, 1 + Math.floor(lv/30), 2.2);
    push(3, Math.min(4, 1+Math.floor(lv/20)), 1.4);
  } else {
    push(0, 5 + Math.floor(lv*.7), .8);
    if (lv >= 3)  push(1, 2 + Math.floor(lv*.4), 1.0);
    if (lv >= 6)  push(2, 1 + Math.floor(lv*.3), 1.2);
    if (lv >= 12) push(3, Math.floor(lv*.15), 1.6);
  }
  // 洗牌（保留些微群聚感：分段洗）
  const rng = RNG(lv*31+7);
  for (let i=q.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [q[i],q[j]]=[q[j],q[i]]; }
  if (S.mod && S.mod.count > 1){            // 人海戰術：加量
    const extra = Math.floor(q.length * (S.mod.count - 1));
    for (let i=0;i<extra;i++) q.push({ ...q[Math.floor(rng()*q.length)] });
  }
  S.spawnQ = q; S.spawnT = 0; S.waveActive = false; S.phase = 'setup';
  S.dangerWaveAlerted = false; S.dangerHapticDone = false; S.dangerFinal = false;
  S.dangerCount = 0; S.dangerClearSince = 0; S.dangerEdgeTarget = null;
}

function startRouteGuide(){
  if (!S) return;
  S.routeGuide = {
    active:true,
    started:performance.now(),
    duration:S.level <= 3 ? 1000 : 700,
  };
}
function finishRouteGuide(){
  if (!S || !S.routeGuide || !S.routeGuide.active) return false;
  S.routeGuide.active = false;
  return true;
}

/* ── 敵人 ─────────────────────────────────────────── */
function spawnEnemy(item){
  const t = ETYPES[item.ti];
  const hpMax = Number.isFinite(item.hpMax) ? item.hpMax : t.hp * item.hpMul;
  const hp = Number.isFinite(item.hp) ? Math.max(1, Math.min(hpMax, item.hp)) : hpMax;
  S.enemies.push({
    ti:item.ti, hp, hpMax,
    seg:0, prog:0, x:S.path[0][0]*CELL+CELL/2, y:S.path[0][1]*CELL+CELL/2,
    spd:t.spd, slowLeft:0, slowPct:0, stunLeft:0,
    markLeft:0, dead:false, wob:Math.random()*6.28,
    dangerWarned:!!item.dangerWarned, dangerActive:false,
  });
}
function moveEnemy(e, dt){
  const stopped = e.stunLeft > 0;
  let sp = stopped ? 0 : e.spd * S.mod.spd * (e.slowLeft > 0 ? (1 - e.slowPct) : 1);
  let dist = sp * dt;
  while (dist > 0 && e.seg < S.path.length - 1){
    const [ax,ay] = S.path[e.seg], [bx,by] = S.path[e.seg+1];
    const segLen = CELL; // 相鄰格
    const remain = (1 - e.prog) * segLen;
    if (dist < remain){ e.prog += dist/segLen; dist = 0; }
    else { dist -= remain; e.seg++; e.prog = 0; }
    const [cx,cy] = S.path[e.seg];
    const nx = e.seg < S.path.length-1 ? S.path[e.seg+1] : [cx,cy];
    e.x = (cx + (nx[0]-cx)*e.prog) * CELL + CELL/2;
    e.y = (cy + (nx[1]-cy)*e.prog) * CELL + CELL/2;
  }
  if (e.seg >= S.path.length - 1) return true;  // 抵達民眾家
  return false;
}

function enemyPathProgress(e){
  const total = Math.max(1, S.path.length - 1);
  return Math.max(0, Math.min(1, (e.seg + e.prog) / total));
}
function placeDangerEdge(target){
  const edge = document.getElementById('dangerEdge');
  if (!edge || !target || view.scale <= 1.01){
    if (edge) edge.classList.add('hidden');
    if (S) S.dangerEdgeTarget = null;
    return;
  }
  const sx = target.x * view.scale + view.ox;
  const sy = target.y * view.scale + view.oy;
  if (sx >= 12 && sx <= W-12 && sy >= 12 && sy <= H-12){
    edge.classList.add('hidden');
    S.dangerEdgeTarget = null;
    return;
  }
  const rect = cv.getBoundingClientRect();
  const stageRect = document.getElementById('stage').getBoundingClientRect();
  const margin = 26;
  const px = rect.left - stageRect.left + Math.max(margin, Math.min(W-margin, sx)) * rect.width / W;
  const py = rect.top - stageRect.top + Math.max(margin, Math.min(H-margin, sy)) * rect.height / H;
  edge.style.left = Math.max(0, Math.min(stageRect.width-58, px-28)) + 'px';
  edge.style.top = Math.max(0, Math.min(stageRect.height-48, py-22)) + 'px';
  S.dangerEdgeTarget = target;
  edge.classList.remove('hidden');
}
function updateDangerState(now){
  if (!S) return;
  const dangerous = [];
  let finalCount = 0;
  for (const e of S.enemies){
    if (e.dead) continue;
    const progress = enemyPathProgress(e);
    if (progress >= .8){
      e.dangerActive = true;
      if (!e.dangerWarned) e.dangerWarned = true;
    } else if (progress < .75) e.dangerActive = false;
    if (e.dangerActive){
      dangerous.push(e);
      if (progress >= .92) finalCount++;
    }
  }
  dangerous.sort((a,b) => enemyPathProgress(b) - enemyPathProgress(a));
  if (dangerous.length && !S.dangerWaveAlerted){
    S.dangerWaveAlerted = true;
    banner(L().ui.dangerAlert);
    const alert = document.getElementById('dangerAlert');
    if (alert) alert.textContent = L().ui.dangerAlert;
    if (!S.dangerHapticDone){
      S.dangerHapticDone = true;
      triggerHaptic(40);
    }
  }
  S.dangerFinal = finalCount > 0;
  S.dangerCount = dangerous.length;
  if (dangerous.length) S.dangerClearSince = 0;
  else if (!S.dangerClearSince) S.dangerClearSince = now;
  if (now - S.dangerLastDom >= 250){
    S.dangerLastDom = now;
    const holdVisual = dangerous.length || (S.dangerClearSince && now - S.dangerClearSince < 2000);
    if (document.body) document.body.classList.toggle('danger-active', !!holdVisual);
    if (!holdVisual){
      const waveBanner = document.getElementById('waveBanner');
      if (waveBanner && waveBanner.textContent === L().ui.dangerAlert) waveBanner.classList.add('hidden');
      const alert = document.getElementById('dangerAlert');
      if (alert) alert.textContent = '';
    }
    const offscreen = dangerous.filter(e => {
      const sx = e.x * view.scale + view.ox, sy = e.y * view.scale + view.oy;
      return sx < 12 || sx > W-12 || sy < 12 || sy > H-12;
    });
    const edge = document.getElementById('dangerEdge');
    if (edge) edge.textContent = `⚠ ×${offscreen.length}`;
    placeDangerEdge(offscreen[0] || null);
  }
}

/* ── 塔攻擊 ───────────────────────────────────────── */
function buffFactor(t){
  // 里長廣播站光環：範圍內的塔攻速提升
  for (const o of S.towers){
    const s = TOWERS[o.ti];
    if (!s.buff || o === t) continue;
    const range = o.range * S.mod.range;
    if ((o.x-t.x)**2 + (o.y-t.y)**2 <= range*range) return s.buff;
  }
  return 1;
}
function towerAct(t, dt, now){
  const spec = TOWERS[t.ti];
  if (spec.buff || spec.convert) return;        // 光環塔不主動攻擊
  t.cd -= dt;
  if (t.cd > 0) return;
  const range = t.range * S.mod.range;    // 大霧事件會縮短射程
  let best = null, bestProg = -1;
  for (const e of S.enemies){
    if (e.dead) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    if (dx*dx + dy*dy <= range*range){
      const p = e.seg + e.prog;
      if (p > bestProg){ bestProg = p; best = e; }
    }
  }
  if (!best) return;
  t.cd = spec.rate * buffFactor(t);
  t.flash = .12;
  if (spec.zap){                                 // 電信攔截：最弱詐騙「已讀刪除」
    let weak = null;
    for (const e of S.enemies){
      if (e.dead) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      if (dx*dx + dy*dy <= range*range && (!weak || e.hp < weak.hp)) weak = e;
    }
    if (weak){
      S.fx.push({ zap:true, x1:t.x, y1:t.y, x2:weak.x, y2:weak.y, life:.25, color:spec.color });
      hitEnemy(weak, ETYPES[weak.ti].boss ? t.dmg : weak.hp + 9999, t);
      sfx(1200, .1, 'triangle');
    }
    return;
  }
  S.projs.push({
    x:t.x, y:t.y, tx:best, dmg:t.dmg, spd:520,
    color:spec.color, ti:t.ti,
    splash:spec.splash ? spec.splash : 0,
    slow:spec.slow||0, slowT:spec.slowT||0,
    stun:spec.stun||0, bounty:spec.bounty||0,
    mark:spec.mark||0, knock:spec.knock||0, execute:spec.execute||0,
    wave:spec.glyph === '📢',
  });
  sfx(spec.glyph==='📢'?200:420+t.ti*60, .04);
}

function hitEnemy(e, dmg, src){
  if (!S || S.over || !e || e.dead) return;
  if (e.markLeft > 0) dmg *= 1.5;  // 記者爆料：已曝光傷害+50%
  e.hp -= dmg;
  if (src && src.bounty) S.coins += src.bounty;   // 行員攔阻匯款：命中回收點數
  const t = ETYPES[e.ti];
  // 檢察官起訴：血量低於門檻直接定罪（魔王除外）
  if (src && src.execute && !t.boss && e.hp > 0 && e.hp <= e.hpMax * src.execute) e.hp = 0;
  if (e.hp <= 0 && !e.dead){
    e.dead = true;
    S.kills++;
    S.coins += t.gold + (S.mod.gold || 0);   // 豐收日加成
    const scoreGain = Math.round(t.score * (1 + S.level*.02));
    S.score += scoreGain;
    if (typeof queueScoreGain === 'function') queueScoreGain(scoreGain);
    S.hp = Math.min(HP_CAP, S.hp + 1);        // ★ 識別詐騙 → 血量+1
    burst(e.x, e.y, t.c1, t.boss?26:10);
    S.fx.push({ txt:fmt(L().ui.killFloat, {name:L().enemies[e.ti]}), x:e.x, y:e.y-16, life:.9 });
    sfx(90, .08, 'sawtooth');
    tryConvert(e);
  }
}
/* 現身說法志工：在志工塔範圍內陣亡的詐騙，有機率轉化為反向行走的志工 */
function tryConvert(e){
  for (const tw of S.towers){
    const spec = TOWERS[tw.ti];
    if (!spec.convert) continue;
    const range = tw.range * S.mod.range;
    if ((e.x-tw.x)**2 + (e.y-tw.y)**2 > range*range) continue;
    if (Math.random() < spec.convert){
      S.allies.push({ p: e.seg + e.prog, spd:55, hitCd:0, x:e.x, y:e.y, done:false });
      burst(e.x, e.y, '#ffd166', 14);
      banner(L().ui.convert);
      sfx(660,.1); sfx(880,.12);
      break;
    }
  }
}

/* ── 投射物 ───────────────────────────────────────── */
function landProj(p, e){
  if (p.splash){
    burst(e.x, e.y, p.color, 8);
    for (const o of S.enemies){
      if (o.dead) continue;
      if ((o.x-e.x)**2 + (o.y-e.y)**2 <= p.splash*p.splash) hitEnemy(o, p.dmg, p);
    }
  } else {
    hitEnemy(e, p.dmg, p);
  }
  if (p.slow && !e.dead){
    e.slowLeft = Math.max(e.slowLeft, p.slowT);
    e.slowPct = Math.max(e.slowPct, p.slow);
  }
  if (p.stun && !e.dead) e.stunLeft = Math.max(e.stunLeft || 0, p.stun);
  if (p.mark && !e.dead) e.markLeft = Math.max(e.markLeft, p.mark);
  if (p.knock && !ETYPES[e.ti].boss && !e.dead){
    e.seg = Math.max(0, e.seg - p.knock); e.prog = 0;
  }
}

function moveProj(p, dt){
  const e = p.tx;
  if (!e || e.dead){ return true; }
  const dx = e.x - p.x, dy = e.y - p.y;
  const d = Math.hypot(dx, dy);
  const travel = p.spd * dt;
  // 以整段移動做碰撞夾取；3 倍速或低幀時也不會一步跨過目標。
  if (d <= 14 || travel >= Math.max(0, d - 14)){
    landProj(p, e);
    return true;
  }
  if (d > 0){
    p.x += dx/d * travel;
    p.y += dy/d * travel;
  }
  return false;
}

/* ── 粒子特效 ─────────────────────────────────────── */
function burst(x, y, color, n){
  if (LAYOUT !== 'desktop') n = Math.max(3, Math.floor(n / 2));   // 行動裝置粒子減半
  if (actualQuality === 'compact') n = Math.max(2, Math.floor(n * .55));
  else if (actualQuality === 'minimum') n = Math.max(1, Math.floor(n * .25));
  for (let i=0;i<n;i++){
    const a = Math.random()*6.28, v = 40+Math.random()*140;
    S.fx.push({x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:.5+Math.random()*.3, color});
  }
}

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

/* ── 特種部隊支援施放 ─────────────────────────────── */
function supportCounts(i, x, y){
  const live = S ? S.enemies.filter(e => !e.dead) : [];
  if (i === 0){
    const hits = live.filter(e => (e.x-x)**2 + (e.y-y)**2 <= 95*95);
    return { hits:hits.length, knockbacks:hits.filter(e => !ETYPES[e.ti].boss).length, localHits:hits.length, globalHits:live.length };
  }
  const localHits = live.filter(e => (e.x-x)**2 + (e.y-y)**2 <= 140*140).length;
  return { hits:live.length, knockbacks:0, localHits, globalHits:live.length };
}
function renderSupportConfirm(){
  const panel = document.getElementById('supportConfirm');
  if (!panel) return;
  if (!supportAim){ panel.classList.add('hidden'); return; }
  const counts = supportCounts(supportAim.i, supportAim.x, supportAim.y);
  Object.assign(supportAim, counts);
  const title = document.getElementById('scTitle');
  const summary = document.getElementById('scSummary');
  const ok = document.getElementById('scOk');
  if (title) title.textContent = L().support.confirmTitle;
  if (summary) summary.textContent = supportAim.i === 0
    ? fmt(L().support.ramPreview, {hits:counts.hits, knocks:counts.knockbacks})
    : fmt(L().support.flashPreview, {global:counts.globalHits, local:counts.localHits});
  if (ok){
    ok.textContent = L().support.confirm;
    ok.disabled = supportAim.i === 0 ? counts.hits === 0 : counts.globalHits === 0;
  }
  const no = document.getElementById('scNo');
  if (no) no.setAttribute('aria-label', L().support.cancel);
  panel.classList.remove('hidden');
}
function cancelSupportAction(update=true, restoreBuild=true){
  lightCharge = { active:false, remainingMs:0, token:lightCharge.token+1 };
  selSup = -1;
  supportAim = null;
  const panel = document.getElementById('supportConfirm');
  if (panel) panel.classList.add('hidden');
  const restoredBuild = restoreBuild ? restoreSuspendedBuildMenu() : (discardSuspendedBuildMenu(), false);
  if (update && S){ updateHUD(); draw(); }
  return restoredBuild;
}
function beginSupportAim(i){
  cancelSupportAction(false, true);
  suspendBuildMenu();
  selSup = i;
  supportAim = null;
  closeTowerMenu(); selShop = -1;
  banner(L().support.aim);
  updateHUD(); focusBoard();
}
function setSupportTarget(i, x, y){
  if (!S || selSup !== i || (i !== 0 && i !== 1)) return;
  supportAim = { i, x, y };
  renderSupportConfirm();
  draw();
}
function confirmSupportTarget(){
  if (!S || !supportAim || selSup !== supportAim.i) return false;
  const counts = supportCounts(supportAim.i, supportAim.x, supportAim.y);
  const allowed = supportAim.i === 0 ? counts.hits > 0 : counts.globalHits > 0;
  if (!allowed) return false;
  useSupport(supportAim.i, supportAim.x, supportAim.y);
  return true;
}
function startLightCharge(){
  if (!S || S.enemies.every(e => e.dead)) return false;
  if (lightCharge.active){ cancelSupportAction(); return false; }
  cancelSupportAction(false, true);
  suspendBuildMenu();
  const token = lightCharge.token + 1;
  lightCharge = { active:true, remainingMs:LIGHT_CHARGE_MS, token };
  selSup = 2; selShop = -1; closeTowerMenu();
  banner(fmt(L().support.lightCharge, {dir:LAYOUT === 'mport' ? L().support.vertical : L().support.horizontal}));
  updateHUD();
  return true;
}
function updateLightCharge(elapsedMs){
  if (!lightCharge.active) return false;
  if (!S || S.over || S.enemies.every(e => e.dead)){
    cancelSupportAction();
    return false;
  }
  if (S.paused || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return false;
  lightCharge.remainingMs = Math.max(0, lightCharge.remainingMs - elapsedMs);
  if (lightCharge.remainingMs > 0) return false;
  return useSupport(2, 0, 0);
}
function useSupport(i, px, py){
  const sp = SUPPORT[i];
  if (!S || !sp || S.level < sp.unlock || S.supCd[i] > 0) return false;
  S.supCd[i] = sp.cd;
  lightCharge = { active:false, remainingMs:0, token:lightCharge.token+1 };
  selSup = -1; supportAim = null;
  discardSuspendedBuildMenu();
  closeBuildMenu(false);
  const supportPanel = document.getElementById('supportConfirm');
  if (supportPanel) supportPanel.classList.add('hidden');
  banner(L().support.arrive);
  if (sp.key === 'ram'){
    // 破門錘：重擊＋擊退＋慢動作
    hitStop = .35;
    shake(22);
    screenFlash('rgba(255,120,40,.4)');
    sfxBoom(70);
    for (let k = 0; k < 3; k++)
      S.fx.push({ ring:true, x:px, y:py, r:8 + k*12, max:120 + k*30, dur:.55 + k*.1, life:.55 + k*.1, color:sp.color });
    burst(px, py, '#ffb380', 34);
    const dmg = 60 + S.level * 4;
    for (const e of S.enemies){
      if (e.dead) continue;
      if ((e.x-px)**2 + (e.y-py)**2 <= 95*95){
        if (!ETYPES[e.ti].boss){ e.seg = Math.max(0, e.seg - 1); e.prog = 0; }
        hitEnemy(e, dmg, null);
      }
    }
  } else if (sp.key === 'flash'){
    // 震撼彈：全場暈眩＋爆心傷害
    shake(14);
    screenFlash('rgba(255,255,255,.9)');
    sfxBoom(180);
    S.fx.push({ ring:true, x:px, y:py, r:10, max:170, dur:.5, life:.5, color:'#ffffff' });
    const dmg = 35 + S.level * 2;
    for (const e of S.enemies){
      if (e.dead) continue;
      e.stunLeft = Math.max(e.stunLeft || 0, 2.5);
      if ((e.x-px)**2 + (e.y-py)**2 <= 140*140) hitEnemy(e, dmg, null);
    }
  } else {
    // 強光手電筒：光束橫掃全圖，傷害＋曝光標記
    shake(6);
    screenFlash('rgba(150,220,255,.25)');
    sfxBoom(300);
    const vert = LAYOUT === 'mport';
    S.beam = { pos:-40, axis: vert ? 'y' : 'x', spd:((vert ? H : W) + 120)/1.15, hit:new Set() };
  }
  updateHUD();
  return true;
}

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
  if (typeof updateLightCharge === 'function') updateLightCharge(rawDt * 1000);
  let dt = rawDt * SPEEDS[speedIdx];
  if (hitStop > 0){ hitStop -= rawDt; dt *= .22; }   // 破門錘慢動作
  const now = performance.now();
  for (let i = 0; i < 3; i++) if (S.supCd[i] > 0) S.supCd[i] = Math.max(0, S.supCd[i] - dt);
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
    const seg = Math.max(0, Math.floor(a.p)), prog = Math.max(0, a.p - seg);
    const c = S.path[Math.min(seg, S.path.length-1)];
    const n = S.path[Math.min(seg+1, S.path.length-1)];
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
    fmt(L().ui.endStats, {lv:S.level, k:S.kills, s:S.score, t:L().ui.tip165});
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

/* ══════════════════ 繪圖 ══════════════════ */
let shakeAmt = 0;
function shake(n){
  if (uxPrefs.reduceMotion || actualQuality === 'minimum'){ shakeAmt = 0; return; }
  shakeAmt = actualQuality === 'compact' ? n * .55 : n;
}

/* 地面繪製（草地＋泥徑）：可畫到離屏畫布或主畫布 */
let groundCv = null;
function paintGround(g){
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    const px = x*CELL, py = y*CELL;
    g.fillStyle = (x+y)%2 ? '#3d8b40' : '#378039';
    g.fillRect(px, py, CELL, CELL);
    if (S.grid[y][x] === 1) continue;              // 路面另外畫
    let h = ((x*73856093) ^ (y*19349663) ^ 0x9e3779b9) >>> 0;
    const rnd = () => { h = (h*1664525+1013904223)>>>0; return h/4294967296; };
    const baseBlades = actualQuality === 'minimum' ? 0 : actualQuality === 'compact' ? 2 : (LAYOUT === 'desktop' ? 4 : 3);
    const bladeVariance = actualQuality === 'full' ? (LAYOUT === 'desktop' ? 4 : 2) : 1;
    const blades = baseBlades + Math.floor(rnd()*bladeVariance);
    for (let i=0;i<blades;i++){
      const bx = px + 4 + rnd()*(CELL-10);
      const by = py + 6 + rnd()*(CELL-14);
      g.fillStyle = rnd() < .5 ? '#4caf50' : '#2e6b31';
      g.fillRect(bx, by, 2, 5 + rnd()*4);
      g.fillRect(bx+2, by+2, 2, 3);
    }
    const r = rnd();                               // 偶爾一朵小花／碎石
    if (r < .07){
      const fx2 = px + 8 + rnd()*(CELL-18), fy2 = py + 8 + rnd()*(CELL-18);
      g.fillStyle = r < .04 ? '#ffd166' : '#f4f1e8';
      g.fillRect(fx2, fy2, 4, 4);
      g.fillStyle = '#e05d3f';
      if (r < .02) g.fillRect(fx2+1, fy2+1, 2, 2);
    }
  }
  for (const [x,y] of S.path){                     // 泥土小徑＋磚縫＋草沿邊
    g.fillStyle = '#c9a86a';
    g.fillRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4);
    g.fillStyle = '#b08f52';
    g.fillRect(x*CELL+2, y*CELL+CELL/2-1, CELL-4, 2);
    g.fillRect(x*CELL+CELL/2-1, y*CELL+2, 2, CELL/2-2);
    g.fillStyle = '#2e6b31';
    g.fillRect(x*CELL, y*CELL, CELL, 2);
    g.fillRect(x*CELL, y*CELL+CELL-2, CELL, 2);
  }
}
function buildGround(){
  try{
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g2 = c.getContext && c.getContext('2d');
    if (!g2 || typeof g2.fillRect !== 'function'){ groundCv = null; return; }
    paintGround(g2);
    groundCv = c;
  }catch(e){ groundCv = null; }
}

function drawRouteGuide(now){
  const guide = S && S.routeGuide;
  if (!guide || !guide.active || !S.path.length) return;
  const elapsed = Math.max(0, now - guide.started);
  if (elapsed >= guide.duration){ guide.active = false; return; }
  const progress = uxPrefs.reduceMotion ? 1 : Math.min(1, elapsed / guide.duration);
  const count = Math.max(1, Math.ceil(S.path.length * progress));
  ctx.save();
  ctx.fillStyle = uxPrefs.reduceFlash ? 'rgba(255,209,102,.16)' : 'rgba(255,243,176,.3)';
  ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 3;
  for (let i=0;i<count;i++){
    const [gx,gy] = S.path[i];
    ctx.fillRect(gx*CELL+4, gy*CELL+4, CELL-8, CELL-8);
  }
  const [hx,hy] = S.path[Math.min(count-1, S.path.length-1)];
  ctx.strokeRect(hx*CELL+5, hy*CELL+5, CELL-10, CELL-10);
  ctx.restore();
}

function draw(){
  ctx.save();
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  if (shakeAmt > .5){
    ctx.translate((Math.random()-.5)*shakeAmt, (Math.random()-.5)*shakeAmt);
    shakeAmt *= .88;
  }
  // 地面：離屏快取（每關只繪一次；不支援離屏時直接畫）
  if (groundCv){
    try{ ctx.drawImage(groundCv, 0, 0); }
    catch(e){ groundCv = null; paintGround(ctx); }
  } else paintGround(ctx);
  drawRouteGuide(performance.now());
  // 起點傳送門
  const [sx,sy] = S.path[0];
  drawPortal(sx*CELL+CELL/2, sy*CELL+CELL/2);
  // 終點民眾之家
  const [ex,ey] = S.path[S.path.length-1];
  drawHouse(ex*CELL+CELL/2, ey*CELL+CELL/2);
  if (S.dangerCount > 0){
    ctx.beginPath(); ctx.arc(ex*CELL+CELL/2, ey*CELL+CELL/2, 25 + (uxPrefs.reduceMotion ? 0 : Math.sin(performance.now()/110)*4), 0, 6.28);
    ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 4; ctx.stroke();
  }
  // 塔射程（選中時）
  if (selTower){
    ctx.beginPath();
    ctx.arc(selTower.x, selTower.y, selTower.range * S.mod.range, 0, 6.28);
    ctx.fillStyle = 'rgba(255,209,102,.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,209,102,.5)'; ctx.setLineDash([6,6]);
    ctx.stroke(); ctx.setLineDash([]);
  }
  // 塔
  for (const t of S.towers){
    drawTower(t);
    if (sellConfirmTower === t && performance.now() < sellConfirmUntil){
      ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 3; ctx.setLineDash([5,4]);
      ctx.strokeRect(t.gx*CELL+3, t.gy*CELL+3, CELL-6, CELL-6); ctx.setLineDash([]);
    }
  }
  // 建造預覽：目標格＋幽靈塔＋射程圈（未扣款）
  if (bp.open){
    const px = bp.gx*CELL, py = bp.gy*CELL;
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.setLineDash([5,4]);
    ctx.strokeRect(px+3, py+3, CELL-6, CELL-6); ctx.setLineDash([]);
    if (bp.ti >= 0){
      const spec = TOWERS[bp.ti];
      ctx.globalAlpha = .55;
      drawTower({ ti:bp.ti, gx:bp.gx, gy:bp.gy, lv:1, flash:0 });
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px+CELL/2, py+CELL/2, spec.range * S.mod.range, 0, 6.28);
      ctx.fillStyle = 'rgba(255,209,102,.10)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,.55)'; ctx.setLineDash([6,6]); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // 敵人
  for (const e of S.enemies){
    drawEnemy(e);
    if (e.dangerActive){
      ctx.beginPath(); ctx.arc(e.x, e.y, ETYPES[e.ti].boss ? 25 : 19, 0, 6.28);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(e.x, e.y, ETYPES[e.ti].boss ? 30 : 24, 0, 6.28);
      ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 3; ctx.stroke();
    }
  }
  if (supportAim){
    const radius = supportAim.i === 0 ? 95 : 140;
    ctx.beginPath(); ctx.arc(supportAim.x, supportAim.y, radius, 0, 6.28);
    ctx.fillStyle = supportAim.i === 0 ? 'rgba(255,123,57,.14)' : 'rgba(255,243,176,.14)'; ctx.fill();
    ctx.strokeStyle = SUPPORT[supportAim.i].color; ctx.lineWidth = 3; ctx.setLineDash([7,5]); ctx.stroke(); ctx.setLineDash([]);
    for (const e of S.enemies){
      if (e.dead || (e.x-supportAim.x)**2 + (e.y-supportAim.y)**2 > radius*radius) continue;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(e.x-13,e.y-13,26,26);
    }
  }
  // 志工
  for (const a of S.allies) drawAlly(a);
  // 草地小幫手
  if (S.critter) drawCritter(S.critter);
  // 投射物
  for (const p of S.projs){
    ctx.fillStyle = p.color;
    if (p.wave){ // 宣導廣播：聲波環
      ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, -1, 1); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 13, -.8, .8); ctx.stroke();
    } else {
      ctx.fillRect(p.x-4, p.y-4, 8, 8);
    }
  }
  // 粒子與閃電
  for (const f of S.fx){
    if (f.zap){
      ctx.globalAlpha = Math.max(0, f.life*4);
      ctx.strokeStyle = f.color; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      ctx.lineTo((f.x1+f.x2)/2 + (Math.random()-.5)*16, (f.y1+f.y2)/2 + (Math.random()-.5)*16);
      ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
      continue;
    }
    if (f.ring){
      ctx.globalAlpha = Math.max(0, f.life*1.8);
      ctx.strokeStyle = f.color; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.28); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r*.7, 0, 6.28); ctx.stroke();
      continue;
    }
    if (f.txt){
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = '#ffffff';
      ctx.font = "12px 'Cubic 11','Press Start 2P',sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(f.txt, f.x, f.y);
      continue;
    }
    ctx.globalAlpha = Math.max(0, f.life*2);
    ctx.fillStyle = f.color;
    ctx.fillRect(f.x-3, f.y-3, 6, 6);
  }
  // 強光手電筒光束（軸向感知）
  if (S.beam){
    const p = S.beam.pos, horiz = S.beam.axis === 'x';
    const gr = horiz
      ? ctx.createLinearGradient(p-34, 0, p+34, 0)
      : ctx.createLinearGradient(0, p-34, 0, p+34);
    gr.addColorStop(0, 'rgba(155,231,255,0)');
    gr.addColorStop(.5, 'rgba(230,250,255,.75)');
    gr.addColorStop(1, 'rgba(155,231,255,0)');
    ctx.fillStyle = gr;
    if (horiz){
      ctx.fillRect(p-34, 0, 68, H);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(p-3, 0, 6, H);
    } else {
      ctx.fillRect(0, p-34, W, 68);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(0, p-3, W, 6);
    }
  }
  if (boardKeyboardFocusVisible()){
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(kbFocus.gx*CELL + 3, kbFocus.gy*CELL + 3, CELL - 6, CELL - 6);
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawCritter(c){
  const pop = Math.min(1, c.t * 3);                      // 冒出草叢
  const y = c.y + (1 - pop) * 10;
  const wig = Math.sin(c.t * 7) * 1.5;
  ctx.save();
  ctx.globalAlpha = c.t > 3.2 && c.k !== 'squirrel' ? Math.max(0, (3.6 - c.t) / .4) : 1;
  if (c.k === 'squirrel'){
    ctx.fillStyle = '#8a5a2b';                           // 尾巴
    ctx.fillRect(c.x + 6, y - 12 + wig, 5, 10);
    ctx.fillStyle = '#b06f37';                           // 身體
    ctx.fillRect(c.x - 8, y - 6, 13, 10);
    ctx.fillRect(c.x - 10, y - 10, 8, 7);                // 頭
    ctx.fillStyle = '#1b1b2f';
    ctx.fillRect(c.x - 8, y - 8, 2, 2);                  // 眼
    ctx.fillStyle = '#ffd9b3';
    ctx.fillRect(c.x - 4, y + 1, 5, 3);                  // 肚
  } else if (c.k === 'bee'){
    const fy = y - 6 + wig;
    ctx.fillStyle = 'rgba(240,248,255,.85)';             // 翅膀
    ctx.fillRect(c.x - 2, fy - 6, 4, 4); ctx.fillRect(c.x + 3, fy - 6, 4, 4);
    ctx.fillStyle = '#f5c211';                           // 身體
    ctx.fillRect(c.x - 6, fy, 12, 7);
    ctx.fillStyle = '#1b1b2f';                           // 條紋與眼
    ctx.fillRect(c.x - 3, fy, 2, 7); ctx.fillRect(c.x + 1, fy, 2, 7);
    ctx.fillRect(c.x + 4, fy + 2, 2, 2);
  } else if (c.k === 'worm'){
    ctx.fillStyle = '#e78ea9';                           // 三節蚯蚓，扭動
    for (let i = 0; i < 3; i++)
      ctx.fillRect(c.x - 7 + i*5, y - 2 + Math.sin(c.t*7 + i)*2.5, 5, 5);
    ctx.fillStyle = '#1b1b2f';
    ctx.fillRect(c.x + 4, y - 2 + Math.sin(c.t*7 + 2)*2.5, 1.5, 1.5);
  } else {                                               // 瓢蟲
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(c.x - 5, y - 5 + wig*.5, 10, 8);
    ctx.fillStyle = '#1b1b2f';
    ctx.fillRect(c.x - 1, y - 5 + wig*.5, 2, 8);          // 中線
    ctx.fillRect(c.x - 4, y - 3 + wig*.5, 2, 2); ctx.fillRect(c.x + 2, y - 2 + wig*.5, 2, 2); // 斑點
    ctx.fillRect(c.x - 7, y - 6 + wig*.5, 3, 4);          // 頭
  }
  ctx.restore();
}
function drawAlly(a){
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(a.x-8, a.y+10, 16, 3);
  ctx.fillStyle = '#ffd9b3'; ctx.fillRect(a.x-5, a.y-13, 10, 9);   // 頭
  ctx.fillStyle = '#1b1b2f'; ctx.fillRect(a.x-3, a.y-10, 2, 2); ctx.fillRect(a.x+1, a.y-10, 2, 2);
  ctx.fillStyle = '#9be79b'; ctx.fillRect(a.x-6, a.y-4, 12, 13);   // 志工背心
  ctx.fillStyle = '#ffd166'; ctx.fillRect(a.x-2, a.y-4, 4, 7);     // 黃絲帶
  ctx.fillStyle = '#f4f1e8'; ctx.font = '8px sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('!', a.x, a.y - 16);
}

function drawPortal(x, y){
  ctx.fillStyle = '#12081f';
  ctx.fillRect(x-20, y-20, 40, 40);
  ctx.strokeStyle = '#7a3df0'; ctx.lineWidth = 3;
  ctx.strokeRect(x-20, y-20, 40, 40);
  ctx.fillStyle = '#7a3df0';
  const t = performance.now()/300;
  for (let i=0;i<4;i++){
    const a = t + i*1.57;
    ctx.fillRect(x + Math.cos(a)*10 - 3, y + Math.sin(a)*10 - 3, 6, 6);
  }
}
function drawHouse(x, y){
  ctx.fillStyle = '#ef476f';
  ctx.beginPath(); ctx.moveTo(x-24, y-4); ctx.lineTo(x, y-24); ctx.lineTo(x+24, y-4); ctx.fill();
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(x-18, y-4, 36, 24);
  ctx.fillStyle = '#3584e4';
  ctx.fillRect(x-6, y+4, 12, 16);
  // 民眾（小臉）
  ctx.fillStyle = '#ffd166'; ctx.fillRect(x-14, y+2, 7, 7);
  ctx.fillStyle = '#1b1b2f'; ctx.fillRect(x-13, y+4, 2, 2); ctx.fillRect(x-10, y+4, 2, 2);
}
function drawTower(t){
  const spec = TOWERS[t.ti];
  const px = t.gx*CELL, py = t.gy*CELL;
  // 底座
  ctx.fillStyle = '#111124';
  ctx.fillRect(px+4, py+4, CELL-8, CELL-8);
  ctx.fillStyle = t.flash > 0 ? '#ffffff' : spec.color;
  ctx.fillRect(px+8, py+8, CELL-16, CELL-16);
  // 等級星
  ctx.fillStyle = '#ffd166';
  for (let i=0;i<t.lv;i++) ctx.fillRect(px+8+i*9, py+CELL-12, 6, 6);
  // 圖示
  ctx.fillStyle = '#101018';
  ctx.font = spec.glyph==='165' ? `bold 12px 'Press Start 2P', monospace` : `18px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(spec.glyph, px+CELL/2, py+CELL/2 - 2);
}
function drawEnemy(e){
  const t = ETYPES[e.ti];
  const s = t.boss ? 22 : 13;
  const bob = Math.sin(e.wob)*2;
  const x = e.x, y = e.y + bob;
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(x-s+3, e.y+s-2, s*2-6, 4);
  // 身體
  ctx.fillStyle = t.c2; ctx.fillRect(x-s, y-s, s*2, s*2);
  ctx.fillStyle = t.c1; ctx.fillRect(x-s+3, y-s+3, s*2-6, s*2-6);
  // 眼睛（賊笑）
  ctx.fillStyle = '#101018';
  ctx.fillRect(x-s+5, y-4, 5, 5); ctx.fillRect(x+s-10, y-4, 5, 5);
  ctx.fillRect(x-4, y+5, 8, 3);
  // 記號
  ctx.fillStyle = '#101018';
  ctx.font = `${t.boss?16:10}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(t.face, x, y - s + 7);
  // 減速標記
  if (e.slowLeft > 0){
    ctx.fillStyle = 'rgba(80,160,255,.6)';
    ctx.fillRect(x-s, y-s, s*2, 4);
  }
  if (e.stunLeft > 0){
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('✦', x, y - s - 13);
  }
  // 已曝光標記（記者爆料）
  if (e.markLeft > 0){
    ctx.fillStyle = '#c061cb';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('!', x + s + 6, y - s + 4);
  }
  // 血條
  const w = s*2, pct = Math.max(0, e.hp/e.hpMax);
  ctx.fillStyle = '#000'; ctx.fillRect(x-s, y-s-9, w, 5);
  ctx.fillStyle = pct > .5 ? '#26a269' : pct > .25 ? '#e5a50a' : '#ef476f';
  ctx.fillRect(x-s, y-s-9, w*pct, 5);
}

/* ══════════════════ UI ══════════════════ */
const $ = id => document.getElementById(id);
const MODAL_IDS = new Set(['startScreen','howScreen','boardScreen','quizScreen','endScreen','moreScreen']);
const ESCAPABLE_MODAL_IDS = new Set(['howScreen','boardScreen','moreScreen']);
const modalStack = [];
let isolationSnapshot = null;

function focusBoard(){
  if (cv && cv.focus) cv.focus({preventScroll:true});
}
function boardKeyboardFocusVisible(){
  if (!kbActive || document.activeElement !== cv) return false;
  return typeof cv.matches !== 'function' || cv.matches(':focus-visible');
}
function applyControlA11y(){
  const u = L().ui;
  const hud = u.hudTitles;
  const controls = u.controls;
  const titles = {
    hudLevel:hud.level, hudHP:hud.hp, hudLives:hud.lives,
    hudCoin:hud.coins, hudScore:hud.score,
  };
  for (const [id, value] of Object.entries(titles)){
    const el = document.getElementById(id);
    if (el && value) el.setAttribute('title', value);
  }
  const speed = document.getElementById('btnSpeed');
  if (speed){
    const label = fmt(controls.speed, {speed:SPEEDS[speedIdx]});
    speed.setAttribute('title', label);
    speed.setAttribute('aria-label', label);
  }
  const pause = document.getElementById('btnPause');
  if (pause){
    const pressed = !!(S && S.paused);
    const label = pressed ? controls.resume : controls.pause;
    pause.setAttribute('title', label);
    pause.setAttribute('aria-label', label);
    pause.setAttribute('aria-pressed', String(pressed));
  }
  const mute = document.getElementById('btnMute');
  if (mute){
    const label = muted ? controls.unmute : controls.mute;
    mute.setAttribute('title', label);
    mute.setAttribute('aria-label', label);
    mute.setAttribute('aria-pressed', String(muted));
  }
  const more = document.getElementById('btnMore');
  if (more){
    more.setAttribute('title', controls.more);
    more.setAttribute('aria-label', controls.more + (muted ? `，${controls.muted}` : ''));
  }
}

function setInert(el, value){
  if (!el) return;
  el.inert = value;
  if (value) el.setAttribute('inert', '');
  else el.removeAttribute('inert');
}
function syncModalIsolation(){
  const activeEntry = modalStack[modalStack.length - 1];
  const active = activeEntry && document.getElementById(activeEntry.id);
  const children = document.body ? Array.from(document.body.children) : [];
  if (active){
    if (!isolationSnapshot){
      isolationSnapshot = children.map(el => ({
        el,
        inert: !!el.inert || el.hasAttribute('inert'),
        aria: el.getAttribute('aria-hidden'),
      }));
    }
    for (const child of children){
      const blocked = child !== active;
      setInert(child, blocked);
      child.setAttribute('aria-hidden', blocked ? 'true' : 'false');
    }
  } else if (isolationSnapshot){
    for (const saved of isolationSnapshot){
      if (!saved.el.isConnected) continue;
      setInert(saved.el, saved.inert);
      if (saved.aria === null) saved.el.removeAttribute('aria-hidden');
      else saved.el.setAttribute('aria-hidden', saved.aria);
    }
    isolationSnapshot = null;
  }
  document.querySelectorAll('.overlay').forEach(el => {
    if (active && el === active) el.setAttribute('aria-hidden', 'false');
    else if (!el.classList.contains('show')) el.setAttribute('aria-hidden', 'true');
  });
}
function modalFocusables(el){
  return Array.from(el.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )).filter(node => node.getAttribute('aria-hidden') !== 'true' && !node.closest('[inert]'));
}
function focusModal(id){
  const top = modalStack[modalStack.length - 1];
  if (!top || top.id !== id) return;
  const el = document.getElementById(id);
  if (!el) return;
  const target = el.querySelector('[autofocus], .panel[tabindex="-1"]') || modalFocusables(el)[0] || el;
  if (!target.hasAttribute('tabindex') && target === el) target.setAttribute('tabindex', '-1');
  if (target.focus) target.focus({preventScroll:true});
}
function show(id){
  const el = $(id);
  if (!el) return;
  el.classList.add('show');
  el.setAttribute('aria-hidden', 'false');
  if (MODAL_IDS.has(id) && !modalStack.some(entry => entry.id === id)){
    modalStack.push({ id, opener:document.activeElement });
    syncModalIsolation();
    setTimeout(() => focusModal(id), 0);
  }
}
function hide(id){
  const el = $(id);
  if (!el) return;
  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');
  const index = modalStack.map(entry => entry.id).lastIndexOf(id);
  const wasTop = index === modalStack.length - 1;
  const entry = index >= 0 ? modalStack.splice(index, 1)[0] : null;
  syncModalIsolation();
  const canRestore = wasTop && entry && entry.opener && entry.opener.isConnected &&
    !entry.opener.disabled && !entry.opener.closest('[inert]');
  if (canRestore){
    setTimeout(() => entry.opener.focus && entry.opener.focus({preventScroll:true}), 0);
  } else if (wasTop && modalStack.length){
    setTimeout(() => focusModal(modalStack[modalStack.length - 1].id), 0);
  }
}
document.addEventListener('keydown', ev => {
  const top = modalStack[modalStack.length - 1];
  if (!top) return;
  const el = document.getElementById(top.id);
  if (!el) return;
  if (ev.key === 'Escape' && ESCAPABLE_MODAL_IDS.has(top.id)){
    ev.preventDefault(); ev.stopPropagation();
    if (top.id === 'moreScreen') closeMore(); else hide(top.id);
    return;
  }
  if (ev.key !== 'Tab') return;
  const items = modalFocusables(el);
  if (!items.length){ ev.preventDefault(); focusModal(top.id); return; }
  const first = items[0], last = items[items.length - 1];
  const panel = el.querySelector('.panel');
  if (ev.shiftKey && (document.activeElement === first || document.activeElement === panel || !el.contains(document.activeElement))){
    ev.preventDefault(); last.focus();
  } else if (!ev.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))){
    ev.preventDefault(); first.focus();
  }
}, true);

(function initializeVisibleModal(){
  const start = document.getElementById('startScreen');
  if (!start || !start.classList.contains('show')) return;
  modalStack.push({ id:'startScreen', opener:null });
  syncModalIsolation();
  setTimeout(() => focusModal('startScreen'), 0);
})();

function announceStatus(msg){
  const el = document.getElementById('gameStatus');
  if (el && msg) el.textContent = String(msg);
}
function announceKeyboardCell(){
  if (!S || !S.grid[kbFocus.gy]) return;
  const u = L().ui;
  const tower = S.towers.find(t => t.gx === kbFocus.gx && t.gy === kbFocus.gy);
  const kind = tower
    ? fmt(u.canvasTower, {name:L().towers[tower.ti], level:tower.lv})
    : (S.grid[kbFocus.gy][kbFocus.gx] === 1 ? u.canvasPath : u.canvasGrass);
  announceStatus(fmt(u.canvasCell, {x:kbFocus.gx + 1, y:kbFocus.gy + 1, kind}));
}

function updateHUD(){
  $('lvNow').textContent = S.level;
  $('hpNow').textContent = S.hp;
  $('livesNow').textContent =
    '💛'.repeat(Math.max(0, S.lives)) + '🖤'.repeat(Math.max(0, LIVES_CAP - S.lives));
  $('coinNow').textContent = S.coins;
  $('scoreNow').textContent = S.score;
  document.querySelectorAll('.tower-btn').forEach((b,i) => {
    const spec = TOWERS[i]; if (!spec) return;
    const locked = S.level < (spec.unlock || 1);
    b.classList.toggle('sel', selShop === i);
    b.setAttribute('aria-pressed', String(selShop === i));
    b.classList.toggle('locked', locked);
    b.disabled = locked || S.coins < spec.cost;
    const tc = b.querySelector && b.querySelector('.tc');
    if (tc) tc.textContent = locked ? '🔒Lv.' + spec.unlock : '🪙' + spec.cost;
  });
  document.querySelectorAll('.sup-btn').forEach((b,i) => {
    const sp = SUPPORT[i]; if (!sp) return;
    const locked = S.level < sp.unlock;
    const cd = S.supCd[i];
    const noEnemies = !S.enemies.some(e => !e.dead);
    const charging = i === 2 && lightCharge.active;
    b.classList.toggle('locked', locked);
    b.classList.toggle('aiming', selSup === i);
    b.setAttribute('aria-pressed', String(selSup === i));
    b.classList.toggle('ready', !locked && cd <= 0 && !noEnemies && !charging);
    b.disabled = locked || cd > 0 || (noEnemies && !charging);
    const cdEl = b.querySelector && b.querySelector('.cd');
    if (cdEl) cdEl.textContent = locked ? '🔒Lv.' + sp.unlock
      : charging ? L().support.cancelShort
      : (cd > 0 ? Math.ceil(cd) + 's' : (noEnemies ? '—' : 'GO'));
  });
  const nb = $('btnNextWave');
  const canStart = !S.over && S.phase === 'setup' && !S.waveActive;
  nb.disabled = !canStart;
  nb.textContent = S.phase === 'wave' || S.phase === 'clearing'
    ? L().ui.waveIn
    : (S.autoT > 0 ? fmt(L().ui.waveCount, {n:Math.ceil(S.autoT)}) : L().ui.waveGo);
  const waveInfo = document.getElementById('waveInfo');
  if (waveInfo){
    if (S.dangerFinal) waveInfo.textContent = fmt(L().ui.dangerFinal, {n:S.dangerCount});
    else if (S.dangerCount) waveInfo.textContent = fmt(L().ui.dangerCount, {n:S.dangerCount});
    else if (S.phase === 'setup') waveInfo.textContent = fmt(L().ui.waveReady, {lv:S.level, n:Math.max(0,Math.ceil(S.autoT))});
    else waveInfo.textContent = fmt(L().ui.waveRemain, {n:S.spawnQ.length + S.enemies.length});
  }
  const moreScore = document.getElementById('moreScoreNow');
  if (moreScore) moreScore.textContent = S.score;
  const towerMenu = document.getElementById('towerMenu');
  const hudNow = performance.now();
  if (selTower && towerMenu && !towerMenu.classList.contains('hidden') && hudNow - towerMenuRefreshAt >= 250){
    towerMenuRefreshAt = hudNow;
    refreshTowerMenu();
  }
  syncMuteButtons();
}

let bannerTimer = 0;
function banner(msg){
  const b = $('waveBanner');
  b.textContent = msg;
  b.classList.remove('hidden');
  announceStatus(msg);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 2600);
}

function queueScoreGain(points){
  if (!Number.isFinite(points) || points <= 0 || LAYOUT === 'desktop') return;
  const toast = document.getElementById('scoreToast');
  if (!toast) return;
  scoreToastValue += Math.round(points);
  toast.textContent = `⭐ +${scoreToastValue}`;
  toast.classList.remove('hidden');
  toast.setAttribute('aria-hidden', 'false');
  if (scoreToastTimer) return; // 固定 800ms 聚合窗，不因連續得分無限延長
  const gameGen = runGen;
  scoreToastTimer = setTimeout(() => {
    if (gameGen === runGen){
      toast.classList.add('hidden'); toast.setAttribute('aria-hidden', 'true');
    }
    scoreToastValue = 0; scoreToastTimer = 0;
  }, 800);
}

/* ── 點地建造面板（手機）：兩段式確認，確認前絕不扣款 ── */
const emptyBuildPreview = () => ({ open:false, gx:0, gy:0, ti:-1, error:'' });
let bp = emptyBuildPreview();
let suspendedBuildPreview = null;
function bpItems(){
  return TOWERS
    .map((t, i) => ({ i, cost:t.cost, unlocked:S.level >= (t.unlock || 1), afford:S.coins >= t.cost }))
    .filter(o => o.unlocked);
}
function hideBuildMenuElement(){
  const el = document.getElementById('buildMenu');
  if (el) el.classList.add('hidden');
}
function showBuildMenuElement(){
  const el = document.getElementById('buildMenu');
  if (el) el.classList.remove('hidden');
}
function focusBuildMenu(){
  if (!bp.open) return;
  const el = document.getElementById('buildMenu');
  if (!el) return;
  const selected = bp.ti >= 0 ? el.querySelector(`[data-bp="${bp.ti}"]`) : null;
  const target = selected || el.querySelector('.bp-item:not([disabled])') || document.getElementById('bmNo');
  if (target && target.focus) setTimeout(() => {
    if (bp.open && target.isConnected && !target.disabled) target.focus({preventScroll:true});
  }, 0);
}
function focusBuildCell(target){
  if (!S || !target) return;
  kbFocus = {
    gx:Math.max(0, Math.min(COLS - 1, target.gx)),
    gy:Math.max(0, Math.min(ROWS - 1, target.gy)),
  };
  focusBoard();
  announceKeyboardCell();
}
function discardSuspendedBuildMenu(){
  suspendedBuildPreview = null;
}
function suspendBuildMenu(){
  if (!bp.open) return false;
  suspendedBuildPreview = { ...bp };
  bp = emptyBuildPreview();
  hideBuildMenuElement();
  return true;
}
function restoreSuspendedBuildMenu(){
  const saved = suspendedBuildPreview;
  suspendedBuildPreview = null;
  if (!saved || !S || S.over || !S.grid[saved.gy] || S.grid[saved.gy][saved.gx] !== 0) return false;
  bp = { ...saved, open:true, error:'' };
  renderBuildMenu();
  showBuildMenuElement();
  focusBuildMenu();
  return true;
}
function openBuildMenu(gx, gy){
  const keepTower = bp.open ? bp.ti : -1;
  cancelSupportAction(false, false);
  closeTowerMenu();
  bp = { open:true, gx, gy, ti:keepTower, error:'' };
  kbFocus = { gx, gy };
  renderBuildMenu();
  showBuildMenuElement();
  focusBuildMenu();
}
function closeBuildMenu(restoreFocus=false){
  const target = bp.open ? {gx:bp.gx, gy:bp.gy} :
    (suspendedBuildPreview ? {gx:suspendedBuildPreview.gx, gy:suspendedBuildPreview.gy} : null);
  bp = emptyBuildPreview();
  discardSuspendedBuildMenu();
  hideBuildMenuElement();
  if (restoreFocus) focusBuildCell(target);
}
function bpPick(i){
  if (!bp.open) return;
  const spec = TOWERS[i];
  if (!spec || S.level < (spec.unlock || 1) || S.coins < spec.cost) return;  // 買不起／未解鎖：僅灰顯
  bp.ti = (bp.ti === i) ? -1 : i;      // 再點一次取消預覽
  bp.error = '';
  renderBuildMenu();
  focusBuildMenu();
  if (S) draw();
}
function showBuildError(message){
  if (!bp.open) return false;
  bp.error = message;
  renderBuildMenu();
  announceStatus(message);
  focusBuildMenu();
  return false;
}
function bpConfirm(){
  if (!bp.open || bp.ti < 0) return;
  const spec = TOWERS[bp.ti];
  if (!S || S.over || S.phase === 'clearing' || !spec) return showBuildError(L().ui.bpUnavailable);
  if (!S.grid[bp.gy] || S.grid[bp.gy][bp.gx] !== 0) return showBuildError(L().ui.bpOccupied);
  if (S.level < (spec.unlock || 1)) return showBuildError(L().ui.bpLocked);
  if (S.coins < spec.cost) return showBuildError(L().ui.needCoins);
  S.coins -= spec.cost;                // ★ 只在確認時扣款
  S.towers.push({
    ti:bp.ti, gx:bp.gx, gy:bp.gy,
    x:bp.gx*CELL + CELL/2, y:bp.gy*CELL + CELL/2,
    lv:1, dmg:spec.dmg, range:spec.range, cd:0, flash:0, invested:spec.cost,
  });
  S.grid[bp.gy][bp.gx] = 2;
  sfx(520,.06); sfx(760,.06);
  closeBuildMenu(true);
  updateHUD();
  draw();
}
function renderBuildMenu(){
  const list = document.getElementById('bmList');
  const title = document.getElementById('bmTitle');
  const preview = document.getElementById('bmPreview');
  const error = document.getElementById('bmError');
  const ok = document.getElementById('bmOk');
  if (title) title.textContent = L().ui.bpTitle;
  if (preview){
    preview.textContent = bp.ti >= 0
      ? fmt(L().ui.bpPreview, {range:Math.round(TOWERS[bp.ti].range * S.mod.range), remain:S.coins - TOWERS[bp.ti].cost})
      : L().ui.bpPickHint;
  }
  if (list){
    list.innerHTML = bpItems().map(o => {
      const spec = TOWERS[o.i];
      const cls = 'bp-item pixel-btn' + (o.afford ? '' : ' poor') + (bp.ti === o.i ? ' sel' : '');
      const disabled = o.afford ? '' : ' disabled aria-disabled="true"';
      return `<button type="button" class="${cls}" data-bp="${o.i}" aria-pressed="${bp.ti === o.i}"${disabled}>` +
             `<span class="bg">${spec.glyph === '165' ? '165' : spec.glyph}</span>` +
             `<span class="bn">${L().towers[o.i]}</span>` +
             `<span class="bc">🪙${o.cost}</span></button>`;
    }).join('');
  }
  if (ok){
    ok.disabled = bp.ti < 0;
    ok.textContent = bp.ti >= 0 ? `${L().ui.bpBuild} 🪙${TOWERS[bp.ti].cost}` : L().ui.bpBuild;
  }
  if (error) error.textContent = bp.error || '';
}
(function wireBuildMenu(){
  const list = document.getElementById('bmList');
  if (list && list.addEventListener) list.addEventListener('click', ev => {
    let n = ev.target;
    while (n && n !== list && !(n.dataset && n.dataset.bp !== undefined)) n = n.parentNode;
    if (n && n !== list && n.dataset && n.dataset.bp !== undefined) bpPick(parseInt(n.dataset.bp, 10));
  });
  const ok = document.getElementById('bmOk');
  const no = document.getElementById('bmNo');
  if (ok && ok.addEventListener) ok.addEventListener('click', bpConfirm);
  if (no && no.addEventListener) no.addEventListener('click', () => { closeBuildMenu(true); if (S) draw(); });
  const menu = document.getElementById('buildMenu');
  if (menu && menu.addEventListener) menu.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault(); ev.stopPropagation();
    closeBuildMenu(true);
    if (S) draw();
  });
})();

/* ── 畫布互動：單指=遊戲操作、雙指=縮放平移（硬區分） ── */
const ptrs = new Map();          // 進行中的 pointer
let gest = null;                 // 雙指手勢狀態
let tapCand = null;              // 單指 tap 候選
let pendingTap = null;           // 延後確認第一擊，避免雙擊前先執行遊戲操作
let kbFocus = { gx:0, gy:0 };
let kbActive = false;
const TAP_SLOP = 12;             // 內部像素
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP = 28;

function cancelPendingTap(){
  if (pendingTap && pendingTap.timer) clearTimeout(pendingTap.timer);
  pendingTap = null;
}
function commitPendingTap(candidate){
  if (!candidate || pendingTap !== candidate) return;
  pendingTap = null;
  if (candidate.run === runGen) handleTap(candidate.ix, candidate.iy);
}
function canDoubleTapReset(ix, iy){
  if (!S || selSup >= 0 || selShop >= 0 || bp.open) return false;
  const [wx, wy] = internalToWorld(ix, iy);
  const gx = Math.floor(wx / CELL), gy = Math.floor(wy / CELL);
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return false;
  return !S.towers.some(t => t.gx === gx && t.gy === gy);
}
function queueTap(ix, iy){
  // 全圖倍率沒有雙擊重設需求，單擊應立即反應。
  if (view.scale <= 1.01){
    cancelPendingTap();
    handleTap(ix, iy);
    return;
  }
  const nowT = performance.now();
  if (pendingTap){
    const first = pendingTap;
    const closeInTime = nowT - first.at <= DOUBLE_TAP_MS;
    const closeInSpace = Math.hypot(ix - first.ix, iy - first.iy) <= DOUBLE_TAP_SLOP;
    const onBlankBoard = canDoubleTapReset(first.ix, first.iy) && canDoubleTapReset(ix, iy);
    if (closeInTime && closeInSpace && onBlankBoard){
      cancelPendingTap();
      resetView();
      if (S) draw();
      return;
    }
    clearTimeout(first.timer);
    pendingTap = null;
    if (first.run === runGen) handleTap(first.ix, first.iy);
  }
  const candidate = { ix, iy, at:nowT, run:runGen, timer:0 };
  candidate.timer = setTimeout(() => commitPendingTap(candidate), DOUBLE_TAP_MS);
  pendingTap = candidate;
}

function handleTap(ix, iy){      // ix,iy＝內部像素
  if (!S || S.over || S.paused || S.phase === 'clearing') return;
  finishRouteGuide();
  const [wx, wy] = internalToWorld(ix, iy);
  if (selSup === 0 || selSup === 1){ setSupportTarget(selSup, wx, wy); return; }
  if (selSup === 2) return;
  const gx = Math.floor(wx / CELL), gy = Math.floor(wy / CELL);
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS){ closeBuildMenu(); return; }
  const hit = S.towers.find(t => t.gx === gx && t.gy === gy);
  if (hit){ closeBuildMenu(); openTowerMenu(hit); return; }
  closeTowerMenu();
  if (LAYOUT === 'desktop'){
    // 桌機：先選武器 → 點地
    if (selShop >= 0 && S.grid[gy][gx] === 0){
      const spec = TOWERS[selShop];
      if (S.level < (spec.unlock || 1)){ selShop = -1; updateHUD(); return; }
      if (S.coins >= spec.cost){
        S.coins -= spec.cost;
        S.towers.push({
          ti:selShop, gx, gy, x:gx*CELL+CELL/2, y:gy*CELL+CELL/2,
          lv:1, dmg:spec.dmg, range:spec.range, cd:0, flash:0, invested:spec.cost,
        });
        S.grid[gy][gx] = 2;
        sfx(520,.06); sfx(760,.06);
        updateHUD();
      } else banner(L().ui.needCoins);
    }
  } else {
    // 手機：點空草地 → 建造面板
    if (S.grid[gy][gx] === 0) openBuildMenu(gx, gy);
    else closeBuildMenu();
  }
}

cv.addEventListener('pointerdown', ev => {
  if (!S || S.over) return;
  if (ev.button !== undefined && ev.button !== 0) return;
  ev.preventDefault();
  ptrs.set(ev.pointerId, { x:ev.clientX, y:ev.clientY });
  try{ if (cv.setPointerCapture) cv.setPointerCapture(ev.pointerId); }catch(e){}
  if (ptrs.size === 2 && LAYOUT !== 'desktop'){
    finishRouteGuide();
    cancelSupportAction(false, false);       // 雙指手勢取消支援與保留中的建塔狀態
    closeBuildMenu(false);                   // D-05：開始雙指手勢即關閉預覽且不扣點
    tapCand = null;                            // 進入手勢：取消 tap
    cancelPendingTap();
    const [a, b] = [...ptrs.values()];
    const [ax, ay] = clientToInternal(a.x, a.y);
    const [bx, by] = clientToInternal(b.x, b.y);
    gest = {
      d0: Math.max(1, Math.hypot(bx-ax, by-ay)),
      scale0: view.scale,
      mx0: (ax+bx)/2, my0: (ay+by)/2,
      ox0: view.ox, oy0: view.oy,
    };
  } else if (ptrs.size === 1){
    const [ix, iy] = clientToInternal(ev.clientX, ev.clientY);
    tapCand = { ix, iy, id:ev.pointerId, ox0:view.ox, oy0:view.oy, panning:false };
  }
});
cv.addEventListener('pointermove', ev => {
  if (!ptrs.has(ev.pointerId)) return;
  ptrs.set(ev.pointerId, { x:ev.clientX, y:ev.clientY });
  if (gest && ptrs.size >= 2){
    ev.preventDefault();
    const [a, b] = [...ptrs.values()];
    const [ax, ay] = clientToInternal(a.x, a.y);
    const [bx, by] = clientToInternal(b.x, b.y);
    const d = Math.max(1, Math.hypot(bx-ax, by-ay));
    const mx = (ax+bx)/2, my = (ay+by)/2;
    const ns = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, gest.scale0 * (d / gest.d0)));
    // 以手勢起點的世界座標為錨，跟隨中點移動
    const wx = (gest.mx0 - gest.ox0) / gest.scale0;
    const wy = (gest.my0 - gest.oy0) / gest.scale0;
    view.scale = ns;
    view.ox = mx - wx * ns;
    view.oy = my - wy * ns;
    clampView();
  } else if (tapCand && ev.pointerId === tapCand.id){
    const [ix, iy] = clientToInternal(ev.clientX, ev.clientY);
    const dx = ix - tapCand.ix, dy = iy - tapCand.iy;
    const moved = Math.hypot(dx, dy) > TAP_SLOP;
    if ((tapCand.panning || moved) && view.scale > 1.01 && LAYOUT !== 'desktop'){
      ev.preventDefault();
      tapCand.panning = true;
      view.ox = tapCand.ox0 + dx;
      view.oy = tapCand.oy0 + dy;
      clampView();
      if (S) draw();
    } else if (moved) tapCand = null;
  }
});
function ptrEnd(ev){
  ptrs.delete(ev.pointerId);
  try{ if (cv.releasePointerCapture) cv.releasePointerCapture(ev.pointerId); }catch(e){}
  if (gest && ptrs.size < 2) gest = null;
  if (tapCand && ev.pointerId === tapCand.id){
    const [ix, iy] = clientToInternal(ev.clientX, ev.clientY);
    if (!tapCand.panning && Math.hypot(ix - tapCand.ix, iy - tapCand.iy) <= TAP_SLOP){
      queueTap(ix, iy);
    }
    tapCand = null;
  }
}
function ptrCancel(ev){
  ptrs.delete(ev.pointerId);
  try{ if (cv.releasePointerCapture) cv.releasePointerCapture(ev.pointerId); }catch(e){}
  if (gest && ptrs.size < 2) gest = null;
  if (tapCand && ev.pointerId === tapCand.id) tapCand = null;
}
cv.addEventListener('pointerup', ptrEnd);
cv.addEventListener('pointercancel', ptrCancel);
cv.addEventListener('contextmenu', ev => ev.preventDefault());

cv.addEventListener('focus', () => {
  kbActive = true;
  if (S){ draw(); announceKeyboardCell(); }
});
cv.addEventListener('blur', () => {
  kbActive = false;
  if (S) draw();
});
cv.addEventListener('keydown', ev => {
  if (!S || S.over) return;
  let moved = false;
  if (ev.key === 'ArrowLeft'){ kbFocus.gx = Math.max(0, kbFocus.gx - 1); moved = true; }
  else if (ev.key === 'ArrowRight'){ kbFocus.gx = Math.min(COLS - 1, kbFocus.gx + 1); moved = true; }
  else if (ev.key === 'ArrowUp'){ kbFocus.gy = Math.max(0, kbFocus.gy - 1); moved = true; }
  else if (ev.key === 'ArrowDown'){ kbFocus.gy = Math.min(ROWS - 1, kbFocus.gy + 1); moved = true; }
  else if (ev.key === 'Enter' || ev.key === ' '){
    ev.preventDefault();
    cancelPendingTap();
    const wx = kbFocus.gx * CELL + CELL/2;
    const wy = kbFocus.gy * CELL + CELL/2;
    handleTap(wx * view.scale + view.ox, wy * view.scale + view.oy);
    draw(); announceKeyboardCell();
    return;
  } else if (ev.key === 'Escape'){
    ev.preventDefault();
    cancelPendingTap();
    selShop = -1;
    cancelSupportAction(false, false);
    closeTowerMenu(); closeBuildMenu();
    updateHUD(); draw(); announceKeyboardCell();
    return;
  }
  if (moved){
    ev.preventDefault();
    kbActive = true;
    draw(); announceKeyboardCell();
  }
});

/* ── 塔選單（升級／拆除） ─────────────────────────── */
function cancelSellConfirm(){
  if (sellConfirmTimer) clearTimeout(sellConfirmTimer);
  sellConfirmTimer = 0; sellConfirmTower = null; sellConfirmUntil = 0;
  const menu = document.getElementById('towerMenu');
  if (menu) menu.classList.remove('sell-armed');
}
function refreshTowerMenu(){
  const t = selTower;
  if (!t || !S || !S.towers.includes(t)) return;
  const m = $('towerMenu');
  const spec = TOWERS[t.ti];
  const now = performance.now();
  if (sellConfirmTower === t && now >= sellConfirmUntil) cancelSellConfirm();
  const sellArmed = sellConfirmTower === t && now < sellConfirmUntil;
  $('tmName').textContent = `${L().towers[t.ti]} Lv.${t.lv}`;
  const upCost = Math.round(spec.cost * .8 * t.lv);
  $('tmUpLbl').textContent = L().ui.upLbl;
  $('tmUpCost').textContent = t.lv >= MAX_TLV ? 'MAX' : `${upCost} / ${S.coins}`;
  $('tmUp').disabled = t.lv >= MAX_TLV || S.coins < upCost;
  const gain = Math.round(t.invested * .7);
  const loss = t.invested - gain;
  $('tmSellLbl').textContent = sellArmed ? L().ui.sellConfirm : L().ui.sellLbl;
  $('tmSellGain').textContent = `${gain} (-${loss})`;
  $('tmSell').setAttribute('title', fmt(L().ui.sellBreakdown, {gain, loss}));
  $('tmSell').setAttribute('aria-label', (sellArmed ? L().ui.sellConfirm : L().ui.sellLbl) + '。' + fmt(L().ui.sellBreakdown, {gain, loss}));
  m.classList.toggle('sell-armed', sellArmed);
}
function openTowerMenu(t){
  if (selTower && selTower !== t) cancelSellConfirm();
  selTower = t;
  const m = $('towerMenu');
  refreshTowerMenu();
  m.classList.remove('hidden');
  const r = cv.getBoundingClientRect();
  const st = $('stage').getBoundingClientRect();
  const sx = ((t.gx+1)*CELL) * view.scale + view.ox;   // 世界→內部像素（含縮放）
  const sy = (t.gy*CELL) * view.scale + view.oy;
  let mx = r.left - st.left + sx * (r.width/W);
  let my = r.top - st.top + sy * (r.height/H);
  m.style.left = Math.min(mx, st.width - 150) + 'px';
  m.style.top  = Math.max(0, my) + 'px';
}
function closeTowerMenu(){ cancelSellConfirm(); selTower = null; $('towerMenu').classList.add('hidden'); }
$('tmUp').addEventListener('click', () => {
  const t = selTower;
  if (!t || !S.towers.includes(t)){ closeTowerMenu(); return; }  // 幽靈塔防護
  const now = performance.now();
  if (now < upgradeLockedUntil) return;
  upgradeLockedUntil = now + 350;
  cancelSellConfirm();
  const spec = TOWERS[t.ti];
  const upCost = Math.round(spec.cost * .8 * t.lv);
  if (t.lv >= MAX_TLV || S.coins < upCost) return;
  S.coins -= upCost; t.invested += upCost;
  t.lv++; t.dmg = Math.round(t.dmg * UP_MULT.dmg); t.range = Math.round(t.range * UP_MULT.range);
  sfx(660,.08); sfx(990,.1);
  openTowerMenu(t); updateHUD(); draw();
});
$('tmSell').addEventListener('click', () => {
  const t = selTower;
  if (!t || !S.towers.includes(t)){ closeTowerMenu(); return; }  // 幽靈塔防護
  const now = performance.now();
  if (sellConfirmTower !== t || now >= sellConfirmUntil){
    cancelSellConfirm();
    sellConfirmTower = t;
    sellConfirmUntil = now + 3000;
    const state = S, gen = runGen;
    sellConfirmTimer = setTimeout(() => {
      if (gen !== runGen || state !== S || sellConfirmTower !== t) return;
      cancelSellConfirm();
      if (selTower === t && S.towers.includes(t)) openTowerMenu(t);
      if (S) draw();
    }, 3000);
    openTowerMenu(t); draw();
    return;
  }
  S.coins += Math.round(t.invested * .7);
  S.grid[t.gy][t.gx] = 0;
  S.towers = S.towers.filter(o => o !== t);
  closeTowerMenu(); sfx(300,.1); updateHUD(); draw();
});

/* ── 商店與控制 ───────────────────────────────────── */
document.querySelectorAll('.tower-btn').forEach((b,i) => {
  b.addEventListener('click', () => {
    if (!S || S.over || S.phase === 'clearing') return;
    finishRouteGuide();
    selShop = (selShop === i) ? -1 : i;
    closeTowerMenu(); updateHUD();
    focusBoard();
  });
});
document.querySelectorAll('.sup-btn').forEach((b,i) => {
  b.addEventListener('click', () => {
    if (!S || S.over || S.phase === 'clearing') return;
    finishRouteGuide();
    if (i === 2 && lightCharge.active){ cancelSupportAction(); return; }
    if (S.level < SUPPORT[i].unlock || S.supCd[i] > 0 || S.enemies.every(e => e.dead)) return;
    if (i === 2) startLightCharge();
    else if (selSup === i){
      if (!cancelSupportAction()) focusBoard();
      return;
    } else beginSupportAim(i);
    if (!bp.open) focusBoard();
  });
});
const supportOk = document.getElementById('scOk');
const supportNo = document.getElementById('scNo');
if (supportOk) supportOk.addEventListener('click', confirmSupportTarget);
if (supportNo) supportNo.addEventListener('click', () => cancelSupportAction());
$('btnNextWave').addEventListener('click', () => {
  finishRouteGuide();
  startWave();
});
$('btnSpeed').addEventListener('click', () => {
  speedIdx = (speedIdx+1) % SPEEDS.length;
  $('btnSpeed').textContent = `▶×${SPEEDS[speedIdx]}`;
  applyControlA11y();
});
$('btnPause').addEventListener('click', () => {
  if (!S || S.over) return;
  S.manualPaused = !S.manualPaused;
  syncPauseState();
});
function syncMuteButtons(){
  const hudMute = document.getElementById('btnMute');
  const moreMute = document.getElementById('btnMuteMore');
  const more = document.getElementById('btnMore');
  const controls = L().ui.controls;
  if (hudMute){
    hudMute.textContent = muted ? '♪̸' : '♪';
    hudMute.style.opacity = muted ? .5 : 1;
  }
  if (moreMute){
    moreMute.textContent = muted ? `🔇 ${controls.unmute}` : `♪ ${controls.mute}`;
    moreMute.setAttribute('aria-pressed', String(muted));
  }
  if (more) more.textContent = muted ? '⋯🔇' : '⋯';
}
function toggleMute(){
  muted = !muted;
  uxPrefs.muted = muted;
  saveUxPrefs();
  syncMuteButtons();
  applyControlA11y();
}
$('btnMute').addEventListener('click', toggleMute);
const btnMuteMore = document.getElementById('btnMuteMore');
if (btnMuteMore) btnMuteMore.addEventListener('click', toggleMute);

function updateMorePanel(){
  if (!S) return;
  const score = document.getElementById('moreScoreNow');
  const best = document.getElementById('moreBestNow');
  if (score) score.textContent = S.score;
  if (best){
    const rows = loadBoard();
    best.textContent = rows.length ? Math.max(...rows.map(r => r.s)) : 0;
  }
  const quality = document.getElementById('qualityMode');
  const motion = document.getElementById('reduceMotion');
  const flash = document.getElementById('reduceFlash');
  if (quality) quality.value = uxPrefs.quality;
  if (motion) motion.checked = uxPrefs.reduceMotion;
  if (flash) flash.checked = uxPrefs.reduceFlash;
  syncMuteButtons(); applyQualityClass();
}
function openMore(){
  if (!S || S.over || S.phase === 'clearing') return;
  morePauseWasManual = !!S.manualPaused;
  S.manualPaused = true;
  syncPauseState();
  updateMorePanel();
  show('moreScreen');
}
function closeMore(){
  const screen = document.getElementById('moreScreen');
  if (!screen || !screen.classList.contains('show')) return;
  hide('moreScreen');
  if (S && !S.over){
    S.manualPaused = morePauseWasManual;
    syncPauseState();
  }
}
const btnMore = document.getElementById('btnMore');
const btnMoreClose = document.getElementById('btnMoreClose');
if (btnMore) btnMore.addEventListener('click', openMore);
if (btnMoreClose) btnMoreClose.addEventListener('click', closeMore);
const qualityMode = document.getElementById('qualityMode');
if (qualityMode) qualityMode.addEventListener('change', ev => {
  if (!['auto','full','compact'].includes(ev.target.value)) return;
  uxPrefs.quality = ev.target.value;
  if (uxPrefs.quality === 'auto') setActualQuality(uxPrefs.lastStable, performance.now(), false);
  else setActualQuality(uxPrefs.quality, performance.now(), false);
  saveUxPrefs(); applyQualityClass();
  if (S) draw();
});
const reduceMotion = document.getElementById('reduceMotion');
if (reduceMotion) reduceMotion.addEventListener('change', ev => {
  uxPrefs.reduceMotion = !!ev.target.checked; saveUxPrefs(); applyQualityClass();
  if (S) draw();
});
const reduceFlash = document.getElementById('reduceFlash');
if (reduceFlash) reduceFlash.addEventListener('change', ev => {
  uxPrefs.reduceFlash = !!ev.target.checked; saveUxPrefs();
});

const dangerEdgeButton = document.getElementById('dangerEdge');
if (dangerEdgeButton) dangerEdgeButton.addEventListener('click', () => {
  if (!S || !S.dangerEdgeTarget || S.dangerEdgeTarget.dead) return;
  const target = S.dangerEdgeTarget;
  view.ox = W/2 - target.x * view.scale;
  view.oy = H/2 - target.y * view.scale;
  clampView(); draw();
  placeDangerEdge(null);
});

/* ── 排行榜（localStorage 匿名） ──────────────────── */
const LB_KEY = 'asmd_board_v1';
const MAX_BOARD_SCORE = Number.MAX_SAFE_INTEGER;
function loadBoard(){
  // 完整性防護：localStorage 可能被手動竄改，載入時做型別消毒
  try{
    const raw = JSON.parse(localStorage.getItem(LB_KEY)) || [];
    if (!Array.isArray(raw)) return [];
    return raw.filter(r => {
      if (!r || typeof r !== 'object') return false;
      const score = Number(r.s), level = Number(r.lv);
      return Number.isFinite(score) && score >= 0 && score <= MAX_BOARD_SCORE &&
        Number.isFinite(level);
    })
      .map(r => ({
        n: String(r.n || '匿名').slice(0, 10),
        s: Math.floor(Number(r.s)),
        lv: Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number(r.lv)))),
        d: Number.isFinite(Number(r.d)) ? Math.floor(Number(r.d)) : 0,
      }))
      .slice(0, 10);
  }catch(e){ return []; }
}
function renderBoard(){
  const list = loadBoard();
  const ol = $('boardList');
  ol.innerHTML = list.length ? '' : `<li>${L().ui.boardEmpty}</li>`;
  list.forEach(r => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${escapeHtml(r.n)}</b>　${L().ui.levelTag}${r.lv}<span class="pt">⭐${r.s}</span>`;
    ol.appendChild(li);
  });
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
$('btnSaveScore').addEventListener('click', () => {
  const name = ($('playerName').value.trim() || L().ui.namePh).slice(0,10);
  const list = loadBoard();
  list.push({ n:name, s:S.score, lv:S.level, d:Date.now() });
  list.sort((a,b) => b.s - a.s);
  let saved = true;
  try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0,10))); }
  catch(e){ saved = false; }   // 私密模式／空間不足
  if (saved){
    $('btnSaveScore').disabled = true;
    $('btnSaveScore').textContent = L().ui.btnSaved;
    renderBoard(); show('boardScreen');
  } else {
    $('btnSaveScore').textContent = L().ui.btnSaveFail;  // 誠實回報，按鈕保持可再試
  }
});

/* ── 中途轉向：場上狀態無損轉置 ───────────────────── */
function relayout(){
  const mode = detectLayout();
  if (mode === LAYOUT) return;
  const flip = (LAYOUT === 'mport') !== (mode === 'mport');   // 直↔橫才需轉置
  applyLayout(mode);
  if (S && flip){
    S.path = S.path.map(([x, y]) => [y, x]);
    S.grid = Array.from({length:ROWS}, () => Array(COLS).fill(0));
    for (const [x, y] of S.path) S.grid[y][x] = 1;
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

/* ── 套用語言到靜態介面 ───────────────────────────── */
function applyI18n(){
  const u = L().ui;
  if (document.documentElement)
    document.documentElement.lang = ({zh:'zh-Hant',en:'en',id:'id',vi:'vi'})[LANG] || 'en';
  const set = (id, v, html) => { const el = document.getElementById(id); if (el){ if (html) el.innerHTML = v; else el.textContent = v; } };
  set('tagline', u.tagline, true);
  set('lblName', u.lblName);
  const pn = $('playerName'); if (pn) pn.placeholder = u.namePh;
  set('btnStartTxt', u.btnStart);
  set('btnHow', u.btnHow); set('btnBoard', u.btnBoard);
  set('creditTxt', u.credit, true);
  set('howTitle', u.howTitle); set('howGo', u.howGo);
  const ul = document.getElementById('howListUl');
  if (ul && ul.replaceChildren){
    ul.replaceChildren();
    u.howList.forEach(s => { const li = document.createElement('li'); li.innerHTML = s; ul.appendChild(li); });
  }
  set('quizTitle', u.quizTitle);
  const board = $('cv'); if (board) board.setAttribute('aria-label', u.canvasLabel);
  set('canvasHelp', u.canvasHelp);
  applyControlA11y();
  set('boardTitle', u.boardTitle); set('boardNote', u.boardNote);
  const cb = document.querySelector('.close-board'); if (cb) cb.textContent = u.boardClose;
  set('btnRetry', u.btnRetry);
  const sv = $('btnSaveScore'); if (sv && !sv.disabled) sv.textContent = u.btnSave;
  set('tmUpLbl', u.upLbl); set('tmSellLbl', u.sellLbl);
  set('moreTitle', u.moreTitle); set('morePauseNote', u.morePauseNote);
  set('moreScoreLbl', u.moreScore); set('moreBestLbl', u.moreBest);
  set('qualityLbl', u.qualityLbl); set('reduceMotionLbl', u.reduceMotionLbl);
  set('reduceFlashLbl', u.reduceFlashLbl); set('btnHowMore', u.moreHow); set('btnMoreClose', u.moreClose);
  set('pwaUpdateMsg', u.updateReady); set('pwaUpdateNow', u.updateNow);
  const bmNo = document.getElementById('bmNo');
  if (bmNo){ bmNo.setAttribute('aria-label', u.bpCancel); bmNo.setAttribute('title', u.bpCancel); }
  const qualitySelect = document.getElementById('qualityMode');
  if (qualitySelect){
    Array.from(qualitySelect.options).forEach(opt => { if (u.qualityModes[opt.value]) opt.textContent = u.qualityModes[opt.value]; });
  }
  set('pwaMsg', u.pwaMsg); set('pwaYes', u.pwaYes); set('pwaNo', u.pwaNo); set('pwaNever', u.pwaNever);
  document.querySelectorAll('.tower-btn').forEach((b,i) => {
    const tn = b.querySelector && b.querySelector('.tn');
    if (tn && L().towers[i]) tn.textContent = L().towers[i];
    if (L().towerTips[i]) b.setAttribute('title', L().towerTips[i]);
  });
  set('supLbl', L().support.title);
  document.querySelectorAll('.sup-btn').forEach((b,i) => {
    const sn = b.querySelector && b.querySelector('.sn');
    if (sn && L().support.names[i]) sn.textContent = L().support.names[i];
    if (L().support.tips[i]) b.setAttribute('title', L().support.tips[i]);
  });
  document.querySelectorAll('.lang-btn').forEach(b => {
    if (b.dataset){
      const selected = b.dataset.lang === LANG;
      b.classList.toggle('sel', selected);
      b.setAttribute('aria-pressed', String(selected));
    }
  });
  applyQualityClass();
  syncMuteButtons();
  if (supportAim) renderSupportConfirm();
  if (bp.open) renderBuildMenu();
  if (selTower) openTowerMenu(selTower);
  if (S) updateHUD();
  if (S && document.activeElement === board) announceKeyboardCell();
}
document.querySelectorAll('.lang-btn').forEach(b => {
  b.addEventListener('click', () => {
    if (!b.dataset || !I18N[b.dataset.lang]) return;
    LANG = b.dataset.lang;
    try{ localStorage.setItem('asmd_lang', LANG); }catch(e){}
    applyI18n();
  });
});
applyI18n();

/* ── 畫面切換 ─────────────────────────────────────── */
$('btnStart').addEventListener('click', () => {
  // 行動瀏覽器音訊解鎖：在使用者手勢中建立/喚醒 AudioContext
  try{
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC && AC.resume) AC.resume();
  }catch(e){}
  hide('startScreen');
  $('gameWrap').classList.remove('hidden');
  startGame();
});
$('btnHow').addEventListener('click', () => show('howScreen'));
const btnHowMore = document.getElementById('btnHowMore');
if (btnHowMore) btnHowMore.addEventListener('click', () => show('howScreen'));
document.querySelector('.close-how').addEventListener('click', () => hide('howScreen'));
$('btnBoard').addEventListener('click', () => { renderBoard(); show('boardScreen'); });
document.querySelector('.close-board').addEventListener('click', () => hide('boardScreen'));
$('btnRetry').addEventListener('click', () => { hide('endScreen'); startGame(); });

function startGame(){
  stopLoop();
  runGen++;                                     // 讓上一局的 setTimeout 全部失效
  layoutPauseGen++;
  cancelPendingTap();
  cancelSupportAction(false, false);
  cancelSellConfirm();
  if (scoreToastTimer) clearTimeout(scoreToastTimer);
  scoreToastTimer = 0; scoreToastValue = 0;
  hide('moreScreen');
  S = newState();
  actualQuality = uxPrefs.quality === 'auto' ? uxPrefs.lastStable : uxPrefs.quality;
  perfState = { fps:60, below45At:0, below30At:0, above55At:0, lastChange:-Infinity, downgradedWave:0 };
  quizUsed = [];
  kbFocus = { gx:0, gy:0 };
  selShop = -1; selTower = null; speedIdx = 0; selSup = -1; supportAim = null; hitStop = 0;
  closeTowerMenu();
  closeBuildMenu();
  resetView();
  hide('quizScreen');
  const fx = document.getElementById('stageClear');
  if (fx) fx.classList.add('hidden');
  const scoreToast = document.getElementById('scoreToast');
  if (scoreToast) scoreToast.classList.add('hidden');
  const dangerEdge = document.getElementById('dangerEdge');
  if (dangerEdge) dangerEdge.classList.add('hidden');
  if (document.body) document.body.classList.remove('danger-active');
  $('btnSpeed').textContent = '▶×1';
  $('btnPause').textContent = '❚❚';
  applyControlA11y();
  applyQualityClass();
  genLevel(1);
  S.autoT = 15;                       // 第 1 關給新手多一點佈陣時間
  banner(L().ui.startBanner);
  updateHUD();
  draw();
  focusBoard();
  ensureLoop();
}

/* ── PWA 安裝提示（過第 3 關後一次性；尊重玩家，可永久關閉） ── */
let deferredPrompt = null;
const PWA_NEVER_KEY = 'asmd_pwa_never';
window.addEventListener('beforeinstallprompt', ev => {
  ev.preventDefault();
  deferredPrompt = ev;
  if (S && S.level >= 4) maybeOfferInstall();
});
function dismissPwa(permanent){
  if (permanent){
    try{ localStorage.setItem(PWA_NEVER_KEY, '1'); }catch(e){}
  }
  const bar = document.getElementById('pwaBar');
  if (bar) bar.classList.add('hidden');
}
function maybeOfferInstall(){
  if (!deferredPrompt) return;                      // iOS 無此 API：不打擾
  try{ if (localStorage.getItem(PWA_NEVER_KEY)) return; }catch(e){}
  const bar = document.getElementById('pwaBar');
  if (!bar) return;
  const m = document.getElementById('pwaMsg');
  const y = document.getElementById('pwaYes');
  const n = document.getElementById('pwaNo');
  const never = document.getElementById('pwaNever');
  if (m) m.textContent = L().ui.pwaMsg;
  if (y) y.textContent = L().ui.pwaYes;
  if (n) n.textContent = L().ui.pwaNo;
  if (never) never.textContent = L().ui.pwaNever;
  bar.classList.remove('hidden');
}
(function wirePwa(){
  const y = document.getElementById('pwaYes');
  const n = document.getElementById('pwaNo');
  const never = document.getElementById('pwaNever');
  if (y && y.addEventListener) y.addEventListener('click', async () => {
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    dismissPwa(false);
    if (!promptEvent || !promptEvent.prompt) return;
    try{
      promptEvent.prompt();
      if (promptEvent.userChoice) await promptEvent.userChoice;
      // 原生安裝視窗若取消，只結束本次提示；不記為永久拒絕。
    }catch(e){}
  });
  if (n && n.addEventListener) n.addEventListener('click', () => dismissPwa(false));
  if (never && never.addEventListener) never.addEventListener('click', () => dismissPwa(true));
})();
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  dismissPwa(false);
});

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
  $('cacheStat').textContent = APP_VERSION + (total
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
