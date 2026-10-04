import { CAPACITY, COLS, ITEMS, PETS, QUALITY_MULTIPLIERS, QUALITY_NAMES, ROWS, SYNTHESIS_CHANCES, levelFromXp, rotateShape } from './content';
import type { BattleAction, Cell, Enemy, EnemyKind, GameEvent, GameState, Item, ItemKind, OperationResult, PauseReason, Pet, PetKind, Quality, Stats } from './types';

const TICK = 0.05;
const ACTION_SECONDS = 0.5;
const sameCell = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;
const result = (ok: boolean, message: string): OperationResult => ({ ok, message });
const idleBattle = (): GameState['battle'] => ({ phase: 'travel', remaining: 2, enemies: [], round: 1, stage: 'weapons', actions: [], actionIndex: 0, actionResolved: false });

export function createInitialState(): GameState {
  return {
    version: 2, nextId: 7, time: 0, tickRemainder: 0,
    hero: { level: 1, xp: 0, points: 0, attackPoints: 0, healthPoints: 0, hp: 100 },
    items: [
      { id: 'i1', kind: 'sword', quality: 0, placement: { row: 0, col: 0, rotation: 0 } },
      { id: 'i2', kind: 'shield', quality: 0, placement: { row: 0, col: 1, rotation: 0 } },
      { id: 'i3', kind: 'charm', quality: 0, placement: { row: 3, col: 0, rotation: 0 } },
      { id: 'i4', kind: 'dagger', quality: 0, placement: null },
      { id: 'i5', kind: 'sword', quality: 0, placement: null },
      { id: 'i6', kind: 'sword', quality: 0, placement: null },
    ],
    pets: [], activePetId: null,
    unlockedCells: Array.from({ length: 20 }, (_, index) => ({ row: Math.floor(index / 5), col: index % 5 })),
    floor: 1, wave: 1, unlockedFloor: 1,
    battle: idleBattle(),
    pending: { items: [], pets: [] }, firstFloorReward: false, completedRuns: 0,
    pauses: ['manual'],
    settings: {
      autoItems: { enabled: false, maxQuality: 1 }, autoPets: { enabled: false, maxQuality: 1 },
      musicVolume: 0.25, soundVolume: 0.45, musicMuted: false, soundMuted: false,
    },
    log: ['旅人抵達永夜遺跡。整理行囊，點選開始踏上旅程。'],
  };
}

export class GameEngine {
  events: GameEvent[] = [];

  constructor(public state: GameState = createInitialState(), private random: () => number = Math.random) {}

  get currentAction(): BattleAction | null {
    const battle = this.state.battle;
    return battle.phase === 'combat' ? battle.actions[battle.actionIndex] ?? null : null;
  }

