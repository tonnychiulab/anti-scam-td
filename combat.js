/* ═══ 防詐迷宮 ─ 戰鬥（combat.js） ═══
   波次、敵人、塔攻擊、投射物、粒子、支援與制裁技。載入順序：i18n → data → render → combat → ui → game ═══ */
/* ── 波次組成 ─────────────────────────────────────── */
function buildWave(lv){
  const q = [];
  const hpMul = (1 + lv * .12 + Math.pow(lv/16, 2)) * (S.mod ? S.mod.hpAdj : 1); // 曲線軟化＋事件調整
  const push = (ti, n, gap) => { for(let i=0;i<n;i++) q.push({ti, gap, hpMul}); };
  if (lv % 10 === 0){                                    // 魔王關
    push(4, 1 + Math.floor(lv/30), 2.2);
    push(3, Math.min(4, 1+Math.floor(lv/20)), 1.4);
    if (lv >= 20) push(5, Math.min(4, 1 + Math.floor(lv/20)), .75);
  } else {
    push(0, 5 + Math.floor(lv*.7), .8);
    if (lv >= 3)  push(1, 2 + Math.floor(lv*.4), 1.0);
    if (lv >= 6)  push(2, 1 + Math.floor(lv*.3), 1.2);
    if (lv >= 6)  push(5, 1 + Math.floor(lv*.18), .7);
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
    ri:S.routes && S.routes.length > 1 ? Math.floor(Math.random() * S.routes.length) : 0,  // 出生時擲骰選路線（主線或支線組合）
    seg:0, prog:0, x:S.path[0][0]*CELL+CELL/2, y:S.path[0][1]*CELL+CELL/2,
    spd:t.spd, slowLeft:0, slowPct:0, stunLeft:0, tripLeft:0,
    markLeft:0, dead:false, wob:Math.random()*6.28,
    dangerWarned:!!item.dangerWarned, dangerActive:false,
  });
}
/* 註：以下各函式的路線查詢刻意內聯（不抽共用 helper），
   因 tests/release.test.mjs 以 extractFunction 抽單一函式進 vm 沙箱執行，函式必須自足。 */
function moveEnemy(e, dt){
  const P = (S.routes && S.routes[e.ri]) || S.path;  // 敵人自己的路線（主線或支線）
  const stopped = e.stunLeft > 0;
  let sp = stopped ? 0 : e.spd * S.mod.spd * (e.slowLeft > 0 ? (1 - e.slowPct) : 1);
  let dist = sp * dt;
  while (dist > 0 && e.seg < P.length - 1){
    const [ax,ay] = P[e.seg], [bx,by] = P[e.seg+1];
    const segLen = CELL; // 相鄰格
    const remain = (1 - e.prog) * segLen;
    if (dist < remain){ e.prog += dist/segLen; dist = 0; }
    else { dist -= remain; e.seg++; e.prog = 0; }
    const [cx,cy] = P[e.seg];
    const nx = e.seg < P.length-1 ? P[e.seg+1] : [cx,cy];
    e.x = (cx + (nx[0]-cx)*e.prog) * CELL + CELL/2;
    e.y = (cy + (nx[1]-cy)*e.prog) * CELL + CELL/2;
  }
  if (e.seg >= P.length - 1) return true;  // 抵達民眾家
  return false;
}

