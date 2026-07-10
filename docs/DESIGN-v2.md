# v2.0.0 設計規格：行動裝置大改版

狀態：✅ 已全數實作並發佈（v2.0.0，2026-07-10）。α=轉置＋行動HUD、β=建造面板＋縮放、正式版=PWA＋效能。
三大決策（與維護者確認）：**① 直立轉置全圖＋可選縮放　② 點地彈出建造面板　③ PWA 一起上**

---

## 1. 版面模式（layoutMode）

以能力偵測驅動，不猜裝置型號：

| 模式 | 判斷 | 棋盤 | 內部解析度 |
|---|---|---|---|
| `desktop` | `pointer: fine` | 20×12 橫式 | 960×576 |
| `mobile-landscape` | `pointer: coarse` ＋ 橫向 | 20×12 橫式 | 960×576 |
| `mobile-portrait` | `pointer: coarse` ＋ 直向 | **12×20 直式** | **576×960** |

- JS：`matchMedia('(pointer: coarse)')` ＋ `matchMedia('(orientation: portrait)')`，變更時觸發 `relayout()`。
- CSS：對應三組樣式以 `body[data-layout]` 切換，不再只靠寬度斷點。

## 2. 棋盤轉置（核心）

- 常數改為變數：`COLS/ROWS` 由 layoutMode 決定；`W/H` 隨之。
- `genLevel(lv)` 一律在「主軸空間」（20 長 ×12 寬）生成路徑，直立時套 `(x,y)→(y,x)` 轉置後寫入 `S.path/S.grid`。同種子 → 同迷宮的轉置版，**排行榜分數可比，不分榜**。
- 中途轉向：`relayout()` 對場上狀態無損轉換——塔 `(gx,gy)` 互換、敵人與志工靠 `seg/prog` 不變、光束軸向互換、`buildGround()` 重建。轉換瞬間自動暫停 0.5s＋toast「視角已切換」。
- 直立格寬試算：360–430px 手機 ÷12 格 ≈ 30–36px/格；配合 UI 瘦身可全圖入鏡不捲動。

## 3. 縮放與平移（可選、非強制）

- **兩指**＝pinch 縮放（1×–2.5×）＋平移；**單指**＝遊戲操作。手勢絕不混用，避免誤蓋塔。
- 縮放狀態存 `view = {scale, ox, oy}`，繪製時 `ctx.setTransform`，點擊座標反矩陣換算。
- 雙擊空白處＝回到全圖（reset view）。桌機滾輪縮放為加分項。

## 4. 蓋塔互動：點地建造面板（手機）／商店列（桌機）

- **手機**：點空草地 → 該格出現幽靈塔座＋原地彈出建造面板（bottom-sheet 或環形，靠近手指），只列**已解鎖且買得起**的塔（圖示＋價格，48px+ 目標）；不足額的塔灰顯示價。點塔即蓋、點外側取消。點已蓋塔 → 同面板顯示升級/拆除。
- **兩段式確認**：選塔後先顯示射程圈預覽＋「✓ 確認」，再蓋——防誤觸、教學射程。
- **桌機**：保留現行「先選武器→點地」商店列，滑鼠流暢不動它。
- 14 顆武器列在 `mobile-*` 模式下隱藏，改為 HUD 上一顆「⚒ 建造說明」入口（含各塔圖鑑）。

## 5. 特種支援與 HUD（手機）

- 支援 3 顆改**懸浮按鈕**直式貼右緣、橫式貼下緣拇指熱區，56px、含 CD 環形進度。
- HUD 壓成單行：`🚩12/87 ❤️15 💛×3 🪙194 ⭐105`，速度/暫停/音效收進右上「⋯」摺疊鈕。
- 安全區：`env(safe-area-inset-*)` 全面套用（瀏海、Home indicator）。

## 6. PWA

- `manifest.webmanifest`：name/short_name（防詐迷宮）、`display: standalone`、`orientation: any`、theme/background `#1b1b2f`、icons 192/512（像素盾牌，SVG 轉 PNG）＋ maskable。
- `index.html` 掛 manifest；SW 的 ASSETS 納入 manifest 與 icons；CSP `manifest-src 'self'`。
- 首次遊玩過第 3 關後出現一次性「加入主畫面」提示（respectful，可永久關閉）。

## 7. 行動效能

- DPR 上限 2；`mobile-*` 粒子量減半、草刃密度 −30%（離屏地面已就緒）。
- 目標：中階 Android（4 年內機型）穩定 50fps+。

## 8. 測試計畫（vm 可自動化的部分）

1. 轉置等價性：87 關 `path_portrait[i] == transpose(path_landscape[i])`，格數、連續性、頭尾相同。
2. 中途轉向無損：任意時刻 relayout 前後 `kills/hp/coins/塔數/敵 seg` 不變。
3. 點擊映射：縮放平移矩陣下 20 個隨機點正反變換誤差 <0.5px。
4. 建造面板規則：只列已解鎖塔、買不起灰顯、確認前不扣款。
5. 迴歸：既有 A–F 全套在兩種棋盤方向各跑一次。
6. 人工實測清單：iPhone Safari／Android Chrome 直橫切換、pinch、瀏海遮擋、PWA 安裝。

## 9. 實作順序（建議三段 push，各自可獨立驗收）

1. **v2.0.0-α**：layoutMode＋棋盤轉置＋HUD/支援鈕行動版（不動蓋塔互動）——先解決「看得清、點得到」。
2. **v2.0.0-β**：點地建造面板＋兩段式確認＋pinch 縮放。
3. **v2.0.0**：PWA＋效能調校＋全量測試＋README/截圖更新（補直式截圖）。

## 10. 風險備忘

- 手勢衝突是最大坑：pinch 與 tap 判定要以 pointer 數量硬切，加 8px tap-slop。
- 轉置後「光束橫掃」在直立改為由上而下掃，i18n 文案不需改（未寫死方向）。
- 舊玩家肌肉記憶：桌機零改動；手機首次進入顯示 3 步教學浮層（i18n ×4）。
- 版本策略：α/β 也要 bump SW CACHE，避免混版資產。
