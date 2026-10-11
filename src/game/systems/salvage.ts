import type { Command, ContentRegistry } from '../contracts';
import { Mutation, requireRule } from './resource-transactions';
import { ownedItem, ownedPet, deleteItem, syncEquipment } from './inventory';
import { returnGems } from './gems';

export function salvageCommand(tx: Mutation, command: Command, content: ContentRegistry): boolean {
  const inv = tx.draft.state.inventory;
  if (command.type === 'pet.release') {
    const pet = ownedPet(inv,command.pet);
    requireRule(inv.activePetId !== pet.id, 'ACTIVE_PET_MATERIAL', '出戰中的靈寵不能放生。');
    delete inv.petById[pet.id]; delete inv.petLocationById[pet.id]; tx.consumedIds.push(pet.id); return true;
  }
  if (command.type !== 'salvage.single' && command.type !== 'inventory.discard') return false;
  const item = ownedItem(inv,command.item);
  requireRule(!item.locked, 'LOCKED_MATERIAL', '請先解除鎖定。');
  requireRule(inv.locationById[item.id].kind === 'warehouse', 'EQUIPPED_SALVAGE', '請先將裝備卸至倉庫。');
  returnGems(tx,item);
  const dust = command.type === 'salvage.single' ? content.economy.salvageDust[item.quality] : 0;
  requireRule(Number.isSafeInteger(inv.resources.dust+dust), 'INSUFFICIENT_RESOURCE', '粉塵數量超出可保存範圍。');
  inv.resources.dust += dust; deleteItem(tx,item.id); syncEquipment(tx,content); return true;
}
