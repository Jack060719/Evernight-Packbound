import { describe, expect, it } from 'vitest';
import { CAPACITY, ITEMS, PETS, QUALITY_MULTIPLIERS, SYNTHESIS_CHANCES, levelFromXp, rotateShape, xpForLevel } from '../src/game/content';
import { createInitialState, GameEngine } from '../src/game/engine';
import { loadGame, saveGame, SAVE_KEY } from '../src/save';
import type { Enemy, Item, Pet, Quality } from '../src/game/types';

const item = (id: string, quality: Quality = 0, kind: Item['kind'] = 'sword'): Item => ({ id, kind, quality, placement: null });
const pet = (id: string, xp = 0, quality: Quality = 0, kind: Pet['kind'] = 'wolf'): Pet => ({ id, kind, quality, xp, level: levelFromXp(xp) });
const enemy = (overrides: Partial<Enemy> = {}): Enemy => ({ id: 'test-enemy', kind: 'skeleton', name: '測試敵人', hp: 1, maxHp: 1, damage: 1, xp: 30, ...overrides });
function organize(random = () => 0) {
  const engine = new GameEngine(createInitialState(), random);
  engine.setPause('organize', true);
  return engine;
}
function prepareKill(engine: GameEngine, victim = enemy()) {
  engine.state.pauses = [];
  engine.state.battle = { ...createInitialState().battle, remaining: 0.05 };
  engine.step(0.05);
  const first = engine.state.battle.enemies[0];
  Object.assign(first, victim, { id: first.id });
  engine.state.battle.enemies = [first];
}
function kill(engine: GameEngine, victim = enemy()) {
  prepareKill(engine, victim);
  engine.step(0.5);
}

