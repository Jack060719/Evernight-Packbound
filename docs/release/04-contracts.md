# Task 04｜契約與整合骨架交接

狀態：`G1_APPROVED / 04_READY_FOR_RE_REVIEW`。2026-10-09，使用者只授權修復04驗收的存檔驗證、轉移接口、共同基線三項問題。沒有啟動05–19，沒有commit、merge、push或部署，沒有操作玩家存檔。

本次修復使用`BASE_CONTRACT_V1.1`，取代首次交付的V1。指定Git base不變；可攜重建入口見[04-rebuild.md](04-rebuild.md)，新agent規則及必要00摘要見[04-context.md](04-context.md)。以下第6節保留首次交付歷史，第7節記錄本次修復與重新驗證，不能混稱。

交付收束：2026-10-09。核准仍記2026-10-08，最後契約fixtures與型別驗證跨午夜完成。

基線：`main / 1e2ac7e891835e85f9f31b02a1166cd99f9cbb52`。保留既有未提交規劃。AGENTS.md為空，依對話四項規則；README、已接受的00對話盤點與01–03均已核對，沒有捏造00-audit.md。本交接文件及實際型別取代02中的示意API，玩法仍以01已核准的r2/feedback02表為準。

## 1. 本次核准與實作界線

- G1接受目前01–03作實作基礎。裝備倉庫60、寵物30、背包最多48格；B為首輪平衡實測候選，15/10/5%為弱連擊首輪候選，均不宣稱最終平衡通過。沒有改用被撤回的減供81%表。
- 掛機驗收準備条件：初期55裝備空位、中後與成熟返刷50空位、寵物20空位；寶石獨立堆疊。900秒三庫聯合不中斷率95%為目標，仍須15的引擎/隨機測試；紙算與快側風險保持原文。
- 實作只到契約、裝配入口、可序列化資料、共用測試資料與舊存檔保護。沒有改70關數表、原型掉率、原型初裝或原型共用CAPACITY。正式版60/30是新契約；原型仍各30，待07/14接線。
- 保留現有GameEngine facade、GameClock與可玩原型。原有RNG函式注入／50ms時鐘已足夠，沒有為抽象而重寫。正式版registry尚未掛入main，不存在可玩的新正式版系統。
- 02白名單補充的共用fixtures與browser-test歸04整合owner；本次未改clock/audio。root安排契約與保存代理分檔實作、第三代理製作fixtures，最後唯讀互核；並未把葉任務05–13派出。

## 2. 凍結版本與檔案責任

`CONTRACT_VERSION=BASE_CONTRACT_V1.1`，`CONTENT_VERSION=integrated-v2-r2-feedback02-B`，`RELEASE_SCHEMA_VERSION=3`。schema3僅型別，當前瀏覽器仍寫v2。內容版本中的B表示測試候選來源，不是04已建立完整內容表。

| 檔案 | 唯一責任／主要exports |
|---|---|
| `src/game/contracts/ids.ts` | Region/Stage/Enemy/Item/Gem/Affix/Effect/Challenge/Collection/Presentation/Quality/Loot IDs；實例ID保留原字串 |
| `state.ts` | ReleaseGameState、SaveEnvelope、Item/Pet位置、RoundSource/Action/Impact/Hook、GroundDrop、legacy-v2分支；唯讀資料 |
| `protocol.ts` | Commands、PreviewToken、ValidatedPlan、TransactionPlan/Receipt、SaveCommitter、固定ErrorCode與事件聯集、容量/節拍常數 |
| `ports.ts` | 05–13及14的public ports、ContentRegistry、ReadModel、UICommands、storage/migration入口 |
| `runtime.ts` | createRandomSource、actionHitTicks、getExecutionPermission三個小型共用函式 |
| `index.ts` | 公開匯出入口；葉模組只依此或同目錄公開檔 |
| `src/game/registries.ts` | createReleaseRegistry、MODULE_OWNERS；明確注入模組，未安裝回拒絕，版本不符不裝配 |
| `src/save.ts` | 舊檔session保護、原文備份/匯出/恢復、實際1→2 migration登錄；不冒充IDB |
| `src/main.ts`、`src/ui.ts` | 所有現行保存走session；唯讀阻擋開始/操作/模擬，開始不解除鎖 |
| `tests/release/contracts.test.ts`、`fixtures/contracts.ts` | 每葉port編譯stub、完整序列化樣本與共用RNG/gate測試 |
| `tests/release/save-legacy.test.ts` | 手寫真v1/v2、mock儲存故障、原文/ID/進度保全 |
| `scripts/browser-test.mjs` | 保留原型回歸；損壞檔改驗即使明確點開始也維持停寫 |