function enemyPathProgress(e){
  const P = (S.routes && S.routes[e.ri]) || S.path;
  const total = Math.max(1, P.length - 1);
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
    // 擊破文字是次要資訊：先加入、往上避開；爆破粒子後加入並蓋在文字上方。
    S.fx.push({ txt:fmt(L().ui.killFloat, {name:L().enemies[e.ti]}), x:e.x, y:e.y-24, life:.65 });
    burst(e.x, e.y, t.c1, t.boss?26:10);
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
      S.allies.push({ p: e.seg + e.prog, ri:e.ri || 0, spd:55, hitCd:0, x:e.x, y:e.y, done:false });
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

/* ── 特種部隊支援施放 ─────────────────────────────── */
function supportRadius(i){
  const sp = SUPPORT[i];
  if (!sp) return 0;
  return ({ ram:95, flash:140, atm:110, raid:130 })[sp.key] || 0;
}
function supportTargetsInRadius(x, y, radius){
  if (!S || !Number.isFinite(x) || !Number.isFinite(y) || radius <= 0) return [];
  return S.enemies.filter(e => !e.dead && (e.x-x)**2 + (e.y-y)**2 <= radius*radius);
}
function selectTripTarget(){
  if (!S) return null;
  const eligible = S.enemies.filter(e => !e.dead && !ETYPES[e.ti].boss);
  eligible.sort((a,b) => {
    const ar = ETYPES[a.ti].rider ? 1 : 0, br = ETYPES[b.ti].rider ? 1 : 0;
    if (ar !== br) return br - ar;
    if (a.spd !== b.spd) return b.spd - a.spd;
    return enemyPathProgress(b) - enemyPathProgress(a);
  });
  return eligible[0] || null;
}
function selectAtmTarget(x, y){
  const targets = supportTargetsInRadius(x, y, 110);
  targets.sort((a,b) => b.hpMax - a.hpMax || b.hp - a.hp || enemyPathProgress(b) - enemyPathProgress(a));
  return targets[0] || null;
}
function rewindEnemy(e, cells){
  if (!S || !e || !S.path.length || ETYPES[e.ti].boss) return false;
  const P = (S.routes && S.routes[e.ri]) || S.path;
  const pos = Math.max(0, e.seg + e.prog - Math.max(0, cells));
  e.seg = Math.min(P.length - 1, Math.floor(pos));
  e.prog = e.seg < P.length - 1 ? pos - e.seg : 0;
  const [cx,cy] = P[e.seg];
  const [nx,ny] = P[Math.min(e.seg + 1, P.length - 1)];
  e.x = (cx + (nx-cx)*e.prog) * CELL + CELL/2;
  e.y = (cy + (ny-cy)*e.prog) * CELL + CELL/2;
  return true;
}
function supportCounts(i, x, y){
  const live = S ? S.enemies.filter(e => !e.dead) : [];
  const sp = SUPPORT[i];
  if (!sp) return { hits:0, knockbacks:0, localHits:0, globalHits:live.length, ko:0, bosses:0, strongest:null };
  const local = supportTargetsInRadius(x, y, supportRadius(i));
  if (sp.key === 'ram') return { hits:local.length, knockbacks:local.filter(e => !ETYPES[e.ti].boss).length, localHits:local.length, globalHits:live.length, ko:0, bosses:0, strongest:null };
  if (sp.key === 'flash') return { hits:live.length, knockbacks:0, localHits:local.length, globalHits:live.length, ko:0, bosses:0, strongest:null };
  if (sp.key === 'atm') return { hits:local.length, knockbacks:0, localHits:local.length, globalHits:live.length, ko:0, bosses:0, strongest:selectAtmTarget(x,y) };
  if (sp.key === 'raid') return {
    hits:local.length, knockbacks:0, localHits:local.length, globalHits:live.length,
    ko:local.filter(e => !ETYPES[e.ti].boss).length,
    bosses:local.filter(e => ETYPES[e.ti].boss).length,
    strongest:null,
  };
  return { hits:live.length, knockbacks:0, localHits:0, globalHits:live.length, ko:0, bosses:0, strongest:null };
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
  const key = SUPPORT[supportAim.i] ? SUPPORT[supportAim.i].key : '';
  if (summary){
    if (key === 'ram') summary.textContent = fmt(L().support.ramPreview, {hits:counts.hits, knocks:counts.knockbacks});
    else if (key === 'flash') summary.textContent = fmt(L().support.flashPreview, {global:counts.globalHits, local:counts.localHits});
    else if (key === 'atm') summary.textContent = fmt(L().support.atmPreview, {
      hits:counts.localHits,
      name:counts.strongest ? L().enemies[counts.strongest.ti] : L().support.noTarget,
    });
    else if (key === 'raid') summary.textContent = fmt(L().support.raidPreview, {ko:counts.ko, boss:counts.bosses});
  }
  if (ok){
    ok.textContent = L().support.confirm;
    ok.disabled = key === 'flash' ? counts.globalHits === 0 : counts.localHits === 0;
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
  if (!S || selSup !== i || ![0,1,4,5].includes(i)) return;
  supportAim = { i, x, y };
  renderSupportConfirm();
  draw();
}
function confirmSupportTarget(){
  if (!S || !supportAim || selSup !== supportAim.i) return false;
  const counts = supportCounts(supportAim.i, supportAim.x, supportAim.y);
  const allowed = supportAim.i === 0 ? counts.hits > 0
    : supportAim.i === 1 ? counts.globalHits > 0
    : counts.localHits > 0;
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
  if (!S || !sp || S.level < sp.unlock || S.supCd[i] > 0 || impactFreeze.remainingMs > 0) return false;
  const live = S.enemies.filter(e => !e.dead);
  let plan = null;
  if (sp.key === 'ram') plan = supportTargetsInRadius(px, py, 95);
  else if (sp.key === 'flash' || sp.key === 'light') plan = live;
  else if (sp.key === 'trip') plan = selectTripTarget();
  else if (sp.key === 'atm') plan = selectAtmTarget(px, py);
  else if (sp.key === 'raid') plan = supportTargetsInRadius(px, py, 130);
  if (!plan || (Array.isArray(plan) && plan.length === 0)) return false;
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
  } else if (sp.key === 'light') {
    // 強光手電筒：光束橫掃全圖，傷害＋曝光標記
    shake(6);
    screenFlash('rgba(150,220,255,.25)');
    sfxBoom(300);
    const vert = LAYOUT === 'mport';
    S.beam = { pos:-40, axis: vert ? 'y' : 'x', spd:((vert ? H : W) + 120)/1.15, hit:new Set() };
  } else if (sp.key === 'trip'){
    const target = plan;
    rewindEnemy(target, 3);
    target.tripLeft = Math.max(target.tripLeft || 0, 1.1);
    target.stunLeft = Math.max(target.stunLeft || 0, 2.2);
    S.fx.push({ skid:true, x:target.x, y:target.y, life:1.0, maxLife:1.0, color:sp.color });
    hitEnemy(target, 25 + S.level * 2, null);
    hitStop = .35;
    shake(12);
    screenFlash('rgba(255,159,67,.32)');
    sfxBoom(150);
    startImpactFreeze(180, L().support.tripImpact, sp.color);
  } else if (sp.key === 'atm'){
    const target = plan;
    const boss = !!ETYPES[target.ti].boss;
    target.stunLeft = Math.max(target.stunLeft || 0, boss ? 2 : 3);
    S.fx.push({ atmGrab:true, x:target.x, y:target.y, life:1.15, maxLife:1.15, color:sp.color });
    const dmg = boss ? target.hpMax * .10 : (target.hp <= target.hpMax * .35 ? target.hp + 1 : target.hpMax * .35);
    hitEnemy(target, dmg, null);
    hitStop = .50;
    shake(18);
    screenFlash('rgba(87,227,137,.30)');
    sfxBoom(95);
    startImpactFreeze(260, L().support.atmImpact, sp.color);
  } else if (sp.key === 'raid'){
    const targets = plan.slice();
    S.fx.push({ roomBlast:true, x:px, y:py, r:130, life:1.35, maxLife:1.35, color:sp.color });
    for (const target of targets){
      const boss = !!ETYPES[target.ti].boss;
      if (boss){
        target.stunLeft = Math.max(target.stunLeft || 0, 2);
        hitEnemy(target, target.hpMax * .30, null);
      } else hitEnemy(target, target.hp + 1, null);
    }
    burst(px, py, '#ffb05c', actualQuality === 'full' ? 42 : 22);
    hitStop = .70;
    shake(28);
    screenFlash('rgba(239,71,111,.55)');
    sfxBoom(55);
    startImpactFreeze(420, L().support.raidImpact, sp.color);
  }
  updateHUD();
  return true;
}

