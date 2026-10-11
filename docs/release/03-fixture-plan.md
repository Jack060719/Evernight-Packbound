# Task 03：測試資料與可重播方案

> 2026-10-08 狀態更新：使用者已明確核准 G1，本輪只完成 Task 04。B掉率及15/10/5仍是首輪實測候選；prepared 55/50裝位、20寵位與95%目標納入驗收。本文保留提案歷程，文內整體G1／04授權的舊時點描述由本註覆蓋；不覆蓋已排除功能，也不代表S/C替代方案獲採用或測試已通過。凍結API、實作範圍與證據見 [04交接](04-contracts.md)；05–19仍未啟動。

版本：integrated-v2-r2／G1_PENDING。追補：G1-feedback-02。基線：1e2ac7e891835e85f9f31b02a1166cd99f9cbb52。日期：2026-10-08。Owner：Task 03。

已讀使用者接受的Task00完整對話回報、最新《正式版規劃修正指令》與整合包／舊八文件。00不是新系統已存在的證據；歷史59測試不是本輪成績。此檔只規劃資料欄位、seed、預期與後續owner，沒有建立fixture JSON、跑runner、讀寫玩家存檔或修改測試。01／02 r2候選需G1核准，與r1衝突的資料不復用。

G1-feedback-02局部修訂：裝備倉庫60件已確認；弱連擊方向、15/10/5首輪係數及逐擊規則保留。約15分鐘免容量操作目標不變；F-IDLE改按初期55裝空、中後及返刷50装空、皆20寵空，提出B首輪掉率與S/C對照。這些起點、掉率與聯合95%仍待核准；旧30倉低供給主案與60倉減供約81%表不再作有效候選。只更新受影響資料，不開始04。

驗收總矩陣、故障X0–X9及C/P標記見[03-test-plan.md](03-test-plan.md)。以下F-代號是測試資料家族，不是已存在檔案。將來只在隔離測試context使用，禁止匯入玩家origin。

## 1. 共通資料封套、seed與重播

每份fixture預期具有：fixtureId、fixtureRevision、baselineCommit、approvedDesignVersion、contractVersion、ruleDecisionRefs、來源（人工legacy原文／批准表展開／指令重播）、rawSource與sha、contentRevision、initialState、三RNG初值與游標、clock、commands、faultSchedule、expectedEvents／stateDiff／resourceLedger、evidenceStatus。fixture ID不能綁死未批准的數字；例如F-WORLD/all-approved-stages，而非F-WORLD/nine-stages。

- raw legacy需人工依真正v1/v2欄位建立，不能先用新schema factory再把version改2；原文字串含空白及未知欄位，備份必逐字相同。
- initialState用真實實體ID、owner、version、位置、quality、affixes、socket、gem stack、petXP、run／wave／round／action／hit／target cursor、ground provenance、repeat偏好與blockers、receipt／序號、RNG完整值。衍生UI模型不是存檔權威。
- expected由批准表獨立算，不能呼叫被測damage／drop計算函式產生答案。數值表改版須改fixtureRevision及預期並記理由，不能換seed掩蓋失敗。
- 記錄command ID、seq、payload、expected revision及模擬時間；Replay固定content與版本。失敗先縮短command trace、保留最小資料，不丟掉產生問題的RNG游標。
- 假時鐘按合法前景tick走；沒有Date.now離線補算。執行耗用CPU秒與模擬遊戲秒分列。

| 組 | 具體seed／抽樣值 | 用途／注意 |
| --- | --- | --- |
| Legacy比較 | 761234、456789、固定0與0.99 | 現有測試曾用；新RNG分流不保證同序列 |
| 機率邊界 | 0、p−2^-32、p、p+2^-32、1−2^-32 | p依批准合成／掉落／crit表；使用可表達界線，注明u<p或核准比較語義 |
| 整合 | 1、42、456789、761234、20261006 | combat=s、reward=(s XOR 0x9e3779b9)>>>0、crafting=(s XOR 0x85ebca6b)>>>0，僅測試初始化規則，不擅定正式種子演算法 |
| 平衡 | 1001…1030 | 每配置×情境30seed，共用種子作成對對照；報樣本與分位 |
| 分布 | 7、101、2027、65537、2147483647 | 每機率row各seed20,000，合計100,000；品質條件row另外100,000 |
| 命令重播 | 314159、271828、8675309 | 每seed最多10,000合法/非法命令，失敗保最小trace；非本輪執行 |
| 逐擊單例 | 指定combat draws [0.9,0.1,0.9,0.1,0.9] | 固定可算crit序列；reward/crafting獨立，不能以combat抽樣改掉落 |

版本未核准的表格可在規劃中明列候選值做A紙算，但不能以同一fixture標成C硬規則。以下預期均由具體D01–D10掛鉤，沒有無主「未定值」。

## 2. 世界與內容完整性

### F-CONTENT（D01／D03／D06／D08）

將每個region row、70 stage rows與10波編成pattern完整展開為≥700列，每列至少：
regionId、stageId、stageOrdinal、waveOrdinal、patternId、enemySlots[{enemyDefinitionId,rank,HP,attack,mechanic}]、bossDefinition、unlockRequirement、challengeContext、dropPoolId、qualityRowId、exclusivePool、gemSource、petSource、firstRewardKey。

預期：

1. region≥7，每region stages≥10，每stage waves≥10；每波1–5敵，6敵為非法內容fixture。每stage最後wave至少1boss，repeat不得換成普通敵。
2. stageId唯一、wave局部順序無洞、敵slotID唯一；pattern引用全存在；不能只改stage數量而少掉真正wave資料。
3. 入門後分支、區內順序可達；在未通前關／剛通前關／分支閾值前後／各區最末關測unlock；不讓metadata排序改解鎖。
4. 七區各有具體機制／敵群變化／專屬裝備。同品質比較不能只寫「後區全部攻擊更高」；每個已列裝備／gem／寵物來源可達。追蹤來源由相同內容表查詢，無孤兒ID或不存在關卡。
5. 所有普通／精英／boss欄位合法；單怪、群怪、精英、boss護衛情境確實出現，不把「最多5」解讀成「全波5」。
6. 品質row和=1，各品質與drop數量非負；條件機率分母明確；區內深處高品質機會提高，另驗每分鐘效率。
7. 每個challenge套用後仍≤5敵且boss保留；不得因加護衛變6敵。一次性贈與與可刷掉落分開ledger。
8. 70關各自展開與內容斷言全跑；I層選每種pattern×每區mechanic／分支／末關／repeat等價類，S層仍輸出全關數表。

本輪A已獨立解析r2 T01的規劃Markdown：70唯一stage、70唯一boss、七區各10關、700波，全部pattern符合1–5敵且末波有B，bossXP均為8×基準NXP。這是文件內容／算術檢查，不是遊戲生成器測試。後續fixture依表展開的rank數如下，Nrank包含N/S/G/H，不能漏算治療者或守衛的普通掉落：

| pattern | 普通階 | 精英 | 頭目 | 每關總敵 |
| --- | ---: | ---: | ---: | ---: |
| P0 | 9 | 0 | 1 | 10 |
| P1 | 19 | 1 | 1 | 21 |
| P2 | 18 | 3 | 1 | 22 |
| P3 | 33 | 3 | 1 | 37 |
| P4 | 22 | 4 | 1 | 27 |
| P5 | 4 | 5 | 1 | 10 |
| P6 | 23 | 3 | 1 | 27 |
| P7 | 22 | 4 | 1 | 27 |
| P8 | 23 | 7 | 1 | 31 |
| P9 | 27 | 9 | 1 | 37 |

### F-WORLD／F-CHALLENGE（D01／D04／D05／D08）

