import { REGION_IDS, STAGE_NUMBERS, GEM_TYPES, ITEM_DEFINITION_IDS, type LootTableDefinition, type QualityRowDefinition, type GemType, type GemGrade } from '../contracts';
import type { Quality } from '../types';

const rates: LootTableDefinition['ranks'] = {
  S: { equipment: .005, pet: .003, gem: 0, dust: { probability: .25, count: 1 } },
  N: { equipment: .01, pet: .003, gem: 0, dust: { probability: .25, count: 1 } },
  G: { equipment: .015, pet: .003, gem: .01, dust: { probability: .35, count: 1 } },
  H: { equipment: .015, pet: .003, gem: .01, dust: { probability: .35, count: 1 } },
  E: { equipment: .02, pet: .02, gem: .04, dust: { probability: 1, count: 2 } },
  B: { equipment: .6, pet: .06, gem: .2, dust: { probability: 1, count: 6 } },
};
export const preferredGems: GemType[][] = [['venom','bond'], ['charge','sweep'], ['chain','ward'], ['venom','ward'], ['sweep','bond'], ['ward','charge'], ['bond','chain']];
export const lootTables: LootTableDefinition[] = REGION_IDS.map((region, n) => ({ id: `loot-${region}`, ranks: rates,
  equipmentPool: [...ITEM_DEFINITION_IDS.slice(0,8).map(definitionId => ({ definitionId, weight: .0625 })), ...ITEM_DEFINITION_IDS.slice(8 + n*2, 10 + n*2).map(definitionId => ({ definitionId, weight: .25 }))],
  gemPool: GEM_TYPES.map(type => ({ type, weight: preferredGems[n].includes(type) ? .4 : .05 })),
  petPool: [{ kind: 'wolf', weight: .5 }, { kind: 'fairy', weight: .5 }],
}));
const qualities = [[88,12,0,0,0,0],[82,17,1,0,0,0],[76,21,3,0,0,0],[68,25,6.5,.5,0,0],[60,29,10,1,0,0],[52,32,13.5,2.5,0,0],[44,35,16.5,4,.5,0],[36,37,20,6,.9,.1],[30,37,24,7.5,1.35,.15],[24,36,28,9.5,2.2,.3]];
const grades = [[100,0,0],[95,5,0],[90,10,0],[80,20,0],[70,29,1],[60,37,3],[50,44,6],[42,48,10],[35,50,15],[28,52,20]];
export const qualityRows: QualityRowDefinition[] = STAGE_NUMBERS.map((depth,n) => ({ id: `quality-depth-${depth}`,
  equipment: qualities[n].map((value, quality) => ({ quality: quality as Quality, probability: value / 100 })),
  gem: grades[n].map((value, i) => ({ grade: i+1 as GemGrade, probability: value / 100 })),
  pet: (n < 3 ? [95,5,0] : n < 6 ? [80,18,2] : [55,35,10]).map((value, quality) => ({ quality: quality as Quality, probability: value / 100 })),
}));
