import type { AffixDefinition, AffixStatId, AffixUnit } from '../contracts';
import type { Quality } from '../types';

const rows: [AffixStatId, AffixUnit, number, number[][]][] = [
  ['weaponBaseAdd', 'flat', 1, [[2,3],[3,5],[5,8],[8,12],[12,17],[17,24]]],
  ['extraHits', 'count', 1, [[1,1],[1,1],[1,2],[1,2],[2,3],[2,3]]],
  ['critChance', 'percentage-points', 1, [[10,20],[12,22],[15,25],[18,28],[20,32],[25,38]]],
  ['critMultiplier', 'multiplier', .01, [[0,0],[0,0],[.3,.5],[.4,.65],[.5,.8],[.65,1]]],
  ['lifesteal', 'percentage-points', 1, [[3,5],[4,7],[6,10],[8,12],[10,15],[12,18]]],
  ['maxHpAdd', 'flat', 1, [[6,12],[10,18],[16,28],[24,40],[36,56],[50,80]]],
  ['defenseAdd', 'flat', .1, [[1,1.5],[1.5,2],[2,3],[3,4.5],[4.5,6],[6,8]]],
  ['healingBonus', 'percentage-points', 1, [[6,10],[8,14],[12,20],[16,26],[22,34],[28,42]]],
  ['petPowerBonus', 'percentage-points', 1, [[4,8],[6,10],[8,14],[12,20],[16,28],[24,36]]],
];
export const affixes: AffixDefinition[] = rows.map(([statId, unit, step, values]) => ({ statId, unit,
  ranges: values.flatMap(([min, max], quality) => statId === 'critMultiplier' && quality < 2 ? [] : [{ quality: quality as Quality, min, max, step }]),
}));
