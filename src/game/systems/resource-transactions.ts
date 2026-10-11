import { CONTENT_VERSION, CONTRACT_VERSION, GEM_STACK_KEYS, createRandomSource,
  type CommandError, type ErrorCode, type EventIntent, type RandomSource, type Result, type SaveEnvelope, type TransactionOutcome } from '../contracts';

export type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
export type Draft = Mutable<SaveEnvelope>;
export class RuleError extends Error {
  constructor(readonly detail: CommandError) { super(detail.message); }
}
export function requireRule(condition: unknown, code: ErrorCode, message: string, ids?: readonly string[]): asserts condition {
  if (!condition) throw new RuleError({ code, message, ids });
}
export function result<T>(operation: () => T): Result<T> {
  try { return { ok: true, value: operation() }; }
  catch (error) { if (error instanceof RuleError) return { ok: false, error: error.detail }; throw error; }
}
export const round1 = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
export const levelForXp = (xp: number) => Math.floor((1 + Math.sqrt(1 + 4 * xp / 15)) / 2);
export class Mutation {
  readonly draft: Draft;
  readonly events: EventIntent[] = [];
  readonly consumedIds: string[] = [];
  readonly createdIds: string[] = [];
  outcome: TransactionOutcome = { kind: 'accepted' };
  readonly random: Record<'combat' | 'reward' | 'crafting', RandomSource>;
  constructor(readonly before: SaveEnvelope) {
    this.draft = structuredClone(before) as Draft;
    this.random = { combat: createRandomSource(before.rng.combat), reward: createRandomSource(before.rng.reward), crafting: createRandomSource(before.rng.crafting) };
  }
  id(prefix: string) { const id = `${this.draft.saveId}:${prefix}${this.draft.counters.nextEntitySeq++}`; this.createdIds.push(id); return id; }
  finish() {
    for (const stream of ['combat','reward','crafting'] as const) this.draft.rng[stream] = this.random[stream].snapshot();
    return { expectedRevision: this.before.revision, state: this.draft.state, rng: this.draft.rng, counters: this.draft.counters,
      events: this.events, outcome: this.outcome, consumedIds: this.consumedIds, createdIds: this.createdIds };
  }
}
export function initialEnvelope(saveId: string, seed: number): SaveEnvelope {
  const rng = (value: number) => ({ algorithm: 'xorshift32-v1' as const, seed: value >>> 0 || 1, state: value >>> 0 || 1, draws: 0 });
  return { schemaVersion: 3, contractVersion: CONTRACT_VERSION, contentVersion: CONTENT_VERSION, saveId, revision: 0,
    rng: { combat: rng(seed), reward: rng(seed ^ 0x9e3779b9), crafting: rng(seed ^ 0x85ebca6b) },
    counters: { nextEntitySeq: 2, nextRunSeq: 1, nextTransactionSeq: 1, eventSeq: 0, lastAppliedCommandSeq: 0 }, receipts: [], migrationReport: null,
    state: {
      hero: { level: 1, cumulativeXp: 0, points: 0, attackPoints: 0, healthPoints: 0, hp: 100 },
      inventory: { itemById: { i1: { id: 'i1', version: 1, definitionId: 'sword', baseKind: 'sword', quality: 0, locked: false,
        affixes: [{ statId: 'critChance', value: 5, unit: 'percentage-points', rollVersion: CONTENT_VERSION, rolledQuality: 0, origin: 'starter' }], sockets: [null] } },
        locationById: { i1: { kind: 'equipped', row: 0, col: 0, rotation: 0 } }, warehouseOrder: [],
        unlockedCells: Array.from({ length: 20 }, (_, n) => ({ row: Math.floor(n/5), col: n%5 })),
        petById: {}, petLocationById: {}, activePetId: null,
        gemStacks: Object.fromEntries(GEM_STACK_KEYS.map(key => { const [type, grade] = key.split(':'); return [key, { type, grade: Number(grade), count: 0 }]; })) as SaveEnvelope['state']['inventory']['gemStacks'], resources: { dust: 0 } },
      world: { unlockedStageIds: ['verdant-01'], completedStageIds: [], completionCounts: {}, selectedStageId: 'verdant-01', selectedChallengeId: null,
        firstWolfGranted: false, oneTimeRewards: { 'first-cleared-verdant-02-gem': { state: 'unearned' } }, importedProgress: null },
      activeRun: null, groundDrops: [],
      collection: { equipmentHighestQualityByDefinition: { sword: 0 }, gemHighestGradeByKind: {}, petHighestQualityBySpecies: {}, petHighestLevelBySpecies: {}, rewardClaimIds: [], selectedPresentationIds: [] },
      loadouts: [], tracking: { target: null, selectedSourceStageId: null, craftingGoal: null },
      lifecycle: { pauseReasons: ['camp'], resumeRequired: true, pendingChoice: null, exitRequest: null },
      settings: { autoRepeatEnabled: false, musicVolume: .3, soundVolume: .65, musicMuted: false, soundMuted: false, reducedMotion: false, introSeen: false },
      simulation: { elapsedTicks: 0, tickRemainderMs: 0 },
    },
  };
}
