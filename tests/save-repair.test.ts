import { describe, expect, it } from 'vitest';
import { CAPACITY, ITEMS, rotateShape } from '../src/game/content';
import { createInitialState, GameEngine } from '../src/game/engine';
import type { GameState, Item, Placement } from '../src/game/types';
import { LEGACY_SAVE_KEY, MIGRATION_MESSAGE, PLACEMENT_REPAIR_MESSAGE, SAVE_KEY, loadGame, saveGame } from '../src/save';

const gear = (id: string, kind: Item['kind'], placement: Placement | null): Item => ({ id, kind, quality: 2, placement });
const load = (state: GameState) => loadGame({ getItem: key => key === SAVE_KEY ? JSON.stringify(state) : null });
function assertLegal(state: GameState) {
  const open = new Set(state.unlockedCells.map(cell => `${cell.row},${cell.col}`));
  const occupied = new Set<string>();
  for (const item of state.items) {
    if (!item.placement) continue;
    for (const cell of rotateShape(ITEMS[item.kind].shape, item.placement.rotation)) {
      const key = `${cell.row + item.placement.row},${cell.col + item.placement.col}`;
      expect(open.has(key)).toBe(true);
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    }
  }
}
function packedOldShield() {
  const state = createInitialState();
  const oldShieldCells = new Set(['0,0', '1,0', '1,1']);
  state.items = [gear('old-shield', 'shield', { row: 0, col: 0, rotation: 0 }), ...state.unlockedCells
    .filter(cell => !oldShieldCells.has(`${cell.row},${cell.col}`))
    .map(cell => gear(`ring-${cell.row}-${cell.col}`, 'ring', { ...cell, rotation: 0 }))];
  return state;
}

