/* ═══════════════════════════════════════════════════════════
   防詐迷宮 SCAM MAZE DEFENSE
   87 關像素塔防・純 HTML+CSS+JS・可部署 GitHub Pages
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ── 版本 ─────────────────────────────────────────── */
const APP_VERSION = 'v1.5.0';

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

/* ── 常數 ─────────────────────────────────────────── */
const COLS = 20, ROWS = 12, CELL = 48;
const W = COLS * CELL, H = ROWS * CELL;
const MAX_LEVEL = 87;
const HP_START = 10, HP_CAP = 30, LIVES_START = 3, LIVES_CAP = 5;

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

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
  { name:'里長廣播站', cost:110, range:120, dmg:0,  rate:0,   color:'#ff9e36', glyph:'🔊', buff:.7,  unlock:5  },  // 範圍內塔攻速+30%
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
let hitStop = 0;       // 慢動作剩餘秒數

function newState(){
  return {
    level:1, hp:HP_START, lives:LIVES_START, coins:120, score:0, kills:0,
    towers:[], enemies:[], projs:[], fx:[], allies:[],
    path:[], grid:[], spawnQ:[], spawnT:0,
    playing:false, waveActive:false, over:false, paused:false,
    autoT:0, mod:MODS[0],
    supCd:[0,0,0], beam:null,
    critter:null, critT: 9 + Math.random()*8,
  };
}

/* ── 迷宮路徑產生（seed = 關卡編號） ───────────────── */
function genLevel(lv){
  const rng = RNG(lv * 7919 + 12345);
  const cells = [];
  let r = 2 + Math.floor(rng() * (ROWS - 4)), c = 0;
  cells.push([c, r]);
  while (c < COLS - 1){
    let run = 2 + Math.floor(rng() * 3);
    while (run-- > 0 && c < COLS - 1){ c++; cells.push([c, r]); }
    if (c >= COLS - 1) break;
    let nr = 1 + Math.floor(rng() * (ROWS - 2));
    while (nr === r) nr = 1 + Math.floor(rng() * (ROWS - 2));
    const dir = nr > r ? 1 : -1;
    while (r !== nr){ r += dir; cells.push([c, r]); }
  }
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
  buildWave(lv);
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
  S.spawnQ = q; S.spawnT = 0; S.waveActive = false;
}

/* ── 敵人 ─────────────────────────────────────────── */
function spawnEnemy(item){
  const t = ETYPES[item.ti];
  S.enemies.push({
    ti:item.ti, hp:t.hp*item.hpMul, hpMax:t.hp*item.hpMul,
    seg:0, prog:0, x:S.path[0][0]*CELL+CELL/2, y:S.path[0][1]*CELL+CELL/2,
    spd:t.spd, slowUntil:0, slowPct:0, dead:false, wob:Math.random()*6.28,
  });
}
function moveEnemy(e, dt){
  let sp = e.spd * S.mod.spd * (performance.now() < e.slowUntil ? (1 - e.slowPct) : 1);
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

/* ── 塔攻擊 ───────────────────────────────────────── */
function buffFactor(t){
  // 里長廣播站光環：範圍內的塔攻速提升
  for (const o of S.towers){
    const s = TOWERS[o.ti];
    if (!s.buff || o === t) continue;
    if ((o.x-t.x)**2 + (o.y-t.y)**2 <= o.range*o.range) return s.buff;
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
  });
  sfx(spec.glyph==='📢'?200:420+t.ti*60, .04);
}

