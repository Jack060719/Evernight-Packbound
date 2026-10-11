import {
  CONTENT_VERSION, CONTRACT_VERSION, GEM_GRADES, GEM_TYPES, PAUSE_REASONS,
  type ActionSnapshot, type CommitCandidate, type CommandEnvelope, type ContentRegistry,
  type GemReturnPlan, type GemStack, type GemStackKey, type GroundDrop, type GroundPayload,
  type InventoryState, type ItemInstance, type ItemLocation, type PauseReason, type PetInstance,
  type PetLocation, type PickupCommand, type ReadModel, type ReleaseGameState, type RoundSourceSnapshot, type SaveEnvelope, type TrackingView,
} from '../../../src/game/contracts';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Hand-authored contract examples, not a playable content pack or a release migration.
export const emptyContent: ContentRegistry = {
  version: CONTENT_VERSION, regions: [], stages: [], enemies: [], equipment: [], gearEffects: [],
  affixes: [], gems: [], petMilestones: [], petCooperation: [], lootTables: [], qualityRows: [],
  challenges: [], collections: [],
  economy: {
    qualityMultipliers: [1, 1.45, 2.1, 3, 4.2, 5.8], synthesisChances: [0.9, 0.8, 0.7, 0.6, 0.5],
    rerollDust: [3, 6, 12, 20, 32, 50], salvageDust: [1, 2, 4, 8, 14, 24],
    affixCounts: [1, 1, 2, 2, 3, 3], socketCounts: [1, 1, 1, 2, 2, 3],
    extraHitCoefficients: [0.15, 0.10, 0.05], baseCritChance: 5, maxCritChance: 75, maxCritMultiplier: 3,
    maxLifesteal: 25, roundLifestealMaxHpFraction: 0.3, maxHealingBonus: 100, maxPetPowerBonus: 100,
    minPlayerDamage: 0.1, minEnemyDamage: 1,
  },
};

function makeItem(id: string): ItemInstance {
  return {
    id, version: 1, definitionId: 'sword', baseKind: 'sword', quality: 0, locked: false,
    affixes: [{ statId: 'critChance', value: id === 'i1' ? 5 : 10, unit: 'percentage-points', rollVersion: CONTENT_VERSION, rolledQuality: 0, origin: id === 'i1' ? 'starter' : 'drop' }],
    sockets: [null],
  };
}

function makePet(id: string): PetInstance {
  return { id, version: 1, kind: 'wolf', quality: 0, cumulativeXp: 0, level: 1, milestoneIds: [] };
}

function makeGemStacks(): Record<GemStackKey, GemStack> {
  const entries = GEM_TYPES.flatMap(type => GEM_GRADES.map(grade => [`${type}:${grade}`, { type, grade, count: 0 }]));
  return Object.fromEntries(entries) as Record<GemStackKey, GemStack>;
}

function roundSource(action: ActionSnapshot): RoundSourceSnapshot {
  const { sourceId, sourceKind, sourceVersion, placement, stats, weaponStats, support, mechanics } = action;
  return { sourceId, sourceKind, sourceVersion, placement, stats, weaponStats, support, mechanics };
}

