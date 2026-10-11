# Task 02｜模組契約提案

> 2026-10-08 狀態更新：使用者已明確核准 G1，本輪只完成 Task 04。B掉率及15/10/5仍是首輪實測候選；prepared 55/50裝位、20寵位與95%目標納入驗收。本文保留提案歷程，文內整體G1／04授權的舊時點描述由本註覆蓋；不覆蓋已排除功能，也不代表S/C替代方案獲採用或測試已通過。凍結API、實作範圍與證據見 [04交接](04-contracts.md)；05–19仍未啟動。

版本 `integrated-v2-r2`／`G1_PENDING`；契約候選 `integrated-v2-r2-proposal`；exact base `1e2ac7e891835e85f9f31b02a1166cd99f9cbb52`。已讀使用者接受的完整 Task 00 回報、2026-10-06《正式版規劃修正指令》、整合包與 01–03 草稿。本文取代 r1 契約，沒有已核准 API 或程式實作。數值與內容以同版本 [01 表格](01-tables.md) 為提案來源，G1 後才由 04 凍結。

`G1-feedback-02`（2026-10-08）：使用者確認裝備倉庫60件，已裝備不計入；背包最多48格、寵物D07的30隻候選不跟調。連擊較弱、以觸發為主及15%／10%／5%首輪候選維持，每擊規則與上限保留。整理後成熟重刷已通關約15分鐘免容量操作仍是目標；各進度起點與驗收見第8節。所有掉率仍未核准，feedback-01的30件方案及減少約81%供給的60件替代表都不是本輪預設。候選只引用同版01／03，API、schema、owner與DAG不變，不以自動合成／棄物／拆解或拖慢戰鬥達標。

## 1. 最小結構與資料邊界

沿用 `GameEngine` 外觀，以少量純計畫函式抽出世界、戰鬥、庫存、客製及地物，不另建第二引擎、通用插件或無限事件日誌。04／14 是同一整合 owner，唯一持有中央命令、持久化與正式獎勵 sampler。葉模組只讀快照、回傳候選，不能寫瀏覽器儲存、自行扣款或建立另一條發獎路徑。

已確認最低內容規模為 7 區、每區 10 關、每關 10 波、最多同時 5 敵。契約用資料陣列與 ID，不固化 r1 的 3 區／3 關／8 波。r2 的區域名稱、解鎖圖、70 關編成及數值仍是提案。詞綴只提供基本數值；裝備特色、寶石、寵物與敵方行為才提供觸發機制。沒有攻速詞綴或離線收益。

| 結構 | 必存欄位／不變條件 |
|---|---|
| `SaveEnvelope` | `schemaVersion: 3, contractVersion, contentVersion, saveId, revision, state, rng, counters, receipts, migrationReport`；r1 未實作，故沒有虛構的 r1→r2 存檔遷移 |
| 識別／版本 | 舊 ID 原樣保留；新 ID=`saveId:kind:nextEntitySeq`，序號同交易保存；物件變更增 version。run／encounter／action／hit／event／transaction IDs 分開 |
| `ItemInstance` | `id, version, definitionId, baseKind, quality, locked, affixes, sockets`；同一物件只有單一 location |
| `ItemLocation` | `equipped { row,col,rotation } / warehouse { order } / ground { dropId }`；footprint 由自然形狀 definition 決定，旋轉不能改形，只用解鎖格 |
| `AffixRoll` | `statId,value,unit,rollVersion,rolledQuality,origin`；origin=drop／starter／reroll／upgrade-added／migration。weaponBaseAdd／extraHits／critChance／critMultiplier／lifesteal／maxHpAdd／defenseAdd／healingBonus／petPowerBonus為純數值，前五局部、後四全背包，上限讀T05 |
| `GemUnit / GemStack` | 固定 `type,grade`，已嵌入單位與 type+grade 堆疊互斥；count 非負安全整數。r2 推薦六機制×三級、無任意 999 遊戲上限，待 D06 |
| `PetInstance` | 原 `id,version,kind,quality,cumulativeXp,level,milestoneIds`；唯一 activePetId；不增出戰槽或寵物鎖功能 |
| `InventoryState` | `itemById,locationById,unlockedCells,warehouseOrder,pets,activePetId,gemStacks,resources`；裝備倉庫60件（已裝備不計）、背包最多48格；寵物容量讀D07的30隻候選（含出戰），不可沿用裝備上限 |
| `WorldProgress` | `unlockedStageIds,completedStageIds,completionCounts,selectedStageId,firstWolfGranted,oneTimeRewards,importedProgress`；選中、正在打、已完成分開 |
| `ActiveRun` | `runId,stageId,challengeId?,contentVersion,ruleset,definitionVersion,waveIndex,encounterId,status,combat`；保留一次 legacy-v2 兼容路徑 |
| `GroundDrop` | `id,version,payloadRef,provenance,position,state: falling/available/claimed,claimRemainingMs`；LootCreated即取得ground所有權，死亡與落下等待完成才available；stable order、不以動畫callback判斷可領 |
| `LootProvenance` | `origin,runId?,encounterId?,stageId?,waveIndex?,enemyId?,eventId,rewardSlot,lootTableId,challengeId?`；舊 pending 用 legacy-pending |
| `CollectionState` | 永久 equipmentHighestQualityByDefinition／gemHighestGradeByKind／petHighestQualityBySpecies／petHighestLevelBySpecies、rewardClaimIds／selectedPresentationIds；key集合即發現清單，消耗／放生不刪歷史。兩species曾達Lv6由最高等級判斷，區域全通由WorldProgress推導。主要外觀是已確認方向；本批先非數值獎勵仍是推薦，不寫成只准外觀 |
| `Loadout` | 持有 ID／observed version／位置／旋轉／pet ID，不複製物件或寶石；槽數與全成全拒政策依 D08 提案 |
| `TrackingState` | equipment／gem 目標、品質／級別、數量、來源；owned 與缺料由目前庫存推導，不存第二份可變計數 |
| `UserSettings` | 持久 autoRepeatEnabled、音量／靜音、減少動態等核准偏好；autoRepeatEnabled只有這一份canonical值 |
| `LifecycleState` | resumeRequired、pauseReasons、pendingChoice、exitRequest?；引用設定衍生許可，不再存第二個重打布林 |

