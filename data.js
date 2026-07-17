/* ═══ 防詐迷宮 ─ 遊戲資料表（data.js） ═══
   純常數資料，無邏輯。載入順序：i18n.js → data.js → render.js → game.js ═══ */
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
  { key:'shop',   name:'假網拍',   hp:30,  spd:46, gold:8,  dmg:1, score:15,  c1:'#b78ef0', c2:'#5d3f8f', face:'🛍' },
  { key:'invest', name:'假投資',   hp:55,  spd:40, gold:12, dmg:2, score:25,  c1:'#f0c419', c2:'#8f7311', face:'$' },
  { key:'police', name:'假檢警',   hp:120, spd:27, gold:20, dmg:3, score:50,  c1:'#8a94a6', c2:'#3d4451', face:'⚖' },
  { key:'boss',   name:'AI深偽魔王',hp:420, spd:20, gold:90, dmg:5, score:300, c1:'#ef476f', c2:'#7a1030', face:'AI', boss:true },
  { key:'rider',  name:'詐騙車手', hp:42,  spd:82, gold:12, dmg:2, score:30,  c1:'#ff9f43', c2:'#6b2f16', face:'車', rider:true },
];

/* ── 過關轉場英文字（各語言共用的視覺元素） ──────── */
const CLEAR_EN = ['STAGE CLEAR!','SCAM BUSTED!','PERFECT!','YOU WIN!','K.O.!','GREAT!'];

/* ── 特種部隊支援（主動技能：冷卻制、點地圖施放） ── */
const SUPPORT = [
  { key:'ram',   cd:40, unlock:3,  color:'#ff7b39' },   // 破門錘
  { key:'flash', cd:55, unlock:7,  color:'#fff3b0' },   // 震撼彈
  { key:'light', cd:50, unlock:11, color:'#9be7ff' },   // 強光手電筒
  { key:'trip',  cd:35, unlock:6,  color:'#ff9f43' },   // 絆倒車手
  { key:'atm',   cd:60, unlock:14, color:'#57e389' },   // ATM 守護
  { key:'raid',  cd:90, unlock:24, color:'#ef476f' },   // 爆破詐騙機房
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
