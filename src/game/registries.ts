import type { ContentRegistry, ModulePorts } from './contracts/ports';
import type { CommandPort, Result } from './contracts/protocol';
import { CONTENT_VERSION, CONTRACT_VERSION } from './contracts/protocol';
import { regions } from './content/regions';
import { stages } from './content/stages';
import { enemies } from './content/enemies';
import { equipment, gearEffects } from './content/gear-effects';
import { affixes } from './content/affixes';
import { gems } from './content/gems';
import { petMilestones, petCooperation } from './content/pet-milestones';
import { lootTables, qualityRows } from './content/loot-tables';
import { challenges } from './content/challenges';
import { collections } from './content/collections';
import { economy } from './content/economy';

export const releaseContent: ContentRegistry = { version: CONTENT_VERSION, regions, stages, enemies, equipment, gearEffects,
  affixes, gems, petMilestones, petCooperation, lootTables, qualityRows, challenges, collections, economy };

export const MODULE_OWNERS = Object.freeze({
  combat: '05', world: '06', inventory: '07', collection: '08', customization: '12',
  ground: '13', ui: '10', visuals: '11', rewards: '14',
} as const);
export type ModuleKey = keyof ModulePorts;

function unavailable<T>(module: string): Result<T> {
  return { ok: false, error: { code: 'NOT_IN_ALLOWED_MODE', message: `Release module ${module} is not installed` } };
}

/** Explicit assembly only; constructing this registry does not change the prototype engine. */
export function createReleaseRegistry(content: Readonly<ContentRegistry>, ports: Partial<ModulePorts> = {}, commands?: CommandPort) {
  if (content.version !== CONTENT_VERSION) throw new Error('Content version does not match the frozen contract');
  const installed: Readonly<Partial<ModulePorts>> = Object.freeze({ ...ports });
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    content,
    require<K extends ModuleKey>(key: K): Result<ModulePorts[K]> {
      const port = installed[key];
      return port ? { ok: true, value: port } : unavailable(key);
    },
    commands: commands ?? Object.freeze({
      preview: () => unavailable('preview/14'),
      validate: () => unavailable('validate/14'),
      dispatch: async () => unavailable('dispatch/14'),
    } satisfies CommandPort),
  });
}