Region／Stage／ItemDefinition／GemType／Effect IDs 分型別。r2 候選區域為 `verdant / ember / moonwell / mire / gale / frost / astral`，關卡 `01..10`；由 01／09 核對後 04 凍結。舊 `verdant-1` 是未實作的 r1 提案，不需要別名遷移。

## 2. 戰鬥快照與命中進度

```ts
type HitClass = 'primary' | 'extra' | 'proc';
type ImpactCursor = {
  rootActionId: ActionId; hitIndex: number; targetOrdinal: number;
  phase: 'waiting' | 'ready' | 'action-complete';
  lastResolvedHitId?: HitId; remainingTicks: number;
};
type ActionSnapshot = {
  sourceId: EntityId; sourceVersion: number; sourceStillEligible: boolean;
  stats: CombatStats; mechanics: readonly MechanicSource[];
  beforeActionResolved: boolean; chargeMultiplier: number;
  hitPlan: readonly HitPlanEntry[]; cursor: ImpactCursor;
};
```

以上為契約示意，沒有程式交付。hit plan 包含 class、coefficient、targetPolicy、effectSourceId；可獨立排程的class只限primary／extra。匕首兩次基礎命中為primary，詞綴真連擊為extra；連鎖／機制擴散等proc只作父impact內有限子結果，沒有自己的等待slot或中途提交。事件仍標HitClass=proc，不混算直接命中。G1-feedback-01保留額外最多三次的提案，依序為「本武器第一段主擊原始傷害」的0.15／0.10／0.05倍，各自暴擊／扣甲／吸血；係數是已接受用於首輪實測的候選，不是平衡已驗收。先前0.50／0.30／0.20草案已撤回；匕首／杖的主擊基值與倍率讀D02，不能把所有武器額外擊直接乘整件D。

CombatSnapshot保存hero／敵HP、round／stage、queue／index、ActionSnapshot、round source snapshots、hookCursor／hookResolved、到期輔助、敵我各自毒層／期限／來源、蓄力／護盾／合作／proc budget、死亡／完成水位。hitId=`rootActionId+hitIndex+targetOrdinal`，cursor指下一個未提交impact；最多直接impact讀D02（廣域杖5+3=8、風匕3+3=6），不能硬限5。ImpactOrigin區分weapon-direct／pet／enemy／dot／gem-proc／retaliation，只有weapon-direct具本武器crit及吸血資格。不得只存動畫幀或未保存的暴擊抽樣。

同輪武器依 row→col→ID 入列，來源數值／機制凍結。整理不重建已消耗 action；移除來源在該庫存transaction同時標記本輪cancelledSourceIds與餘hit取消，重裝不能補打；新增來源、重洗／升品下個新回合生效。純跳過也保存cursor，不能刷新後復活舊action。HP=`min(oldHp,newMaxHp)`，營地／整理／讀檔不補血。新 attempt 補血依 D04。

## 3. ReadModel、命令、拒絕碼

```ts
getReadModel(): Readonly<ReadModel>
preview(command: PreviewableCommand): Result<CommandPreview>
validate(command: Command, state: Readonly<GameState>): Result<ValidatedPlan>
dispatch(command: Command, envelope: {
  commandId: CommandId; commandSeq: number; expectedRevision: number;
  confirmedPreview?: PreviewToken;
}): Promise<Result<TransactionReceipt>>
```

ReadModel 包含完整 equipped grid／footprints／品質／旋轉／selection、warehouse、獨立詳情、最多五敵 battlefield、地物清單、hit 進度、世界、保存狀態、追蹤、autoRepeatEnabled 與衍生 canExecute／canRepeat／blockedReasons。戰鬥 UI 必須能畫完整背包，不只縮圖。10 不自扣材料、判定暴擊或以動畫回呼推進規則。

