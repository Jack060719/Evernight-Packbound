# Task 02｜檔案責任與交接提案

> 2026-10-08 狀態更新：使用者已明確核准 G1，本輪只完成 Task 04。B掉率及15/10/5仍是首輪實測候選；prepared 55/50裝位、20寵位與95%目標納入驗收。本文保留提案歷程，文內整體G1／04授權的舊時點描述由本註覆蓋；不覆蓋已排除功能，也不代表S/C替代方案獲採用或測試已通過。凍結API、實作範圍與證據見 [04交接](04-contracts.md)；05–19仍未啟動。

版本 `integrated-v2-r2`／`G1_PENDING`；exact base `1e2ac7e891835e85f9f31b02a1166cd99f9cbb52`。已讀完整且經使用者接受的 Task 00 回報、2026-10-06修正指令及01–03草稿。本文件不派工實作，路徑須G1後由04核實凍結，不代表模組已存在。

`G1-feedback-02`（2026-10-08）：裝備倉庫60件已確認；寵物30隻仍是D07候選、背包48格不跟調。各進度成熟刷關與掉率由01提案、03獨立核對，02只同步契約／保存容量。原型共用`CAPACITY=30`的程式不在本輪修改，也不能未來直接改60而連帶擴寵物。掉率、95%驗收門檻仍待G1，不增加owner、API、schema或DAG依賴。

## 1. 本輪實際寫入邊界

| owner | 唯一可寫規劃文件 |
|---|---|
| 01 | `docs/release/01-design.md`、`01-tables.md`、`01-ui-sketches.md`；02/03 只提註記，不代改 |
| 02 | `docs/release/02-contract-proposal.md`、`02-file-ownership.md`、`02-save-plan.md` |
| 03 | `docs/release/03-test-plan.md`、`03-fixture-plan.md`；01/02 只提註記，不代改 |
| root | `docs/release/requirements-r2.md`、專案`ROADMAP.md`入口；整合包`ROADMAP.md`、`TASK_INDEX.json`、`DISPATCH.md`、20份tasks與`reference/BASE_UPGRADE.md`來源標記。僅規劃寫權，不授權04或遊戲工程 |

所有代理讀00，不得將01提案當批准，以同一 `integrated-v2-r2` 交叉核對。root唯一更新ROADMAP／TASK_INDEX／受影響工單與需求映射；02只交責任差異，不代改。此次不寫code／tests／玩家存檔，不commit／merge／push／部署。BASE_UPGRADE只來源，不先執行。

## 2. 唯一共享 owner：04／14（前後同一角色）

現有檔案 `engine/types/content/save/main/ui/style` 與 `battle.ts` 已在 00 核實；新目錄不存在不是缺失，需要 G1 後才建立。04 和 14 是時間先後的同一整合責任，不是兩個人同時持有寫入權。

| 路徑／資產 | 唯一寫入 owner | 其他任務如何合作 |
|---|---|---|
| `src/game/engine.ts`、`types.ts`、`content.ts` | 04→14 | 葉模組列 export/接線請求，不能自行改共享 facade |
| `src/save.ts`、`src/main.ts`、`src/ui.ts`、`src/style.css` | 04→14 | schema、保存入口、生命週期、全域掛載與樣式由此集中處理 |
| `src/clock.ts`、`src/audio.ts`（既有） | **推薦白名單補充：04→14** | 新暫停／事件語義確有需要才改；11 提音效映射請求。整合包沒有列出這兩檔，須 G1/04 清楚接受補充，不視為葉 owner 權限 |
| `src/game/contracts/*.ts` | 04→14 | 04 建立 `ids/state/commands/events/combat/transactions/ports` 最小分檔；依實際需要少分檔，不為每一型別建立檔案 |
| `src/game/registries.ts` | 04→14 | 唯一內容表、ports 與 renderer manifest 裝配點 |
| `src/game/systems/reward-resolution.ts` | 14 | 只一套正式 sampler，09 純資料、13 消費計畫 |
| `tests/release/contracts.test.ts`、`save-legacy.test.ts`、`integration-*.test.ts` | 04→14 | 03 規劃但不寫測試；葉 owner 使用共同 fixtures，不改合約 expected 值掩蓋問題 |
| `tests/release/fixtures/*`（推薦補充） | 04→14 | 固定種子、跨模組只讀樣本、port stubs；必須與 03 命名／欄位核對 |
| `tests/rules.test.ts`、`lifecycle.test.ts`、`save-repair.test.ts` | 04→14 | 現有回歸保留；規則變更依核准差異更新，不刪測試隱藏退步 |
| `scripts/browser-test.mjs` | 04→14 | 10/11 可提出新 selector/fixture 請求；只由整合者更新正式回歸入口 |
| `package*.json`、`tsconfig.json`、`vite.config.ts` | 預設不改；確有必要由 04/14 提變更理由 | 本提案不需外部套件；不把一般依賴升級混入正式版功能 |

