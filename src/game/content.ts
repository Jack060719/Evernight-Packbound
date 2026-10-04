import type { Cell, ItemDefinition, ItemKind, PetDefinition, PetKind } from './types';

export const ROWS = 6;
export const COLS = 8;
export const CAPACITY = 30;
export const QUALITY_NAMES = ['白色', '藍色', '紫色', '橘色', '紅色', '金色'];
export const QUALITY_COLORS = ['#e7edf2', '#1e70c6', '#9748d1', '#e47b24', '#ce354c', '#efbd27'];
export const QUALITY_MULTIPLIERS = [1, 1.45, 2.1, 3, 4.2, 5.8];
export const SYNTHESIS_CHANCES = [0.9, 0.8, 0.7, 0.6, 0.5];
const cells = (...positions: [number, number][]): Cell[] => positions.map(([row, col]) => ({ row, col }));

export const ITEMS: Record<ItemKind, ItemDefinition> = {
  sword: { name: '旅人短劍', symbol: '⚔', description: '每回合斬擊最前方敵人一次', shape: cells([0, 0], [1, 0]), damage: 12, everyRounds: 1, health: 0, defense: 0, attack: 0, healing: 0 },
  dagger: { name: '骨柄匕首', symbol: '†', description: '每回合刺擊一次，只占一格', shape: cells([0, 0]), damage: 2, everyRounds: 1, health: 0, defense: 0, attack: 0, healing: 0 },
  bow: { name: '獵人短弓', symbol: '⌒', description: '每回合精準射擊一次', shape: cells([0, 0], [1, 0], [2, 0]), damage: 23, everyRounds: 1, health: 0, defense: 0, attack: 0, healing: 0 },
  staff: { name: '灰燼法杖', symbol: '✦', description: '每回合釋放一次秘法攻擊', shape: cells([0, 0], [1, 0], [2, 0], [3, 0]), damage: 34, everyRounds: 1, health: 0, defense: 0, attack: 0, healing: 0 },
  armor: { name: '舊鐵護甲', symbol: '▣', description: '提高生命上限與防禦', shape: cells([0, 0], [0, 1], [1, 0], [1, 1]), damage: 0, everyRounds: 0, health: 35, defense: 1, attack: 0, healing: 0 },
  shield: { name: '守夜者盾', symbol: '◈', description: '減輕每一次承受的傷害', shape: cells([0, 0], [0, 1], [1, 0], [1, 1]), damage: 0, everyRounds: 0, health: 0, defense: 2, attack: 0, healing: 0 },
  ring: { name: '赤銅戒指', symbol: '◎', description: '提高所有武器的攻擊', shape: cells([0, 0]), damage: 0, everyRounds: 0, health: 0, defense: 0, attack: 3, healing: 0 },
  charm: { name: '再生護符', symbol: '✧', description: '每波第 3、6、9 回合回復生命', shape: cells([0, 0], [0, 1]), damage: 0, everyRounds: 3, health: 0, defense: 0, attack: 0, healing: 14 },
};

export const PETS: Record<PetKind, PetDefinition> = {
  wolf: { name: '灰鬃狼', symbol: '♞', description: '每回合攻擊最前方敵人一次', power: 8, everyRounds: 1 },
  fairy: { name: '芽葉靈', symbol: '✥', description: '每波第 3、6、9 回合回復生命', power: 16, everyRounds: 3 },
};

export function rotateShape(shape: Cell[], rotation: number): Cell[] {
  let result = shape.map(cell => ({ ...cell }));
  for (let i = 0; i < ((rotation % 4) + 4) % 4; i++) {
    result = result.map(({ row, col }) => ({ row: col, col: -row }));
    const minRow = Math.min(...result.map(cell => cell.row));
    const minCol = Math.min(...result.map(cell => cell.col));
    result = result.map(({ row, col }) => ({ row: row - minRow, col: col - minCol }));
  }
  return result;
}

// Experience is cumulative; level 2 begins at 30, level 3 at 90.
export function xpForLevel(level: number): number { return 15 * level * (level - 1); }
export function levelFromXp(xp: number): number { return Math.floor((1 + Math.sqrt(1 + Math.max(0, xp) * 4 / 15)) / 2); }
