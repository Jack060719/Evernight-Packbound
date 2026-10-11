import { REGULAR_ENEMY_IDS, REGION_IDS, STAGE_NUMBERS, type StageDefinition, type StageId, type RegionId, type EnemyRank } from '../contracts';
import { stageRows, wavePatterns } from './stage-data';
import { bossEffects, regularEffects, regularRanks } from './enemies';
import { regions } from './regions';

const ratios: Record<EnemyRank, number[]> = { N: [1,1,1], S: [.65,.7,.6], G: [1.15,.8,1.2], H: [.75,.65,1.2], E: [3,1.6,3], B: [1,1,1] };
export const stages: StageDefinition[] = stageRows.map(([id, name, pattern, normal, boss, bossId,, codes]) => {
  const regionId = id.slice(0, id.lastIndexOf('-')) as RegionId;
  const region = REGION_IDS.indexOf(regionId);
  const depth = Number(id.slice(-2));
  return { id, name, regionId, depth, bossId, lootTableId: `loot-${regionId}`, qualityRowId: `quality-depth-${STAGE_NUMBERS[depth-1]}`,
    unlock: depth === 1 ? regions[region].unlock : [[`${regionId}-${STAGE_NUMBERS[depth-2]}` as StageId]],
    waves: wavePatterns[Number(pattern[1])].map(wave => ({ enemies: [...wave].map((letter, ordinal) => {
      const rank = letter as EnemyRank;
      const [hp, attack, xp] = rank === 'B' ? boss : normal.map((value, i) => Math.max(1, Math.round(value * ratios[rank][i])));
      return { definitionId: rank === 'B' ? bossId : REGULAR_ENEMY_IDS[region * 5 + regularRanks.indexOf(rank)], ordinal, hp, attack, xp,
        effects: rank === 'B' ? bossEffects(codes, depth) : regularEffects(regionId, rank, depth, normal[1]) };
    }) })),
  };
});