| 命令族 | payload／規則 |
|---|---|
| world.start／continue／enterCamp／abandon／repeat／next／setAutoRepeat／selectChallenge | stage／challenge／run reference；setAutoRepeat 只改偏好，不解除 blocker |
| world.chooseFirstReward | rewardId／選定gem type；只接受awaiting-choice，中央一次生成指定drop，不直接入庫 |
| inventory.place／stash／rotate／sort／lock／discard／expand／spendPoint | ID＋version＋位置；排序只改倉庫，不改攻序 |
| synthesis.item／pet | 主體／材料 IDs；拖曳與獨立合成區共用一次 preview／確認 |
| salvage.single | 單件、先卸下、不能鎖；退寶石與粉塵同交易 |
| customize.reroll／socket／removeGem／replaceGem | item／socket／gem key／成本版本；整組付費覆蓋，免費拆裝仍原子 |
| pet.activate／release | 沿用出戰／經驗限制；無自動合成或新增寵物鎖 |
| loadout.save／apply／rename／remove | slot／持有 references；缺件、碰撞、容量、寵物預驗，全成全拒提案 |
| tracking.set／clear、collection.select／claim | 裝備或寶石目標與數量；追蹤不自動出發，收藏去重 |
| loot.pickup | dropId／version，tap／proximity／stage-exit 共用同一交易 |
| lifecycle.pause／requestContinue／visibility、settings.update | 限定來源 reason、音量／減少動態；沒有 autoItems／autoPets |

固定拒絕碼：`NOT_FOUND / NOT_OWNED / STALE_VERSION / COMMAND_CONFLICT / ALREADY_APPLIED / COMMAND_TOO_OLD / PAUSED / RESUME_REQUIRED / REQUIRED_CHOICE / NOT_IN_ALLOWED_MODE / STAGE_LOCKED / ACTIVE_RUN_EXISTS / INVALID_PLACEMENT / DUPLICATE_REFERENCE / WAREHOUSE_FULL / PET_CAPACITY / GEM_RETURN_INVALID / LOOT_NOT_READY / GROUND_UNCLAIMED / LOCKED_MATERIAL / EQUIPPED_SALVAGE / ACTIVE_PET_MATERIAL / INVALID_PAIR / QUALITY_MAX / INSUFFICIENT_RESOURCE / GEM_INCOMPATIBLE / LOADOUT_MISSING / CONFIRMATION_REQUIRED / SAVE_FAILED / SAVE_CONFLICT / SAVE_READ_ONLY / UNKNOWN_CONTENT`。details 帶阻擋 IDs／缺件／缺料，UI 映射短文案。

合法合成抽到失敗仍 `ok:true`、receipt=`synthesis-failed`，不是驗證拒絕。取消 preview 零副作用／零抽樣／零 receipt。沒有任意 gem 999 上限或因此衍生的 gem discard 命令。

## 4. 原子經濟與去重

1. 單一 committer 串行受理；快速連按共用 commandId，payload fingerprint 防同 ID 異內容。
2. 驗 revision／物件 version／ownership／鎖／出戰／成本／完整淨返還容量。拒絕不抽 RNG；preview 不偷抽新詞綴。
3. 副本計算、複製 RNG 游標，主物／材料／寶石／資源／成長／IDs／事件／receipt 同候選。
4. 單一 IndexedDB readwrite transaction 內比對 revision，再寫 previous-valid／current；transaction complete 才成功，put success 不算。
5. 成功才發布記憶體與事件。abort 不前進 state／RNG；完成後 ACK 遺失讀回 receipt，不重抽或扣。

`TransactionReceipt={transactionId,commandId?,commandFingerprint?,revision,eventRange,outcome,consumedIds,createdIds,rngBefore,rngAfter}`。推薦近期128筆命令 receipt＋永久 lastAppliedCommandSeq；窗口內回原結果，窗口外舊 seq 回 COMMAND_TOO_OLD，不重做。戰鬥用 run／impact／完成水位；舊 run 重放拒絕，同關新 run 合法發獎。

同 definitionId／品質可合成，不要求詞綴相同；區域變體同 baseKind 不等於同品項，D06 推薦精確 definitionId。90／80／70／60／50%、失敗材料限定、無保底沿用已確認規則。主物 ID／詞綴／寶石保留，只補升品質新增槽；材料寶石成功或失敗均退回，先驗證，不能抽完才判定空間。鎖主物可升質，鎖材料拒絕。粉塵無遊戲上限，只驗非負安全整數。

詞綴驗證依rollVersion／rolledQuality／origin，不拿物件升級後的新品質範圍否定舊數值；升級逐條保留原值與provenance，新增槽才用新品質。starter固定critChance+5pp是T05明示特例，不能以白掉落池10～20pp判壞檔或強制補成10；整組重洗才全部按當前品質重抽。

