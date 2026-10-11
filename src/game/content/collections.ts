import { REGION_IDS, type CollectionDefinition } from '../contracts';
export const collections: CollectionDefinition[] = [
  { id: 'collection-equipment-8', requirement: { kind: 'equipment-count', count: 8 }, presentationId: 'wooden-nameplate' },
  { id: 'collection-equipment-14', requirement: { kind: 'equipment-count', count: 14 }, presentationId: 'goldleaf-backpack-border' },
  { id: 'collection-equipment-22', requirement: { kind: 'equipment-count', count: 22 }, presentationId: 'camp-equipment-rack' },
  { id: 'collection-gems-6', requirement: { kind: 'gem-kind-count', count: 6 }, presentationId: 'six-gem-lantern' },
  { id: 'collection-pets-level-6', requirement: { kind: 'pet-level', level: 6, species: ['wolf','fairy'] }, presentationId: 'spirit-companion-flag' },
  ...REGION_IDS.map(regionId => ({ id: `collection-region-${regionId}` as const, requirement: { kind: 'region-clear' as const, regionId }, presentationId: `camp-rug-${regionId}` as const })),
  { id: 'collection-all-regions', requirement: { kind: 'all-regions-clear' }, presentationId: 'title-astral-traveller' },
];