function hitEnemy(e, dmg, src){
  if (e.markUntil && performance.now() < e.markUntil) dmg *= 1.5;  // 記者爆料：已曝光傷害+50%
  e.hp -= dmg;
  if (src && src.bounty) S.coins += src.bounty;   // 行員攔阻匯款：命中回收點數
  const t = ETYPES[e.ti];
  // 檢察官起訴：血量低於門檻直接定罪（魔王除外）
  if (src && src.execute && !t.boss && e.hp > 0 && e.hp <= e.hpMax * src.execute) e.hp = 0;
  if (e.hp <= 0 && !e.dead){
    e.dead = true;
    S.kills++;
    S.coins += t.gold + (S.mod.gold || 0);   // 豐收日加成
    S.score += Math.round(t.score * (1 + S.level*.02));
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
    if ((e.x-tw.x)**2 + (e.y-tw.y)**2 > tw.range*tw.range) continue;
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
function moveProj(p, dt){
  const e = p.tx;
  if (!e || e.dead){ return true; }
  const dx = e.x - p.x, dy = e.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 14){
    if (p.splash){
      burst(e.x, e.y, p.color, 8);
      for (const o of S.enemies){
        if (o.dead) continue;
        if ((o.x-e.x)**2 + (o.y-e.y)**2 <= p.splash*p.splash) hitEnemy(o, p.dmg, p);
      }
    } else {
      hitEnemy(e, p.dmg, p);
    }
    if (p.slow){ e.slowUntil = performance.now() + p.slowT*1000; e.slowPct = p.slow; }
    if (p.stun){ e.slowUntil = performance.now() + p.stun*1000; e.slowPct = 1; } // 警察逮捕：原地暈眩
    if (p.mark){ e.markUntil = performance.now() + p.mark*1000; }                // 記者：貼上「已曝光」
    if (p.knock && !ETYPES[e.ti].boss && !e.dead){                               // 阿嬤：罵到倒退嚕
      e.seg = Math.max(0, e.seg - p.knock); e.prog = 0;
    }
    return true;
  }
  p.x += dx/d * p.spd * dt;
  p.y += dy/d * p.spd * dt;
  return false;
}

/* ── 粒子特效 ─────────────────────────────────────── */
function burst(x, y, color, n){
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
  el.style.background = color;
  el.classList.remove('flash-on');
  void el.offsetWidth;   // 重觸發動畫
  el.classList.add('flash-on');
}

/* ── 特種部隊支援施放 ─────────────────────────────── */
function useSupport(i, px, py){
  const sp = SUPPORT[i];
  S.supCd[i] = sp.cd;
  selSup = -1;
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
    const until = performance.now() + 2500;
    const dmg = 35 + S.level * 2;
    for (const e of S.enemies){
      if (e.dead) continue;
      e.slowUntil = until; e.slowPct = 1;
      if ((e.x-px)**2 + (e.y-py)**2 <= 140*140) hitEnemy(e, dmg, null);
    }
  } else {
    // 強光手電筒：光束橫掃全圖，傷害＋曝光標記
    shake(6);
    screenFlash('rgba(150,220,255,.25)');
    sfxBoom(300);
    S.beam = { x:-40, spd:(W + 120)/1.15, hit:new Set() };
  }
  updateHUD();
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
        best.slowUntil = now + 1400; best.slowPct = .5;
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
function loop(ts){
  raf = requestAnimationFrame(loop);
  if (!S || S.paused || S.over){ lastT = ts; return; }
  const rawDt = Math.min(.05, (ts - lastT)/1000);
  lastT = ts;
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
    b.x += b.spd * dt;
    const dmg = 30 + S.level * 2;
    for (const e of S.enemies){
      if (e.dead || b.hit.has(e)) continue;
      if (Math.abs(e.x - b.x) < 28){
        b.hit.add(e);
        e.markUntil = now + 4000;
        hitEnemy(e, dmg, null);
      }
    }
    if (b.x > W + 60) S.beam = null;
  }

  // 自動出怪倒數（可提前手動按）
  if (!S.waveActive && !S.over && S.autoT > 0){
    S.autoT -= dt;
    if (S.autoT <= 0){ S.waveActive = true; banner(fmt(L().ui.waveBanner, {lv:S.level})); }
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
    if (moveEnemy(e, dt)){
      e.dead = true;
      S.hp -= ETYPES[e.ti].dmg;
      burst(e.x, e.y, '#ff5555', 12);
      sfx(60, .25, 'sawtooth');
      shake(6);
      if (S.hp <= 0) loseLife();
    }
  }
  S.enemies = S.enemies.filter(e => !e.dead);
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
  if (S.waveActive && !S.spawnQ.length && !S.enemies.length && !S.over){
    S.waveActive = false;
    levelClear();
  }
  updateHUD();
  draw();
}

/* ── 損命／結束 ───────────────────────────────────── */
function loseLife(){
  S.lives--;
  if (S.lives <= 0){ gameOver(false); return; }
  S.hp = HP_START;
  S.enemies = []; S.projs = [];
  banner(fmt(L().ui.lifeLost, {n:S.lives}));
  S.waveActive = true; // 繼續當前波剩餘的怪
}
function gameOver(win){
  S.over = true;
  const t = document.getElementById('endTitle');
  t.textContent = win ? '🏆 YOU WIN!' : L().ui.loseTitle;
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
    setTimeout(() => sfx(494, .3, 'sine'), 220);
    setTimeout(() => sfx(587, .5, 'sine'), 470);
  }
}

