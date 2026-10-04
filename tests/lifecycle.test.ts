import { describe, expect, it } from 'vitest';
import { GameClock } from '../src/clock';
import { GameEngine } from '../src/game/engine';
import { loadGame, saveGame, SAVE_KEY, LEGACY_SAVE_KEY, MIGRATION_MESSAGE } from '../src/save';

describe('foreground clock', () => {
  it('runs the same 20 Hz simulation at 30, 60 and 144 display frames per second', () => {
    for (const fps of [30, 60, 144]) {
      const clock = new GameClock();
      let ticks = 0;
      for (let frame = 0; frame <= fps * 10; frame++) clock.advance(frame * 1000 / fps, false, () => ticks++);
      expect(ticks).toBe(200);
    }
  });
  it('discards hidden time, paused fractions and long suspension', () => {
    const clock = new GameClock();
    let ticks = 0;
    const tick = () => ticks++;
    clock.advance(0, false, tick);
    clock.advance(40, false, tick);
    clock.advance(50, true, tick);
    clock.advance(900000, false, tick);
    expect(ticks).toBe(0);
    clock.advance(900050, false, tick);
    expect(ticks).toBe(1);
    clock.advance(990000, false, tick);
    expect(ticks).toBe(1);
  });
});

describe('versioned local snapshot', () => {
  it('restores combat, pending rewards and settings atomically, and resumes paused', () => {
    const engine = new GameEngine();
    const state = engine.state;
    state.hero.hp = 37;
    state.pending.items.push({ id: 'pending', kind: 'bow', quality: 2, placement: null });
    state.settings.autoItems = { enabled: true, maxQuality: 3 };
    state.pauses = ['hidden', 'organize', 'capacity'];
    let saved = '';
    expect(saveGame({ setItem: (key, value) => { expect(key).toBe(SAVE_KEY); saved = value; } }, state)).toBe(true);
    const restored = loadGame({ getItem: () => saved }).state!;
    expect(restored.hero.hp).toBe(37);
    expect(restored.pending).toEqual(state.pending);
    expect(restored.battle).toEqual(state.battle);
    expect(restored.settings).toEqual(state.settings);
    expect(restored.pauses).toEqual(['organize', 'capacity', 'manual']);
  });
  it('handles missing, damaged or incompatible snapshots and storage failure', () => {
    expect(loadGame({ getItem: () => null })).toEqual({});
    for (const raw of ['{', '{}', '{"version":999}', '{"version":1,"hero":null}']) {
      expect(loadGame({ getItem: () => raw }).state).toBeUndefined();
      expect(loadGame({ getItem: () => raw }).message).toBeTruthy();
    }
    expect(saveGame({ setItem: () => { throw new Error('Quota'); } }, new GameEngine().state)).toBe(false);
  });
  it('rejects corrupted pending rewards and out-of-range qualities before they reach game rules', () => {
    const state = new GameEngine().state;
    for (const broken of [null, { ...state.items[0], kind: 'missing' }, { ...state.items[0], quality: 6 }]) {
      const raw = JSON.stringify({ ...state, pending: { items: [broken], pets: [] } });
      expect(loadGame({ getItem: () => raw }).state).toBeUndefined();
    }
    state.items[0].quality = 6 as never;
    expect(loadGame({ getItem: () => JSON.stringify(state) }).state).toBeUndefined();
  });

  it('migrates v1 growth, gear, spirits and pending loot while retaining the original snapshot as a backup', () => {
    const state = new GameEngine().state;
    state.hero = { hp: 17, xp: 150, level: 3, points: 2, attackPoints: 1, healthPoints: 2 };
    state.unlockedCells.push({ row: 0, col: 5 });
    state.pets = [{ id: 'old-wolf', kind: 'wolf', quality: 2, xp: 120, level: 3 }];
    state.activePetId = 'old-wolf';
    state.pending = {
      items: [{ id: 'pending-item', kind: 'armor', quality: 1, placement: null }],
      pets: [{ id: 'pending-pet', kind: 'fairy', quality: 1, xp: 30, level: 2 }],
    };
    state.floor = 2;
    state.wave = 4;
    state.unlockedFloor = 3;
    state.firstFloorReward = true;
    state.completedRuns = 2;
    state.settings.autoItems = { enabled: true, maxQuality: 3 };
    state.settings.musicVolume = 0.31;
    state.pauses = ['hidden', 'capacity', 'organize'];
    const legacy = {
      ...state, version: 1, tickRemainder: 0.03,
      items: state.items.map(item => ({ ...item, cooldown: 0.65 })),
      pets: state.pets.map(pet => ({ ...pet, cooldown: 0.75 })),
      pending: {
        items: state.pending.items.map(item => ({ ...item, cooldown: 0 })),
        pets: state.pending.pets.map(pet => ({ ...pet, cooldown: 0 })),
      },
      battle: { phase: 'combat', remaining: 0, unarmedCooldown: 0.5, enemies: [{ id: 'old-enemy', kind: 'slime', name: '舊敵人', hp: 12, maxHp: 60, damage: 8, interval: 2.4, cooldown: 0.2, xp: 24 }] },
    };
    const legacyRaw = JSON.stringify(legacy);
    const memory = new Map([[LEGACY_SAVE_KEY, legacyRaw]]);
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    const loaded = loadGame(storage);
    expect(loaded.migration).toBe(MIGRATION_MESSAGE);
    expect(loaded.message).toBeUndefined();
    const migrated = loaded.state!;
    expect(migrated).toMatchObject({ version: 2, floor: 2, wave: 1, unlockedFloor: 3, firstFloorReward: true, completedRuns: 2, tickRemainder: 0, activePetId: 'old-wolf' });
    expect(migrated.hero).toEqual({ ...state.hero, hp: new GameEngine(migrated).stats.maxHp });
    expect(migrated.items).toEqual(state.items);
    expect(migrated.pets).toEqual(state.pets);
    expect(migrated.pending).toEqual(state.pending);
    expect(migrated.unlockedCells).toEqual(state.unlockedCells);
    expect(migrated.settings).toEqual(state.settings);
    expect(migrated.battle).toEqual(new GameEngine().state.battle);
    expect(migrated.pauses).toEqual(['capacity', 'organize', 'manual']);
    expect(saveGame(storage, migrated)).toBe(true);
    expect(memory.get(LEGACY_SAVE_KEY)).toBe(legacyRaw);
    const reloaded = loadGame(storage);
    expect(reloaded.migration).toBeUndefined();
    expect(reloaded.state).toEqual(migrated);
  });

  it('does not replace a damaged current save with stale v1 progress', () => {
    const older = JSON.stringify({ ...new GameEngine().state, version: 1 });
    const result = loadGame({ getItem: key => key === SAVE_KEY ? '{damaged' : older });
    expect(result.state).toBeUndefined();
    expect(result.message).toBeTruthy();
  });

  it('rejects broken round queues and resolution markers', () => {
    const state = new GameEngine().state;
    for (const battle of [
      { ...state.battle, round: 0 },
      { ...state.battle, stage: 'missing' },
      { ...state.battle, actions: [null] },
      { ...state.battle, actions: [{ kind: 'spell', sourceId: 'i1' }] },
      { ...state.battle, actionIndex: 50 },
      { ...state.battle, actionResolved: undefined },
      { ...state.battle, phase: 'combat', actions: [] },
    ]) {
      const raw = JSON.stringify({ ...state, battle });
      expect(loadGame({ getItem: key => key === SAVE_KEY ? raw : null }).state).toBeUndefined();
    }
  });
});
