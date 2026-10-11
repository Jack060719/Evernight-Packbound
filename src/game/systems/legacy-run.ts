import type { ContentRegistry, ActiveRun, ReleaseGameState } from '../contracts';
import type { BattleAction, EnemyKind } from '../types';
import { ITEMS, PETS, QUALITY_MULTIPLIERS } from '../content';
import { Mutation, levelForXp, type Mutable } from './resource-transactions';
import { equipped } from './affixes';
import { growPet } from './pet-growth';
import { resolveLegacyLoot, awardFirstWolf, unlockStages } from './reward-resolution';
import { settleGround } from './ground-loot';

type LegacyRun = Mutable<Extract<ActiveRun,{ ruleset:'legacy-v2' }>>;
export function legacyStats(s:ReleaseGameState) {
  let maxHp=100+s.hero.healthPoints*15,attack=4+s.hero.attackPoints*2,defense=0;
  for(const item of equipped(s)) { const base=ITEMS[item.baseKind],q=QUALITY_MULTIPLIERS[item.quality];maxHp+=base.health*q;attack+=base.attack*q;defense+=base.defense*q; }
  return { maxHp,attack,defense };
}
function available(tx:Mutation,run:LegacyRun,action:BattleAction) {
  const inv=tx.draft.state.inventory;
  if(action.kind==='enemy')return run.combat.enemies.some(e=>e.id===action.sourceId);
  if(action.kind==='unarmed')return run.combat.enemies.length>0;
  if(action.kind==='pet')return inv.activePetId===action.sourceId && (inv.petById[action.sourceId].kind==='fairy' || run.combat.enemies.length>0);
  return inv.locationById[action.sourceId]?.kind==='equipped' && (action.kind==='charm' || run.combat.enemies.length>0);
}
function beginLegacyRound(tx:Mutation,run:LegacyRun) {
  const items=equipped(tx.draft.state),weapons=items.filter(i=>ITEMS[i.baseKind].damage>0),b=run.combat;
  b.actions=weapons.length?weapons.map(i=>({ kind:'weapon',sourceId:i.id })):[{ kind:'unarmed',sourceId:'hero' }];
  for(const item of items) if(ITEMS[item.baseKind].healing>0 && b.round%3===0)b.actions.push({ kind:'charm',sourceId:item.id });
  const petId=tx.draft.state.inventory.activePetId,pet=petId?tx.draft.state.inventory.petById[petId]:null;
  if(pet && b.round%PETS[pet.kind].everyRounds===0)b.actions.push({ kind:'pet',sourceId:pet.id });
  b.actions.push(...b.enemies.map(e=>({ kind:'enemy' as const,sourceId:e.id })));b.actionIndex=0;b.actionResolved=false;b.remaining=.5;b.stage='weapons';
}
function finishLegacyRound(tx:Mutation,run:LegacyRun,content:ContentRegistry) {
  const s=tx.draft.state,b=run.combat;
  if(b.enemies.length) { b.round++;beginLegacyRound(tx,run);return; }
  if(run.legacyWave<5) {
    run.legacyWave++;run.waveIndex=run.legacyWave-1;run.encounterId=`${run.runId}:w${run.waveIndex}`;
    b.phase='travel';b.remaining=2;b.actions=[];b.actionIndex=0;b.actionResolved=false;b.round=1;b.stage='weapons';run.status='travel';return;
  }
  run.status='settlement';b.actions=[];b.remaining=0;
  if(!s.world.completedStageIds.includes(run.stageId))s.world.completedStageIds.push(run.stageId);
  s.world.completionCounts[run.stageId]=(s.world.completionCounts[run.stageId]??0)+1;
  unlockStages(tx,content);if(run.legacyFloor===1)awardFirstWolf(tx);
  s.lifecycle.resumeRequired=true;s.lifecycle.pauseReasons=['camp'];settleGround(tx);
  tx.events.push({ type:'StageCompleted',runId:run.runId,payload:{ stageId:run.stageId,challengeId:null,rewardIds:[] } });
}
export function legacyTick(tx:Mutation,content:ContentRegistry):boolean {
  const s=tx.draft.state,run=s.activeRun;if(run?.ruleset!=='legacy-v2' || run.status==='settlement' || run.status==='dead')return false;
  const b=run.combat;run.legacyTime+=.05;
  if(b.phase==='travel') {
    b.remaining-=.05;if(b.remaining>1e-10)return false;
    const kinds:EnemyKind[]=run.legacyFloor===3 && run.legacyWave===5?['boss']:Array.from({ length:run.legacyWave===5?3:run.legacyWave>=3?2:1 },(_,i)=>(run.legacyWave+i)%2===0?'slime':'skeleton');
    b.enemies=kinds.map(kind=>{ const scale=1+(run.legacyFloor-1)*.65,hp=Math.round((kind==='boss'?240:kind==='skeleton'?33:44)*scale);return { id:tx.id('legacy-enemy'),kind,name:kind==='boss'?'遺跡守衛':kind==='skeleton'?'小骨兵':'露珠史萊姆',hp,maxHp:hp,damage:(kind==='boss'?12:kind==='skeleton'?5:6)*scale,xp:(kind==='boss'?80:12)*run.legacyFloor }; });
    b.phase='combat';run.status='combat';b.round=1;beginLegacyRound(tx,run);return true;
  }
  let changed=false;
  if(!b.actionResolved)while(b.actions[b.actionIndex] && !available(tx,run,b.actions[b.actionIndex]))b.actionIndex++;
  const action=b.actions[b.actionIndex];
  if(!action) { finishLegacyRound(tx,run,content);return true; }
  b.stage=action.kind==='enemy'?'enemies':action.kind==='pet'||action.kind==='charm'?'support':'weapons';
  if(!b.actionResolved) {
    b.actionResolved=true;changed=true;
    const stats=legacyStats(s),inv=s.inventory;
    let damage=0,healing=0;
    if(action.kind==='weapon') { const item=inv.itemById[action.sourceId];damage=ITEMS[item.baseKind].damage*QUALITY_MULTIPLIERS[item.quality]+stats.attack; }
    if(action.kind==='unarmed')damage=stats.attack;
    if(action.kind==='charm') { const item=inv.itemById[action.sourceId];healing=ITEMS[item.baseKind].healing*QUALITY_MULTIPLIERS[item.quality]; }
    if(action.kind==='pet') { const pet=inv.petById[action.sourceId],power=PETS[pet.kind].power*QUALITY_MULTIPLIERS[pet.quality]*(1+.15*(pet.level-1));if(pet.kind==='wolf')damage=power;else healing=power; }
    if(action.kind==='enemy') {
      const enemy=b.enemies.find(e=>e.id===action.sourceId)!;const amount=Math.max(1,enemy.damage-stats.defense);s.hero.hp=Math.max(0,s.hero.hp-amount);
      tx.events.push({ type:'DamageApplied',sourceId:enemy.id,payload:{ amount,hpAfter:s.hero.hp,shieldAfter:0 } });
    }
    if(healing) { const actual=Math.min(stats.maxHp-s.hero.hp,healing);s.hero.hp+=actual;tx.events.push({ type:'HealApplied',sourceId:action.sourceId,payload:{ actual,overheal:0,hpAfter:s.hero.hp } }); }
    if(damage && b.enemies.length) {
      const enemy=b.enemies[0],hpDamage=Math.min(enemy.hp,damage);enemy.hp=Math.max(0,enemy.hp-damage);
      const hitId=`${run.encounterId}:r${b.round}:a${b.actionIndex}`;
      tx.events.push({ type:'HitResolved',sourceId:action.sourceId,targetId:enemy.id,payload:{ hitId,amount:damage,hpDamage,shieldDamage:0,critical:false } });
      if(enemy.hp===0) {
        b.enemies.shift();s.hero.cumulativeXp+=enemy.xp;const level=levelForXp(s.hero.cumulativeXp);s.hero.points+=level-s.hero.level;s.hero.level=level;
        if(inv.activePetId)inv.petById[inv.activePetId]=structuredClone(growPet(inv.petById[inv.activePetId],enemy.xp,content)) as typeof inv.petById[string];
        resolveLegacyLoot(tx,content,enemy.id);
      }
    }
    if(s.hero.hp===0) { run.status='dead';b.phase='dead';s.lifecycle.pendingChoice={ kind:'death',runId:run.runId };s.lifecycle.resumeRequired=true;settleGround(tx);return true; }
    if(s.lifecycle.pauseReasons.includes('capacity'))return true;
  }
  b.remaining-=.05;
  if(b.remaining<=1e-10) {
    b.actionIndex++;b.actionResolved=false;b.remaining=.5;
    while(b.actions[b.actionIndex] && !available(tx,run,b.actions[b.actionIndex]))b.actionIndex++;
    if(!b.actions[b.actionIndex])finishLegacyRound(tx,run,content);changed=true;
  }
  return changed;
}
