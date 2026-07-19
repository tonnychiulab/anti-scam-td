# 工作日誌：2026-07-17（Claude Code 專用）

> **標記說明**：本檔由 **Claude Code** 執行與撰寫。專案先前另有 Grok、CODEX 等 AI 協作紀錄（見 v1.6.0／v2.0.0 等版本紀錄的「雙 AI 外審」），為避免與其他工具的工作紀錄混淆，本次工作日誌檔名與標題明確標註「Claude Code 專用」。若之後有其他 AI 助手接手同一分支，請另開檔案並比照標註來源，不要混寫在同一份日誌裡。

## 今日背景

使用者請 Claude Code 詳細閱讀整個 `anti-scam-td-claudecode` 專案（README／AGENTS.md／CLAUDE.md／ROADMAP／各版本 CODE-REVIEW／RELEASE-VALIDATION／WORKLOG／SECURITY-I18N／game.js 結構），確認現況為線上 v2.2.1（`origin/main @ 5281af8`），48 項零依賴回歸測試全過。

閱讀後與使用者討論三個題目：

1. 迷宮走道大小（目前恆為 1 格寬，`genMajorPath` 產生單一中心線蛇形路徑）
2. 詐團圖示多樣化（除車手外，其餘 5 種敵人共用同一套「方形+賊笑眼睛+一個字」樣板）
3. 目前程式碼是否過肥（`game.js` 3065 行單檔，但函式層級無巨獸函式，最大 `relayout()` 164 行；問題在檔案層級聚合而非函式層級腐化）

使用者決定：**第 3 項（架構）先不動，力氣留給第 1、2 項**，並請 Claude Code 直接動工、**不 commit**，由使用者自行在瀏覽器內部測試。

## 分支

從 `main`（`5281af8`）切出 `agent/maze-visuals-and-bloat-review`，本次所有變更皆在此分支、**未 commit**。

## 完成內容

### 1. 走道加寬（戰術寬巷）

- 新增 `genWideShoulders(cells, rng)`（緊接 `genMajorPath` 之後）：把迷宮中較長的水平段落（連續同列 ≥3 格、且非路徑首尾段）以 45% 機率展開成 2 格寬；每關最多加寬 2 段；候選加寬列若超出邊界或跟中心線本身撞在一起，會嘗試換另一側，兩側都不行就放棄該段（不強迫加寬）。
- **敵人移動邏輯完全不變**：`S.path`（中心線 waypoint 序列）維持原樣，加寬的格子另存為 `S.pathWide`，只用來：
  - 標記進 `S.grid`（擋建塔，沿用既有 0/1/2 慣例，建塔驗證／點地建造／鍵盤焦點朗讀等既有程式碼因為都是泛用讀 `S.grid` 而自動生效，無需改動）；
  - 在地面繪製（`paintGround`）多鋪一份泥徑貼圖，並用鄰接判斷讓「路肩貼中心線那一側」不畫綠色邊線，避免寬巷中間出現突兀接縫；原本 `S.path` 那一圈的繪製邏輯完全未動，保證既有 87 關單寬走道的外觀零回歸。
- 手機中途轉向（`relayout()`）同步轉置 `S.pathWide` 並重建 `S.grid`，加寬段落不會在轉向後消失或跑位。
- 種子公式 `RNG(lv*40503 + 777773)`，與現有 `genMajorPath`（`lv*7919+12345`）、關卡修飾事件（`lv*2654435761+97`）的種子不同，維持「同關卡種子 → 同迷宮」的 roguelike 特性。

### 2. 詐團圖示多樣化

- 新增 `SCAM_BODY` 分派表 + 5 個造型函式，取代原本共用的方形樣板：
  - `drawPhishBody`（釣魚簡訊）：信封＋摺角三角形＋方塊拼出的 J 形釣鉤
  - `drawShopBody`（假網拍）：提袋＋左右 L 形提把迴圈＋假五星標籤
  - `drawInvestBody`（假投資）：捨棄臉部，改用三根遞增假上升柱狀圖＋紅色假箭頭
  - `drawPoliceBody`（假檢警）：盾牌五邊形警徽造型
  - `drawBossBody`（AI 深偽魔王）：維持原本方形本體（已夠大夠特殊），加上 RGB 錯位故障色條呼應「深偽」，並遵守 `uxPrefs.reduceMotion` 停用位移動畫
  - `drawGenericScamBody` 保留為 fallback，供未來新增 `ETYPES` 若無專屬造型時使用
