import type { ContentRegistry, EnemySnapshot, GemType, LootProvenance, RandomSource, StageId } from '../contracts';
import { Mutation, levelForXp } from './resource-transactions';
import { makeItem } from './affixes';
import { growPet } from './pet-growth';
import { addDrop, syncCapacity } from './ground-loot';
import { discoverOwned } from './collection';

export function weighted<T>(rows: readonly T[], weight: (row:T)=>number, rng: RandomSource): T {
  let roll = rng.next() * rows.reduce((sum,row)=>sum+weight(row),0);
  for (const row of rows) { roll-=weight(row); if (roll<0) return row; }
  return rows[rows.length-1];
}
const succeeds = (probability: number, rng: RandomSource) => probability===1 || probability>0 && rng.next()<probability;
function provenance(tx: Mutation, origin: LootProvenance['origin'], slot: LootProvenance['rewardSlot'], enemy: EnemySnapshot|null): LootProvenance {
  const run = tx.draft.state.activeRun!;
  return { origin,runId:run.runId,encounterId:run.encounterId,stageId:run.stageId,waveIndex:run.waveIndex,
    enemyId:enemy?.id ?? null,eventId: `${run.runId}:${origin}:${enemy?.id ?? 'clear'}:${slot}`,rewardSlot:slot,
    lootTableId:`loot-${run.stageId.slice(0,run.stageId.lastIndexOf('-'))}` as LootProvenance['lootTableId'],challengeId:run.challengeId };
}
export function resolveLoot(tx: Mutation, content: ContentRegistry, enemy: EnemySnapshot|null) {
  const s = tx.draft.state, run = s.activeRun!, stage = content.stages.find(d=>d.id===run.stageId)!;
  const table = content.lootTables.find(t=>t.id===stage.lootTableId)!, quality = content.qualityRows.find(q=>q.id===stage.qualityRowId)!;
  const rng = tx.random.reward, rates = enemy ? table.ranks[enemy.rank] : { equipment:.1,gem:.15,pet:0,dust:{ probability:1,count:4 } };
  const origin = enemy ? 'enemy-kill' : 'challenge-clear';
  if (succeeds(rates.equipment,rng)) {
    const definitionId = weighted(table.equipmentPool,row=>row.weight,rng).definitionId;
    const q = weighted(quality.equipment,row=>row.probability,rng).quality;
    const item = makeItem(tx.id('item'),definitionId,q,content,rng);
    s.inventory.itemById[item.id] = structuredClone(item) as typeof s.inventory.itemById[string];
    addDrop(tx,{ kind:'equipment',itemId:item.id },provenance(tx,origin,'equipment',enemy),enemy?.ordinal);
  }
  if (succeeds(rates.dust.probability,rng)) addDrop(tx,{ kind:'dust',amount:rates.dust.count },provenance(tx,origin,'dust',enemy),enemy?.ordinal);
  if (succeeds(rates.gem,rng)) addDrop(tx,{ kind:'gem',type:weighted(table.gemPool,row=>row.weight,rng).type,
    grade:weighted(quality.gem,row=>row.probability,rng).grade,count:1 },provenance(tx,origin,'gem',enemy),enemy?.ordinal);
  if (succeeds(rates.pet,rng)) {
    const id = tx.id('pet'), kind = weighted(table.petPool,row=>row.weight,rng).kind, q = weighted(quality.pet,row=>row.probability,rng).quality;
    s.inventory.petById[id]={ id,version:1,kind,quality:q,cumulativeXp:0,level:1,milestoneIds:[] };
    addDrop(tx,{ kind:'pet',petId:id },provenance(tx,origin,'pet',enemy),enemy?.ordinal);
  }
  syncCapacity(tx);
}
export function awardKill(tx: Mutation, enemy: EnemySnapshot, content: ContentRegistry) {
  const s=tx.draft.state, run=s.activeRun;
  if (!run || run.ruleset!=='release-r2' || run.combat.killedEnemyIds.includes(enemy.id)) return;
  run.combat.killedEnemyIds.push(enemy.id);
  s.hero.cumulativeXp += enemy.xp;
  const level=levelForXp(s.hero.cumulativeXp); s.hero.points += level-s.hero.level; s.hero.level=level;
  const petId=s.inventory.activePetId;
  if (petId) {
    const pet=growPet(s.inventory.petById[petId],enemy.xp,content);
    s.inventory.petById[petId]=structuredClone(pet) as typeof s.inventory.petById[string];
    tx.events.push({ type:'PetProgressed',payload:{ petId,cumulativeXp:pet.cumulativeXp,level:pet.level } });
  }
  tx.events.push({ type:'EnemyKilled',targetId:enemy.id,payload:{ enemyId:enemy.id,xp:enemy.xp,ordinal:enemy.ordinal } });
  resolveLoot(tx,content,enemy); discoverOwned(tx.draft);
}
export function awardFirstWolf(tx: Mutation) {
  const s=tx.draft.state;
  if (s.world.firstWolfGranted) return;
  s.world.firstWolfGranted=true;
  const id=tx.id('pet'); s.inventory.petById[id]={ id,version:1,kind:'wolf',quality:0,cumulativeXp:0,level:1,milestoneIds:[] };
  addDrop(tx,{ kind:'pet',petId:id },provenance(tx,'first-wolf','pet',null)); syncCapacity(tx);
}
export function awardFirstGem(tx: Mutation, type: GemType) {
  const id=addDrop(tx,{ kind:'gem',type,grade:1,count:1 },provenance(tx,'first-gem-choice','gem',null));
  tx.draft.state.world.oneTimeRewards['first-cleared-verdant-02-gem']={ state:'chosen',kind:type,dropId:id };
}
export function unlockStages(tx: Mutation, content: ContentRegistry) {
  const world=tx.draft.state.world, completed=new Set<StageId>(world.completedStageIds);
  world.unlockedStageIds=content.stages.filter(stage=>!stage.unlock.length || stage.unlock.some(clause=>clause.every(id=>completed.has(id)))).map(stage=>stage.id);
}

export function resolveLegacyLoot(tx:Mutation,content:ContentRegistry,enemyId:string) {
  const rng=tx.random.reward,inv=tx.draft.state.inventory;
  const source=(slot:LootProvenance['rewardSlot'])=>({ ...provenance(tx,'enemy-kill',slot,null),enemyId,lootTableId:'loot-legacy-v2' as const,eventId:`${tx.draft.state.activeRun!.runId}:legacy:${enemyId}:${slot}` });
  if(rng.next()<.65) {
    const definition=content.equipment[Math.floor(rng.next()*8)],item=makeItem(tx.id('item'),definition.id,0,content,rng);
    inv.itemById[item.id]=structuredClone(item) as typeof inv.itemById[string];addDrop(tx,{ kind:'equipment',itemId:item.id },source('equipment'));
  }
  if(rng.next()<.08) {
    const id=tx.id('pet');inv.petById[id]={ id,version:1,kind:rng.next()<.5?'wolf':'fairy',quality:0,cumulativeXp:0,level:1,milestoneIds:[] };
    addDrop(tx,{ kind:'pet',petId:id },source('pet'));
  }
  syncCapacity(tx);
}
