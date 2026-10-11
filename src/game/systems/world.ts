import type { Command, ContentRegistry, StageId, ChallengeId } from '../contracts';
import { Mutation, requireRule } from './resource-transactions';
import { settleGround, groundCapacityBlocked } from './ground-loot';
import { awardFirstGem } from './reward-resolution';
import { startRun } from './stage-flow';

function validateDestination(tx:Mutation,stageId:StageId,challengeId:ChallengeId|null,content:ContentRegistry) {
  const s=tx.draft.state,stage=content.stages.find(d=>d.id===stageId);
  requireRule(stage && s.world.unlockedStageIds.includes(stageId),'STAGE_LOCKED','這個關卡尚未解鎖。');
  requireRule(!challengeId || content.challenges.some(c=>c.id===challengeId && c.regionId===stage.regionId) && s.world.completedStageIds.includes(stageId),'STAGE_LOCKED','普通關卡通關後才能挑戰。');
}
function requestExit(tx:Mutation,stageId:StageId,challengeId:ChallengeId|null,reason:'repeat'|'next'|'abandon'|'retry',content:ContentRegistry) {
  validateDestination(tx,stageId,challengeId,content);
  const s=tx.draft.state,run=s.activeRun;
  requireRule(s.world.oneTimeRewards['first-cleared-verdant-02-gem'].state!=='awaiting-choice','REQUIRED_CHOICE','請先選擇首次通關寶石。');
  if (!run && !s.groundDrops.some(d=>d.state!=='claimed')) { startRun(tx,stageId,challengeId,content); return; }
  s.lifecycle.exitRequest={ requestId:tx.id('exit'),fromRunId:run?.runId??'camp',targetStageId:stageId,challengeId,reason,nextDropId:null };
  s.lifecycle.pendingChoice=null; s.lifecycle.resumeRequired=false;
  s.lifecycle.pauseReasons=s.lifecycle.pauseReasons.filter(p=>['hidden','save-error','save-conflict','capacity'].includes(p));
  if (run) run.status='exit-wait';
  // Exit from a paused camp must not strand a falling object.
  settleGround(tx);
}
export function worldCommand(tx:Mutation,command:Command,content:ContentRegistry):boolean {
  const s=tx.draft.state,run=s.activeRun;
  switch(command.type) {
    case 'world.selectChallenge':
      validateDestination(tx,command.stageId,command.challengeId,content);
      s.world.selectedStageId=command.stageId; s.world.selectedChallengeId=command.challengeId;
      s.tracking.selectedSourceStageId=command.stageId; return true;
    case 'world.setAutoRepeat':
      requireRule(typeof command.enabled==='boolean','NOT_IN_ALLOWED_MODE','重複設定不合法。');
      s.settings.autoRepeatEnabled=command.enabled; return true;
    case 'world.start':
      requireRule(!run || ['dead','settlement'].includes(run.status),'ACTIVE_RUN_EXISTS','請先繼續或確認放棄目前的旅程。');
      requireRule(!run || run.status==='dead' || run.ruleset!=='release-r2' || run.phaseRemainingTicks===0,'NOT_IN_ALLOWED_MODE','結算尚未完成，請先繼續結算。');
      requestExit(tx,command.stageId,command.challengeId,run?.status==='dead'?'retry':'next',content); return true;
    case 'world.next':
      requireRule(!run || run.status==='settlement','NOT_IN_ALLOWED_MODE','請先完成目前關卡。');
      requireRule(!run || run.ruleset!=='release-r2' || run.phaseRemainingTicks===0,'NOT_IN_ALLOWED_MODE','結算尚未完成。');
      requestExit(tx,command.stageId,command.challengeId,'next',content); return true;
    case 'world.abandon':
      requireRule(run && run.runId===command.runId,'STALE_VERSION','目前旅程已變更。');
      requireRule(s.world.oneTimeRewards['first-cleared-verdant-02-gem'].state!=='awaiting-choice','REQUIRED_CHOICE','請先選擇首次通關寶石。');
      s.activeRun=null;s.lifecycle={pauseReasons:['camp'],resumeRequired:true,pendingChoice:null,exitRequest:null};
      settleGround(tx);tx.events.push({type:'CampEntered',payload:{reason:'manual'}});return true;
    case 'world.repeat':
      requireRule(run && run.runId===command.runId,'STALE_VERSION','目前旅程已變更。');
      requireRule(['dead','settlement'].includes(run.status),'NOT_IN_ALLOWED_MODE','關卡尚未結束。');
      requireRule(run.status==='dead' || run.ruleset!=='release-r2' || run.phaseRemainingTicks===0,'NOT_IN_ALLOWED_MODE','結算尚未完成。');
      requestExit(tx,run.stageId,run.challengeId,run.status==='dead'?'retry':'repeat',content); return true;
    case 'world.enterCamp':
      requireRule(run && run.runId===command.runId,'STALE_VERSION','目前旅程已變更。');
      if (!s.lifecycle.pauseReasons.includes('camp')) s.lifecycle.pauseReasons.push('camp');
      s.lifecycle.resumeRequired=true; settleGround(tx); tx.events.push({ type:'CampEntered',payload:{ reason:'manual' } }); return true;
    case 'world.continue':
      requireRule(run && run.runId===command.runId,'STALE_VERSION','目前旅程已變更。');
      return continueRun(tx);
    case 'lifecycle.requestContinue': return continueRun(tx);
    case 'lifecycle.pause':
      if (command.paused) {
        if (!s.lifecycle.pauseReasons.includes(command.reason)) s.lifecycle.pauseReasons.push(command.reason);
        s.lifecycle.resumeRequired=true;
        if (command.reason==='camp') settleGround(tx);
      } else s.lifecycle.pauseReasons=s.lifecycle.pauseReasons.filter(p=>p!==command.reason);
      return true;
    case 'lifecycle.visibility':
      s.lifecycle.pauseReasons=s.lifecycle.pauseReasons.filter(p=>p!=='hidden');
      if (!command.visible) s.lifecycle.pauseReasons.push('hidden');
      s.lifecycle.resumeRequired=true; return true;
    case 'world.chooseFirstReward':
      requireRule(s.world.oneTimeRewards[command.rewardId].state==='awaiting-choice','ALREADY_APPLIED','目前沒有待選的首次通關獎勵。');
      requireRule(content.gems.some(g=>g.type===command.gemType),'UNKNOWN_CONTENT','找不到這種寶石。');
      awardFirstGem(tx,command.gemType); settleGround(tx); s.lifecycle.pendingChoice=null; s.lifecycle.resumeRequired=true; return true;
    case 'settings.update':
      requireRule(Object.keys(command.changes).every(key=>['musicVolume','soundVolume','musicMuted','soundMuted','reducedMotion'].includes(key)),'NOT_IN_ALLOWED_MODE','未知設定項目。');
      for (const [key,value] of Object.entries(command.changes)) requireRule(['musicVolume','soundVolume'].includes(key)?typeof value==='number' && Number.isFinite(value) && value>=0 && value<=1:typeof value==='boolean','NOT_IN_ALLOWED_MODE','音量或設定值不合法。');
      Object.assign(s.settings,command.changes); return true;
    default:return false;
  }
}
function continueRun(tx:Mutation):boolean {
  const s=tx.draft.state;
  requireRule(s.activeRun && s.hero.hp>0 && s.activeRun.status!=='dead','NOT_IN_ALLOWED_MODE','倒下後請選擇重新挑戰。');
  requireRule(!s.lifecycle.pendingChoice,'REQUIRED_CHOICE','請先完成必要選擇。');
  requireRule(!groundCapacityBlocked(s),'GROUND_UNCLAIMED','請先整理容量並領取待領裝備或靈寵。');
  requireRule(!s.lifecycle.pauseReasons.some(p=>['hidden','save-error','save-conflict'].includes(p)),'PAUSED','目前仍有無法繼續的狀態。');
  s.lifecycle.pauseReasons=[]; s.lifecycle.resumeRequired=false; return true;
}
