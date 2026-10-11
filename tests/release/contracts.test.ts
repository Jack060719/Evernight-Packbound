import { describe, expect, it } from 'vitest';
import { GameClock } from '../../src/clock';
import {
  actionHitTicks, CONTENT_VERSION, createRandomSource, getExecutionPermission, PAUSE_REASONS,
} from '../../src/game/contracts';
import type { ClockPort, ExecutionEnvironment, HitPlanEntry, ModulePorts, RngState } from '../../src/game/contracts';
import { createReleaseRegistry } from '../../src/game/registries';
import {
  areaMidway, backpackReadModel, capacityCases, competingRevisionCase, duplicatePickupCase,
  emptyContent, enemyCountCases, exitPending, fixtureCases, gemReturnCase, gemTrackingView,
  impactAfter, impactBefore, legacyDecimalCursor, makeEnvelope, retaliationDeath,
} from './fixtures/contracts';

const environment: ExecutionEnvironment = { visible: true, storageGate: false, settlementReady: true, exitReady: true };
const seed: RngState = { algorithm: 'xorshift32-v1', seed: 1, state: 1, draws: 0 };

// Registry installation shapes only; transfer-ports.test.ts exercises typed transfer inputs/outputs.
const uninstalled = (): never => { throw new Error('Test-only uninstalled leaf'); };
const modules: ModulePorts = {
  combat: { resolveImpact: uninstalled, resolveHook: uninstalled, recalculatePetGrowth: uninstalled, evaluateCooperation: uninstalled },
  world: { planWorldCommand: uninstalled, getExecutionPermission, planStageExit: uninstalled },
  inventory: {
    planCommand: uninstalled, validatePlacement: uninstalled,
    projectNetInventory: (moves, state) => ({ ok: false, error: { code: 'NOT_IN_ALLOWED_MODE', message: `Uninstalled projection: ${moves.length} moves, ${state.warehouseOrder.length} items` } }),
    planTransfer: (input, state) => ({ ok: false, error: { code: 'NOT_IN_ALLOWED_MODE', message: `Uninstalled ${input.kind} transfer, ${state.warehouseOrder.length} items` } }),
    previewInventory: uninstalled, previewSynthesis: uninstalled, previewSalvage: uninstalled,
  },
  collection: { planCollection: uninstalled, planLoadout: uninstalled, discover: uninstalled, queryLootSources: uninstalled, getTrackingView: uninstalled, planTracking: uninstalled },
  customization: {
    planCommand: uninstalled, initializeAffixes: uninstalled, extendForQualityUpgrade: uninstalled,
    previewGemCommand: uninstalled, previewReroll: uninstalled, collectStatModifiers: uninstalled,
    collectGemMechanics: uninstalled, reserveReturnMaterialsGems: uninstalled,
  },
  ground: { planGroundDrops: uninstalled, planPickup: uninstalled, applyLootLifecycle: uninstalled, getPendingPickupBlockers: uninstalled, planNextExitPickup: uninstalled },
  ui: { render: uninstalled },
  visuals: { createBattle: uninstalled, manifest: [] },
  rewards: { resolveRewards: uninstalled },
};