新檔初始、入口末關未過／已過、每區首／中／末、分支未選、結算未選、死亡、repeat中斷各一份。每份同關手動retry／auto-repeat建立不同runId；stageId固定，boss仍在；手動下一關才推進。最末關無不存在的下一關。結算點兩次／重讀／ACK丟失不開兩run。

challenge普通與強化同stage兩run，保存敵修正與reward context；戰中改challenge拒絕，repeat按D08保留同context，不拿新表悄悄改已開run。D08最終候選普通首通解鎖挑戰，全敵HP×1.25/攻擊×1.15、XP不變、E/B加本區指定行為，重複effect不疊。G1-feedback-02的B候選額外裝備10%，寶石15%／固定4粉塵不變，屬英雄存活的StageCompleted來源（attemptId/challenge-clear），不是boss kill來源：原boss裝備與額外裝備各自lootId/來源receipt，刷新最多各一次。同歸於盡留普通kill獎，零challenge-clear；不能把「普通最大1件」當全局上限。

新D05一次獎候選：first-wolf全存檔一次；verdant-02首次正式通過的六選一I級gem，ledger unearned／awaiting-choice／chosen(kind,dropId)。等待選擇是必要阻擋、repeat偏好仍true；選擇後生成地物，不消耗RNG。雙點不同gem只一個選擇成功。舊檔遷移不直接發新gem；既有first-wolf=true不再送狼。名稱與新對應stage以D05核准為準。

## 3. 暫停、保存與舊檔

### F-PAUSE（D04／D10）

每份同時保存使用者偏好autoRepeatEnabled與runtime execution blockers／resumeRequired／necessaryChoice。不能用一個armed boolean同時代表兩者。

| 起始／操作 | 偏好預期 | 執行預期 |
| --- | --- | --- |
| 偏好true，手動pause／整理／camp／capacity／hidden | true不變 | 立即在合法impact邊界停，不推時鐘 |
| 上列阻擋消失但尚未明確continue | true | 依D04仍待玩家繼續，不能自開 |
| 玩家明確continue且無其他阻擋 | true | 續未完戰局，之後沿原同關repeat |
| 偏好false，pause／load／continue | false | 可續本run，結算不自動repeat |
| 讀檔／新開頁面，原偏好true | true | 暫停營地＋需continue，零離線進度 |
| hidden＋organize＋manual，回前景 | true | 只解除hidden條件，其他阻擋仍在 |
| capacity＋manual，拾取容量可容納 | true | 只清符合條件的capacity，不清manual |
| awaiting gem choice／死亡／必要結算 | true | 不跳選擇；continue也不能繞過 |
| 玩家明確切repeat off | false | 唯一合法關閉來源之一，保存後重開仍false |
| 保存失敗／SAVE_CONFLICT | 原值 | 停寫／停執行；不得藉此改設定 |

純gating函式枚舉所有PauseReason集合2^n；I層只建立可到達狀態，每單因、兩兩與全可达組合。測解除一因、不合法continue、關閉確認框/詳情不清別因。

時間表10s前景→hidden15min／一天→回前景仍manual→continue，30/60/144FPS與長主執行緒停頓各跑；RNG／資源／hero／enemy／round／hit cursor於阻擋中不變，不補音效。低操作session不得把阻擋時間當有效戰鬥秒。

正常前景wave-entry/travel、settlement 1秒／exit等待是程序gate，不是真pause：同一50ms clock分battleAllowed與groundAllowed，戰鬥不出手但地物claimRemaining倒數可繼續；manual/organize/capacity/hidden/camp/load/save/resumeRequired或storage提交才凍結兩者。測最後一hit掉物後的440ms能在正常步行或結算走完，不因LOOT_NOT_READY加capacity或卡住repeat；不另造第二牆鐘。營地入口確定完成落下是明示transaction，不能據此對所有pause都自動完成。

### F-SAVE（D05／D10）

人工v1/v2 raw，固定舊英雄hp37／xp630／level7／points1、已分攻擊2／生命1（以真正舊schema表示），21已開格、原item IDs與合法shape、wolf舊累積xp120／quality紫、音量0.31；floor2／wave4／unlocked3、firstFloorReward true/false、pending裝備／寵物各一。XP630符合Lv7，所得6點＝攻2＋生命1＋擴1格費2＋剩1，成功遷移樣本本身合法。需要使用不存在合法欄位時拆成不同case，不能硬塞新欄位假裝舊檔已有。

| 變體 | 預期 |
| --- | --- |
| v1秒制殘餘戰鬥 | 永久資料保留、營地暫停；明示無法精確續舊秒制，不能宣稱恢復相同hit |
| v2 actionResolved=false／true，round3、weapon index0、remaining0.25 | 未結算僅補一次，已結算不重傷；legacy完整map含queue/index/resolved |
| v2最後敵死／舊pending／滿倉／dead／travel／結算 | pending唯一轉地物；dead待手動死亡流程、不因load自retry；legacy只有一次相容run |
| v1/v2合法舊倉30件＋待領裝備／蛋，原raw備份 | 遷移後仍是原30個owned ID，正式60倉有30空；pending轉ground，不因容量放大而自動領、補裝或開打 |
| 舊floor1/2/3×每合法wave1…5×unlock邊界 | D05新世界映射逐項可追，沒有抹掉已取得進度；首次新run使用≥10波，不把所有run留5波 |
| 自然shape修復衝突 | 優先保有效位置，只搬衝突物；ID／品質／XP不變；滿倉按核准遺留所有權保留 |
| 舊auto-item／auto-pet=true | 設定退出、不得觸發合成；與持久autoRepeat是不同功能不可混淆 |
| firstFloorReward=true／false | 真值不重送狼，false依新對應首次機會一次；pending含狼不雙領 |
| 遷移重做2／5次，完整後reload | 新詞綴初始化／地物／獎勵／資源一次，原localStorage key逐字不變 |
| legacy中途camp／organize／save後續打 | 舊HP與已花行動保留，戰中編輯不能重播；相容run結束後營地停且不偷選分支 |

v2原文沒有三RNG／receipt／hitCursor；不得假造其存在。遷移確定性初始化只能按D10批准方案，不能消耗玩家正常reward／crafting三流。保存原文backup與candidate同一IDB transaction完成後才publish；原key永不刪。

### F-CORRUPT／F-STORAGE／F-MULTITAB（D10）

人工壞原文：空／截斷／null／缺hero／version999／字符串NaN與JSON非法NaN／負資源／不安全整數／未知quality、item、pet、enemy、gem、effect／重複ID／ground與stash同ID／activePet不存在／同item兩placement／非法cursor／nextId衝突。unknown必要kind與所有權衝突停止寫入、原文可匯出；不刪未知物後假裝載入成功。明示可修復的舊shape衝突另測，不能一概拒絕或靜默重造。

storage adapter記錄localStorage讀與IDB read／put／abort／complete；X0–X9逐點。put success未transaction complete不等於保存成功；complete後ACK丟失讀回新receipt；abort保舊state與RNG。backup為raw原文非parse/stringify，來源hash同但raw不同拒絕覆寫。普通start／continue／visibility／pagehide不能覆寫損壞資料，不能以更舊v1自動恢復。

兩頁A/B讀revision10，重洗不同item或領同loot，A先／B先各跑，僅一方11，另一SAVE_CONFLICT。A未complete時B不可讀未提交；A abort後B可合法提交。兩頁同時migration只有一current，不重初始化。舊版頁面仍寫v2 localStorage不受IDB鎖保護：檢測來源raw變化並保存差異，不自動合併或覆蓋新進度。私密模式／配額／背景freeze需D真機，stub通過不能冒充。transaction原子不等於硬體必已flush；停電／瀏覽器清資料／裝置故障另列限制，驗可用strict durability與外部原文匯出，不承諾同瀏覽器backup可救被清除的整個origin。

