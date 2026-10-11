import { PET_MILESTONE_IDS, type PetMilestoneDefinition, type PetMilestoneParameters, type PetCooperationDefinition } from '../contracts';
const base: PetMilestoneParameters = { requiredDirectHits: 0, requiresPoisonedTarget: false, requiresEquipmentHealing: false, requiresShield: false, powerBonus: 0, extraAttackCoefficient: 0, healingEveryRounds: null };
const bonuses: Partial<PetMilestoneParameters>[] = [{ requiredDirectHits: 3, powerBonus: 20 }, { requiresPoisonedTarget: true, powerBonus: 20 }, { extraAttackCoefficient: .4 }, { requiresEquipmentHealing: true, powerBonus: 20 }, { requiresShield: true, powerBonus: 15 }, { healingEveryRounds: 2 }];
export const petMilestones: PetMilestoneDefinition[] = PET_MILESTONE_IDS.map((id,n) => ({ id, kind: n < 3 ? 'wolf' : 'fairy', level: [3,6,10][n%3], effect: { effectId: id, parameters: { ...base, ...bonuses[n] } } }));
export const petCooperation: PetCooperationDefinition[] = [
  { kind: 'wolf', basePower: 8, everyRounds: 1, growthPerLevel: .15, effects: [] },
  { kind: 'fairy', basePower: 16, everyRounds: 3, growthPerLevel: .15, effects: [] },
];