  get stats(): Stats {
    const stats: Stats = { maxHp: 100 + this.state.hero.healthPoints * 15, attack: 4 + this.state.hero.attackPoints * 2, defense: 0, healPerThreeRounds: 0, damagePerRound: 0 };
    const equipped = this.state.items.filter(item => item.placement);
    for (const item of equipped) {
      const definition = ITEMS[item.kind];
      const multiplier = QUALITY_MULTIPLIERS[item.quality];
      stats.maxHp += definition.health * multiplier;
      stats.attack += definition.attack * multiplier;
      stats.defense += definition.defense * multiplier;
      stats.healPerThreeRounds += definition.healing * multiplier;
    }
    const weapons = equipped.filter(item => ITEMS[item.kind].damage > 0);
    for (const item of weapons) stats.damagePerRound += this.weaponDamage(item, stats.attack);
    if (!weapons.length) stats.damagePerRound = stats.attack;
    const pet = this.state.pets.find(pet => pet.id === this.state.activePetId);
    if (pet?.kind === 'wolf') stats.damagePerRound += this.petPower(pet);
    if (pet?.kind === 'fairy') stats.healPerThreeRounds += this.petPower(pet);
    return stats;
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  setPause(reason: PauseReason, paused: boolean): void {
    if (paused && !this.state.pauses.includes(reason)) this.state.pauses.push(reason);
    if (!paused) this.state.pauses = this.state.pauses.filter(value => value !== reason);
  }

  step(seconds: number): void {
    if (this.state.pauses.length || !Number.isFinite(seconds) || seconds <= 0) return;
    this.state.tickRemainder += seconds;
    while (this.state.tickRemainder + 1e-10 >= TICK && !this.state.pauses.length) {
      this.state.tickRemainder = Math.max(0, this.state.tickRemainder - TICK);
      this.tick();
    }
    // A capacity pause must never defer unprocessed time into a later resume.
    if (this.state.pauses.length) this.state.tickRemainder = 0;
  }

  placeItem(id: string, row: number, col: number, rotation = 0): OperationResult {
    if (!this.organizing) return result(false, '請先進入整理模式');
    const item = this.state.items.find(item => item.id === id);
    if (!item) return result(false, '找不到裝備');
    if (![row, col, rotation].every(Number.isInteger)) return result(false, '請選擇有效格子');
    const cells = rotateShape(ITEMS[item.kind].shape, rotation).map(cell => ({ row: cell.row + row, col: cell.col + col }));
    const occupied = this.state.items.filter(other => other.id !== id && other.placement).flatMap(other => this.occupiedCells(other));
    if (cells.some(cell => !this.state.unlockedCells.some(open => sameCell(open, cell)))) return result(false, '裝備超出已開啟的背包範圍');
    if (cells.some(cell => occupied.some(other => sameCell(other, cell)))) return result(false, '這裡已放置其他裝備');
    item.placement = { row, col, rotation: ((rotation % 4) + 4) % 4 };
    this.clampHealth();
    this.retryPending();
    return result(true, `已放入${ITEMS[item.kind].name}`);
  }

  stashItem(id: string): OperationResult {
    if (!this.organizing) return result(false, '請先進入整理模式');
    const item = this.state.items.find(item => item.id === id);
    if (!item) return result(false, '找不到裝備');
    if (!item.placement) return result(false, '裝備已在待整理區');
    if (this.state.items.filter(item => !item.placement).length >= CAPACITY) return result(false, '待整理區已滿，請先合成或丟棄');
    item.placement = null;
    this.clampHealth();
    return result(true, '已移至待整理區');
  }

  expandCell(row: number, col: number): OperationResult {
    if (!this.organizing) return result(false, '請先進入整理模式');
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= ROWS || col < 0 || col >= COLS) return result(false, '格子超出背包上限');
    const cells = this.state.unlockedCells;
    if (cells.some(cell => cell.row === row && cell.col === col)) return result(false, '這一格已經開啟');
    if (!cells.some(cell => Math.abs(cell.row - row) + Math.abs(cell.col - col) === 1)) return result(false, '只能擴充與已開啟格子共邊的一格');
    if (this.state.hero.points < 2) return result(false, '擴充一格需要 2 成長點');
    this.state.hero.points -= 2;
    cells.push({ row, col });
    return result(true, '背包擴充一格');
  }

  spendPoint(attribute: 'attack' | 'health'): OperationResult {
    if (!this.organizing) return result(false, '請先進入整理模式');
    if (this.state.hero.points < 1) return result(false, '目前沒有可分配的成長點');
    this.state.hero.points--;
    if (attribute === 'attack') this.state.hero.attackPoints++;
    else this.state.hero.healthPoints++;
    return result(true, attribute === 'attack' ? '攻擊提高 2' : '生命上限提高 15');
  }

  setPet(id: string | null): OperationResult {
    if (!this.organizing) return result(false, '請先進入整理模式');
    if (id !== null && !this.state.pets.some(pet => pet.id === id)) return result(false, '找不到寵物');
    this.state.activePetId = id;
    return result(true, id ? '出戰寵物已切換' : '寵物已休息');
  }

