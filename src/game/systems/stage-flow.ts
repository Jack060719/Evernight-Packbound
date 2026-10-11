import type { ContentRegistry, StageId, ChallengeId, EnemySnapshot } from '../contracts';
import { Mutation, round1, type Mutable } from './resource-transactions';
import { combatStats } from './affixes';
import { emptyCombat, beginRound, living, eligible, createAction } from './combat/queue';
import { beforeAction, resolveImpact, poisonPhase } from './combat/effects';
import { awardFirstWolf, resolveLoot, unlockStages } from './reward-resolution';
import { settleGround } from './ground-loot';

export function spawnWave(tx:Mutation,content:ContentRegistry) {
  const run=tx.draft.state.activeRun!; if (run.ruleset!=='release-r2') return;
  const stage=content.stages.find(s=>s.id===run.stageId)!,challenge=content.challenges.find(c=>c.id===run.challengeId);
  run.encounterId=`${run.runId}:w${run.waveIndex}`;
  run.combat.enemies=stage.waves[run.waveIndex].enemies.map(spawn=>{
    const definition=content.enemies.find(e=>e.id===spawn.definitionId)!;
    const effects=[...spawn.effects];
    if (challenge && ['E','B'].includes(definition.rank)) for (const effect of challenge.addedEffects) if (!effects.some(e=>e.effectId===effect.effectId)) effects.push(effect);
    const id=tx.id('enemy'),maxHp=Math.round(spawn.hp*(challenge?.hpMultiplier??1));
    return { id,definitionId:spawn.definitionId,rank:definition.rank,ordinal:spawn.ordinal,hp:maxHp,maxHp,attack:Math.round(spawn.attack*(challenge?.attackMultiplier??1)),xp:spawn.xp,
      armor:effects.reduce((a,m)=>a+('kind' in m.parameters && m.parameters.kind==='armor'?m.parameters.flatArmor:0),0),shield:Math.max(0,...effects.map(m=>'kind' in m.parameters && m.parameters.kind==='barrier' && m.parameters.trigger==='spawn'?round1(maxHp*m.parameters.maxHpFraction):0)),
      actionCount:0,frenzyActivated:false,poison:[],mechanics:effects.map(effect=>({ ...effect,sourceId:id,sourceKind:'enemy',definitionVersion:content.version })) } as Mutable<EnemySnapshot>;
  });
  run.combat.healingSuppression=run.combat.healingSuppression.map(effect=>({...effect,expiresAfterSupportRound:Math.max(1,effect.expiresAfterSupportRound-run.combat.round)}));
  run.combat.round=1; run.combat.waveCompletionResolved=false; run.combat.killedEnemyIds=[];
  run.status='wave-entry'; run.phaseRemainingTicks=30;
}
export function startRun(tx:Mutation,stageId:StageId,challengeId:ChallengeId|null,content:ContentRegistry) {
  const s=tx.draft.state,runId=`${tx.draft.saveId}:run${tx.draft.counters.nextRunSeq++}`;
  s.groundDrops=s.groundDrops.filter(d=>d.state!=='claimed');
  s.activeRun={ runId,stageId,challengeId,contentVersion:content.version,definitionVersion:content.version,ruleset:'release-r2',waveIndex:0,encounterId:`${runId}:w0`,status:'wave-entry',phaseRemainingTicks:30,combat:emptyCombat() };
  s.hero.hp=combatStats(s,content).maxHp;
  s.lifecycle={ resumeRequired:false,pauseReasons:[],pendingChoice:null,exitRequest:null };
  s.world.selectedStageId=stageId; s.world.selectedChallengeId=challengeId; s.settings.introSeen=true;
  spawnWave(tx,content); tx.events.push({ type:'RunEntered',payload:{ stageId,challengeId } });
}
export function resolveDeath(tx:Mutation) {
  const s=tx.draft.state,run=s.activeRun; if (!run || s.hero.hp>0) return false;
  run.status='dead';
  if (run.ruleset==='release-r2') run.combat.heroDeathResolved=true;
  s.lifecycle.pendingChoice={ kind:'death',runId:run.runId }; s.lifecycle.resumeRequired=true; settleGround(tx); return true;
}
export function completeStage(tx:Mutation,content:ContentRegistry) {
  const s=tx.draft.state,run=s.activeRun!;
  if (run.ruleset!=='release-r2' || run.combat.stageCompletionResolved || s.hero.hp<=0) return;
  run.combat.stageCompletionResolved=true; run.status='settlement'; run.phaseRemainingTicks=20;
  if (!s.world.completedStageIds.includes(run.stageId)) s.world.completedStageIds.push(run.stageId);
  s.world.completionCounts[run.stageId]=(s.world.completionCounts[run.stageId]??0)+1;
  unlockStages(tx,content);
  if (run.stageId==='verdant-01') awardFirstWolf(tx);
  if (run.challengeId) resolveLoot(tx,content,null);
  if (run.stageId==='verdant-02' && s.world.oneTimeRewards['first-cleared-verdant-02-gem'].state==='unearned') {
    s.world.oneTimeRewards['first-cleared-verdant-02-gem']={ state:'awaiting-choice',runId:run.runId };
    s.lifecycle.pendingChoice={ kind:'first-gem',rewardId:'first-cleared-verdant-02-gem' }; s.lifecycle.resumeRequired=true; settleGround(tx);
  }
  tx.events.push({ type:'StageCompleted',runId:run.runId,payload:{ stageId:run.stageId,challengeId:run.challengeId,rewardIds:run.challengeId?[`${run.runId}:challenge-clear`]:[] } });
}
/** One 50 ms tick; zero-duration hooks never create extra action time. */
export function combatTick(tx:Mutation,content:ContentRegistry): boolean {
  const run=tx.draft.state.activeRun; if (run?.ruleset!=='release-r2') return false;
  const c=run.combat;
  if (run.status==='wave-entry' || run.status==='travel') {
    if (--run.phaseRemainingTicks<=0) { run.status='combat'; beginRound(tx,content); return true; } return false;
  }
  if (run.status==='settlement') { if (run.phaseRemainingTicks>0) run.phaseRemainingTicks--; return run.phaseRemainingTicks===0; }
  if (run.status!=='combat') return false;
  if (!c.queue.length) beginRound(tx,content);
  let boundary=false,consumedTick=false;
  for (let guard=0;guard<64;guard++) {
    if (resolveDeath(tx)) return true;
    if (c.currentAction) {
      if (consumedTick) return boundary;
      const action=c.currentAction;
      if (!eligible(tx,action)) { action.sourceStillEligible=false; action.cursor.hitIndex=action.hitPlan.length; }
      const elapsed=10-action.cursor.remainingTicks,entry=action.hitPlan[action.cursor.hitIndex];
      if (action.sourceStillEligible && entry && entry.dueTick<=elapsed) { resolveImpact(tx,action,content); boundary=true; }
      action.cursor.remainingTicks--;
      if (action.cursor.remainingTicks<=0) {
        tx.events.push({ type:'ActionResolved',sourceId:action.sourceId,payload:{ actionId:action.actionId,cancelled:!action.sourceStillEligible } });
        c.currentAction=null; c.actionIndex++; boundary=true; consumedTick=true;
      }
      if (resolveDeath(tx)) return true;
      if (!consumedTick) return boundary;
      continue;
    }
    const next=c.queue[c.actionIndex];
    if ((!next || next.sourceKind==='enemy') && c.stage!=='enemies' && c.stage!=='hero-dot' && c.stage!=='round-end') {
      c.stage='enemies';
      c.healingSuppression=c.healingSuppression.filter(e=>e.expiresAfterSupportRound>c.round);
      poisonPhase(tx,content,false); boundary=true;
      if (tx.draft.state.lifecycle.pauseReasons.includes('capacity')) return true;
    }
    if (!next) {
      c.stage='hero-dot'; poisonPhase(tx,content,true); if (resolveDeath(tx)) return true;
      c.stage='round-end'; c.roundEndResolved=true;
      if (!living(c).length) {
        c.waveCompletionResolved=true;
        if (run.waveIndex===9) completeStage(tx,content);
        else { run.waveIndex++; spawnWave(tx,content); }
        return true;
      }
      c.round++; beginRound(tx,content); boundary=true; continue;
    }
    const source=c.roundSourceSnapshots.find(s=>s.sourceId===next.sourceId)!;
    if (!eligible(tx,source)) { c.actionIndex++; continue; }
    if (consumedTick) return boundary;
    if (next.sourceKind==='charm' || next.sourceKind==='pet') c.stage='support';
    c.currentAction=createAction(tx,source,content); beforeAction(tx,c.currentAction,content); boundary=true;
  }
  throw new Error('Combat transition did not converge');
}
