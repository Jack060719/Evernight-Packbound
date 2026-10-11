import { describe, expect, it } from 'vitest';
import { createInitialState, GameEngine } from '../../src/game/engine';
import type { GameState } from '../../src/game/types';
import {
  createSaveSession, LEGACY_SAVE_KEY, migrateLegacySave, rawBackupKey,
  RAW_BACKUP_PREFIX, SAVE_KEY, SAVE_MIGRATIONS, saveGame,
} from '../../src/save';

// Handwritten snapshots use actual legacy fields, not a v3 factory with a changed version.
const V2_RAW = `{
  "version": 2, "nextId": 10, "time": 43.2, "tickRemainder": 0.02,
  "hero": { "hp": 37, "xp": 630, "level": 7, "points": 1, "attackPoints": 2, "healthPoints": 1 },
  "items": [
    { "id": "i1", "kind": "sword", "quality": 1, "placement": { "row": 0, "col": 0, "rotation": 0 } },
    { "id": "i2", "kind": "shield", "quality": 2, "placement": null }
  ],
  "pets": [{ "id": "p4", "kind": "wolf", "quality": 2, "xp": 120, "level": 3 }],
  "activePetId": "p4",
  "unlockedCells": [
    {"row":0,"col":0},{"row":0,"col":1},{"row":0,"col":2},{"row":0,"col":3},{"row":0,"col":4},
    {"row":1,"col":0},{"row":1,"col":1},{"row":1,"col":2},{"row":1,"col":3},{"row":1,"col":4},
    {"row":2,"col":0},{"row":2,"col":1},{"row":2,"col":2},{"row":2,"col":3},{"row":2,"col":4},
    {"row":3,"col":0},{"row":3,"col":1},{"row":3,"col":2},{"row":3,"col":3},{"row":3,"col":4},{"row":0,"col":5}
  ],
  "floor": 2, "wave": 4, "unlockedFloor": 3,
  "battle": {
    "phase": "combat", "round": 3, "stage": "weapons", "remaining": 0.25,
    "enemies": [{"id":"e9","kind":"slime","name":"露珠史萊姆","hp":12,"maxHp":60,"damage":8,"xp":24}],
    "actions": [{"kind":"weapon","sourceId":"i1"},{"kind":"pet","sourceId":"p4"},{"kind":"enemy","sourceId":"e9"}],
    "actionIndex": 0, "actionResolved": true
  },
  "pending": {
    "items": [{ "id": "i3", "kind": "bow", "quality": 2, "placement": null }],
    "pets": [{ "id": "p5", "kind": "fairy", "quality": 1, "xp": 30, "level": 2 }]
  },
  "firstFloorReward": true, "completedRuns": 2, "pauses": ["manual"],
  "settings": {"autoItems":{"enabled":true,"maxQuality":3},"autoPets":{"enabled":false,"maxQuality":2},"musicVolume":0.31,"soundVolume":0.5,"musicMuted":false,"soundMuted":true},
  "log": ["原始記錄"], "archivedNote": "保留 空白與未知展示文字"
}`;

