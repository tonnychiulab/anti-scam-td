# 工作日誌（補記）：2026-07-15 續 — v2.2.0 / v2.2.1

> **為何補這一篇**：當日主日誌 [`WORKLOG-2026-07-15.md`](./WORKLOG-2026-07-15.md) 於 14:31 撰寫，內容止於 v2.1.2，並記「今天沒有 commit」。其後同一天實際又完成並提交了 **v2.2.0（制裁技）** 與 **v2.2.1（安全強化）**，但未留下日誌。本檔於 2026-07-16 依 git 紀錄與既有設計／驗證文件回填，接上斷掉的紀錄。

## 當日完整提交線（git log）

```
7b11cf2  Harden v2.2.1 release            ← 安全強化（在 agent/v2.2.1-hardening）
69b2b9a  Release v2.2.0 enforcement skills（與 7ff426a 內容相同，另一分支的等價提交）
b2e90ac  Release v2.1.2 combat clarity fixes
3f77312  Release v2.1.1 mobile UX fixes
```

註：`agent/v2.2-enforcement-skills` 的 `7ff426a` 與 `agent/v2.2.1-hardening` 的父提交 `69b2b9a` 為**內容完全相同**的兩個 v2.2.0 提交（`git diff` 無差異）。因此 v2.2.1 = v2.2.0 + 安全強化，屬乾淨線性，無分歧需處理。最完整、含安全修補的主線為 **`agent/v2.2.1-hardening`**。

---

## v2.2.0 — 制裁技與命中停格演出

依據 [`DESIGN-v2.2-enforcement-skills.md`](./DESIGN-v2.2-enforcement-skills.md)，驗證見 [`RELEASE-VALIDATION-v2.2.0.md`](./RELEASE-VALIDATION-v2.2.0.md)。

- **新敵人「詐騙車手」**（`ETYPES` 索引 5）：第 6 關起加入一般波次，後期 Boss 波可伴隨少量車手。高速、中低血量、漏怪傷害較高（HP 42／速度 82／獎金 12／分數 30／漏怪 2）。
- **三項制裁技**（沿用支援技能列與冷卻，不占地圖格、不進建塔／升級／拆除流程）：
  - 絆倒車手（Lv.6／35 秒）：優先鎖定車手，否則鎖定最快非 Boss；`25 + 關卡×2` 傷害、後退 3 格、暈眩 2.2 秒。
  - ATM 守護（Lv.14／60 秒）：指定半徑 110 區域，抓住最大生命最高者；非 Boss 造成最大生命 35% 傷害或低血直接制裁，Boss 僅 10%。
  - 爆破詐騙機房（Lv.24／90 秒）：指定半徑 130 區域，非 Boss 一次 KO，Boss 受最大生命 30% 傷害並暈眩 2 秒。
- **命中停格 180／260／420ms**：停格只凍結戰場模擬（敵人、投射物、冷卻、波次倒數），暫停與音效等介面仍可操作；同時只允許一段停格；切關／重玩／結束會清除停格狀態。停格後接短慢動作看清制裁。
- 三技各有像素演出（倒地摩擦、ATM 機甲夾取、機房斷電爆破），四語名稱／說明／範圍預覽／命中短句補齊。手機橫式技能列可水平捲動。
- **無障礙**：減少動態時停格上限縮為 100ms、停用震動與強位移；減少閃光改用溫和暖色外框；精簡特效減量但不省略範圍、結果與命中文字。

**測試**：`npm test` 44／44 通過；最終連跑 3 輪 44／44。Edge headless 冒煙測試通過（6 個支援按鈕、絆倒／ATM／爆破數值與冷卻正確、0 例外）。

---

## v2.2.1 — Hardening（安全強化）

依獨立審查四項 P1，驗證見 [`RELEASE-VALIDATION-v2.2.1.md`](./RELEASE-VALIDATION-v2.2.1.md)。**不動戰鬥平衡、關卡、制裁技或既有操作流程。**

