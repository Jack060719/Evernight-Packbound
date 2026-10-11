# Task 02｜存檔與遷移方案

> 2026-10-08 狀態更新：使用者已明確核准 G1，本輪只完成 Task 04。B掉率及15/10/5仍是首輪實測候選；prepared 55/50裝位、20寵位與95%目標納入驗收。本文保留提案歷程，文內整體G1／04授權的舊時點描述由本註覆蓋；不覆蓋已排除功能，也不代表S/C替代方案獲採用或測試已通過。凍結API、實作範圍與證據見 [04交接](04-contracts.md)；05–19仍未啟動。

版本：`integrated-v2-r2`／`G1_PENDING`。Exact base：`1e2ac7e891835e85f9f31b02a1166cd99f9cbb52`。已讀使用者接受的完整 00 回報、2026-10-06 修正指令、整合包、01–03 文件。以下是未實作的提案，所有 D05/D10 取捨等待 G1。r1 沒有實作存檔，本次仍提議 schemaVersion 3，不虛構 r1→r2 遷移。

`G1-feedback-02`（2026-10-08）：裝備倉庫60件已確認，已裝備不計；背包48格與寵物D07的30隻候選不跟調。本次只同步容量的保存／遷移驗證，沒有遷移任何玩家存檔；schema、備份、IDB與交易方案維持。候選掉率全部未核准，不因容量確認而改用feedback-01減少約81%供給表。

## 1. 已有能力與真實缺口

現有 `src/save.ts` 使用 localStorage `evernight-packbound-v2`，不存在時才讀 `evernight-packbound-v1`。v2 已保存敵人、HP、動作列、索引、`actionResolved` 與剩餘時間；這部分能精確續接，必須保留。現有 v1→v2 會保留永久資料，但將當層重設為第一波滿血；不能把它稱為精確舊戰鬥遷移。

現有 v1 key 不刪除，另有自然形狀 placement 修復；但沒有 v2 原文備份、receipt、RNG 游標、新系統欄位、跨分頁 compare-and-write。損壞資料讀取後暫停寫入，但 `main.ts` 的開始按鈕會重新開放保存，仍可能覆寫損壞原文。這不是已完成的安全恢復層。

本輪只讀程式／樣本，不曾讀取或操作玩家真實瀏覽器存檔，也沒有執行任何遷移。59 項是歷史測試紀錄，不是本輪結果。

## 2. D10 推薦：單一 IndexedDB store，保存完整快照

建議新 DB `evernight-packbound`，DB 結構版本 `1`，唯一 object store `saves`。DB 結構版本與遊戲 `schemaVersion: 3` 分開。資料仍是一份可匯出的 JSON envelope，不引入伺服器、帳號、套件、每個實體一張表或無限事件日誌。

store 只需 `current`、`previous-valid`、不可變 `backup:<sourceVersion>:<sourceDigest>` 記錄，以及匯入／恢復時保存的必要原文備份。`current` 是完整 envelope：schema/content/contract version、save ID、revision、state、RNG、command/event 水位與近期 receipts。`previous-valid` 是上一次成功且驗證過的完整快照，不是會變動的 migration 原文。