const V1_RAW = `{
 "version": 1, "nextId": 10, "time": 43.2, "tickRemainder": 0.02,
 "hero": {"hp":37,"xp":630,"level":7,"points":1,"attackPoints":2,"healthPoints":1},
 "items": [{"id":"i1","kind":"sword","quality":1,"cooldown":0.65,"placement":{"row":0,"col":0,"rotation":0}}],
 "pets": [{"id":"p4","kind":"wolf","quality":2,"xp":120,"level":3,"cooldown":0.75}],
 "activePetId":"p4", "unlockedCells":[
  {"row":0,"col":0},{"row":0,"col":1},{"row":0,"col":2},{"row":0,"col":3},{"row":0,"col":4},
  {"row":1,"col":0},{"row":1,"col":1},{"row":1,"col":2},{"row":1,"col":3},{"row":1,"col":4},
  {"row":2,"col":0},{"row":2,"col":1},{"row":2,"col":2},{"row":2,"col":3},{"row":2,"col":4},
  {"row":3,"col":0},{"row":3,"col":1},{"row":3,"col":2},{"row":3,"col":3},{"row":3,"col":4},{"row":0,"col":5}
 ],
 "floor":2,"wave":4,"unlockedFloor":3,
 "battle":{"phase":"combat","remaining":0,"unarmedCooldown":0.5,"enemies":[{"id":"e9","kind":"slime","name":"舊敵人","hp":12,"maxHp":60,"damage":8,"interval":2.4,"cooldown":0.2,"xp":24}]},
 "pending":{"items":[{"id":"i3","kind":"bow","quality":2,"placement":null,"cooldown":0}],"pets":[{"id":"p5","kind":"fairy","quality":1,"xp":30,"level":2,"cooldown":0}]},
 "firstFloorReward":true,"completedRuns":2,"pauses":["hidden","capacity"],
 "settings":{"autoItems":{"enabled":true,"maxQuality":3},"autoPets":{"enabled":false,"maxQuality":2},"musicVolume":0.31,"soundVolume":0.5,"musicMuted":false,"soundMuted":true},
 "log":["秒制原始記錄"], "archivedNote":"舊版 原文"
}`;

function memoryStorage(entries: [string, string][] = []) {
  const data = new Map(entries);
  const writes: [string, string][] = [];
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push([key, value]); data.set(key, value); },
  };
  return { data, writes, storage };
}

const invalidNumbers: { name: string; change: (state: GameState) => void }[] = [
  { name: 'existing i1 with nextId 1', change: state => { state.nextId = 1; } },
  { name: 'pending item counter', change: state => { state.pending.items[0].id = 'i10'; } },
  { name: 'owned pet counter', change: state => { state.pets[0].id = 'p10'; state.activePetId = 'p10'; } },
  { name: 'pending pet counter', change: state => { state.pending.pets[0].id = 'p10'; } },
  { name: 'enemy counter', change: state => { state.nextId = 9; } },
  { name: 'unsafe generated ID', change: state => { state.items[0].id = 'i9007199254740992'; } },
  { name: 'unsafe nextId', change: state => { state.nextId = Number.MAX_SAFE_INTEGER + 1; } },
  { name: 'fractional nextId', change: state => { state.nextId = 10.5; } },
  { name: 'fractional points', change: state => { state.hero.points = 0.5; } },
  { name: 'unsafe points', change: state => { state.hero.points = Number.MAX_SAFE_INTEGER + 1; } },
  { name: 'negative points', change: state => { state.hero.points = -1; } },
  { name: 'fractional attack points', change: state => { state.hero.attackPoints = 1.5; } },
  { name: 'unsafe health points', change: state => { state.hero.healthPoints = Number.MAX_SAFE_INTEGER + 1; } },
  { name: 'fractional hero XP', change: state => { state.hero.xp = 630.5; } },
  { name: 'unsafe hero XP', change: state => { state.hero.xp = Number.MAX_SAFE_INTEGER + 1; } },
  { name: 'zero hero level', change: state => { state.hero.level = 0; } },
  { name: 'fractional pet XP', change: state => { state.pets[0].xp = 120.5; } },
  { name: 'unsafe pending pet XP', change: state => { state.pending.pets[0].xp = Number.MAX_SAFE_INTEGER + 1; } },
  { name: 'zero pet level', change: state => { state.pets[0].level = 0; } },
  { name: 'fractional completed runs', change: state => { state.completedRuns = 0.5; } },
  { name: 'unsafe round', change: state => { state.battle.round = Number.MAX_SAFE_INTEGER + 1; } },
  { name: 'negative elapsed time', change: state => { state.time = -0.1; } },
  { name: 'negative tick remainder', change: state => { state.tickRemainder = -0.01; } },
  { name: 'unprocessed full tick', change: state => { state.tickRemainder = 0.05; } },
  { name: 'negative action time', change: state => { state.battle.remaining = -0.1; } },
  { name: 'action time above duration', change: state => { state.battle.remaining = 0.6; } },
  { name: 'negative hero HP', change: state => { state.hero.hp = -0.1; } },
  { name: 'hero HP above maximum', change: state => { state.hero.hp = 10000; } },
  { name: 'enemy HP above maximum', change: state => { state.battle.enemies[0].hp = 61; } },
  { name: 'zero enemy maximum HP', change: state => { state.battle.enemies[0].maxHp = 0; } },
  { name: 'negative enemy damage', change: state => { state.battle.enemies[0].damage = -1; } },
  { name: 'fractional enemy XP', change: state => { state.battle.enemies[0].xp = 0.5; } },
  { name: 'volume above one', change: state => { state.settings.musicVolume = 1.01; } },
  { name: 'negative volume', change: state => { state.settings.soundVolume = -0.01; } },
];

