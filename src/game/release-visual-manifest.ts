import { REGION_IDS, REGULAR_ENEMY_IDS, type EnemyDefinitionId, type RegionId } from './contracts';

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
export const regionBackground = (region: RegionId) => assetUrl(region === 'verdant' ? 'background-loop.png' : `release/${region}/background.webp`);
export function enemyArt(id: EnemyDefinitionId) {
  const region = REGION_IDS.find(r => id.startsWith(`${r}-`))!;
  const regular = REGULAR_ENEMY_IDS.indexOf(id as typeof REGULAR_ENEMY_IDS[number]);
  const rank = regular >= 0 ? ['N','S','G','H','E'][regular % 5] : 'B';
  return assetUrl(`release/${region}/${rank}.png`);
}
export const visualManifest = {
  source: 'Built-in image_gen; project-owned generated artwork. Original prompts are beside each regional source atlas/background.',
  camera: { width: 360, height: 128, pickupDistance: 72, backgroundLayer: 0, actorLayer: 1, feedbackLayer: 2 },
  actors: { familyVariants: true, animation: 'Committed-event transforms of static family sprites; names and mechanic badges identify individual bosses.' },
  regions: REGION_IDS.map(id => ({ id, background: regionBackground(id), backgroundSize: id === 'verdant' ? [1920,528] : [1536,512],
    enemies: ['N','S','G','H','E','B'].map(rank => ({ rank, src: assetUrl(`release/${id}/${rank}.png`), size: [256,256] })) })),
};