/* ── 過關流程：轉場 →（每3關測驗）→ 下一關 ────────── */
function levelClear(){
  S.score += 50 + S.level * 5;
  S.coins += 40 + Math.floor(S.level * 2) + Math.floor(S.coins * .05); // 過關獎勵＋5% 利息
  if (S.level >= MAX_LEVEL){ playClearFx(() => gameOver(true)); return; }
  playClearFx(() => {
    if (S.level % 3 === 0) showQuiz(afterQuiz);
    else afterQuiz();
  });
}
function afterQuiz(){
  S.level++;
  genLevel(S.level);
  S.autoT = 10;
  const modName = L().ui.mods[S.mod.key];
  const modTag = modName ? `　${modName}` : '';
  const supNews = SUPPORT.map((s,i) => ({s,i})).filter(o => o.s.unlock === S.level);
  if (supNews.length){
    banner(fmt(L().support.unlock, {name:L().support.names[supNews[0].i]}));
    sfx(520,.1); sfx(780,.1); sfx(1040,.15);
    updateHUD();
    return;
  }
  const news = TOWERS.map((t,i) => ({t,i})).filter(o => o.t.unlock === S.level);
  banner(news.length
    ? fmt(L().ui.unlockBanner, {names:news.map(o => L().towers[o.i]).join('、'), mod:modTag})
    : fmt(L().ui.stageBanner, {lv:S.level, boss:S.level%10===0?L().ui.bossTag:'', mod:modTag}));
  if (news.length){ sfx(520,.1); sfx(780,.1); sfx(1040,.15); }
  updateHUD();
}

/* ── 快打旋風式過關轉場 ───────────────────────────── */
function playClearFx(cb){
  const fx = document.getElementById('stageClear');
  document.getElementById('clearWordEn').textContent =
    `STAGE ${S.level} ` + CLEAR_EN[Math.floor(Math.random()*CLEAR_EN.length)];
  document.getElementById('clearWordZh').textContent =
    L().ui.clear[Math.floor(Math.random()*L().ui.clear.length)];
  document.getElementById('clearTip').textContent = '💡 ' + L().tips[(S.level - 1) % L().tips.length];
  fx.classList.remove('hidden','out');
  sfx(660,.1); setTimeout(()=>sfx(880,.12),120); setTimeout(()=>sfx(1180,.2),260);
  setTimeout(() => fx.classList.add('out'), 2000);
  setTimeout(() => { fx.classList.add('hidden'); cb(); }, 2350);
}

/* ── 續命測驗（避開詐騙 → +1 命） ─────────────────── */
let quizUsed = [];
function showQuiz(cb){
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
  const done = (ok) => {
    bGood.disabled = bBad.disabled = true;
    res.classList.remove('hidden');
    if (ok){
      const gained = S.lives < LIVES_CAP;
      if (gained) S.lives++;
      res.classList.add('ok');
      res.textContent = (gained ? L().ui.quizOkLife : L().ui.quizOkFull) + '\n' + q.why;
      if (!gained) S.score += 100;
      sfx(880,.15); setTimeout(()=>sfx(1320,.2),130);
    } else {
      S.hp = Math.max(1, S.hp - 5);
      res.classList.add('no');
      res.textContent = L().ui.quizNo + '\n' + q.why;
      sfx(70,.3,'sawtooth');
    }
    updateHUD();
    setTimeout(() => { hide('quizScreen'); cb(); }, 2600);
  };
  bGood.onclick = () => done(true);
  bBad.onclick  = () => done(false);
  show('quizScreen');
}

/* ══════════════════ 繪圖 ══════════════════ */
let shakeAmt = 0;
function shake(n){ shakeAmt = n; }