describe('Task 04 save validation repair', () => {
  it.each(invalidNumbers)('preserves invalid raw and locks load and later saves: $name', ({ change }) => {
    const state: GameState = JSON.parse(V2_RAW);
    change(state);
    const raw = JSON.stringify(state);
    const memory = memoryStorage([[SAVE_KEY, raw]]);
    const session = createSaveSession(memory.storage);
    expect(session.loaded.state).toBeUndefined();
    expect(session.blocked).toBe(true);
    expect(session.save(state)).toBe(false);
    expect(session.save(createInitialState())).toBe(false);
    expect(session.exportRaw()).toBe(raw);
    expect(memory.writes).toEqual([]);
  });

  it.each(invalidNumbers)('rejects a newly invalid runtime snapshot before any write: $name', ({ change }) => {
    const memory = memoryStorage([[SAVE_KEY, V2_RAW]]);
    const session = createSaveSession(memory.storage);
    const state = session.loaded.state!;
    change(state);
    const before = structuredClone(state);
    expect(session.save(state)).toBe(false);
    expect(session.blocked).toBe(true);
    expect(saveGame(memory.storage, state)).toBe(false);
    expect(state).toEqual(before);
    expect(memory.data.get(SAVE_KEY)).toBe(V2_RAW);
    expect(memory.writes).toEqual([]);
  });

  it('checks the shared generated counter for v1 too, without repairing it', () => {
    const raw = V1_RAW.replace('"nextId": 10', '"nextId": 1');
    const memory = memoryStorage([[LEGACY_SAVE_KEY, raw]]);
    const session = createSaveSession(memory.storage);
    expect(session.blocked).toBe(true);
    expect(session.save(createInitialState())).toBe(false);
    expect(session.exportRaw()).toBe(raw);
    expect(memory.writes).toEqual([]);
  });

  it('reproduces duplicate i1 from a corrupted runtime counter and refuses to save it after a valid checkpoint', () => {
    const memory = memoryStorage([[SAVE_KEY, V2_RAW]]);
    const session = createSaveSession(memory.storage);
    const engine = new GameEngine(session.loaded.state!, () => 0);
    expect(session.save(engine.state)).toBe(true);
    const saved = memory.data.get(SAVE_KEY);
    const writes = memory.writes.length;
    engine.state.nextId = 1;
    engine.state.battle.actionResolved = false;
    engine.state.battle.enemies[0].hp = 1;
    engine.setPause('manual', false);
    engine.step(0.5);
    expect([...engine.state.items, ...engine.state.pending.items].filter(item => item.id === 'i1')).toHaveLength(2);
    expect(session.save(engine.state)).toBe(false);
    expect(session.blocked).toBe(true);
    expect(session.save(createInitialState())).toBe(false);
    expect(memory.data.get(SAVE_KEY)).toBe(saved);
    expect(memory.writes).toHaveLength(writes);
    expect(memory.data.get(rawBackupKey(SAVE_KEY, V2_RAW))).toBe(V2_RAW);
  });

  it('preserves legal decimal combat values and non-generated legacy IDs exactly', () => {
    const state: GameState = JSON.parse(V2_RAW);
    state.time = 12.345;
    state.tickRemainder = 0.031;
    state.battle.remaining = 0.25;
    state.hero.hp = 37.125;
    state.battle.enemies[0].hp = 12.25;
    state.battle.enemies[0].damage = 8.25;
    state.pending.items[0].id = 'legacy-item-99999999999999999999';
    const raw = JSON.stringify(state);
    const memory = memoryStorage([[SAVE_KEY, raw]]);
    const session = createSaveSession(memory.storage);
    expect(session.loaded.state).toEqual(state);
    expect(session.save(session.loaded.state!)).toBe(true);
    expect(createSaveSession(memory.storage).loaded.state).toEqual(state);
    expect(memory.data.get(rawBackupKey(SAVE_KEY, raw))).toBe(raw);
  });
});