export function makeEnvelope(enemyCount: 1 | 2 | 3 | 4 | 5 = 1): SaveEnvelope {
  const action: ActionSnapshot = {
    actionId: 'run-1:round-3:i1', sourceId: 'i1', sourceKind: 'weapon', sourceVersion: 1,
    placement: { row: 0, col: 1, rotation: 0 }, stats: { maxHp: 100, attack: 4, defense: 0, healingBonus: 0, petPowerBonus: 0 },
    weaponStats: { baseDamage: 12, attackCoefficient: 1, qualityMultiplier: 1, damageD: 16, extraHits: 0, critChance: 10, critMultiplier: 2, lifesteal: 0, armorPenetration: 0 },
    support: null, mechanics: [], sourceStillEligible: true, beforeActionResolved: false,
    chargeMultiplier: 1, originalTargetIds: ['e1'],
    hitPlan: [{ hitIndex: 0, targetOrdinal: 0, hitClass: 'primary', coefficient: 1, targetPolicy: 'front', effectSourceId: 'i1', dueTick: 0 }],
    cursor: { rootActionId: 'run-1:round-3:i1', hitIndex: 0, targetOrdinal: 0, phase: 'ready', lastResolvedHitId: null, remainingTicks: 10 },
  };
  const snapshot: SaveEnvelope = {
    schemaVersion: 3, contractVersion: CONTRACT_VERSION, contentVersion: CONTENT_VERSION, saveId: 'fixture-save', revision: 10,
    state: {
      hero: { level: 1, cumulativeXp: 0, points: 0, attackPoints: 0, healthPoints: 0, hp: 37 },
      inventory: {
        itemById: { i1: makeItem('i1') }, locationById: { i1: { kind: 'equipped', row: 0, col: 1, rotation: 0 } },
        unlockedCells: Array.from({ length: 20 }, (_, n) => ({ row: Math.floor(n / 5), col: n % 5 })), warehouseOrder: [],
        petById: {}, petLocationById: {}, activePetId: null, gemStacks: makeGemStacks(), resources: { dust: 20 },
      },
      world: {
        unlockedStageIds: ['verdant-01', 'verdant-02'], completedStageIds: ['verdant-01'], completionCounts: { 'verdant-01': 3 },
        selectedStageId: 'verdant-02', selectedChallengeId: null, firstWolfGranted: true,
        oneTimeRewards: { 'first-cleared-verdant-02-gem': { state: 'unearned' } }, importedProgress: null,
      },
      activeRun: {
        runId: 'run-1', stageId: 'verdant-02', challengeId: null, contentVersion: CONTENT_VERSION, definitionVersion: CONTENT_VERSION,
        waveIndex: 2, encounterId: 'run-1:wave-2', status: 'combat', ruleset: 'release-r2', phaseRemainingTicks: 0,
        combat: {
          round: 3, stage: 'weapons',
          enemies: Array.from({ length: enemyCount }, (_, ordinal) => ({
            id: `e${ordinal + 1}`, definitionId: 'verdant-moss-slime', rank: 'N', ordinal,
            hp: 120, maxHp: 120, attack: 5, armor: 0, xp: 10, shield: 0, actionCount: 2, frenzyActivated: false, poison: [], mechanics: [],
          })),
          queue: [{ actionId: action.actionId, sourceId: action.sourceId, sourceKind: action.sourceKind }], actionIndex: 0,
          currentAction: action, roundSourceSnapshots: [roundSource(action)], cancelledSourceIds: [], hookCursor: null,
          dueSupportSourceIds: [], heroPoison: [], heroShield: 0, healingSuppression: [], chargeActionsBySource: {},
          bondStacks: 0, activeWardGrade: null, activeBondGrade: null, roundDirectHits: 0, roundEquipmentHealing: 0,
          roundLifestealBudgetUsed: 0, roundChainUses: 0, actionProcBudgets: [], killedEnemyIds: [],
          heroDeathResolved: false, roundEndResolved: false, waveCompletionResolved: false, stageCompletionResolved: false,
        },
      },
      groundDrops: [],
      collection: { equipmentHighestQualityByDefinition: { sword: 0 }, gemHighestGradeByKind: {}, petHighestQualityBySpecies: { wolf: 0 }, petHighestLevelBySpecies: { wolf: 1 }, rewardClaimIds: [], selectedPresentationIds: [] },
      loadouts: [{ slotId: 1, name: 'starter', items: [{ itemId: 'i1', observedVersion: 1, placement: { row: 0, col: 1, rotation: 0 } }], pet: null }],
      tracking: { target: null, selectedSourceStageId: null, craftingGoal: null },
      lifecycle: { resumeRequired: false, pauseReasons: [], pendingChoice: null, exitRequest: null },
      settings: { autoRepeatEnabled: true, musicVolume: 0.31, soundVolume: 0.6, musicMuted: false, soundMuted: false, reducedMotion: false, introSeen: true },
      simulation: { elapsedTicks: 257, tickRemainderMs: 12 },
    },
    rng: {
      combat: { algorithm: 'xorshift32-v1', seed: 1, state: 1, draws: 0 },
      reward: { algorithm: 'xorshift32-v1', seed: 42, state: 42, draws: 0 },
      crafting: { algorithm: 'xorshift32-v1', seed: 456789, state: 456789, draws: 0 },
    },
    counters: { nextEntitySeq: 1000, nextRunSeq: 2, nextTransactionSeq: 11, eventSeq: 20, lastAppliedCommandSeq: 7 },
    receipts: [], migrationReport: null,
  };
  return deepFreeze(snapshot);
}

function withState(base: SaveEnvelope, state: Partial<ReleaseGameState>): SaveEnvelope {
  return { ...base, state: { ...base.state, ...state } };
}

