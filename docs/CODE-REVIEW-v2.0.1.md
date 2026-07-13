# 防詐迷宮 v2.0.1 複審與基準測試報告

- 複審版本：v2.0.1
- 複審日期：2026-07-12
- 對照基準：`docs/CODE-REVIEW-v2.0.0.md`
- 審查方式：逐項原始碼比對、Node 回歸測試、VM 語意探針、本機 PC 瀏覽器互動測試
- 結論：v2.0.0 的主要邏輯與 PWA 問題大多已修復，但 v2.0.1 尚不能判定為「零已知 bug」

## 一、總結

v2.0.1 不是只修改版本號。程式已加入遊戲 phase／轉場 token、冪等結算、跨幀碰撞、slow/stun 分離、轉向狀態保存、RAF 生命週期、Service Worker 快取隔離、數值消毒、PWA 提示修正、鍵盤語意及自動測試。

對照 v2.0.0 報告的 10 項高／中風險問題：9 項確認修復，1 項「鍵盤與螢幕閱讀器操作」只完成結構性修補，實際 PC 操作仍被每幀焦點搶奪破壞。

此外，本次確認一項 PC 右鍵誤操作 bug：滑鼠右鍵會被當成左鍵送進遊戲，實測可直接蓋塔。

## 二、v2.0.0 問題對照表

| 編號 | v2.0.0 問題 | v2.0.1 狀態 | 驗證 |
|---|---|---|---|
| H-01 | 過關轉場可重入、重複結算 | ✅ 已修復 | phase／transition token；本機過關時按鈕 disabled，僅前進一關 |
| H-02 | SW 刪除同 origin 其他應用快取 | ✅ 已修復 | `CACHE_PREFIX` 限定；VM 驗證只刪 `asmd-v2.0.0`，保留 foreign cache |
| M-01 | 三倍速投射物／光束漏判 | ✅ 已修復 | projectile travel clamp、beam swept interval；回歸測試通過 |
| M-02 | slow/stun 互相覆寫 | ✅ 已修復 | `slowLeft/slowPct` 與 `stunLeft` 分離 |
| M-03 | 轉向遺失投射物、光束與手動暫停 | ✅ 已修復 | VM 驗證座標轉置、beam 軸切換、manual pause 保留 |
| M-04 | PWA 背景更新可能長期拿舊版 | ✅ 已修復 | 精確 query match、限定本版 cache、`cache.put()` 納入 waitUntil |
| M-05 | 核心遊戲無法使用鍵盤／螢幕閱讀器 | ⚠️ 部分修復 | 已有 canvas 語意、方向鍵與 dialog；但執行中焦點每幀被搶回 canvas |
| M-06 | 雙擊只判斷時間、第一擊先執行 | ✅ 已修復 | 延後單擊；時間、距離、倍率、空白格均有測試 |
| M-07 | 手機第一關提示錯誤 | ✅ 已修復 | 四語提示區分手機與桌機 |
| M-08 | game over 後同幀仍可加分 | ✅ 已修復 | `S.over` 後立即結束該幀；回歸測試通過 |

v2.0.0 報告所列低風險項目中，PWA「之後再說」、meta CSP、`pointercancel`、Infinity、RAF、Google Fonts 外連、測試／CI 缺口及損命刷獎勵均已看到對應修補或測試。

## 三、v2.0.1 已確認問題

### M-201-01 遊戲主迴圈每幀搶回 canvas 焦點

**證據**

- `game.js:710` 在每次有效遊戲幀結尾執行 `cv.focus({preventScroll:true})`。
- `game.js:575-578` 在 setup／wave 階段持續排程 RAF，因此焦點會持續被拉回。
- 現有 accessibility 測試只確認 HTML 語意和函式字串存在，沒有驗證真實 Tab 焦點流。

**PC 實測**

1. 暫停時點擊 Store Clerk，`document.activeElement` 正常是塔按鈕。
2. 恢復遊戲後，焦點立即變成 `#cv`；250ms 後仍是 `#cv`。

**影響**

鍵盤使用者在遊戲執行時無法穩定 Tab 到塔商店、速度、暫停、靜音或支援按鈕。這使 v2.0.1 宣稱的鍵盤操作只完成棋盤部分，核心流程仍不完整。

**建議**

移除主迴圈中的每幀 `focus()`；只在開始遊戲、使用者主動選塔／支援後，或明確要求返回棋盤時聚焦一次。新增瀏覽器測試：遊戲執行中 Tab 到任一 HUD／商店按鈕，等待至少兩個 animation frame 後焦點不得改變。