### F-ROUNDTRIP（D01–D10）

所有可保存欄位設非預設：七區開放與stage完成分離；active/legacy run、wave、round、actionIndex、hitIndex、targetOrdinal、phase/resolved、剩餘等待與cancelledSourceIds；HP／盾／DoT／charge；item ID/version/owner/quality/數值詞/孔/石/lock/placement；pet XP/active/里程碑；獨立18候選gem堆與材料；ground來源run/event/falling或available狀態/claimRemainingMs=40；收藏歷史/已領獎；配裝含缺件；equipment和gem追蹤；challenge；autoRepeatEnabled=true但execution blocked；所有合法pause、必要選擇ledger；三RNG游標、command/event seq、receipt、first-wolf、migration metadata、設定。

序列化→load→再次保存，只允許D10明示啟動營地、resumeRequired與衍生值重算差異。偏好、cursor、資源不得被normalization清掉。derived count/里程碑重算不重發獎、不滿血。每欄映射清單防止只測主背包漏追蹤或gem等。

## 4. 戰鬥、真連擊與機制

### F-COMBAT／F-HIT（D02／D06／D10）

基本武器錨點(0,3)/(0,1)/(1,0)，按(0,1)→(0,3)→(1,0)，有護符與出戰寵，round2/3/6/9，hero37HP；1–5敵各一。當輪快照保順序；動作已耗後移位不重播、拆去下一來源skip、新裝等下一輪。source在連擊中卸下取消餘hit，再裝回不可恢復已取消hit；普通pause只凍結不取消。

D02候選逐击表（無護甲、無crit、敵有足夠HP）：

| 武器 | 額外combo | hit係數序列 | 總D係數 |
| --- | --- | --- | --- |
| 一般單擊 | 0／1／2／3 | [1]後加.15/.10/.05 | 1／1.15／1.25／1.30 |
| 原生雙擊匕首 | 0／1／2／3 | [.55,.55]後加.55×[.15,.10,.05] | 1.1／1.1825／1.2375／1.265 |
| 風匕原生三擊 | 0／1／2／3 | [.4,.4,.4]後加.4×[.15,.10,.05] | 1.2／1.26／1.30／1.32 |

白1詞1孔、詞數[1,1,2,2,3,3]與孔[1,1,1,2,2,3]為D06候選，測資料需符合合法池：不能給白裝五詞或把只有高品可抽的combo3塞進白裝成功case。邊界測超上限可用非法input拒絕或由多合法來源相加後clamp，兩者標清。

獨立可算單例：D=100、普通combo3、crit率25%、crit倍率2、吸血10%、draw=[.9,.1,.9,.1]，敵HP足量時傷害[100,30,10,10]、實際傷害150、治療15（假定生命缺額及每輪吸血預算均足）。唯一敵初始HP120則前兩击實扣100+20，吸血12，敵死後無目標，餘擊不再抽crit；另有存活目標時依D02穩定選取下一者。不能對已死敵再計crit/吸血。此為純戰鬥數式邊界，不宣稱D=100是白裝可達配裝。先前.5/.3/.2額外係數已撤回，不留作成功fixture。

每擊獨立crit不是每action只抽一次再複製；D10候選每合法武器直接hit固定一次combat draw（含0%／100%測試端點），死亡或不存在目標不抽，enemy/pet/DoT/proc不借武器暴擊RNG。D02正式候選crit率上限75%、倍率3、單武器吸血25%、全隊每輪吸血預算maxHP30%，以合法數值及超界純函式兩組分測；100%只作RNG介面端點，不偽造合法裝備。測hero快滿血、overkill、護甲、盾吸收。吸血根據actual HP damage，不含過殺或防護吸收。先吸血後反傷候選，反傷致死取消餘hit且一次死亡結算。單action最大直接impact需測廣域杖5主擊＋3額外=8、風匕3＋3=6，不能沿早期普通匕的5hit當全系統上限。

每weapon action固定0.5s，多hit分播於該action內，不新增攻速或額外+.1s；原生匕首兩击同樣0.5s。單一impact及有限立即proc、crit RNG、死亡／drop、cursor同筆保存。AoE逐targetOrdinal，不偽稱同時；每個impact前後跑X3/X4/X5。繼續後不重播已傷害／吸血／發獎，cap/organize可在impact間停；英雄死或來源移除才按規則取消餘擊。

### F-EFFECT（D02／D06／D07）

六類候選gem venom／charge／ward／chain／sweep／bond，各三grade；與純數值affix分開。完整fixture按01來源矩陣展開：
primary直擊／dagger第二基擊／combo額外／sweep目標／chain衍生／DoT tick／pet命中／反傷 × 能否crit／lifesteal／附毒／蓄力／chain／bond計數。每格要有明確預期，不寫「都可觸發」；proc不得遞迴。

- venom：1層、cap−1/cap/cap+1、最後回合、來源卸下、敵死與換波；DoT只一次tick，reload不補重tick。
- charge：累積門檻前／等／後，第一個有效direct impact同transaction增加本run/source計數並保存beforeActionResolved與chargeMultiplier；後續hit、reload、extra不再累積同action。空目標取消不增加，跨波保留、新run歸0；pause／拆下裝回不重領蓄能。F-ROUNDTRIP也必含兩欄非預設值。
- ward：hero満血／不足血、過療0／小／cap，盾已滿、盾吸傷、同action多治療；不靠反覆換裝生盾。
- chain：1HP多敵、5敵、連鎖再殺、DoT殺、pet殺；以核准source trigger，不從secondary無限派生；每enemy kill唯一。
- sweep：1/2/3/4/5敵，父direct impact觸發的有限擴散全部併父交易；不能在proc之間保存半筆。法杖直接AoE才以targetOrdinal分可恢復impact，測目標間容量停／反傷死；第6敵僅非法內容案例。
- bond：匹配與不匹配寵物、無出戰、里程碑前後、combo/secondary計數不超核准cap。拔gem／換寵不中途重置已耗action。
- 多相同gem及不同grade、分裝在不同item，按scope合併，不讓UI顯示值與戰鬥不同；相容性非法要command拒絕。
- 敵方DoT在敵行動前、英雄毒在敵行動後；最後敵已死仍須完成本輪到期支援及英雄毒，後者致死不得首通。英雄已0HP則不能靠尚未執行支援復活。reload的hookCursor不重播同輪毒／治療。
- chain/sweep按普通傷扣固定甲、L減免、盾，毒仍按表穿甲盾；二次傷不crit/吸血/on-hit。吸血預算以最終治療量計：實傷×lifesteal→healingBonus／減療→本輪剩餘maxHP30%預算→實補/過療→ward。具體邊界maxHP100、HP94、本輪已用20、raw吸血20、治療+50%及減療×.8：候選24被餘額10夾限，實補6、過療4、wardI得盾0.8；預算用盡後不再以滿血吸血造盾。

### F-HP／F-PET（D04／D07）

三組獨立HP邊界：oldMax100/hp37→newMax135預期37；oldMax100/hp100→135預期100；oldMax135/hp100→80預期80。換裝/合成主材/重洗/拆石/配裝20次往返不增加HP；波間不回滿；newrun／死亡retry恢復獨立按D04，不以camp往返觸發。

petXP在每里程碑−1／等／+1，兩寵30/150與150/150，兩種參數順序×合成成功／失敗。候選較高XP個體ID保留、同XP選主體；只有出戰者獲戰鬥XP；雙方任一active拒絕合成；active引用不指消耗ID。重算技能/里程碑不重複加成或XP，不新增寵物鎖功能。

## 5. 掉落、收納與所有權

### F-LOOT／F-LOOT-LIFE／F-EVENT（D03／D04／D10）

