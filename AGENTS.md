# AGENTS.md — 防詐迷宮 SCAM MAZE DEFENSE

> 給 AI agent 的專案地圖與工作規則。改動任何檔案前，先讀本檔對應區塊；做完有意義的變更後，回頭更新本檔（尤其是「game.js 區塊索引」與「版本同步清單」）。
> 借用 DOX 精神：先讀文件 → 理解局部規則 → 精準修改 → 保持文件同步。本專案扁平（所有原始碼在根目錄），因此只有這一份 AGENTS.md；game.js 大，改用「區塊索引」代替子目錄樹。

---

## 這是什麼

87 關像素風「防詐騙塔防」公益遊戲。詐騙大軍（釣魚簡訊、假網拍、假投資、假檢警、AI 深偽魔王、詐騙車手）沿迷宮衝向民眾，玩家蓋 13 種取材自真實防詐英雄的塔、外加 3 項「制裁技」攔截。教育宣導導向，非官方、不蒐集玩家資料。

- 正式部署：GitHub Pages → <https://tonnychiulab.github.io/anti-scam-td/>
- 目前版本：**v2.3.0**（分支 `agent/maze-visuals-and-bloat-review`，PR 送審中）；線上 `origin/main` 為 v2.2.1（PR #6，`5281af8`）。`LICENSE`（MIT）在 main 上完好。
- 技術棧：**純 HTML + CSS + JS，零框架、零建置工具、零 runtime 依賴**。唯一的 Node 依賴只用於發布前檢查（`node --test`）。

## 鐵則（違反會弄壞專案精神、安全或部署）

1. **不要引入框架、打包器、npm 執行期依賴或站外資源**（含 Google Fonts）。全部走原生 Web，路徑一律相對路徑，才能在 Pages 子目錄或任何 fork 下直接運作。
2. **不蒐集、不上傳玩家資料**。排行榜與偏好只存在瀏覽器 `localStorage`。
3. **免責聲明不可刪改語意**：本遊戲是民間公益作品，非 165 專線／警政署／任何政府機關官方遊戲。出現在 `index.html`、`README.md` 與 `i18n.js` 各語言的 `credit`。
4. **i18n / 使用者輸入的 HTML 安全政策（v2.2.1 起，務必遵守 `docs/SECURITY-I18N.md`）**：
   - 多語字串預設一律當純文字，用 `textContent` 或安全 DOM API 輸出。
   - 只有 `SECURITY-I18N.md` 白名單欄位（`ui.tagline`／`ui.credit`／`ui.howList`／`ui.loseComfort`／`ui.endWin`／`ui.endLose`／`ui.endStats`）可進 `innerHTML`，且只准 `<b>`／`<br>`／既有 span，禁 `<script>`／`<iframe>`／`javascript:`／`data:`／任何事件屬性。
   - 玩家名稱、localStorage、網址、網路回應等外部資料進 HTML 模板前**必須** `escapeHtml()`（定義在 ui.js）。
   - 排行榜寫入前必須淨化（整數／範圍夾限），防 `Infinity`／`NaN`／負數／超關卡。
   - 新增可含 HTML 的欄位 → 先更新 `SECURITY-I18N.md` 與測試，不可只在程式開例外。
5. **改版本號必須五處同步**（見「版本同步清單」），否則發布測試會紅。
6. **改文字必須四語同步**（zh／en／id／vi），陣列長度跨語言一致，否則測試會紅。

---

## 檔案地圖