describe('backpack and growth', () => {
  it('starts with exactly 20 open cells in a 4 × 5 rectangle and inactive automation', () => {
    const state = createInitialState();
    expect(state.unlockedCells).toHaveLength(20);
    expect(Math.max(...state.unlockedCells.map(cell => cell.row))).toBe(3);
    expect(Math.max(...state.unlockedCells.map(cell => cell.col))).toBe(4);
    expect(state.settings.autoItems).toEqual({ enabled: false, maxQuality: 1 });
    expect(state.settings.autoPets).toEqual({ enabled: false, maxQuality: 1 });
    expect(state.pauses).toEqual(['manual']);
  });

  it('keeps the staff straight through all four rotations without changing its four-cell footprint', () => {
    const shape = ITEMS.staff.shape;
    const original = structuredClone(shape);
    for (let rotation = 0; rotation < 4; rotation++) {
      const cells = rotateShape(shape, rotation);
      expect(cells).toHaveLength(4);
      expect(Math.min(...cells.map(cell => cell.row))).toBe(0);
      expect(Math.min(...cells.map(cell => cell.col))).toBe(0);
      expect(new Set(cells.map(cell => `${cell.row},${cell.col}`)).size).toBe(4);
      expect([Math.max(...cells.map(cell => cell.row)) + 1, Math.max(...cells.map(cell => cell.col)) + 1])
        .toEqual(rotation % 2 === 0 ? [4, 1] : [1, 4]);
    }
    expect(rotateShape(shape, 4)).toEqual(shape);
    expect(shape).toEqual(original);
  });

  it('keeps the shield a complete 2 × 2 square in every orientation', () => {
    for (let rotation = 0; rotation < 4; rotation++) {
      const cells = rotateShape(ITEMS.shield.shape, rotation);
      expect(cells.map(cell => `${cell.row},${cell.col}`).sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
    }
  });

  it('rejects overlap, locked cells, bounds and invalid moves atomically', () => {
    const engine = organize();
    const before = structuredClone(engine.state.items);
    expect(engine.placeItem('i5', 0, 0).ok).toBe(false);
    expect(engine.placeItem('i5', 0, 5).ok).toBe(false);
    expect(engine.placeItem('i5', -1, 3).ok).toBe(false);
    expect(engine.placeItem('i5', 3, 4).ok).toBe(false);
    expect(engine.placeItem('i1', 0, 1).ok).toBe(false);
    expect(engine.state.items).toEqual(before);
    expect(engine.placeItem('i5', 2, 3, 1).ok).toBe(true);
    expect(engine.state.items.find(item => item.id === 'i5')?.placement).toEqual({ row: 2, col: 3, rotation: 1 });
    expect(engine.state.items).toHaveLength(6);
  });

  it('only spends two points on adjacent locked cells, up to 48 cells', () => {
    const engine = organize();
    engine.state.hero.points = 56;
    expect(engine.expandCell(4, 5).ok).toBe(false);
    expect(engine.expandCell(0, 0).ok).toBe(false);
    expect(engine.state.hero.points).toBe(56);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
      if (!engine.state.unlockedCells.some(cell => cell.row === row && cell.col === col)) expect(engine.expandCell(row, col).ok).toBe(true);
    }
    expect(engine.state.unlockedCells).toHaveLength(48);
    expect(engine.state.hero.points).toBe(0);
    expect(engine.expandCell(6, 0).ok).toBe(false);
    expect(engine.expandCell(0, 8).ok).toBe(false);
    const poor = organize();
    poor.state.hero.points = 1;
    expect(poor.expandCell(0, 5).ok).toBe(false);
    expect(poor.state.hero.points).toBe(1);
  });

  it('derives equipped bonuses immediately without healing on equipment or growth changes', () => {
    const engine = organize();
    engine.state.items.push(item('armor', 0, 'armor'), item('ring', 0, 'ring'));
    const initial = engine.stats;
    engine.state.hero.hp = 60;
    expect(engine.placeItem('armor', 2, 3).ok).toBe(true);
    expect(engine.stats.maxHp).toBe(initial.maxHp + 35);
    expect(engine.state.hero.hp).toBe(60);
    engine.state.hero.hp = 130;
    expect(engine.stashItem('armor').ok).toBe(true);
    expect(engine.state.hero.hp).toBe(100);
    expect(engine.placeItem('ring', 2, 3).ok).toBe(true);
    expect(engine.stats.attack).toBe(initial.attack + 3);
    expect(engine.stats.damagePerRound).toBeGreaterThan(initial.damagePerRound);
    engine.state.hero.points = 2;
    expect(engine.spendPoint('health').ok).toBe(true);
    expect(engine.state.hero.hp).toBe(100);
    expect(engine.stats.maxHp).toBe(115);
    expect(engine.spendPoint('attack').ok).toBe(true);
    expect(engine.stats.attack).toBe(initial.attack + 5);
    expect(engine.spendPoint('attack').ok).toBe(false);
  });

  it('requires organizing for inventory, growth, pet and synthesis actions', () => {
    const engine = new GameEngine();
    engine.state.hero.points = 3;
    engine.state.pets.push(pet('p1'), pet('p2'));
    expect(engine.placeItem('i4', 2, 3).ok).toBe(false);
    expect(engine.stashItem('i1').ok).toBe(false);
    expect(engine.expandCell(0, 5).ok).toBe(false);
    expect(engine.spendPoint('health').ok).toBe(false);
    expect(engine.setPet('p1').ok).toBe(false);
    expect(engine.synthesize('item', 'i5', 'i6').ok).toBe(false);
    expect(engine.discardItem('i4').ok).toBe(false);
    expect(engine.releasePet('p1').ok).toBe(false);
  });
});