寵物保留較高累積 XP 的實際個體與 ID，同 XP 才選定主體；雙方都不可出戰。05 重算等級／里程碑，不加 XP；07 將保留者、材料、品質與成長放同一交易。

## 5. 每個命中提交、中央獎勵

```ts
resolveImpact(context: CombatContext, rng: RandomSource): CombatOutcome
resolveHook(context: CombatContext, rng: RandomSource): CombatOutcome
resolveRewards(intent: RewardIntent, context: RewardContext,
               rng: RandomSource): RewardPlan
```

CombatContext 只讀戰鬥／來源快照／modifiers／content／clock；05 輸出候選與有序意圖。一次直接命中及立即後果為一個 impact transaction：暴擊抽樣、傷害、吸血、狀態／有限 proc／反傷、死亡、XP／所有 drop slots、RNG 與 cursor 同提交。有限 proc 併主 impact，不能保存一半再重複觸發。r1「整個武器所有命中才一次提交」撤回。

多目標以固定targetOrdinal分impact，可在兩目標間暫停。已死目標不再受傷或抽暴擊，後續hit依D02穩定存活目標政策選取。反傷資格在impact開始凍結，即使該敵在本擊死亡仍反制；英雄反傷致死取消餘hit，不能靠未發生吸血復活。若末敵也死，死亡優先：保留該擊XP／loot，但不StageCompleted／首通獎。capacity在完整impact後阻擋下一個；death與capacity可同存，清容量不能略過死亡選擇。

EnemyKilled 只由14唯一 sampler處理，13建 ground drop；HP歸零／死亡水位／XP／RNG／掉落 IDs 同一筆。單 impact 若有多殺不能部分發獎。08 於成功 pickup 才發現；LootCreated 不算。starter／遷移已持有另初始化，legacy pending 撿後才發現。

最後敵人死仍保留到期護符／寵物與本輪英雄毒等必要後果；英雄仍活、後果完成且無blocker才以獨立completion transaction保存StageCompleted／永久進度／首次狼／完成獎勵。英雄已0則不靠後續支援復活。不得在最後一擊提早首通，也不因載入敵全死再發擊殺。

T08挑戰追加獎勵同屬completion，rewardId=`runId/challenge-clear`（T08的attemptId即runId）：裝備／寶石機率與固定粉塵量只讀同版01 T08，由14一次建立ground，和完成水位／RNG同筆；不是boss擊殺slot。英雄同歸死亡無challenge-clear，一般擊殺loot仍保留；同關新run可再領，重載同run不可重領。

r2 的 V02 首次正式通關自選 I 級機制石是 D06 新提案：`first-cleared-verdant-02-gem` ledger 為 `unearned / awaiting-choice / chosen { kind,dropId }`。completion 只進 awaiting-choice；選擇命令經14唯一reward入口一次保存種類、固定ground drop與chosen，無RNG，再走同一pickup。未選屬必要選擇並設resumeRequired，阻擋重打但不關偏好；選完仍須明確continue，刷新不換已選石。遷移不補發，舊檔第一次正式重打V02完成才可取得，不共用首狼旗標。

事件共同欄位：`eventId,eventSeq,transactionId,runId?,encounterId?,sourceId?,targetId?,effectId?,rootActionId?,hitId?,hitClass?,payload`。種類：`HitResolved / ActionResolved / DamageApplied / HealApplied / ShieldChanged / StatusChanged / EnemyKilled / StageCompleted / LootCreated / LootPickedUp / ItemDiscovered / PetProgressed / InventoryChanged / TransactionCommitted / RunEntered / CampEntered`。ActionResolved 只標全部 hit 完成／取消，不再傷害一次。

11只看committed events呈現死亡→落下→落地→撿取→入庫；不由動畫callback發獎。LootCreated先存falling／claimRemainingMs=440，即死亡180ms接落下260ms串行。每50ms前景tick遞減並clamp到0，第8tick剩40ms不可領，第9tick=0才提交available；規則量化為450ms，不增加subtick排程。純倒數可checkpoint，falling→available由13生命週期plan交14同一committer保存，零RNG／不轉庫存；完成前pickup回LOOT_NOT_READY。營地／死亡結算入口可在同一生命週期transaction完成既有drop落下，ID／payload不變；不推combat clock／RNG／回合、不新發或直接領物。背景不遞減，load先保留欄位再按營地入口規則歸0。讀檔不補播已完成聲音；reduced-motion不改可領時點或交易結果。

## 6. 時鐘、數值與機制 hook

`SimulationClock.advance(deltaMs,blocked):Tick[]` 沿用50ms步進、不補背景；超過既有1000ms懸置門檻重設牆鐘基準。r2 推薦武器 action 仍0.5秒，所有 hits 在其中分配呈現位置；hitIndex 是規則進度，非動畫快慢／攻速。單 tick 可有多個有序到期 impact，各需成功提交才前進；storage gate 凍結、不追趕。IDB提交耗時不是零，15須量測，不能用紙上0.5秒假稱實機節奏。