ID集合以ids.ts為唯一機械清單：7區、70關、70頭目、35一般/精英定義、22裝備、6寶石×3級、9詞條、7挑戰及6配裝槽。另有`loot-legacy-v2`和`quality-legacy-v2`，不以新深1品質表替代舊進行中戰鬥。沒有生成700波正式資料。

## 3. 對後續owner的接線契約

| owner | 公開入口／禁止越界 |
|---|---|
| 05 | CombatPort.resolveImpact/resolveHook、recalculatePetGrowth、evaluateCooperation；只回候選及RewardIntent，不保存/自行roll掉落 |
| 06 | WorldPort.planWorldCommand/getExecutionPermission/planStageExit；必要選擇、repeat、exit都依canonical state |
| 07 | InventoryPort.planCommand與placement/net inventory/transfer、previewInventory/Synthesis/Salvage；涵蓋裝備、合成、拆解及寵物操作 |
| 08 | CollectionPort.planCollection/planLoadout/discover/queryLootSources/getTrackingView/planTracking；追蹤讀完整context，已嵌/地物不可當立即可消耗庫存 |
| 09 | ContentRegistry所有資料表；裝備數值唯一放gearEffects.parameters，equipment只保留身分/形狀/相容池與effect引用；無sampler |
| 10 | UIPort.render(model, {preview,dispatch})→View；ReadModel含完整背包、hero stats、地物、gem/resources、settings/lifecycle/collection/loadouts/catalog；UI不重算傷害 |
| 11 | VisualPort.createBattle(host,model)→BattleView.update/showCommittedEvents/dispose；載入依快照重建、不靠補播歷史事件；動畫不發獎 |
| 12 | CustomizationPort.planCommand、initializeAffixes/extendForQualityUpgrade/reserveReturnMaterialsGems/previewGemCommand/previewReroll/collectStatModifiers/collectGemMechanics |
| 13 | GroundPort.planGroundDrops/planPickup/applyLootLifecycle/getPendingPickupBlockers/planNextExitPickup；與07/06互相只用port |
| 14 | 唯一dispatcher、RewardPort、SaveCommitter、ReleaseStoragePort及正式裝配；這次只有接口，未安裝時明確拒絕 |

`CommandPort.preview`零RNG/零副作用；`validate`只驗命令與版本；葉plan用隔離state與注入RNG形成候選，只有14的revision CAS成功才發布記憶體/事件。失敗不消耗游標、材料或序號。相同commandId/指紋重試讀原receipt，衝突拒絕；不同command對已領drop仍不得再發獎。最多128 receipts；淘汰後由command序號拒絕舊請求。這些是凍結要求，04沒有用mock成功冒充正式CAS驗收。

完整錯誤碼與16種事件見protocol.ts。合成合法抽失敗仍`ok:true / synthesis-failed`；驗證拒絕才`ok:false`。EventIntent没有eventId；14在提交候選統一分配eventId/eventSeq/transactionId，11只見CommittedEvent。

數值單位：AffixRoll帶unit；CombatStats的healingBonus/petPowerBonus、WeaponStats的critChance/lifesteal、裝備同名bonus、寵物milestone.powerBonus及bond.bonusPerStack均為百分點（20=20%、6=6%）。critMultiplier、damage係數、armorPenetration與`*Fraction`為比例。09提供額外擊係數、各上限、最低傷害；05不能另硬編一份。unlock外層OR、內層AND，外層空陣列=無條件。

## 4. 凍結的執行與序列化規則

