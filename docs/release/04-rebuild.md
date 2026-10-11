# Task 04 可重建共同基線

狀態：`04_READY_FOR_RE_REVIEW`。只交付04修復，05–19均未啟動。此包不是後續實作授權，不得自行commit、push或部署，不操作玩家存檔。

指定base：`1e2ac7e891835e85f9f31b02a1166cd99f9cbb52`。契約：`BASE_CONTRACT_V1.1`；內容：`integrated-v2-r2-feedback02-B`。

## 重建

需要Git與Node.js 22.12以上。解壓交付ZIP後，在包含`base.bundle`、`manifest.json`、`rebuild.mjs`的目錄執行：

```powershell
node rebuild.mjs restore . ../task04-rebuilt
node rebuild.mjs verify ../task04-rebuilt
```

目的目錄必須不存在。腳本先核對包內每個檔案，再從內含bundle建立獨立repository、checkout指定base、覆蓋交付檔案，最後核對完整相對路徑manifest。它不連線GitHub、不讀原機專案或外部規劃目錄，也不reset既有工作樹。

bundle包含指定base；overlay包含必要未追蹤檔、修改與換行位元組差異。原規劃與修正指令已納入`docs/release/planning/`；包內快照為此次交接依據，外部原件未修改。`04-manifest.json`列重建後全部受管檔案，自身雜湊由包根`manifest.json`記錄，避免循環雜湊。node_modules、dist、測試截圖、玩家存檔不打包。

重建後，依lockfile安裝並驗證：

```powershell
cd ../task04-rebuilt
npm.cmd ci
npm.cmd test
npx.cmd --no-install tsc --noEmit
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1 --port 5187 --strictPort
```

另一終端在重建目錄執行`$env:GAME_URL='http://127.0.0.1:5187'; npm.cmd run test:browser`。瀏覽器回歸需要本機Chrome；使用新headless contexts，不使用玩家profile。依賴安裝需要npm registry或完整npm cache，交付包不包含第三方套件快取。

## 新 agent 必讀順序

以下路徑均相對於**重建專案根**：

1. `docs/release/04-context.md`：有效授權、對話規則及00可追溯摘要。
2. `docs/release/04-contracts.md`與`04-manifest.json`：本次修復、接口、限制與驗證證據。
3. `docs/release/requirements-r2.md`、`01-*`、`02-*`、`03-*`：必要規劃。
4. `docs/release/planning/ROADMAP.md`、`DISPATCH.md`、`TASK_INDEX.json`與相應工單：owner與白名單。文件內早期G1_PENDING／111項紀錄是歷史，以04本次交接為準。

不得只checkout舊base或只拿Git diff，因為那會遺漏未追蹤的04契約與規劃。重建PASS不等於04重新驗收通過，更不等於已放行05–19。

## 重新封裝

在確認HEAD仍為指定base、所需文件已齊備的專案根執行`node scripts/task04-baseline.mjs pack .tools/new-task04-package`。輸出目錄必須不存在。此命令更新專案manifest並建立bundle與overlay，不建立commit。修改交付後須重新封裝及隔離重建核對，不可沿用舊ZIP的雜湊。
