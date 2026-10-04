import { createInitialState, GameEngine } from './game/engine';
import { CAPACITY, COLS, ITEMS, ROWS, rotateShape } from './game/content';
import type { BattleAction, GameState, Item, Pet, Placement } from './game/types';

export const SAVE_KEY = 'evernight-packbound-v2';
export const LEGACY_SAVE_KEY = 'evernight-packbound-v1';
export const MIGRATION_MESSAGE = '已保留舊版角色、裝備、靈寵與待領物品，並更新為回合戰鬥；本層從第一波滿血重新開始。';
export const PLACEMENT_REPAIR_MESSAGE = '裝備占格已更新，衝突位置已重新安置；放不下的裝備已完整保留於待整理區或待領區，戰鬥進度不變。';

const finite = (...values: number[]) => values.every(Number.isFinite);
const integerBetween = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
const qualityValid = (quality: number) => integerBetween(quality, 0, 5);
const validItem = (item: Item) => !!item && typeof item.id === 'string'
  && ['sword', 'dagger', 'bow', 'staff', 'armor', 'shield', 'ring', 'charm'].includes(item.kind)
  && qualityValid(item.quality)
  && (item.placement === null || (!!item.placement && integerBetween(item.placement.row, 0, 5)
    && integerBetween(item.placement.col, 0, 7) && integerBetween(item.placement.rotation, 0, 3)));
const validPet = (pet: Pet) => !!pet && typeof pet.id === 'string'
  && ['wolf', 'fairy'].includes(pet.kind) && qualityValid(pet.quality) && finite(pet.xp, pet.level);
const validAction = (action: BattleAction) => !!action && ['weapon', 'unarmed', 'charm', 'pet', 'enemy'].includes(action.kind)
  && typeof action.sourceId === 'string';

// Both versions share permanent progression; only their combat clocks differ.
function isCommonState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as GameState;
  return finite(state.nextId, state.time, state.tickRemainder, state.completedRuns)
    && integerBetween(state.floor, 1, 3) && integerBetween(state.wave, 1, 5) && integerBetween(state.unlockedFloor, state.floor, 3)
    && !!state.hero && finite(state.hero.hp, state.hero.level, state.hero.xp, state.hero.points, state.hero.attackPoints, state.hero.healthPoints)
    && Array.isArray(state.items) && state.items.every(validItem)
    && Array.isArray(state.pets) && state.pets.every(validPet)
    && Array.isArray(state.unlockedCells) && state.unlockedCells.every(cell => !!cell && integerBetween(cell.row, 0, 5) && integerBetween(cell.col, 0, 7))
    && !!state.battle && ['travel', 'combat', 'dead'].includes(state.battle.phase)
    && finite(state.battle.remaining)
    && Array.isArray(state.battle.enemies) && state.battle.enemies.every(enemy => !!enemy && typeof enemy.id === 'string'
      && ['skeleton', 'slime', 'boss'].includes(enemy.kind)
      && finite(enemy.hp, enemy.maxHp, enemy.damage, enemy.xp))
    && !!state.pending && Array.isArray(state.pending.items) && state.pending.items.every(validItem)
    && Array.isArray(state.pending.pets) && state.pending.pets.every(validPet)
    && Array.isArray(state.pauses) && state.pauses.every(pause => ['manual', 'organize', 'capacity', 'hidden'].includes(pause))
    && Array.isArray(state.log) && state.log.every(line => typeof line === 'string')
    && typeof state.firstFloorReward === 'boolean' && (state.activePetId === null || typeof state.activePetId === 'string')
    && !!state.settings && !!state.settings.autoItems && !!state.settings.autoPets
    && [state.settings.autoItems, state.settings.autoPets].every(auto => typeof auto.enabled === 'boolean' && integerBetween(auto.maxQuality, 1, 5))
    && finite(state.settings.musicVolume, state.settings.soundVolume)
    && typeof state.settings.musicMuted === 'boolean' && typeof state.settings.soundMuted === 'boolean';
}

function isState(value: unknown): value is GameState {
  if (!isCommonState(value) || value.version !== 2) return false;
  const battle = value.battle;
  return Number.isInteger(battle.round) && battle.round >= 1
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

export function loadGame(storage: Pick<Storage, 'getItem'>): { state?: GameState; message?: string; migration?: string } {
  try {
    const current = storage.getItem(SAVE_KEY);
    const raw = current ?? storage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const legacy = !current && (parsed as { version?: number } | null)?.version === 1;
    const state = legacy ? migrateV1(parsed) : isState(parsed) ? parsed : undefined;
    if (!state) return { message: '存檔格式無法讀取，已開啟新旅程；開始遊戲後會建立新存檔。' };
    const repaired = repairPlacements(state);
    state.pauses = state.pauses.filter(reason => reason !== 'hidden');
    if (!state.pauses.includes('manual')) state.pauses.push('manual');
    const migration = [legacy ? MIGRATION_MESSAGE : '', repaired ? PLACEMENT_REPAIR_MESSAGE : ''].filter(Boolean).join(' ');
    return { state, ...(migration ? { migration } : {}) };
  } catch {
    return { message: '無法讀取本機存檔。請確認瀏覽器允許儲存遊戲資料。' };
  }
}

export function saveGame(storage: Pick<Storage, 'setItem'>, state: GameState): boolean {
  try {
    // The v1 key is intentionally retained as the original migration backup.
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