1. RoundStart 凍結 source／stats／mechanics／位置序，建立 primary／extra plan、輔助與敵列。
2. BeforeAction處理蓄力；每武器直接impact：凍結目標／反制→crit→護甲／減免／盾／實際HP傷害→實傷吸血（raw=實扣HP×lifesteal，先套healingBonus／減療，再以一輪maxHP30%的最終合格治療量budget夾限，最後分實補／過療）→gem_ward過療盾→gem_venom對仍活且實扣HP的目標加層→gem_bond計直接命中→gem_sweep→gem_chain（只由原直接擊殺）→凍結反傷。所有死亡／獎勵同筆；HP0即停止餘hit。精確矩陣／上限讀D02/D06。
3. 到期護符→寵物→敵方毒層tick→存活敵依序→英雄毒層tick→死亡／RoundEnd。敵全死仍執行本輪到期支援及英雄毒；已HP0不靠後續支援復活。敵被動／護盾／減療／反傷全部05執行。
4. 敵清空仍先到期輔助；capacity／manual／hidden 在 impact／hook 邊界阻擋。完成後才 wave／stage completion，不增回合。

`MechanicSource={effectId,sourceId,sourceKind,definitionVersion,parameters}`，來源為裝備特色／gem／pet／enemy／challenge；StatModifier不帶trigger。12提供collectStatModifiers／collectGemMechanics，05唯一resolver。六寶石type為venom／charge／ward／chain／sweep／bond，effect IDs為gem_venom／gem_charge／gem_ward／gem_chain／gem_sweep／gem_bond。品質級別屬同一機制參數，不建18套resolver。疊加／係數／上限與敵方／寵物表依01 r2，不沿用r1四屬性寶石／毒proc詞綴。

T01的boss effect catalog：enemy_armor／enemy_escort_guard為受擊修正；enemy_thorns在每來源action首次直接命中凍結反制；enemy_cleanse→enemy_regen依序於該敵行動前；enemy_barrier到期取代攻擊；否則enemy_double決定兩擊，enemy_heavy／enemy_frenzy乘傷，再處理enemy_suppress_healing。精英／裝備／寵物的exact IDs引用T03／T07同版清單，04凍結成單一聯集，05不在各檔重命名。

T03的22品項共用以下完整行為ID；數值只放09內容表，不在12再硬編一份：

| catalog來源 | effect IDs／作用 |
|---|---|
| 共通武器 | weapon_single／weapon_flurry／weapon_low_hp／weapon_area_three |
| 區域武器 | weapon_scout_flurry／weapon_front_bow／weapon_area_five／weapon_pierce_bow／weapon_feather_flurry／weapon_focus_single |
| 防護與戒指 | armor_vitality／shield_defense／ring_attack／shield_kiln／ring_lantern／armor_moss／ring_wind／armor_frost／ring_bond；提供T03固定數值與局部基礎差異，不偽裝成可roll詞綴 |
| 週期護符 | charm_periodic_three／charm_dew_three／charm_periodic_two；讀回合，不另開秒制cooldown |
| 普通G/H | enemy_guard_armor／enemy_heal_ally |
| 七區精英 | elite_barrier_cycle／elite_armor／elite_spawn_barrier／elite_venom／elite_double／elite_healing_suppression／elite_cleanse |
| 靈寵里程碑 | wolf-l3／wolf-l6／wolf-l10／fairy-l3／fairy-l6／fairy-l10；T07的回合命中／治療條件及當次力量由05計算，不給寵物武器crit／吸血／局部gem資格 |

venom／charge／chain／sweep為武器局部，ward／bond為全隊最高grade aura。同件重複同kind只啟用最高grade，各件局部機制依source各算；ward/bond不因多件倍增。gem_venom只由直接hit實扣HP>0疊層，直擊全被盾吸收不疊；已附毒tick穿固定護甲及盾，不能暴擊／吸血／再次觸發寶石。毒層保存來源威力／剩餘tick，來源卸下不清已附毒。charge以run+source保存、跨波保留，newrun才歸0，卸下重裝不充能；第一次有效impact同筆增加充能、保存chargeMultiplier及beforeActionResolved，後續hit／reload沿用，空目標取消不充能。bond層在實際寵物動作消耗，狼無活敵跳過不消耗，換寵／newrun清0。移除生效ward/bond時依T06立即夾低盾／層數，無aura則0，裝回不補狀態；新加入aura也到下輪才生效。HP／防禦被動即時重算是T09明示例外。

proc 帶 parentHitId／depth／triggerPolicy，推薦 depth≤1。primary／extra 各自 crit／實傷吸血；chain／sweep次級傷仍經普通固定甲／L減傷／盾，但無crit／吸血／on-hit／再proc；DoT／寵物資格依明確矩陣，不能把所有 damage 當直接hit遞迴。round-start／DoT／round-end 用持久 hookCursor／hookResolved，HP／狀態期限／死亡獎勵同一次 hook transaction，不暗加0.5秒。

