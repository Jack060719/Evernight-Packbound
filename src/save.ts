import { createInitialState, GameEngine } from './game/engine';
import { CAPACITY, COLS, ITEMS, ROWS, rotateShape } from './game/content';
import type { BattleAction, GameState, Item, Pet, Placement } from './game/types';

export const SAVE_KEY = 'evernight-packbound-v2';
export const LEGACY_SAVE_KEY = 'evernight-packbound-v1';
export const MIGRATION_MESSAGE = '已保留舊版角色、裝備、靈寵與待領物品，並更新為回合戰鬥；本層從第一波滿血重新開始。';
export const PLACEMENT_REPAIR_MESSAGE = '裝備占格已更新，衝突位置已重新安置；放不下的裝備已完整保留於待整理區或待領區，戰鬥進度不變。';
export const RAW_BACKUP_PREFIX = 'evernight-packbound-backup:';
export type LoadResult = { state?: GameState; message?: string; migration?: string };
type LegacySaveKey = typeof SAVE_KEY | typeof LEGACY_SAVE_KEY;

const numberBetween = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
const integerBetween = (value: number, min: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const qualityValid = (quality: number) => integerBetween(quality, 0, 5);
const validItem = (item: Item) => !!item && typeof item.id === 'string'
  && ['sword', 'dagger', 'bow', 'staff', 'armor', 'shield', 'ring', 'charm'].includes(item.kind)
  && qualityValid(item.quality)
  && (item.placement === null || (!!item.placement && integerBetween(item.placement.row, 0, 5)
    && integerBetween(item.placement.col, 0, 7) && integerBetween(item.placement.rotation, 0, 3)));
const validPet = (pet: Pet) => !!pet && typeof pet.id === 'string'
  && ['wolf', 'fairy'].includes(pet.kind) && qualityValid(pet.quality)
  && integerBetween(pet.xp, 0) && integerBetween(pet.level, 1);
const validAction = (action: BattleAction) => !!action && ['weapon', 'unarmed', 'charm', 'pet', 'enemy'].includes(action.kind)
  && typeof action.sourceId === 'string';

function validOwnership(state: GameState): boolean {
  const entities = [...state.items, ...state.pending.items, ...state.pets, ...state.pending.pets, ...state.battle.enemies];
  const ids = entities.map(entity => entity.id);
  return ids.every(id => id.length > 0) && new Set(ids).size === ids.length
    && (state.activePetId === null || state.pets.some(pet => pet.id === state.activePetId))
    && new Set(state.unlockedCells.map(cell => `${cell.row},${cell.col}`)).size === state.unlockedCells.length
    && integerBetween(state.nextId, 1)
    // All three prototype generators share nextId; preserve other legacy ID strings as-is.
    && ids.every(id => {
      const generated = /^[ipe]([1-9]\d*)$/.exec(id);
      return !generated || integerBetween(Number(generated[1]), 1, state.nextId - 1);
    });
}

// Both versions share permanent progression; only their combat clocks differ.
function isCommonState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as GameState;
  return numberBetween(state.time, 0, Number.MAX_SAFE_INTEGER)
    && numberBetween(state.tickRemainder, 0, 0.05) && state.tickRemainder < 0.05
    && integerBetween(state.completedRuns, 0)
    && integerBetween(state.floor, 1, 3) && integerBetween(state.wave, 1, 5) && integerBetween(state.unlockedFloor, state.floor, 3)
    && !!state.hero && numberBetween(state.hero.hp, 0, Number.MAX_SAFE_INTEGER) && integerBetween(state.hero.level, 1)
    && [state.hero.xp, state.hero.points, state.hero.attackPoints, state.hero.healthPoints].every(value => integerBetween(value, 0))
    && Array.isArray(state.items) && state.items.every(validItem)
    && Array.isArray(state.pets) && state.pets.every(validPet)
    && Array.isArray(state.unlockedCells) && state.unlockedCells.every(cell => !!cell && integerBetween(cell.row, 0, 5) && integerBetween(cell.col, 0, 7))
    && !!state.battle && ['travel', 'combat', 'dead'].includes(state.battle.phase)
    && numberBetween(state.battle.remaining, 0, 2.5)
    && Array.isArray(state.battle.enemies) && state.battle.enemies.every(enemy => !!enemy && typeof enemy.id === 'string'
      && ['skeleton', 'slime', 'boss'].includes(enemy.kind)
      && numberBetween(enemy.maxHp, 0, Number.MAX_SAFE_INTEGER) && enemy.maxHp > 0
      && numberBetween(enemy.hp, 0, enemy.maxHp) && numberBetween(enemy.damage, 0, Number.MAX_SAFE_INTEGER)
      && integerBetween(enemy.xp, 0))
    && !!state.pending && Array.isArray(state.pending.items) && state.pending.items.every(validItem)
    && Array.isArray(state.pending.pets) && state.pending.pets.every(validPet)
    && Array.isArray(state.pauses) && state.pauses.every(pause => ['manual', 'organize', 'capacity', 'hidden'].includes(pause))
    && Array.isArray(state.log) && state.log.every(line => typeof line === 'string')
    && typeof state.firstFloorReward === 'boolean' && (state.activePetId === null || typeof state.activePetId === 'string')
    && !!state.settings && !!state.settings.autoItems && !!state.settings.autoPets
    && [state.settings.autoItems, state.settings.autoPets].every(auto => typeof auto.enabled === 'boolean' && integerBetween(auto.maxQuality, 1, 5))
    && numberBetween(state.settings.musicVolume, 0, 1) && numberBetween(state.settings.soundVolume, 0, 1)
    && typeof state.settings.musicMuted === 'boolean' && typeof state.settings.soundMuted === 'boolean'
    && validOwnership(state)
    && state.hero.hp <= new GameEngine(state).stats.maxHp;
}