  synthesize(kind: 'item' | 'pet', firstId: string, secondId: string): OperationResult {
    if (!this.organizing) return result(false, '請先進入整理模式');
    const outcome = this.merge(kind, firstId, secondId, true);
    if (outcome.ok) this.retryPending();
    return outcome;
  }

  discardItem(id: string): OperationResult {
    if (!this.organizing) return result(false, '請先進入整理模式');
    if (!this.state.items.some(item => item.id === id)) return result(false, '找不到裝備');
    this.state.items = this.state.items.filter(item => item.id !== id);
    this.clampHealth();
    this.retryPending();
    return result(true, '已丟棄裝備');
  }

  releasePet(id: string): OperationResult {
    if (!this.organizing) return result(false, '請先進入整理模式');
    if (this.state.activePetId === id) return result(false, '出戰寵物不能放生，請先讓牠休息');
    if (!this.state.pets.some(pet => pet.id === id)) return result(false, '找不到寵物');
    this.state.pets = this.state.pets.filter(pet => pet.id !== id);
    this.retryPending();
    return result(true, '已放生寵物');
  }

  retryPending(): OperationResult {
    this.state.items.push(...this.state.pending.items);
    this.state.pets.push(...this.state.pending.pets);
    this.state.pending = { items: [], pets: [] };
    if (this.state.settings.autoItems.enabled) this.autoMerge('item');
    if (this.state.settings.autoPets.enabled) this.autoMerge('pet');
    let stashCount = 0;
    this.state.items = this.state.items.filter(item => {
      if (item.placement || stashCount++ < CAPACITY) return true;
      this.state.pending.items.push(item);
      return false;
    });
    this.state.pending.pets = this.state.pets.splice(CAPACITY);
    const full = this.state.pending.items.length + this.state.pending.pets.length > 0;
    const alreadyFull = this.state.pauses.includes('capacity');
    this.setPause('capacity', full);
    if (full && !alreadyFull) this.note('容量不足：本次掉落已保留，請整理行囊或寵物。');
    return result(!full, full ? '待領掉落已保留，請先整理出空間' : '已收入全部待領掉落');
  }

  changeFloor(floor: number): OperationResult {
    if (!Number.isInteger(floor) || floor < 1 || floor > this.state.unlockedFloor) return result(false, '這個樓層尚未解鎖');
    this.enterFloor(floor);
    this.note(`進入第 ${floor} 層，生命已恢復。`, 'floor');
    return result(true, `前往第 ${floor} 層`);
  }

  private get organizing(): boolean { return this.state.pauses.includes('organize'); }

  private occupiedCells(item: Item): Cell[] {
    const placement = item.placement;
    if (!placement) return [];
    return rotateShape(ITEMS[item.kind].shape, placement.rotation).map(cell => ({ row: cell.row + placement.row, col: cell.col + placement.col }));
  }

  private clampHealth(): void { this.state.hero.hp = Math.min(this.state.hero.hp, this.stats.maxHp); }
  private weaponDamage(item: Item, attack: number): number { return ITEMS[item.kind].damage * QUALITY_MULTIPLIERS[item.quality] + attack; }
  private petPower(pet: Pet): number { return PETS[pet.kind].power * QUALITY_MULTIPLIERS[pet.quality] * (1 + (pet.level - 1) * 0.15); }