describe('synthesis', () => {
  it.each(SYNTHESIS_CHANCES.map((chance, quality) => [chance, quality] as const))('uses the exact %s success boundary for quality %s', (chance, quality) => {
    for (const [roll, success] of [[chance - 0.000001, true], [chance, false]] as const) {
      const engine = organize(() => roll);
      engine.state.items = [item('main', quality as Quality), item('material', quality as Quality)];
      const outcome = engine.synthesize('item', 'main', 'material');
      expect(outcome).toMatchObject({ ok: true, success });
      expect(engine.state.items).toHaveLength(1);
      expect(engine.state.items[0]).toMatchObject({ id: 'main', kind: 'sword', quality: quality + Number(success), placement: null });
    }
  });

  it('rejects mismatched, gold, duplicate and active pet materials without consuming any', () => {
    const engine = organize();
    engine.state.items.push(item('dagger'), item('blue', 1), item('gold1', 5), item('gold2', 5));
    engine.state.items.find(item => item.id === 'dagger')!.kind = 'dagger';
    engine.state.pets = [pet('p1'), pet('p2'), pet('fairy', 0, 0, 'fairy')];
    engine.state.activePetId = 'p1';
    const before = structuredClone(engine.state);
    expect(engine.synthesize('item', 'i5', 'i5').ok).toBe(false);
    expect(engine.synthesize('item', 'i5', 'dagger').ok).toBe(false);
    expect(engine.synthesize('item', 'i5', 'blue').ok).toBe(false);
    expect(engine.synthesize('item', 'gold1', 'gold2').ok).toBe(false);
    expect(engine.synthesize('pet', 'p1', 'p2').ok).toBe(false);
    expect(engine.synthesize('pet', 'p2', 'fairy').ok).toBe(false);
    expect(engine.state).toEqual(before);
  });

  it.each([0, 0.99])('retains the pet with higher cumulative experience even when roll = %s', roll => {
    const engine = organize(() => roll);
    engine.state.pets = [pet('young', 30), pet('elder', 150)];
    expect(engine.synthesize('pet', 'young', 'elder').ok).toBe(true);
    expect(engine.state.pets).toHaveLength(1);
    expect(engine.state.pets[0]).toMatchObject({ id: 'elder', xp: 150, level: levelFromXp(150), kind: 'wolf', quality: roll === 0 ? 1 : 0 });
  });

  it.each([0, 0.99])('manually merges any equipment locations, retaining the selected target at roll %s', roll => {
    for (const targetInBag of [false, true]) for (const materialInBag of [false, true]) {
      const engine = organize(() => roll);
      const target = { ...item('target'), placement: targetInBag ? { row: 0, col: 0, rotation: 1 } : null };
      const material = { ...item('material'), placement: materialInBag ? { row: 2, col: 0, rotation: 0 } : null };
      engine.state.items = [material, target];
      const placement = structuredClone(target.placement);
      expect(engine.synthesize('item', 'target', 'material')).toMatchObject({ ok: true, success: roll === 0 });
      expect(engine.state.items).toEqual([{ ...target, placement, quality: roll === 0 ? 1 : 0 }]);
    }
  });

  it.each([0, 0.99])('clamps equipment synthesis health without healing, including consumed equipped armor at roll %s', roll => {
    const engine = organize(() => roll);
    const target = { ...item('target', 0, 'armor'), placement: { row: 0, col: 0, rotation: 0 } };
    const material = { ...item('material', 0, 'armor'), placement: { row: 2, col: 0, rotation: 0 } };
    engine.state.items = [target, material];
    engine.state.hero.hp = 160;
    engine.synthesize('item', 'target', 'material');
    expect(engine.state.hero.hp).toBe(engine.stats.maxHp);
    expect(engine.state.hero.hp).toBeLessThan(160);
    engine.state.items.push(item('next', target.quality, 'armor'));
    engine.state.hero.hp = 40;
    engine.synthesize('item', 'target', 'next');
    expect(engine.state.hero.hp).toBe(40);
  });

  it('automatically combines from low to high quality without crossing the output cap', () => {
    const engine = organize();
    engine.state.items = [item('a'), item('b'), item('c'), item('d'), item('e', 1), item('f', 1)];
    engine.state.settings.autoItems = { enabled: true, maxQuality: 2 };
    engine.retryPending();
    expect(engine.state.items).toHaveLength(2);
    expect(engine.state.items.every(item => item.quality === 2)).toBe(true);
    expect(engine.state.log.filter(line => line.includes('合成成功'))).toHaveLength(4);
  });

  it('excludes equipped weapons and active pets, respects independent switches and handles repeated failure', () => {
    const engine = organize(() => 0.99);
    engine.state.pets = [pet('active'), pet('other1'), pet('other2')];
    engine.state.activePetId = 'active';
    engine.state.settings.autoItems.enabled = true;
    engine.retryPending();
    expect(engine.state.items.find(item => item.id === 'i1')?.placement).not.toBeNull();
    expect(engine.state.items.filter(item => item.kind === 'sword' && !item.placement)).toHaveLength(1);
    expect(engine.state.pets).toHaveLength(3);
    engine.state.settings.autoPets.enabled = true;
    engine.retryPending();
    expect(engine.state.pets).toHaveLength(2);
    expect(engine.state.pets.find(pet => pet.id === 'active')?.quality).toBe(0);
    expect(engine.state.pets.every(pet => pet.quality === 0)).toBe(true);
  });
});

