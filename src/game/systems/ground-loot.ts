import type { Command, ContentRegistry, GroundPayload, LootProvenance, EntityReference, ReleaseGameState } from '../contracts';
import { Mutation, requireRule } from './resource-transactions';
import { petCount, warehouseCount, reorderWarehouse } from './inventory';
import { changeGemCount } from './gems';
import { discoverOwned } from './collection';

export function addDrop(tx: Mutation, payload: GroundPayload, provenance: LootProvenance, ordinal = 0) {
  const id = tx.id('drop'), order = tx.draft.counters.nextEntitySeq;
  tx.draft.state.groundDrops.push({ id, version: 1, payloadRef: { ...payload }, provenance: { ...provenance },
    position: { x: 160 + ordinal*32, y: 116 }, order, state: 'falling', claimRemainingMs: 440 });
  if (payload.kind==='equipment') tx.draft.state.inventory.locationById[payload.itemId] = { kind: 'ground',dropId: id };
  if (payload.kind==='pet') tx.draft.state.inventory.petLocationById[payload.petId] = { kind: 'ground',dropId: id };
  tx.events.push({ type: 'LootCreated', payload: { dropIds: [id] } }); return id;
}
export function groundCapacityBlocked(state: ReleaseGameState): boolean {
  return state.groundDrops.some(d=>d.state!=='claimed' && (d.payloadRef.kind==='equipment' && warehouseCount(state.inventory)>=60 || d.payloadRef.kind==='pet' && petCount(state.inventory)>=30));
}
export function syncCapacity(tx: Mutation) {
  const s = tx.draft.state;
  const blocked = groundCapacityBlocked(s), present = s.lifecycle.pauseReasons.includes('capacity');
  if (blocked && !present) { s.lifecycle.pauseReasons.push('capacity'); s.lifecycle.resumeRequired=true; }
  if (!blocked && present) s.lifecycle.pauseReasons = s.lifecycle.pauseReasons.filter(p=>p!=='capacity');
}
export function settleGround(tx: Mutation) {
  for (const drop of tx.draft.state.groundDrops) if (drop.state==='falling') { drop.state='available'; drop.claimRemainingMs=0; drop.version++; }
}
export function advanceGround(tx: Mutation, elapsedMs: number) {
  for (const drop of tx.draft.state.groundDrops) if (drop.state==='falling') {
    drop.claimRemainingMs = Math.max(0,drop.claimRemainingMs-elapsedMs);
    if (!drop.claimRemainingMs) { drop.state='available'; drop.version++; }
  }
}
export function pickup(tx: Mutation, reference: EntityReference, trigger: 'tap'|'proximity'|'stage-exit') {
  const s = tx.draft.state, inv = s.inventory, drop = s.groundDrops.find(d=>d.id===reference.id);
  requireRule(drop,'NOT_FOUND','找不到這份掉落。');
  requireRule(drop.state!=='claimed','ALREADY_APPLIED','已領取這份掉落。');
  requireRule(drop.version===reference.version,'STALE_VERSION','掉落狀態已變更，請重新領取。');
  requireRule(drop.state==='available','LOOT_NOT_READY','物品還在落下。');
  const payload = drop.payloadRef;
  if (payload.kind==='equipment') {
    requireRule(warehouseCount(inv)<60,'WAREHOUSE_FULL','裝備倉庫已滿（60 件）。');
    const location=inv.locationById[payload.itemId];
    requireRule(location?.kind==='ground' && location.dropId===drop.id,'NOT_OWNED','地物與裝備所有權不一致。');
    inv.locationById[payload.itemId]={ kind: 'warehouse',order: inv.warehouseOrder.length }; reorderWarehouse(tx.draft);
    tx.events.push({ type:'ItemDiscovered',payload:{ itemId:payload.itemId,quality:inv.itemById[payload.itemId].quality } });
  } else if (payload.kind==='pet') {
    requireRule(petCount(inv)<30,'PET_CAPACITY','靈寵欄位已滿（30 隻）。');
    const location=inv.petLocationById[payload.petId];
    requireRule(location?.kind==='ground' && location.dropId===drop.id,'NOT_OWNED','地物與靈寵所有權不一致。');
    inv.petLocationById[payload.petId]={ kind:'owned' };
  } else if (payload.kind==='gem') changeGemCount(tx.draft,payload.type,payload.grade,payload.count);
  else {
    requireRule(Number.isSafeInteger(inv.resources.dust+payload.amount),'INSUFFICIENT_RESOURCE','粉塵數量超出可保存範圍。');
    inv.resources.dust+=payload.amount;
  }
  drop.state='claimed'; drop.version++; discoverOwned(tx.draft); syncCapacity(tx);
  tx.events.push({ type:'LootPickedUp',payload:{ dropId:drop.id,trigger } });
}
export function groundCommand(tx: Mutation, command: Command, _content: ContentRegistry): boolean {
  if (command.type!=='loot.pickup') return false;
  pickup(tx,command.drop,command.trigger); return true;
}