function makeDrop(id: string, payloadRef: GroundPayload, order: number): GroundDrop {
  return {
    id, version: 1, payloadRef, order, position: { x: 190 + order, y: 180 }, state: 'available', claimRemainingMs: 0,
    provenance: { origin: 'enemy-kill', runId: 'run-1', encounterId: 'run-1:wave-2', stageId: 'verdant-02', waveIndex: 2,
      enemyId: 'e1', eventId: `event-drop-${order}`, rewardSlot: payloadRef.kind, lootTableId: 'loot-verdant', challengeId: null },
  };
}

export const enemyCountCases = ([1, 2, 3, 4, 5] as const).map(count => ({ count, snapshot: makeEnvelope(count) }));
const impactBase = makeEnvelope();
export const impactBefore: SaveEnvelope = {
  ...impactBase, rng: { ...impactBase.rng, combat: { algorithm: 'xorshift32-v1', seed: 456789, state: 456789, draws: 0 } },
};
const beforeRun = impactBefore.state.activeRun;
if (!beforeRun || beforeRun.ruleset !== 'release-r2' || !beforeRun.combat.currentAction) throw new Error('Invalid hand-authored impact fixture');
const afterState = withState(impactBefore, {
  activeRun: { ...beforeRun, combat: { ...beforeRun.combat,
    enemies: beforeRun.combat.enemies.map(enemy => ({ ...enemy, hp: 104 })), roundDirectHits: 1,
    currentAction: { ...beforeRun.combat.currentAction, beforeActionResolved: true,
      cursor: { ...beforeRun.combat.currentAction.cursor, phase: 'action-complete', lastResolvedHitId: 'run-1:round-3:i1:0:0', remainingTicks: 9 } },
  } },
});
export const impactAfter: SaveEnvelope = {
  ...afterState, revision: 11,
  rng: { ...afterState.rng, combat: { algorithm: 'xorshift32-v1', seed: 456789, state: 1049284019, draws: 1 } },
};

const areaBase = makeEnvelope(5);
const areaRun = areaBase.state.activeRun;
if (!areaRun || areaRun.ruleset !== 'release-r2' || !areaRun.combat.currentAction) throw new Error('Invalid hand-authored area fixture');
const areaAction: ActionSnapshot = {
  ...areaRun.combat.currentAction, actionId: 'run-1:round-3:wide-staff', sourceId: 'wide-staff', beforeActionResolved: true,
  weaponStats: { baseDamage: 37, attackCoefficient: 2, qualityMultiplier: 1, damageD: 47, extraHits: 0, critChance: 5, critMultiplier: 2, lifesteal: 0, armorPenetration: 0 },
  originalTargetIds: areaRun.combat.enemies.map(enemy => enemy.id),
  hitPlan: areaRun.combat.enemies.map(enemy => ({ hitIndex: 0, targetOrdinal: enemy.ordinal, hitClass: 'primary', coefficient: 0.27, targetPolicy: 'stable-ordinal', effectSourceId: 'wide-staff', dueTick: enemy.ordinal * 2 })),
  cursor: { rootActionId: 'run-1:round-3:wide-staff', hitIndex: 0, targetOrdinal: 2, phase: 'ready', lastResolvedHitId: 'run-1:round-3:wide-staff:0:1', remainingTicks: 6 },
};
const areaState = withState(areaBase, {
  inventory: { ...areaBase.state.inventory,
    itemById: { 'wide-staff': { ...makeItem('wide-staff'), definitionId: 'moonwell-wide-staff', baseKind: 'staff',
      affixes: [{ statId: 'weaponBaseAdd', value: 2, unit: 'flat', rollVersion: CONTENT_VERSION, rolledQuality: 0, origin: 'drop' }],
    } },
    locationById: { 'wide-staff': { kind: 'equipped', row: 0, col: 1, rotation: 0 } },
  },
  loadouts: [],
  activeRun: { ...areaRun, combat: { ...areaRun.combat, roundDirectHits: 2,
    enemies: areaRun.combat.enemies.map(enemy => ({ ...enemy, hp: enemy.ordinal < 2 ? 107.3 : 120 })),
    queue: [{ actionId: areaAction.actionId, sourceId: areaAction.sourceId, sourceKind: 'weapon' }],
    currentAction: areaAction, roundSourceSnapshots: [roundSource(areaAction)],
  } },
  lifecycle: { ...areaBase.state.lifecycle, pauseReasons: ['organize'] },
});
export const areaMidway: SaveEnvelope = {
  ...areaState, revision: 12,
  rng: { ...areaState.rng, combat: { algorithm: 'xorshift32-v1', seed: 456789, state: 2158975885, draws: 2 } },
};