| 檔案 | 行數量級 | 角色 |
|---|---|---|
| `index.html` | ~336 | 頁面骨架、所有 DOM id、覆蓋層（開始／玩法／排行）、HUD、canvas、支援列 |
| `style.css` | ~510 | 像素風視覺、RWD、直立／橫向版面、動畫、減少動態／閃光偏好 |
| `game.js` | ~1032 | 核心：版本、語系 helper（`L`/`fmt`）、棋盤/layout/檢視、RNG、遊戲狀態與 UX 偏好、迷宮與支線產生、音效、草地小幫手、主迴圈、損命/過關/測驗、中途轉向、SW 交接、開機 `applyI18n()` |
| `data.js` | ~56 | 純資料表：`TOWERS`／`ETYPES`／`SUPPORT`／`MODS`／`CRITTERS`／`CLEAR_EN`／`UP_MULT`／`MAX_TLV`。調數值只動這裡 |
| `render.js` | ~545 | canvas 元素（`cv`/`ctx` 宣告在此）、繪圖與詐團造型：`draw`／`paintGround`／`drawTower`／`drawEnemy`／`SCAM_BODY` 分派表／`shake`。只讀全域狀態繪製，不含遊戲邏輯 |
| `combat.js` | ~546 | 戰鬥：波次組成、敵人（`spawnEnemy`/`moveEnemy`/`updateDangerState`）、塔攻擊（`towerAct`/`hitEnemy`/`tryConvert`）、投射物、粒子、支援施放與制裁技（`useSupport`/`rewindEnemy`） |
| `ui.js` | ~1108 | 介面：HUD（`$`/`updateHUD`）、點地建造面板、畫布互動、塔選單、商店與控制、排行榜（**`escapeHtml` 定義在此**）、套用語言（`applyI18n`）、畫面切換、PWA 安裝提示 |
| `i18n.js` | ~525 | 四語字典 `I18N = { zh, en, id, vi }`，game.js 先於此載入 |
| `sw.js` | ~100 | Service Worker，cache-first，逐檔容錯預快取，快取命中率統計 |
| `manifest.webmanifest` | — | PWA 設定 |
| `icons/` `screenshots/` | — | 圖示與 README 截圖 |
| `tests/release.test.mjs` | — | 零依賴發布檢查（版本一致、四語鍵齊全、制裁技數值、XSS 淨化等，52 項） |
| `docs/` | — | 設計、程式審查、發布驗證、安全政策、路線圖、工作日誌（見下方） |

載入順序（`index.html` 底部）：`i18n.js` → `data.js` → `render.js` → `combat.js` → `ui.js` → `game.js`（傳統 script 共享全域；**順序不可對調**。後載檔可在頂層引用先載檔的全域；反向只能在函式內引用（呼叫時機都在全部載入後）。頂層「立即執行」若引用後載檔全域會直接 ReferenceError——新增頂層程式碼前先確認它該放哪一檔；初始 `applyI18n()` 因此放在 game.js 尾端）。

---

## 區塊索引（v2.3.0）

> 依原始碼中的 `/* ── 區塊 ── */` 註解整理。行號會隨編輯漂移——**改完後請更新對應表**。以功能定位、不要盲改。
> **v2.3 拆檔**：`data.js`（純資料，不另設索引）＋ `render.js`（繪圖，區塊即檔案地圖描述）＋下面三張表。

### game.js（核心，~1032 行）

| 起始行 | 區塊 | 內容 |
|---|---|---|
| 7 | 版本 | `APP_VERSION`（改版本先動這裡） |
| 9 | 分支測試標記 | `BRANCH_TAG`（僅測試辨識用，**合併回 main 前務必清空為 `''`**） |
| 12 | 多國語系 | `LANG` 偵測、`L()`、`fmt()` 字串插值 |
| 24 | 棋盤尺寸 | `CELL/MAJ/MIN/COLS/ROWS`、`MAX_LEVEL=87`、血量與命數上下限（`cv`/`ctx` 在 render.js） |
| 34 | layoutMode | `detectLayout/applyLayout`：desktop｜mland｜mport（能力偵測，不猜機型） |
| 55 | 檢視 | 雙指縮放／平移座標轉換 |
| 80 | 種子隨機 | `RNG(seed)`：同關卡種子 → 同迷宮（roguelike） |
| 91 | 遊戲狀態 | 全域 `S`（含 `routes`／`branchCells`／`pathWide`）、選取狀態、`runGen` 局次世代、`newState()`、`guardedTimeout`；UX 偏好與畫質（`uxPrefs`、auto/full/lite、觸覺回饋）在此區塊內 |
| 235 | 迷宮產生 | `genMajorPath`（主線）、`genBranchRoutes`＋`buildRoutes`（支線岔路與路線組合，最多 2 段／4 條路線）、`genWideShoulders`（加寬路肩）、`genLevel`：主軸空間生成，直立時轉置 |
| 367 | 音效 | `sfx`（8-bit）、`sfxBoom`、`screenFlash`、命中停格（制裁技 180/260/420ms） |
| 458 | 草地小幫手 | `spawnCritter` `updateCritter` |
| 526 | 主迴圈 | `loop(ts)`、`ensureLoop/stopLoop`、暫停同步、停格凍結、`startWave` |
| 687 | 損命／結束 | `loseLife` `gameOver`；結算插值用 `escapeHtml` |
| 750 | 過關流程 | `levelClear` `afterQuiz`（每 3 關測驗） |
| 809 | 過關轉場 | `playClearFx`（快打旋風式色帶） |
| 836 | 續命測驗 | 避開詐騙情境 → +1 命 |
| 890 | 中途轉向 | `relayout`：場上狀態無損轉置（含 `S.routes`／`S.branchCells` 轉置與 grid 重建） |
| 968 | SW 交接與快取統計 | 更新交接、命中率顯示 |
| 1031 | 開機 | 初始 `applyI18n()` 呼叫（定義在 ui.js，須等全部 script 載入） |