- 全部沿用既有像素風格（`fillRect` 為主，`beginPath/lineTo/fill` 多邊形為輔，跟 `drawHouse` 屋頂三角形同一套慣例），沒有用到 arc/圓形。
- 修正 `shop` 圖示字 `¥` 與 `invest` 的 `$` 語意重疊問題，改為 🛍（確認過 `.face` 只有 `drawEnemy` 這裡在讀，i18n 的敵人名稱是另一組獨立字串，不受影響）。

### 3. 分支標記（本次追加）

- 使用者要求在畫面上標示這是分支版本，加了獨立於正式版號的 `BRANCH_TAG = 'maze-visuals'`（game.js:9-10），只附加在右下角原有的版本／快取命中率小標籤上，顯示為 `v2.2.1 🔧maze-visuals | CACHE …`。
- 刻意跟 `APP_VERSION` 分開、不碰免責聲明與四語系文字，不觸發版本五處同步或四語同步流程。
- 已在程式碼加註解：**合併回 main 前務必把 `BRANCH_TAG` 清空為 `''`**，避免這個測試標記被誤帶進正式版。

## 測試與驗證

- `npm test`：全程維持 **48/48** 通過（每次修改後都有重跑）。
- 針對 `genWideShoulders` 另外寫了一個獨立驗證腳本（未進版控，跑完即刪），用跟 `tests/release.test.mjs` 相同的 `vm` 抽取手法把函式抽出來單獨測試，掃過全 87 關：
  - 63/87 關會出現至少一段加寬；
  - 所有加寬格皆在邊界內、皆不與中心線重疊；
  - 路徑仍完整貫通全部 20 欄。
- **注意**：`tests/release.test.mjs` 本身是純靜態／字串抽取檢查（其註解明講「deliberately does not execute the browser game」），完全不會執行 canvas 繪圖，所以圖示造型與加寬走道的實際視覺效果**沒有被任何自動測試涵蓋**，Claude Code 這一側也沒有瀏覽器可以親眼驗證。這部分完全仰賴使用者手動在瀏覽器測試。

## 目前 Git 狀態

- 分支：`agent/maze-visuals-and-bloat-review`（從 `main@5281af8` 切出）
- **未 commit**，依使用者要求先在本機測試。
- 工作區另有一批與本次功能無關的既有雜訊：`game.js`／`i18n.js`／`index.html`／`sw.js` 等檔案顯示整檔異動，經確認純屬 **CRLF/LF 換行符差異**（working tree 是 CRLF、上次提交是 LF），內容並無實質差異，非本次改動造成，也未處理（不影響测試與執行）。

## 追加：多分支走道（同日下午，瀏覽器測試通過後）

使用者回報第一輪瀏覽器測試**五項全過**（加寬走道自然度、路肩邊線接縫、5 種造型辨識度、手機轉向後加寬段落、右下角分支標記），並追加需求：**走道可多分支**。已在同分支實作：