### M-201-02 PC 右鍵會被當成左鍵操作

**證據**

- `game.js:1534-1553` 的 `pointerdown` 沒有檢查 `ev.button` 或滑鼠主按鍵。
- `game.js:1578-1595` 的 `pointerup` 會把該 pointer 送入正常 tap 流程。
- 專案沒有 `contextmenu` handler。

**PC 實測**

選取 Store Clerk 後，在可建造草地按滑鼠右鍵，點數由 120 變成 80，證明右鍵實際蓋出一座 40 點的塔。

**影響**

右鍵不只會顯示瀏覽器選單，也可能誤建塔、選塔，或在支援瞄準模式消耗長 CD 技能。

**建議**

只在遊戲 canvas 上處理：

1. `contextmenu` 呼叫 `preventDefault()`，避免遊戲中彈出瀏覽器選單。
2. `pointerdown` 對滑鼠要求 `ev.button === 0`，非左鍵直接忽略；`pointerup` 可再做防禦性檢查。
3. 不要封鎖整個 `document` 的右鍵，保留開始畫面、說明、文字輸入與一般瀏覽器功能。
4. 新增回歸測試：右鍵後 towers、coins、support cooldown、selection 均不得改變。

## 四、其他殘餘問題

### L-201-03 非中文介面的 tooltip 與切換控制語意仍不完整

- `index.html:67-88` 與塔按鈕的 `title` 仍為中文。
- `game.js:1833-1872` 切換語言時只更新可見名稱、canvas label/help，沒有更新 HUD／塔／支援 tooltip。
- 速度、暫停、靜音等切換控制沒有維護 `aria-label`／`aria-pressed`。

本機英文介面中，HUD 的可存取標籤仍顯示中文「關卡／民眾信任／生命」等文字。

### L-201-04 主要／危險按鈕文字對比仍低於 WCAG AA

- `style.css:7-9,50,63-64` 使用 `#f4f1e8` 文字搭配 `#26a269` 綠色或 `#ef476f` 紅色背景。
- 實算對比分別約為 2.88:1 與 3.21:1，低於一般文字所需的 4.5:1。

### L-201-05 大霧事件中，被動塔實際範圍與畫面射程圈不一致

- `game.js:273` 的里長 buff 與 `game.js:346` 的志工轉化使用未乘 `S.mod.range` 的原始射程。
- `game.js:961,980` 的畫面射程圈則會乘上大霧倍率。

大霧關卡中，畫面顯示的範圍較小，但被動效果仍可在圈外生效。若被動塔刻意不受大霧影響，應改畫面與文案；否則判定也應套用相同倍率。

## 五、基準與重複測試結果

### 自動測試

- `npm test`：23/23 通過。
- 完整測試共執行 22 輪：506/506 通過，0 failure、0 skipped。
- 其中 20 輪連續重跑平均約 812ms／輪，沒有發現偶發失敗。
- Node 版本：v22.23.1。
- `game.js`、`i18n.js`、`sw.js`、測試檔語法與 package／manifest JSON 均通過。

### 額外語意探針

- SW activate：只刪除本遊戲舊 cache，foreign cache 保留。
- relayout：敵人、投射物與光束正確轉置，玩家手動暫停保留。
- 過關實測：第 1 關轉場期間下一波 disabled；轉場後只進入第 2 關一次。
- 瀏覽器執行期間未記錄到 console error／warning。

### 限制

- 本環境未完成斷線後重新載入的離線啟動驗證；SW 程式與語意探針已通過，但仍建議在正式 HTTPS 或 DevTools Offline 模式補測。
- 未進行真機 iPhone Safari、Android Chrome、螢幕閱讀器及長時間 50fps 壓力測試。
- 工作目錄沒有可用的 Git repository metadata，無法確認 v2.0.1 tag／commit 與線上部署內容完全一致。

## 六、發行判定

v2.0.1 已大幅改善並修復 v2.0.0 的主要狀態機、PWA 與資料完整性問題，但目前仍有兩項可重現的 PC／鍵盤互動 bug，因此本次不能給出「零已知 bug」或完全通過的結論。

建議先修正 M-201-01 與 M-201-02，為兩者補上瀏覽器層回歸測試，再重跑相同 22 輪基準；通過後才進行實機與正式離線驗收。