## 7. RNG 注入與抽樣順序

推薦中央三流 combat／reward／crafting，各存 algorithm／seed／state／draws。重洗不改下一掉落含詞綴，暴擊次數不改合成，視覺不碰規則 RNG；代價三組游標。單流是較少欄位的 D10 替代，但功能互改結果序列。

算法候選 xorshift32-v1：非零uint32、位移13／17／5、輸出uint32／2^32。04固定算法向量，seed factory注入；葉不得Math.random。遷移用原文摘要＋物件ID獨立決定論流。

| 操作 | 流／順序 |
|---|---|
| 武器直接 impact | combat，source→hitIndex→targetOrdinal；每合法weapon-direct一次crit draw，含0%／100%端點固定對位；死亡目標不抽，pet／enemy／dot／確定性proc／反傷不抽crit |
| 有效 kill | reward：裝備判定→品質→品項→詞綴槽類型／值；蛋判定／物種／品質；寶石判定／種類／級別；材料判定／數量；固定結果不抽，多殺依敵stable order。沒有challenge-clear slot |
| completion | reward：符合資格的固定首狼→challenge-clear裝備判定／品質／品項／詞綴→寶石判定／種類／級別→固定粉塵；固定結果不抽。自選石只建立awaiting-choice，選擇另筆無RNG；已領不抽不發 |
| 合成 | crafting，一次成功判定；成功裝備才補詞綴，失敗不抽補槽；寵物無詞綴 |
| 整組重洗 | crafting，槽index→合法stat→值；候選池縮減，不無限重抽 |
| 退寶石／拆解／配裝／pickup | 無RNG，不能改下一次合成或掉落 |

`RandomSource.next():number` 由14在候選中注入。12生成新掉落詞綴用reward，重洗／升品用crafting，遷移獨立流；不得自行選流。09／10／11拿不到此port。RNG與結果同存，abort丟棄候選。

## 8. 自動重打設定、暫停與地物

PauseReason=`manual / organize / capacity / hidden / camp / load / save-error / save-conflict`，04定義，各來源只管自己原因。autoRepeatEnabled 持久，只有玩家切換才改；任何整理／暫停／容量／營地／背景／讀檔不能設false。推薦新檔及原本無同關重打的legacy預設off；autoItems／autoPets不能映射成重打。

許可全由同一state衍生，不另存running：`baseAllowed=visible && !resumeRequired && pauseReasons.empty && !pendingChoice && !storageGate`；`battleAllowed=baseAllowed && run.status==='combat'`；`groundAllowed=baseAllowed && (combat或正常wave-entry/travel或settlement或exit-wait)`；`canRepeat=autoRepeatEnabled && baseAllowed && settlementReady && exitReady`。同一50ms clock分派兩類timer，沒有第二牆鐘。正常前景波入場／步行、結算1秒／離關等待不再出手，但繼續既有地物落下倒數，避免最後一擊掉物永遠無法落地；manual／hidden／capacity等真正pause仍全部凍結。LOOT_NOT_READY只等待，不加capacity；storageGate兩類皆停。UI的canExecute指battleAllowed，不用它一併封死ground。所有gate都不改偏好。

| 模式／事件 | 保存／恢復 |
|---|---|
| 啟動／讀檔 | 保留偏好、必營地、load pause、resumeRequired；明確continue。死亡／必要結算先選，不被continue略過 |
| manual／organize／camp | 保留HP／hit／hook／偏好，設resumeRequired；關面板只移除organize，continue仍驗其他blockers |
| hidden／鎖屏 | 停clock、保留偏好、設resumeRequired；前景只清hidden，不清manual/capacity/organize，不追時間 |
| capacity | 實際待領物不能入庫才觸發，裝備倉庫剛好60但沒待領裝備不空停；整理／pickup後重驗，清原因仍待continue，不需重開偏好 |
| death／必要settlement choice | pendingChoice持久；明確retry／camp／next等。偏好不能死後自動滿血重開 |
| 成功且已授權同關循環 | 無任何blocker時只同stage／challenge，新關仍手動 |
| save-error／conflict | 停會寫入命令、可檢視匯出；明確重試／讀回後continue，開始鍵不能解除原文保護 |

地物於死亡／營地／背景／load保留同ID與來源，營地可看全清單並按上述完成既有落下。容量檢查可在falling階段即針對實際payload辨識不能入庫，完整impact後立刻停；不能等動畫走完偷多打。r2換關／重打前按stable order逐件共用pickup：成功一件原子保存一件；容量拒絕則保留剩餘並停止離關。尚未落地是暫未可領，不是假capacity。這是可恢復流程，不是r1全批全成全拒；已領不倒回，不必留一格，剛好滿60仍可出發，下一件裝備實際不能收才停。