loot-test-001含originRun=run-A、originStage、enemy=enemy-1、event seq、type/itemInstance或gem kind+grade+quantity、owner=ground、state=falling/available/claimed與claimRemainingMs。D04／D10最終候選LootCreated先ground/falling，死亡180ms＋落下260ms合計claimRemainingMs=440，由前景50ms規則tick遞減至0才available，不由動畫callback解鎖：8tick後剩40ms不可領，第9tick=450ms可領。hidden不減；camp／死亡結算可同ID確定完成剩餘落下，load先保留再由營地入口處理，避免容量pause卡在未落地。kill先持久化生成，再播放；reduced-motion可縮動畫但不自行發獎。tap與near同tick各command指同available loot，唯一成功，另一已領或舊version拒絕。

生命周期交叉：尚未落地／已可撿／容量拒絕 × camp／死亡／結算／retry／switchstage／reload。D04／D10候選營地與死亡保存地物；換關或重打以stable order逐件共用pickup，一件成功存一件、不能領則保留剩餘並阻擋離關；全部處理後另筆建立新run，不跨run囤地倉，也不要求留空格。exitRequest記來源run／目的關／下一drop，刷新先營地並需continue，取消只清離關意圖不退已領物。不得自動丟、重抽或複製。整理入口應在容量阻擋中可達，玩家清出位置後合法pickup；開面板不能清除未解決的capacity。

容量反例：
- stash59、ground1裝備：可收至60，不需留空位。stash60而ground0，不自動假造拾取失敗；繼續／repeat是否允許依D04新表。
- stash60、未領裝備1：第61件拾取拒絕，地物保留；若源自impact，在完整impact提交後才阻擋，cursor保留。裝上一件／手動合成／拆解後空位合法，再領並明確continue；不自行清除其他pause。
- stash60但地物只有gem／材料：獨立收納，不能誤拒絕。
- ground2裝備、stash餘1：兩個獨立pickup可一成一拒；不得沿r1擅自要求「整批收完並留一格才能新run」。若某單一命令合法含多物則按該命令原子預算，勿偷拆。
- 容量pause＋manual，清空位只解capacity；autoRepeatEnabled仍原值。
- 逐件離關中途失敗保留已成功pickup及剩餘ground；新run尚未建立。新run提交失敗只回退該提交，不倒回較早已成功的pickup；必要選擇／敵人／舊ground不能偷偷清掉。此與r1全批領物＋newrun一筆全成全拒不同。

同run同kill event重放1/2/100次零額外，newrun-B同enemy模板合法新獎；first-wolf與首通選gem ledger全檔獨立。stage-completion不可先於必要最後impact／支援／獎勵階段；兩筆提交需D10有可恢復phase，between-commits reload不漏結算。最後boss被擊殺但同impact的反傷令英雄0HP時，dead優先：XP/loot保存，不StageCompleted、不首通獎／選石。反傷資格在impact前確定，不能怪死就跳過。有限proc同impact所產生的多loot同筆，不能只存第一件。

### F-RNG（D02／D03／D06／D10）

preview100、cancel100、非法重洗三流0draw；合法重洗crafting、合成成功或遊戲失敗crafting、新裝掉落及初始隨機詞reward、combat逐crit來源combat。六選一保證gem無random，不能點不同選項免費換序列。來源表須列每步draw順序／條件，不能測試時猜。

X3/X4回舊游標、X5讀新游標與receipt；再送原command取原結果，新合法command才下一抽。持久化hitIndex不保存RNG或只保存RNG不保存HP皆應抓出。地物動畫、排序、查來源、tracker數量重算、UI打開不抽任何流。

### F-CAPACITY／F-SORT／F-LOCK／F-AUTO-LEGACY（D04／D06）

裝備倉庫60件已確認，測59/60/新增第61件被拒並留地，最多48已開格且20格原型保留/變更按D05；48格占滿不是倉庫滿。舊v1/v2合法30件倉與待領raw保持原狀，遷移後容納60，不填贈品或自動領ground；已知舊格式若有超額不得截斷，只限制新增。D07候選寵物仍30，測29/30/新增31被拒且蛋留地，沒有隨裝備擴成60。六gem×三grade=18固定堆，r2候選無遊戲數量cap，材料亦無；0/1/998/999/1000/10,000,000都可表示且不自造capacity。非負安全整數超界是格式／命令驗證錯誤，不是一個要求玩家解鎖倉庫的遊戲功能。

排序亂序quality／kind／相同條件不同affix與ID；同類stable，equipped placements和action sourceIds完全不動。鎖定主體可升質，鎖材不可消耗；preview後鎖材stale拒；已裝備先卸才能拆；同command直呼也拒。

舊auto兩旗標true、兩白劍、兩狼、滿倉pending；load/start/continue/pickup/sort/清容量各步不得自合成、crafting游標0。新的autoRepeatEnabled保留另測，不能因移除auto-merge而一併刪掉。

## 6. 合成、詞綴、寶石與手動交易

### F-SYN／F-AFFIX／F-GEM（D06／D10）

合法白→藍：主白劍ID main-w版本7，一條合法數值affix、一孔含相容I級gem；同白劍material-w版本3，不同合法一詞、一孔含石。成功保主詞／石／ID／位置、藍候選仍一詞一孔，不能沿r1錯補第二條；材料石在成功與遊戲失敗都退回，失敗主體仍白。若未鑲石另建空孔case，不把白0孔當正常。

合法红→金：主紅劍三原詞、兩孔含石；材料同紅劍三不同詞、兩孔石。成功金三詞三孔，既有三詞／兩顆石不重抽或消失，新增孔空；失敗維持紅。主/材backpack/stash四組×成功/失敗。不同詞可當材料但不同definition或quality拒絕（同種類ID策略依D06明表，區域變體不得測時猜）。

五機率p90/80/70/60/50的u<p邊界；金再合、同ID當主材、消失ID、鎖材、active pet、過期version拒絕不draw。一次確認清楚主材與風險；direct drag和獨立區域走同preview/dispatch，不建兩套合成運算。

affix每品質件數、全品項相容池、roll min/max、權重界線／不重複，純stat不effect trigger，無attack speed。重洗整組覆蓋只有一結果，費用不足／恰好／足量，preview不預抽；升級若增加詞數只補差額保原詞與數值，絕不重洗主體。F-ROUNDTRIP／升級fixture保存rollVersion、rolledQuality、origin(drop/starter/reroll/upgrade-added/migration)：金裝保留白階weaponBaseAdd+2或starter crit+5pp仍合法，不按金階掉落最低值拒絕或自動補高；新增槽才以新階來源校驗。舊無詞裝按D05/D10確定初始化一次，不消耗正常三流。

gem所有18候選種類等級：stack分kind+grade；equip扣1、remove加1、replace淨量同筆；免費、無升級合成。compatible weapon/support/armor/slot各按表。重複相同gem合法與效果scope/cap分開，不因「可重複鑲嵌」推論效果可無限疊。

沒有遊戲數量cap仍需測格式邊界與原子預算：near safe-integer max的多石退回若使數量非法，整筆拒絕，不先扣材；這是極值驗證，不要求正常玩家達到。普通999退石至1000應成功，不新增單顆丟棄／地物放棄命令來解不存在的999上限。守恆＝原堆＋所有內嵌＋ground＋新掉落−明確已批准消耗；換石不會消耗寶石。

### F-TX（全系統／D10）

合成／pet合成／reroll／salvage／insert／remove／replace／pickup／loadout／run轉換／設定保存都覆蓋[測試計畫](03-test-plan.md)X0–X6/X9。每筆用一次成功、明確拒絕、取消、20次pointer+compatibility click、同command重入、不同command舊版本、abort、complete後ACKlost。