  private merge(kind: 'item' | 'pet', firstId: string, secondId: string, manual = false): OperationResult {
    if (firstId === secondId) return result(false, '需要兩份不同的材料');
    const pool = kind === 'item' ? this.state.items : this.state.pets;
    let first = pool.find(value => value.id === firstId);
    let second = pool.find(value => value.id === secondId);
    if (!first || !second) return result(false, '找不到合成材料');
    if (first.kind !== second.kind || first.quality !== second.quality) return result(false, '合成需要相同品項或物種、相同品質');
    if (first.quality === 5) return result(false, '金色已是最高品質');
    if (!manual && kind === 'item' && ((first as Item).placement || (second as Item).placement)) return result(false, '自動合成只使用待整理區裝備');
    if (kind === 'pet' && (this.state.activePetId === first.id || this.state.activePetId === second.id)) return result(false, '出戰寵物不能參與合成');
    if (kind === 'pet' && (second as Pet).xp > (first as Pet).xp) [first, second] = [second, first];
    const success = this.random() < SYNTHESIS_CHANCES[first.quality];
    if (success) first.quality = (first.quality + 1) as Quality;
    if (kind === 'item') this.state.items = this.state.items.filter(value => value.id !== second.id);
    else this.state.pets = this.state.pets.filter(value => value.id !== second.id);
    this.clampHealth();
    const name = kind === 'item' ? ITEMS[first.kind as ItemKind].name : PETS[first.kind as PetKind].name;
    const message = success ? `${name}合成成功，提升為${QUALITY_NAMES[first.quality]}。` : `${name}合成失敗；主體保留，另一份材料已消耗。`;
    this.note(message, success ? 'synthesis-success' : 'synthesis-fail');
    return { ok: true, success, message };
  }

  private autoMerge(kind: 'item' | 'pet'): void {
    const cap = kind === 'item' ? this.state.settings.autoItems.maxQuality : this.state.settings.autoPets.maxQuality;
    for (let quality = 0; quality < cap && quality < 5; quality++) {
      while (true) {
        const candidates = kind === 'item'
          ? this.state.items.filter(item => !item.placement && item.quality === quality)
          : this.state.pets.filter(pet => pet.id !== this.state.activePetId && pet.quality === quality);
        const first = candidates.find(value => candidates.some(other => value.id !== other.id && value.kind === other.kind));
        if (!first) break;
        const second = candidates.find(value => value.id !== first.id && value.kind === first.kind)!;
        this.merge(kind, first.id, second.id);
      }
    }
  }

  private tick(): void {
    const state = this.state;
    state.time += TICK;
    const battle = state.battle;
    if (battle.phase === 'dead') {
      battle.remaining -= TICK;
      if (battle.remaining <= 1e-10) {
        this.enterFloor(state.floor);
        this.note('旅人重新起身，從本層第一波再出發。');
      }
      return;
    }
    if (battle.phase === 'travel') {
      battle.remaining -= TICK;
      if (battle.remaining <= 1e-10) this.spawnWave();
      return;
    }
    if (!battle.actionResolved) {
      this.skipUnavailableActions();
      if (!this.currentAction) {
        this.finishRound();
        return;
      }
      // Save the resolution marker before rewards can pause combat at capacity.
      battle.actionResolved = true;
      this.performAction(this.currentAction);
      if (state.battle.phase !== 'combat' || state.pauses.length) return;
    }
    battle.remaining -= TICK;
    if (battle.remaining <= 1e-10) {
      battle.actionIndex++;
      battle.actionResolved = false;
      battle.remaining = ACTION_SECONDS;
      this.skipUnavailableActions();
      if (!this.currentAction) this.finishRound();
    }
  }

  private beginRound(): void {
    const { battle } = this.state;
    const equipped = this.state.items.filter(item => item.placement).sort((a, b) =>
      a.placement!.row - b.placement!.row || a.placement!.col - b.placement!.col || a.id.localeCompare(b.id));
    const weapons = equipped.filter(item => ITEMS[item.kind].damage > 0);
    const actions: BattleAction[] = weapons.length
      ? weapons.map(item => ({ kind: 'weapon', sourceId: item.id }))
      : [{ kind: 'unarmed', sourceId: 'hero' }];
    for (const charm of equipped.filter(item => ITEMS[item.kind].healing > 0)) {
      if (battle.round % ITEMS[charm.kind].everyRounds === 0) actions.push({ kind: 'charm', sourceId: charm.id });
    }
    const pet = this.state.pets.find(pet => pet.id === this.state.activePetId);
    if (pet && battle.round % PETS[pet.kind].everyRounds === 0) actions.push({ kind: 'pet', sourceId: pet.id });
    for (const enemy of battle.enemies) actions.push({ kind: 'enemy', sourceId: enemy.id });
    battle.actions = actions;
    battle.actionIndex = 0;
    battle.actionResolved = false;
    battle.remaining = ACTION_SECONDS;
    battle.stage = 'weapons';
  }