裝備邊界明列：倉庫59件可再收1件成60；60件且無待領裝備不產生capacity；第61件是保留原ID／payload的待入倉地物，不會先寫成61件再刪除。整理移出或手動消耗一件後重驗pickup，仍須明確continue；套配裝、卸下及合成按整筆淨容量預驗，不只驗操作前件數。寵物另驗29／30／第31隻待領，寶石仍獨立堆疊。現有原型共用`CAPACITY=30`不能整個改60而連帶改寵物；04/14需凍結兩類各自容量值，這不要求新增容量API或保存欄位。

`exitRequest={requestId,fromRunId,targetStageId,challengeId,reason,nextDropId?}` 保存離關意圖；待領全處理、run可離開、玩家許可仍有效才另筆新run。刷新回營地不能自行接續開run；取消清exitRequest，已領保留。未領不跨新run囤地倉，不設任意ground硬上限／自動丟物／999寶石限制。

G1-feedback-02的prepared驗收以01／03同版「各進度成熟配裝＋起始庫存」為準，不再使用5/30、25空位的舊主條件。每例明列合法裝備／寵物／寶石、已通關關卡、起始倉庫持有量與空位；裝備空位=`60−warehouseCount`，寵物空位=`30−petCount`（含出戰，30仍是D07候選）。ground=0、必要獎勵已處理、玩家明確繼續且重打已開；從新run第一波入口開始，不從殘血頭目起算。這些是驗收準備條件，不新增出發必須保留固定空位的玩法限制。各庫新增第「空位+1」件才阻擋，剛好滿而無待領物不提前停；寶石正常pickup／退回亦驗證，無100／999任意上限。

低、中、深關分別使用合理成熟配裝與相應速度；包含成熟配裝快速刷熟低關，另列速度／庫存敏感度及極端壓力情境。不得把所有深關都假定21秒作全域掉率的唯一依據。固定配裝、擊殺時間和獨立掉落假設的紙算，與未來由引擎產生真實傷害／生存／回合／升級／速度的實測分開。觀測至少900秒前景，不能靠死亡、背景、保存延遲或不撿取達標。聯合不中斷機率≥95%仍是待核准門檻；同時列首容量停止期望、提早阻擋風險、裝備收穫與同品同質合成材料等待，不把均值當每次保證。掉率、起點、時間及風險只引用01 T04／T08／T10與03，不複製第二張掉率表；本次確認60件不代表任何候選掉率獲准，G1後04才凍結被接受的contentVersion。

## 9. 追蹤與 read projection

```ts
queryLootSources(target: EquipmentTarget | GemTarget,
  progress: Readonly<WorldProgress>, content: ContentRegistry): LootSourceView[]
getTrackingView(target: TrackingTarget, inventory: Readonly<InventoryState>,
  progress: Readonly<WorldProgress>, content: ContentRegistry): TrackingView
```

08擁有查詢 runtime，09供來源與經濟表。TrackingView含目標品質／級別／需求、已開／未開來源、持有量（裝備中／倉庫，寶石庫存／已嵌入分列）、缺少數、對應操作材料缺額。地物未撿另列available-on-ground，不算可消耗owned。缺料由07／12同一preview投影：一次合法合成還缺幾件同definition同quality未鎖材料、整組重洗還缺多少粉塵、鑲嵌還缺指定type/grade幾顆。不能把期望92白裝寫成保證升金材料，也沒有寶石合成配方；已嵌寶石分列可免費拆下，但不冒充可立即消耗庫存。

收藏發現與持有量分開：pickup／starter／合法遷移更新對應永久最高品質或級別；升品成功更新最高品質，失敗不更新；寵物升等同成長交易更新species曾達最高等級。消耗／放生不刪歷史，但追蹤owned立即減少，不因缺現存物而撤銷已達收藏里程碑。追蹤只導向關卡詳情不自動出發。完整背包、詳情、獨立合成區都共用read model／preview，無第二經濟入口。

## 10. 葉模組 API／fixtures／registry

| owner | 預定 exports／注入 |
|---|---|
| 05 | resolveImpact／resolveHook／recalculatePetGrowth／evaluateCooperation；唯一primary-extra-proc／cursor owner |
| 06 | planWorldCommand(WorldCommand,WorldContext):Result<WorldPlan>；getExecutionPermission(state,visibility)；planStageExit(ExitRequest,GroundReadPort) |
| 07 | previewInventory；previewSynthesis(input,context,CustomizationPort,PetGrowthPort)；previewSalvage(itemId,context,GemReturnPort)；純計畫／完整淨返還 |
| 08 | planLoadout／discover／queryLootSources／getTrackingView／planTracking |
| 09 | regions／stages／enemies／gearEffects／petCooperation／petMilestones／lootTables／challenges／collections／affixes／gems／economy常數；無sampler |
| 10 | render(model,dispatch):View／dispose；完整戰鬥背包、整理、詳情、合成、追蹤，不自改state |
| 11 | createBattle／showCommittedEvents／releaseVisualManifest；最多5怪、逐hit與掉落視覺，不發物 |
| 12 | initializeAffixes(item,policy,rng)／extendForQualityUpgrade／reserveReturnMaterialsGems／previewGemCommand／previewReroll／collectStatModifiers／collectGemMechanics |
| 13 | planGroundDrops／planPickup(dropId,context,InventoryPort)／getPendingPickupBlockers／planNextExitPickup／applyLootLifecycle |
| 14 | 唯一resolveRewards／dispatch／commit、registry、migration；撤掉舊direct-to-inventory／auto merge |

