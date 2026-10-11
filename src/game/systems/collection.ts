import type { CollectionDefinition, Command, ContentRegistry, ReleaseGameState } from '../contracts';
import { Mutation, requireRule, type Draft } from './resource-transactions';

export function discoverOwned(draft: Draft) {
  const { inventory: inv, collection: c } = draft.state;
  for (const item of Object.values(inv.itemById)) if (inv.locationById[item.id]?.kind !== 'ground') {
    c.equipmentHighestQualityByDefinition[item.definitionId] = Math.max(c.equipmentHighestQualityByDefinition[item.definitionId] ?? 0,item.quality) as typeof item.quality;
    for (const gem of item.sockets) if (gem) c.gemHighestGradeByKind[gem.type] = Math.max(c.gemHighestGradeByKind[gem.type] ?? 0,gem.grade) as typeof gem.grade;
  }
  for (const stack of Object.values(inv.gemStacks)) if (stack.count) c.gemHighestGradeByKind[stack.type] = Math.max(c.gemHighestGradeByKind[stack.type] ?? 0,stack.grade) as typeof stack.grade;
  for (const pet of Object.values(inv.petById)) if (inv.petLocationById[pet.id]?.kind === 'owned') {
    c.petHighestQualityBySpecies[pet.kind] = Math.max(c.petHighestQualityBySpecies[pet.kind] ?? 0,pet.quality) as typeof pet.quality;
    c.petHighestLevelBySpecies[pet.kind] = Math.max(c.petHighestLevelBySpecies[pet.kind] ?? 0,pet.level);
  }
}
export function collectionEligible(definition: CollectionDefinition, state: ReleaseGameState, content: ContentRegistry): boolean {
  const r = definition.requirement, c = state.collection;
  switch (r.kind) {
    case 'equipment-count': return Object.keys(c.equipmentHighestQualityByDefinition).length >= r.count;
    case 'gem-kind-count': return Object.keys(c.gemHighestGradeByKind).length >= r.count;
    case 'pet-level': return r.species.every(kind => (c.petHighestLevelBySpecies[kind] ?? 0) >= r.level);
    case 'region-clear': return content.stages.filter(s => s.regionId === r.regionId).every(s => state.world.completedStageIds.includes(s.id));
    case 'all-regions-clear': return content.stages.every(s => state.world.completedStageIds.includes(s.id));
  }
}
export function collectionCommand(tx: Mutation, command: Command, content: ContentRegistry): boolean {
  const c = tx.draft.state.collection;
  if (command.type === 'collection.claim') {
    const definition = content.collections.find(d => d.id === command.rewardId);
    requireRule(definition && collectionEligible(definition,tx.draft.state,content), 'NOT_IN_ALLOWED_MODE', '尚未達成這項收藏里程碑。');
    requireRule(!c.rewardClaimIds.includes(command.rewardId), 'ALREADY_APPLIED', '已領取這項收藏獎勵。');
    c.rewardClaimIds.push(command.rewardId); return true;
  }
  if (command.type === 'collection.select') {
    const definition = content.collections.find(d => d.presentationId === command.presentationId);
    requireRule(definition && c.rewardClaimIds.includes(definition.id), 'NOT_OWNED', '請先領取這項外觀。');
    if (c.selectedPresentationIds.includes(command.presentationId)) c.selectedPresentationIds = c.selectedPresentationIds.filter(id => id !== command.presentationId);
    else {
      if (command.presentationId.startsWith('camp-rug-')) c.selectedPresentationIds = c.selectedPresentationIds.filter(id => !id.startsWith('camp-rug-'));
      c.selectedPresentationIds.push(command.presentationId);
    }
    return true;
  }
  return false;
}
