import { getExecutionPermission, type Command, type CommandEnvelope, type CommandPort, type CommandPreview, type CommittedEvent,
  type ContentRegistry, type PreviewableCommand, type Result, type SaveEnvelope, type SaveCommitter, type TransactionReceipt, type ValidatedPlan } from './contracts';
import { releaseContent } from './registries';
import { Mutation, RuleError, requireRule, result, type Draft } from './systems/resource-transactions';
import { inventoryCommand, warehouseCount, petCount } from './systems/inventory';
import { synthesisCommand } from './systems/synthesis';
import { salvageCommand } from './systems/salvage';
import { customizationCommand } from './systems/reroll';
import { loadoutCommand } from './systems/loadouts';
import { collectionCommand, discoverOwned } from './systems/collection';
import { trackingCommand } from './systems/loot-tracking';
import { worldCommand } from './systems/world';
import { groundCommand, syncCapacity, advanceGround, pickup } from './systems/ground-loot';
import { combatTick, startRun } from './systems/stage-flow';
import { legacyTick } from './systems/legacy-run';

export function fingerprint(value:unknown):string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${fingerprint((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function confirmation(command:Command):CommandPreview['confirmation'] {
  switch(command.type) {
    case 'synthesis.item':case 'synthesis.pet':return 'synthesis';
    case 'inventory.discard':return 'discard'; case 'salvage.single':return 'salvage';
    case 'customize.reroll':return 'reroll';case 'pet.release':return 'release-pet';case 'world.abandon':return 'abandon-run';
    default:return null;
  }
}
export function planCommand(snapshot:SaveEnvelope,command:Command,content=releaseContent,preview=false):Mutation {
  const tx=new Mutation(snapshot);
  const handled=inventoryCommand(tx,command,content) || synthesisCommand(tx,command,content,preview) || salvageCommand(tx,command,content)
    || customizationCommand(tx,command,content,preview) || loadoutCommand(tx,command,content) || collectionCommand(tx,command,content)
    || trackingCommand(tx,command,content) || worldCommand(tx,command,content) || groundCommand(tx,command,content);
  requireRule(handled,'UNKNOWN_CONTENT','未知操作。');
  discoverOwned(tx.draft); syncCapacity(tx); tx.finish(); return tx;
}
export function previewCommand(snapshot:SaveEnvelope,command:PreviewableCommand,content=releaseContent):Result<CommandPreview> {
  return result(()=>{
    const tx=planCommand(snapshot,command,content,true),inv=snapshot.state.inventory,next=tx.draft.state.inventory;
    const references = 'item' in command ? [command.item] : 'pair' in command ? [command.pair.primary,command.pair.material] : 'pet' in command && command.pet ? [command.pet] : [];
    const quality='pair' in command ? command.type==='synthesis.item'?inv.itemById[command.pair.primary.id].quality:inv.petById[command.pair.primary.id].quality:null;
    const dustDifference=next.resources.dust-inv.resources.dust;
    const retainedIds=tx.outcome.kind==='accepted'?references.map(r=>r.id).filter(id=>!tx.consumedIds.includes(id)):[tx.outcome.retainedId];
    return { token:{ commandFingerprint:fingerprint(command),expectedRevision:snapshot.revision,references,contentVersion:content.version },command,
      successChance:quality===null?null:content.economy.synthesisChances[quality],retainedIds,consumedIds:tx.consumedIds,
      returnedGems:Object.values(next.gemStacks).flatMap(stack=>{ const count=stack.count-inv.gemStacks[`${stack.type}:${stack.grade}`].count;return count>0?[{ type:stack.type,grade:stack.grade,count }]:[]; }),
      dustCost:Math.max(0,-dustDifference),dustReturned:Math.max(0,dustDifference),resultingWarehouseCount:warehouseCount(next),resultingPetCount:petCount(next),
      nextQuality:quality===null?null:quality+1 as 1|2|3|4|5,confirmation:confirmation(command) };
  });
}
export class ReleaseEngine implements CommandPort {
  private snapshot:SaveEnvelope;
  private pending=false;
  private stopped:'save-error'|'save-conflict'|null=null;
  private events:CommittedEvent[]=[];
  constructor(snapshot:SaveEnvelope,private readonly committer:SaveCommitter,readonly content:ContentRegistry=releaseContent) { this.snapshot=snapshot; }
  get envelope() { return this.snapshot; }
  get state() { return this.snapshot.state; }
  get busy() { return this.pending; }
  get blocked() { return this.stopped; }
  drainEvents() { const events=this.events;this.events=[];return events; }
  preview(command:PreviewableCommand) { return previewCommand(this.snapshot,command,this.content); }
  validate(command:Command,envelope:CommandEnvelope):Result<ValidatedPlan> {
    return result(()=>{
      if (/^(inventory|synthesis|salvage|customize|pet|loadout)\./.test(command.type)) requireRule(this.snapshot.state.lifecycle.resumeRequired || this.snapshot.state.lifecycle.pauseReasons.length>0,'NOT_IN_ALLOWED_MODE','請先暫停，再調整配裝。');
      requireRule(!this.stopped,'SAVE_READ_ONLY','儲存已停止，請先備份並重新載入。');
      requireRule(!this.pending,'PAUSED','正在保存上一個操作，請稍候。');
      requireRule(envelope.expectedRevision===this.snapshot.revision,'SAVE_CONFLICT','進度版本已變更，請重新操作。');
      requireRule(Number.isSafeInteger(envelope.commandSeq) && envelope.commandSeq>this.snapshot.counters.lastAppliedCommandSeq,'COMMAND_TOO_OLD','這個操作序號已過期。');
      let preview:CommandPreview|null=null;
      if (confirmation(command)) {
        const checked=this.preview(command as PreviewableCommand); if (!checked.ok) throw new RuleError(checked.error);
        preview=checked.value;
        requireRule(envelope.confirmedPreview && fingerprint(envelope.confirmedPreview)===fingerprint(preview.token),'CONFIRMATION_REQUIRED','請先確認最新的材料、費用及結果預覽。');
      }
      return { command,envelope,references:preview?.token.references??[],preview };
    });
  }
  async dispatch(command:Command,envelope:CommandEnvelope):Promise<Result<TransactionReceipt>> {
    const previous=this.snapshot.receipts.find(r=>r.commandId===envelope.commandId);
    if (previous) return previous.commandFingerprint===fingerprint(command)?{ ok:true,value:previous }:{ ok:false,error:{ code:'COMMAND_CONFLICT',message:'相同操作 ID 不能改成另一個內容。' } };
    const validated=this.validate(command,envelope); if (!validated.ok) return validated;
    const planned=result(()=>planCommand(this.snapshot,command,this.content)); if (!planned.ok) return planned;
    planned.value.draft.counters.lastAppliedCommandSeq=envelope.commandSeq;
    return this.commit(planned.value,envelope,command);
  }
  private async commit(tx:Mutation,envelope?:CommandEnvelope,command?:Command):Promise<Result<TransactionReceipt>> {
    this.pending=true;
    tx.finish();
    const draft=tx.draft,transactionId=`${draft.saveId}:tx${draft.counters.nextTransactionSeq++}`;
    draft.revision=this.snapshot.revision+1;
    const events:CommittedEvent[]=tx.events.map(event=>({ ...event,transactionId,eventSeq:++draft.counters.eventSeq,eventId:`${transactionId}:e${draft.counters.eventSeq}` }));
    const receipt:TransactionReceipt={ transactionId,commandId:envelope?.commandId,commandFingerprint:command?fingerprint(command):undefined,revision:draft.revision,
      eventRange:events.length?{ first:events[0].eventSeq,last:events[events.length-1].eventSeq }:null,outcome:tx.outcome,
      consumedIds:tx.consumedIds,createdIds:tx.createdIds,rngBefore:this.snapshot.rng,rngAfter:draft.rng };
    draft.receipts.push(structuredClone(receipt) as Draft['receipts'][number]); draft.receipts=draft.receipts.slice(-128);
    let saved:Result<TransactionReceipt>;
    try { saved=await this.committer.commitSnapshot(this.snapshot.revision,{ envelope:draft,events }); }
    catch { saved={ ok:false,error:{ code:'SAVE_FAILED',message:'儲存交易未完成，進度已暫停。' } }; }
    this.pending=false;
    if (saved.ok) { this.snapshot=draft;this.events.push(...events); }
    else this.stopped=saved.error.code==='SAVE_CONFLICT'?'save-conflict':'save-error';
    return saved;
  }
  async checkpoint():Promise<Result<TransactionReceipt>> { return this.commit(new Mutation(this.snapshot)); }
  async tick():Promise<void> {
    if (this.pending || this.stopped) return;
    const s=this.state;
    const allowed=getExecutionPermission(s,{ visible:true,storageGate:false,settlementReady:true,exitReady:true });
    if (s.lifecycle.exitRequest && !s.lifecycle.resumeRequired && !s.lifecycle.pauseReasons.length) {
      const tx=new Mutation(this.snapshot),exit=tx.draft.state.lifecycle.exitRequest!;
      const drop=tx.draft.state.groundDrops.filter(d=>d.state!=='claimed').sort((a,b)=>a.order-b.order)[0];
      if (drop) {
        exit.nextDropId=drop.id;
        const picked=result(()=>pickup(tx,{ id:drop.id,version:drop.version },'stage-exit'));
        if (!picked.ok) { syncCapacity(tx); if (picked.error.code==='LOOT_NOT_READY') advanceGround(tx,50); }
      } else startRun(tx,exit.targetStageId,exit.challengeId,this.content);
      await this.commit(tx);return;
    }
    if (!allowed.groundAllowed) return;
    const tx=new Mutation(this.snapshot); tx.draft.state.simulation.elapsedTicks++;
    const beforeReady=tx.draft.state.groundDrops.filter(d=>d.state==='available').length;
    advanceGround(tx,50);
    let durable=tx.draft.state.activeRun?.ruleset==='legacy-v2'?legacyTick(tx,this.content):combatTick(tx,this.content);
    if (durable) discoverOwned(tx.draft);
    if (tx.draft.state.groundDrops.filter(d=>d.state==='available').length!==beforeReady) durable=true;
    const run=tx.draft.state.activeRun;
    if (run?.ruleset==='release-r2' && run.status==='settlement' && run.phaseRemainingTicks===0 && !tx.draft.state.lifecycle.pendingChoice && tx.draft.state.settings.autoRepeatEnabled) {
      worldCommand(tx,{ type:'world.repeat',runId:run.runId },this.content);durable=true;
    }
    tx.finish();
    if (durable || tx.draft.state.simulation.elapsedTicks%100===0) await this.commit(tx);
    else this.snapshot=tx.draft;
    // Proximity and taps use the same transaction; picking up does not consume a combat tick.
    if (!this.stopped && !this.state.lifecycle.pauseReasons.length && !this.state.lifecycle.resumeRequired) {
      const active=this.state.activeRun;
      const heroX=active?.ruleset==='release-r2' && active.status==='wave-entry'?90+(30-active.phaseRemainingTicks)*7:active?.status==='settlement'?270:90;
      for (const drop of this.state.groundDrops.filter(d=>d.state==='available' && Math.abs(d.position.x-heroX)<=72)) {
        const pickupTx=new Mutation(this.snapshot),picked=result(()=>pickup(pickupTx,{ id:drop.id,version:drop.version },'proximity'));
        if (picked.ok) await this.commit(pickupTx);
        if (this.stopped || this.state.lifecycle.pauseReasons.length) break;
      }
    }
  }
}
