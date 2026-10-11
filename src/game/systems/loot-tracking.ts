import type { Command, ContentRegistry, ReleaseGameState, TrackingView } from '../contracts';
import { Mutation, requireRule } from './resource-transactions';

export function trackingView(state: ReleaseGameState, content: ContentRegistry): TrackingView {
  const { inventory: inv, tracking: { target, craftingGoal } } = state;
  const view: TrackingView = { target, sources: [], owned: { equipped: 0,warehouse: 0,stacked: 0,embedded: 0,onGround: 0 }, missing: { equipment: 0,gems: 0,dust: 0 } };
  if (!target) return view;
  if (target.kind==='equipment') {
    for (const item of Object.values(inv.itemById)) if (item.definitionId===target.definitionId && item.quality===target.quality) {
      const location = inv.locationById[item.id]; if (location.kind==='ground') view.owned.onGround++; else view.owned[location.kind]++;
    }
    view.missing.equipment = Math.max(0,target.count-view.owned.equipped-view.owned.warehouse);
  } else {
    view.owned.stacked = inv.gemStacks[`${target.type}:${target.grade}`].count;
    for (const item of Object.values(inv.itemById)) if (inv.locationById[item.id]?.kind!=='ground') view.owned.embedded += item.sockets.filter(g=>g?.type===target.type && g.grade===target.grade).length;
    view.owned.onGround = state.groundDrops.filter(d=>d.state!=='claimed' && d.payloadRef.kind==='gem' && d.payloadRef.type===target.type && d.payloadRef.grade===target.grade).reduce((sum,d)=>sum+(d.payloadRef.kind==='gem'?d.payloadRef.count:0),0);
    view.missing.gems = Math.max(0,target.count-view.owned.stacked-view.owned.embedded);
  }
  if (craftingGoal) {
    const item = inv.itemById[craftingGoal.itemId];
    if (item && craftingGoal.kind==='reroll') view.missing.dust = Math.max(0,content.economy.rerollDust[item.quality]-inv.resources.dust);
  }
  view.sources = content.stages.filter(stage => {
    const table = content.lootTables.find(t=>t.id===stage.lootTableId)!, quality = content.qualityRows.find(r=>r.id===stage.qualityRowId)!;
    return target.kind==='equipment' ? table.equipmentPool.some(e=>e.definitionId===target.definitionId && e.weight>0) && quality.equipment.some(e=>e.quality===target.quality && e.probability>0)
      : table.gemPool.some(g=>g.type===target.type && g.weight>0) && quality.gem.some(g=>g.grade===target.grade && g.probability>0);
  }).map(stage=>({ stageId: stage.id, unlocked: state.world.unlockedStageIds.includes(stage.id),challengeId: null,tableId: stage.lootTableId }));
  return view;
}
export function trackingCommand(tx: Mutation, command: Command, content: ContentRegistry): boolean {
  if (command.type==='tracking.clear') { tx.draft.state.tracking = { target: null,selectedSourceStageId: null,craftingGoal: null }; return true; }
  if (command.type!=='tracking.set') return false;
  const target = command.target;
  requireRule(Number.isSafeInteger(target.count) && target.count>0, 'NOT_IN_ALLOWED_MODE','目標數量必須是正整數。');
  requireRule(target.kind==='equipment' ? content.equipment.some(d=>d.id===target.definitionId) && Number.isInteger(target.quality) && target.quality>=0 && target.quality<=5 : content.gems.some(g=>g.type===target.type && g.grade===target.grade),'UNKNOWN_CONTENT','沒有這個追蹤品項。');
  tx.draft.state.tracking = { target: { ...target },craftingGoal: command.craftingGoal ? { ...command.craftingGoal } : null,selectedSourceStageId: null }; return true;
}