拆解item未裝未鎖，receipt列消耗ID、退石、dust收益；取消全不變。重洗合法失敗不是模式（付費必給一組新詞），別把舊結果回復選項偷偷加到測試。gem退回數量和材料扣除同候選同commit。玩家可觀測狀態只能舊或新完整狀態，不先收石後扣錯物。

## 7. 收藏、追蹤、配裝與UI

### F-META／F-TRACK／F-LOADOUT（D08）

收藏：地物生成未取得→成功pickup記發現→物品合成/拆解後歷史仍在→reload與同事件重放不重領。D08候選最高quality／gem grade與寵物species成長歷史一併驗：成功升品更新最高quality、失敗不更新、消耗後不降；兩species曾達Lv6的里程碑不能因合成／放生重置。starter初始化持有和legacy owned migration映射明確，legacy pending未撿不算已取得。不同definition同baseKind不可誤合併；多ID同definition不重領。已確認「主要外觀」，本輪候選獎勵不加屬性，驗收不將其升格成永久禁止所有未來屬性的用戶規則。

追蹤兩種目標：
- equipment目標同kind/quality升品質，owned含equipped+stash（消耗材料鎖定/主體保留標注可用數），ground未owned另顯可撿不充當材料。
- gem目標kind+grade，獨立庫與已鑲數分開並提供總持有量，低grade不能湊高grade（無gem升級）。
- 每目標2合法來源（一開一鎖）、無來源非法ID、區域專屬/多來源；缺材料按合法合成／重洗需求計，不把所有不同品質同kind都算可用。取物/鑲嵌/拆石/合成/拆解後數量即更新。
- 已持有數、可用材料、缺額不可混為同一數；資料定義依D08/02 read model明列。追蹤改選不消耗RNG、不解鎖關、不開戰、不改掉率。

配裝引用同批owned IDs：A合法、B缺已拆件、C越未開格、D重疊、E換下造成61倉、E2淨交換恰60可成功、F引用ground、G同ID兩位置、H可用但在別配裝引用。槽數依D08候選，不沿r1未核准6槽自證。缺件明示、全筆成功/拒絕策略依D08；multiset守恆，鎖只是防消耗不自動禁移動。

### F-UI／F-PERF（D09）

固定viewports360×844、390×844、430×932、360×740；最大合法5敵（含長boss名/狀態）、48已開格、自然長杖與盾、60倉、18gem堆、大字、品質金/紅/白、長名稱、selected/detail panel、ground feedback、缺件／save-error、repeat=true但paused。

同一畫面證明戰鬥區與**完整48格已裝備背包**可見；不能用獨立整理頁截圖或一列裝備icon替代。同時打開詳情須有明示收合方案不遮關鍵操作；整理布局上裝備下倉庫、選中詳情獨立。倉庫可捲、全裝備背包不能靠捲出戰鬥區才看得到。最大配置的格內辨識、出手高亮與品質層級都需記錄。

畫面清單：開始／簡介／營地／7區圖及鎖定來源／五敵戰鬥+48格／暫停整理／獨立合成區／同preview拖合成／單↻／重洗覆蓋／拆解退石／gem替換／收藏／雙型追蹤數量／缺件配裝／結算三選／首通gem必要選擇／repeat阻擋但開關仍true／壞檔復原／未來商店占位無交易。

reduced-motion與標準同最終狀態；品質文字+顏色；觸控drag／tap／取消／捲動和旋轉不誤觸。Android Chrome和iOS Safari各一真機建議，safe-area／鍵盤／鎖屏／音訊手勢／IDB配額待D。桌面mobile emulation只能B。performance同最大case跑5min，記frames、impact commit p95、命令、快照byte與30minheap；未跑不可填通過。

### F-COMMAND（D10）

依02權限表逐command×camp／active combat／organize／capacity／settlement／necessary-choice／save-error-conflict。重點非法：active非整理reroll/rotate，戰中換challenge，wrong owned ID，同ID不同payload，out-of-order seq，非法enum，已移除auto-merge命令，保存錯誤後普通開始覆寫。UI隱藏不足以證明，須直接dispatch拒絕且不改RNG。

production入口檢查window.__packbound或URL種子/改state捷徑不能改玩家遊戲；測試注入只在隔離build/context，UI/09/11不持save或RNG port。這些均NOT_RUN。

## 8. 長期平衡、節奏、分布與真人資料

### F-BUILD／F-BAL（D01／D02／D03／D06／D07／D08）

以01三套完整build逐件列item definition、region來源、quality、affix數值、gem+grade、petXP/milestone、cell footprint/rotation、件數、已花材料及關卡可達性。每套早期簡化／中期／後期完整、移除核心gem、移除合作pet、替代武器／gem各一合法版本；不把不合法高grade或未解鎖專屬塞入早期。貢獻與缺件前後用數據確認，不只敘述流派名。

公平對照分兩種：同占格但武器件數不同（單大件／多小件），與同合成/刷取資源投入（高品／低品多件），不能把兩者混成一個cost。至少快速連擊、AoE、吸血、持續回血、DoT、蓄力、過療盾、擊殺chain、pet合作方向有合法case，可與三套主要build共享但覆蓋表需明示。

每配置×早中晚×1/2/3/4/5敵×30seed，另單長boss、boss+護衛、精英、相克機制；合法上限5，6是拒絕case。輸出DPR/有效HP傷害/overkill/治療/盾/crit/proc/每round actions/存活/clear秒/裝備材料gem每分鐘/整理次數/品質成本。長boss至少足以跨數次蓄力／DoT期限／護符3輪／里程碑技能周期；不能拿一擊秒死boss證明持續流派平衡。

記cross-region同品質優弱，不要求所有流派每個場景一樣強；若任何配置所有情境同時收益／存活都高20%以上，列警訊給15，不自動削弱。移除核心的損失須能指出裝備+詞+gem+pet共同貢獻，一把武器單獨已同效則build設計須回01。

### F-DIST／F-PACE（D01／D02／D03／D06／D08）

每row5seed各20,000，總100,000；每quality條件row另100,000。機率0/1必精確，其餘按測試計畫容差。sourcekind+grade、depth、rank、challenge、稀有區域品條件全部分母明確。用兩層獨立驗證：資料概率/期望A；實際sampler統計S，A不能證明sampler正確。

每關輸出N/S/G/H/E/B六種個數、裝備/蛋/gem/dust各期望、各品質期望、區域專屬至少一件機率、全拆dust、reroll可達成本、首次贈與另列。普通階Nrank合計僅可核怪數，因N/S/G/H率不同，不能用Nrank乘單一普通率。禁止保留r1的15/20怪2.75/3.60件當新世界預期。

已保留的A核對：T10全部70 row的pattern、敵數、品質深度及XP，總XP61,192；本輪只按B候選重算裝備列，粉塵/gem/蛋不變。舊P3/P5/P9的假設R向量對應89.5/77/147秒，只保留為歷史條件比較，撤出主容量校準，不能以慢速推關證明15分鐘。F-IDLE另列真實品項/品質/等級下的成熟固定起點紙算，含中期滿三武器孔與後期滿六武器孔；仍不是引擎清關時間。T12既有三套布局與詞石不重做，保留已核對結果並待引擎placement與真人驗證。

F-PACE用實際候選每weapon action0.5秒、敵action0.5秒、多hit分播不加+.1；波轉場、settlement、pickup travel、support都按01確切節奏分項。用combat trace計每一類action與等待，不把所有敵都算有出手（先死則無），不把動畫和等待重複加。計各build早中晚安全刷關、挑戰關與長boss，並列0.5秒固定action對多小件/單大件的每秒差異。

