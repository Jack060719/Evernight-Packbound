import { GEAR_EFFECT_IDS, ITEM_DEFINITION_IDS, type EquipmentDefinition, type GearEffectDefinition, type GearMechanicParameters } from '../contracts';
import type { ItemKind } from '../types';

const weapon = (baseDamage: number, cells: number, primaryCoefficients = [1], maxTargets = 1,
  targetPolicy: 'front' | 'lowest-hp' = 'front', critChanceBonus = 0, critMultiplier = 2, armorPenetration = 0): GearMechanicParameters =>
  ({ kind: 'weapon', baseDamage, attackCoefficient: cells / 2, primaryCoefficients, maxTargets, targetPolicy, critChanceBonus, critMultiplier, armorPenetration });
const passive = (maxHp = 0, defense = 0, attack = 0, healingBonus = 0, petPowerBonus = 0): GearMechanicParameters =>
  ({ kind: 'passive', maxHp, defense, attack, healingBonus, petPowerBonus });
const heal = (healing: number, everyRounds = 3, maxHp = 0): GearMechanicParameters => ({ kind: 'periodic-heal', healing, everyRounds, maxHp });
const rows: [ItemKind, string, GearMechanicParameters][] = [
  ['sword', '旅人長劍', weapon(12, 2)], ['dagger', '短刃', weapon(4, 1, [.55, .55])],
  ['bow', '獵弓', weapon(23, 3, [1], 1, 'lowest-hp')], ['staff', '枝杖', weapon(34, 4, [.4], 3)],
  ['armor', '旅人甲', passive(35, 1)], ['shield', '木盾', passive(0, 2)], ['ring', '力量戒', passive(0, 0, 3)], ['charm', '回復護符', heal(14)],
  ['dagger', '葉哨匕首', weapon(3.8, 1, [.55, .55], 1, 'front', 8)], ['charm', '露華護符', heal(12, 3, 8)],
  ['bow', '晶弦硬弓', weapon(27, 3)], ['shield', '窯鋼盾', passive(-12, 3)],
  ['staff', '月紋廣域杖', weapon(37, 4, [.27], 5)], ['ring', '泉燈戒', passive(0, 0, 2, 10)],
  ['bow', '葦羽弓', weapon(20, 3, [1], 1, 'lowest-hp', 0, 2, .3)], ['armor', '苔革甲', passive(25, 1.5)],
  ['dagger', '風羽匕首', weapon(3, 1, [.4, .4, .4])], ['ring', '鳴風戒', passive(0, -.5, 3.5)],
  ['charm', '暖息護符', heal(9, 2)], ['armor', '霜苔板甲', passive(20, 2)],
  ['sword', '暮星長劍', weapon(14, 2, [1], 1, 'front', 0, 1.3)], ['ring', '星伴戒', passive(0, 0, 1.5, 0, 15)],
];
const dimensions: Record<ItemKind, [number, number]> = { sword: [2, 1], dagger: [1, 1], bow: [3, 1], staff: [4, 1], armor: [2, 2], shield: [2, 2], ring: [1, 1], charm: [1, 2] };
export const gearEffects: GearEffectDefinition[] = rows.map(([, , parameters], n) => ({ id: GEAR_EFFECT_IDS[n], parameters }));
export const equipment: EquipmentDefinition[] = rows.map(([baseKind, name, parameters], n) => {
  const [height, width] = dimensions[baseKind];
  return { id: ITEM_DEFINITION_IDS[n], baseKind, name, effectId: GEAR_EFFECT_IDS[n],
    shape: Array.from({ length: height * width }, (_, i) => ({ row: Math.floor(i / width), col: i % width })),
    affixPool: parameters.kind === 'weapon' ? ['weaponBaseAdd', 'extraHits', 'critChance', 'lifesteal', 'critMultiplier'] : ['maxHpAdd', 'defenseAdd', 'healingBonus', 'petPowerBonus'],
    gemTypes: parameters.kind === 'weapon' ? n === 12 ? ['venom', 'charge', 'chain'] : ['venom', 'charge', 'chain', 'sweep'] : ['ward', 'bond'],
  };
});