推薦原因：每次 readwrite transaction 可在同一個 store 內「讀當前 revision → 比對 → 寫 previous-valid 與 current」。相同 store 的讀寫交易序列化，兩個分頁不能同時以舊 revision 成功覆寫；後者返回 `SAVE_CONFLICT`，停下並讀回更新資料。候選計算、hash 與大型 JSON 工作在交易前完成，交易內只讀比對與寫入，不跨 unrelated await。這是依標準機制選擇的方案，並非本輪已在各手機實測。[W3C IndexedDB 交易生命週期與排程](https://www.w3.org/TR/IndexedDB/#transaction-lifetime)

替代方案：保留 localStorage 最省 adapter 修改，但單純 get→比較 revision→set 不是跨分頁原子操作，不能保證同時寫入安全。另加 Web Locks 可保護協作分頁，但它限定安全來源，不宜無條件當成區網 HTTP 手機的可用前提。[W3C Web Locks IDL](https://www.w3.org/TR/web-locks/#api)

如 G1 選 localStorage 替代，就必須明確縮小多分頁保證或另核准可用鎖定／持久化方案，不能保留同樣保證而偷偷去掉互斥。IndexedDB／配額／私密瀏覽／清理儲存行為仍需 18 真機檢查；不可用時停寫並允許匯出，不默默降級成會覆蓋的記憶體新遊戲。

## 3. 提交與故障語義

```ts
loadSnapshot(): Promise<LoadResult>
commitSnapshot(expectedRevision: number, candidate: SaveEnvelope): Promise<CommitResult>
exportRawBackup(sourceKey: string): Promise<string>
validateImport(raw: string): ImportPreview
restoreValidatedBackup(preview: ImportPreview, confirmed: true): Promise<CommitResult>
```

這些 port 只由 04/14 adapter 實作；葉模組不可接觸 localStorage／IndexedDB。

| 中斷點 | 結果／恢復 |
|---|---|
| preview／驗證前後 | committed state、資源、RNG 不變；確認取消零副作用 |
| 候選抽樣後、寫入前 | 候選只在記憶體副本；失敗或刷新重試用同一已存游標，不能免費換結果 |
| transaction abort／quota／write 失敗 | current、previous-valid 及該筆備份均不部分提交；丟棄候選；顯示 save-error 並停止模擬／經濟命令 |
| 單一 put success、整筆還沒 complete | 不能呈現成功、扣顯示資源、發送視覺或 ACK |
| transaction complete 後、發佈記憶體前崩潰 | 下次讀 current 已有結果／receipt／RNG；同 command 不再抽或扣；未播動畫不需補播 |
| 兩分頁提交相同 expectedRevision | 只有一份成功；另一份在交易內看見新 revision，拒絕候選與 RNG，停為 save-conflict，不自動覆蓋 |
| current JSON／內容驗證失敗 | 保留原值並停寫；提供 current 原文與 previous-valid／legacy 原文匯出、有效備份預覽；不自動啟新旅程 |
| 停電、瀏覽器資料清理或裝置故障 | 不承諾超出瀏覽器耐久性；使用 strict durability hint（若可用），仍提供外部檔案匯出。瀏覽器清資料不能靠同瀏覽器備份恢復 |

交易原子性不等於硬體一定完成 flush；標準有 durability 選項，真機斷電與儲存回收仍是風險，03/18 應分列測試及限制。[W3C IndexedDB durability](https://www.w3.org/TR/IndexedDB/#transaction-durability)

只在確定完成後才把候選 RNG 與 state 發布。開新頁／讀檔先進營地及 load pause、resumeRequired=true，但保留持久 autoRepeatEnabled。死亡、首通自選寶石、必要結算選擇均須明確處理；continue 不可略過。save-error 必須經「重試保存」或「讀回已保存進度」明確處理；任意開始按鈕不得解除只讀保護。

## 4. 不每 50ms 存一份大快照

| 邊界 | 保存內容與可回退範圍 |
|---|---|
| 每個直接 impact 結果 | 此命中 crit、實傷、吸血／護盾、命中機制、有限 proc、反傷、死亡／XP／掉落、RNG、hitId／下一 hitIndex／targetOrdinal 同筆；成功後才顯示。DoT／無直接 hit 的 hook 以 hookCursor 同原則提交 |
| action／波／關／死亡 | action 完成或取消標記不得另發傷害；波／關進度、首狼、一次性自選獎勵 ledger、必要選擇與地物同其邊界保存；challenge-clear僅英雄存活的StageCompleted交易發放，runId完成水位／全部追加地物／reward RNG同存，不混入boss kill |
| 離關／新 attempt | exitRequest 先保存意圖，各 pickup 逐筆原子保存；收不下保留剩餘物且不開 run，已領不回滾。清完且玩家仍允許才另筆新 run／HP／challenge；不要求留一格 |
| 玩家變更 | 裝備、點數、合成、拆解、寶石、重洗、配裝、收藏選擇、追蹤、設定都經同一提交入口 |
| 地物落下完成 | falling→available同中央生命週期提交；零RNG／不領物。camp／death／load營地入口可把既有claimRemainingMs歸0並同筆標available，不能增加戰鬥時間或收益 |
| 純倒數 tick | 可在記憶體遞減，每 5 秒或暫停／進營地時 checkpoint；不每 tick 同步寫資料庫 |
| visibility/pagehide | 立刻停 clock、設 resumeRequired，保留 autoRepeatEnabled，盡力 checkpoint；不能依賴頁面卸載 callback 一定完成 |

硬關閉最多回到最近 checkpoint 的「剩餘等待」，不回滾已呈現成功的 hit／交易，也不補跑離線時間。每 impact 提交比 r1 整 action 更頻繁，這是精確多擊續接的成本；15 必須量測 1–5 敵、滿背包、多次連擊下的儲存耗時，不能聲稱紙上0.5秒就是實機時間。需要精確保存的營地／背包入口先凍結並完成 checkpoint，再允許管理；保存失敗只讀。hit cursor、remaining、action completion 及 RNG 同存，重載不重抽暴擊或重打一擊。尚未提交的候選即使已抽樣也不曾對玩家發布，恢復從舊游標計算同結果。

若實機保存成本未達03門檻，先量測快照大小／序列化／IDB等待並做不改語義的必要修正；容量樣本改含60件倉物、滿已開背包、30寵候選與全部寶石堆，不能只量舊30件倉的快照。不能私自改成「先播傷害、稍後存」或合併整個action，因為那會改變已核准的中斷保證。需要改提交粒度時由14列具體取捨重新送核，不藉r2規劃預先新增日誌資料庫或第二保存層。

## 5. v3 字段與 roundtrip 清單

| 範圍 | 必存欄位；不由 UI 推測 |
|---|---|
| envelope | schemaVersion、contractVersion、contentVersion、saveId、revision、migrationReportVersion、來源摘要 |
| hero／成長 | level、累積 xp、points、attack/health points、當前 HP、已解鎖格與持有資源 |
| equipment | 原 ID、definition/baseKind、quality、version、location、placement/rotation、warehouse stable order、locked、完整 affixes/sockets |
| pets | 原 ID、kind、quality、累積 XP、level、milestone IDs、唯一 activePetId；待領蛋仍在 ground；不新增寵物鎖定 |
| world | 已開 region/stage、完成／通關計數、首狼旗標、oneTimeRewards ledger；目前 stage 不等於已完成 |
| active run | run/encounter IDs、stage、wave、challenge、ruleset/definitionVersion、敵快照／HP／round／queue／index、primary／extra hit plan及proc來源、source snapshot／本輪cancelledSourceIds、beforeActionResolved／本action chargeMultiplier、hitIndex／targetOrdinal／phase／lastResolvedHitId／remaining、hookCursor/hookResolved、敵我毒層／charge(run+source且跨波保留)／shield／合作／proc budgets |
| loot | 全部未撿drop／payload／唯一location／來源／穩定位置／falling-available-claimed／claimRemainingMs／已處理水位；初始440ms，50ms前景tick第9次才可領，動畫callback無權。營地／死亡／load營地入口可同生命週期transaction把既有落下歸0，不增物、不推combat／RNG／回合 |
| customization | 固定等級機制gem stack／嵌入單位、重洗材料、純數值詞綴rollVersion／rolledQuality／origin。升品保舊範圍與數值，starter固定5pp屬合法特例；不以當前新品質範圍重抽或判壞 |
| collection／loadout | equipmentHighestQualityByDefinition、gemHighestGradeByKind、petHighestQualityBySpecies、petHighestLevelBySpecies、獎勵已領／展示選擇；歷史不隨消耗或放生刪除。配裝引用／位置／旋轉／observed versions／寵物、裝備或寶石追蹤目標／所需品質級別／數量；owned／缺料由當前物件推導 |
| determinism | combat/reward/crafting RNG algorithm、seed、state、draws；nextEntitySeq、nextRunSeq、eventSeq、lastAppliedCommandSeq、最近 receipts |
| lifecycle | manual/capacity/camp 等必要原因、resumeRequired、必要結算／死亡／首通自選狀態、exitRequest；load 必營地，true 重打偏好仍 true；canExecute／canRepeat 是衍生值 |
| settings | 持久 autoRepeatEnabled、音樂／音效／靜音、核准減少動態、introSeen；舊 autoItems/autoPets 只在備份，不能當重打設定 |

`hidden`、committing、UI 焦點、拖曳中位置、影音播放游標不是復原遊戲規則的來源；讀檔重新從 visibility 與頁面模式建立。新系統 roundtrip 必須等 14 真整合後完成，04 骨架不能先宣稱全覆蓋。

## 6. 遷移：先備份、再驗證、最後一次發布

1. 先讀有效 v3 current；不存在才考慮 v2，沒有 v2 才看 v1。若 v2 有但壞掉，不默默改讀更舊 v1，避免當作最新進度。
2. 用字串原樣保留來源；parsed JSON 不能取代原文備份。舊 key 不改不刪；同 origin 舊分頁仍可能寫 v2，不讓新舊雙向同步。
3. 版本專用驗證核實 ID／ownership／kind／關波範圍／引用，列保留、移動與不可精確續接的資料。
4. 副本初始化固定候選；備份 key 已存在必逐字比對，不覆蓋不同原文。fnv1a32-utf8-v1 可作索引摘要／seed；摘要同而原文不同視為衝突，停止，不把 hash 當安全身份證明。
5. 在一筆 IDB transaction 內先寫不可變原文備份、讀回逐字比對，再寫 candidate v3，條件是尚無 current、來源仍符預覽。任一失敗整筆 abort；兩分頁同遷移後者讀已完成 current，不重做初始化。source localStorage 無法參與 IDB 原子交易，因此完成前再核對 raw；若舊版頁面後續又寫 v2，載入報差異，不自動把新舊合併。
6. 完成才切換 v3 read model；先營地，明示遷移摘要，玩家選續戰／出發；不清檔。

恢復／匯入：先解析與預覽、保留即將被替代的 current 原文，再由玩家一次確認。以目前 revision 防跨頁重入，恢復也產生新 revision；不抹掉原始 legacy 備份。未知未來 schema 不降版、不擷取「看得懂的欄位」組新檔；只讀與匯出等相容版本。

## 7. 舊 3×5 → D01 世界推薦映射（待 G1）

| 舊資料 | 提案結果 |
|---|---|
| `floor = n` | `selectedStageId = verdant-0n`（n=1..3）；不宣稱目前關已完成，也不把舊三層當作新十關全通 |
| `unlockedFloor = n` | 解鎖 verdant-01..0n；推定先前關已完成，存 importedProgress，不補新首通獎；最終對齊 D05 |
| `completedRuns > 0` | 推定 verdant-03 完成，依區內順序開 verdant-04，以及分支 ember-01／moonwell-01；V04..10未完成。原次數存歷史，不發等量新獎 |
| `firstFloorReward = true` | 首狼旗標保持 true，不重發 |
| `firstFloorReward = false` | 第一次有效完成映射 verdant-01 給狼；其他進度欄位不代替明確旗標 |
| r2 自選寶石一次性獎勵 | 初始 unearned，不在遷移補發。第一次正式完成 verdant-02 才進 awaiting-choice，選後 chosen {kind,dropId} 永久保存；不共用首狼旗標 |
| `pending.items/pets` | 唯一 ground drop，payload 原 ID、來源 legacy-pending、營地可領；不呼叫 retryPending/autoMerge |
| 舊設定 | 保留音量／靜音；無 autoRepeatEnabled 的已知舊格式初始 off，autoItems／autoPets 只留原文，不執行也不當重打 |
| 無詞綴／孔／鎖欄位 | locked=false；依 D06 品質表建立空孔、決定論補詞綴；不送額外材料／寶石，不消費遊戲 RNG |
| 原背包／倉庫 | 保留合法位置、旋轉、ID與既有順序；原型倉庫上限30是歷史來源，原文備份不改成60。遷移後裝備倉庫適用已確認60件、已裝備不計；寵物仍獨立依D07的30隻候選。超過目標容量的合法保留資料只限制新增，不能截斷陣列或刪物 |

舊裝初始化：對 `sourceDigest + item.id + definitionId + quality + initializationVersion` 建 deterministic 子流，12 提供純函數依核准詞綴池與數量抽取；14 一次保存。取消遷移、刷新、換讀取順序都不能免費換詞綴。已有合法詞綴／寶石欄位若來自未識別格式，不假裝是 v2 並覆蓋，先停止並報告版本差異。

容量擴充不生成30件物品或改寫來源計數，也不自動領取舊pending：30件舊倉物仍是相同30件，新增可用空間為30件，待領沿用ground／同一pickup。是否可解除capacity依實際待領payload重驗；讀檔仍進營地且需明確continue，不能因擴容自動開打。新格式roundtrip須覆蓋59件收成60、60件無待領及第61件待入倉保留ground；正常交易不得先把第61件寫入倉庫再刪除。合法物品／pending／嵌石數量守恆，寵物容量不得因現有共用`CAPACITY=30`被誤改60；不為單次常數調整另加存檔版本。

配裝、追蹤、收藏新欄位的初始值：配裝空、追蹤空，收藏以已持有裝備／寶石／寵物初始化各definition或kind／species的最高品質／級別與現有寵物最高等級；legacy pending先轉地物，成功拾取才更新。starter在新旅程建立時計發現；消耗或放生過而舊存檔沒有記錄的最高品質／等級不能憑空推斷。之後升品／寵物成長同交易更新永久歷史。物件／寵物初始 `version=1`，RNG 由固定原文摘要分流；歷史 Math.random 游標不可恢復，僅保證遷移成功後的重播。

## 8. v2 未完戰鬥：一次 legacy run，保留精確快照

推薦 D05 接受一條短期兼容路徑，而不是把新敵表套到舊 HP 或重設回合：

- 建 `ruleset: legacy-v2`、`definitionVersion: baseline-1e2ac7e` 的當前關 run，保留 floor、wave、敵人原 ID／數值／HP、hero HP、round、stage、actions、actionIndex、actionResolved、remaining 與合法 placement。不補血、不建新敵人替換目前波。
- 原有 `time`、`tickRemainder`、legacy `remaining` 數值原樣保留，不為轉 integer ticks 四捨五入舊資料；只重設牆鐘基準避免離線補算。新 run 才採新 tick 表示。新初始化詞綴／孔位在此 legacy run 不改舊最大生命或攻擊公式。
- 當前關尚未到第 5 波時，只將該關剩餘波依舊敵公式生成；核心攻序、當前裝備舊公式保持到本次關結束。新的詞綴／寶石／合作不混入此兼容 run；UI 說明正式版效果自下次出發生效，管理不改已結算 action。
- 後續舊關擊殺的 legacy 65% 裝備／8% 蛋表由 09 保存為兼容資料、14 唯一 sampler 執行，物品一律先落地；不復用舊直接入庫/自動合成。已死且已發的怪不再發。未抽過的隨機值無法與當年的 Math.random 保證相同，改為遷移後保存的 reward RNG，必須如實說明。
- 第 5 波完成後進入新三選結算，不自動跳舊下一層／重刷；映射解鎖與首次狼走中央收據。legacy 完成不算 r2 正式 V02 首次選寶石。下一 run 使用正式版每關10波與新公式。
- 舊 `dead` 快照保留為死亡結算待選，不自動倒數重開；死亡重試由明確新 attempt 觸發滿血。舊 travel 剩餘時間保留，續戰才繼續。
- 玩家可明確放棄 legacy run；保留已得進度／掉落，不補未完成首通，處理待領後下次從該關第一波新 run 開始。

代價：05／06／09／14需版本選擇的兼容路徑及fixture，不保留整個舊UI或第二獎勵入口。直接放棄舊戰鬥重開較省碼，但丟當前戰鬥並改HP／回合，不推薦亦不默認。legacy 仍保存原 actionResolved／remaining，不虛構當年每hit狀態；新 r2 run 才採 primary／extra／proc cursor。

## 9. v1 秒制戰鬥：誠實限制與推薦

原 v1 的獨立秒制冷卻無法唯一映射到新回合 actionIndex。推薦：原文不可變備份＋所有永久資料與 pending 保留，舊戰鬥原文仍可匯出，但進營地顯示「舊戰鬥需重新出發」。只有玩家明確按出發才建立映射關卡的新 run 並按 D04 恢復生命；遷移本身不補血，也不宣稱精確續接。

不直接呼叫現有 `migrateV1()` 再宣稱無損，因為該函式已重設波次與 HP。若 G1 要求 v1 也完整打完舊秒制戰鬥，就需要另核准舊秒制執行器與額外測試，當前推薦不承擔這個較大範圍。

## 10. 未知值與所有權錯誤

| 情況 | 動作 |
|---|---|
| 未知必要 item/pet/enemy/effect/stage/challenge kind 或未來 schema | 原樣保留、停寫、可匯出；不可改成白劍／金幣／空陣列，不自動隔離後繼續遊戲 |
| ID 重複、item 同時地面與倉庫、active pet 引用不存在 | 停寫並列具體 ID；不猜誰是真品，不重編舊 ID 解衝突 |
| NaN／負資源／不合理 quality／重複格 | 驗證失敗停寫；不靠 clamp 篡改永久數值 |
| 已知盾／杖舊自然形狀配置衝突 | 唯一允許的已知修復：沿用既有穩定安置策略，保留其他合法物，無空位至倉庫／legacy ground；修復列入報告，ID與數量不變 |
| 目前有效裝備位置 | 原樣；不要為整理或排序移動攻擊順序 |
| 配裝引用缺件 | 合法玩法狀態，顯示缺件並全拒套用；不同於 canonical ownership 損壞 |
| 非規則可選展示欄位缺少 | 可按 schema 預設補齊並記 migration report；不放寬必要規則欄位 |

## 11. Owner、驗收與待決

04 做版本 parser、backup／停寫與 port 骨架、既有回歸；14 才接全部字段、legacy run、中央抽樣、完整 roundtrip 和中斷恢復。05 提供 combat／pet state，06 world，07 inventory，08 collection/loadouts，09 legacy／新資料，12 customization，13 ground；沒有任何葉 owner 自己保存一段欄位。

03 的 fixtures 必涵蓋 v1、v2 四個 action 邊界、dead/travel、全部 pending、首狼兩值、舊3×5完成推定、自然形狀修復、unknown/dup ID、舊30件倉逐ID保留、正式版59／60／第61件待領、寵物29／30／第31隻待領、寶石退回、兩分頁 revision 競爭、備份／commit abort、完成後 ACK 遺失、決定論初始化、128 收據窗口外拒絕、不跑背景時間；本輪只定義需求，未建立或執行測試。

草稿對齊（G1_PENDING）：v2精確legacy／v1明示重開、min HP、首狼一次、legacy dead手動重試、pickup才發現、高XP寵物原ID。r2每impact提交含crit／吸血／反傷／死亡／RNG／cursor；autoRepeatEnabled持久，load營地待continue；首通自選石必要選擇、追蹤裝備／寶石、逐件pickup離關與exitRequest可恢復。r1全批領物＋必留格／pause關偏好／999寶石上限及discard提案撤回。D01新世界映射、D06決定論補詞綴／孔及自選石、D10 IDB／三RNG／128receipts仍待G1。

已互讀01設計／UI／完整T01–T12及03兩份規劃，補齊最高品質／等級收藏歷史、challenge-clear完成水位與440ms落地欄位。普通前景步行／結算／exit等待與combat共用地物時鐘，真正pause凍結；營地入口完成既有落下不推戰鬥或RNG。這是文件一致性核對，不是保存實測通過。

本輪只精準更新三份02規劃文件的容量與驗收引用；沒有commit、遊戲碼、測試或玩家存檔變更。G1前不開始04。
