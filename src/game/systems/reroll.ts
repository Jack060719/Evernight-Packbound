import type { Command, ContentRegistry } from '../contracts';
import { Mutation, requireRule } from './resource-transactions';
import { ownedItem, syncEquipment } from './inventory';
import { rollAffixes } from './affixes';
import { changeGemCount } from './gems';

export function customizationCommand(tx: Mutation, command: Command, content: ContentRegistry, preview = false): boolean {
  if (!['customize.reroll','customize.socket','customize.replaceGem','customize.removeGem'].includes(command.type)) return false;
  if (!('item' in command)) return false;
  const inv = tx.draft.state.inventory, item = ownedItem(inv,command.item), next = inv.itemById[item.id];
  if (command.type === 'customize.reroll') {
    requireRule(command.costVersion === content.version, 'STALE_VERSION', '重洗費用版本已變更。');
    const cost = content.economy.rerollDust[item.quality];
    requireRule(inv.resources.dust >= cost, 'INSUFFICIENT_RESOURCE', `重洗需要 ${cost} 粉塵。`);
    inv.resources.dust -= cost;
    if (!preview) next.affixes = rollAffixes(item,'reroll',content,tx.random.crafting);
  } else if (command.type === 'customize.removeGem' || command.type === 'customize.socket' || command.type === 'customize.replaceGem') {
    requireRule(Number.isInteger(command.socketIndex) && command.socketIndex >= 0 && command.socketIndex < item.sockets.length, 'NOT_FOUND', '沒有這個寶石孔。');
    const old = item.sockets[command.socketIndex];
    if (command.type === 'customize.removeGem') requireRule(old, 'NOT_FOUND', '這個孔尚未鑲嵌寶石。');
    else {
      requireRule(command.type !== 'customize.socket' || !old, 'GEM_INCOMPATIBLE', '請使用替換操作。');
      requireRule(content.equipment.find(d => d.id === item.definitionId)!.gemTypes.includes(command.gem.type), 'GEM_INCOMPATIBLE', '這種寶石不相容於此裝備。');
      changeGemCount(tx.draft,command.gem.type,command.gem.grade,-1);
    }
    if (old) changeGemCount(tx.draft,old.type,old.grade,1);
    next.sockets[command.socketIndex] = command.type === 'customize.removeGem' ? null : { id: preview ? 'preview-gem' : tx.id('gem'), ...command.gem };
  }
  next.version++; syncEquipment(tx,content); return true;
}
