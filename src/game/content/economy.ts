import type { EconomyDefinition } from '../contracts';

export const economy: EconomyDefinition = {
  qualityMultipliers: [1, 1.45, 2.1, 3, 4.2, 5.8], synthesisChances: [.9, .8, .7, .6, .5],
  rerollDust: [3, 6, 12, 20, 32, 50], salvageDust: [1, 2, 4, 8, 14, 24],
  affixCounts: [1, 1, 2, 2, 3, 3], socketCounts: [1, 1, 1, 2, 2, 3], extraHitCoefficients: [.15, .10, .05],
  baseCritChance: 5, maxCritChance: 75, maxCritMultiplier: 3, maxLifesteal: 25,
  roundLifestealMaxHpFraction: .3, maxHealingBonus: 100, maxPetPowerBonus: 100, minPlayerDamage: .1, minEnemyDamage: 1,
};