### combat.js（戰鬥，~546 行）

| 起始行 | 區塊 | 內容 |
|---|---|---|
| 3 | 波次組成 | `buildWave`（第 6 關起排入車手）、路線導引 |
| 45 | 敵人 | `spawnEnemy`（出生擲骰選路線 `e.ri`）`moveEnemy` `updateDangerState`（出口危險提示）；路線查詢刻意內聯不抽 helper（測試 vm 沙箱需函式自足） |
| 161 | 塔攻擊 | `buffFactor` `towerAct` `hitEnemy` `tryConvert`（志工轉化，繼承敵人路線） |
| 256 | 投射物 | `landProj` `moveProj` |
| 296 | 粒子特效 | `burst` |
| 307 | 支援施放 | 瞄準／確認／半徑、制裁技鎖定與施放（`useSupport`/`rewindEnemy`）、手電筒蓄力 |

### ui.js（介面，~1108 行）

| 起始行 | 區塊 | 內容 |
|---|---|---|
| 3 | UI | `$`、HUD、字串套用、控制列 |
| 268 | 點地建造面板 | 手機兩段式確認（確認前絕不扣款）；塔名／圖示以 `escapeHtml` 轉義 |
| 430 | 畫布互動 | 單指＝操作、雙指＝縮放平移（硬區分）；頂層對 `cv` 掛事件（`cv` 在 render.js） |
| 638 | 塔選單 | 升級／拆除 |
| 721 | 商店與控制 | 商店列、速度／暫停／靜音 |
| 861 | 排行榜 | localStorage 匿名；寫入淨化 + `escapeHtml`；**`escapeHtml()` 定義在第 903 行** |
| 921 | 套用語言 | `applyI18n` 靜態介面文字換語言（初始呼叫在 game.js 尾端，勿在本檔頂層呼叫） |
| 996 | 畫面切換 | 覆蓋層開關、`startGame`（含 `genLevel(1)` 開局） |
| 1056 | PWA 安裝提示 | 過第 3 關一次性，可永久關閉 |

---

## i18n.js 結構與規則

`const I18N = { zh:{…}, en:{…}, id:{…}, vi:{…} }`。每個語言區塊有相同鍵集合：

- `ui`：所有介面字串（含 `credit` 免責聲明、`hudTitles`、`controls`、制裁技命中短句…）
- `support`（6 項，含制裁技）/ `critters`
- `towers`（13 項）/ `towerTips`（13 項，含解鎖等級說明）
- `enemies`（**6 項**，索引 5＝詐騙車手）
- `quiz`（續命測驗題庫）/ `tips`（防詐小知識）

新增文字：**四語都要加同一個鍵**；陣列（towers/enemies/quiz/tips/support）長度必須跨語言一致。字串插值用 `{name}` 佔位，由 `fmt()` 帶入；**任何會進 HTML 的插值一律先 `escapeHtml()`**（見鐵則 4）。
新增語言：複製一個語言區塊整段翻譯（roadmap：泰文 th、Tagalog）；現有 id／vi 為 AI 初譯，歡迎母語者校對。