- **產生器**：`genBranchRoutes(cells, rng)`（種子 `RNG(lv*15859+424243)`，與主線／路肩／事件種子皆不同）。從主線的水平段（連續同列 ≥3 格、非首尾段）以 55% 機率岔出支線：隔 1 格平行繞行、再併回主線，岔口中間留草地可蓋塔，形成真正的分岔口。每關最多 2 段支線，支線之間、與中心線之間互不重疊；候選側放不下會換另一側再試。
- **路線組合**：`buildRoutes()` 把主線＋支線展開成所有可走路線（最多 4 條：主線／走A／走B／A+B），存 `S.routes`，`routes[0]` 恆為主線、`S.path` 維持指向它，因此路線導引、起終點繪製、既有主線畫法全部不用動。
- **敵人選路**：出生時 `Math.floor(Math.random()*S.routes.length)` 等機率抽一條存 `e.ri`；`moveEnemy`／`enemyPathProgress`／`rewindEnemy`（絆倒車手回捲）全改讀自己的路線。擊退（阿嬤塔 knock）只減 `e.seg`、位置由 moveEnemy 沿自身路線重算，自動相容。
- **志工**：`tryConvert` 轉化時繼承來源敵人的 `ri`，反向沿同一條路線走回傳送門。
- **繪製與棋盤**：支線格（`S.branchCells`）畫法與主線完全相同；標進 `S.grid`（擋建塔）；路肩加寬改為避開支線格、鄰接判斷也納入支線格避免綠線接縫。手機中途轉向 `relayout()` 同步轉置 `S.routes`／`S.branchCells` 並重建 grid。
- **測試相容的取捨**：`tests/release.test.mjs` 用 `extractFunction` 抽單一函式進 vm 沙箱執行，函式必須自足，因此路線查詢 `(S.routes && S.routes[e.ri]) || S.path` 刻意內聯、不抽共用 helper（程式碼有註解說明）。第一版用了 helper 導致 3 個測試紅，改內聯後全綠、**測試檔零改動**。
- **驗證**：`npm test` 48/48 綠。獨立驗證腳本（scratchpad，未進版控）掃全 87 關：**30 關 1 段支線、23 關 2 段、34 關無支線**；所有組合路線起終點同主線、每步相鄰 1 格、無重複經過；支線不出界、不壓中心線、彼此不重疊；路肩不壓支線。
- **未涵蓋**：canvas 實際視覺、分岔口的玩法手感（塔位是否合理）仍需使用者瀏覽器手動驗證。路線導引（開場黃格動畫）僅顯示主線，支線靠地面泥徑自然可見——若使用者覺得該把支線也導引出來，可再加。

## 追加 2：程式碼減肥第一步（B-lite 拆檔，同分支繼續疊）

多分支走道第二輪測試通過後，與使用者討論了 game.js 過肥問題（3263 行單檔、151 個頂層函式、最大函式 169 行——函式層級健康，肥在檔案層級）。因 `file://` 直接開檔預覽是專案工作流（ES modules 會被 CORS 擋掉）、零建置工具是鐵則，唯一可行的刀是**多個傳統 `<script>` 共享全域**（即既有 `i18n.js` → `game.js` 模式的延伸）。使用者採納 B-lite 方案：先抽最穩定的兩塊驗證此路無暗雷。

- **`data.js`（~56 行）**：純資料表 `TOWERS`／`UP_MULT`／`MAX_TLV`／`ETYPES`／`CLEAR_EN`／`SUPPORT`／`CRITTERS`／`MODS`，原封搬移零改寫。
- **`render.js`（~541 行）**：繪圖＋詐團造型整段（`shake`／`shakeAmt`／`groundCv`／`paintGround`／`buildGround`／`drawRouteGuide`／`draw`／各 drawXxx／`SCAM_BODY`），原封搬移零改寫。狀態變數 `shakeAmt`／`groundCv` 只在此檔內被讀寫，天然乾淨。
- **game.js 瘦身後 ~2673 行**，兩個切口留了指路註解。
- **載入順序**：`i18n.js` → `data.js` → `render.js` → `game.js`（index.html 已更新；順序不可對調）。
- **sw.js `ASSETS[]` 9→11**（不加新檔玩家就拿不到；`CACHE` 名稱未動，因為還沒改版本號——**合併發版時靠版本號升級讓快取失效即可**）。
- **測試**：`tests/release.test.mjs` 只改三處——`gameSource` 改為三檔依載入順序串接（既有字串／函式抽取檢查照常涵蓋）、語法檢查清單加兩檔、SW 預快取數 9→11 並斷言含新檔。測試數 48→50（新增兩檔的語法檢查子測試），**50/50 綠**。
- **驗證**：跨檔重複宣告掃描（無）；Node vm 依載入順序執行 i18n→data→render 頂層並驗證跨 script 全域可見性（TOWERS 13／ETYPES 6／SUPPORT 6／MODS 5／SCAM_BODY 5 鍵／draw 等函式皆在）；87 關支線不變量重跑全過。game.js 頂層含 DOM 操作無法在 Node 整檔執行，**瀏覽器實際載入（含 SW 快取更新、PWA 離線）仍需使用者驗證**。
- AGENTS.md 已同步：檔案地圖加兩檔、載入順序、ASSETS 11 個、測試 50 項、區塊索引重排（資料表與繪圖列改為指向新檔的指標列）。

