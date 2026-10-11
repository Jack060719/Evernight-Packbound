import { REGION_IDS, STAGE_NUMBERS, type RegionDefinition, type StageId, type UnlockRequirement } from '../contracts';

const names = ['晨露林地', '赤晶坑道', '月泉遺跡', '琥珀沼澤', '鳴風高地', '霜苔庭園', '星環古城'];
const requirements: UnlockRequirement[] = [[], [['verdant-03']], [['verdant-03']], [['ember-03'], ['moonwell-03']], [['ember-03'], ['moonwell-03']],
  [['verdant-06', 'mire-03'], ['verdant-06', 'gale-03']], [['verdant-06', 'mire-03'], ['verdant-06', 'gale-03']]];
export const regions: RegionDefinition[] = REGION_IDS.map((id, index) => ({ id, name: names[index],
  stageIds: STAGE_NUMBERS.map(n => `${id}-${n}` as StageId), unlock: requirements[index] }));