---

## 版本同步清單（改版本必做）

新版本號要同時更新這些位置，`tests/release.test.mjs` 會驗證一致：

1. `game.js` → `APP_VERSION`
2. `package.json` → `version`
3. `sw.js` → `CACHE = ${CACHE_PREFIX}v…`（改這個才會讓舊快取失效、玩家拿到新版）
4. `index.html` → credit 區塊尾端的 `v…`
5. `i18n.js` → 各語言 `ui.credit` 裡的版本字樣

`sw.js` 的 `ASSETS[]` 若新增／改名檔案也要同步（目前 13 個 app-shell 資源），否則新資源不會被快取。

---

## 開發與驗證

```bash
npm test          # node --test tests/release.test.mjs（零依賴發布檢查，目前 52 項）
```

本地預覽：因用相對路徑與 SW，直接開檔即可，或起任意靜態伺服器（如 `python3 -m http.server`）。
發布：把根目錄檔案 + `icons/` + `screenshots/` 放上 repo，Settings → Pages → `main` branch。

**提交前的自我檢查**：`npm test` 綠燈；四語鍵齊全且陣列等長；版本五處同步；免責聲明未被破壞；HTML／使用者輸入依 `SECURITY-I18N.md` 轉義；沒有引入站外資源或依賴；相對路徑未變絕對路徑。

---

## docs/ 導覽

工作歷程與規格集中在 `docs/`：

- `ROADMAP.md` — 開發路線圖
- `DESIGN-v2*.md` — 版本設計（含 `DESIGN-v2.2-enforcement-skills.md` 制裁技決策）
- `SECURITY-I18N.md` — **多語 HTML 安全政策（鐵則 4 的依據，改動 i18n/HTML 前必讀）**
- `CODE-REVIEW-v2.*.md` — 各版本程式審查
- `RELEASE-VALIDATION-v2.*.md` — 各版本發布驗證（最新 v2.3.0）
- `AUDIT-v2.1.0-independent.md` — 獨立稽核
- `BACKLOG-v2.1.1.md`、`UX-v2.1-mobile-guidance.md`
- `WORKLOG-*.md` — 工作日誌（`WORKLOG-2026-07-15.md` 止於 v2.1.2；`WORKLOG-2026-07-15-cont-v2.2.md` 補上 v2.2.0／v2.2.1；`WORKLOG-2026-07-17-claude-code.md` 記錄 v2.3.0 全程）

**慣例**：一個版本一組文件；做完一次發布，補上該版的 CODE-REVIEW 與 RELEASE-VALIDATION，並在 WORKLOG 記錄。信任邊界有變更時，同步更新 `SECURITY-I18N.md`。

---

## 目前待辦（接手先看）

> v2.3.0（走道加寬＋詐團造型＋多分支走道＋六檔架構重整）已在分支 `agent/maze-visuals-and-bloat-review` 完成並通過四輪瀏覽器驗收與 52 項自動測試，PR 送審中。

1. PR 合併後確認 GitHub Pages 部署為 v2.3.0（SW `CACHE` 已升版，玩家端會自動汰換舊快取）。
2. 手機實機（iPhone Safari／Android Chrome）驗收多分支走道與新造型的觸控體驗。
3. 工作區仍有未提交的 CRLF 換行雜訊（README／LICENSE／ROADMAP／SECURITY-I18N／RELEASE-VALIDATION-v2.2.1，整檔異動但內容相同）與 v2.1 era 未進版控文件（AUDIT／BACKLOG／CODE-REVIEW-v2.1.0／舊 WORKLOG）——刻意不混入 v2.3.0 PR，另行處理。

## 更新本檔的時機

- 動了 game.js 的區塊結構（新增／移動大段功能）→ 更新「game.js 區塊索引」行號與列。
- 改了版本流程、加了檔案、加了語言 → 更新對應清單。
- 定了新的專案規則或信任邊界 → 補進「鐵則」並同步 `SECURITY-I18N.md`。

保持這份地圖與程式碼同步，是本檔存在的唯一理由。