export const retaliationDeath = withState(impactAfter, {
  hero: { ...impactAfter.state.hero, hp: 0 },
  activeRun: { ...beforeRun, status: 'dead', combat: { ...beforeRun.combat,
    enemies: beforeRun.combat.enemies.map(enemy => ({ ...enemy, hp: 0 })), killedEnemyIds: ['e1'], heroDeathResolved: true,
    cancelledSourceIds: ['i1'], currentAction: { ...beforeRun.combat.currentAction, sourceStillEligible: false,
      cursor: { ...beforeRun.combat.currentAction.cursor, phase: 'action-complete', lastResolvedHitId: 'run-1:round-3:i1:0:0', remainingTicks: 0 } },
  } },
  groundDrops: [makeDrop('death-drop', { kind: 'dust', amount: 2 }, 0)],
  lifecycle: { ...impactAfter.state.lifecycle, resumeRequired: true, pendingChoice: { kind: 'death', runId: 'run-1' } },
});

function makeCapacityFixture(warehouseCount: 59 | 60, petCount: 29 | 30, groundOverflow: boolean): SaveEnvelope {
  const base = makeEnvelope();
  const itemById: Record<string, ItemInstance> = { ...base.state.inventory.itemById };
  const locationById: Record<string, ItemLocation> = { ...base.state.inventory.locationById };
  const warehouseOrder = Array.from({ length: warehouseCount }, (_, n) => `warehouse-${n}`);
  warehouseOrder.forEach((id, order) => { itemById[id] = makeItem(id); locationById[id] = { kind: 'warehouse', order }; });
  const petById: Record<string, PetInstance> = {};
  const petLocationById: Record<string, PetLocation> = {};
  Array.from({ length: petCount }, (_, n) => `pet-${n}`).forEach(id => { petById[id] = makePet(id); petLocationById[id] = { kind: 'owned' }; });
  const groundDrops: GroundDrop[] = [];
  if (groundOverflow) {
    itemById['ground-equipment'] = makeItem('ground-equipment');
    locationById['ground-equipment'] = { kind: 'ground', dropId: 'overflow-equipment' };
    petById['ground-pet'] = makePet('ground-pet');
    petLocationById['ground-pet'] = { kind: 'ground', dropId: 'overflow-pet' };
    groundDrops.push(makeDrop('overflow-equipment', { kind: 'equipment', itemId: 'ground-equipment' }, 0), makeDrop('overflow-pet', { kind: 'pet', petId: 'ground-pet' }, 1));
  }
  return withState(base, {
    hero: { ...base.state.hero, level: 57, cumulativeXp: 47880 },
    inventory: { ...base.state.inventory, itemById, locationById, warehouseOrder, petById, petLocationById, activePetId: 'pet-0',
      unlockedCells: Array.from({ length: 48 }, (_, n) => ({ row: Math.floor(n / 8), col: n % 8 })),
    }, groundDrops,
    lifecycle: { ...base.state.lifecycle, pauseReasons: groundOverflow ? ['capacity'] : [] },
  });
}

// The 61st warehouse item / 31st pet remain on the ground, never silently owned.
export const capacityCases = {
  below: makeCapacityFixture(59, 29, false),
  full: makeCapacityFixture(60, 30, false),
  overflow: makeCapacityFixture(60, 30, true),
};
export const fullGrid = withState(makeEnvelope(5), { hero: capacityCases.full.state.hero, inventory: capacityCases.full.state.inventory });

const gemBase = makeEnvelope();
const gemInventory: InventoryState = {
  ...gemBase.state.inventory,
  itemById: { ...gemBase.state.inventory.itemById, material: { ...makeItem('material'), sockets: [{ id: 'gem-unit-1', type: 'venom', grade: 1 }] } },
  locationById: { ...gemBase.state.inventory.locationById, material: { kind: 'warehouse', order: 0 } }, warehouseOrder: ['material'],
  gemStacks: { ...gemBase.state.inventory.gemStacks, 'venom:1': { type: 'venom', grade: 1, count: 2 } },
};
export const gemReturnCase = {
  snapshot: withState(gemBase, { inventory: gemInventory }),
  materialIds: ['material'],
  expected: { gems: [{ type: 'venom', grade: 1, count: 1 }], dust: 0 } satisfies GemReturnPlan,
  expectedStackAfterReturn: 3,
};

