/* ═══ 防詐迷宮 ─ 介面（ui.js） ═══
   HUD、建造面板、畫布互動、塔選單、商店、排行榜、語言、畫面切換、PWA。載入順序：i18n → data → render → combat → ui → game ═══ */
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
    const noTargets = i === 3 ? !selectTripTarget() : noEnemies;
    const charging = i === 2 && lightCharge.active;
    const frozen = impactFreeze.remainingMs > 0;
    b.classList.toggle('locked', locked);
    b.classList.toggle('aiming', selSup === i);
    b.setAttribute('aria-pressed', String(selSup === i));
    b.classList.toggle('ready', !locked && cd <= 0 && !noTargets && !charging && !frozen);
    b.disabled = locked || cd > 0 || (noTargets && !charging) || frozen;
    const cdEl = b.querySelector && b.querySelector('.cd');
    if (cdEl) cdEl.textContent = locked ? '🔒Lv.' + sp.unlock
      : charging ? L().support.cancelShort
      : (cd > 0 ? Math.ceil(cd) + 's' : (noTargets ? '—' : 'GO'));
  });
  const nb = $('btnNextWave');
  const canStart = !S.over && S.phase === 'setup' && !S.waveActive;
  nb.disabled = !canStart;
  nb.textContent = S.phase === 'wave' || S.phase === 'clearing'
    ? L().ui.waveIn
    : (S.autoT > 0 ? fmt(L().ui.waveCount, {n:Math.ceil(S.autoT)}) : L().ui.waveGo);
  const waveInfo = document.getElementById('waveInfo');
  if (waveInfo){
    if (impactFreeze.remainingMs > 0) waveInfo.textContent = impactFreeze.label;
    else if (S.dangerFinal) waveInfo.textContent = fmt(L().ui.dangerFinal, {n:S.dangerCount});
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
      const glyph = escapeHtml(spec.glyph === '165' ? '165' : spec.glyph);
      const towerName = escapeHtml(L().towers[o.i]);
      return `<button type="button" class="${cls}" data-bp="${o.i}" aria-pressed="${bp.ti === o.i}"${disabled}>` +
             `<span class="bg">${glyph}</span>` +
             `<span class="bn">${towerName}</span>` +
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
    if (!S || S.over || S.phase === 'clearing' || impactFreeze.remainingMs > 0) return;
    finishRouteGuide();
    if (i === 2 && lightCharge.active){ cancelSupportAction(); return; }
    if (S.level < SUPPORT[i].unlock || S.supCd[i] > 0 || S.enemies.every(e => e.dead)) return;
    if (i === 2) startLightCharge();
    else if (i === 3){
      cancelSupportAction(false, true);
      suspendBuildMenu();
      if (!useSupport(i, 0, 0)) restoreSuspendedBuildMenu();
    }
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
function sanitizeBoardInteger(value, min, max, fallback = min){
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, Math.floor(number)))
    : fallback;
}
function sanitizeBoardEntry(name, score, level, date){
  return {
    n: String(name || '匿名').slice(0, 10),
    s: sanitizeBoardInteger(score, 0, MAX_BOARD_SCORE, 0),
    lv: sanitizeBoardInteger(level, 1, MAX_LEVEL, 1),
    d: sanitizeBoardInteger(date, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}
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
      .map(r => sanitizeBoardEntry(r.n, r.s, r.lv, r.d))
      .slice(0, 10);
  }catch(e){ return []; }
}
function renderBoard(){
  const list = loadBoard();
  const ol = $('boardList');
  ol.innerHTML = list.length ? '' : `<li>${escapeHtml(L().ui.boardEmpty)}</li>`;
  list.forEach(r => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${escapeHtml(r.n)}</b>　${escapeHtml(L().ui.levelTag)}${r.lv}<span class="pt">⭐${r.s}</span>`;
    ol.appendChild(li);
  });
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
$('btnSaveScore').addEventListener('click', () => {
  const name = ($('playerName').value.trim() || L().ui.namePh).slice(0,10);
  const list = loadBoard();
  list.push(sanitizeBoardEntry(name, S.score, S.level, Date.now()));
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
/* 初始 applyI18n() 呼叫在 game.js 尾端（本檔載入時 L()／uxPrefs 等尚未定義） */

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
  if (typeof resetImpactFreeze === 'function') resetImpactFreeze();
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

