import { REGULAR_ENEMY_IDS, REGION_IDS, type EnemyDefinition, type EffectDefinition, type RegionId, type EnemyRank } from '../contracts';
import { stageRows } from './stage-data';

export function bossEffects(codes: string, depth: number): EffectDefinition[] {
  const effects: Record<string, EffectDefinition> = {
    A: { effectId: 'enemy_armor', parameters: { kind: 'armor', flatArmor: 3 + Math.ceil(depth / 2) } },
    C: { effectId: 'enemy_heavy', parameters: { kind: 'periodic-damage', everyActions: 3, multiplier: 1.6 } },
    R: { effectId: 'enemy_regen', parameters: { kind: 'periodic-heal', everyActions: 3, maxHpFraction: .04, poisonedFraction: .028, targetPolicy: 'self' } },
    S: { effectId: 'enemy_barrier', parameters: { kind: 'barrier', trigger: 'action', everyActions: 3, maxHpFraction: .12, replacesAttack: true } },
    T: { effectId: 'enemy_thorns', parameters: { kind: 'retaliation', attackFraction: .3, maxPerSourceAction: 1 } },
    P: { effectId: 'enemy_cleanse', parameters: { kind: 'cleanse', everyActions: 3, removedStacks: 2 } },
    M: { effectId: 'enemy_double', parameters: { kind: 'multi-hit', coefficients: [.6, .6] } },
    W: { effectId: 'enemy_suppress_healing', parameters: { kind: 'healing-suppression', everyActions: 3, multiplier: .6, expires: 'next-player-support-end' } },
    F: { effectId: 'enemy_frenzy', parameters: { kind: 'hp-threshold-damage', hpFraction: .35, multiplier: 1.3 } },
    L: { effectId: 'enemy_escort_guard', parameters: { kind: 'escort-guard', reductionPerAlly: .1, cap: .4 } },
  };
  return codes === '—' ? [] : codes.split('+').map(code => effects[code]);
}
export function regularEffects(region: RegionId, rank: EnemyRank, depth: number, normalAttack: number): EffectDefinition[] {
  const armor = 2 + Math.floor((depth - 1) / 3);
  if (rank === 'G') return [{ effectId: 'enemy_guard_armor', parameters: { kind: 'armor', flatArmor: armor + (region === 'ember' ? 2 : 0) } }];
  if (rank === 'H') return [{ effectId: 'enemy_heal_ally', parameters: { kind: 'periodic-heal', everyActions: 3, maxHpFraction: .08, poisonedFraction: .08, targetPolicy: 'lowest-hp-ratio-ally' } }];
  if (rank === 'N' && region === 'ember') return [{ effectId: 'enemy_armor', parameters: { kind: 'armor', flatArmor: 1 } }];
  if (rank !== 'E') return [];
  const elite: Record<RegionId, EffectDefinition> = {
    verdant: { effectId: 'elite_barrier_cycle', parameters: { kind: 'barrier', trigger: 'action', everyActions: 3, maxHpFraction: .1, replacesAttack: true } },
    ember: { effectId: 'elite_armor', parameters: { kind: 'armor', flatArmor: armor + 4 } },
    moonwell: { effectId: 'elite_spawn_barrier', parameters: { kind: 'barrier', trigger: 'spawn', everyActions: 0, maxHpFraction: .2, replacesAttack: false } },
    mire: { effectId: 'elite_venom', parameters: { kind: 'hero-poison', damagePerTick: Math.max(1, Math.round(normalAttack * .5)), durationTicks: 2, maxStacks: 2 } },
    gale: { effectId: 'elite_double', parameters: { kind: 'multi-hit', coefficients: [.6, .6] } },
    frost: { effectId: 'elite_healing_suppression', parameters: { kind: 'healing-suppression', everyActions: 1, multiplier: .8, expires: 'next-player-support-end' } },
    astral: { effectId: 'elite_cleanse', parameters: { kind: 'cleanse', everyActions: 3, removedStacks: 2 } },
  };
  return [elite[region]];
}
const names = [
  ['苔球史萊姆','葉芽球','樹皮骨兵','露芽靈','葉角衛'], ['晶殼蟲','炭火球','礦骨兵','爐芽靈','採晶偶'],
  ['燈泡史萊姆','泉光點','貝甲骨兵','蓮燈靈','鏡紗靈'], ['蜜泥史萊姆','孢子球','葦甲骨兵','藥草靈','沼花巫'],
  ['鈴羽鳥','絨羽球','風紋骨兵','風鈴靈','角冠隼'], ['雪苔史萊姆','霜星球','薄冰骨兵','暖燈靈','白角衛'], ['星砂偶','星環球','星甲骨兵','棱燈靈','天儀衛'],
];
export const regularRanks: EnemyRank[] = ['N', 'S', 'G', 'H', 'E'];
export const enemies: EnemyDefinition[] = [
  ...REGULAR_ENEMY_IDS.map((id, n) => ({ id, name: names[Math.floor(n / 5)][n % 5], rank: regularRanks[n % 5], effects: regularEffects(REGION_IDS[Math.floor(n / 5)], regularRanks[n % 5], 1, 3) })),
  ...stageRows.map(([id,,,,,bossId,name,codes]) => ({ id: bossId, name, rank: 'B' as const, effects: bossEffects(codes, Number(id.slice(-2))) })),
];
