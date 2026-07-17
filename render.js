/* ═══ 防詐迷宮 ─ canvas 繪圖與詐團造型（render.js） ═══
   只讀全域狀態繪製，不改遊戲邏輯。載入順序：i18n.js → data.js → render.js → game.js ═══ */
/* canvas 元素與 2D context：宣告在此檔（載入序在 combat/ui/game 之前），後載各檔頂層可安全引用 */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

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
  for (const [x,y] of S.path.concat(S.branchCells || [])){  // 泥土小徑＋磚縫＋草沿邊（支線岔路同款）
    g.fillStyle = '#c9a86a';
    g.fillRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4);
    g.fillStyle = '#b08f52';
    g.fillRect(x*CELL+2, y*CELL+CELL/2-1, CELL-4, 2);
    g.fillRect(x*CELL+CELL/2-1, y*CELL+2, 2, CELL/2-2);
    g.fillStyle = '#2e6b31';
    g.fillRect(x*CELL, y*CELL, CELL, 2);
    g.fillRect(x*CELL, y*CELL+CELL-2, CELL, 2);
  }
  if (S.pathWide && S.pathWide.length){             // 加寬路肩：鋪同款泥徑，但貼中心線那側不畫綠邊，避免寬巷中間出現突兀線
    const onCenterline = new Set(S.path.concat(S.branchCells || []).map(([px,py]) => `${px},${py}`));
    for (const [x,y] of S.pathWide){
      g.fillStyle = '#c9a86a';
      g.fillRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4);
      g.fillStyle = '#b08f52';
      g.fillRect(x*CELL+2, y*CELL+CELL/2-1, CELL-4, 2);
      g.fillRect(x*CELL+CELL/2-1, y*CELL+2, 2, CELL/2-2);
      g.fillStyle = '#2e6b31';
      if (!onCenterline.has(`${x},${y-1}`)) g.fillRect(x*CELL, y*CELL, CELL, 2);
      if (!onCenterline.has(`${x},${y+1}`)) g.fillRect(x*CELL, y*CELL+CELL-2, CELL, 2);
    }
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
    const radius = supportRadius(supportAim.i);
    ctx.beginPath(); ctx.arc(supportAim.x, supportAim.y, radius, 0, 6.28);
    ctx.fillStyle = supportAim.i === 5 ? 'rgba(239,71,111,.15)'
      : supportAim.i === 4 ? 'rgba(87,227,137,.14)'
      : supportAim.i === 0 ? 'rgba(255,123,57,.14)' : 'rgba(255,243,176,.14)';
    ctx.fill();
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
    if (f.skid){ drawSkidFx(f); continue; }
    if (f.atmGrab){ drawAtmGrabFx(f); continue; }
    if (f.roomBlast){ drawRoomBlastFx(f); continue; }
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
      ctx.globalAlpha = Math.min(1, Math.max(0, f.life * 2));
      ctx.fillStyle = '#ffffff';
      ctx.font = "10px 'Cubic 11','Press Start 2P',sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(f.txt, f.x, f.y, CELL * 2);
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
function drawSkidFx(f){
  const p = 1 - Math.max(0, f.life) / f.maxLife;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p);
  ctx.strokeStyle = '#f4f1e8'; ctx.lineWidth = 3; ctx.setLineDash([7,4]);
  ctx.beginPath(); ctx.moveTo(f.x-58, f.y-24); ctx.quadraticCurveTo(f.x-15, f.y-38, f.x+8, f.y-5); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(f.x-42, f.y+12); ctx.lineTo(f.x+34, f.y+18); ctx.stroke();
  const sparks = actualQuality === 'full' ? 6 : 3;
  ctx.fillStyle = '#ffd166';
  for (let i=0;i<sparks;i++) ctx.fillRect(f.x+18+i*5, f.y+8-(i%3)*5, 4, 4);
  ctx.restore();
}
function drawAtmGrabFx(f){
  const p = 1 - Math.max(0, f.life) / f.maxLife;
  const alpha = Math.max(0, 1 - Math.max(0, p-.7)/.3);
  ctx.save(); ctx.globalAlpha = alpha;
  const x=f.x, y=f.y-48;
  ctx.fillStyle='#18392a'; ctx.fillRect(x-25,y-24,50,45);
  ctx.fillStyle='#57e389'; ctx.fillRect(x-21,y-20,42,37);
  ctx.fillStyle='#10271d'; ctx.fillRect(x-14,y-13,28,13);
  ctx.fillStyle='#dfffea'; ctx.font="bold 8px 'Press Start 2P',monospace"; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('ATM',x,y-6);
  ctx.fillStyle='#ffd166'; ctx.fillRect(x-12,y+5,24,4);
  ctx.strokeStyle='#57e389'; ctx.lineWidth=7;
  ctx.beginPath(); ctx.moveTo(x-22,y+9); ctx.lineTo(x-35,f.y); ctx.lineTo(x-18,f.y+8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+22,y+9); ctx.lineTo(x+35,f.y); ctx.lineTo(x+18,f.y+8); ctx.stroke();
  ctx.fillStyle='#18392a'; ctx.fillRect(x-23,f.y+4,12,8); ctx.fillRect(x+11,f.y+4,12,8);
  ctx.restore();
}
function drawRoomBlastFx(f){
  const p = 1 - Math.max(0, f.life) / f.maxLife;
  ctx.save();
  if (p < .28){
    const alpha = 1 - p/.36;
    ctx.globalAlpha = Math.max(.25, alpha);
    ctx.fillStyle='#2b2030'; ctx.fillRect(f.x-52,f.y-42,104,84);
    ctx.fillStyle='#ef476f'; ctx.fillRect(f.x-48,f.y-38,96,7);
    ctx.fillStyle='#101018';
    for(let row=0;row<2;row++) for(let col=0;col<3;col++) ctx.fillRect(f.x-37+col*31,f.y-23+row*25,20,14);
    ctx.fillStyle='#ff626f'; ctx.font="bold 10px 'Press Start 2P',monospace"; ctx.textAlign='center';
    ctx.fillText('SCAM',f.x,f.y+4);
  } else {
    const blast = Math.min(1,(p-.28)/.42);
    ctx.globalAlpha = Math.max(0,1-(p-.28)/.72);
    ctx.fillStyle = uxPrefs.reduceFlash ? 'rgba(255,159,67,.32)' : 'rgba(255,209,102,.64)';
    ctx.beginPath(); ctx.arc(f.x,f.y,18+f.r*blast,0,6.28); ctx.fill();
    ctx.strokeStyle=f.color; ctx.lineWidth=8; ctx.beginPath(); ctx.arc(f.x,f.y,8+f.r*blast,0,6.28); ctx.stroke();
    const debris = actualQuality === 'full' ? 12 : 6;
    ctx.fillStyle='#2b2030';
    for(let i=0;i<debris;i++){
      const a=i*6.28/debris, d=25+blast*75;
      ctx.save(); ctx.translate(f.x+Math.cos(a)*d,f.y+Math.sin(a)*d); ctx.rotate(a); ctx.fillRect(-5,-3,10,6); ctx.restore();
    }
  }
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
/* ── 詐團造型（每種取代原本共用的方形賊臉樣板） ────── */
function drawGenericScamBody(t, x, y, s){
  ctx.fillStyle = t.c2; ctx.fillRect(x-s, y-s, s*2, s*2);
  ctx.fillStyle = t.c1; ctx.fillRect(x-s+3, y-s+3, s*2-6, s*2-6);
  ctx.fillStyle = '#101018';
  ctx.fillRect(x-s+5, y-4, 5, 5); ctx.fillRect(x+s-10, y-4, 5, 5);
  ctx.fillRect(x-4, y+5, 8, 3);
}
function drawPhishBody(t, x, y, s){
  // 信封本體＋摺角
  ctx.fillStyle = t.c2; ctx.fillRect(x-s, y-s+4, s*2, s*2-4);
  ctx.fillStyle = t.c1; ctx.fillRect(x-s+3, y-s+7, s*2-6, s*2-10);
  ctx.fillStyle = t.c2;
  ctx.beginPath();
  ctx.moveTo(x-s, y-s+4); ctx.lineTo(x, y+1); ctx.lineTo(x+s, y-s+4);
  ctx.closePath(); ctx.fill();
  // 釣魚勾（方塊拼出的 J 形鉤子）
  ctx.fillStyle = '#ef476f';
  ctx.fillRect(x+s-4, y-s-7, 3, 8);
  ctx.fillRect(x+s-9, y-s-2, 5, 3);
  // 眼睛（賊笑）
  ctx.fillStyle = '#101018';
  ctx.fillRect(x-s+5, y-2, 4, 4); ctx.fillRect(x+s-9, y-2, 4, 4);
}
function drawShopBody(t, x, y, s){
  // 提袋本體
  ctx.fillStyle = t.c2; ctx.fillRect(x-s, y-s+8, s*2, s*2-8);
  ctx.fillStyle = t.c1; ctx.fillRect(x-s+3, y-s+11, s*2-6, s*2-14);
  // 提把（左右兩個 L 形迴圈）
  ctx.fillStyle = t.c2;
  ctx.fillRect(x-s+3, y-s, 3, 9); ctx.fillRect(x-s+3, y-s, 9, 3);
  ctx.fillRect(x+s-6, y-s, 3, 9); ctx.fillRect(x+s-12, y-s, 9, 3);
  // 假五星標籤
  ctx.fillStyle = '#ffd166'; ctx.fillRect(x-3, y+2, 6, 6);
  // 眼睛（賊笑）
  ctx.fillStyle = '#101018';
  ctx.fillRect(x-s+6, y-3, 4, 4); ctx.fillRect(x+s-10, y-3, 4, 4);
}
function drawInvestBody(t, x, y, s){
  // 底板
  ctx.fillStyle = t.c2; ctx.fillRect(x-s, y-s, s*2, s*2);
  ctx.fillStyle = t.c1; ctx.fillRect(x-s+3, y-s+3, s*2-6, s*2-6);
  // 假上升柱狀圖（誘騙式暴衝曲線）
  ctx.fillStyle = '#26a269';
  ctx.fillRect(x-s+5, y+4, 4, 6);
  ctx.fillRect(x-s+11, y, 4, 10);
  ctx.fillRect(x-s+17, y-6, 4, 16);
  // 紅色假箭頭
  ctx.fillStyle = '#ef476f';
  ctx.fillRect(x+s-9, y-s+5, 6, 3);
  ctx.fillRect(x+s-6, y-s+5, 3, 6);
}
function drawPoliceBody(t, x, y, s){
  // 假警徽（盾牌五邊形）
  ctx.fillStyle = t.c2;
  ctx.beginPath();
  ctx.moveTo(x-s, y-s); ctx.lineTo(x+s, y-s); ctx.lineTo(x+s, y+2);
  ctx.lineTo(x, y+s); ctx.lineTo(x-s, y+2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = t.c1;
  ctx.beginPath();
  ctx.moveTo(x-s+3, y-s+3); ctx.lineTo(x+s-3, y-s+3); ctx.lineTo(x+s-3, y+1);
  ctx.lineTo(x, y+s-4); ctx.lineTo(x-s+3, y+1);
  ctx.closePath(); ctx.fill();
  // 眼睛（賊笑）
  ctx.fillStyle = '#101018';
  ctx.fillRect(x-s+5, y-6, 4, 4); ctx.fillRect(x+s-9, y-6, 4, 4);
}
function drawBossBody(t, x, y, s){
  ctx.fillStyle = t.c2; ctx.fillRect(x-s, y-s, s*2, s*2);
  ctx.fillStyle = t.c1; ctx.fillRect(x-s+3, y-s+3, s*2-6, s*2-6);
  // 深偽故障感：RGB 錯位色條（減少動態時省略動畫，只留靜態微弱色差）
  const glitch = uxPrefs.reduceMotion ? 0 : Math.sin(performance.now()/90 + x) * 3;
  ctx.fillStyle = 'rgba(64,220,255,.35)';
  ctx.fillRect(x-s+2, y-6+glitch, s*2-4, 4);
  ctx.fillStyle = 'rgba(255,64,120,.3)';
  ctx.fillRect(x-s+2-glitch, y+2, s*2-4, 3);
  // 眼睛（賊笑）
  ctx.fillStyle = '#101018';
  ctx.fillRect(x-s+5, y-4, 5, 5); ctx.fillRect(x+s-10, y-4, 5, 5);
  ctx.fillRect(x-4, y+5, 8, 3);
}
const SCAM_BODY = {
  phish:drawPhishBody, shop:drawShopBody, invest:drawInvestBody,
  police:drawPoliceBody, boss:drawBossBody,
};
function drawEnemy(e){
  const t = ETYPES[e.ti];
  const s = t.boss ? 22 : 13;
  const bob = Math.sin(e.wob)*2;
  const x = e.x, y = e.y + bob;
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(x-s+3, e.y+s-2, s*2-6, 4);
  if (t.rider){
    ctx.save(); ctx.translate(x,y); if (e.tripLeft > 0) ctx.rotate(.48);
    ctx.fillStyle='#101018'; ctx.fillRect(-15,7,9,9); ctx.fillRect(7,7,9,9);
    ctx.fillStyle=t.c2; ctx.fillRect(-16,-2,31,11); ctx.fillRect(2,-13,11,12);
    ctx.fillStyle=t.c1; ctx.fillRect(-12,-6,21,9);
    ctx.fillStyle='#ffd9b3'; ctx.fillRect(3,-19,10,9);
    ctx.fillStyle='#f4f1e8'; ctx.fillRect(1,-23,14,5);
    ctx.fillStyle='#101018'; ctx.fillRect(10,-16,2,2);
    ctx.restore();
    if (e.tripLeft <= 0 && !uxPrefs.reduceMotion){
      ctx.strokeStyle='rgba(244,241,232,.55)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x-22,y+1); ctx.lineTo(x-34,y+1); ctx.moveTo(x-21,y+8); ctx.lineTo(x-29,y+8); ctx.stroke();
    }
  } else {
    const drawer = SCAM_BODY[t.key] || drawGenericScamBody;
    drawer(t, x, y, s);
    if (t.key !== 'invest'){                      // 假投資已用圖表當主視覺，頂端不再疊字避免擁擠
      ctx.fillStyle = '#101018';
      ctx.font = `${t.boss?16:10}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(t.face, x, y - s + 7);
    }
  }
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