## 追加 3：程式碼減肥第二步（完整方案 B——combat.js＋ui.js）

B-lite 三輪驗收全過後，使用者拍板執行完整方案 B。同分支繼續疊：

- **`combat.js`（~546 行）**：波次組成＋敵人＋塔攻擊＋投射物＋粒子特效（原 366–669）＋支援施放/制裁技（原 759–998），兩段原封搬移。音效、草地小幫手留在 game.js。
- **`ui.js`（~1108 行）**：UI＋建造面板＋畫布互動＋塔選單＋商店＋排行榜（原 1430–2347，含 `$` 與 `escapeHtml`）＋套用語言/畫面切換/PWA（原 2424–2611），兩段原封搬移。中途轉向與 SW 交接留在 game.js。
- **game.js 最終 ~1032 行**（從拆檔前 3263 行瘦身 68%），六個切口都有指路註解。
- **載入順序**：`i18n → data → render → combat → ui → game`；sw.js `ASSETS[]` 11→13。

### 冒煙測試抓到的兩顆真雷（瀏覽器會直接 ReferenceError）

為此寫了載入順序冒煙腳本（scratchpad，用 Proxy stub DOM，依序執行前五檔頂層；game.js 頂層需完整 DOM 維持不執行）：

1. **`cv`/`ctx`**：ui.js 頂層（畫布互動區）對 `cv` 掛事件，但 `cv` 原宣告在 game.js（最後載入）→ 把 `const cv`/`const ctx` 兩行搬到 render.js 開頭（載入序在 combat/ui/game 之前）。
2. **初始 `applyI18n()`**：原在套用語言區定義後立即呼叫，搬進 ui.js 後載入時 `L()`/`uxPrefs` 尚未定義 → 呼叫移到 game.js 尾端「開機」區（全部 script 載完後執行，時序等價）。

**教訓已寫進 AGENTS.md 載入順序段**：後載檔可在頂層引用先載檔全域，反向只能在函式內；頂層「立即執行」加新程式碼前先確認放哪一檔。

### 測試與驗證

- `tests/release.test.mjs` 改三處：`gameSource` 串接改五檔、語法檢查清單加兩檔、PWA 測試的 `sourceBetween` 終點錨改為 game.js 檔頭橫幅（原錨 `/* ── Service Worker` 拆檔後隔在別檔）。SW 預快取斷言 11→13。測試數 50→**52，全綠**。
- 跨檔重複宣告掃描：五檔頂層名稱無衝突。
- 載入順序冒煙：五檔頂層依序執行 OK，跨 script 全域可見性（資料表／combat／ui／render 各代表函式）全部確認。
- **驗證腳本勘誤**：先前支線驗證腳本誤用 `MIN=11`（實際 game.js:26 為 `MIN=12`），修正後重掃全 87 關：**33 關 1 段支線、21 關 2 段、33 關無**，所有不變量（起終點、連續性、不重疊、不出界、路肩不壓支線）仍全過。
- AGENTS.md 全面同步：檔案地圖六檔、載入順序規則、ASSETS 13、測試 52、區塊索引改為三張表（game.js／combat.js／ui.js）。
- ~~待使用者瀏覽器驗證（第四輪）~~——**全過**：file:// 直接開檔可玩；外觀與行為零改變（點地建造、塔選單、商店、排行榜、語言切換等 ui.js 功能逐一手測）；localhost `CACHE 100% (2/2)`（重整時多數資源由瀏覽器記憶體快取供應、不經 SW，到達 SW 的請求全數命中，SW 運作正常）。

## 追加 4：合併發版 v2.3.0

四輪驗收全過後使用者拍板發版。執行：

