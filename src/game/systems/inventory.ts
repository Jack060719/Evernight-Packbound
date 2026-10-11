import type { ContentRegistry, EntityReference, InventoryState, ItemInstance, ItemLocation, PetInstance, Command, GridPlacement } from '../contracts';
import type { Cell, Placement } from '../types';
import { Mutation, requireRule, type Draft } from './resource-transactions';
import { combatStats, equipped } from './affixes';
import { gemMechanics } from './gems';

export function ownedItem(state: InventoryState, reference: EntityReference): ItemInstance {
  const item = state.itemById[reference.id];
  requireRule(item, 'NOT_FOUND', '找不到這件裝備。', [reference.id]);
  requireRule(state.locationById[item.id]?.kind !== 'ground', 'NOT_OWNED', '裝備仍在地上。');
  requireRule(item.version === reference.version, 'STALE_VERSION', '裝備已變更，請重新查看。');
  return item;
}
export function ownedPet(state: InventoryState, reference: EntityReference): PetInstance {
  const pet = state.petById[reference.id];
  requireRule(pet && state.petLocationById[pet.id]?.kind === 'owned', 'NOT_OWNED', '找不到持有的靈寵。', [reference.id]);
  requireRule(pet.version === reference.version, 'STALE_VERSION', '靈寵已變更，請重新查看。');
  return pet;
}
export const warehouseCount = (inventory: InventoryState) => Object.values(inventory.locationById).filter(l => l.kind === 'warehouse').length;
export const petCount = (inventory: InventoryState) => Object.values(inventory.petLocationById).filter(l => l.kind === 'owned').length;
export function occupied(item: ItemInstance, placement: Placement, content: ContentRegistry): Cell[] {
  let cells = content.equipment.find(d => d.id === item.definitionId)!.shape.map(cell => ({ ...cell }));
  for (let n = 0; n < placement.rotation; n++) {
    const height = Math.max(...cells.map(c => c.row)) + 1;
    cells = cells.map(c => ({ row: c.col, col: height - 1 - c.row }));
  }
  return cells.map(c => ({ row: c.row + placement.row, col: c.col + placement.col }));
}
export function validatePlacement(item: ItemInstance, placement: Placement, inventory: InventoryState, content: ContentRegistry) {
  requireRule([placement.row,placement.col,placement.rotation].every(Number.isInteger) && placement.rotation >= 0 && placement.rotation <= 3, 'INVALID_PLACEMENT', '擺放位置或方向不合法。');
  const cells = occupied(item, placement, content);
  const key = (c: Cell) => `${c.row}:${c.col}`;
  const unlocked = new Set(inventory.unlockedCells.map(key));
  const taken = new Set(Object.values(inventory.itemById).flatMap(other => {
    const place = inventory.locationById[other.id];
    return other.id !== item.id && place?.kind === 'equipped' ? occupied(other, place, content).map(key) : [];
  }));
  requireRule(cells.every(c => unlocked.has(key(c)) && !taken.has(key(c))), 'INVALID_PLACEMENT', '裝備必須完整放在已開啟且沒有重疊的格子。');
  return cells;
}
export function reorderWarehouse(draft: Draft) {
  const inv = draft.state.inventory;
  inv.warehouseOrder = Object.keys(inv.locationById).filter(id => inv.locationById[id].kind === 'warehouse').sort((a,b) => {
    const la = inv.locationById[a], lb = inv.locationById[b]; return la.kind === 'warehouse' && lb.kind === 'warehouse' ? la.order-lb.order || a.localeCompare(b) : 0;
  });
  inv.warehouseOrder.forEach((id,order) => { inv.locationById[id] = { kind: 'warehouse', order }; });
}
export function setItemLocation(tx: Mutation, itemId: string, location: ItemLocation) {
  tx.draft.state.inventory.locationById[itemId] = { ...location };
  reorderWarehouse(tx.draft);
}
export function deleteItem(tx: Mutation, itemId: string) {
  delete tx.draft.state.inventory.itemById[itemId]; delete tx.draft.state.inventory.locationById[itemId];
  tx.consumedIds.push(itemId); reorderWarehouse(tx.draft);
}
export function syncEquipment(tx: Mutation, content: ContentRegistry) {
  const s = tx.draft.state;
  s.hero.hp = Math.min(s.hero.hp, combatStats(s,content).maxHp);
  const run = s.activeRun;
  if (run?.ruleset !== 'release-r2') return;
  const c = run.combat;
  for (const old of equipped(tx.before.state)) if (s.inventory.locationById[old.id]?.kind !== 'equipped' && !c.cancelledSourceIds.includes(old.id)) c.cancelledSourceIds.push(old.id);
  if (tx.before.state.inventory.activePetId !== s.inventory.activePetId) {
    const oldPet = tx.before.state.inventory.activePetId;
    if (oldPet && !c.cancelledSourceIds.includes(oldPet)) c.cancelledSourceIds.push(oldPet);
    c.bondStacks = 0;
  }
  // Auras added during this round wait for RoundStart; removal clamps immediately.
  const mechanics = equipped(s).flatMap(item => gemMechanics(item,content));
  for (const type of ['ward','bond'] as const) {
    const grade = Math.max(0,...mechanics.filter(m => m.effectId === `gem_${type}`).map(m => 'grade' in m.parameters ? m.parameters.grade : 0));
    const active = type === 'ward' ? c.activeWardGrade : c.activeBondGrade;
    const next = active && grade ? Math.min(active,grade) as 1|2|3 : null;
    if (type === 'ward') { c.activeWardGrade = next; c.heroShield = Math.min(c.heroShield, next ? combatStats(s,content).maxHp * [.2,.25,.3][next-1] : 0); }
    else { c.activeBondGrade = next; c.bondStacks = Math.min(c.bondStacks,next ? next+2 : 0); }
  }
}
export function inventoryCommand(tx: Mutation, command: Command, content: ContentRegistry): boolean {
  const s = tx.draft.state, inv = s.inventory;
  switch (command.type) {
    case 'inventory.place': case 'inventory.rotate': {
      const item = ownedItem(inv,command.item);
      const current = inv.locationById[item.id];
      requireRule(command.type === 'inventory.place' || current.kind === 'equipped', 'INVALID_PLACEMENT', '請先選擇背包位置。');
      const placement = command.type === 'inventory.place' ? command.placement : { ...(current as GridPlacement), rotation: command.rotation };
      validatePlacement(item,placement,inv,content);
      setItemLocation(tx,item.id,{ kind: 'equipped', ...placement, rotation: placement.rotation as GridPlacement['rotation'] });
      inv.itemById[item.id].version++; break;
    }
    case 'inventory.stash': {
      const item = ownedItem(inv,command.item);
      if (inv.locationById[item.id].kind === 'warehouse') break;
      requireRule(warehouseCount(inv) < 60, 'WAREHOUSE_FULL', '倉庫已滿，請先整理一個空位。');
      setItemLocation(tx,item.id,{ kind: 'warehouse', order: inv.warehouseOrder.length }); inv.itemById[item.id].version++; break;
    }
    case 'inventory.lock': { const item = ownedItem(inv,command.item); inv.itemById[item.id].locked = command.locked; inv.itemById[item.id].version++; break; }
    case 'inventory.sort': {
      inv.warehouseOrder.sort((a,b) => inv.itemById[b].quality-inv.itemById[a].quality || inv.itemById[a].definitionId.localeCompare(inv.itemById[b].definitionId) || a.localeCompare(b));
      inv.warehouseOrder.forEach((id,order) => { inv.locationById[id] = { kind: 'warehouse', order }; }); break;
    }
    case 'inventory.spendPoint':
      requireRule(s.hero.points >= 1, 'INSUFFICIENT_RESOURCE', '沒有可用成長點。');
      s.hero.points--; if (command.stat === 'attack') s.hero.attackPoints++; else s.hero.healthPoints++; break;
    case 'inventory.expand': {
      const { row, col } = command.cell;
      requireRule(Number.isInteger(row) && Number.isInteger(col) && row>=0 && col>=0 && row<6 && col<8
        && !inv.unlockedCells.some(c => c.row===row && c.col===col) && inv.unlockedCells.some(c => Math.abs(c.row-row)+Math.abs(c.col-col)===1), 'INVALID_PLACEMENT', '只能開啟與現有背包相鄰的格子。');
      requireRule(s.hero.points >= 2, 'INSUFFICIENT_RESOURCE', '擴充一格需要 2 成長點。'); s.hero.points-=2; inv.unlockedCells.push({ row,col }); break;
    }
    case 'pet.activate': inv.activePetId = command.pet ? ownedPet(inv,command.pet).id : null; break;
    default: return false;
  }
  syncEquipment(tx,content); return true;
}