1. **Service Worker 預快取容錯**：`cache.addAll` 改為逐檔 `cache.add` + `Promise.allSettled`，單檔失敗只警告、不使整次安裝失敗。
2. **排行榜寫入淨化**：名稱／分數／關卡／時間在寫入 localStorage 前統一轉為安全範圍整數／字串（`Infinity`、`NaN`、負數、超關卡上限會被清成安全值）。
3. **動態多語字串轉義**：新增 `escapeHtml()`（game.js 第 2727 行）；建塔選單塔名與圖示、排行榜空白訊息與關卡標籤、結算提示插值在進入 HTML 模板前一律轉義，防 XSS。
4. **多語 HTML 信任政策**：新增 [`SECURITY-I18N.md`](./SECURITY-I18N.md)，明列允許 HTML 的白名單欄位與標籤，禁 `<script>`／`<iframe>`／`javascript:`／`data:`／事件屬性。

**測試**：`npm test` 由 44 增至 **47／47 通過**，新增涵蓋排行榜淨化、HTML escape、四語受信任 HTML 白名單與危險標籤禁令、SW 單資源失敗仍完成安裝。全新 Chrome profile／本機 HTTP 實機驗證：版本顯示 v2.2.1、SW 快取 `asmd-v2.2.1`、9 個 app-shell 資源齊全、注入 `img/onerror` 只呈現文字、`Infinity` 分數被清成 0、關伺服器後仍可離線開啟、0 未捕捉例外。

---

## 目前 Git 與部署狀態（截至 2026-07-16 回填時，已驗證）

- **`origin/main`（`5281af8`「Harden v2.2.1 release (#6)」）已是 v2.2.1**，內容與本機 v2.2.1 tip `7b11cf2` 完全相同，含 `SECURITY-I18N.md` 與 `LICENSE`（MIT）。v2.2.1 早已透過 PR #6 合併主線。
- **線上部署已是 v2.2.1**：<https://tonnychiulab.github.io/anti-scam-td/> 以防快取參數實測，credit 顯示 v2.2.1、特種支援列六項齊全（含絆倒車手 Lv.6／ATM 守護 Lv.14／爆破詐騙機房 Lv.24）。（首次 web fetch 曾回舊快取 v2.0.0-b1，加防快取參數後確認為 v2.2.1。）
- 遠端分支：`origin/main`、`origin/agent/v2.2.1-hardening`（`7b11cf2`）、`origin/agent/v2.2-enforcement-skills`（`7ff426a`，v2.2.0 等價）等皆在。
- **本機工作資料夾**停在舊分支 `agent/v2.2-enforcement-skills`（v2.2.0），未對齊 main；並有殘留 `.git/index.lock` 與失效 worktree `C:/tmp/anti-scam-td-v2.2.1-hardening`（prunable）。
- 本機 `LICENSE` 顯示刪除，但**那是未提交、未 push 的本機雜訊**；`origin/main` 的 MIT LICENSE 完好，無實際授權問題。

## 下次接續點（皆為本機整理，不影響已上線版本）

1. 在自己的終端機清掉殘留 `.git/index.lock` 與失效 worktree，再 `git checkout main && git pull` 讓工作資料夾對齊 v2.2.1。
2. `LICENSE`：`git checkout -- LICENSE` 還原本機刪除即可（main 上本就有）。
3. 若要把新加的 `AGENTS.md`／`CLAUDE.md`／本 WORKLOG 納入上游，另開 PR。
4. 安排實體 iPhone Safari／Android Chrome 觸控、震動、PWA 安裝人工驗收。

## 尚存邊界

- 制裁技與詐騙車手的實機觸控手感、震動強度、效能降級主觀流暢度尚未在真實 iOS／Android 完成人工驗收（不影響現有自動判定與桌面冒煙測試）。
- 舊版 Service Worker 首次升級時使用者可能仍需重整一次。