describe('saved equipment shape compatibility', () => {
  it('keeps every valid placement and battle field unchanged and emits no repair notice', () => {
    const state = createInitialState();
    state.items = [gear('square', 'shield', { row: 0, col: 0, rotation: 2 }), gear('straight', 'staff', { row: 0, col: 4, rotation: 0 })];
    state.hero.hp = 37;
    const loaded = load(state);
    expect(loaded.migration).toBeUndefined();
    expect(loaded.state).toEqual(state);
    assertLegal(loaded.state!);
  });

  it('preserves an unchanged ring in the old shield notch and relocates only the expanded shield', () => {
    const state = createInitialState();
    const ring = gear('ring', 'ring', { row: 0, col: 1, rotation: 0 });
    state.items = [gear('old-shield', 'shield', { row: 0, col: 0, rotation: 0 }), ring];
    const loaded = load(state);
    expect(loaded.migration).toBe(PLACEMENT_REPAIR_MESSAGE);
    expect(loaded.state!.items.find(item => item.id === 'ring')).toEqual(ring);
    expect(loaded.state!.items.find(item => item.id === 'old-shield')).toEqual(gear('old-shield', 'shield', { row: 0, col: 2, rotation: 0 }));
    assertLegal(loaded.state!);
  });

  it.each([
    { row: 1, col: 0, rotation: 0 },
    { row: 0, col: 2, rotation: 1 },
  ])('relocates a staff that now crosses locked cells, retaining orientation $rotation', placement => {
    const state = createInitialState();
    state.items = [gear('old-staff', 'staff', placement)];
    const loaded = load(state);
    expect(loaded.state!.items[0].placement).toEqual({ row: 0, col: 0, rotation: placement.rotation });
    expect(loaded.state!.items[0]).toMatchObject({ id: 'old-staff', kind: 'staff', quality: 2 });
    assertLegal(loaded.state!);
  });

  it('repairs a staff crossing the maximum board boundary without unlocking extra cells', () => {
    const state = createInitialState();
    state.unlockedCells = Array.from({ length: 48 }, (_, index) => ({ row: Math.floor(index / 8), col: index % 8 }));
    state.items = [gear('old-staff', 'staff', { row: 3, col: 0, rotation: 0 })];
    const loaded = load(state).state!;
    expect(loaded.unlockedCells).toEqual(state.unlockedCells);
    expect(loaded.items[0].placement).toEqual({ row: 0, col: 0, rotation: 0 });
    assertLegal(loaded);
  });

  it('tries another orientation only when no same-orientation position is available', () => {
    const state = createInitialState();
    const free = new Set(['0,0', '1,0', '2,0', '2,1', '0,1', '0,2', '0,3']);
    const rings = state.unlockedCells.filter(cell => !free.has(`${cell.row},${cell.col}`))
      .map(cell => gear(`ring-${cell.row}-${cell.col}`, 'ring', { ...cell, rotation: 0 }));
    state.items = [gear('old-staff', 'staff', { row: 0, col: 0, rotation: 0 }), ...rings];
    const loaded = load(state).state!;
    expect(loaded.items[0].placement).toEqual({ row: 0, col: 0, rotation: 1 });
    expect(loaded.items.slice(1)).toEqual(rings);
    assertLegal(loaded);
  });

  it('reserves another valid changed shape before finding a new place for a displaced item', () => {
    const state = createInitialState();
    const stableStaff = gear('stable-staff', 'staff', { row: 0, col: 2, rotation: 0 });
    state.items = [gear('old-shield', 'shield', { row: 0, col: 0, rotation: 0 }), stableStaff, gear('ring', 'ring', { row: 0, col: 1, rotation: 0 })];
    const loaded = load(state).state!;
    expect(loaded.items.find(item => item.id === 'stable-staff')).toEqual(stableStaff);
    expect(loaded.items[0].placement).toEqual({ row: 0, col: 3, rotation: 0 });
    assertLegal(loaded);
  });

  it('stashes a shield that cannot fit without moving other equipment or losing its identity', () => {
    const state = packedOldShield();
    const rings = state.items.slice(1);
    const loaded = load(state).state!;
    expect(loaded.items[0]).toEqual(gear('old-shield', 'shield', null));
    expect(loaded.items.slice(1)).toEqual(rings);
    expect(loaded.pending.items).toHaveLength(0);
    expect(loaded.pauses).not.toContain('capacity');
    assertLegal(loaded);
  });

  it('preserves overflow in pending without synthesis or replaying a resolved combat action', () => {
    const state = packedOldShield();
    state.items.push(...Array.from({ length: CAPACITY }, (_, index) => gear(`stash-${index}`, 'sword', null)));
    state.pending.items.push(gear('previous-pending', 'bow', null));
    state.settings.autoItems = { enabled: true, maxQuality: 3 };
    state.hero.hp = 39;
    state.hero.xp = 30;
    state.hero.level = 2;
    state.firstFloorReward = true;
    state.time = 43.2;
    state.tickRemainder = 0.02;
    state.battle = {
      phase: 'combat', round: 3, stage: 'weapons', remaining: 0.3, actionIndex: 0, actionResolved: true,
      enemies: [{ id: 'enemy', kind: 'slime', name: '露珠史萊姆', hp: 50, maxHp: 60, damage: 1, xp: 12 }],
      actions: [{ kind: 'unarmed', sourceId: 'hero' }, { kind: 'enemy', sourceId: 'enemy' }],
    };
    const battle = structuredClone(state.battle);
    const identity = (value: GameState) => [...value.items, ...value.pending.items].map(({ id, kind, quality }) => ({ id, kind, quality })).sort((a, b) => a.id.localeCompare(b.id));
    const loaded = load(state).state!;
    expect(loaded.battle).toEqual(battle);
    expect(loaded.hero).toEqual(state.hero);
    expect(loaded.time).toBe(state.time);
    expect(loaded.tickRemainder).toBe(state.tickRemainder);
    expect(loaded.firstFloorReward).toBe(true);
    expect(loaded.settings).toEqual(state.settings);
    expect(loaded.items.filter(item => !item.placement)).toHaveLength(CAPACITY);
    expect(loaded.pending.items.map(item => item.id)).toEqual(['previous-pending', 'old-shield']);
    expect(loaded.pending.items[1].placement).toBeNull();
    expect(loaded.pauses).toContain('capacity');
    expect(identity(loaded)).toEqual(identity(state));
    assertLegal(loaded);
    const restored = new GameEngine(loaded, () => 0.99);
    restored.step(100);
    expect(restored.state.battle).toEqual(battle);
    restored.setPause('manual', false);
    restored.setPause('capacity', false);
    restored.step(0.3);
    expect(restored.state.battle.enemies[0].hp).toBe(50);
    expect(restored.state.hero.xp).toBe(30);
    expect(restored.events.filter(event => event.type === 'attack')).toHaveLength(0);
  });

  it('repairs v1 placements after the existing combat migration and remains stable on later reloads', () => {
    const state = packedOldShield();
    const legacy = { ...state, version: 1, battle: { phase: 'travel', remaining: 1, enemies: [], unarmedCooldown: 0 } };
    const legacyRaw = JSON.stringify(legacy);
    const storage = new Map([[LEGACY_SAVE_KEY, legacyRaw]]);
    const api = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
    const first = loadGame(api);
    expect(first.migration).toBe(`${MIGRATION_MESSAGE} ${PLACEMENT_REPAIR_MESSAGE}`);
    expect(first.state!.items.find(item => item.id === 'old-shield')!.placement).toBeNull();
    expect(first.state!.version).toBe(2);
    saveGame(api, first.state!);
    const second = loadGame(api);
    expect(second.migration).toBeUndefined();
    expect(second.state).toEqual(first.state);
    expect(storage.get(LEGACY_SAVE_KEY)).toBe(legacyRaw);
    assertLegal(second.state!);
  });
});
