import { CHALLENGE_IDS, REGION_IDS, type ChallengeDefinition } from '../contracts';
import { bossEffects } from './enemies';
export const challenges: ChallengeDefinition[] = CHALLENGE_IDS.map((id,n) => ({ id, regionId: REGION_IDS[n], hpMultiplier: 1.25, attackMultiplier: 1.15,
  addedEffects: bossEffects(['T','C','S','R','M','W','P'][n], 1), completionReward: { equipmentProbability: .1, gemProbability: .15, dust: 4 } }));
