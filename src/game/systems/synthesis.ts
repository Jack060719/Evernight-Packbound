import type { Command, ContentRegistry } from '../contracts';
import type { Quality } from '../types';
import { Mutation, requireRule } from './resource-transactions';
import { ownedItem, ownedPet, deleteItem, syncEquipment } from './inventory';
import { rollAffixes } from './affixes';
import { returnGems } from './gems';
import { growPet } from './pet-growth';

export function synthesisCommand(tx: Mutation, command: Command, content: ContentRegistry, preview = false): boolean {
  if (command.type !== 'synthesis.item' && command.type !== 'synthesis.pet') return false;
  const inv = tx.draft.state.inventory, { primary, material } = command.pair;
  requireRule(primary.id !== material.id, 'DUPLICATE_REFERENCE', '主體與材料必須是不同個體。');
  if (command.type === 'synthesis.item') {
    const a = ownedItem(inv,primary), b = ownedItem(inv,material);
    requireRule(a.definitionId === b.definitionId && a.quality === b.quality, 'INVALID_PAIR', '合成需要相同品項、相同品質。');
    requireRule(a.quality < 5, 'QUALITY_MAX', '已達最高品質。');
    requireRule(!b.locked, 'LOCKED_MATERIAL', '鎖定裝備不能當作材料。');
    returnGems(tx,b);
    const success = !preview && tx.random.crafting.next() < content.economy.synthesisChances[a.quality];
    deleteItem(tx,b.id);
    if (success) {
      const next = a.quality + 1 as Quality;
      inv.itemById[a.id] = { ...a, quality: next, version: a.version+1,
        affixes: rollAffixes({ ...a, quality: next },'upgrade-added',content,tx.random.crafting,a.affixes),
        sockets: [...a.sockets, ...Array(content.economy.socketCounts[next]-a.sockets.length).fill(null)] };
      tx.outcome = { kind: 'synthesis-success', retainedId: a.id, quality: next };
    } else tx.outcome = { kind: 'synthesis-failed', retainedId: a.id, consumedId: b.id };
  } else {
    const a = ownedPet(inv,primary), b = ownedPet(inv,material);
    requireRule(a.kind === b.kind && a.quality === b.quality, 'INVALID_PAIR', '合成需要同物種、同品質的靈寵。');
    requireRule(a.quality < 5, 'QUALITY_MAX', '已達最高品質。');
    requireRule(inv.activePetId !== a.id && inv.activePetId !== b.id, 'ACTIVE_PET_MATERIAL', '請先讓參與合成的靈寵休息。');
    const kept = a.cumulativeXp >= b.cumulativeXp ? a : b, consumed = kept.id === a.id ? b : a;
    const success = !preview && tx.random.crafting.next() < content.economy.synthesisChances[kept.quality];
    delete inv.petById[consumed.id]; delete inv.petLocationById[consumed.id]; tx.consumedIds.push(consumed.id);
    inv.petById[kept.id] = structuredClone(growPet({ ...kept, quality: success ? kept.quality+1 as Quality : kept.quality, version: kept.version+1 },0,content)) as typeof inv.petById[string];
    tx.outcome = success ? { kind: 'synthesis-success', retainedId: kept.id, quality: inv.petById[kept.id].quality } : { kind: 'synthesis-failed', retainedId: kept.id, consumedId: consumed.id };
  }
  syncEquipment(tx,content); return true;
}