function isState(value: unknown): value is GameState {
  if (!isCommonState(value) || value.version !== 2) return false;
  const battle = value.battle;
  return integerBetween(battle.round, 1)
    && battle.remaining <= (battle.phase === 'combat' ? 0.5 : battle.phase === 'travel' ? 2 : 2.5)
    && ['weapons', 'support', 'enemies'].includes(battle.stage)
    && Array.isArray(battle.actions) && battle.actions.every(validAction)
    && integerBetween(battle.actionIndex, 0, Math.max(0, battle.actions.length - 1))
    && typeof battle.actionResolved === 'boolean'
    && (battle.phase !== 'combat' || battle.actions.length > 0);
}

function migrateV1(value: unknown): GameState | undefined {
  if (!isCommonState(value) || (value as { version: number }).version !== 1) return;
  const state: GameState = { ...value, version: 2, tickRemainder: 0, wave: 1, battle: createInitialState().battle };
  // Old attack cooldowns cannot map to a partly completed round. Restart this
  // floor's encounter, retaining every permanent reward and pending drop.
  const convertItem = (item: Item): Item => ({ id: item.id, kind: item.kind, quality: item.quality, placement: item.placement });
  const convertPet = (pet: Pet): Pet => ({ id: pet.id, kind: pet.kind, quality: pet.quality, xp: pet.xp, level: pet.level });
  state.items = value.items.map(convertItem);
  state.pets = value.pets.map(convertPet);
  state.pending = { items: value.pending.items.map(convertItem), pets: value.pending.pets.map(convertPet) };
  state.hero = { ...value.hero, hp: new GameEngine(state).stats.maxHp };
  state.log = [MIGRATION_MESSAGE, ...state.log].slice(0, 30);
  return state;
}

// Only the playable prototype migration is installed. Task 14 owns v3 migration.
export const SAVE_MIGRATIONS = [{ from: 1, to: 2, migrate: migrateV1 }] as const;

export function migrateLegacySave(value: unknown, targetVersion: 2 | 3): GameState | undefined {
  const version = (value as { version?: number } | null)?.version;
  if (targetVersion === 2 && version === 2) return isState(value) ? value : undefined;
  const migration = SAVE_MIGRATIONS.find(step => step.from === version && step.to === targetVersion);
  return migration?.migrate(value);
}