A（算術）新檔首關候選核對：九波單N HP18/atk1＋末波Boss HP100/atk3，白劍D16、起始合法暴擊詞但全部暴擊未觸發、無隨機掉落/途中升級、初HP100；N各兩擊並回擊一次，boss需七擊並回擊六次，總承傷9×1+6×3=27，結束HP73。武器action=9×2+7=25、敵action=9+6=15，40×0.5=20秒是傷害action時間；加10波各1.5秒入場/步行及1秒結算，候選前景模擬時長36秒。落地動畫不重複加為戰鬥action，實際存檔gate／玩家整理／必要選擇牆鐘另計。36秒是A算術不是真人首關量測，也不是已跑引擎。首五分鐘取得狼／理解基本組合為體驗目標，需真人另驗；不保證隨機同品項合成材料。

F-PACE/A-B-C-fixed-start採T12三套完整早期配裝，各自獨立初態：heroLv5/XP300、4點未花，裸攻擊4加白ring3使A7；pet白Lv3/XP90、滿HP、盾/charge0，首狼已領，倉庫空，所有合法direct draws選非crit；不中途加點/換裝、不以新掉落改傷害。這是合法候選資料，不聲稱新玩家自然於Lv5湊完三套。已獨立核算：

| build | 前九N的action數 | B100精確條件 | 全關actions／規則秒 | 新候選普通E裝備/min |
| --- | ---: | --- | --- | --- |
| A毒牙狼 | 18 | 匕A4.1+4.1+.6=8.8、匕B5.2×2=10.4；boss R1武器38.2＋狼13＋毒6=57.2，敵1動；R2武器38.2後狼收4.6，共9actions | 27／29.5秒 | 1.606780 |
| B潮盾吸血 | 9 | sword19；boss6劍、R3/R6兩符各次共4、fairy2、敵5，共17actions；最後敵死仍執行到期治療 | 26／29秒 | 1.634483 |
| C蓄能裂光 | 9 | bowD33.5，九N跨波完成三個charge週期；boss R1弓25.1＋杖20＋劍19＋extra2.9＋狼13=80，敵1動；R2弓殺餘20，其餘無目標skip，共6actions | 15／23.5秒 | 2.017021 |

三者九N後petXP162仍Lv3，boss死後226升Lv4；不得把下一趟也當相同固定起點。A/C只受一次扣防禦後1傷，滿106→105；B防禦4與回復可存活。每個已發生action仍佔滿0.5秒，無目標取消不佔；地物440ms和正常action/步行/結算重疊。這是普通V01固定起點，不能把相同秒數套給更高HP的挑戰；B候選P0每run裝備0.79，前輪0.309與原1.45不再是本表推薦預期，舊滿30倉算式撤換。最快成熟低關另見F-IDLE，不以這三套早期配裝代替。

整理頻率記起始空位、裝備／寵物／gem期望與首次容量阻擋分布；不能用餘位/λ的平均代替15分鐘成功率。初期55裝空需第56件、中後/返刷50空需第51件才阻擋，寵物20空需第21隻；F-IDLE以精確PMF和時間界線做A，再以實際順序做S。低操作不自動合成/拆解/棄物；gem與材料無遊戲cap，不拿999當中斷。前景掛機遇必要選擇、死亡、背景或玩家開面板的停滯不得把900秒容量門檻假做通過。

合成期望白件遞推E0=1，E(q+1)=Eq×(1+1/pq)，p=[.9,.8,.7,.6,.5]；僅從白件起算各級期望=[1,2.111111,4.75,11.535714,30.761905,92.285714]，已獨立算術核對。另有直接高品質掉落與保留好詞時需多品質來源模型。報中位／長尾和「沒有保底」，不要把期望當最多成本。重洗以每輪材料消耗/區域dust產率算時間，與合成所得升品質、缺gem刷來源的效益分開。

### F-IDLE（D02／D03／D04／D06／D07，G1-feedback-02）

**已確認容量60；以下掉率、起點與95%門檻仍待核准。** 初期stash5/60、55空；中期/後期與成熟返刷stash10/60、50空。備用件數不含正在背包生效的裝備；保留5或10件是準備條件，不要求玩家清成零倉，也不強制出發空位。全部pet10/30含active、20空；ground0，18種gem各100及粉塵100、無遊戲數量cap。已通关、once獎勵和必要選擇完成、repeat=true、無pause，由新run wave1入口開始。期間不換裝、分配新點數、手動合成或任何自動消耗。裝備超起始空位的下一件、或第21隻新寵才產生capacity；恰填滿無待領不算中斷。

#### A：固定配裝、固定非暴擊紙算

下列簡稱EARLY/MID/LATE/LATE-GEM/RETURN，對應01 T10的 `M-EARLY/M-MID/M-LATE/M-LATE-GEM/M-RETURN` 成熟農關profile；完整合法孔位、詞條、布局見01，並非假設所有深關21秒。英雄升級只增未分配點，寵物正常獲XP，故必須以後續真實session驗證，不把各趟重設XP或已消耗狀態。固定T的機率計算是獨立條件模型，不是持續引擎模擬。

| profile／stage | 成熟程度與主要數據 | 普通逐波action總數／T | 挑戰action總數／T | 裝備空位 |
| --- | --- | --- | --- | ---: |
| EARLY／verdant-01 P0 深1 | Lv9/XP1080、8攻擊點，A23；藍弓base4傷89.2＋白初劍35，白盾/符/戒、HP118/def2，白fairy Lv3/XP90 | 9個單弓＋末波弓劍，11／21.5秒 | B125需bow+sword+敵1+次輪bow，13／22.5秒 | 55 |
| MID／verdant-04 P3 深4 | Lv21/XP6300、10攻5HP5未花，A30.3；紫廣域杖/稜弓/劍傷58.7/164.7/101.4，三件各venomII填滿武器孔；紫盾/符/戒、HP235/def9.2，白fairy Lv10/XP1350 | [1,1,1,1,2,1,1,3,1,6]＝18／25秒 | [1,1,3,1,2,1,1,6,1,7]＝24／28秒 | 50 |
| LATE／verdant-10 P9 深10 | Lv41/XP24600、20攻10HP10未花，A56.6；紅廣域杖/稜弓/劍傷186.2/528.8/346.9，紅盾/符/戒、HP388/def18.4，紫fairy Lv15/XP3150 | [1,1,2,1,1,3,1,2,7,10]＝29／30.5秒 | [3,1,6,3,1,6,7,3,8,14]＝52／42秒 | 50 |
| LATE-GEM／verdant-10 P9 深10 | 沿LATE全部英雄/裝備/詞條/支援/寵物；三件紅武器兩孔均venomIII+chainIII，六武器孔全滿且相容 | [1,1,2,1,1,2,1,2,3,9]＝23／27.5秒 | 尚未紙算，不能借空武器孔42秒；待引擎量測 | 50 |
| RETURN／verdant-01 P0 深1 | 成熟返刷低關：Lv9/XP1080，8攻，A20；紅bow at(0,0)3格，extra2/crit20pp/life10%、兩空孔，D222.6；fairy Lv1/XP0 | 普通N18/B100各1action，10／21秒 | N23/B125仍各1action，10／21秒 | 50 |

T＝actions×.5＋10波入場×1.5＋結算1；連擊/AoE/proc不另加action，地物落地與現有步行/動作重疊。MID的L頭目第一杖於4護衛仍活時只承58.7×.6＝35.2，清護衛後弓/劍全額，首輪直接傷後餘28.7、敵前3層venomII各6.3將其減至9.8，仍出手後次杖收；挑戰頭目直接傷後111.7、毒後92.8，次杖後34.1仍需弓。挑戰EE殘敵34.9被兩層毒扣12.6後22.3，仍次輪杖收；因此MID滿孔25/28秒不變。LATE空武器孔普通最後波B1200首輪餘138.1、兩E各餘281.8，敵3action後第二輪清完且fairy到期仍行動。挑戰HP×1.25另算，反刺含已死敵的凍結反制，不能為省時間跳掉。兩者均含每2round的fairy；早期fairy之後達Lv10會讓挑戰多.5秒，22.5秒只作較快固定模型，不冒稱每趟不變。