function draw(){
  ctx.save();
  if (shakeAmt > .5){
    ctx.translate((Math.random()-.5)*shakeAmt, (Math.random()-.5)*shakeAmt);
    shakeAmt *= .88;
  }
  // 地面：仿真像素草地（兩色棋盤＋草叢、草刃、小花，種子固定不閃爍）
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    const px = x*CELL, py = y*CELL;
    ctx.fillStyle = (x+y)%2 ? '#3d8b40' : '#378039';
    ctx.fillRect(px, py, CELL, CELL);
    if (S.grid[y][x] === 1) continue;              // 路面另外畫
    let h = ((x*73856093) ^ (y*19349663) ^ 0x9e3779b9) >>> 0;
    const rnd = () => { h = (h*1664525+1013904223)>>>0; return h/4294967296; };
    // 草刃（深淺兩層）
    const blades = 4 + Math.floor(rnd()*4);
    for (let i=0;i<blades;i++){
      const bx = px + 4 + rnd()*(CELL-10);
      const by = py + 6 + rnd()*(CELL-14);
      ctx.fillStyle = rnd() < .5 ? '#4caf50' : '#2e6b31';
      ctx.fillRect(bx, by, 2, 5 + rnd()*4);
      ctx.fillRect(bx+2, by+2, 2, 3);
    }
    // 偶爾一朵小花／碎石
    const r = rnd();
    if (r < .07){
      const fx2 = px + 8 + rnd()*(CELL-18), fy2 = py + 8 + rnd()*(CELL-18);
      ctx.fillStyle = r < .04 ? '#ffd166' : '#f4f1e8';
      ctx.fillRect(fx2, fy2, 4, 4);
      ctx.fillStyle = '#e05d3f';
      if (r < .02) ctx.fillRect(fx2+1, fy2+1, 2, 2);
    }
  }
  // 路（泥土小徑 + 磚縫，與綠草對比）
  for (const [x,y] of S.path){
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4);
    ctx.fillStyle = '#b08f52';
    ctx.fillRect(x*CELL+2, y*CELL+CELL/2-1, CELL-4, 2);
    ctx.fillRect(x*CELL+CELL/2-1, y*CELL+2, 2, CELL/2-2);
    ctx.fillStyle = '#2e6b31';                     // 草沿邊
    ctx.fillRect(x*CELL, y*CELL, CELL, 2);
    ctx.fillRect(x*CELL, y*CELL+CELL-2, CELL, 2);
  }
  // 起點傳送門
  const [sx,sy] = S.path[0];
  drawPortal(sx*CELL+CELL/2, sy*CELL+CELL/2);
  // 終點民眾之家
  const [ex,ey] = S.path[S.path.length-1];
  drawHouse(ex*CELL+CELL/2, ey*CELL+CELL/2);
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
  for (const t of S.towers) drawTower(t);
  // 敵人
  for (const e of S.enemies) drawEnemy(e);
  // 志工
  for (const a of S.allies) drawAlly(a);
  // 草地小幫手
  if (S.critter) drawCritter(S.critter);
  // 投射物
  for (const p of S.projs){
    ctx.fillStyle = p.color;
    if (p.ti === 3){ // 廣播：聲波環
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
  // 強光手電筒光束
  if (S.beam){
    const bx = S.beam.x;
    const gr = ctx.createLinearGradient(bx-34, 0, bx+34, 0);
    gr.addColorStop(0, 'rgba(155,231,255,0)');
    gr.addColorStop(.5, 'rgba(230,250,255,.75)');
    gr.addColorStop(1, 'rgba(155,231,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(bx-34, 0, 68, H);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(bx-3, 0, 6, H);
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
  if (performance.now() < e.slowUntil){
    ctx.fillStyle = 'rgba(80,160,255,.6)';
    ctx.fillRect(x-s, y-s, s*2, 4);
  }
  // 已曝光標記（記者爆料）
  if (e.markUntil && performance.now() < e.markUntil){
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
function show(id){ $(id).classList.add('show'); }
function hide(id){ $(id).classList.remove('show'); }

function updateHUD(){
  $('lvNow').textContent = S.level;
  $('hpNow').textContent = S.hp;
  $('livesNow').textContent =
    '💛'.repeat(Math.max(0, S.lives)) + '🖤'.repeat(Math.max(0, LIVES_START - S.lives));
  $('coinNow').textContent = S.coins;
  $('scoreNow').textContent = S.score;
  document.querySelectorAll('.tower-btn').forEach((b,i) => {
    const spec = TOWERS[i]; if (!spec) return;
    const locked = S.level < (spec.unlock || 1);
    b.classList.toggle('sel', selShop === i);
    b.classList.toggle('locked', locked);
    b.disabled = locked || S.coins < spec.cost;
    const tc = b.querySelector && b.querySelector('.tc');
    if (tc) tc.textContent = locked ? '🔒Lv.' + spec.unlock : '🪙' + spec.cost;
  });
  document.querySelectorAll('.sup-btn').forEach((b,i) => {
    const sp = SUPPORT[i]; if (!sp) return;
    const locked = S.level < sp.unlock;
    const cd = S.supCd[i];
    b.classList.toggle('locked', locked);
    b.classList.toggle('aiming', selSup === i);
    b.classList.toggle('ready', !locked && cd <= 0);
    b.disabled = locked || cd > 0;
    const cdEl = b.querySelector && b.querySelector('.cd');
    if (cdEl) cdEl.textContent = locked ? '🔒Lv.' + sp.unlock : (cd > 0 ? Math.ceil(cd) + 's' : 'GO');
  });
  const nb = $('btnNextWave');
  nb.disabled = S.waveActive;
  nb.textContent = S.waveActive ? L().ui.waveIn : (S.autoT > 0 ? fmt(L().ui.waveCount, {n:Math.ceil(S.autoT)}) : L().ui.waveGo);
}

let bannerTimer = 0;
function banner(msg){
  const b = $('waveBanner');
  b.textContent = msg;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 2600);
}

/* ── 畫布互動（滑鼠＋觸控） ───────────────────────── */
function canvasPos(ev){
  const r = cv.getBoundingClientRect();
  const cx = (ev.clientX - r.left) * (W / r.width);
  const cy = (ev.clientY - r.top) * (H / r.height);
  return [Math.floor(cx / CELL), Math.floor(cy / CELL)];
}
cv.addEventListener('pointerdown', ev => {
  if (!S || S.over || S.paused) return;
  ev.preventDefault();
  if (selSup >= 0){
    const r = cv.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const py = (ev.clientY - r.top) * (H / r.height);
    useSupport(selSup, px, py);
    return;
  }
  const [gx, gy] = canvasPos(ev);
  if (gx<0||gy<0||gx>=COLS||gy>=ROWS) return;
  const hit = S.towers.find(t => t.gx===gx && t.gy===gy);
  if (hit){ openTowerMenu(hit); return; }
  closeTowerMenu();
  if (selShop >= 0 && S.grid[gy][gx] === 0){
    const spec = TOWERS[selShop];
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
});

/* ── 塔選單（升級／拆除） ─────────────────────────── */
function openTowerMenu(t){
  selTower = t;
  const m = $('towerMenu');
  const spec = TOWERS[t.ti];
  $('tmName').textContent = `${L().towers[t.ti]} Lv.${t.lv}`;
  const upCost = Math.round(spec.cost * .8 * t.lv);
  $('tmUpCost').textContent = t.lv >= MAX_TLV ? 'MAX' : upCost;
  $('tmUp').disabled = t.lv >= MAX_TLV || S.coins < upCost;
  $('tmSellGain').textContent = Math.round(t.invested * .7);
  m.classList.remove('hidden');
  const r = cv.getBoundingClientRect();
  const st = $('stage').getBoundingClientRect();
  let mx = r.left - st.left + (t.gx+1)*CELL * (r.width/W);
  let my = r.top - st.top + t.gy*CELL * (r.height/H);
  m.style.left = Math.min(mx, st.width - 150) + 'px';
  m.style.top  = Math.max(0, my) + 'px';
}
function closeTowerMenu(){ selTower = null; $('towerMenu').classList.add('hidden'); }
$('tmUp').addEventListener('click', () => {
  const t = selTower; if (!t) return;
  const spec = TOWERS[t.ti];
  const upCost = Math.round(spec.cost * .8 * t.lv);
  if (t.lv >= MAX_TLV || S.coins < upCost) return;
  S.coins -= upCost; t.invested += upCost;
  t.lv++; t.dmg = Math.round(t.dmg * UP_MULT.dmg); t.range = Math.round(t.range * UP_MULT.range);
  sfx(660,.08); sfx(990,.1);
  openTowerMenu(t); updateHUD();
});
$('tmSell').addEventListener('click', () => {
  const t = selTower; if (!t) return;
  S.coins += Math.round(t.invested * .7);
  S.grid[t.gy][t.gx] = 0;
  S.towers = S.towers.filter(o => o !== t);
  closeTowerMenu(); sfx(300,.1); updateHUD();
});

/* ── 商店與控制 ───────────────────────────────────── */
document.querySelectorAll('.tower-btn').forEach((b,i) => {
  b.addEventListener('click', () => {
    selShop = (selShop === i) ? -1 : i;
    closeTowerMenu(); updateHUD();
  });
});
document.querySelectorAll('.sup-btn').forEach((b,i) => {
  b.addEventListener('click', () => {
    if (!S || S.level < SUPPORT[i].unlock || S.supCd[i] > 0) return;
    selSup = (selSup === i) ? -1 : i;
    selShop = -1; closeTowerMenu();
    if (selSup >= 0) banner(L().support.aim);
    updateHUD();
  });
});
$('btnNextWave').addEventListener('click', () => {
  if (!S.waveActive){ S.waveActive = true; S.autoT = 0; banner(fmt(L().ui.waveBanner, {lv:S.level})); updateHUD(); }
});
$('btnSpeed').addEventListener('click', () => {
  speedIdx = (speedIdx+1) % SPEEDS.length;
  $('btnSpeed').textContent = `▶×${SPEEDS[speedIdx]}`;
});
$('btnPause').addEventListener('click', () => {
  S.paused = !S.paused;
  $('btnPause').textContent = S.paused ? '▶' : '❚❚';
});
$('btnMute').addEventListener('click', () => {
  muted = !muted;
  $('btnMute').textContent = muted ? '♪̸' : '♪';
  $('btnMute').style.opacity = muted ? .5 : 1;
});

/* ── 排行榜（localStorage 匿名） ──────────────────── */
const LB_KEY = 'asmd_board_v1';
function loadBoard(){
  // 完整性防護：localStorage 可能被手動竄改，載入時做型別消毒
  try{
    const raw = JSON.parse(localStorage.getItem(LB_KEY)) || [];
    if (!Array.isArray(raw)) return [];
    return raw.filter(r => r && typeof r === 'object')
      .map(r => ({
        n: String(r.n || '匿名').slice(0, 10),
        s: Math.max(0, Math.floor(Number(r.s) || 0)),
        lv: Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number(r.lv) || 1))),
        d: Math.floor(Number(r.d) || 0),
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
  try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0,10))); }
  catch(e){ /* 可用性防護：私密模式或空間不足時不中斷流程 */ }
  $('btnSaveScore').disabled = true;
  $('btnSaveScore').textContent = L().ui.btnSaved;
  renderBoard(); show('boardScreen');
});

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
  set('boardTitle', u.boardTitle); set('boardNote', u.boardNote);
  const cb = document.querySelector('.close-board'); if (cb) cb.textContent = u.boardClose;
  set('btnRetry', u.btnRetry);
  const sv = $('btnSaveScore'); if (sv && !sv.disabled) sv.textContent = u.btnSave;
  set('tmUpLbl', u.upLbl); set('tmSellLbl', u.sellLbl);
  document.querySelectorAll('.tower-btn').forEach((b,i) => {
    const tn = b.querySelector && b.querySelector('.tn');
    if (tn && L().towers[i]) tn.textContent = L().towers[i];
  });
  set('supLbl', L().support.title);
  document.querySelectorAll('.sup-btn').forEach((b,i) => {
    const sn = b.querySelector && b.querySelector('.sn');
    if (sn && L().support.names[i]) sn.textContent = L().support.names[i];
  });
  document.querySelectorAll('.lang-btn').forEach(b => {
    if (b.dataset) b.classList.toggle('sel', b.dataset.lang === LANG);
  });
  if (S) updateHUD();
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
  hide('startScreen');
  $('gameWrap').classList.remove('hidden');
  startGame();
});
$('btnHow').addEventListener('click', () => show('howScreen'));
document.querySelector('.close-how').addEventListener('click', () => hide('howScreen'));
$('btnBoard').addEventListener('click', () => { renderBoard(); show('boardScreen'); });
document.querySelector('.close-board').addEventListener('click', () => hide('boardScreen'));
$('btnRetry').addEventListener('click', () => { hide('endScreen'); startGame(); });

function startGame(){
  S = newState();
  quizUsed = [];
  selShop = -1; selTower = null; speedIdx = 0; selSup = -1; hitStop = 0;
  $('btnSpeed').textContent = '▶×1';
  genLevel(1);
  S.autoT = 15;                       // 第 1 關給新手多一點佈陣時間
  banner(L().ui.startBanner);
  updateHUD();
  if (!raf){ lastT = performance.now(); raf = requestAnimationFrame(loop); }
}

/* ── Service Worker 快取命中統計 ──────────────────── */
let cHit = 0, cMiss = 0;
function paintCache(){
  const total = cHit + cMiss;
  $('cacheStat').textContent = APP_VERSION + (total
    ? ` | CACHE ${Math.round(cHit/total*100)}% (${cHit}/${total})`
    : ' | CACHE --');
}
if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
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