DB schema 與遊戲 schema 版本、migration report／內容版本的註冊、正式測試 fixture 版本都在同一 owner。即使葉模組新增需保存欄位，也只交 field mapping，不直接 write localStorage／IndexedDB。

容量交接差異：04/14凍結裝備60與寵物獨立上限，07共用淨容量預驗，10顯示`目前件數/60`且已裝備不計，13維持第61件待領地物，03規劃59／60／61邊界與舊30件完整遷移。掉率值只由09同版核准內容表供14 sampler；01/03紙算與未來15引擎實測報告分列，任何極速深關壓力假設不得在owner交接時變成已批准的全域表。以上是既有責任的補註，不啟動04或任何葉實作。

## 3. 05–13 白名單與接口責任

以下 `systems/` 完整前綴均為 `src/game/systems/`。每項使用自身工單範圍；額外路徑需先移交，不能以所在資料夾相同推定共用寫入權。

| 任務 | 唯一可寫程式／資料 | 專屬測試 | 跨 owner 接口 |
|---|---|---|---|
| 05 戰鬥 | `combat/{effects,triggers,damage,queue}.ts`、`pet-growth.ts`、`pet-cooperation.ts` | `tests/release/combat-*.test.ts`、`pet-growth.test.ts` | 唯一primary／extra／proc與hit cursor／crit／實傷吸血／機制執行；消費12純stat與gem mechanics；每impact outcome交14，提供07成長重算 |
| 06 世界營地 | `world.ts`、`stage-flow.ts`、`camp.ts` | `world-*.test.ts`、`camp-*.test.ts` | 70關世界／挑戰／必要選擇，持久重打設定與執行gate分開，消費13逐件離關進度；不擴pause enum或發獎 |
| 07 庫存經濟 | `inventory.ts`、`synthesis.ts`、`salvage.ts`、`resource-transactions.ts` | `inventory-*.test.ts`、`synthesis-*.test.ts`、`salvage-*.test.ts` | 12退寶石／升質、05寵物重算；給08/13容量與placement port；只plan不保存 |
| 08 收藏配裝追蹤 | `collection.ts`、`loadouts.ts`、`loot-tracking.ts` | `collection-*.test.ts`、`loadouts-*.test.ts`、`loot-tracking-*.test.ts` | equipment／gem來源、owned分庫存／嵌入、缺同品項材料／粉塵／指定gem，07/12共同成本投影；永久最高品質／級別／寵物成長歷史由事件計畫同交易更新；09不另建查詢runtime |
| 09 內容資料 | `src/game/content/{regions,stages,enemies,gear-effects,pet-cooperation,pet-milestones,loot-tables,challenges,collections,affixes,gems,economy}.ts` | `content-validation.test.ts` | 最低7區×10關×10波、最多5敵、區域橫向裝備、純數值affix／機制gem／挑戰／來源與legacy表；無RNG／發獎算法 |
| 10 UI | `src/ui/release/{camp,world-map,stage-result,inventory,details,forge,affixes,gems,pet-growth,inventory-actions,loadouts,collection,loot-tracker}.ts`、`release.css` | `ui-*.test.ts` | inventory模組同時投影完整戰鬥背包與上背包下倉庫；forge獨立合成區及拖曳共用preview；詳情分頁、偏好／blocker清楚。14掛載，不改全域UI |
| 11 呈現 | **現有 `src/battle.ts` 獨占**；`src/game/release-visual-manifest.ts`；`public/assets/release/<核准區域ID>/*` | `visual-events.test.ts` | 最多5敵／primary-extra-proc／暴擊吸血／死亡落地事件；不侵占10完整背包布局，不以動畫改規則；音效請04/14接 |
| 12 客製 | `affixes.ts`、`gems.ts`、`reroll.ts` | `affixes-*.test.ts`、`gems-*.test.ts`、`reroll-*.test.ts` | 提供純StatModifier與GemMechanicSource、詞綴決定論／退寶石／品質新槽／重洗preview；戰鬥觸發屬05、保存屬14 |
| 13 地物 | `ground-loot.ts`、`pickup.ts`、`loot-lifecycle.ts` | `ground-loot-*.test.ts` | 14獎勵plan、07transfer、06可恢復逐件離關、11動畫；tap/proximity/exit同pickup，不要求全收留格，不另抽或直接入庫 |