LATE-GEM的獨立紙算：杖chainIII傷379.3，稜弓chainIII傷290.8。第6波EEH先杖傷兩E至281.8，殺H的chain收一E，弓收另一，共2actions。第9波EEE被杖打至各281.8，弓直接殺一隻並chain殺第二，劍收第三，共3actions。末波首杖殺H時chain選仍存活且HP最低的另一H（117），不能跳去較高HP的E；三武器後B138.1／兩E281.8，毒tick分別50.4及16.8，降到B87.7／兩E265後有3敵actions。次輪杖殺B的chain收一E，對另一E的直接hit留78.8、弓收尾、到期fairy治療，末波9actions；整關23×.5+16＝27.5秒。chain不遞迴、不附毒；DoT不觸發chain，沒有多加action。

MID三個武器孔和LATE-GEM六個武器孔均有實際機制；LATE空武器孔僅保留作直傷對照，後期成熟主case採LATE-GEM，不以倉庫持有寶石卻不裝上代替成熟配裝。全部合法武器暴擊抽樣仍指定未觸發，這是方便重算的條件，不能替代真實暴擊分布，也不是最快或最優配置。未來需量測完整孔位、連擊/毒/連鎖/範圍等配裝的清關p05/p50/p95，包含LATE-GEM挑戰；不能因單一組合較慢就宣稱掛機已平衡。

#### B：首輪掉率候選與供給取捨

| 方案（皆未核准） | N / S / G / H / E / B裝備率；挑戰額外 | P0 / P3 / P9普通E裝備/run | P9較原4.56供給減少 |
| --- | --- | --- | ---: |
| 原r2 O，只作比較 | 5 / 3 / 7 / 7 / 25 / 100%；35% | 1.45 / 2.82 / 4.56 | — |
| 供給優先 S | 2 / 1 / 3 / 3 / 10 / 70%；10% | .88 / 1.37 / 2.12 | 53.51% |
| **首輪推薦 B** | **1 / .5 / 1.5 / 1.5 / 3 / 70%；10%** | **.79 / .975 / 1.23** | **73.03%** |
| 容量較穩 C，備選 | 1 / .5 / 1.5 / 1.5 / 2 / 60%；10% | .69 / .845 / 1.04 | 77.19% |

B保留比舊減供81.23%表更多的弱怪、精英和頭目裝備；只修改現有率表與已確認容量，不加新掉落制度。蛋仍N/S/G/H .3%、E2%、B6%；gem/dust/條件品質/品項分配及合成成功率不動。S的材料較快，但本組中/後普通900秒聯合風險為40.873%/97.658%；B兩者為.027545%/.361856%，故首輪推薦B供實測。C比B深關普通供給再少15.45%，相同目標材料的長期等待率約慢18.27%，不是免費改善容量。

舊30倉主案與60倉-81.23%備選只屬被撤換歷史，不計入本輪推薦表；不因使用者批准60就套用它們。95%只是一個待批量化目標，不能倒推任何削率都自動獲准。

#### C：容量分布、平均與提早滿倉

每合法來源是獨立Bernoulli。各run按rank數乘生成函數 `∏((1−p)+pz)`，截斷卷積得裝備/寵物的有限poisson-binomial CDF；主profile裝備界為g=55或50，寵物20。聯合風險=`1−CDFgear(g)×CDFpet(20)`；gem正常收納無cap，不能用舊999製造中斷。這是理想獨立分布算術，不是sampler或固定seed遊戲測試。

900秒用n=`ceil(900/T)`完整run作保守上界，故含末趟尚未完成獎勵；不以n個完整趟的均值冒稱900秒必得。下表每分鐘是固定節奏長期產率；有限900秒實際收益須按擊殺/落地/拾取trace另算。

| B profile／模式 | T秒／n上界／裝空 | E裝備/min | 裝備風險% | 寵物風險% | 任一容量風險上界% |
| --- | --- | ---: | ---: | ---: | ---: |
| EARLY普通 | 21.5／42／55 | 2.20465 | <.000001 | <.000001 | <.000001 |
| EARLY挑戰 | 22.5／40／55 | 2.37333 | .000069 | <.000001 | .000069 |
| MID普通 | 25／36／50 | 2.34000 | .021528 | .006019 | .027545 |
| MID挑戰 | 28／33／50 | 2.30357 | .049504 | .001704 | .051207 |
| LATE普通 | 30.5／30／50 | 2.41967 | .275211 | .086885 | .361856 |
| LATE挑戰 | 42／22／50 | 1.90000 | .000271 | .001205 | .001476 |
| LATE-GEM普通，六武器孔滿 | 27.5／33／50 | 2.68364 | 2.448818 | .273586 | 2.715704 |
| RETURN普通 | 21／43／50 | 2.25714 | .000264 | <.000001 | .000264 |
| RETURN挑戰 | 21／43／50 | 2.54286 | .168977 | <.000001 | .168977 |

固定tempo首次阻擋令K為第一個超g裝或20寵空位的run序號，`S(n)=CDFgear,n(g)×CDFpet,n(20)`，`E[K]=Σn≥0 S(n)`。本輪A累加至S(n)<10^-14；實際事件位於run內，所以 `(E[K]−1)T≤E[T]≤E[K]T`。**下列區間不是信賴區間**，只是不假造run內事件時刻；模型仍固定T且不宣稱每次15分鐘保證。

| B profile／模式 | E首次任一容量時間（分） | p05時間（分） | p50時間（分） | p95時間（分） |
| --- | --- | --- | --- | --- |
| EARLY普通 | 25.081–25.439 | 21.858–22.217 | 25.083–25.442 | 28.667–29.025 |
| EARLY挑戰 | 23.289–23.664 | 19.875–20.250 | 23.250–23.625 | 27.000–27.375 |
| MID普通 | 21.459–21.876 | 17.917–18.333 | 21.250–21.667 | 25.000–25.417 |
| MID挑戰 | 21.797–22.264 | 18.200–18.667 | 21.933–22.400 | 25.667–26.133 |
| LATE普通 | 20.650–21.158 | 17.283–17.792 | 20.333–20.842 | 24.400–24.908 |
| LATE挑戰 | 26.335–27.035 | 21.700–22.400 | 25.900–26.600 | 31.500–32.200 |
| LATE-GEM普通 | 18.618–19.077 | 15.583–16.042 | 18.333–18.792 | 22.000–22.458 |
| RETURN普通 | 22.282–22.632 | 19.250–19.600 | 22.050–22.400 | 25.550–25.900 |
| RETURN挑戰 | 19.771–20.121 | 16.800–17.150 | 19.600–19.950 | 23.100–23.450 |

p05不是最早可能時間。任何來源連續掉落都可能更早阻擋；寵物第21隻也可先於裝備。裝滿需保留待領地物、停執行但不改repeat偏好，容量整理後依原規則明確繼續。LATE-GEM以B長期裝備率×15約40.25件，仍非有限900秒精確實領；同配裝同速C對照為2.26909件/min、聯合風險.331067%（裝備.057639%／寵物.273586%）、首容量時間期望21.781–22.239分。兩者都不是滿孔挑戰或更快流派的保證。

**快側和空位敏感性不能省略：**