describe('capacity and pending rewards', () => {
  it('retains a full-stash drop through serialization and admits it when one space is freed', () => {
    const engine = organize();
    engine.state.items = Array.from({ length: CAPACITY }, (_, i) => item(`full${i}`));
    engine.state.pending.items = [item('waiting')];
    expect(engine.retryPending().ok).toBe(false);
    expect(engine.state.items).toHaveLength(CAPACITY);
    expect(engine.state.pending.items.map(item => item.id)).toEqual(['waiting']);
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.state)), () => 0);
    const snapshot = JSON.stringify(restored.state);
    restored.step(100);
    expect(JSON.stringify(restored.state)).toBe(snapshot);
    expect(restored.discardItem('full0').ok).toBe(true);
    expect(restored.state.items).toHaveLength(CAPACITY);
    expect(restored.state.items.filter(item => item.id === 'waiting')).toHaveLength(1);
    expect(restored.state.pending.items).toHaveLength(0);
    expect(restored.state.pauses).not.toContain('capacity');
    expect(restored.state.pauses).toContain('organize');
    expect(restored.state.pauses).toContain('manual');
  });

  it('uses a new drop for auto synthesis before rejecting it for capacity', () => {
    const engine = organize();
    engine.state.items = Array.from({ length: CAPACITY }, (_, i) => item(`full${i}`, i === 0 ? 0 : 5));
    engine.state.pending.items = [item('waiting')];
    engine.state.settings.autoItems.enabled = true;
    expect(engine.retryPending().ok).toBe(true);
    expect(engine.state.items).toHaveLength(CAPACITY);
    expect(engine.state.pending.items).toHaveLength(0);
    expect(engine.state.items.find(item => item.id === 'full0')?.quality).toBe(1);
    expect(engine.state.pauses).not.toContain('capacity');
  });

  it('counts pets including the active pet, protects it from release, and refills after release', () => {
    const engine = organize();
    engine.state.pets = Array.from({ length: CAPACITY }, (_, i) => pet(`p${i}`));
    engine.state.activePetId = 'p0';
    engine.state.pending.pets = [pet('waiting')];
    expect(engine.retryPending().ok).toBe(false);
    expect(engine.releasePet('p0').ok).toBe(false);
    expect(engine.releasePet('p1').ok).toBe(true);
    expect(engine.state.pets).toHaveLength(CAPACITY);
    expect(engine.state.pets.some(pet => pet.id === 'waiting')).toBe(true);
    expect(engine.state.pending.pets).toHaveLength(0);
    expect(engine.state.activePetId).toBe('p0');
  });

  it('keeps equipped equipment outside stash capacity and does not permit overflow by unequipping', () => {
    const engine = organize();
    engine.state.items = [engine.state.items[0], ...Array.from({ length: CAPACITY }, (_, i) => item(`full${i}`))];
    expect(engine.retryPending().ok).toBe(true);
    expect(engine.stashItem('i1').ok).toBe(false);
    expect(engine.state.items[0].placement).not.toBeNull();
    expect(engine.placeItem('full0', 2, 4).ok).toBe(true);
    expect(engine.stashItem('i1').ok).toBe(true);
  });

  it('retains final-kill drops at capacity, then grants the first-floor spirit once after its action resumes', () => {
    const engine = new GameEngine(createInitialState(), () => 0);
    engine.state.items = [engine.state.items[0], ...Array.from({ length: CAPACITY }, (_, i) => item(`full${i}`))];
    engine.state.pets = Array.from({ length: CAPACITY }, (_, i) => pet(`fullpet${i}`));
    engine.state.wave = 5;
    kill(engine);
    expect(engine.state.floor).toBe(1);
    expect(engine.state.firstFloorReward).toBe(false);
    expect(engine.state.pending.items).toHaveLength(1);
    expect(engine.state.pending.pets).toHaveLength(1);
    const pendingIds = [...engine.state.pending.items, ...engine.state.pending.pets].map(value => value.id);
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.state)), () => 0.99);
    restored.setPause('organize', true);
    restored.discardItem('full0');
    restored.releasePet('fullpet0');
    restored.retryPending();
    expect(restored.state.pending).toEqual({ items: [], pets: [] });
    expect(restored.state.pauses).not.toContain('capacity');
    restored.setPause('organize', false);
    restored.step(0.5);
    expect(restored.state.floor).toBe(2);
    expect(restored.state.firstFloorReward).toBe(true);
    expect(restored.state.pending.pets).toHaveLength(1);
    restored.setPause('organize', true);
    restored.releasePet('fullpet1');
    const allIds = [...restored.state.items, ...restored.state.pets].map(value => value.id);
    expect(pendingIds.every(id => allIds.filter(value => value === id).length === 1)).toBe(true);
    restored.changeFloor(1);
    restored.state.wave = 5;
    kill(restored);
    expect(restored.state.pending.pets).toHaveLength(0);
    expect(restored.state.pets).toHaveLength(CAPACITY);
  });
});