const pickup: PickupCommand = { type: 'loot.pickup', drop: { id: 'overflow-equipment', version: 1 }, trigger: 'tap' };
const pickupEnvelope: CommandEnvelope = { commandId: 'pickup-1', commandSeq: 8, expectedRevision: 10 };
const pickupBase = capacityCases.below;
const pickupSnapshot = withState(pickupBase, {
  inventory: { ...pickupBase.state.inventory,
    itemById: { ...pickupBase.state.inventory.itemById, 'ground-equipment': makeItem('ground-equipment') },
    locationById: { ...pickupBase.state.inventory.locationById, 'ground-equipment': { kind: 'ground', dropId: 'overflow-equipment' } },
  },
  groundDrops: [makeDrop('overflow-equipment', { kind: 'equipment', itemId: 'ground-equipment' }, 0)],
});
export const duplicatePickupCase = {
  snapshot: pickupSnapshot,
  attempts: [
    { command: pickup, envelope: pickupEnvelope },
    { command: pickup, envelope: { ...pickupEnvelope } },
    { command: { ...pickup, trigger: 'proximity' } satisfies PickupCommand, envelope: { ...pickupEnvelope, commandId: 'pickup-2', commandSeq: 9 } },
  ],
};

export const exitPending = withState(capacityCases.overflow, {
  activeRun: { ...beforeRun, status: 'exit-wait' },
  lifecycle: { ...capacityCases.overflow.state.lifecycle, resumeRequired: true,
    exitRequest: { requestId: 'exit-1', fromRunId: 'run-1', targetStageId: 'verdant-02', challengeId: null, reason: 'repeat', nextDropId: 'overflow-equipment' },
  },
});
export const repeatPauseCases: readonly { reason: PauseReason; snapshot: SaveEnvelope }[] = PAUSE_REASONS.map(reason => {
  const base = makeEnvelope();
  return { reason, snapshot: withState(base, { lifecycle: { ...base.state.lifecycle, pauseReasons: [reason] } }) };
});

const legacyBase = makeEnvelope();
export const legacyDecimalCursor = withState(legacyBase, {
  activeRun: {
    runId: 'legacy-run', stageId: 'verdant-02', challengeId: null, contentVersion: 'prototype-v2', definitionVersion: 'prototype-v2',
    waveIndex: 3, encounterId: 'legacy-run:wave-4', status: 'combat', ruleset: 'legacy-v2',
    legacyFloor: 2, legacyWave: 4, legacyTime: 12.345, legacyTickRemainder: 0.031,
    combat: { phase: 'combat', remaining: 0.25, enemies: [{ id: 'e9', kind: 'slime', name: '舊史萊姆', hp: 37, maxHp: 60, damage: 9, xp: 12 }],
      round: 3, stage: 'weapons', actions: [{ kind: 'weapon', sourceId: 'i1' }, { kind: 'enemy', sourceId: 'e9' }], actionIndex: 0, actionResolved: true },
  },
  world: { ...legacyBase.state.world, importedProgress: { sourceVersion: 2, floor: 2, unlockedFloor: 3, completedRuns: 1 } },
  lifecycle: { ...legacyBase.state.lifecycle, resumeRequired: true, pauseReasons: ['load', 'camp'] },
});

export const equipmentTracking = withState(gemReturnCase.snapshot, {
  tracking: { target: { kind: 'equipment', definitionId: 'sword', quality: 0, count: 3 }, selectedSourceStageId: 'verdant-01', craftingGoal: { kind: 'synthesis', itemId: 'i1' } },
});
export const gemTracking = withState(gemReturnCase.snapshot, {
  tracking: { target: { kind: 'gem', type: 'venom', grade: 1, count: 5 }, selectedSourceStageId: 'verdant-01', craftingGoal: { kind: 'reroll', itemId: 'i1' } },
});
export const gemTrackingView: TrackingView = {
  target: gemTracking.state.tracking.target,
  sources: [{ stageId: 'verdant-01', unlocked: true, challengeId: null, tableId: 'loot-verdant' }],
  owned: { equipped: 0, warehouse: 0, stacked: 2, embedded: 1, onGround: 0 }, missing: { equipment: 0, gems: 3, dust: 0 },
};