1. 回合初凍結來源基值/裝備詞條孔/武器與支援力量；新裝、重洗、升級不偷換本輪快照。來源被移除才取消剩餘命中；單純version改變不取消舊快照。HP/防禦即時例外及ward/bond拆除夾限仍依01/02。
2. 武器primary各目標攤平，再排extra，最多8個直接impacts；`dueTick=floor(index*10/impactCount)`，0～9的50ms刻度共用原0.5秒action。AoE每目標獨立impact，不同時結算、不另加時間。proc併父impact，不能獨立排程；每擊cursor、有限proc、反傷、死亡與獎勵意圖同提交。
3. 直接傷→吸血→ward→venom→bond→sweep→chain→凍結反制；敵毒在支援後、敵行動前，英雄毒在敵phase後。最後敌死仍完成到期支援與必要後果；英雄HP0優先dead，kill獎保留但無StageCompleted獎。enemy_frenzy一旦觸發即保存frenzyActivated，回血不解除「本次與後續」加成。
4. 場上currentAction只存一個；roundSourceSnapshots不重複存cursor；hero.hp唯一權威。itemById/petById含地物物件，location決定owned；61件/31寵留ground，不偷偷塞倉；18種寶石與dust只驗非負安全整數，無玩法數量cap。
5. execution gate組合manual/organize/capacity/hidden/camp/load/save-error/save-conflict，加resumeRequired/pendingChoice/storageGate；任何gate不改autoRepeatEnabled。前景波入場、travel、settlement、exit-wait允許既有地物倒數，不能打怪；真正pause全部凍結。不補背景時間。
6. staged exit：結算可repeat→建立同一ExitRequest→exit-wait逐件pickup→沒有待領且exitReady才建下一run。滿倉保存nextDropId待整理續接，不預留全收空位。exit-wait是已開始的轉場，不再另開repeat。死亡按鈕可用world.repeat，由06依dead建立reason=retry；營地用blocker凍結原run、不補HP。
7. 三條xorshift32-v1 RNG（combat/reward/crafting）各存seed/state/draws，種子非零uint32；試算建立副本，丟棄不改存檔。現有GameClock符合ClockPort，不建立第二牆鐘。
8. 地物原倒數440ms由50ms tick量化為第9tick可領；只凍結常數和欄位，13才實作生命週期。legacy-v2保留原phase/actions/actionResolved/小數remaining/time/tickRemainder，不偷偷轉新戰鬥規則。

## 5. 舊檔橋接與未完成事項

`createSaveSession(storage)`提供loaded/blocked/message/save/exportRaw/restoreBackup。current存在即不回退v1；v1 key只收version1、v2 key只收version2；空字串、未知版本、重複ID/格子、負永久資源、失效activePet引用停止写入。開始、週期、pagehide均同一保護。

首次覆寫前分別保存v1/v2原文字串，key含來源與UTF-8 FNV1a索引；索引不是相等證明，必須逐字核對且不覆蓋不同原文。備份失敗、來源變更或保存失敗即停寫。備份不是每5秒新增；新session的原文首次覆寫才建一份。restore只接受核對來源的有效備份，先備份被替換原文，返回暫停state；caller必須換engine後才可繼續。

只登錄現有1→2遷移；2→3回未安裝。原型仍用localStorage同步寫，兩次來源核對不是跨tab原子CAS。舊UI仍先改記憶體再保存；保存失敗會凍結，但不保證撤回失敗前記憶體操作或已呈現事件。完整「候選提交成功才發布」、IDB原子性/多tab競爭、v3全部字段遷移及恢復UI屬14/10，這次沒有宣稱已完成。

## 6. 首次交付驗證（歷史，非本次修復結果）