表內測試省略共同前綴者均為 `tests/release/`。11 素材來源與授權清單放自己 manifest 的說明欄；若需要原始生成圖專屬目錄，須向 04 登記如 `assets-source/release/<regionId>/` 後才寫，不能覆蓋既有已確認美術。維持粗線卡通、森林金葉、A2圓體與自然外形；舊工單「不改像素風」不能蓋過 00 確認的最新美術。

## 4. 後續任務不改變葉 owner

15 用整合 engine 做平衡報告，若改數值先提「原值／推薦值／理由／結果」，批准後移交09，不自己碰共享 content。16 是獨立唯讀 review。17 修正由實際檔案 owner 寫，跨文件仍只有一個寫者。18 在同一最終 exact commit 驗收，測試與報告文件依實際工單白名單；若驗收發現問題回17，不邊驗邊私修遊戲。19 只交接，沒有默示發佈權。

## 5. 可並行但不混用基線

| 階段 | 合法基線與交付 |
|---|---|
| 01–03 目前 | 已驗收00與exact `1e2ac7e...`；只文件，統一 `integrated-v2-r2`、G1_PENDING |
| G1 | 使用者明確批准統一文件版本與決策；若改核心取捨，受影響文件先修訂核對 |
| 04 | G1核准表＋現有exact base；抽取不改平衡、完整fixture、回歸完成後給 `BASE_CONTRACT_V1=<實際commit>` |
| 05–13 | 同一已驗收04 exact commit＋凍結API／內容ID；缺依賴用04批准fixture，不依他人未完成私有分支 |
| 14 | 04基線＋每個葉 exact deliverable ready 與葉驗收證據；由14產生真正整合基線，不要求葉先自行相互merge |
| 15–19 | 每輪已整合 exact commit；不能用分支名稱「main」「latest」代替 |

`BASE_CONTRACT_V1`、`BASE_INTEGRATED` 現在都只是待產生標記，沒有虛構 commit；本輪不建立新 branch 或 worktree。未來即使已核准實作／套patch，也不表示 merge／push／部署自動獲準。

## 6. 合約變更與檔案移交

葉 owner 發現需要增 command、effect ID、pause reason、錯誤碼、schema欄位或跨檔修改時，送：問題重現／推薦最小變更／受影響API與fixtures／玩家語義是否改變。04/14 統一版本；有 G1 已核准語義變動就送使用者決定，沒有語義變動的機械修正可由授權整合範圍處理。

同一檔案要移交：原 owner 停寫並回報 exact內容／未提交變更，協調者登記新 owner 與範圍，新 owner 才開始。`battle.ts` 若14需改，先11交接；不以「只是少量接線」同時編輯。共享 fixtures 由04/14更新並通知所有消費者，葉任務不能各自複製另一版接口掩蓋衝突。

## 7. 固定交接內容

1. Task ID、exact base、產出檔案／patch 或實際 commit、契約版本、核准表版本。
2. 已完成與未完成、白名單變更、exports／registry key與安裝請求。
3. 真正執行的命令、seed、結果與證據；未執行、模擬、真機、真人半小時要分開。
4. 保存欄位、所有權和 transaction 邊界、前後版本、整合順序、已知風險與回復方式。
5. 交付後停止，等驗收／整合，不擅自啟動依賴它的下一工單。

## 8. 已解衝突與待 G1

- r2不用新增依賴邊：04先凍結同版schema、每impact游標／保存、偏好gate、純stat／機制ports與70關fixtures，05–13仍可依共同stubs並行。root的reviewInputs只描述規劃互讀，不把01→02→03→01變成循環dependsOn。
- r2擴大內容而不增第二owner：05真連擊；06逐件離關／必要選擇；08裝備與寶石追蹤缺料；09全世界資料；10完整戰鬥背包／forge；11最多5怪；12純數值詞綴／機制寶石；13可恢復pickup；14每hit原子及一次性獎勵ledger。
- 必須替換r1 fixtures及交接描述：白裝零詞綴／紫色才孔、三敵、999寶石、pause設repeat=false、全收留格、整action一次保存不能繼續當有效規格。
- 已解：唯一正式sampler是14，不是09或13；queryLootSources runtime歸08；寵物里程碑算法歸05；07/12共用交易port；11獨占battle.ts。
- 已解：01–03文件各自owner寫，不代改；02/03保留01所有推薦值待批准狀態；BASE_UPGRADE不另執行。
- 已互讀01設計／UI／完整T01–T12與03兩份規劃；本輪新增需求可由既有owner與ports涵蓋，沒有額外依賴邊或新工程授權。
- 待G1/04白名單確認：`clock.ts`、`audio.ts`、共同fixtures目錄與必要11來源目錄補充；其餘按原工單，沒有一般「可順便清理」授權。
- 本輪未執行遊戲測試、沒有玩家存檔操作或任何git寫入；此表不宣稱後續任務已開始。