function repairPlacements(state: GameState): boolean {
  const open = new Set(state.unlockedCells.map(cell => `${cell.row},${cell.col}`));
  const occupied = new Set<string>();
  const cellsFor = (item: Item, placement: Placement) => rotateShape(ITEMS[item.kind].shape, placement.rotation)
    .map(cell => `${cell.row + placement.row},${cell.col + placement.col}`);
  const fits = (item: Item, placement: Placement) => cellsFor(item, placement).every(cell => open.has(cell) && !occupied.has(cell));
  const reserve = (item: Item) => cellsFor(item, item.placement!).forEach(cell => occupied.add(cell));
  const changedShape = (item: Item) => item.kind === 'shield' || item.kind === 'staff';
  const equipped = state.items.filter(item => item.placement);
  const displaced: Item[] = [];
  // Keep unaffected equipment first, and every already-valid changed shape,
  // before searching for replacement positions for the conflicting items.
  for (const item of [...equipped.filter(item => !changedShape(item)), ...equipped.filter(changedShape)]) {
    if (fits(item, item.placement!)) reserve(item);
    else displaced.push(item);
  }
  let stashCount = state.items.filter(item => !item.placement).length;
  for (const item of displaced) {
    const previous = item.placement!;
    item.placement = null;
    const rotations = [previous.rotation, ...[0, 1, 2, 3].filter(rotation => rotation !== previous.rotation)];
    for (const rotation of rotations) {
      for (let row = 0; row < ROWS && !item.placement; row++) for (let col = 0; col < COLS && !item.placement; col++) {
        const placement = { row, col, rotation };
        if (fits(item, placement)) item.placement = placement;
      }
      if (item.placement) break;
    }
    if (item.placement) reserve(item);
    else if (stashCount < CAPACITY) stashCount++;
    else {
      state.items = state.items.filter(value => value.id !== item.id);
      state.pending.items.push(item);
      if (!state.pauses.includes('capacity')) state.pauses.push('capacity');
    }
  }
  if (!displaced.length) return false;
  state.hero.hp = Math.min(state.hero.hp, new GameEngine(state).stats.maxHp);
  state.log = [PLACEMENT_REPAIR_MESSAGE, ...state.log].slice(0, 30);
  return true;
}

export function loadGame(storage: Pick<Storage, 'getItem'>): LoadResult {
  try {
    const current = storage.getItem(SAVE_KEY);
    const raw = current ?? storage.getItem(LEGACY_SAVE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    const legacy = current === null;
    const state = legacy
      ? (parsed as { version?: number } | null)?.version === 1 ? migrateLegacySave(parsed, 2) : undefined
      : isState(parsed) ? parsed : undefined;
    if (!state) return { message: '存檔格式無法讀取，已停止寫入並保留原文；請先恢復有效備份。' };
    const repaired = repairPlacements(state);
    state.pauses = state.pauses.filter(reason => reason !== 'hidden');
    if (!state.pauses.includes('manual')) state.pauses.push('manual');
    const migration = [legacy ? MIGRATION_MESSAGE : '', repaired ? PLACEMENT_REPAIR_MESSAGE : ''].filter(Boolean).join(' ');
    return { state, ...(migration ? { migration } : {}) };
  } catch {
    return { message: '無法讀取本機存檔。請確認瀏覽器允許儲存遊戲資料。' };
  }
}

/** FNV-1a over UTF-8 is an index, not proof of equality: backups compare raw text too. */
export function rawBackupKey(sourceKey: LegacySaveKey, raw: string): string {
  let digest = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(raw)) digest = Math.imul(digest ^ byte, 0x01000193) >>> 0;
  return `${RAW_BACKUP_PREFIX}${sourceKey}:fnv1a32-utf8-v1:${digest.toString(16).padStart(8, '0')}`;
}

