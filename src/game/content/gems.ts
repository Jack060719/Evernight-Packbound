import { GEM_GRADES, type GemDefinition, type GemType, type MechanicDefinition } from '../contracts';
import type { ItemKind } from '../types';

export const gemNames: Record<GemType, string> = { venom: '毒芽石', charge: '蓄能石', ward: '潮汐石', chain: '連鎖石', sweep: '橫掃石', bond: '共鳴石' };
const weapons: ItemKind[] = ['sword', 'dagger', 'bow', 'staff'];
const support: ItemKind[] = ['armor', 'shield', 'ring', 'charm'];
export const gems: GemDefinition[] = GEM_GRADES.flatMap(grade => {
  const definitions: [GemType, MechanicDefinition, ItemKind[]][] = [
    ['venom', { effectId: 'gem_venom', parameters: { grade, damagePerStack: grade + 1, durationTicks: 3, maxPerAction: grade + 2, maxPerEnemy: 8 } }, weapons],
    ['charge', { effectId: 'gem_charge', parameters: { grade, cycleLength: 3, normalMultiplier: .75, chargedMultiplier: [1.6,1.85,2.1][grade-1] } }, weapons],
    ['ward', { effectId: 'gem_ward', parameters: { grade, overhealFraction: [.2,.3,.4][grade-1], maxHpCapFraction: [.2,.25,.3][grade-1] } }, support],
    ['chain', { effectId: 'gem_chain', parameters: { grade, coefficient: [.35,.45,.55][grade-1], maxPerAction: 1, maxPerRound: 3 } }, weapons],
    ['sweep', { effectId: 'gem_sweep', parameters: { grade, coefficient: [.18,.24,.3][grade-1], maxTargets: grade, maxPerAction: 1 } }, weapons],
    ['bond', { effectId: 'gem_bond', parameters: { grade, bonusPerStack: 6, maxStacks: grade + 2, maxPerAction: 2 } }, support],
  ];
  return definitions.map(([type, effect, compatibleKinds]) => ({ type, grade, effect, compatibleKinds }));
});