describe('Task 04 protected legacy save bridge', () => {
  it('backs up original v1 and v2 byte-for-byte before the first write, without archiving every checkpoint', () => {
    const memory = memoryStorage([[SAVE_KEY, V2_RAW], [LEGACY_SAVE_KEY, V1_RAW]]);
    const session = createSaveSession(memory.storage);
    const state = session.loaded.state!;
    expect(state).toEqual(JSON.parse(V2_RAW));
    expect(session.blocked).toBe(false);
    expect(memory.writes).toHaveLength(0);
    state.hero.hp = 36;
    expect(session.save(state)).toBe(true);
    state.hero.hp = 35;
    expect(session.save(state)).toBe(true);
    expect(memory.data.get(rawBackupKey(SAVE_KEY, V2_RAW))).toBe(V2_RAW);
    expect(memory.data.get(rawBackupKey(LEGACY_SAVE_KEY, V1_RAW))).toBe(V1_RAW);
    expect(memory.data.get(LEGACY_SAVE_KEY)).toBe(V1_RAW);
    expect(memory.writes.filter(([key]) => key.startsWith(RAW_BACKUP_PREFIX))).toHaveLength(2);
    const restored = createSaveSession(memory.storage).loaded.state!;
    expect(restored.hero.hp).toBe(35);
    expect(restored.hero.xp).toBe(630);
    expect(restored.items).toEqual(state.items);
    expect(restored.pets).toEqual(state.pets);
    expect(restored.pending).toEqual(state.pending);
    expect(restored.battle).toEqual(state.battle);
  });

  it('keeps the existing 1→2 conversion and permanent identities; no 2→3 migration is installed', () => {
    const memory = memoryStorage([[LEGACY_SAVE_KEY, V1_RAW]]);
    const session = createSaveSession(memory.storage);
    const state = session.loaded.state!;
    expect(SAVE_MIGRATIONS.map(({ from, to }) => [from, to])).toEqual([[1, 2]]);
    expect(state).toMatchObject({ version: 2, floor: 2, wave: 1, firstFloorReward: true, completedRuns: 2, activePetId: 'p4' });
    expect(state.hero).toMatchObject({ xp: 630, level: 7, points: 1, attackPoints: 2, healthPoints: 1 });
    expect(state.items.map(item => item.id)).toEqual(['i1']);
    expect(state.pets[0]).toEqual({ id: 'p4', kind: 'wolf', quality: 2, xp: 120, level: 3 });
    expect(state.pending.items.map(item => item.id)).toEqual(['i3']);
    expect(state.pending.pets.map(pet => pet.id)).toEqual(['p5']);
    expect(session.save(state)).toBe(true);
    expect(memory.data.get(LEGACY_SAVE_KEY)).toBe(V1_RAW);
    expect(memory.data.get(rawBackupKey(LEGACY_SAVE_KEY, V1_RAW))).toBe(V1_RAW);
    const before = JSON.stringify(state);
    expect(migrateLegacySave(state, 3)).toBeUndefined();
    expect(JSON.stringify(state)).toBe(before);
    expect(createSaveSession(memory.storage).loaded.migration).toBeUndefined();
  });

  it.each(['', '{broken', 'null', '{"version":999}', '{"version":3}'])('locks malformed or future current %j without falling back to v1', raw => {
    const memory = memoryStorage([[SAVE_KEY, raw], [LEGACY_SAVE_KEY, V1_RAW]]);
    const session = createSaveSession(memory.storage);
    expect(session.loaded.state).toBeUndefined();
    expect(session.blocked).toBe(true);
    // Start, periodic and pagehide callers all reach the same locked save function.
    for (let attempt = 0; attempt < 3; attempt++) expect(session.save(createInitialState())).toBe(false);
    expect(memory.writes).toHaveLength(0);
    expect(session.exportRaw()).toBe(raw);
    expect(session.exportRaw(LEGACY_SAVE_KEY)).toBe(V1_RAW);
  });

  it.each([
    [SAVE_KEY, V1_RAW],
    [LEGACY_SAVE_KEY, V2_RAW],
  ])('rejects a snapshot whose schema does not match source %s', (sourceKey, raw) => {
    const memory = memoryStorage([[sourceKey, raw]]);
    const session = createSaveSession(memory.storage);
    expect(session.loaded.state).toBeUndefined();
    expect(session.blocked).toBe(true);
    expect(session.save(createInitialState())).toBe(false);
    expect(memory.data.get(sourceKey)).toBe(raw);
    expect(memory.writes).toHaveLength(0);
  });

  it.each([
    [SAVE_KEY, V1_RAW],
    [LEGACY_SAVE_KEY, V2_RAW],
  ] as const)('rejects a backup with mismatched schema and source %s without changing current', (sourceKey, raw) => {
    const key = rawBackupKey(sourceKey, raw);
    const memory = memoryStorage([[SAVE_KEY, '{damaged'], [key, raw]]);
    const session = createSaveSession(memory.storage);
    expect(session.restoreBackup(key)).toBeUndefined();
    expect(session.blocked).toBe(true);
    expect(memory.data.get(SAVE_KEY)).toBe('{damaged');
    expect(memory.data.get(key)).toBe(raw);
    expect(memory.writes).toHaveLength(0);
  });

  it.each(['duplicate-item', 'duplicate-pet', 'missing-pet', 'negative-resource', 'duplicate-cell'])('rejects damaged ownership: %s', defect => {
    const state = JSON.parse(V2_RAW);
    if (defect === 'duplicate-item') state.pending.items[0].id = 'i1';
    if (defect === 'duplicate-pet') state.pending.pets[0].id = 'p4';
    if (defect === 'missing-pet') state.activePetId = 'missing';
    if (defect === 'negative-resource') state.hero.points = -1;
    if (defect === 'duplicate-cell') state.unlockedCells.push(state.unlockedCells[0]);
    const memory = memoryStorage([[SAVE_KEY, JSON.stringify(state)]]);
    const session = createSaveSession(memory.storage);
    expect(session.blocked).toBe(true);
    expect(session.save(createInitialState())).toBe(false);
    expect(memory.writes).toHaveLength(0);
  });

  it.each(['quota', 'collision', 'readback'])('does not replace current when its original backup fails: %s', failure => {
    const memory = memoryStorage([[SAVE_KEY, V2_RAW]]);
    const backupKey = rawBackupKey(SAVE_KEY, V2_RAW);
    if (failure === 'collision') memory.data.set(backupKey, 'different original');
    const session = createSaveSession({
      getItem: key => failure === 'readback' && key === backupKey && memory.data.has(key) ? 'bad readback' : memory.storage.getItem(key),
      setItem: (key, value) => {
        if (failure === 'quota' && key === backupKey) throw new Error('Quota');
        memory.storage.setItem(key, value);
      },
    });
    expect(session.save(session.loaded.state!)).toBe(false);
    expect(session.blocked).toBe(true);
    expect(memory.data.get(SAVE_KEY)).toBe(V2_RAW);
    expect(memory.writes.filter(([key]) => key === SAVE_KEY)).toHaveLength(0);
    if (failure === 'collision') expect(memory.data.get(backupKey)).toBe('different original');
  });

  it.each(['before-backup', 'during-backup'])('detects a changed source %s and does not overwrite it', timing => {
    const memory = memoryStorage([[SAVE_KEY, V2_RAW]]);
    const newer = V2_RAW.replace('43.2', '44.2');
    const session = createSaveSession({
      getItem: memory.storage.getItem,
      setItem: (key, value) => {
        memory.storage.setItem(key, value);
        if (timing === 'during-backup' && key.startsWith(RAW_BACKUP_PREFIX)) memory.data.set(SAVE_KEY, newer);
      },
    });
    if (timing === 'before-backup') memory.data.set(SAVE_KEY, newer);
    expect(session.save(session.loaded.state!)).toBe(false);
    expect(session.blocked).toBe(true);
    expect(memory.data.get(SAVE_KEY)).toBe(newer);
    expect(memory.writes.filter(([key]) => key === SAVE_KEY)).toHaveLength(0);
  });

  it('locks a failed ordinary current write without changing the supplied runtime snapshot or saved raw', () => {
    const memory = memoryStorage([[SAVE_KEY, V2_RAW]]);
    const session = createSaveSession({
      getItem: memory.storage.getItem,
      setItem: (key, value) => { if (key === SAVE_KEY) throw new Error('Quota'); memory.storage.setItem(key, value); },
    });
    const state = session.loaded.state!;
    state.hero.hp = 36;
    const before = structuredClone(state);
    expect(session.save(state)).toBe(false);
    expect(state).toEqual(before);
    expect(session.blocked).toBe(true);
    expect(memory.data.get(SAVE_KEY)).toBe(V2_RAW);
    expect(memory.data.get(rawBackupKey(SAVE_KEY, V2_RAW))).toBe(V2_RAW);
    expect(memory.writes.filter(([key]) => key === SAVE_KEY)).toHaveLength(0);
    expect(session.save(state)).toBe(false);
    expect(state).toEqual(before);
  });

  it('explicitly restores a valid backup only after preserving the damaged current raw', () => {
    const backupKey = rawBackupKey(SAVE_KEY, V2_RAW);
    const damaged = '{damaged current';
    const memory = memoryStorage([[SAVE_KEY, damaged], [backupKey, V2_RAW]]);
    const session = createSaveSession(memory.storage);
    expect(session.blocked).toBe(true);
    expect(session.restoreBackup(SAVE_KEY)).toBeUndefined();
    expect(memory.writes).toHaveLength(0);
    const restored = session.restoreBackup(backupKey)!;
    expect(restored.state).toEqual(JSON.parse(V2_RAW));
    expect(restored.state!.pauses).toContain('manual');
    expect(session.blocked).toBe(false);
    expect(memory.writes[0]).toEqual([rawBackupKey(SAVE_KEY, damaged), damaged]);
    expect(session.exportRaw(rawBackupKey(SAVE_KEY, damaged))).toBe(damaged);
    expect(session.exportRaw(backupKey)).toBe(V2_RAW);
    expect(session.save(restored.state!)).toBe(true);
  });

  it('keeps recovery locked and original raw intact when the replacement write fails', () => {
    const backupKey = rawBackupKey(SAVE_KEY, V2_RAW);
    const memory = memoryStorage([[SAVE_KEY, '{damaged'], [backupKey, V2_RAW]]);
    const session = createSaveSession({
      getItem: memory.storage.getItem,
      setItem: (key, value) => { if (key === SAVE_KEY) throw new Error('Quota'); memory.storage.setItem(key, value); },
    });
    expect(session.restoreBackup(backupKey)).toBeUndefined();
    expect(session.blocked).toBe(true);
    expect(memory.data.get(SAVE_KEY)).toBe('{damaged');
    expect(memory.data.get(rawBackupKey(SAVE_KEY, '{damaged'))).toBe('{damaged');
  });

  it('starts a new prototype only when both source keys are absent, and locks inaccessible storage', () => {
    const memory = memoryStorage();
    const session = createSaveSession(memory.storage);
    expect(session.loaded).toEqual({});
    expect(session.save(createInitialState())).toBe(true);
    const inaccessible = createSaveSession({
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('must not write'); },
    });
    expect(inaccessible.blocked).toBe(true);
    expect(inaccessible.save(createInitialState())).toBe(false);
  });
});