InventoryPort提供validatePlacement／projectNetInventory／planTransfer；完整驗每個type+grade返還數、非負安全整數及引用，無遊戲堆疊上限也不能跳過交易驗證。CustomizationPort提供新增槽／退寶石；PetGrowthPort只重算不給XP。

各Plan均為純候選，不保存。最小共同簽名如下；型別欄位由上述canonical state與04 fixtures提供，不引入通用DSL：

```ts
type InventoryPort = {
  validatePlacement(input: PlacementInput, state: Readonly<InventoryState>): Result<PlacementPlan>;
  projectNetInventory(moves: readonly InventoryMove[], state: Readonly<InventoryState>): Result<InventoryProjection>;
  planTransfer(input: TransferInput, state: Readonly<InventoryState>): Result<TransferPlan>;
};
type CustomizationPort = {
  reserveReturnMaterialsGems(items: readonly ItemInstance[], inventory: Readonly<InventoryState>): Result<GemReturnPlan>;
  extendForQualityUpgrade(item: ItemInstance, next: Quality, content: ContentRegistry, rng: RandomSource): ItemCustomizationDelta;
};
type PetGrowthPort = {
  recalculatePetGrowth(pet: Readonly<PetInstance>, table: MilestoneTable): PetGrowthResult;
};
planPickup(dropId: DropId, context: GroundContext, inventory: InventoryPort): Result<PickupPlan>
planNextExitPickup(exit: ExitRequest, context: GroundContext): Result<DropId | 'exit-ready'>
planLoadout(input: LoadoutCommand, state: Readonly<GameState>, inventory: InventoryPort): Result<LoadoutPlan>
collectStatModifiers(item: Readonly<ItemInstance>, content: ContentRegistry): readonly StatModifier[]
collectGemMechanics(item: Readonly<ItemInstance>, content: ContentRegistry): readonly MechanicSource[]
```

04提供可編譯port stubs／只讀fixtures解耦：1–5敵、primary-extra-proc、hit前後／多目標中途／反傷死亡、完整48格view、裝備倉庫59／60／第61件待領、寵物29／30／第31隻待領、各gem返還、重複pickup、逐件離關中斷、偏好true配各pause、legacyv2舊30件保留並適用正式版60件上限、追蹤owned/embedded/missing、兩頁revision競爭。seed／預期值依03及核准表，不沿r1三敵／999／關偏好／整action原子fixture。

registry只由04/14明確import組裝：09data→05/12純函式→07庫存→08引用追蹤→13ground→06world→14reward/commit→10/11view。是注入關係，非要求葉分支互相先merge。新enum／API／effect／schema先送整合owner改版本和fixtures，不以as any猜接。

## 11. 草稿互核與G1

r1撤回：小世界、白裝零詞綴、紫色才孔、四屬性寶石、999上限、任一滿庫全局停、離關必全收且留格、pause關重打偏好、整action無法部分續接。皆不可當實作規格。

保留提案：單一committer／sampler、preview零RNG、receipt去重、原文備份、legacyv2精確續戰、unknown必要內容停寫、IDB revision原子提交。已互讀01設計／UI／完整T01–T12，以及03兩份規劃；已對齊逐impact、15/10/5追加係數、純數值詞綴／六機制寶石、永久收藏最高歷史、挑戰完成獎勵、逐件離關、持久偏好／執行許可、440ms地物與共用時鐘。草稿對齊不等於玩家批准，未發現需另開功能才能解的文件衝突。

feedback-02互核：01的M-EARLY空55件、M-MID／M-LATE／M-RETURN空50件及45空敏感性，寵物皆20空，與03準備資料及本契約容量公式一致。B首輪推薦與C備選都只是內容表候選，不需新增交易入口；固定非暴擊紙算、25秒深關快側未過及未來引擎測量明確分開。60件UI計數、59／60／61邊界、舊30件遷移與60件快照效能樣本已交叉核對；沒有把文件一致當成掉率或95%門檻獲准。

待G1：已確認裝備倉庫60件；已接受的連擊方向與首輪係數候選、15分鐘目標維持。D01–D10其餘推薦、寵物30容量候選、聯合95%門檻及全部掉率仍待核准。feedback-01兩張低供給表不再作推薦預設，不能由容量確認推導其批准。04只有在明確G1後才凍結API與exact base。本次精準同步02契約、保存容量邊界與檔案責任註記；無遊戲碼／測試／玩家存檔／git寫入，未開始04，模擬／真機／真人長期實玩未執行。
