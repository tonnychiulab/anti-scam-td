# RELEASE-VALIDATION — v2.3.0

> 基底：`main@5281af8`（v2.2.1）。分支：`agent/maze-visuals-and-bloat-review`。
> 內容：走道加寬＋詐團造型多樣化＋多分支走道＋六檔架構重整。

## 自動測試

- `npm test`：**52/52 通過**（v2.2.1 時 47 項；本版 +2 語法檢查子測試×新檔、+其餘既有測試隨拆檔調整而擴充斷言）。
- 版本五處同步驗證通過：`game.js` `APP_VERSION`＝`package.json`＝`sw.js` CACHE＝`index.html` credit＝`i18n.js` 四語 credit＝**v2.3.0**。
- `node --check`：game.js／data.js／render.js／combat.js／ui.js／i18n.js／sw.js 全過。
- SW 預快取斷言：13 項 app-shell（+data.js +render.js +combat.js +ui.js），單檔失敗仍完成安裝（無 `addAll`）。

## 獨立驗證（非測試套件、scratchpad 腳本）

- **87 關支線掃描**（`MAJ=20/MIN=12` 與棋盤一致）：33 關 1 段支線、21 關 2 段、33 關無；所有組合路線起終點同主線、逐步相鄰、無重複經過；支線不出界、不壓中心線、支線間不重疊；路肩不壓支線。
- **跨檔重複宣告掃描**：六檔頂層 `const/let/var/function` 名稱無衝突。
- **載入順序冒煙**：i18n → data → render → combat → ui 頂層依序執行成功（Proxy stub DOM），跨 script 全域可見性確認（TOWERS 13／ETYPES 6／SUPPORT 6／SCAM_BODY 5 鍵／combat・ui・render 代表函式全部就位）。

## 人工瀏覽器驗收（使用者，桌面）

| 輪次 | 範圍 | 結果 |
|---|---|---|
| 1 | 走道加寬自然度、路肩接縫、5 種造型辨識度、手機轉向保留、分支標記 | ✅ 全過 |
| 2 | 多分支：岔口外觀、敵人分流、岔口草地蓋塔、志工沿支線走回、轉向保留 | ✅ 全過 |
| 3 | B-lite 拆檔：file:// 可玩、外觀零改變、SW 快取（105 bytes 傳輸／500 kB 快取供應） | ✅ 全過 |
| 4 | 完整拆檔：file:// 可玩、ui.js 全功能逐一手測（建造/塔選單/商店/排行榜/語言）零改變、SW 命中正常 | ✅ 全過 |

補充：`file://` 下 CACHE 無數值為預期（SW 需 https/localhost）；localhost 線上 `CACHE 29%` 為 network-first 設計使然（HTML/JS/CSS 線上必 miss 以確保成套更新）。

## 發布前檢查清單

- [x] `npm test` 綠燈（52/52）
- [x] 版本五處同步 v2.3.0
- [x] `sw.js` CACHE 升版（`asmd-v2.3.0`，合併部署後玩家自動汰換舊快取）
- [x] `sw.js` ASSETS 13 項含四個新檔
- [x] `BRANCH_TAG` 已清空為 `''`
- [x] 免責聲明未動（四語 credit 僅版本字樣更新）
- [x] 無站外資源、無新依賴、相對路徑未變
- [x] `escapeHtml`／XSS 白名單政策未變（`escapeHtml` 移至 ui.js，`SECURITY-I18N.md` 政策本身無變更）
- [x] AGENTS.md 與 WORKLOG 同步

## 已知未完成

- 手機實機（iPhone Safari／Android Chrome）驗收多分支走道與新造型觸控體驗（桌面模擬已過）。
- CRLF 工作區雜訊（README／LICENSE／ROADMAP／SECURITY-I18N／RELEASE-VALIDATION-v2.2.1）與 v2.1 era 未進版控文件，另行處理、不入本 PR。