  private actionAvailable(action: BattleAction): boolean {
    if (action.kind === 'enemy') return this.state.battle.enemies.some(enemy => enemy.id === action.sourceId);
    if (action.kind === 'unarmed') return this.state.battle.enemies.length > 0;
    if (action.kind === 'pet') {
      const pet = this.state.pets.find(pet => pet.id === action.sourceId && pet.id === this.state.activePetId);
      return !!pet && (pet.kind === 'fairy' || this.state.battle.enemies.length > 0);
    }
    const item = this.state.items.find(item => item.id === action.sourceId && item.placement);
    return !!item && (action.kind === 'charm' || this.state.battle.enemies.length > 0);
  }

  private skipUnavailableActions(): void {
    const battle = this.state.battle;
    while (this.currentAction && !this.actionAvailable(this.currentAction)) battle.actionIndex++;
    const kind = this.currentAction?.kind;
    battle.stage = kind === 'enemy' ? 'enemies' : kind === 'charm' || kind === 'pet' ? 'support' : 'weapons';
  }

  private performAction(action: BattleAction): void {
    const stats = this.stats;
    if (action.kind === 'weapon') {
      const item = this.state.items.find(item => item.id === action.sourceId)!;
      this.hitEnemy(this.weaponDamage(item, stats.attack), item.id, 'attack');
    } else if (action.kind === 'unarmed') {
      this.hitEnemy(stats.attack, 'hero', 'attack');
    } else if (action.kind === 'charm') {
      const item = this.state.items.find(item => item.id === action.sourceId)!;
      this.heal(ITEMS[item.kind].healing * QUALITY_MULTIPLIERS[item.quality], item.id, 'heal');
    } else if (action.kind === 'pet') {
      const pet = this.state.pets.find(pet => pet.id === action.sourceId)!;
      if (pet.kind === 'wolf') this.hitEnemy(this.petPower(pet), pet.id, 'pet');
      else this.heal(this.petPower(pet), pet.id, 'pet');
    } else {
      const enemy = this.state.battle.enemies.find(enemy => enemy.id === action.sourceId)!;
      const damage = Math.max(1, enemy.damage - stats.defense);
      this.state.hero.hp = Math.max(0, this.state.hero.hp - damage);
      this.events.push({ type: 'hurt', source: enemy.id, target: 'hero', amount: damage });
      if (this.state.hero.hp === 0) {
        this.state.battle.phase = 'dead';
        this.state.battle.remaining = 2.5;
        this.note('旅人倒下了。成長與物品保留，稍後重試本層。', 'death');
      }
    }
  }

  private heal(power: number, source: string, type: 'heal' | 'pet'): void {
    const amount = Math.min(this.stats.maxHp - this.state.hero.hp, power);
    this.state.hero.hp += amount;
    this.events.push({ type, source, target: 'hero', amount });
  }

  private finishRound(): void {
    if (!this.state.battle.enemies.length) this.finishWave();
    else {
      this.state.battle.round++;
      this.beginRound();
    }
  }