| 情境，P9／20寵空 | B普通／挑戰聯合風險% | C普通／挑戰聯合風險% | 地位 |
| --- | --- | --- | --- |
| T30.5秒、50裝空；挑戰也假設同速 | .361856／1.978060 | .090155／.150356 | 普通有上述配裝紙算；同速挑戰僅保守比較，實際指定挑戰為42秒 |
| T25秒、50裝空 | **11.983830／31.447431** | **1.250448／4.543446** | 暴擊/孔位優化的待驗快側，無已證明25秒深關配裝，不宣稱B通過95% |
| T30.5秒、45裝空（已有15件） | 3.693545／13.062309 | .212954／1.213449 | 改起始保留量，同速挑戰仍非42秒實算 |
| T25秒、45裝空（已有15件） | 另列未來矩陣，不沿用50空結論 | 6.047113／20.145817 | C也不是所有空位/所有速度保證 |

21秒P9只列引擎壓力情境，不能決定全域率表或要求全關都以此95%通過。其餘敏感性必含空倉60/寵29空、只10裝空、只2寵空；結果各自報告，不擅改主profile或新增自動消耗來過關。若真實成熟深關快側接近25秒，B不能靠本表慢側結果交差，須把收穫、材料和風險一起回15調整提案。

#### D：同品項同品質材料取得

每個drop slot命中指定同質材料概率為 `p裝備×p品項×p品質`。地區指定品項.25、共通指定品項.0625；本表普通模式，已持有主體、只等額外1件材料，不限制詞條（同品同質異詞可合）。令q=`1−∏(1−p裝備×p品項×p品質)`，首材料run期望1/q；固定T時首次取得期望介於`(1/q−1)T`與`T/q`。五分鐘無貨介於`(1−q)^ceil(300/T)`與`(1−q)^floor(300/T)`，非保底承諾。材料時間指累積有效刷關時間；遇容量仍須玩家手動整理再刷，整理與合成操作牆鐘另加，不能把75分鐘或300分鐘材料等待說成同一趟無人操作掛機。

| 普通主profile／所需品質 | 指定地區材料首待期望（分）／5分鐘無貨率 | 指定共通材料首待期望（分）／5分鐘無貨率 | 主體往上一級：成功率／平均所需材料件數 |
| --- | --- | --- | --- |
| EARLY 深1白（品質88%） | 1.742–2.100／7.29–8.79% | 7.927–8.285／53.85–56.28% | 90%／1.111 |
| MID 深4藍（25%） | 6.522–6.938／47.56% | 27.034–27.451／83.23% | 80%／1.250 |
| LATE 深10紫（28%） | 5.568–6.076／41.74–45.55% | 23.278–23.786／80.57–82.33% | 70%／1.429 |
| LATE 深10紅（2.2%） | 74.803–75.312／93.45–94.09% | 300.228–300.737／98.32–98.49% | 50%／2.000 |
| LATE-GEM 深10紫（28%） | 5.020–5.478／38.25–41.74% | 20.988–21.447／78.85–80.57% | 70%／1.429 |
| LATE-GEM 深10紅（2.2%） | 67.446–67.904／92.82–93.45% | 270.698–271.156／98.16–98.32% | 50%／2.000 |

平均材料數1/p不是最多幾次；连续m次合成失敗概率=(1−p)^m，且每次仍需新同質材料。以LATE-GEM固定速度、長期材料產量倒數×1/p估算已有主體往上一級的素材工時，紫→橙地區/共通約7.605/30.419分鐘、紅→金約135.501/542.005分鐘；不是首次成功精確分布，整理/合成牆鐘另加。一次掛機產出後再手動整理/合成，不能以這份成本模型假裝掛機中自動合成。從零湊主體與材料、保留指定好詞、直接高品質掉落及低品質逐階升上來是不同路徑；F-BAL須追蹤所有路徑，不把以上單材料時間乘五階1/p相加。共通指定紅裝和金裝長尾仍很長，是B的已知取捨，不因容量有餘就宣稱養成合理。

#### E：未來引擎與真人驗收（全部NOT_RUN）

1. A核對70關到10種pattern的數量/率/品質映射，逐profile以真正假設時間計容量；不要把全部pattern硬套43趟。
2. S掉落sampler每row100,000抽保留；條件品質另驗。所有率、seed/RNG游標、計算版本及來源分母記錄，不拿解析PMF證明sampler正確。
3. I/S首批每個核准主case1,000個不同seed/游標session，真實戰鬥、成長、落地與拾取。涵蓋初/中/後、返刷低關、普通/挑戰、三既有流派及10種pattern/區域機制，另列合法完整孔位快側和45空/10空/2寵空反例。不可只挑上述三個有利關卡。記clear p05/p50/p95、首停時刻和原因、實領裝備/寵/石/粉、目標材料、有效前景秒；不得重設petXP消除成長。
4. 若95%獲批准，報n、聯合失敗k、k/n與單側95% Clopper–Pearson上界；信賴界跨5%時按事先規則累計至10,000或明列證據不足，不換seed找通過。若點估計已顯著失敗，回數值owner，不以無限增樣掩蓋。整組信賴宣稱另作多case校正，單case界不等同整套95%可信。
5. 死亡、必要選擇、背景、保存錯誤/延遲及未正常拾取均分列，不能當900秒容量成功樣本；容量失敗seed不得刪除。H/D另跑30分鐘主動與低操作，單真人session不證明95%。本輪未建立runner/fixtures/test，只有A算術與文件核對。

### F-SESSION（D03／D04／D05／D08）

三種證據互不代替：

1. S主動策略1800前景秒：固定合法決策腳本、可見掉落才選、不偷讀未來RNG，記查看／整理時間模型、合成/配裝/來源選擇、clear和死亡、遊戲秒與CPU秒。
2. S低操作1800前景秒：按F-IDLE主profile先整理、成熟配裝安全重刷已通關，首900秒不人工干預容量，記聯合成功率與第一阻擋時刻；之後到1800秒如實記整理與停頓，不要求30分鐘完全不整理。快速熟低關與較慢安全關分開，死亡／選擇／背景凍結不得湊滿900秒容量成功證據。
3. H本人與另一玩家各≥30分鐘主動、另獨立≥30分鐘低操作：牆鐘開始/結束、實際前景戰鬥秒、決策次數、正在追的裝備/gem、從安全關農後挑頭目、每次整理/必要選擇、迷失或無事可做時間。不能把S1800秒填H30分鐘。

起步H額外記第一戰/第一次掉落/首次狼/早期gem/首次可選組合。隨機未拿同品項材料時合成教學可略過，不靠偽造掉落完成指標。D手機長session含通知／鎖屏／重開後偏好仍在且不偷開戰；所有H/D本輪待驗。

## 9. 交付、決策依賴與證據狀態

D01→F-CONTENT/WORLD；D02→F-HIT/EFFECT/COMBAT/PACE；D03→F-DIST/LOOT/PACE/IDLE；D04→F-PAUSE/HP/LOOT-LIFE/IDLE；D05→F-SAVE/SESSION；D06→F-AFFIX/GEM/SYN/BUILD；D07→F-PET/BUILD/IDLE；D08→F-META/TRACK/LOADOUT/CHALLENGE；D09→F-UI/PERF；D10→F-STORAGE/MULTITAB/RNG/ROUNDTRIP/TX。本文件具體候選值可隨G1修改，不是03私定規則；G1-feedback-02新增確認倉庫60件；弱連擊方向和15分鐘目標保留，未批准B/S/C掉率、準備起點、95%或全部數值。

04於G1後凍結fixture schema／命令／拒絕碼與content版本；各leaf依白名單建立單元資料，14集中整合／儲存故障替身／唯一sampler，15執行平衡與session模擬，18同commit做瀏覽器、真人與真機證據。不得各自新建global save loader或RNG。

本輪已完成規劃覆蓋與所列純算術，不存在PASS程式測試、模擬、真機或真人結果。保留所有未驗證標記，等待使用者明確核准G1；不開始Task04。
