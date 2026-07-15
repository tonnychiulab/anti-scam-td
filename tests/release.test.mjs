import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const readText = file => readFileSync(fromRoot(file), 'utf8');

const gameSource = readText('game.js');
const i18nSource = readText('i18n.js');
const htmlSource = readText('index.html');
const swSource = readText('sw.js');
const styleSource = readText('style.css');

function literalConst(source, name) {
  const match = source.match(new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*(['\"])([^'\"]+)\\1`));
  assert.ok(match, `找不到 ${name} 字串常數`);
  return match[2];
}

function numericConst(source, name) {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)\\b`));
  assert.ok(match, `找不到 ${name} 數值常數`);
  return Number(match[1]);
}

// Extract only one named function. This deliberately does not execute the browser game.
function extractFunction(source, name) {
  const startMatch = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(source);
  assert.ok(startMatch, `找不到函式 ${name}`);
  const open = source.indexOf('{', startMatch.index);
  assert.notEqual(open, -1, `函式 ${name} 缺少函式本體`);

  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(startMatch.index, i + 1);
  }
  assert.fail(`函式 ${name} 的大括號未閉合`);
}

function loadI18n() {
  const context = Object.create(null);
  vm.runInNewContext(`${i18nSource}\n;globalThis.__I18N__ = I18N;`, context, {
    filename: 'i18n.js',
    timeout: 1_000,
  });
  return context.__I18N__;
}

function compareShape(reference, candidate, at) {
  if (Array.isArray(reference)) {
    assert.ok(Array.isArray(candidate), `${at} 應為陣列`);
    assert.equal(candidate.length, reference.length, `${at} 的項目數不一致`);
    for (let i = 0; i < reference.length; i++) compareShape(reference[i], candidate[i], `${at}[${i}]`);
    return;
  }
  if (reference && typeof reference === 'object') {
    assert.ok(candidate && typeof candidate === 'object' && !Array.isArray(candidate), `${at} 應為物件`);
    assert.deepEqual(Object.keys(candidate).sort(), Object.keys(reference).sort(), `${at} 的鍵值不一致`);
    for (const key of Object.keys(reference)) compareShape(reference[key], candidate[key], `${at}.${key}`);
    return;
  }
  assert.equal(typeof candidate, typeof reference, `${at} 的資料型別不一致`);
}

function comparePlaceholders(reference, candidate, at) {
  if (typeof reference === 'string') {
    const tokens = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(tokens(candidate), tokens(reference), `${at} 的 {placeholder} 不一致`);
    return;
  }
  if (Array.isArray(reference)) {
    for (let i = 0; i < reference.length; i++) comparePlaceholders(reference[i], candidate[i], `${at}[${i}]`);
    return;
  }
  if (reference && typeof reference === 'object') {
    for (const key of Object.keys(reference)) comparePlaceholders(reference[key], candidate[key], `${at}.${key}`);
  }
}

function pngSize(buffer, file) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buffer.subarray(0, 8).equals(signature), `${file} 不是有效的 PNG 簽章`);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', `${file} 缺少 PNG IHDR`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function sourceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `找不到程式片段起點：${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `找不到程式片段終點：${endNeedle}`);
  return source.slice(start, end);
}

function createPointerHarness({ scale = 2, towers = [] } = {}) {
  const stateStart = gameSource.indexOf('const ptrs');
  const handleTapStart = gameSource.indexOf('function handleTap', stateStart);
  const wiringStart = gameSource.indexOf("cv.addEventListener('pointerdown'", handleTapStart);
  const wiringEnd = gameSource.indexOf('/* ── 塔選單', wiringStart);
  for (const [label, offset] of Object.entries({ stateStart, handleTapStart, wiringStart, wiringEnd })) {
    assert.notEqual(offset, -1, `無法抽取 pointer 測試片段：${label}`);
  }

  const handlers = Object.create(null);
  const taps = [];
  const timers = new Map();
  let clock = 0;
  let resets = 0;
  let buildCloses = 0;
  let draws = 0;
  let timerId = 0;
  const supportCancels = [];
  const context = {
    S: { over: false, paused: false, towers, coins:120 },
    runGen: 1,
    selSup: -1,
    selShop: -1,
    bp: { open: false },
    LAYOUT: 'mport',
    COLS: 12,
    ROWS: 20,
    CELL: 48,
    ZOOM_MIN: 1,
    ZOOM_MAX: 2.5,
    view: { scale, ox: 0, oy: 0 },
    cv: {
      addEventListener(type, handler) { handlers[type] = handler; },
      setPointerCapture() {},
      releasePointerCapture() {},
    },
    clientToInternal: (x, y) => [x, y],
    internalToWorld: (x, y) => [x, y],
    clampView() {},
    resetView() { resets++; context.view.scale = 1; context.view.ox = 0; context.view.oy = 0; },
    draw() { draws++; },
    finishRouteGuide() {},
    cancelSupportAction(update, restoreBuild) { supportCancels.push([update, restoreBuild]); },
    closeBuildMenu() { buildCloses++; context.bp.open = false; },
    performance: { now: () => clock },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };

  const pointerState = gameSource.slice(stateStart, handleTapStart);
  const pointerWiring = gameSource.slice(wiringStart, wiringEnd);
  vm.runInNewContext([
    pointerState,
    'function handleTap(ix, iy) { globalThis.__taps__.push([ix, iy]); }',
    pointerWiring,
  ].join('\n'), { ...context, __taps__: taps }, { filename: 'pointer-input.test.js', timeout: 1_000 });

  const event = (pointerId, x, y, button = 0, pointerType = 'mouse') => ({
    pointerId,
    clientX: x,
    clientY: y,
    button,
    pointerType,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  });
  return {
    handlers,
    taps,
    event,
    setClock(value) { clock = value; },
    resetCount() { return resets; },
    buildCloseCount() { return buildCloses; },
    drawCount() { return draws; },
    supportCancels,
    state:context.S,
    view:context.view,
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
    },
  };
}

test('browser JavaScript passes Node syntax checks', async t => {
  for (const file of ['game.js', 'i18n.js', 'sw.js']) {
    await t.test(file, () => {
      const result = spawnSync(process.execPath, ['--check', fromRoot(file)], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${file} 語法檢查失敗：\n${result.stderr || result.stdout}`);
    });
  }
});

test('manifest is valid and every declared PNG has the declared dimensions', () => {
  const manifest = JSON.parse(readText('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest 應宣告完整圖示組');

  let has192 = false;
  let has512 = false;
  let hasMaskable = false;
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png', `${icon.src} 的 MIME type 應為 image/png`);
    assert.match(icon.src, /^(?![a-z]+:|\/|\\)(?:[^.][^/\\]*[/\\])*[^/\\]+\.png$/i, `${icon.src} 必須是套件內相對路徑`);
    const iconFile = fromRoot(icon.src);
    assert.ok(existsSync(iconFile), `manifest 指向不存在的圖示：${icon.src}`);
    const actual = pngSize(readFileSync(iconFile), icon.src);
    const declared = String(icon.sizes).split(/\s+/).map(size => size.split('x').map(Number));
    assert.ok(declared.some(([w, h]) => w === actual[0] && h === actual[1]), `${icon.src} 實際為 ${actual.join('x')}，與 manifest 不符`);
    has192 ||= actual[0] === 192 && actual[1] === 192;
    has512 ||= actual[0] === 512 && actual[1] === 512;
    hasMaskable ||= String(icon.purpose || '').split(/\s+/).includes('maskable');
  }
  assert.ok(has192, '缺少 192x192 圖示');
  assert.ok(has512, '缺少 512x512 圖示');
  assert.ok(hasMaskable, '缺少 maskable 圖示');
});

test('release version agrees across game, service worker, HTML, and all locales', () => {
  const appVersion = literalConst(gameSource, 'APP_VERSION');
  assert.match(appVersion, /^v\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(readText('package.json')).version, appVersion.slice(1), 'package.json 版本不一致');

  const cacheVersion = swSource.match(/\bCACHE\s*=\s*(?:`[^`]*?(v\d+\.\d+\.\d+)[^`]*?`|['\"][^'\"]*?(v\d+\.\d+\.\d+)[^'\"]*?['\"])/);
  assert.ok(cacheVersion, 'SW CACHE 名稱必須包含語意版本');
  assert.equal(cacheVersion[1] || cacheVersion[2], appVersion, 'APP_VERSION 與 SW CACHE 版本不一致');

  const htmlVersions = new Set(htmlSource.match(/\bv\d+\.\d+\.\d+\b/g) || []);
  assert.deepEqual([...htmlVersions], [appVersion], 'index.html 的顯示版本不一致');

  const i18n = loadI18n();
  for (const locale of ['zh', 'en', 'id', 'vi']) {
    assert.match(i18n[locale].ui.credit, new RegExp(`\\b${appVersion.replaceAll('.', '\\.')}\\b`), `${locale}.ui.credit 版本不一致`);
  }
});

test('HTML ids are unique and every literal JavaScript id reference exists', () => {
  const ids = [...htmlSource.matchAll(/\bid\s*=\s*(['\"])([^'\"]+)\1/gi)].map(match => match[2]);
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) (seen.has(id) ? duplicates : seen).add(id);
  assert.deepEqual([...duplicates], [], `HTML 有重複 id：${[...duplicates].join(', ')}`);

  const references = new Set();
  for (const match of gameSource.matchAll(/\$\(\s*(['\"])([A-Za-z][\w:.-]*)\1\s*\)/g)) references.add(match[2]);
  for (const match of gameSource.matchAll(/getElementById\(\s*(['\"])([A-Za-z][\w:.-]*)\1\s*\)/g)) references.add(match[2]);
  const missing = [...references].filter(id => !seen.has(id)).sort();
  assert.deepEqual(missing, [], `game.js 參照不存在的 HTML id：${missing.join(', ')}`);
});

test('the four locale dictionaries keep the same complete structure and placeholders', () => {
  const i18n = loadI18n();
  assert.deepEqual(Object.keys(i18n).sort(), ['en', 'id', 'vi', 'zh']);
  for (const locale of ['en', 'id', 'vi']) {
    compareShape(i18n.zh, i18n[locale], locale);
    comparePlaceholders(i18n.zh, i18n[locale], locale);
  }
  for (const locale of ['zh', 'en', 'id', 'vi']) {
    assert.equal(i18n[locale].towers.length, 13, `${locale} 應有 13 座塔名稱`);
    assert.equal(i18n[locale].enemies.length, 5, `${locale} 應有 5 種敵人名稱`);
    assert.equal(i18n[locale].quiz.length, 12, `${locale} 應有 12 題測驗`);
    assert.equal(i18n[locale].tips.length, 21, `${locale} 應有 21 則提示`);
  }
});

test('every locale explains the different phone and desktop build controls', () => {
  const i18n = loadI18n();
  const platformWords = {
    zh: [/手機/, /電腦|桌機/],
    en: [/phone|mobile/i, /desktop|computer/i],
    id: [/ponsel|seluler|mobile/i, /komputer|desktop/i],
    vi: [/điện thoại|di động/i, /máy tính|desktop/i],
  };
  for (const [locale, patterns] of Object.entries(platformWords)) {
    const banner = i18n[locale].ui.startBanner;
    assert.equal(typeof banner, 'string', `${locale}.ui.startBanner 應為字串`);
    for (const pattern of patterns) assert.match(banner, pattern, `${locale}.ui.startBanner 未清楚區分手機與電腦操作`);
  }
});

test('all 87 seeded paths are deterministic, contiguous, bounded, and safely transposable', () => {
  const major = numericConst(gameSource, 'MAJ');
  const minor = numericConst(gameSource, 'MIN');
  const maxLevel = numericConst(gameSource, 'MAX_LEVEL');
  assert.equal(maxLevel, 87, '正式版關卡總數應為 87');

  const context = Object.create(null);
  vm.runInNewContext([
    `const MAJ = ${major}, MIN = ${minor};`,
    extractFunction(gameSource, 'RNG'),
    extractFunction(gameSource, 'genMajorPath'),
    'globalThis.__genMajorPath__ = genMajorPath;',
  ].join('\n'), context, { filename: 'path-generator.test.js', timeout: 1_000 });

  const localCopy = value => JSON.parse(JSON.stringify(value));
  const validate = (cells, cols, rows, label) => {
    assert.ok(cells.length >= cols, `${label} 路徑過短`);
    const visited = new Set();
    for (let i = 0; i < cells.length; i++) {
      const [x, y] = cells[i];
      assert.ok(Number.isInteger(x) && Number.isInteger(y), `${label} 含非整數座標`);
      assert.ok(x >= 0 && x < cols && y >= 0 && y < rows, `${label} 座標越界：${x},${y}`);
      const key = `${x},${y}`;
      assert.ok(!visited.has(key), `${label} 路徑重複經過 ${key}`);
      visited.add(key);
      if (i) {
        const [px, py] = cells[i - 1];
        assert.equal(Math.abs(x - px) + Math.abs(y - py), 1, `${label} 在索引 ${i} 不連續`);
      }
    }
  };

  for (let level = 1; level <= maxLevel; level++) {
    const landscape = localCopy(context.__genMajorPath__(level));
    const repeated = localCopy(context.__genMajorPath__(level));
    assert.deepEqual(repeated, landscape, `第 ${level} 關種子結果不固定`);
    validate(landscape, major, minor, `第 ${level} 關橫式`);
    assert.equal(landscape[0][0], 0, `第 ${level} 關橫式入口錯誤`);
    assert.equal(landscape.at(-1)[0], major - 1, `第 ${level} 關橫式出口錯誤`);

    const portrait = landscape.map(([x, y]) => [y, x]);
    validate(portrait, minor, major, `第 ${level} 關直式`);
    assert.equal(portrait[0][1], 0, `第 ${level} 關直式入口錯誤`);
    assert.equal(portrait.at(-1)[1], major - 1, `第 ${level} 關直式出口錯誤`);
    assert.deepEqual(portrait.map(([x, y]) => [y, x]), landscape, `第 ${level} 關轉置不可逆`);
  }
});

test('leaderboard sanitization always returns a small list of finite numbers', () => {
  const maxLevel = numericConst(gameSource, 'MAX_LEVEL');
  const payload = JSON.stringify([
    { n: '<b>bad</b>', s: '1e309', lv: '1e309', d: '1e309' },
    { n: 'negative', s: -42, lv: -3, d: 1 },
    ...Array.from({ length: 20 }, (_, i) => ({ n: `player-${i}`, s: i * 10, lv: i + 1, d: i })),
  ]);
  const context = {
    localStorage: { getItem: () => payload },
  };
  vm.runInNewContext([
    "const LB_KEY = 'test-board';",
    `const MAX_LEVEL = ${maxLevel};`,
    'const MAX_BOARD_SCORE = Number.MAX_SAFE_INTEGER;',
    extractFunction(gameSource, 'loadBoard'),
    'globalThis.__loadBoard__ = loadBoard;',
  ].join('\n'), context, { filename: 'leaderboard.test.js', timeout: 1_000 });

  const rows = context.__loadBoard__();
  assert.ok(Array.isArray(rows) && rows.length <= 10, '排行榜最多只能回傳 10 筆');
  for (const row of rows) {
    assert.ok(Number.isFinite(row.s) && row.s >= 0 && Number.isInteger(row.s), '分數必須是有限非負整數');
    assert.ok(Number.isFinite(row.lv) && row.lv >= 1 && row.lv <= maxLevel && Number.isInteger(row.lv), '關卡必須是範圍內有限整數');
    assert.ok(Number.isFinite(row.d) && Number.isInteger(row.d), '時間戳必須是有限整數');
    assert.ok(typeof row.n === 'string' && row.n.length <= 10, '玩家代號必須是至多 10 字的字串');
  }
});

test('slow and stun remain independent, and fast projectiles cannot skip a target', () => {
  let hits = 0;
  const context = {
    S: {
      mod: { spd: 1 },
      path: [[0, 0], [1, 0], [2, 0]],
      enemies: [],
    },
    ETYPES: [{ boss: false }],
    burst() {},
    hitEnemy() { hits++; },
  };
  vm.runInNewContext([
    'const CELL = 48;',
    extractFunction(gameSource, 'moveEnemy'),
    extractFunction(gameSource, 'landProj'),
    extractFunction(gameSource, 'moveProj'),
    'globalThis.__api__ = { moveEnemy, landProj, moveProj };',
  ].join('\n'), context, { filename: 'combat-effects.test.js', timeout: 1_000 });

  const stunned = { spd: 48, slowLeft: 3, slowPct: 0.5, stunLeft: 0.5, seg: 0, prog: 0, x: 24, y: 24 };
  context.__api__.moveEnemy(stunned, 0.1);
  assert.equal(stunned.prog, 0, '暈眩期間敵人必須完全停止');

  const slowed = { spd: 48, slowLeft: 3, slowPct: 0.5, stunLeft: 0, seg: 0, prog: 0, x: 24, y: 24 };
  context.__api__.moveEnemy(slowed, 0.1);
  assert.ok(Math.abs(slowed.prog - 0.05) < 1e-12, '只有減速時仍應以降低後速度移動');

  const affected = { dead: false, ti: 0, x: 0, y: 0, seg: 0, prog: 0, slowLeft: 0, slowPct: 0, stunLeft: 0.7, markLeft: 0 };
  context.S.enemies = [affected];
  context.__api__.landProj({ splash: 0, dmg: 1, slow: 0.4, slowT: 2, stun: 0, mark: 0, knock: 0 }, affected);
  assert.equal(affected.slowLeft, 2);
  assert.equal(affected.slowPct, 0.4);
  assert.equal(affected.stunLeft, 0.7, '套用 slow 不可覆寫既有 stun');
  context.__api__.landProj({ splash: 0, dmg: 1, slow: 0, slowT: 0, stun: 1.2, mark: 0, knock: 0 }, affected);
  assert.equal(affected.stunLeft, 1.2);
  assert.equal(affected.slowLeft, 2, '套用 stun 不可覆寫既有 slow');
  assert.equal(affected.slowPct, 0.4, '套用 stun 不可把 slow 強度改成 100%');

  hits = 0;
  const target = { dead: false, ti: 0, x: 100, y: 0, seg: 0, prog: 0, slowLeft: 0, slowPct: 0, stunLeft: 0, markLeft: 0 };
  context.S.enemies = [target];
  const consumed = context.__api__.moveProj({
    tx: target, x: 0, y: 0, spd: 1_000, dmg: 1,
    splash: 0, slow: 0, slowT: 0, stun: 0, mark: 0, knock: 0,
  }, 0.1);
  assert.equal(consumed, true, '高速投射物跨過命中半徑時仍應在本幀結算');
  assert.equal(hits, 1, '高速投射物應恰好命中一次');
});

test('fog range applies consistently to passive aura and conversion towers', () => {
  const state = { mod:{range:.5}, towers:[], allies:[] };
  const towerSpecs = [];
  const context = {
    S: state,
    TOWERS: towerSpecs,
    Math: { random: () => 0 },
    burst() {},
    banner() {},
    sfx() {},
    L: () => ({ ui:{convert:''} }),
  };
  vm.runInNewContext([
    extractFunction(gameSource, 'buffFactor'),
    extractFunction(gameSource, 'tryConvert'),
    'globalThis.__api__ = { buffFactor, tryConvert };',
  ].join('\n'), context, { filename:'fog-passive-range.test.js', timeout:1_000 });

  const aura = { ti:0, x:0, y:0, range:100 };
  const targetTower = { ti:1, x:75, y:0, range:80 };
  towerSpecs[0] = { buff:.7 };
  towerSpecs[1] = {};
  state.towers = [aura, targetTower];
  assert.equal(context.__api__.buffFactor(targetTower), 1, '大霧有效範圍外不可取得攻速光環');
  targetTower.x = 40;
  assert.equal(context.__api__.buffFactor(targetTower), .7, '大霧有效範圍內應取得攻速光環');

  const converter = { ti:0, x:0, y:0, range:100 };
  towerSpecs[0] = { convert:1 };
  state.towers = [converter];
  const enemy = { x:75, y:0, seg:1, prog:.5 };
  context.__api__.tryConvert(enemy);
  assert.equal(state.allies.length, 0, '大霧有效範圍外不可轉化敵人');
  enemy.x = 40;
  context.__api__.tryConvert(enemy);
  assert.equal(state.allies.length, 1, '大霧有效範圍內可轉化敵人');
});

test('level clear is idempotent: one reward and one transition per wave', () => {
  const transitions = [];
  const state = {
    over: false,
    phase: 'wave',
    spawnQ: [],
    enemies: [],
    waveActive: true,
    autoT: 4,
    transitionGen: 0,
    score: 10,
    coins: 100,
    level: 1,
  };
  const context = {
    S: state,
    stopLoop() {},
    cancelPendingTap() {},
    closeTowerMenu() {},
    closeBuildMenu() {},
    playClearFx(callback, token) { transitions.push({ callback, token }); },
    gameOver() {},
    showQuiz() {},
    afterQuiz() {},
  };
  vm.runInNewContext([
    `const MAX_LEVEL = ${numericConst(gameSource, 'MAX_LEVEL')};`,
    extractFunction(gameSource, 'levelClear'),
    'globalThis.__levelClear__ = levelClear;',
  ].join('\n'), context, { filename: 'level-clear.test.js', timeout: 1_000 });

  assert.equal(context.__levelClear__(), true, '第一次過關應成功開始轉場');
  const afterFirst = { score: state.score, coins: state.coins, token: state.transitionGen };
  assert.equal(context.__levelClear__(), false, '同一關轉場期間再次呼叫應被拒絕');
  assert.deepEqual({ score: state.score, coins: state.coins, token: state.transitionGen }, afterFirst, '重入不可再次給分、給錢或換 token');
  assert.equal(afterFirst.score, 65);
  assert.equal(afterFirst.coins, 147);
  assert.equal(transitions.length, 1, '同一關只能排入一個過關轉場');
  assert.equal(transitions[0].token, afterFirst.token, '轉場必須綁定本次唯一 token');
  assert.equal(state.phase, 'clearing');
  assert.equal(state.waveActive, false);
});

test('losing a life keeps active and unspawned enemies without rebuilding defeated enemies', () => {
  let rebuilds = 0;
  const pending = [{ ti: 2, gap: 1.2, hpMul: 3 }];
  const state = {
    lives: 2,
    hp: 0,
    level: 12,
    phase: 'wave',
    waveActive: true,
    spawnQ: pending,
    spawnT: 0.7,
    enemies: [{ ti: 1, hp: 12, hpMax: 30, dead: false }],
    projs: [{}],
    allies: [{}],
    beam: {},
    critter: {},
    critT: 0,
  };
  const context = {
    S: state,
    buildWave() { rebuilds++; },
    gameOver() {},
    banner() {},
    fmt: value => value,
    L: () => ({ ui: { lifeLost: '' } }),
    ETYPES: [{ hp: 10 }, { hp: 30 }, { hp: 50 }],
    Math,
  };
  vm.runInNewContext([
    `const HP_START = ${numericConst(gameSource, 'HP_START')};`,
    extractFunction(gameSource, 'loseLife'),
    'globalThis.__loseLife__ = loseLife;',
  ].join('\n'), context, { filename: 'lose-life.test.js', timeout: 1_000 });
  context.__loseLife__();

  assert.equal(rebuilds, 0, '損命不可重建整波，否則已擊破敵人的獎勵可重刷');
  assert.equal(state.spawnQ.length, 2, '仍存活與尚未出現的敵人都應保留');
  assert.deepEqual(
    JSON.parse(JSON.stringify(state.spawnQ[0])),
    { ti:1, gap:.25, hpMul:1, hp:12, hpMax:30 },
    '場上存活敵人應保留目前血量再排回佇列',
  );
  assert.equal(state.spawnQ[1], pending[0], '尚未出現的敵人佇列應原樣接續');
  assert.equal(state.spawnT, 0, '續命後可立即從剩餘佇列繼續');
  assert.equal(state.lives, 1);
  assert.equal(state.phase, 'wave');
  assert.equal(state.waveActive, true);
});

function createRelayoutHarness(manualPaused = false) {
  const timers = [];
  const state = {
    manualPaused,
    layoutPaused: false,
    paused: manualPaused,
    path: [[0, 2], [1, 2]],
    grid: [],
    towers: [],
    enemies: [],
    allies: [],
    critter: null,
    projs: [],
    fx: [],
    beam: null,
  };
  let nextMode = 'mport';
  const context = {
    S: state,
    LAYOUT: 'desktop',
    COLS: 20,
    ROWS: 12,
    CELL: 48,
    runGen: 7,
    layoutPauseGen: 0,
    selShop: -1,
    selSup: -1,
    kbFocus: null,
    detectLayout: () => nextMode,
    applyLayout(mode) {
      context.LAYOUT = mode;
      context.COLS = mode === 'mport' ? 12 : 20;
      context.ROWS = mode === 'mport' ? 20 : 12;
    },
    buildGround() {},
    cancelPendingTap() {},
    closeTowerMenu() {},
    closeBuildMenu() {},
    resetView() {},
    syncPauseState() { state.paused = !!(state.manualPaused || state.layoutPaused); },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    banner() {},
    L: () => ({ ui: { viewSwitched: '' } }),
    updateHUD() {},
    draw() {},
  };
  vm.runInNewContext([
    extractFunction(gameSource, 'relayout'),
    'globalThis.__relayout__ = relayout;',
  ].join('\n'), context, { filename: 'relayout.test.js', timeout: 1_000 });
  return {
    state,
    timers,
    run: () => context.__relayout__(),
    next(mode) { nextMode = mode; },
  };
}

test('relayout restores manual pause and only the newest orientation timer may resume play', () => {
  const manuallyPaused = createRelayoutHarness(true);
  manuallyPaused.run();
  assert.equal(manuallyPaused.timers.length, 1);
  assert.equal(manuallyPaused.timers[0].delay, 600);
  manuallyPaused.timers[0].callback();
  assert.equal(manuallyPaused.state.layoutPaused, false);
  assert.equal(manuallyPaused.state.paused, true, '轉向暫停結束後仍須保留玩家原本的手動暫停');

  const rapid = createRelayoutHarness(false);
  rapid.run();
  rapid.next('desktop');
  rapid.run();
  assert.equal(rapid.timers.length, 2, '快速轉向兩次應各有一個定位暫停 timer');
  rapid.timers[0].callback();
  assert.equal(rapid.state.layoutPaused, true, '舊 timer 不可提前解除較新的轉向暫停');
  assert.equal(rapid.state.paused, true);
  rapid.timers[1].callback();
  assert.equal(rapid.state.layoutPaused, false);
  assert.equal(rapid.state.paused, false, '最新 timer 才能恢復原本未暫停的狀態');
});

test('RAF scheduling stops while paused/over and resumes exactly once after unpausing', () => {
  let schedules = 0;
  let cancels = 0;
  const state = { paused: false, manualPaused: false, layoutPaused: false, over: false, phase: 'setup' };
  const button = { textContent: '' };
  const context = {
    S: state,
    raf: 0,
    lastT: 0,
    loop() {},
    performance: { now: () => 123 },
    requestAnimationFrame() { schedules++; return 100 + schedules; },
    cancelAnimationFrame() { cancels++; },
    document: { getElementById: id => id === 'btnPause' ? button : null },
    applyControlA11y() {},
  };
  vm.runInNewContext([
    extractFunction(gameSource, 'stopLoop'),
    extractFunction(gameSource, 'ensureLoop'),
    extractFunction(gameSource, 'syncPauseState'),
    'globalThis.__rafApi__ = { stopLoop, ensureLoop, syncPauseState, raf: () => raf };',
  ].join('\n'), context, { filename: 'raf-lifecycle.test.js', timeout: 1_000 });

  context.__rafApi__.ensureLoop();
  context.__rafApi__.ensureLoop();
  assert.equal(schedules, 1, '執行中只能有一個 RAF');
  assert.notEqual(context.__rafApi__.raf(), 0);

  state.manualPaused = true;
  context.__rafApi__.syncPauseState();
  assert.equal(state.paused, true);
  assert.equal(context.__rafApi__.raf(), 0);
  assert.equal(cancels, 1);
  context.__rafApi__.ensureLoop();
  assert.equal(schedules, 1, '暫停時不可持續排 RAF');

  state.manualPaused = false;
  context.__rafApi__.syncPauseState();
  assert.equal(state.paused, false);
  assert.equal(schedules, 2, '解除暫停後應恰好重啟一個 RAF');

  context.__rafApi__.stopLoop();
  state.over = true;
  context.__rafApi__.ensureLoop();
  assert.equal(schedules, 2, 'game over 後不可再排 RAF');
  state.over = false;
  state.phase = 'clearing';
  context.__rafApi__.ensureLoop();
  assert.equal(schedules, 2, '過關轉場期間不可再排 RAF');
});

test('the animation loop never steals focus from PC controls', () => {
  const loopSource = extractFunction(gameSource, 'loop');
  assert.doesNotMatch(loopSource, /\.focus\s*\(/, '每幀 loop 不可強制把焦點拉回 canvas');
  assert.match(extractFunction(gameSource, 'startGame'), /focusBoard\(\)/, '開始遊戲時應只聚焦棋盤一次');
  const controls = sourceBetween(gameSource, "document.querySelectorAll('.tower-btn')", "/* ── 排行榜");
  assert.ok((controls.match(/focusBoard\(\)/g) || []).length >= 2, '選塔與支援後應明確回到棋盤');
});

test('the board cell focus ring appears for keyboard focus, not mouse-driven focus', () => {
  const cv = { matches: selector => selector === ':focus-visible' && cv.focusVisible };
  const context = {
    kbActive: true,
    cv,
    document: { activeElement: cv },
  };
  vm.runInNewContext(
    `${extractFunction(gameSource, 'boardKeyboardFocusVisible')}\n` +
    'globalThis.__focusVisible__ = boardKeyboardFocusVisible;',
    context,
  );

  cv.focusVisible = false;
  assert.equal(context.__focusVisible__(), false, '滑鼠選塔後不應在左上角顯示鍵盤格線');
  cv.focusVisible = true;
  assert.equal(context.__focusVisible__(), true, 'Tab 或方向鍵聚焦棋盤時仍應保留格線');
  context.document.activeElement = null;
  assert.equal(context.__focusVisible__(), false, '棋盤失焦後不應留下格線');
});

test('pointer cancellation never commits a tap', () => {
  const harness = createPointerHarness();
  assert.equal(typeof harness.handlers.pointerdown, 'function');
  assert.equal(typeof harness.handlers.pointercancel, 'function');
  harness.setClock(1_000);
  harness.handlers.pointerdown(harness.event(1, 40, 60));
  harness.handlers.pointercancel(harness.event(1, 40, 60));
  assert.deepEqual(harness.taps, [], 'pointercancel 不可建塔、選塔或施放支援');
});

test('secondary mouse buttons never commit a tap and the canvas suppresses its context menu', () => {
  const harness = createPointerHarness();
  const down = harness.event(2, 40, 60, 2, 'mouse');
  const up = harness.event(2, 40, 60, 2, 'mouse');
  harness.handlers.pointerdown(down);
  harness.handlers.pointerup(up);
  harness.flushTimers();
  assert.deepEqual(harness.taps, [], '滑鼠右鍵不可建塔、選塔或施放支援');

  assert.equal(typeof harness.handlers.contextmenu, 'function');
  const menu = harness.event(3, 40, 60, 2, 'mouse');
  harness.handlers.contextmenu(menu);
  assert.equal(menu.defaultPrevented, true, '遊戲畫布應阻止右鍵選單');
});

test('double-tap reset requires short time, short distance, zoom, and an unoccupied tile', () => {
  const far = createPointerHarness();
  far.setClock(1_000);
  far.handlers.pointerdown(far.event(1, 20, 20));
  far.handlers.pointerup(far.event(1, 20, 20));
  far.setClock(1_200);
  far.handlers.pointerdown(far.event(2, 200, 200));
  far.handlers.pointerup(far.event(2, 200, 200));
  far.flushTimers();
  assert.equal(far.resetCount(), 0, '相隔很遠的兩次點擊不可誤判成雙擊');
  assert.equal(far.taps.length, 2, '相隔很遠的點擊都應各自送出 tap');

  const near = createPointerHarness();
  near.setClock(1_000);
  near.handlers.pointerdown(near.event(1, 20, 20));
  near.handlers.pointerup(near.event(1, 20, 20));
  near.setClock(1_200);
  near.handlers.pointerdown(near.event(2, 24, 24));
  near.handlers.pointerup(near.event(2, 24, 24));
  near.flushTimers();
  assert.equal(near.resetCount(), 1, '鄰近且快速的兩次點擊應重設縮放');
  assert.equal(near.taps.length, 0, '雙擊只負責重設縮放，不可同時操作地圖');

  const occupied = createPointerHarness({ towers:[{gx:0, gy:0}] });
  occupied.setClock(1_000);
  occupied.handlers.pointerdown(occupied.event(1, 20, 20));
  occupied.handlers.pointerup(occupied.event(1, 20, 20));
  occupied.setClock(1_200);
  occupied.handlers.pointerdown(occupied.event(2, 24, 24));
  occupied.handlers.pointerup(occupied.event(2, 24, 24));
  occupied.flushTimers();
  assert.equal(occupied.resetCount(), 0, '點在已建塔上不可誤觸雙擊重設');
  assert.equal(occupied.taps.length, 2, '塔上的兩次操作應保留為一般點擊');

  const fullView = createPointerHarness({ scale:1 });
  fullView.setClock(1_000);
  fullView.handlers.pointerdown(fullView.event(1, 20, 20));
  fullView.handlers.pointerup(fullView.event(1, 20, 20));
  assert.equal(fullView.taps.length, 1, '全圖倍率的單擊不應等待雙擊計時器');
});

test('v2.1.1 mobile gestures close build preview and pan a zoomed board without tapping', () => {
  const pinch = createPointerHarness({ scale:2 });
  pinch.handlers.pointerdown(pinch.event(1, 30, 30, 0, 'touch'));
  pinch.handlers.pointerdown(pinch.event(2, 90, 30, 0, 'touch'));
  pinch.handlers.pointerup(pinch.event(2, 90, 30, 0, 'touch'));
  pinch.handlers.pointerup(pinch.event(1, 30, 30, 0, 'touch'));
  assert.equal(pinch.buildCloseCount(), 1, '開始雙指手勢時應關閉建塔預覽');
  assert.deepEqual(pinch.supportCancels, [[false, false]], '雙指手勢應取消支援且不得還原暫存建塔面板');
  assert.equal(pinch.state.coins, 120, '取消預覽不可扣點');
  assert.deepEqual(pinch.taps, [], '雙指手勢不可送出 tap');

  const pan = createPointerHarness({ scale:2 });
  pan.handlers.pointerdown(pan.event(3, 20, 25, 0, 'touch'));
  const move = pan.event(3, 85, 70, 0, 'touch');
  pan.handlers.pointermove(move);
  pan.handlers.pointerup(pan.event(3, 85, 70, 0, 'touch'));
  assert.equal(move.defaultPrevented, true, '縮放後單指平移應阻止瀏覽器原生手勢');
  assert.deepEqual([pan.view.ox, pan.view.oy], [65, 45]);
  assert.deepEqual(pan.taps, [], '單指平移不可在放開時誤送 tap');
  assert.ok(pan.drawCount() > 0, '平移時應重畫棋盤');
});

test('a game-over raised during enemy updates stops the rest of that frame', () => {
  let towerCalls = 0;
  const state = {
    phase: 'wave',
    paused: false,
    over: false,
    supCd: [0, 0, 0],
    critter: null,
    critT: 100,
    waveActive: true,
    beam: null,
    autoT: 0,
    spawnQ: [],
    spawnT: 0,
    enemies: [{ dead: false, wob: 0, ti: 0 }],
    hp: 1,
    towers: [{}],
    projs: [],
    allies: [],
    fx: [],
  };
  const context = {
    S: state,
    raf: 0,
    lastT: 0,
    speedIdx: 0,
    hitStop: 0,
    requestAnimationFrame: () => 1,
    performance: { now: () => 16 },
    spawnCritter() {},
    updateCritter() {},
    hitEnemy() {},
    banner() {},
    fmt: value => value,
    L: () => ({ ui: { waveBanner: '' } }),
    ETYPES: [{ dmg: 1 }],
    burst() {},
    sfx() {},
    shake() {},
    moveEnemy: () => true,
    loseLife() { state.over = true; state.phase = 'over'; },
    towerAct() { towerCalls++; },
    moveProj: () => false,
    updateHUD() {},
    draw() {},
    levelClear() {},
  };
  vm.runInNewContext([
    'const SPEEDS = [1, 2, 3], CELL = 48;',
    extractFunction(gameSource, 'loop'),
    'globalThis.__loop__ = loop;',
  ].join('\n'), context, { filename: 'game-loop.test.js', timeout: 1_000 });
  context.__loop__(16);
  assert.equal(towerCalls, 0, 'gameOver 後同一幀不可再讓塔、投射物或過關流程更新');
});

test('cancelling the browser install dialog does not permanently dismiss the offer', async () => {
  const windowHandlers = Object.create(null);
  const clickHandlers = Object.create(null);
  const writes = [];
  const element = id => ({
    id,
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) { if (type === 'click') clickHandlers[id] = handler; },
  });
  const elements = new Map(['pwaBar', 'pwaMsg', 'pwaYes', 'pwaNo', 'pwaNever'].map(id => [id, element(id)]));
  const context = {
    S: null,
    window: { addEventListener(type, handler) { windowHandlers[type] = handler; } },
    document: { getElementById: id => elements.get(id) || null },
    localStorage: {
      getItem: () => null,
      setItem: (key, value) => writes.push([key, value]),
    },
    L: () => ({ ui: { pwaMsg: '', pwaYes: '', pwaNo: '', pwaNever: '' } }),
  };
  vm.runInNewContext(
    sourceBetween(gameSource, 'let deferredPrompt = null;', '/* ── Service Worker'),
    context,
    { filename: 'pwa-offer.test.js', timeout: 1_000 },
  );
  assert.equal(typeof windowHandlers.beforeinstallprompt, 'function');
  assert.equal(typeof clickHandlers.pwaYes, 'function');

  const installEvent = {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  };
  windowHandlers.beforeinstallprompt(installEvent);
  await clickHandlers.pwaYes();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!writes.some(([key]) => key === 'asmd_pwa_never'), '瀏覽器安裝視窗按取消後，未來仍應能再次提示');
  clickHandlers.pwaNever();
  assert.ok(writes.some(([key]) => key === 'asmd_pwa_never'), '只有明確按下「不再提示」才可永久記錄');
});

test('service worker isolates its own caches and never ignores request queries', () => {
  assert.doesNotMatch(swSource, /ignoreSearch\s*:\s*true/, '快取查詢不可忽略 query string');
  assert.match(swSource, /\bCACHE_PREFIX\s*=\s*['\"]asmd-['\"]/, 'SW 應使用專屬 asmd- cache 前綴');
  assert.match(swSource, /\.filter\s*\(\s*(\w+)\s*=>\s*\1\.startsWith\s*\(\s*CACHE_PREFIX\s*\)\s*&&\s*\1\s*!==\s*CACHE\s*\)/, '只能清除本遊戲前綴的舊 cache，且不可刪除目前版本');
  assert.doesNotMatch(swSource, /\bcaches\.match\s*\(/, '查詢必須限定在目前版本的 cache，不可跨 cache 命中');
  assert.match(swSource, /\bcache\.match\s*\(\s*request\s*\)/, '應以完整 request 在目前版本 cache 精確查詢');
  assert.match(swSource, /url\.origin\s*!==\s*self\.location\.origin/, 'fetch 應略過跨來源請求');
  assert.match(swSource, /\bresponse\.ok\b|\bres\.ok\b/, '只有成功回應可寫入 cache');
});

test('v2.1.1 service worker core assets are network-first with an offline cache fallback', async () => {
  const handlers = Object.create(null);
  const calls = [];
  const network = { ok:true, tag:'network', clone(){ return this; } };
  const cached = { ok:true, tag:'cached', clone(){ return this; } };
  const cache = {
    async addAll() {},
    async put() { calls.push('cache.put'); },
    async match() { calls.push('cache.match'); return cached; },
  };
  const context = {
    URL,
    Response:{ error:() => ({tag:'error'}) },
    caches:{ async open(){ calls.push('cache.open'); return cache; }, async keys(){ return []; } },
    fetch:async () => { calls.push('fetch'); return network; },
    self:{
      location:{origin:'https://example.test'}, registration:{scope:'https://example.test/game/'},
      addEventListener(type, handler){ handlers[type] = handler; },
      async skipWaiting(){},
      clients:{ async claim(){}, async matchAll(){ return []; } },
    },
  };
  vm.runInNewContext(swSource, context, {filename:'sw-navigation.test.js', timeout:1_000});
  let responsePromise;
  const onlineRequest = {method:'GET', mode:'navigate', destination:'document', url:'https://example.test/game/'};
  handlers.fetch({request:onlineRequest, respondWith(value){ responsePromise = value; }});
  const online = await responsePromise;
  assert.equal(online.tag, 'network');
  assert.equal(calls[0], 'fetch', '導覽必須先嘗試網路，而不是先讀舊快取');
  assert.ok(!calls.includes('cache.match'), '網路成功時不應回傳舊導覽內容');

  calls.length = 0;
  context.fetch = async () => { calls.push('fetch'); throw new Error('offline'); };
  const offlineRequest = {method:'GET', mode:'navigate', destination:'document', url:'https://example.test/game/offline'};
  handlers.fetch({request:offlineRequest, respondWith(value){ responsePromise = value; }});
  const offline = await responsePromise;
  assert.equal(offline.tag, 'cached', '離線時應回退目前版本快取');
  assert.equal(calls[0], 'fetch');
  assert.ok(calls.includes('cache.match'));

  calls.length = 0;
  context.fetch = async () => { calls.push('fetch'); return network; };
  const scriptRequest = {method:'GET', mode:'same-origin', destination:'script', url:'https://example.test/game/game.js'};
  handlers.fetch({request:scriptRequest, respondWith(value){ responsePromise = value; }});
  assert.equal((await responsePromise).tag, 'network');
  assert.equal(calls[0], 'fetch', '核心腳本也必須先走網路，避免 HTML／JS 混版');
});

test('HTML has no Google Fonts dependency and meta CSP omits unsupported frame-ancestors', () => {
  assert.doesNotMatch(htmlSource, /fonts\.(?:googleapis|gstatic)\.com/i, '離線遊戲不可依賴 Google Fonts');
  const csp = htmlSource.match(/<meta\b[^>]*http-equiv\s*=\s*['\"]Content-Security-Policy['\"][^>]*>/i)?.[0] || '';
  assert.ok(csp, 'index.html 應提供 meta CSP');
  assert.doesNotMatch(csp, /frame-ancestors/i, 'frame-ancestors 不受 meta CSP 支援，應移除');
});

test('interactive canvas and modal overlays expose keyboard and screen-reader semantics', () => {
  assert.match(htmlSource, /<canvas\b[^>]*id=['"]cv['"][^>]*tabindex=['"]0['"][^>]*role=['"]application['"]/i, 'canvas 應可聚焦並宣告為互動應用');
  assert.match(htmlSource, /id=['"]gameStatus['"][^>]*role=['"]status['"][^>]*aria-live=['"]polite['"]/i, '遊戲狀態應提供 polite live region');
  for (const id of ['startScreen', 'howScreen', 'quizScreen', 'endScreen', 'boardScreen']) {
    const tag = htmlSource.match(new RegExp(`<div\\b[^>]*id=['"]${id}['"][^>]*>`, 'i'))?.[0] || '';
    assert.match(tag, /role=['"]dialog['"]/i, `${id} 應有 dialog 語意`);
    assert.match(tag, /aria-modal=['"]true['"]/i, `${id} 應宣告 modal`);
    assert.match(tag, /aria-labelledby=/i, `${id} 應有可存取標題`);
  }
  assert.match(gameSource, /announceKeyboardCell\(\)/, '鍵盤移動後應朗讀目前格子');
  assert.match(gameSource, /setAttribute\(\s*['"]aria-label['"]\s*,\s*u\.canvasLabel\s*\)/, '切換語言時應同步棋盤可存取名稱');
});

test('localized controls and tooltips stay complete in every locale', () => {
  const i18n = loadI18n();
  for (const locale of ['zh','en','id','vi']) {
    const lang = i18n[locale];
    assert.equal(lang.towerTips.length, 13, `${locale} 應有 13 筆塔說明`);
    assert.equal(lang.support.tips.length, 3, `${locale} 應有 3 筆支援說明`);
    for (const value of Object.values(lang.ui.hudTitles)) assert.ok(value, `${locale} HUD title 不可空白`);
    for (const value of Object.values(lang.ui.controls)) assert.ok(value, `${locale} control label 不可空白`);
  }
  const applyI18nSource = extractFunction(gameSource, 'applyI18n');
  assert.match(applyI18nSource, /towerTips/, '切換語言時應更新塔 tooltip');
  assert.match(applyI18nSource, /support\.tips/, '切換語言時應更新支援 tooltip');
  const controlsSource = extractFunction(gameSource, 'applyControlA11y');
  assert.match(controlsSource, /aria-label/, '控制按鈕應有可翻譯 aria-label');
  assert.match(controlsSource, /aria-pressed/, '切換控制應同步 aria-pressed');
});

test('primary and danger buttons use WCAG-AA contrast text', () => {
  const luminance = hex => {
    const channels = hex.match(/../g).map(part => parseInt(part, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const contrast = (a, b) => {
    const left = luminance(a), right = luminance(b);
    return (Math.max(left, right) + .05) / (Math.min(left, right) + .05);
  };
  assert.match(styleSource, /\.pixel-btn\.primary\{[^}]*color:#1b1b2f/i);
  assert.match(styleSource, /\.pixel-btn\.danger\{[^}]*color:#1b1b2f/i);
  assert.ok(contrast('1b1b2f', '26a269') >= 4.5, 'primary 按鈕對比不足');
  assert.ok(contrast('1b1b2f', 'ef476f') >= 4.5, 'danger 按鈕對比不足');
});

test('v2.1 route guidance uses the agreed durations and remains skippable', () => {
  let now = 1_000;
  const context = { S:{ level:1 }, performance:{ now:() => now } };
  vm.runInNewContext([
    extractFunction(gameSource, 'startRouteGuide'),
    extractFunction(gameSource, 'finishRouteGuide'),
    'globalThis.__api__ = {startRouteGuide, finishRouteGuide};',
  ].join('\n'), context, { filename:'route-guide.test.js', timeout:1_000 });
  context.__api__.startRouteGuide();
  assert.equal(context.S.routeGuide.duration, 1000, '第 1–3 關導引應為 1000ms');
  assert.equal(context.__api__.finishRouteGuide(), true, '玩家操作應能立即完成導引');
  assert.equal(context.S.routeGuide.active, false);
  context.S.level = 4; now = 2_000;
  context.__api__.startRouteGuide();
  assert.equal(context.S.routeGuide.duration, 700, '第 4 關起導引應為 700ms');
  const handleTapSource = extractFunction(gameSource, 'handleTap');
  assert.ok(handleTapSource.indexOf('finishRouteGuide()') < handleTapSource.indexOf('internalToWorld'), '導引完成不可吞掉原本棋盤操作');
});

test('v2.1 danger warning has 80/92 percent thresholds, 75 percent hysteresis, and one alert per wave', () => {
  let notices = 0, vibrations = 0;
  const classList = { add(){}, remove(){}, toggle(){} };
  const elements = {
    waveBanner:{ textContent:'', classList }, dangerAlert:{ textContent:'' },
    dangerEdge:{ textContent:'', classList },
  };
  const enemy = { seg:81, prog:0, dead:false, dangerWarned:false, dangerActive:false, x:0, y:0 };
  const state = {
    path:Array.from({length:101}), enemies:[enemy], dangerWaveAlerted:false,
    dangerHapticDone:false, dangerFinal:false, dangerCount:0, dangerLastDom:0,
    dangerClearSince:0, dangerEdgeTarget:null,
  };
  const context = {
    S:state,
    banner(){ notices++; elements.waveBanner.textContent = 'danger'; },
    L:() => ({ui:{dangerAlert:'danger'}}),
    triggerHaptic(){ vibrations++; },
    document:{ visibilityState:'visible', body:{classList}, getElementById:id => elements[id] || null },
    view:{scale:1,ox:0,oy:0}, W:960, H:576,
    placeDangerEdge(){},
  };
  vm.runInNewContext([
    extractFunction(gameSource, 'enemyPathProgress'),
    extractFunction(gameSource, 'updateDangerState'),
    'globalThis.__update__ = updateDangerState;',
  ].join('\n'), context, { filename:'danger-warning.test.js', timeout:1_000 });
  context.__update__(1_000);
  assert.equal(enemy.dangerActive, true);
  assert.equal(notices, 1); assert.equal(vibrations, 1);
  context.__update__(1_300);
  assert.equal(notices, 1, '同一波不可重複大型警告或震動');
  enemy.seg = 74; context.__update__(1_600);
  assert.equal(enemy.dangerActive, false, '跌破 75% 才解除當前危險狀態');
  enemy.seg = 81; context.__update__(1_900);
  assert.equal(enemy.dangerActive, true);
  assert.equal(notices, 1, '擊退後再次越過 80% 不可重複警告');
  enemy.seg = 92; context.__update__(2_200);
  assert.equal(state.dangerFinal, true, '92% 起應進入最終防線狀態');
});

test('v2.1.1 reduced-motion and minimum-quality preferences disable haptics', () => {
  let vibrations = 0;
  const context = {
    uxPrefs:{reduceMotion:true}, actualQuality:'full',
    navigator:{ vibrate(){ vibrations++; } },
  };
  vm.runInNewContext(`${extractFunction(gameSource, 'triggerHaptic')}\nglobalThis.__haptic__=triggerHaptic;`, context);
  assert.equal(context.__haptic__(40), false);
  assert.equal(vibrations, 0, '減少動態時不可震動');
  context.uxPrefs.reduceMotion = false;
  context.actualQuality = 'minimum';
  assert.equal(context.__haptic__(40), false);
  assert.equal(vibrations, 0, '最低品質時不可震動');
  context.actualQuality = 'compact';
  assert.equal(context.__haptic__(40), true);
  assert.equal(vibrations, 1, '一般模式仍應保留本波一次輕震');
});

test('v2.1.1 mute preference safely migrates and persists', () => {
  let saved = JSON.stringify({quality:'auto', reduceMotion:false, reduceFlash:false, lastStable:'full'});
  const loadContext = {
    window:{matchMedia:null},
    UX_PREF_KEY:'asmd_ux_v21',
    localStorage:{getItem:() => saved},
  };
  vm.runInNewContext([
    extractFunction(gameSource, 'defaultUxPrefs'),
    extractFunction(gameSource, 'loadUxPrefs'),
    'globalThis.__load__=loadUxPrefs;',
  ].join('\n'), loadContext);
  assert.equal(loadContext.__load__().muted, false, '舊版偏好沒有 muted 欄位時應安全採用預設值');
  saved = JSON.stringify({quality:'auto', reduceMotion:false, reduceFlash:false, muted:true, lastStable:'full'});
  assert.equal(loadContext.__load__().muted, true, '重載時應還原靜音偏好');

  let writes = 0;
  const toggleContext = {
    muted:false, uxPrefs:{muted:false},
    saveUxPrefs(){ writes++; }, syncMuteButtons(){}, applyControlA11y(){},
  };
  vm.runInNewContext(`${extractFunction(gameSource, 'toggleMute')}\nglobalThis.__toggle__=toggleMute;`, toggleContext);
  toggleContext.__toggle__();
  assert.equal(toggleContext.uxPrefs.muted, true);
  assert.equal(writes, 1, '每次切換音效都應保存偏好');
});

test('v2.1 support previews never start cooldown before a valid confirmation', () => {
  const beginSource = extractFunction(gameSource, 'beginSupportAim');
  const targetSource = extractFunction(gameSource, 'setSupportTarget');
  const castSource = extractFunction(gameSource, 'useSupport');
  assert.doesNotMatch(beginSource, /supCd\s*\[/, '進入瞄準不可開始冷卻');
  assert.doesNotMatch(targetSource, /supCd\s*\[/, '選擇位置不可開始冷卻');
  assert.match(castSource, /S\.supCd\[i\]\s*=\s*sp\.cd/, '只有實際施放才可開始冷卻');
  assert.equal(numericConst(gameSource, 'LIGHT_CHARGE_MS'), 500, '手電筒蓄力必須是 500ms');
  assert.doesNotMatch(extractFunction(gameSource, 'startLightCharge'), /setTimeout\s*\(/, '蓄力不可使用會跨越暫停的牆鐘計時器');

  let casts = 0;
  const context = {
    S:{}, selSup:0, supportAim:{i:0,x:20,y:20},
    counts:{hits:0,globalHits:3},
    supportCounts(){ return context.counts; },
    useSupport(){ casts++; },
  };
  vm.runInNewContext(`${extractFunction(gameSource, 'confirmSupportTarget')}\nglobalThis.__confirm__=confirmSupportTarget;`, context);
  assert.equal(context.__confirm__(), false, '破門錘零命中不可確認');
  context.counts = {hits:2,globalHits:3};
  assert.equal(context.__confirm__(), true);
  assert.equal(casts, 1);
  context.selSup = 1; context.supportAim = {i:1,x:20,y:20}; context.counts = {hits:3,globalHits:3,localHits:0};
  assert.equal(context.__confirm__(), true, '震撼彈即使爆心零命中，只要場上有敵人仍可確認');
});

test('v2.1.1 tactical-light charge freezes while paused and resumes afterward', () => {
  let casts = 0;
  const context = {
    S:{over:false, paused:false, enemies:[{dead:false}]},
    lightCharge:{active:true, remainingMs:500, token:1},
    useSupport(){ casts++; return true; },
    cancelSupportAction(){ throw new Error('有效敵人仍在時不應取消蓄力'); },
    Number,
  };
  vm.runInNewContext(`${extractFunction(gameSource, 'updateLightCharge')}\nglobalThis.__charge__=updateLightCharge;`, context);
  context.__charge__(200);
  assert.equal(context.lightCharge.remainingMs, 300);
  context.S.paused = true;
  context.__charge__(2_000);
  assert.equal(context.lightCharge.remainingMs, 300, '暫停期間不得消耗蓄力時間');
  assert.equal(casts, 0, '暫停期間不得施放或開始冷卻');
  context.S.paused = false;
  context.__charge__(299);
  assert.equal(casts, 0);
  context.__charge__(1);
  assert.equal(casts, 1, '恢復後才可完成剩餘蓄力');
});

test('v2.1.1 build preview restores after support cancellation and exposes accessible state', () => {
  const begin = extractFunction(gameSource, 'beginSupportAim');
  const cancel = extractFunction(gameSource, 'cancelSupportAction');
  const render = extractFunction(gameSource, 'renderBuildMenu');
  const confirm = extractFunction(gameSource, 'bpConfirm');
  assert.match(begin, /suspendBuildMenu\(\)/, '進入支援瞄準應暫存建塔狀態');
  assert.doesNotMatch(begin, /closeBuildMenu\(\)/, '進入瞄準不可永久清除建塔預覽');
  assert.match(cancel, /restoreSuspendedBuildMenu\(\)/, '取消支援時應還原建塔預覽');
  assert.match(render, /aria-pressed/, '建塔選項應暴露目前選取狀態');
  assert.match(confirm, /showBuildError/, '二次驗證失敗時應保留面板並說明原因');
  assert.match(htmlSource, /id=['"]buildMenu['"][^>]*aria-describedby=['"][^'"]*bmError/i);
  assert.match(htmlSource, /id=['"]bmError['"][^>]*role=['"]status['"][^>]*aria-live=['"]polite['"]/i);
  assert.match(htmlSource, /id=['"]bmNo['"][^>]*aria-label=/i, '取消建造按鈕應有可讀名稱');

  let restores = 0;
  const context = {
    lightCharge:{active:true,remainingMs:100,token:4}, selSup:1, supportAim:{i:1}, S:{},
    document:{getElementById:() => ({classList:{add(){}}})},
    restoreSuspendedBuildMenu(){ restores++; return true; }, discardSuspendedBuildMenu(){},
    updateHUD(){}, draw(){},
  };
  vm.runInNewContext(`${cancel}\nglobalThis.__cancel__=cancelSupportAction;`, context);
  assert.equal(context.__cancel__(false), true);
  assert.equal(restores, 1);
  assert.equal(context.selSup, -1);
  assert.equal(context.supportAim, null);
});

test('v2.1 automatic visual quality obeys sustained thresholds and one downgrade per wave', () => {
  const state = { level:1, phase:'wave', waveActive:true, paused:false, over:false, layoutPaused:false };
  const context = {
    S:state, uxPrefs:{quality:'auto'}, actualQuality:'full',
    perfState:{fps:60,below45At:0,below30At:0,above55At:0,lastChange:-Infinity,downgradedWave:0},
    performanceSampleAllowed:() => true,
  };
  context.setActualQuality = (mode, ts) => {
    context.actualQuality = mode;
    context.perfState.lastChange = ts;
    return true;
  };
  vm.runInNewContext(`${extractFunction(gameSource, 'sampleAutoQuality')}\nglobalThis.__sample__=sampleAutoQuality;`, context);
  let ts = 0;
  for (let i=0;i<150;i++){ ts += 34; context.__sample__(ts,34); }
  assert.equal(context.actualQuality, 'compact', '低於 45fps 約 3 秒後應降為精簡');
  for (let i=0;i<500;i++){ ts += 40; context.__sample__(ts,40); }
  assert.equal(context.actualQuality, 'compact', '同一波最多只能降級一次');
  state.level = 2; ts += 16000;
  for (let i=0;i<80;i++){ ts += 40; context.__sample__(ts,40); }
  assert.equal(context.actualQuality, 'minimum', '下一波低於 30fps 約 2 秒後可進入最低保護');
  assert.match(extractFunction(gameSource, 'maybeRaiseAutoQuality'), /S\.phase\s*!==\s*['"]setup['"]/, '升級畫質只能發生在波次之間');
});

test('v2.1.2 score feedback stays outside combat and explosions outrank kill labels', () => {
  const hud = sourceBetween(htmlSource, '<div class="hud-secondary">', '</header>');
  const stage = sourceBetween(htmlSource, '<main id="stage">', '</main>');
  assert.match(hud, /id=["']scoreToast["']/, '短暫分數必須位於 HUD 第二列');
  assert.doesNotMatch(stage, /id=["']scoreToast["']/, '短暫分數不可覆蓋戰場');

  const scoreCss = styleSource.match(/\.score-toast\{([^}]*)\}/s);
  assert.ok(scoreCss, '缺少短暫分數樣式');
  assert.match(scoreCss[1], /position:static/, '短暫分數不可用絕對定位壓在棋盤上');
  assert.match(scoreCss[1], /font-size:13px/, '短暫分數應縮小為次要回饋');

  const hit = extractFunction(gameSource, 'hitEnemy');
  const labelAt = hit.indexOf('S.fx.push({ txt:');
  const burstAt = hit.indexOf('burst(e.x, e.y, t.c1', labelAt);
  assert.ok(labelAt >= 0 && burstAt > labelAt, '擊破文字必須先加入，讓後加入的爆破粒子畫在上層');
  assert.match(hit, /y:e\.y-24,\s*life:\.65/, '擊破文字應上移並提早淡出');

  const drawSource = extractFunction(gameSource, 'draw');
  assert.match(drawSource, /10px [^;]+;\s*ctx\.textAlign/, '擊破文字應縮小');
  assert.match(drawSource, /fillText\(f\.txt, f\.x, f\.y, CELL \* 2\)/, '擊破文字寬度必須限制在兩格內');
});

test('v2.1 mobile HUD, More pause restoration, score placement, and destructive guards stay intact', () => {
  for (const id of ['waveInfo','btnMore','moreScreen','btnMuteMore','btnHowMore','qualityMode','reduceMotion','reduceFlash','scoreToast','dangerEdge','supportConfirm','pwaUpdateBar','pwaUpdateNow']) {
    assert.match(htmlSource, new RegExp(`id=['"]${id}['"]`), `缺少 v2.1 介面：${id}`);
  }
  assert.match(styleSource, /body\[data-layout="mport"\]\s+#hudScore\{display:none;\}/, '手機常駐 HUD 不可顯示總分');
  assert.match(styleSource, /min-width:44px;\s*min-height:44px/, '手機常駐控制至少應有 44px 觸控尺寸');
  const towerControls = sourceBetween(gameSource, '/* ── 塔選單', '/* ── 商店與控制');
  assert.match(towerControls, /upgradeLockedUntil\s*=\s*now\s*\+\s*350/, '升級需要 350ms 輸入保護');
  assert.match(towerControls, /sellConfirmUntil\s*=\s*now\s*\+\s*3000/, '拆除二次確認窗應為 3 秒');
  assert.match(towerControls, /closeTowerMenu\(\);\s*sfx\([^;]+;\s*updateHUD\(\);\s*draw\(\)/, '暫停時拆塔也必須立即清除畫布殘影');
  assert.match(extractFunction(gameSource, 'bpConfirm'), /updateHUD\(\);\s*draw\(\)/, '暫停時確認建塔也必須立即重畫');
  assert.match(extractFunction(gameSource, 'updateHUD'), /refreshTowerMenu\(\)/, '塔面板餘額應隨 HUD 獎勵更新');
  assert.match(extractFunction(gameSource, 'renderBuildMenu'), /disabled aria-disabled/, '買不起的手機建塔選項必須真正停用');
  assert.match(gameSource, /controllerchange/, '新版 Service Worker 接管後應提供更新交接');
  assert.match(gameSource, /btnHowMore[^]*show\(['"]howScreen['"]\)/, '遊戲中應可從更多選單重開玩法說明');

  const screen = { classList:{ shown:false, contains(){ return this.shown; } } };
  const state = { over:false, phase:'wave', manualPaused:false };
  const context = {
    S:state, morePauseWasManual:false,
    syncPauseState(){ state.paused = state.manualPaused; }, updateMorePanel(){},
    show(){ screen.classList.shown = true; }, hide(){ screen.classList.shown = false; },
    document:{ getElementById:() => screen },
  };
  vm.runInNewContext([
    extractFunction(gameSource, 'openMore'), extractFunction(gameSource, 'closeMore'),
    'globalThis.__more__={openMore,closeMore};',
  ].join('\n'), context);
  context.__more__.openMore();
  assert.equal(state.manualPaused, true, '更多面板開啟時應暫停');
  context.__more__.closeMore();
  assert.equal(state.manualPaused, false, '關閉後應恢復原本未暫停狀態');
});