describe('frozen release integration boundary', () => {
  it('fails explicitly for an absent module/dispatcher without changing the supplied snapshot', async () => {
    const snapshot = makeEnvelope();
    const before = JSON.stringify(snapshot);
    const registry = createReleaseRegistry(emptyContent);
    expect(registry.require('combat')).toMatchObject({ ok: false, error: { code: 'NOT_IN_ALLOWED_MODE' } });
    expect(await registry.commands.dispatch({ type: 'world.setAutoRepeat', enabled: true }, {
      commandId: 'cmd-1', commandSeq: 1, expectedRevision: snapshot.revision,
    })).toMatchObject({ ok: false, error: { code: 'NOT_IN_ALLOWED_MODE' } });
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('assembles only explicitly supplied ports and rejects an incompatible content pack', () => {
    const registry = createReleaseRegistry(emptyContent, modules);
    for (const key of Object.keys(modules) as (keyof ModulePorts)[]) {
      expect(registry.require(key)).toEqual({ ok: true, value: modules[key] });
    }
    expect(() => createReleaseRegistry({ ...emptyContent, version: `${CONTENT_VERSION}-different` })).toThrow('Content version');
  });

  it('keeps the existing injected clock compatible; a blocked interval never catches up', () => {
    const clock: ClockPort = new GameClock();
    let ticks = 0;
    const step = () => ticks++;
    clock.advance(0, false, step);
    clock.advance(100, false, step);
    expect(ticks).toBe(2);
    clock.advance(60000, true, step);
    clock.advance(60050, false, step);
    expect(ticks).toBe(2);
    clock.advance(60100, false, step);
    expect(ticks).toBe(3);
  });
});

describe('persisted RNG cursor', () => {
  it('matches xorshift32 known vectors, with candidate-local draws and an exact resume point', () => {
    const random = createRandomSource(seed);
    const first = [random.next(), random.next(), random.next()];
    expect(first.map(value => value * 0x100000000)).toEqual([270369, 67634689, 2647435461]);
    expect(seed).toEqual({ algorithm: 'xorshift32-v1', seed: 1, state: 1, draws: 0 });
    const saved = random.snapshot();
    const resumed = createRandomSource(JSON.parse(JSON.stringify(saved)));
    expect([resumed.next(), resumed.next()]).toEqual([random.next(), random.next()]);
    expect(resumed.snapshot().draws).toBe(5);
    expect(saved.draws).toBe(3);
  });

  it('does not consume reward or crafting cursors while evaluating combat', () => {
    const { rng } = makeEnvelope();
    const before = JSON.stringify(rng);
    const combat = createRandomSource(rng.combat);
    combat.next();
    expect(JSON.stringify(rng)).toBe(before);
    expect(combat.snapshot().draws).toBe(rng.combat.draws + 1);
  });

  it.each([0, -1, 0x100000000, 1.5])('rejects an invalid cursor rather than silently changing its seed: %s', state => {
    expect(() => createRandomSource({ ...seed, state })).toThrow(RangeError);
  });
});

describe('composable execution gates', () => {
  it.each(PAUSE_REASONS)('preserves repeat intent while %s blocks both clocks', reason => {
    const initial = makeEnvelope().state;
    const state = { ...initial, settings: { ...initial.settings, autoRepeatEnabled: true }, lifecycle: { ...initial.lifecycle, pauseReasons: [reason] } };
    const before = JSON.stringify(state);
    expect(getExecutionPermission(state, environment)).toEqual({
      battleAllowed: false, groundAllowed: false, canRepeat: false, blockedReasons: [reason],
    });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('does not clear another blocker when one pause is removed', () => {
    const initial = makeEnvelope().state;
    const lifecycle = { ...initial.lifecycle, pauseReasons: ['capacity', 'manual'] as const };
    expect(getExecutionPermission({ ...initial, lifecycle }, environment).blockedReasons).toEqual(['capacity', 'manual']);
    expect(getExecutionPermission({ ...initial, lifecycle: { ...lifecycle, pauseReasons: ['capacity'] } }, environment).groundAllowed).toBe(false);
  });

  it('lets falling loot progress during travel and settlement, while stopping attacks', () => {
    const state = makeEnvelope().state;
    if (!state.activeRun) throw new Error('Fixture must contain a run');
    for (const status of ['wave-entry', 'travel', 'settlement', 'exit-wait'] as const) {
      const permission = getExecutionPermission({ ...state, activeRun: { ...state.activeRun, status } }, environment);
      expect(permission.groundAllowed).toBe(true);
      expect(permission.battleAllowed).toBe(false);
    }
  });

  it('requires visible, resumed, committed settlement with no unresolved choice before repeating', () => {
    const original = makeEnvelope().state;
    if (!original.activeRun) throw new Error('Fixture must contain a run');
    const state = { ...original, activeRun: { ...original.activeRun, status: 'settlement' as const }, settings: { ...original.settings, autoRepeatEnabled: true } };
    expect(getExecutionPermission(state, environment).canRepeat).toBe(true);
    for (const patch of [{ visible: false }, { storageGate: true }, { settlementReady: false }, { exitReady: false }]) {
      expect(getExecutionPermission(state, { ...environment, ...patch }).canRepeat).toBe(false);
    }
    expect(getExecutionPermission({ ...state, lifecycle: { ...state.lifecycle, resumeRequired: true } }, environment).canRepeat).toBe(false);
    expect(getExecutionPermission({ ...state, lifecycle: { ...state.lifecycle, pendingChoice: { kind: 'death', runId: state.activeRun.runId } } }, environment).canRepeat).toBe(false);
    expect(state.settings.autoRepeatEnabled).toBe(true);
  });
});

describe('source action scheduling contract', () => {
  it('fits flattened primary/extra impacts in one ten-tick action, including the eight-impact boundary', () => {
    expect(actionHitTicks(1)).toEqual([0]);
    expect(actionHitTicks(3)).toEqual([0, 3, 6]);
    expect(actionHitTicks(8)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    for (const count of [0, 9, 1.5]) expect(() => actionHitTicks(count)).toThrow(RangeError);
  });

  it('cannot schedule a proc as a separate action hit', () => {
    // This is also checked by tsc; proc damage belongs inside its parent impact transaction.
    // @ts-expect-error A proc may be emitted as an event, never queued as a direct hit.
    const forbidden: HitPlanEntry['hitClass'] = 'proc';
    expect(forbidden).toBe('proc');
  });
});

describe('shared fixture integrity (not release gameplay acceptance)', () => {
  it('roundtrips every contract case as plain JSON, including partial impacts and legacy decimals', () => {
    expect(JSON.parse(JSON.stringify(fixtureCases))).toEqual(fixtureCases);
    const legacy = legacyDecimalCursor.state.activeRun;
    if (!legacy || legacy.ruleset !== 'legacy-v2') throw new Error('Expected legacy fixture');
    expect([legacy.legacyTime, legacy.legacyTickRemainder, legacy.combat.remaining]).toEqual([12.345, 0.031, 0.25]);
    expect(legacy.combat.actionResolved).toBe(true);
    const area = areaMidway.state.activeRun;
    if (!area || area.ruleset !== 'release-r2') throw new Error('Expected area fixture');
    expect(area.combat.currentAction?.cursor.targetOrdinal).toBe(2);
    expect(area.combat.currentAction?.hitPlan.map(hit => hit.dueTick)).toEqual(actionHitTicks(5));
  });

  it('uses numerically consistent noncritical before/after examples and independent saved RNG cursors', () => {
    const random = createRandomSource(impactBefore.rng.combat);
    expect(random.next()).toBeGreaterThan(0.1);
    expect(random.snapshot()).toEqual(impactAfter.rng.combat);
    const afterRun = impactAfter.state.activeRun;
    if (!afterRun || afterRun.ruleset !== 'release-r2') throw new Error('Expected impact fixture');
    expect(afterRun.combat.enemies[0].hp).toBe(120 - 16);
    expect(impactAfter.revision).toBe(impactBefore.revision + 1);
    expect(retaliationDeath.state.hero.hp).toBe(0);
    expect(retaliationDeath.state.lifecycle.pendingChoice?.kind).toBe('death');
    expect(retaliationDeath.state.groundDrops).toHaveLength(1);
  });

  it('keeps canonical entity references valid across equipment/pet capacity boundaries', () => {
    for (const snapshot of [...enemyCountCases.map(entry => entry.snapshot), ...Object.values(capacityCases), areaMidway, gemReturnCase.snapshot]) {
      const inventory = snapshot.state.inventory;
      for (const [id, item] of Object.entries(inventory.itemById)) {
        expect(item.id).toBe(id);
        expect(inventory.locationById[id]).toBeDefined();
      }
      expect(new Set(inventory.warehouseOrder).size).toBe(inventory.warehouseOrder.length);
      for (const id of inventory.warehouseOrder) expect(inventory.locationById[id].kind).toBe('warehouse');
      for (const drop of snapshot.state.groundDrops) {
        if (drop.payloadRef.kind === 'equipment') expect(inventory.locationById[drop.payloadRef.itemId]).toEqual({ kind: 'ground', dropId: drop.id });
        if (drop.payloadRef.kind === 'pet') expect(inventory.petLocationById[drop.payloadRef.petId]).toEqual({ kind: 'ground', dropId: drop.id });
      }
      if (inventory.activePetId) expect(inventory.petLocationById[inventory.activePetId].kind).toBe('owned');
    }
    expect(capacityCases.below.state.inventory.warehouseOrder).toHaveLength(59);
    expect(capacityCases.overflow.state.inventory.warehouseOrder).toHaveLength(60);
    expect(Object.values(capacityCases.overflow.state.inventory.petLocationById).filter(location => location.kind === 'owned')).toHaveLength(30);
    expect(capacityCases.overflow.state.groundDrops).toHaveLength(2);
    expect(backpackReadModel.backpack.unlockedCells).toHaveLength(48);
    expect(backpackReadModel.battlefield.enemies).toHaveLength(5);
  });

  it('carries duplicate pickup and competing revision inputs without pretending to implement CAS', () => {
    const attempts = duplicatePickupCase.attempts;
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[2].envelope.commandId).not.toBe(attempts[0].envelope.commandId);
    expect(attempts[2].command.drop).toEqual(attempts[0].command.drop);
    for (const candidate of competingRevisionCase.candidates) expect(candidate.envelope.revision).toBe(competingRevisionCase.expectedRevision + 1);
    expect(exitPending.state.lifecycle.exitRequest?.nextDropId).toBe(exitPending.state.groundDrops[0].id);
    expect(gemTrackingView.owned).toMatchObject({ stacked: 2, embedded: 1 });
    expect(gemTrackingView.missing.gems).toBe(3);
  });

  it('prevents one consumer from corrupting the shared test snapshots', () => {
    expect(Object.isFrozen(makeEnvelope().state.inventory.itemById.i1)).toBe(true);
    expect(Reflect.set(capacityCases.full.state.hero, 'hp', -999)).toBe(false);
    expect(capacityCases.full.state.hero.hp).toBeGreaterThan(0);
  });
});
