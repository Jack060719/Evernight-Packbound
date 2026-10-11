import { CONTRACT_VERSION, CONTENT_VERSION, GEM_STACK_KEYS, PAUSE_REASONS, createRandomSource, type SaveEnvelope, type SaveCommitter, type Result, type TransactionReceipt, type StageId } from './game/contracts';
import { releaseContent as content } from './game/registries';
import { initialEnvelope, Mutation, requireRule, result, type Draft } from './game/systems/resource-transactions';
import { makeItem, combatStats } from './game/systems/affixes';
import { validatePlacement, reorderWarehouse } from './game/systems/inventory';
import { addDrop, settleGround, syncCapacity } from './game/systems/ground-loot';
import { discoverOwned } from './game/systems/collection';
import { unlockStages } from './game/systems/reward-resolution';
import { growPet } from './game/systems/pet-growth';
import { loadGame, SAVE_KEY, LEGACY_SAVE_KEY } from './save';
import type { GameState } from './game/types';
import { fingerprint } from './game/release-engine';

const knownMechanics=new Set([...content.gearEffects.map(d=>({effectId:d.id,parameters:d.parameters})),...content.gems.map(d=>d.effect),...content.petMilestones.map(d=>d.effect),...content.stages.flatMap(d=>d.waves.flatMap(w=>w.enemies.flatMap(e=>e.effects))),...content.challenges.flatMap(d=>d.addedEffects)].map(d=>`${d.effectId}:${fingerprint(d.parameters)}`));
const validInteger=(n:number,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function check(condition:unknown,message:string):asserts condition { requireRule(condition,'SAVE_READ_ONLY',message); }
export function inspectSave(raw:string):Result<SaveEnvelope> {
  try {
    const e=JSON.parse(raw) as SaveEnvelope;
    check(e && e.schemaVersion===3,'無法讀取此存檔版本，原文已保留。');
    check(e.contractVersion===CONTRACT_VERSION && [CONTENT_VERSION,'integrated-v2-r2-feedback02-B'].includes(e.contentVersion),'存檔使用不同的內容版本。');
    check(typeof e.saveId==='string' && e.saveId.length>0 && validInteger(e.revision),'存檔識別或版本不合法。');
    for(const key of ['nextEntitySeq','nextRunSeq','nextTransactionSeq','eventSeq','lastAppliedCommandSeq'] as const)check(validInteger(e.counters[key],key.startsWith('next')?1:0),'存檔流水號不合法。');
    for(const key of ['combat','reward','crafting'] as const)createRandomSource(e.rng[key]);
    const s=e.state,inv=s.inventory,seen=new Set<string>();
    const identity=(id:string)=>{ check(typeof id==='string' && id.length>0 && !seen.has(id),'存檔含有重複個體 ID。');seen.add(id); };
    check(validInteger(s.hero.level,1) && [s.hero.cumulativeXp,s.hero.points,s.hero.attackPoints,s.hero.healthPoints].every(n=>validInteger(n)) && Number.isFinite(s.hero.hp) && s.hero.hp>=0,'角色資料不合法。');
    check(Array.isArray(inv.unlockedCells) && inv.unlockedCells.length>0 && inv.unlockedCells.length<=48,'背包格位不合法。');
    const cells=new Set<string>();for(const c of inv.unlockedCells) { const key=`${c.row}:${c.col}`;check(validInteger(c.row,0,5)&&validInteger(c.col,0,7)&&!cells.has(key),'背包包含重複或越界格。');cells.add(key); }
    for(const [id,item] of Object.entries(inv.itemById)) {
      identity(id);check(id===item.id && validInteger(item.version,1) && validInteger(item.quality,0,5) && typeof item.locked==='boolean','裝備資料不合法。');
      const definition=content.equipment.find(d=>d.id===item.definitionId);check(definition && definition.baseKind===item.baseKind,'未知裝備品項。');
      check(item.sockets.length===content.economy.socketCounts[item.quality] && item.affixes.length===content.economy.affixCounts[item.quality],'裝備詞條或孔數不合法。');
      const stats=new Set<string>();
      for(const roll of item.affixes) {
        const def=content.affixes.find(a=>a.statId===roll.statId),range=def?.ranges.find(r=>r.quality===roll.rolledQuality);
        check(def && range && definition.affixPool.includes(roll.statId) && !stats.has(roll.statId) && roll.unit===def.unit && roll.rolledQuality<=item.quality,'詞條內容不合法。');
        check(['drop','starter','reroll','upgrade-added','migration'].includes(roll.origin) && typeof roll.rollVersion==='string' && roll.rollVersion.length>0,'詞條來源不合法。');
        check(roll.origin==='starter' && roll.statId==='critChance' && roll.value===5 || Number.isFinite(roll.value) && roll.value>=range.min && roll.value<=range.max && Math.abs((roll.value-range.min)/range.step-Math.round((roll.value-range.min)/range.step))<1e-6,'詞條數值不合法。');stats.add(roll.statId);
      }
      for(const gem of item.sockets)if(gem) { identity(gem.id);check(definition.gemTypes.includes(gem.type) && validInteger(gem.grade,1,3),'嵌入寶石不相容。'); }
      const location=inv.locationById[id];check(location && ['equipped','warehouse','ground'].includes(location.kind),'裝備缺少所有權位置。');
      if(location.kind==='equipped')validatePlacement(item,location,inv,content);
    }
    check(Object.keys(inv.itemById).length===Object.keys(inv.locationById).length,'装備位置含有孤立資料。');
    const warehouse=Object.entries(inv.locationById).filter(([,p])=>p.kind==='warehouse').map(([id])=>id);
    check(inv.warehouseOrder.length===warehouse.length && new Set(inv.warehouseOrder).size===warehouse.length && inv.warehouseOrder.every(id=>warehouse.includes(id)),'倉庫順序或所有權不一致。');
    for(const [id,pet] of Object.entries(inv.petById)) {
      identity(id);check(id===pet.id && ['wolf','fairy'].includes(pet.kind) && validInteger(pet.version,1) && validInteger(pet.quality,0,5) && validInteger(pet.cumulativeXp) && validInteger(pet.level,1),'靈寵資料不合法。');
      check(inv.petLocationById[id] && ['owned','ground'].includes(inv.petLocationById[id].kind),'靈寵缺少所有權位置。');
    }
    check(Object.keys(inv.petById).length===Object.keys(inv.petLocationById).length,'靈寵位置含有孤立資料。');
    check(inv.activePetId===null || inv.petLocationById[inv.activePetId]?.kind==='owned','出戰靈寵不是持有個體。');
    check(Object.keys(inv.gemStacks).length===18,'寶石堆疊資料不完整。');
    for(const key of GEM_STACK_KEYS) { const stack=inv.gemStacks[key];check(stack && `${stack.type}:${stack.grade}`===key && validInteger(stack.count),'寶石數量不合法。'); }
    check(validInteger(inv.resources.dust),'粉塵數量不合法。');
    const stages=new Set(content.stages.map(d=>d.id));
    check(stages.has(s.world.selectedStageId) && s.world.unlockedStageIds.every(id=>stages.has(id)) && s.world.completedStageIds.every(id=>stages.has(id)),'世界進度含未知關卡。');
    check(s.world.unlockedStageIds.includes(s.world.selectedStageId) && new Set(s.world.unlockedStageIds).size===s.world.unlockedStageIds.length && new Set(s.world.completedStageIds).size===s.world.completedStageIds.length,'世界進度重複或未解鎖。');
    for(const [id,count] of Object.entries(s.world.completionCounts))check(stages.has(id as StageId)&&validInteger(count),'通關次數不合法。');
    check(typeof s.world.firstWolfGranted==='boolean','首次靈狼資料不合法。');
    const first=s.world.oneTimeRewards['first-cleared-verdant-02-gem'];
    check(['unearned','awaiting-choice','chosen'].includes(first.state),'首次寶石資料不合法。');
    if(first.state==='chosen')check(content.gems.some(g=>g.type===first.kind)&&typeof first.dropId==='string','首次寶石選擇不合法。');
    if(s.world.selectedChallengeId)check(content.challenges.some(c=>c.id===s.world.selectedChallengeId && c.regionId===content.stages.find(d=>d.id===s.world.selectedStageId)!.regionId),'挑戰選擇不合法。');
    check(s.lifecycle.pauseReasons.every(p=>PAUSE_REASONS.includes(p)) && typeof s.lifecycle.resumeRequired==='boolean','暫停資料不合法。');
    check(typeof s.settings.autoRepeatEnabled==='boolean' && typeof s.settings.introSeen==='boolean' && typeof s.settings.reducedMotion==='boolean' && typeof s.settings.musicMuted==='boolean' && typeof s.settings.soundMuted==='boolean','設定資料不合法。');
    check([s.settings.musicVolume,s.settings.soundVolume].every(n=>Number.isFinite(n)&&n>=0&&n<=1),'音量資料不合法。');
    const collection=s.collection;
    for(const [id,q] of Object.entries(collection.equipmentHighestQualityByDefinition))check(content.equipment.some(d=>d.id===id)&&validInteger(q,0,5),'裝備收藏不合法。');
    for(const [id,g] of Object.entries(collection.gemHighestGradeByKind))check(content.gems.some(d=>d.type===id)&&validInteger(g,1,3),'寶石收藏不合法。');
    for(const [id,q] of Object.entries(collection.petHighestQualityBySpecies))check(['wolf','fairy'].includes(id)&&validInteger(q,0,5),'靈寵收藏不合法。');
    for(const [id,l] of Object.entries(collection.petHighestLevelBySpecies))check(['wolf','fairy'].includes(id)&&validInteger(l,1),'靈寵成長收藏不合法。');
    check(new Set(collection.rewardClaimIds).size===collection.rewardClaimIds.length&&collection.rewardClaimIds.every(id=>content.collections.some(c=>c.id===id)),'收藏獎勵資料不合法。');
    check(new Set(collection.selectedPresentationIds).size===collection.selectedPresentationIds.length&&collection.selectedPresentationIds.every(id=>content.collections.some(c=>c.presentationId===id&&collection.rewardClaimIds.includes(c.id))),'收藏外觀不合法。');
    const target=s.tracking.target;
    if(target)check(validInteger(target.count,1)&&(target.kind==='equipment'?content.equipment.some(d=>d.id===target.definitionId)&&validInteger(target.quality,0,5):target.kind==='gem'&&content.gems.some(g=>g.type===target.type&&g.grade===target.grade)),'追蹤目標不合法。');
    if(s.lifecycle.pendingChoice)check(['death','first-gem','stage-result'].includes(s.lifecycle.pendingChoice.kind),'必要選擇不合法。');
    if(s.lifecycle.exitRequest)check(stages.has(s.lifecycle.exitRequest.targetStageId)&&['repeat','next','abandon','retry'].includes(s.lifecycle.exitRequest.reason),'離關請求不合法。');
    const payloads=new Set<string>();
    for(const drop of s.groundDrops) {
      identity(drop.id);check(validInteger(drop.version,1) && validInteger(drop.order) && ['falling','available','claimed'].includes(drop.state) && Number.isFinite(drop.claimRemainingMs) && drop.claimRemainingMs>=0 && drop.claimRemainingMs<=440,'地物狀態不合法。');
      check(Number.isFinite(drop.position.x)&&Number.isFinite(drop.position.y)&&typeof drop.provenance.eventId==='string'&&['enemy-kill','challenge-clear','first-wolf','first-gem-choice','legacy-pending'].includes(drop.provenance.origin),'地物來源或位置不合法。');
      if(drop.state==='claimed')continue;
      const payload=drop.payloadRef;
      if(payload.kind==='equipment' || payload.kind==='pet') {
        const id=payload.kind==='equipment'?payload.itemId:payload.petId,location=payload.kind==='equipment'?inv.locationById[id]:inv.petLocationById[id];
        check(!payloads.has(id) && location?.kind==='ground' && location.dropId===drop.id,'地物與個體所有權不一致。');payloads.add(id);
      } else if(payload.kind==='gem')check(GEM_STACK_KEYS.includes(`${payload.type}:${payload.grade}`) && validInteger(payload.count,1),'地物寶石不合法。');
      else check(payload.kind==='dust' && validInteger(payload.amount,1),'地物粉塵不合法。');
    }
    for(const [id,location] of [...Object.entries(inv.locationById),...Object.entries(inv.petLocationById)])if(location.kind==='ground')check(payloads.has(id),'地物個體沒有對應掉落。');
    const run=s.activeRun;
    if(run?.ruleset!=='legacy-v2')check(s.hero.hp<=combatStats(s,content).maxHp,'角色生命超出上限。');
    if(run) {
      check(stages.has(run.stageId) && typeof run.runId==='string' && ['wave-entry','travel','combat','settlement','exit-wait','dead'].includes(run.status),'旅程資料不合法。');
      check(validInteger(run.waveIndex,0,run.ruleset==='legacy-v2'?4:9),'波次不合法。');
      if(run.ruleset==='release-r2') {
        const c=run.combat;check(validInteger(c.round,1) && c.enemies.length<=5 && validInteger(c.actionIndex,0,c.queue.length),'戰鬥游標不合法。');
        check(['weapons','support','enemy-dot','enemies','hero-dot','round-end'].includes(c.stage),'戰鬥階段不合法。');
        const checkMechanics=(mechanics:typeof c.enemies[number]['mechanics'])=>{for(const m of mechanics)check(['gear','gem','pet','enemy','challenge'].includes(m.sourceKind)&&typeof m.sourceId==='string'&&knownMechanics.has(`${m.effectId}:${fingerprint(m.parameters)}`),'未知戰鬥效果。');};
        const checkPoison=(stacks:typeof c.heroPoison)=>{for(const p of stacks)check(validInteger(p.sourceQuality,0,5)&&Number.isFinite(p.damagePerTick)&&p.damagePerTick>=0&&validInteger(p.remainingTicks,1,3)&&validInteger(p.createdOrder),'毒狀態不合法。');};
        checkPoison(c.heroPoison);
        for(const enemy of c.enemies){checkMechanics(enemy.mechanics);checkPoison(enemy.poison);check(validInteger(enemy.ordinal,0,4)&&Number.isFinite(enemy.maxHp)&&enemy.maxHp>0&&Number.isFinite(enemy.attack)&&enemy.attack>=0&&validInteger(enemy.actionCount)&&typeof enemy.frenzyActivated==='boolean','敵人數值不合法。');}
        for(const source of [...c.roundSourceSnapshots,...(c.currentAction?[c.currentAction]:[])]){
          checkMechanics(source.mechanics);check(['weapon','unarmed','charm','pet','enemy'].includes(source.sourceKind)&&typeof source.sourceId==='string'&&validInteger(source.sourceVersion,1),'行動來源不合法。');
          check(['maxHp','attack','defense','healingBonus','petPowerBonus'].every(key=>Number.isFinite(source.stats[key as keyof typeof source.stats]))&&source.stats.maxHp>0,'行動快照數值不合法。');
          if(source.sourceKind==='weapon'){const w=source.weaponStats;check(w&&Object.values(w).every(Number.isFinite)&&w.damageD>=0&&w.qualityMultiplier>0&&validInteger(w.extraHits,0,3)&&w.critChance>=0&&w.critChance<=75&&w.lifesteal>=0&&w.lifesteal<=25,'武器快照不合法。');}
          if(source.sourceKind==='charm'||source.sourceKind==='pet')check(source.support&&['healing','pet-attack'].includes(source.support.kind)&&Number.isFinite(source.support.power)&&source.support.power>=0&&validInteger(source.support.everyRounds,1),'支援快照不合法。');
        }
        check(c.queue.every(a=>c.roundSourceSnapshots.some(source=>source.sourceId===a.sourceId&&source.sourceKind===a.sourceKind))&&new Set(c.queue.map(a=>a.actionId)).size===c.queue.length,'行動佇列參照不合法。');
        for(const effect of c.healingSuppression)check(Number.isFinite(effect.multiplier)&&effect.multiplier>0&&effect.multiplier<=1&&validInteger(effect.expiresAfterSupportRound,1),'減療狀態不合法。');
        for(const n of Object.values(c.chargeActionsBySource))check(validInteger(n),'充能狀態不合法。');
        check(validInteger(c.bondStacks,0,5)&&validInteger(c.roundDirectHits)&&Number.isFinite(c.roundLifestealBudgetUsed)&&c.roundLifestealBudgetUsed>=0&&validInteger(c.roundChainUses,0,3),'回合額度不合法。');
        for(const grade of [c.activeWardGrade,c.activeBondGrade])check(grade===null||validInteger(grade,1,3),'光環等級不合法。');
        for(const flag of [c.heroDeathResolved,c.roundEndResolved,c.waveCompletionResolved,c.stageCompletionResolved])check(typeof flag==='boolean','戰鬥旗標不合法。');
        for(const enemy of c.enemies) { identity(enemy.id);check(content.enemies.some(d=>d.id===enemy.definitionId) && Number.isFinite(enemy.hp)&&enemy.hp>=0&&enemy.hp<=enemy.maxHp && Number.isFinite(enemy.shield)&&enemy.shield>=0,'敵人資料不合法。'); }
        if(c.currentAction) { const a=c.currentAction;check(validInteger(a.cursor.hitIndex,0,a.hitPlan.length) && validInteger(a.cursor.remainingTicks,1,10) && a.actionId===c.queue[c.actionIndex]?.actionId && a.hitPlan.length<=8,'逐擊游標不合法。');check(a.cursor.rootActionId===a.actionId&&typeof a.sourceStillEligible==='boolean'&&typeof a.beforeActionResolved==='boolean'&&Number.isFinite(a.chargeMultiplier)&&a.chargeMultiplier>0,'行動狀態不合法。');for(const [i,hit] of a.hitPlan.entries())check(hit.hitIndex===i&&validInteger(hit.dueTick,0,9)&&validInteger(hit.targetOrdinal,0,4)&&Number.isFinite(hit.coefficient)&&hit.coefficient>=0&&['primary','extra'].includes(hit.hitClass),'逐擊計畫不合法。'); }
        check(Number.isFinite(c.heroShield)&&c.heroShield>=0 && validInteger(run.phaseRemainingTicks,0,30),'戰鬥剩餘時間或護盾不合法。');
        check(s.hero.hp<=combatStats(s,content).maxHp,'角色生命超出上限。');
      } else {
        check(run.ruleset==='legacy-v2' && validInteger(run.legacyFloor,1,3) && validInteger(run.legacyWave,1,5) && Number.isFinite(run.legacyTime) && run.legacyTime>=0 && run.legacyTickRemainder>=0 && run.legacyTickRemainder<.05,'舊版戰鬥資料不合法。');
        for(const enemy of run.combat.enemies) { identity(enemy.id);check(Number.isFinite(enemy.hp)&&enemy.hp>=0&&enemy.hp<=enemy.maxHp,'舊版敵人資料不合法。'); }
      }
    }
    check(s.loadouts.length<=6 && new Set(s.loadouts.map(l=>l.slotId)).size===s.loadouts.length,'配裝槽資料不合法。');
    for(const loadout of s.loadouts){check(validInteger(loadout.slotId,1,6) && typeof loadout.name==='string' && [...loadout.name].length<=12 && new Set(loadout.items.map(i=>i.itemId)).size===loadout.items.length,'配裝參照資料不合法。');for(const item of loadout.items)check(typeof item.itemId==='string'&&validInteger(item.observedVersion,1)&&validInteger(item.placement.row,0,5)&&validInteger(item.placement.col,0,7)&&validInteger(item.placement.rotation,0,3),'配裝位置不合法。');}
    check(validInteger(s.simulation.elapsedTicks) && Number.isFinite(s.simulation.tickRemainderMs) && s.simulation.tickRemainderMs>=0&&s.simulation.tickRemainderMs<50,'模擬時鐘不合法。');
    check(Array.isArray(e.receipts)&&e.receipts.length<=128,'交易收據不合法。');
    const transactions=new Set<string>(),commands=new Set<string>();
    for(const r of e.receipts){check(typeof r.transactionId==='string'&&!transactions.has(r.transactionId)&&validInteger(r.revision,1,e.revision)&&['accepted','synthesis-success','synthesis-failed'].includes(r.outcome.kind),'交易收據內容不合法。');transactions.add(r.transactionId);if(r.commandId){check(!commands.has(r.commandId)&&typeof r.commandFingerprint==='string','命令收據重複。');commands.add(r.commandId);}for(const rng of [r.rngBefore,r.rngAfter])for(const key of ['combat','reward','crafting'] as const)createRandomSource(rng[key]);}
    return { ok:true,value:e };
  } catch(error) { return { ok:false,error:{ code:'SAVE_READ_ONLY',message:error instanceof Error?error.message:'無法讀取存檔，原文已保留。' } }; }
}

export function digest(raw:string):number { let value=0x811c9dc5;for(const byte of new TextEncoder().encode(raw))value=Math.imul(value^byte,0x01000193)>>>0;return value||1; }
export function migrateToRelease(raw:string,key:string):Result<SaveEnvelope> {
  try { JSON.parse(raw); } catch { return {ok:false,error:{code:'SAVE_READ_ONLY',message:'舊存檔不是有效的 JSON，原文保留。'}}; }
  return result(()=>{
    const original=JSON.parse(raw) as GameState;
    requireRule(original.version===1 as number || original.version===2,'SAVE_READ_ONLY','未知舊存檔版本。');
    const loaded=loadGame({ getItem:k=>k===key?raw:null });requireRule(loaded.state,'SAVE_READ_ONLY',loaded.message??'舊存檔無法驗證。');
    const old=loaded.state,sourceVersion=original.version as 1|2,seed=digest(raw),tx=new Mutation(initialEnvelope(`migrated-${seed.toString(16)}`,seed));
    const s=tx.draft.state,inv=s.inventory;
    inv.itemById={};inv.locationById={};inv.warehouseOrder=[];inv.petById={};inv.petLocationById={};
    inv.unlockedCells=structuredClone(old.unlockedCells);inv.activePetId=old.activePetId;
    s.hero={ level:old.hero.level,cumulativeXp:old.hero.xp,points:old.hero.points,attackPoints:old.hero.attackPoints,healthPoints:old.hero.healthPoints,hp:original.hero.hp };
    s.collection.equipmentHighestQualityByDefinition={};
    const source=(slot:'equipment'|'pet')=>({ origin:'legacy-pending' as const,runId:null,encounterId:null,stageId:null,waveIndex:null,enemyId:null,eventId:`migration:${seed}:${slot}:${tx.draft.counters.nextEntitySeq}`,rewardSlot:slot,lootTableId:null,challengeId:null });
    for(const item of [...old.items,...old.pending.items]) {
      const initSeed=digest(`${seed}:${item.id}:${item.kind}:${item.quality}:migration-v1`),rng=createRandomSource({ algorithm:'xorshift32-v1',seed:initSeed,state:initSeed,draws:0 });
      inv.itemById[item.id]=structuredClone(makeItem(item.id,item.kind,item.quality,content,rng,'migration')) as typeof inv.itemById[string];
      if(old.pending.items.some(i=>i.id===item.id))addDrop(tx,{ kind:'equipment',itemId:item.id },source('equipment'));
      else inv.locationById[item.id]=item.placement?{ kind:'equipped',...item.placement,rotation:item.placement.rotation as 0|1|2|3 }:{ kind:'warehouse',order:old.items.indexOf(item) };
    }
    for(const pet of [...old.pets,...old.pending.pets]) {
      inv.petById[pet.id]=structuredClone(growPet({ id:pet.id,version:1,kind:pet.kind,quality:pet.quality,cumulativeXp:pet.xp,level:pet.level,milestoneIds:[] },0,content)) as typeof inv.petById[string];
      if(old.pending.pets.some(p=>p.id===pet.id))addDrop(tx,{ kind:'pet',petId:pet.id },source('pet'));
      else inv.petLocationById[pet.id]={ kind:'owned' };
    }
    reorderWarehouse(tx.draft);discoverOwned(tx.draft);
    s.world.firstWolfGranted=old.firstFloorReward;s.world.selectedStageId=`verdant-0${old.floor}` as StageId;
    s.world.completedStageIds=Array.from({ length:old.completedRuns>0?3:old.unlockedFloor-1 },(_,n)=>`verdant-0${n+1}` as StageId);
    s.world.importedProgress={ sourceVersion,floor:old.floor,unlockedFloor:old.unlockedFloor,completedRuns:old.completedRuns };unlockStages(tx,content);
    s.settings={ ...s.settings,musicVolume:old.settings.musicVolume,soundVolume:old.settings.soundVolume,musicMuted:old.settings.musicMuted,soundMuted:old.settings.soundMuted,introSeen:true };
    if(sourceVersion===2) {
      s.activeRun={ runId:`${tx.draft.saveId}:legacy`,stageId:s.world.selectedStageId,challengeId:null,contentVersion:content.version,definitionVersion:'prototype-v2',waveIndex:old.wave-1,encounterId:`${tx.draft.saveId}:legacy:w${old.wave-1}`,
        status:old.battle.phase,ruleset:'legacy-v2',legacyFloor:old.floor,legacyWave:old.wave,legacyTime:old.time,legacyTickRemainder:old.tickRemainder,combat:structuredClone(old.battle) };
      if(old.battle.phase==='dead')s.lifecycle.pendingChoice={ kind:'death',runId:s.activeRun.runId };
    }
    settleGround(tx);syncCapacity(tx);s.lifecycle.pauseReasons.push('load');
    tx.draft.migrationReport={ sourceVersion,sourceKey:key,sourceDigest:seed.toString(16),initializationVersion:'migration-v1',preservedEntityIds:[...Object.keys(inv.itemById),...Object.keys(inv.petById)],
      movedItemIds:old.items.filter(item=>JSON.stringify(item.placement)!==JSON.stringify(original.items.find(i=>i.id===item.id)?.placement)).map(item=>item.id),pendingDropIds:s.groundDrops.map(d=>d.id),
      combatDisposition:sourceVersion===2?'legacy-v2-preserved':'v1-restart-required',warnings:sourceVersion===1?['舊版秒制戰鬥無法精確續接；角色生命與永久進度保留，請手動出發。']:[] };
    tx.finish();return tx.draft;
  });
}

export class ReleaseStorage implements SaveCommitter {
  private constructor(private readonly db:IDBDatabase) {}
  static open():Promise<ReleaseStorage> {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('evernight-packbound',1);
      request.onupgradeneeded=()=>{ if(!request.result.objectStoreNames.contains('saves'))request.result.createObjectStore('saves'); };
      request.onsuccess=()=>{ const db=request.result;db.onversionchange=()=>db.close();resolve(new ReleaseStorage(db)); };
      request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('請關閉另一個正在升級存檔的分頁。'));
    });
  }
  read(key='current'):Promise<string|null> {
    return new Promise((resolve,reject)=>{ const transaction=this.db.transaction('saves','readonly'),request=transaction.objectStore('saves').get(key);let value:string|null=null;
      request.onsuccess=()=>{ value=request.result??null; };transaction.oncomplete=()=>resolve(value);transaction.onabort=()=>reject(transaction.error); });
  }
  keys():Promise<IDBValidKey[]> { return new Promise((resolve,reject)=>{ const request=this.db.transaction('saves','readonly').objectStore('saves').getAllKeys();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); }); }
  async preserveRaw(source:string,raw:string):Promise<void> {
    await new Promise<void>((resolve,reject)=>{
      const tx=this.db.transaction('saves','readwrite'),store=tx.objectStore('saves'),key=`raw:${source}:${digest(raw).toString(16)}`,request=store.get(key);
      request.onsuccess=()=>{ if(request.result!==undefined && request.result!==raw)tx.abort();else if(request.result===undefined)store.add(raw,key); };
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('無法保存原始備份。'));
    });
  }
  commitSnapshot(expectedRevision:number,candidate:Parameters<SaveCommitter['commitSnapshot']>[1]):Promise<Result<TransactionReceipt>> {
    return this.write(expectedRevision,candidate.envelope).then(outcome=>outcome.ok?{ ok:true,value:candidate.envelope.receipts.at(-1)! }:outcome);
  }
  write(expectedRevision:number,envelope:SaveEnvelope,source?:{ key:string;raw:string },replaceRaw?:string):Promise<Result<SaveEnvelope>> {
    const raw=JSON.stringify(envelope),checked=inspectSave(raw);if(!checked.ok)return Promise.resolve(checked);
    return new Promise(resolve=>{
      const tx=this.db.transaction('saves','readwrite'),store=tx.objectStore('saves'),request=store.get('current');
      let failure:Result<SaveEnvelope>={ ok:false,error:{ code:'SAVE_FAILED',message:'儲存交易未完成；原有進度保留。' } };
      request.onsuccess=()=>{
        const current=request.result as string|undefined;
        const parsed=current?inspectSave(current):null;
        if(replaceRaw!==undefined?current!==replaceRaw:current ? !parsed?.ok || parsed.value.revision!==expectedRevision : expectedRevision!==0) {
          failure={ ok:false,error:{ code:'SAVE_CONFLICT',message:'另一個分頁已更新進度，已停止此頁寫入。' } };tx.abort();return;
        }
        if(source && localStorage.getItem(source.key)!==source.raw) { failure={ ok:false,error:{ code:'SAVE_CONFLICT',message:'舊存檔來源已變更，請重新載入。' } };tx.abort();return; }
        const backup=(name:string,value:string,done:()=>void)=>{
          const key=`raw:${name}:${digest(value).toString(16)}`,check=store.get(key);
          check.onsuccess=()=>{ if(check.result!==undefined && check.result!==value) { tx.abort();return; } if(check.result===undefined)store.add(value,key);done(); };
        };
        const publish=()=>{ if(current && parsed?.ok)store.put(current,'previous-valid');store.put(raw,'current'); };
        const preserveCurrent=()=>{ if(current)backup('current',current,publish);else publish(); };
        if(source)backup(source.key,source.raw,preserveCurrent);else if(replaceRaw!==undefined)preserveCurrent();else publish();
      };
      tx.oncomplete=()=>resolve({ ok:true,value:envelope });tx.onabort=()=>resolve(failure);
    });
  }
  close(){ this.db.close(); }
}
export { SAVE_KEY,LEGACY_SAVE_KEY };
