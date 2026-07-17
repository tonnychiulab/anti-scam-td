# CODE-REVIEW — v2.3.0

> 審查者：Claude Code（實作者自審 + 逐項驗證腳本）。基底：`main@5281af8`（v2.2.1）。
> 分支：`agent/maze-visuals-and-bloat-review`。變更分四批，各自經使用者瀏覽器人工驗收。

## 變更總覽

| # | 變更 | 性質 | 主要檔案 |
|---|---|---|---|
| 1 | 走道加寬（戰術寬巷） | 玩法 | game.js（`genWideShoulders`）、render.js |
| 2 | 詐團圖示多樣化（5 種專屬造型） | 視覺 | render.js（`SCAM_BODY` 分派表） |
| 3 | 多分支走道（每關最多 2 岔口／4 條路線） | 玩法 | game.js、combat.js |
| 4 | 六檔架構重整（單檔 3263 行 → 六檔） | 架構 | 全部 JS + index.html + sw.js + tests |

## 1. 走道加寬

- `genWideShoulders(cells, rng, blocked)`：長水平段（≥3 格、非首尾）45% 機率展開 2 格寬，每關上限 2 段；候選列出界或撞中心線／支線即換側或放棄，不強迫。
- **敵人移動零改動**：路肩只進 `S.grid`（擋建塔）與地面繪製，`S.path` 不變。
- 種子 `RNG(lv*40503+777773)` 與其他種子互不干擾，維持同關同迷宮。
- 繪製以鄰接判斷省略貼中心線側的綠邊，避免寬巷接縫。

## 2. 詐團造型

- `SCAM_BODY` 分派表 + 5 個造型函式 + `drawGenericScamBody` fallback（未來新增 `ETYPES` 不會爆）。
- 全部沿用既有像素慣例（`fillRect` 為主、多邊形為輔，無 arc）。
- Boss 的 RGB 錯位故障色條遵守 `uxPrefs.reduceMotion`。
- `shop` 的 face 由 `¥` 改 🛍，消除與 `invest` 的 `$` 語意重疊；確認 `.face` 僅 `drawEnemy` 讀取，i18n 不受影響。

## 3. 多分支走道

- `genBranchRoutes`：主線水平段（≥3 格）55% 機率岔出，隔 1 格平行繞行再併回；岔口中間留草地可蓋塔。每關最多 2 段，支線間、與中心線間不重疊。種子 `RNG(lv*15859+424243)`。
- `buildRoutes`：主線＋支線展開為最多 4 條完整路線；`routes[0]` 恆為主線，`S.path` 指向它——路線導引、起終點、既有繪製零改動。
- 敵人出生等機率抽路線（`e.ri`）；`moveEnemy`／`enemyPathProgress`／`rewindEnemy`／志工反向行走全部讀自身路線。擊退只減 `e.seg`，位置沿自身路線重算，自動相容。
- `relayout()` 直橫轉置涵蓋 `S.routes`／`S.branchCells` 並重建 grid。
- **審查取捨**：路線查詢 `(S.routes && S.routes[e.ri]) || S.path` 刻意內聯、不抽共用 helper——`tests/release.test.mjs` 以 `extractFunction` 抽單一函式進 vm 沙箱執行，函式必須自足（程式碼已註解）。
- 逐關驗證（獨立腳本，`MAJ=20/MIN=12` 與棋盤一致）：33 關 1 段、21 關 2 段、33 關無；全部路線起終點同主線、每步相鄰 1 格、無重複經過、不出界、不壓中心線、路肩不壓支線。

## 4. 六檔架構重整

- 動機：game.js 3263 行單檔（151 個頂層函式，最大 169 行——函式層級健康，肥在檔案層級）。
- 唯一可行刀法：**多個傳統 `<script>` 共享全域**（`file://` 預覽是專案工作流，ES modules 被 CORS 擋；零建置工具是鐵則）。
- 切法（原封搬移零改寫）：`data.js`（資料表）→ `render.js`（繪圖＋造型＋`cv`/`ctx`）→ `combat.js`（波次/敵人/塔/投射物/粒子/制裁技）→ `ui.js`（HUD/面板/互動/選單/商店/排行榜/語言/畫面/PWA）→ `game.js`（核心 1032 行）。
- **載入順序規則**（寫入 AGENTS.md）：後載檔可在頂層引用先載檔全域；反向只能在函式內。
- 載入順序冒煙測試（Proxy stub DOM）抓到並修復兩個瀏覽器必白屏的錯：
  1. `cv`/`ctx` 宣告移至 render.js（ui.js 頂層對 canvas 掛事件）；
  2. 初始 `applyI18n()` 呼叫移至 game.js 尾端（ui.js 載入時 `L()` 未定義）。
- 跨檔頂層名稱掃描：無重複宣告（重複會直接 SyntaxError，Node 單檔 `--check` 抓不到）。
- 測試配套：`gameSource` 依載入順序串接五檔、語法檢查納入全部 JS、SW 預快取斷言 13 項、PWA 測試 `sourceBetween` 終點錨改為檔頭橫幅。48 → 52 項全綠，**既有斷言零弱化**。

## 風險與殘留

- 視覺／觸控最終品質仰賴人工驗收——已完成四輪桌面瀏覽器驗收（含 file://、localhost SW、離線快取供應、ui.js 全功能手測）；**手機實機驗收仍待做**（列入 AGENTS 待辦）。
- CRLF 換行雜訊（README 等 5 檔整檔異動、內容相同）刻意不入本次 PR。
- `BRANCH_TAG` 機制保留（平時空字串），供未來分支測試重複使用。
