import type { ContentRegistry, GemType, ItemInstance, MechanicSource, GemGrade } from '../contracts';
import { Mutation, requireRule, type Draft } from './resource-transactions';

export function gemMechanics(item: ItemInstance, content: ContentRegistry): MechanicSource[] {
  const highest = new Map<GemType, GemGrade>();
  for (const gem of item.sockets) if (gem && gem.grade > (highest.get(gem.type) ?? 0)) highest.set(gem.type, gem.grade);
  return [...highest].map(([type, grade]) => ({ ...content.gems.find(g => g.type === type && g.grade === grade)!.effect,
    sourceId: item.id, sourceKind: 'gem', definitionVersion: content.version }));
}
export function changeGemCount(draft: Draft, type: GemType, grade: GemGrade, amount: number) {
  const stack = draft.state.inventory.gemStacks[`${type}:${grade}`];
  requireRule(Number.isSafeInteger(stack.count + amount) && stack.count + amount >= 0, 'GEM_RETURN_INVALID', '寶石數量不足或超出可保存範圍。');
  stack.count += amount;
}
export function returnGems(tx: Mutation, item: ItemInstance) {
  for (const gem of item.sockets) if (gem) changeGemCount(tx.draft, gem.type, gem.grade, 1);
}