describe('round combat and progression', () => {
  it('awards full experience to the hero and only the active pet, granting one point per level', () => {
    const engine = new GameEngine(createInitialState(), () => 0.99);
    engine.state.pets = [pet('active'), pet('resting')];
    engine.state.activePetId = 'active';
    kill(engine, enemy({ xp: xpForLevel(4) }));
    expect(engine.state.hero).toMatchObject({ xp: 180, level: 4, points: 3 });
    expect(engine.state.pets[0]).toMatchObject({ xp: 180, level: 4 });
    expect(engine.state.pets[1]).toMatchObject({ xp: 0, level: 1 });
  });

  it('orders weapons by anchor row and column, then the pet, then every surviving enemy', () => {
    const engine = new GameEngine(createInitialState(), () => 0.99);
    engine.state.items = [
      { ...item('bow', 0, 'bow'), placement: { row: 1, col: 0, rotation: 0 } },
      { ...item('sword'), placement: { row: 0, col: 3, rotation: 0 } },
      { ...item('dagger', 0, 'dagger'), placement: { row: 0, col: 1, rotation: 0 } },
    ];
    engine.state.pets = [pet('fox')];
    engine.state.activePetId = 'fox';
    engine.state.wave = 3;
    engine.state.pauses = [];
    engine.state.battle.remaining = 0.05;
    engine.step(0.05);
    for (const enemy of engine.state.battle.enemies) { enemy.hp = 10000; enemy.maxHp = 10000; }
    const enemyIds = engine.state.battle.enemies.map(enemy => enemy.id);
    expect(engine.currentAction).toEqual({ kind: 'weapon', sourceId: 'dagger' });
    engine.step(0.05);
    expect(engine.state.battle.actionResolved).toBe(true);
    expect(engine.state.battle.actionIndex).toBe(0);
    expect(engine.state.battle.remaining).toBeCloseTo(0.45);
    engine.step(2.95);
    expect(engine.events.filter(event => ['attack', 'pet', 'hurt'].includes(event.type)).map(event => event.source))
      .toEqual(['dagger', 'sword', 'bow', 'fox', ...enemyIds]);
    expect(engine.state.battle.round).toBe(2);
    expect(engine.state.battle.stage).toBe('weapons');
  });

  it('heals only on rounds 3, 6 and 9, then resets the counter for the next wave', () => {
    const engine = new GameEngine(createInitialState(), () => 0.99);
    engine.state.pets = [pet('leaf', 0, 0, 'fairy')];
    engine.state.activePetId = 'leaf';
    engine.state.hero.hp = 40;
    prepareKill(engine, enemy({ hp: 10000, maxHp: 10000 }));
    const healed: { round: number; source: string | undefined }[] = [];
    while (engine.state.battle.round <= 9) {
      const round = engine.state.battle.round;
      engine.step(0.05);
      for (const event of engine.drainEvents()) if (event.type === 'heal' || event.type === 'pet') healed.push({ round, source: event.source });
    }
    expect(healed).toEqual([3, 6, 9].flatMap(round => [{ round, source: 'i3' }, { round, source: 'leaf' }]));
    expect(engine.stats.healPerThreeRounds).toBe(ITEMS.charm.healing + PETS.fairy.power);
    engine.state.battle.enemies[0].hp = 1;
    for (let tick = 0; tick < 30 && engine.state.battle.phase === 'combat'; tick++) engine.step(0.05);
    expect(engine.state.battle.phase).toBe('travel');
    expect(engine.state.battle.round).toBe(1);
    const hp = engine.state.hero.hp;
    engine.step(1);
    expect(engine.state.hero.hp).toBe(hp);
  });

  it('resolves due support after the last enemy dies and skips dead enemy actions before clearing the wave', () => {
    const engine = new GameEngine(createInitialState(), () => 0.99);
    engine.state.pets = [pet('leaf', 0, 0, 'fairy')];
    engine.state.activePetId = 'leaf';
    engine.state.hero.hp = 40;
    prepareKill(engine, enemy({ hp: 10000, maxHp: 10000 }));
    engine.step(2);
    expect(engine.state.battle.round).toBe(3);
    engine.state.battle.enemies[0].hp = 1;
    engine.drainEvents();
    const hp = engine.state.hero.hp;
    engine.step(0.05);
    expect(engine.state.battle.enemies).toHaveLength(0);
    expect(engine.state.battle.phase).toBe('combat');
    engine.step(1.45);
    expect(engine.state.hero.hp).toBeGreaterThan(hp + 25);
    expect(engine.events.map(event => event.type)).toContain('heal');
    expect(engine.events.some(event => event.type === 'pet' && event.target === 'hero')).toBe(true);
    expect(engine.events.some(event => event.type === 'hurt')).toBe(false);
    expect(engine.state.battle.phase).toBe('travel');
    expect(engine.state.wave).toBe(2);
  });

  it('snapshots eligible actions: moving gear cannot replay an action, removed gear skips, new gear waits', () => {
    const engine = organize(() => 0.99);
    expect(engine.placeItem('i4', 2, 3).ok).toBe(true);
    prepareKill(engine, enemy({ hp: 10000, maxHp: 10000 }));
    engine.step(0.05);
    expect(engine.events.filter(event => event.type === 'attack').map(event => event.source)).toEqual(['i1']);
    engine.setPause('organize', true);
    expect(engine.stashItem('i4').ok).toBe(true);
    expect(engine.placeItem('i5', 2, 3).ok).toBe(true);
    expect(engine.placeItem('i1', 0, 4).ok).toBe(true);
    const paused = structuredClone(engine.state.battle);
    engine.step(10);
    expect(engine.state.battle).toEqual(paused);
    engine.setPause('organize', false);
    engine.step(0.95);
    expect(engine.state.battle.round).toBe(2);
    expect(engine.events.filter(event => event.type === 'attack').map(event => event.source)).toEqual(['i1']);
    engine.step(1);
    expect(engine.events.filter(event => event.type === 'attack').map(event => event.source)).toEqual(['i1', 'i1', 'i5']);
  });

  it('switching a spirit mid-round skips the old spirit and waits until the next round for the new one', () => {
    const engine = organize(() => 0.99);
    engine.state.pets = [pet('old'), pet('new')];
    engine.setPet('old');
    prepareKill(engine, enemy({ hp: 10000, maxHp: 10000 }));
    engine.step(0.05);
    engine.setPause('organize', true);
    engine.setPet('new');
    engine.setPause('organize', false);
    engine.step(0.95);
    expect(engine.events.filter(event => event.type === 'pet')).toHaveLength(0);
    engine.step(1);
    expect(engine.events.filter(event => event.type === 'pet').map(event => event.source)).toEqual(['new']);
  });

  it('restores the resolved action and remaining display time without repeating damage or rewards', () => {
    const engine = new GameEngine(createInitialState(), () => 0.99);
    prepareKill(engine, enemy({ hp: 10000, maxHp: 10000 }));
    engine.step(0.2);
    const before = structuredClone(engine.state);
    let saved = '';
    saveGame({ setItem: (_key, value) => { saved = value; } }, engine.state);
    const loaded = loadGame({ getItem: key => key === SAVE_KEY ? saved : null });
    expect(loaded.state).toBeDefined();
    const restored = new GameEngine(loaded.state, () => 0.99);
    expect(restored.state.battle).toEqual(before.battle);
    restored.step(100);
    expect(restored.state.hero.xp).toBe(before.hero.xp);
    restored.setPause('manual', false);
    restored.step(0.3);
    expect(restored.state.battle.enemies[0].hp).toBe(before.battle.enemies[0].hp);
    expect(restored.events.filter(event => event.type === 'attack')).toHaveLength(0);
    restored.step(0.05);
    expect(restored.events.filter(event => event.type === 'hurt')).toHaveLength(1);
  });

  it('resumes a capacity-paused lethal action exactly once, then finishes its wave once', () => {
    const engine = new GameEngine(createInitialState(), () => 0);
    engine.state.items = [engine.state.items[0], ...Array.from({ length: CAPACITY }, (_, index) => item(`full${index}`))];
    prepareKill(engine);
    engine.step(0.05);
    expect(engine.state.pauses).toContain('capacity');
    expect(engine.state.battle.actionResolved).toBe(true);
    const xp = engine.state.hero.xp;
    const drop = engine.state.pending.items[0].id;
    let saved = '';
    saveGame({ setItem: (_key, value) => { saved = value; } }, engine.state);
    const restored = new GameEngine(loadGame({ getItem: key => key === SAVE_KEY ? saved : null }).state, () => 0);
    restored.setPause('organize', true);
    restored.discardItem('full0');
    restored.setPause('organize', false);
    restored.setPause('manual', false);
    restored.step(0.5);
    expect(restored.state.hero.xp).toBe(xp);
    expect(restored.state.items.filter(item => item.id === drop)).toHaveLength(1);
    expect(restored.state.wave).toBe(2);
    expect(restored.events.filter(event => event.type === 'attack')).toHaveLength(0);
  });

  it('uses one unarmed attack per round when no weapon is equipped', () => {
    const engine = new GameEngine(createInitialState(), () => 0.99);
    engine.state.items = [];
    prepareKill(engine, enemy({ hp: 10000, maxHp: 10000 }));
    expect(engine.stats.damagePerRound).toBe(engine.stats.attack);
    engine.step(2);
    expect(engine.events.filter(event => event.type === 'attack').map(event => event.source)).toEqual(['hero', 'hero']);
    expect(engine.state.battle.round).toBe(3);
  });

  it('spawns all 3 × 5 waves, unlocks floors, grants the guaranteed spirit once, then repeats floor 3', () => {
    const engine = new GameEngine(createInitialState(), () => 0.99);
    engine.state.hero.attackPoints = 10000;
    engine.state.pauses = [];
    let bossSeen = false;
    const waves = new Set<string>();
    for (let ticks = 0; ticks < 2000 && engine.state.completedRuns === 0; ticks++) {
      engine.step(0.05);
      if (engine.state.battle.phase === 'combat') waves.add(`${engine.state.floor}:${engine.state.wave}`);
      if (engine.state.battle.enemies.some(enemy => enemy.kind === 'boss')) bossSeen = true;
    }
    expect(waves.size).toBe(15);
    expect(bossSeen).toBe(true);
    expect(engine.state).toMatchObject({ unlockedFloor: 3, floor: 3, wave: 1, completedRuns: 1, firstFloorReward: true });
    expect(engine.state.pets).toHaveLength(1);
    expect(engine.state.pets[0].kind).toBe('wolf');
    expect(engine.changeFloor(1).ok).toBe(true);
    engine.state.wave = 5;
    kill(engine);
    expect(engine.state.pets).toHaveLength(1);
    expect(engine.changeFloor(4).ok).toBe(false);
  });

  it('retains wave-to-wave health, restores health on entry or death retry, and resets the round', () => {
    const engine = new GameEngine(createInitialState(), () => 0.99);
    engine.state.hero.hp = 42;
    kill(engine);
    expect(engine.state.wave).toBe(2);
    expect(engine.state.hero.hp).toBe(42);
    engine.changeFloor(1);
    expect(engine.state.hero.hp).toBe(engine.stats.maxHp);
    engine.state.hero.hp = 1;
    engine.state.wave = 4;
    prepareKill(engine, enemy({ hp: 10000, maxHp: 10000, damage: 1000 }));
    const itemsBefore = engine.state.items.map(item => item.id);
    const heroBefore = { xp: engine.state.hero.xp, level: engine.state.hero.level, points: engine.state.hero.points };
    engine.step(0.55);
    expect(engine.state.battle.phase).toBe('dead');
    expect(engine.state.hero.hp).toBe(0);
    engine.step(2.5);
    expect(engine.state.wave).toBe(1);
    expect(engine.state.battle.round).toBe(1);
    expect(engine.state.battle.phase).toBe('travel');
    expect(engine.state.hero.hp).toBe(engine.stats.maxHp);
    expect(engine.state.items.map(item => item.id)).toEqual(itemsBefore);
    expect(engine.state.hero).toMatchObject(heroBefore);
  });

  it('gives every weapon one action per round and identical results at different frame rates', () => {
    const setup = () => {
      const engine = organize(() => 0.99);
      engine.placeItem('i4', 2, 3);
      prepareKill(engine, enemy({ hp: 10000, maxHp: 10000, damage: 0 }));
      return engine;
    };
    const at20 = setup();
    const at60 = setup();
    for (let i = 0; i < 200; i++) at20.step(1 / 20);
    for (let i = 0; i < 600; i++) at60.step(1 / 60);
    expect(at60.state).toEqual(at20.state);
    const attacks = at20.events.filter(event => event.type === 'attack');
    expect(attacks.filter(event => event.source === 'i1').length).toBe(attacks.filter(event => event.source === 'i4').length);
    expect(attacks.length).toBeGreaterThan(4);
  });

  it('freezes action progress for every pause reason and preserves independent pauses', () => {
    const engine = new GameEngine();
    prepareKill(engine, enemy({ hp: 10000, maxHp: 10000 }));
    engine.step(0.15);
    engine.setPause('organize', true);
    engine.setPause('hidden', true);
    const before = structuredClone(engine.state);
    engine.step(1000);
    expect(engine.state).toEqual(before);
    engine.setPause('hidden', false);
    expect(engine.state.pauses).toEqual(['organize']);
    engine.step(1000);
    expect(engine.state.battle).toEqual(before.battle);
    engine.setPause('organize', false);
    engine.step(0.05);
    expect(engine.state.time).toBeCloseTo(before.time + 0.05);
  });

  it('allows the starter character to clear all floors using only earned upgrades', () => {
    let seed = 761234;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const engine = new GameEngine(createInitialState(), random);
    engine.state.settings.autoItems = { enabled: true, maxQuality: 5 };
    engine.state.settings.autoPets = { enabled: true, maxQuality: 5 };
    let deaths = 0;
    const manageInventory = () => {
      engine.setPause('organize', true);
      while (engine.state.hero.points) engine.spendPoint((engine.state.hero.attackPoints + engine.state.hero.healthPoints) % 4 === 3 ? 'health' : 'attack');
      while (engine.state.items.filter(item => !item.placement).length > 18) {
        const spare = engine.state.items.filter(item => !item.placement).sort((a, b) => a.quality - b.quality)[0];
        engine.discardItem(spare.id);
      }
      for (const equipped of [...engine.state.items].filter(item => item.placement)) engine.stashItem(equipped.id);
      engine.setPet(null);
      engine.retryPending();
      const petChoice = [...engine.state.pets].filter(pet => pet.kind === 'wolf').sort((a, b) => b.quality - a.quality || b.xp - a.xp)[0];
      if (petChoice) engine.setPet(petChoice.id);
      const support = (['shield', 'charm', 'armor'] as const).flatMap(kind => [...engine.state.items].filter(item => item.kind === kind).sort((a, b) => b.quality - a.quality).slice(0, 1));
      const weapons = engine.state.items.filter(item => ITEMS[item.kind].damage > 0).sort((a, b) => {
        const efficiency = (item: Item) => (ITEMS[item.kind].damage * QUALITY_MULTIPLIERS[item.quality] + engine.stats.attack) / ITEMS[item.kind].shape.length;
        return efficiency(b) - efficiency(a);
      });
      for (const candidate of [...support, ...weapons]) {
        let placed = false;
        for (let rotation = 0; rotation < 4 && !placed; rotation++) for (let row = 0; row < 4 && !placed; row++) {
          for (let col = 0; col < 5 && !placed; col++) placed = engine.placeItem(candidate.id, row, col, rotation).ok;
        }
      }
      engine.setPause('organize', false);
      engine.setPause('manual', false);
    };
    manageInventory();
    for (let tick = 0; tick < 20 * 60 * 30 && !engine.state.completedRuns; tick++) {
      engine.step(0.05);
      deaths += engine.drainEvents().filter(event => event.type === 'death').length;
      if (tick % 100 === 0 || engine.state.pauses.includes('capacity')) manageInventory();
    }
    expect(engine.state.completedRuns).toBeGreaterThan(0);
    expect(engine.state.hero.level).toBeGreaterThan(1);
    console.info(`Round starter run: ${engine.state.time.toFixed(1)} s, level ${engine.state.hero.level}, deaths ${deaths}`);
  });

  it('pauses unattended play at capacity and resumes after organizing', () => {
    let seed = 456789;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const engine = new GameEngine(createInitialState(), random);
    engine.setPause('manual', false);
    for (let tick = 0; tick < 20 * 60 * 30 && !engine.state.pauses.includes('capacity'); tick++) engine.step(0.05);
    expect(engine.state.pauses).toContain('capacity');
    expect(engine.state.items.filter(item => !item.placement)).toHaveLength(CAPACITY);
    expect(engine.state.pending.items.length).toBeGreaterThan(0);
    const time = engine.state.time;
    const paused = structuredClone(engine.state);
    engine.step(100);
    expect(engine.state).toEqual(paused);
    engine.setPause('organize', true);
    engine.state.settings.autoItems.enabled = true;
    engine.retryPending();
    expect(engine.state.pending.items).toHaveLength(0);
    expect(engine.state.pauses).not.toContain('capacity');
    engine.setPause('organize', false);
    engine.step(0.05);
    expect(engine.state.time).toBeGreaterThan(time);
    console.info(`Round unattended capacity pause: ${time.toFixed(1)} s, level ${engine.state.hero.level}`);
  });
});