/** Local v2 safety bridge; this is not the future atomic IndexedDB committer. */
export function createSaveSession(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const sourceKeys = [SAVE_KEY, LEGACY_SAVE_KEY] as const;
  const expected = new Map<LegacySaveKey, string | null>();
  let loaded: LoadResult;
  try {
    for (const key of sourceKeys) expected.set(key, storage.getItem(key));
    loaded = loadGame({ getItem: key => expected.get(key as LegacySaveKey) ?? null });
  } catch {
    loaded = { message: '無法讀取本機存檔，已停止寫入。請確認瀏覽器允許儲存遊戲資料。' };
  }
  const originals = new Map(expected);
  let message = loaded.message;
  let backedUp = false;

  const fail = (reason: string) => { message = reason; return false; };
  function unchanged() {
    return sourceKeys.every(key => expected.has(key) && storage.getItem(key) === expected.get(key));
  }
  function backup(sources: ReadonlyMap<LegacySaveKey, string | null>) {
    for (const [key, raw] of sources) {
      if (raw === null) continue;
      const backupKey = rawBackupKey(key, raw);
      const previous = storage.getItem(backupKey);
      if (previous !== null && previous !== raw) throw new Error('backup conflict');
      if (previous === null) storage.setItem(backupKey, raw);
      if (storage.getItem(backupKey) !== raw) throw new Error('backup verification failed');
    }
  }
  function write(state: GameState) {
    const raw = JSON.stringify(state);
    storage.setItem(SAVE_KEY, raw);
    expected.set(SAVE_KEY, raw);
  }

  return {
    get loaded() { return loaded; },
    get blocked() { return message !== undefined; },
    get message() { return message; },
    save(state: GameState): boolean {
      if (message) return false;
      try {
        if (!isState(state)) return fail('存檔資料驗證失敗，已停止寫入並保留原文；請恢復有效進度。');
        if (!unchanged()) return fail('存檔已在其他頁面變更，已停止寫入；請重新載入最新進度。');
        if (!backedUp) { backup(originals); backedUp = true; }
        // A backup write can dispatch external storage activity. Check again before replacing current.
        if (!unchanged()) return fail('存檔來源已變更，已停止寫入；請重新載入最新進度。');
        write(state);
        return true;
      } catch {
        return fail('無法安全備份或儲存進度，已停止寫入並保留原有存檔。');
      }
    },
    exportRaw(key: string = expected.get(SAVE_KEY) !== null ? SAVE_KEY : LEGACY_SAVE_KEY): string | null {
      if (!sourceKeys.includes(key as LegacySaveKey) && !key.startsWith(RAW_BACKUP_PREFIX)) return null;
      try { return storage.getItem(key); } catch { return null; }
    },
    // Explicit recovery only. The caller must replace its engine state with the returned paused snapshot.
    restoreBackup(key: string): LoadResult | undefined {
      if (!key.startsWith(RAW_BACKUP_PREFIX)) return;
      try {
        const raw = storage.getItem(key);
        if (raw === null) return;
        const sourceKey = key.startsWith(`${RAW_BACKUP_PREFIX}${LEGACY_SAVE_KEY}:`) ? LEGACY_SAVE_KEY : SAVE_KEY;
        if (rawBackupKey(sourceKey, raw) !== key) return;
        const restored = loadGame({ getItem: requested => requested === sourceKey ? raw : null });
        if (!restored.state) return;
        if (!unchanged()) { fail('存檔已在其他頁面變更，恢復已停止；請重新載入。'); return; }
        backup(expected);
        if (!unchanged()) { fail('存檔來源已變更，恢復已停止；請重新載入。'); return; }
        write(restored.state);
        loaded = restored;
        message = undefined;
        backedUp = true;
        return restored;
      } catch {
        fail('無法安全恢復備份，原有存檔仍受保護。');
        return;
      }
    },
  };
}

export function saveGame(storage: Pick<Storage, 'setItem'>, state: GameState): boolean {
  try {
    if (!isState(state)) return false;
    // The v1 key is intentionally retained as the original migration backup.
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