  private spawnWave(): void {
    const { floor, wave } = this.state;
    const kinds: EnemyKind[] = floor === 3 && wave === 5 ? ['boss'] : Array.from({ length: wave === 5 ? 3 : wave >= 3 ? 2 : 1 }, (_, index) => (wave + index) % 2 === 0 ? 'slime' : 'skeleton');
    const enemies: Enemy[] = kinds.map(kind => {
      const scale = 1 + (floor - 1) * 0.65;
      const hp = Math.round((kind === 'boss' ? 240 : kind === 'skeleton' ? 33 : 44) * scale);
      return {
        id: `e${this.state.nextId++}`, kind, name: kind === 'boss' ? '遺跡守衛' : kind === 'skeleton' ? '小骨兵' : '露珠史萊姆',
        hp, maxHp: hp, damage: (kind === 'boss' ? 12 : kind === 'skeleton' ? 5 : 6) * scale,
        xp: (kind === 'boss' ? 80 : 12) * floor,
      };
    });
    this.state.battle.phase = 'combat';
    this.state.battle.enemies = enemies;
    this.state.battle.round = 1;
    this.beginRound();
  }

  private hitEnemy(damage: number, source: string, type: 'attack' | 'pet'): void {
    const enemy = this.state.battle.enemies[0];
    if (!enemy) return;
    enemy.hp = Math.max(0, enemy.hp - damage);
    this.events.push({ type, source, target: enemy.id, amount: damage });
    if (enemy.hp > 0) return;
    this.state.battle.enemies.shift();
    this.gainExperience(enemy.xp);
    if (this.random() < 0.65) {
      const kinds = Object.keys(ITEMS) as ItemKind[];
      const kind = kinds[Math.floor(this.random() * kinds.length)];
      this.state.pending.items.push({ id: `i${this.state.nextId++}`, kind, quality: 0, placement: null });
      this.note(`拾獲${ITEMS[kind].name}。`, 'loot');
    }
    if (this.random() < 0.08) this.awardPet(this.random() < 0.5 ? 'wolf' : 'fairy');
    this.retryPending();
  }

  private gainExperience(amount: number): void {
    const hero = this.state.hero;
    hero.xp += amount;
    const level = levelFromXp(hero.xp);
    if (level > hero.level) {
      hero.points += level - hero.level;
      hero.level = level;
      this.note(`旅人提升至 ${level} 級，獲得成長點。`, 'level');
    }
    const pet = this.state.pets.find(pet => pet.id === this.state.activePetId);
    if (pet) {
      pet.xp += amount;
      pet.level = levelFromXp(pet.xp);
    }
  }

  private awardPet(kind: PetKind): void {
    this.state.pending.pets.push({ id: `p${this.state.nextId++}`, kind, quality: 0, xp: 0, level: 1 });
    this.note(`寵物蛋孵化了：${PETS[kind].name}加入旅途。`, 'loot');
  }

  private finishWave(): void {
    const state = this.state;
    if (state.wave < 5) {
      state.wave++;
      state.battle.phase = 'travel';
      state.battle.remaining = 2;
      state.battle.round = 1;
      state.battle.actions = [];
      state.battle.actionIndex = 0;
      state.battle.actionResolved = false;
      state.battle.stage = 'weapons';
      return;
    }
    if (state.floor === 1 && !state.firstFloorReward) {
      state.firstFloorReward = true;
      this.awardPet('wolf');
      this.retryPending();
    }
    if (state.floor === 3) {
      state.completedRuns++;
      this.note('遺跡守衛倒下！第三層將重新開始。', 'floor');
    } else {
      state.unlockedFloor = Math.max(state.unlockedFloor, state.floor + 1);
      this.note(`第 ${state.floor} 層通關，前往下一層。`, 'floor');
    }
    this.enterFloor(Math.min(3, state.floor + 1));
  }

  private enterFloor(floor: number): void {
    this.state.floor = floor;
    this.state.wave = 1;
    this.state.hero.hp = this.stats.maxHp;
    this.state.battle = idleBattle();
  }

  private note(message: string, type: GameEvent['type'] = 'ui'): void {
    this.state.log.unshift(message);
    this.state.log = this.state.log.slice(0, 30);
    this.events.push({ type, message });
  }
}