- `npm.cmd test`：5檔111項通過；既有59＋契約/共用骨架27＋保存25。保存測試用手寫v1/v2及mock storage，不讀玩家存檔。
- `npm.cmd run build`：typecheck與Vite build通過；仍有原型Phaser bundle超500kB提示，未混入優化或套件升級。最後接口註記補齊後另跑`npx.cmd tsc --noEmit`通過。
- `GAME_URL=http://127.0.0.1:5178 node scripts/browser-test.mjs`：360/390/430、觸控/拖合成/旋轉/轉場/音訊/載入/可見性/reduced motion與損壞檔鎖定通過，failures=[]。使用全新headless Chrome contexts，不是玩家profile/實機。首跑旧case仍期待開始覆寫損壞檔，因正確阻擋而timeout；已按新核准保護規則更新該expected，再跑通過。
- `fixtures/contracts.ts`：1–5敵、impact前後、AoE半途、反制死亡、48格、59/60+待領61、29/30+待領31、退石/追蹤、重複pickup、exit/repeat+全pause、legacy小數、競爭revision、UI完整ReadModel；全部深凍結並JSON roundtrip。這些證明欄位/介面與樣本一致，**不是05–13 gameplay、v3 migration或CAS已通過**。
- 15分鐘容量、B掉率供給、完整世界/新UI、真人30分鐘與手機實機驗收仍NOT_RUN，沒有用111項測試充作正式版平衡證據。

首次交付只有工作樹與雜湊清單，未提供可攜重建包；這是本次修復的第三項問題。新的[相對路徑SHA-256清單](04-manifest.json)與自足bundle／overlay交付取代此限制，仍不製造commit。保留原型需回復時只撤本次差異，原文備份不得一併刪除，亦不得重設前輪規劃。

## 7. 本次04驗收修復

### 存檔驗證

- 依原型共用`nextId++`規則，所有現存裝備／寵物／待領／敵人中符合`iN/pN/eN`格式的正整數序號必須安全且小於nextId；其它舊字串ID原樣保留。拒絕不合法counter，不調高、不重編ID、不刪物。
- XP、成長點、分配點、等級、完成次數、回合與索引依語意驗安全整數；HP／傷害／elapsed time／倒數保留合法有限小數。音量0–1，HP不超對應上限，v2 tickRemainder為0至小於0.05秒；combat/travel/dead剩餘時間上限分別0.5/2/2.5秒。不捨入或偷偷修復永久數值。
- `createSaveSession.save`與既有`saveGame`都在寫入前驗證。session遇非法候選即鎖定；原文、已有備份、輸入state不變。已成功checkpoint後再產生重複i1，也不能寫回。
- 新增71項保存案例；修正前66項失敗，修正後保存檔96項通過。包括手寫v1/v2、既有i1＋nextId=1、各所有權容器、實際掉落重複ID、後續停寫、非法數值，以及12.345／0.031／0.25秒的合法小數往返。

### 四類轉移接口與責任

`TransferInput`與`InventoryMove`改為equipment／pet／gem／dust辨識聯集。equipment帶item reference與裝備location；pet帶pet reference與`owned/ground`位置；gem帶drop reference及type/grade/count；dust帶drop reference與amount。`TransferPlan`輸出moves與完整InventoryProjection，資源不套裝備座標。

13驗地物version、payload及可領狀態並組領取候選；07驗ownership、裝備／寵物淨容量與資源安全整數並回transfer/projection；12仍負責內嵌寶石返還；14獨占中央提交與地物領取標記。此輪只修改接口與wiring probes，不實作葉模組或CAS／IDB。

`transfer-ports.test.ts`的四類正向案例實際讀取參數並回傳／消費typed output；8個`@ts-expect-error`反向案例檢查錯誤位置、引用、grade、amount及輸出形狀。沒有any、強制斷言或never stub作此接線證據。既有registry安裝形狀測試不再被描述為完整接線驗證。

### 可重建共同基線

新增`docs/release/planning/`可攜規劃、來源指令原文、相對連結、`04-context.md`與`scripts/task04-baseline.mjs`。同一交付包包含指定base的Git bundle、完整差異overlay、包manifest與重建腳本；重建時不讀原機外部目錄。檔案雜湊採原始bytes，連CRLF差異也交付。外部原規劃與原工作樹均不reset。

最新實測證據與待驗限制見[04-repair-results.json](04-repair-results.json)。**04_READY_FOR_RE_REVIEW，05–19維持未啟動；重建或測試通過不等於後續放行。**
