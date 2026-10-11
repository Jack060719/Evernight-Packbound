import type { Command, ContentRegistry, LoadoutSlotId } from '../contracts';
import { Mutation, requireRule } from './resource-transactions';
import { equipped } from './affixes';
import { reorderWarehouse, syncEquipment, validatePlacement, warehouseCount } from './inventory';

export function loadoutCommand(tx: Mutation, command: Command, content: ContentRegistry): boolean {
  if (command.type !== 'loadout.save' && command.type !== 'loadout.apply' && command.type !== 'loadout.remove' && command.type !== 'loadout.rename') return false;
  const s = tx.draft.state, inv = s.inventory;
  requireRule(Number.isInteger(command.slot) && command.slot>=1 && command.slot<=6, 'NOT_FOUND', '配裝槽必須介於 1 至 6。');
  const slotId = command.slot as LoadoutSlotId, existing = s.loadouts.find(l => l.slotId===slotId);
  if ('name' in command) requireRule([...command.name.trim()].length>=1 && [...command.name.trim()].length<=12, 'NOT_IN_ALLOWED_MODE', '配裝名稱需為 1 至 12 個字。');
  if (command.type === 'loadout.save') {
    const pet = inv.activePetId ? inv.petById[inv.activePetId] : null;
    s.loadouts = s.loadouts.filter(l => l.slotId !== slotId);
    s.loadouts.push({ slotId, name: command.name.trim(), items: equipped(s).map(item => {
      const p = inv.locationById[item.id];
      requireRule(p.kind === 'equipped','INVALID_PLACEMENT','裝備位置不合法。');
      return { itemId: item.id, observedVersion: item.version, placement: { row: p.row,col: p.col,rotation: p.rotation } };
    }), pet: pet ? { petId: pet.id, observedVersion: pet.version } : null }); return true;
  }
  requireRule(existing, 'NOT_FOUND', '這個配裝槽尚未儲存。');
  if (command.type === 'loadout.rename') { existing.name = command.name.trim(); return true; }
  if (command.type === 'loadout.remove') { s.loadouts = s.loadouts.filter(l => l.slotId!==slotId); return true; }
  const missing = existing.items.filter(ref => !inv.itemById[ref.itemId] || inv.locationById[ref.itemId]?.kind==='ground').map(ref => ref.itemId);
  if (existing.pet && inv.petLocationById[existing.pet.petId]?.kind!=='owned') missing.push(existing.pet.petId);
  requireRule(!missing.length, 'LOADOUT_MISSING', '配裝缺少個體，未套用任何變更。', missing);
  requireRule(new Set(existing.items.map(ref=>ref.itemId)).size===existing.items.length, 'DUPLICATE_REFERENCE', '配裝包含重複個體。');
  let order=inv.warehouseOrder.length;
  for (const item of equipped(s)) inv.locationById[item.id] = { kind: 'warehouse', order: order++ };
  for (const ref of existing.items) {
    const item = inv.itemById[ref.itemId]; validatePlacement(item,ref.placement,inv,content);
    inv.locationById[item.id] = { kind: 'equipped', ...ref.placement }; item.version++;
  }
  requireRule(warehouseCount(inv)<=60,'WAREHOUSE_FULL','換下裝備後倉庫超過 60 件，整套配裝未套用。');
  inv.activePetId = existing.pet?.petId ?? null;
  reorderWarehouse(tx.draft); syncEquipment(tx,content); return true;
}
