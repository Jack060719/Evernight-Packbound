import type { ContentRegistry, PetInstance } from '../contracts';
import { levelForXp } from './resource-transactions';
export function growPet(pet: PetInstance, xp: number, content: ContentRegistry): PetInstance {
  const cumulativeXp = pet.cumulativeXp + xp, level = levelForXp(cumulativeXp);
  return { ...pet, cumulativeXp, level, version: pet.version + (xp > 0 ? 1 : 0), milestoneIds: content.petMilestones.filter(m => m.kind === pet.kind && level >= m.level).map(m => m.id) };
}
