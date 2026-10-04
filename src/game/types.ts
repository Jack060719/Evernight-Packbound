export type Quality = 0 | 1 | 2 | 3 | 4 | 5;
export type ItemKind = 'sword' | 'dagger' | 'bow' | 'staff' | 'armor' | 'shield' | 'ring' | 'charm';
export type PetKind = 'wolf' | 'fairy';
export type EnemyKind = 'skeleton' | 'slime' | 'boss';
export type PauseReason = 'manual' | 'organize' | 'capacity' | 'hidden';
export interface Cell { row: number; col: number }
export interface Placement extends Cell { rotation: number }
export interface Item { id: string; kind: ItemKind; quality: Quality; placement: Placement | null }
export interface Pet { id: string; kind: PetKind; quality: Quality; xp: number; level: number }
export interface ItemDefinition {
  name: string; symbol: string; description: string; shape: Cell[];
  damage: number; everyRounds: number; health: number; defense: number; attack: number; healing: number;
}
export interface PetDefinition { name: string; symbol: string; description: string; power: number; everyRounds: number }
export interface Enemy { id: string; kind: EnemyKind; name: string; hp: number; maxHp: number; damage: number; xp: number }
export interface Hero { level: number; xp: number; points: number; attackPoints: number; healthPoints: number; hp: number }
export interface Stats { maxHp: number; attack: number; defense: number; damagePerRound: number; healPerThreeRounds: number }
export interface BattleAction { kind: 'weapon' | 'unarmed' | 'charm' | 'pet' | 'enemy'; sourceId: string }
export type BattleStage = 'weapons' | 'support' | 'enemies';
export interface AutoSynthesis { enabled: boolean; maxQuality: Quality }
export interface Settings {
  autoItems: AutoSynthesis; autoPets: AutoSynthesis;
  musicVolume: number; soundVolume: number; musicMuted: boolean; soundMuted: boolean;
}
export interface GameState {
  version: 2; nextId: number; time: number; tickRemainder: number; hero: Hero; items: Item[]; pets: Pet[];
  activePetId: string | null; unlockedCells: Cell[];
  floor: number; wave: number; unlockedFloor: number;
  battle: { phase: 'travel' | 'combat' | 'dead'; remaining: number; enemies: Enemy[]; round: number; stage: BattleStage; actions: BattleAction[]; actionIndex: number; actionResolved: boolean };
  pending: { items: Item[]; pets: Pet[] };
  firstFloorReward: boolean; completedRuns: number; pauses: PauseReason[]; settings: Settings; log: string[];
}
export type GameEventType = 'attack' | 'hurt' | 'heal' | 'death' | 'loot' | 'level' | 'pet' | 'synthesis-success' | 'synthesis-fail' | 'floor' | 'ui';
export interface GameEvent { type: GameEventType; source?: string; target?: string; amount?: number; message?: string }
export interface OperationResult { ok: boolean; message: string; success?: boolean }