1. `BRANCH_TAG` 清空為 `''`（機制保留供未來分支測試）。
2. 版本五處同步 **v2.3.0**（game.js／package.json／sw.js CACHE／index.html／i18n.js 四語 credit）。
3. 補 `docs/CODE-REVIEW-v2.3.0.md` 與 `docs/RELEASE-VALIDATION-v2.3.0.md`。
4. AGENTS.md 版本描述與待辦更新。
5. 提交檔案正規化為 LF（工作區原為 CRLF，避免 PR 整檔雜訊 diff）；README／LICENSE／ROADMAP／SECURITY-I18N／RELEASE-VALIDATION-v2.2.1 的 CRLF 雜訊與 v2.1 era 未進版控文件**刻意不入本 PR**。
6. `npm test` 52/52 綠 → commit → push → 開 PR。

## 追加 5：合併上線與環境收尾（本日終）

1. **PR #7 合併上線**：Strix 安全審查與全部 3 項 checks 綠燈後，使用者 Squash and merge（main@`032e273`）。GitHub Pages 部署完成，線上 <https://tonnychiulab.github.io/anti-scam-td/> 右下角已確認顯示 **v2.3.0**。
2. **推送環境**：commit 作者身分設 repo-local（Tonny Chiu Lab）；推送靠 Windows Git Credential Manager（repo-local `credential.helper` 指向 `/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe`），origin 與鏡像 repo `anti-scam-td-claudecode`（remote 名 `claudecode`，已推 main＋功能分支）都不需 token。使用者曾在對話中貼過一組暫時 PAT——**未使用**（安全機制擋下嵌指令做法，且 GCM 已足夠），已提醒撤銷。
3. **gh CLI 安裝**：Kali 用 `kali-last-snapshot` 凍結源無 `gh` 套件，改抓官方 tarball 裝到 `~/.local/bin/gh`（v2.76.0，免 sudo），`gh auth login` 為 tonnychiulab（repo scope）。以後開 PR／查 CI／合併可一條指令。
4. **分支清理**：已合併的 `agent/maze-visuals-and-bloat-review` 遠端＋本機皆已刪除（squash 合併故本機用 `-D`，內容都在 main）。本機另有 v2.0–v2.2 時期的舊 agent/* 分支未動。
5. **本機 main 已對齊 `origin/main@032e273`**。

## 尚未完成／下次接續

1. **四輪瀏覽器驗收全數通過**（詳見各「追加」段）：
   - 第一輪：走道加寬＋詐團造型五項 ✔
   - 第二輪：多分支走道五項 ✔
   - 第三輪：B-lite 拆檔（file:// 可玩、外觀零改變、SW 快取 11 資源、105 bytes/500 kB 快取供應）✔
   - 第四輪：完整方案 B（file:// 可玩、ui.js 全功能逐一手測零改變、SW 正常）✔
2. `AGENTS.md` 已隨每步同步（檔案地圖六檔、載入順序規則、三張區塊索引表、ASSETS 13、測試 52）。
3. 若使用者決定要合併：
   - 把 `BRANCH_TAG` 清空為 `''`；
   - 決定版本號（新功能建議 v2.3.0，需五處同步）並補 CODE-REVIEW／RELEASE-VALIDATION 文件；
   - 才進入實際 commit／PR 流程（目前仍未建立任何 commit，等使用者裁示）。
4. 若使用者對造型、加寬或分岔頻率有回饋（例如想調整機率、每關上限、或個別詐團造型的顏色/比例），可直接在此分支上微調，不需重新設計。

## 後記（2026-07-19）：手機實機驗收通過與工作區清理

1. **手機實機驗收通過**：使用者於 iPhone Safari／Android Chrome 實機測試多分支走道與詐團新造型的觸控體驗，回報通過。v2.3.0 至此無未結驗收項目。
2. **工作區清理**（本 commit）：
   - README／LICENSE／SECURITY-I18N／RELEASE-VALIDATION-v2.2.1 的 CRLF 換行雜訊以 `sed -i 's/\r$//'` 正規化——正規化後與 repo 內容完全一致，無需入版控。
   - `docs/ROADMAP.md` 2026-07-16 修訂版（路線圖對齊實際出貨）補提交。
   - v2.1 era 文件補進版控：`AUDIT-v2.1.0-independent.md`／`BACKLOG-v2.1.1.md`／`CODE-REVIEW-v2.1.0.md`／`WORKLOG-2026-07-15-cont-v2.2.md`。
   - AGENTS.md 待辦區更新：v2.3.0 全部收尾，無未結待辦。