const gridState = fullGrid.state;
const gridRun = gridState.activeRun;
if (!gridRun || gridRun.ruleset !== 'release-r2') throw new Error('Invalid hand-authored grid fixture');
export const backpackReadModel: ReadModel = {
  revision: fullGrid.revision, hero: gridState.hero,
  stats: { maxHp: 100, attack: 4, defense: 0, healingBonus: 0, petPowerBonus: 0 }, world: gridState.world,
  activeRun: gridRun, lifecycle: gridState.lifecycle, gemStacks: gridState.inventory.gemStacks, resources: gridState.inventory.resources,
  collection: gridState.collection, loadouts: gridState.loadouts, settings: gridState.settings,
  catalog: { ...emptyContent,
    equipment: [{ id: 'sword', baseKind: 'sword', name: '旅人短劍', shape: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      effectId: 'weapon_single', affixPool: ['weaponBaseAdd', 'extraHits', 'critChance', 'critMultiplier', 'lifesteal'], gemTypes: ['venom', 'charge', 'chain', 'sweep'] }],
    gearEffects: [{ id: 'weapon_single', parameters: { kind: 'weapon', baseDamage: 12, attackCoefficient: 1,
      primaryCoefficients: [1], maxTargets: 1, targetPolicy: 'front', critChanceBonus: 0, critMultiplier: 2, armorPenetration: 0 } }],
  },
  backpack: { rows: 6, cols: 8, unlockedCells: gridState.inventory.unlockedCells, selectedItemId: 'i1',
    items: [{ item: gridState.inventory.itemById.i1, placement: { row: 0, col: 1, rotation: 0 },
      cells: [{ row: 0, col: 1 }, { row: 1, col: 1 }], iconKey: 'sword' }],
  },
  warehouse: { capacity: 60, items: gridState.inventory.warehouseOrder.map(id => gridState.inventory.itemById[id]) },
  pets: { capacity: 30, activePetId: gridState.inventory.activePetId, owned: Object.values(gridState.inventory.petById) },
  battlefield: { enemies: gridRun.combat.enemies, round: gridRun.combat.round, cursor: gridRun.combat.currentAction },
  ground: gridState.groundDrops,
  details: { item: gridState.inventory.itemById.i1, name: '旅人短劍',
    stats: [{ sourceId: 'i1', statId: 'critChance', value: 5, unit: 'percentage-points', scope: 'weapon-local' }],
    gems: gridState.inventory.itemById.i1.sockets,
  },
  tracking: { target: null, sources: [], owned: { equipped: 0, warehouse: 0, stacked: 0, embedded: 0, onGround: 0 }, missing: { equipment: 0, gems: 0, dust: 0 } },
  autoRepeatEnabled: true, permission: { battleAllowed: true, groundAllowed: true, canRepeat: false, blockedReasons: [] }, saveStatus: 'ready',
};

function makeCompetingCandidate(commandId: string, muted: boolean): CommitCandidate {
  const base = makeEnvelope();
  const rng = base.rng;
  const transactionId = `transaction-${commandId}`;
  return {
    envelope: {
      ...withState(base, { settings: { ...base.state.settings, musicMuted: muted } }), revision: 11,
      counters: { ...base.counters, nextTransactionSeq: 12, lastAppliedCommandSeq: 8 },
      receipts: [{ transactionId, commandId, commandFingerprint: `settings.update:${muted}`, revision: 11, eventRange: null,
        outcome: { kind: 'accepted' }, consumedIds: [], createdIds: [], rngBefore: rng, rngAfter: rng }],
    }, events: [],
  };
}
export const competingRevisionCase = {
  initial: makeEnvelope(), expectedRevision: 10,
  candidates: [makeCompetingCandidate('tab-a', true), makeCompetingCandidate('tab-b', false)] satisfies readonly CommitCandidate[],
};

export const fixtureCases = {
  enemyCountCases, impactBefore, impactAfter, areaMidway, retaliationDeath, capacityCases, fullGrid,
  gemReturnCase, duplicatePickupCase, exitPending, repeatPauseCases, legacyDecimalCursor,
  equipmentTracking, gemTracking, gemTrackingView, competingRevisionCase, backpackReadModel,
};

// Fixtures can share subtrees; every exported example and each factory result is immutable.
deepFreeze(emptyContent);
deepFreeze(fixtureCases);
