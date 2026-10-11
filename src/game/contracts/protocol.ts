import type { Cell, Placement, Quality } from '../types';
import type { ChallengeId, CollectionRewardId, GemType, PresentationId, StageId } from './ids';
import type {
  GemUnit, HitClass, InventoryState, ItemInstance, ItemLocation, MechanicSource, PetInstance, PetLocation, ReleaseGameState,
  RngStreams, SaveEnvelope, TrackingState,
} from './state';

export const CONTRACT_VERSION = 'BASE_CONTRACT_V1.1' as const;
export const CONTENT_VERSION = 'integrated-v2-r2-feedback02-C1' as const;
export const RELEASE_SCHEMA_VERSION = 3 as const;
export const RELEASE_LIMITS = Object.freeze({ equipmentWarehouse: 60, pets: 30, rows: 6, cols: 8, enemies: 5, receipts: 128 });
export const RELEASE_TIMING = Object.freeze({ tickMs: 50, actionTicks: 10, waveEntryTicks: 30, settlementTicks: 20, lootClaimMs: 440 });

export const ERROR_CODES = [
  'NOT_FOUND', 'NOT_OWNED', 'STALE_VERSION', 'COMMAND_CONFLICT', 'ALREADY_APPLIED', 'COMMAND_TOO_OLD',
  'PAUSED', 'RESUME_REQUIRED', 'REQUIRED_CHOICE', 'NOT_IN_ALLOWED_MODE', 'STAGE_LOCKED', 'ACTIVE_RUN_EXISTS',
  'INVALID_PLACEMENT', 'DUPLICATE_REFERENCE', 'WAREHOUSE_FULL', 'PET_CAPACITY', 'GEM_RETURN_INVALID',
  'LOOT_NOT_READY', 'GROUND_UNCLAIMED', 'LOCKED_MATERIAL', 'EQUIPPED_SALVAGE', 'ACTIVE_PET_MATERIAL',
  'INVALID_PAIR', 'QUALITY_MAX', 'INSUFFICIENT_RESOURCE', 'GEM_INCOMPATIBLE', 'LOADOUT_MISSING',
  'CONFIRMATION_REQUIRED', 'SAVE_FAILED', 'SAVE_CONFLICT', 'SAVE_READ_ONLY', 'UNKNOWN_CONTENT',
] as const;
export type ErrorCode = typeof ERROR_CODES[number];
export interface CommandError { code: ErrorCode; message: string; ids?: readonly string[]; missingDust?: number }
export type Result<T> = { ok: true; value: T } | { ok: false; error: CommandError };
export interface EntityReference { id: string; version: number }
export interface GemReference { type: GemType; grade: 1 | 2 | 3 }
export interface PairInput { primary: EntityReference; material: EntityReference }

export type WorldCommand =
  | { type: 'world.start' | 'world.next'; stageId: StageId; challengeId: ChallengeId | null }
  | { type: 'world.continue' | 'world.enterCamp' | 'world.abandon' | 'world.repeat'; runId: string }
  | { type: 'world.setAutoRepeat'; enabled: boolean }
  | { type: 'world.selectChallenge'; stageId: StageId; challengeId: ChallengeId | null }
  | { type: 'world.chooseFirstReward'; rewardId: 'first-cleared-verdant-02-gem'; gemType: GemType };
export type InventoryCommand =
  | { type: 'inventory.place'; item: EntityReference; placement: Placement }
  | { type: 'inventory.stash' | 'inventory.discard'; item: EntityReference }
  | { type: 'inventory.rotate'; item: EntityReference; rotation: number }
  | { type: 'inventory.sort' }
  | { type: 'inventory.lock'; item: EntityReference; locked: boolean }
  | { type: 'inventory.expand'; cell: Cell }
  | { type: 'inventory.spendPoint'; stat: 'attack' | 'health' };
export type SynthesisCommand = { type: 'synthesis.item' | 'synthesis.pet'; pair: PairInput };
export type SalvageCommand = { type: 'salvage.single'; item: EntityReference };
export type CustomizationCommand =
  | { type: 'customize.reroll'; item: EntityReference; costVersion: string }
  | { type: 'customize.socket' | 'customize.replaceGem'; item: EntityReference; socketIndex: number; gem: GemReference }
  | { type: 'customize.removeGem'; item: EntityReference; socketIndex: number };
export type PetCommand = { type: 'pet.activate'; pet: EntityReference | null } | { type: 'pet.release'; pet: EntityReference };
export type LoadoutCommand =
  | { type: 'loadout.save'; slot: number; name: string }
  | { type: 'loadout.apply' | 'loadout.remove'; slot: number }
  | { type: 'loadout.rename'; slot: number; name: string };
export type TrackingCommand = { type: 'tracking.set'; target: NonNullable<TrackingState['target']>; craftingGoal: TrackingState['craftingGoal'] } | { type: 'tracking.clear' };
export type CollectionCommand = { type: 'collection.select'; presentationId: PresentationId } | { type: 'collection.claim'; rewardId: CollectionRewardId };
export type PickupCommand = { type: 'loot.pickup'; drop: EntityReference; trigger: 'tap' | 'proximity' | 'stage-exit' };
export type LifecycleCommand =
  | { type: 'lifecycle.pause'; reason: 'manual' | 'organize' | 'camp'; paused: boolean }
  | { type: 'lifecycle.requestContinue' }
  | { type: 'lifecycle.visibility'; visible: boolean };
export type SettingsCommand = { type: 'settings.update'; changes: Partial<Pick<ReleaseGameState['settings'],
  'musicVolume' | 'soundVolume' | 'musicMuted' | 'soundMuted' | 'reducedMotion'>> };
export type Command = WorldCommand | InventoryCommand | SynthesisCommand | SalvageCommand | CustomizationCommand
  | PetCommand | LoadoutCommand | TrackingCommand | CollectionCommand | PickupCommand | LifecycleCommand | SettingsCommand;
export type PreviewableCommand = InventoryCommand | SynthesisCommand | SalvageCommand | CustomizationCommand | PetCommand | LoadoutCommand
  | Extract<WorldCommand, { type: 'world.continue' | 'world.enterCamp' | 'world.abandon' | 'world.repeat' }>;

export interface PreviewToken { commandFingerprint: string; expectedRevision: number; references: readonly EntityReference[]; contentVersion: string }
export interface GemAmount extends GemReference { count: number }
export interface CommandPreview {
  token: PreviewToken; command: PreviewableCommand; successChance: number | null;
  retainedIds: readonly string[]; consumedIds: readonly string[];
  returnedGems: readonly GemAmount[]; dustCost: number; dustReturned: number;
  resultingWarehouseCount: number; resultingPetCount: number;
  nextQuality: Quality | null;
  confirmation: 'synthesis' | 'discard' | 'salvage' | 'reroll' | 'release-pet' | 'abandon-run' | null;
}
export interface CommandEnvelope { commandId: string; commandSeq: number; expectedRevision: number; confirmedPreview?: PreviewToken }
export interface ValidatedPlan { command: Command; envelope: CommandEnvelope; references: readonly EntityReference[]; preview: CommandPreview | null }
export type TransactionOutcome =
  | { kind: 'accepted' }
  | { kind: 'synthesis-success'; retainedId: string; quality: Quality }
  | { kind: 'synthesis-failed'; retainedId: string; consumedId: string };
export interface TransactionReceipt {
  transactionId: string; commandId?: string; commandFingerprint?: string; revision: number;
  eventRange: { first: number; last: number } | null; outcome: TransactionOutcome;
  consumedIds: readonly string[]; createdIds: readonly string[]; rngBefore: RngStreams; rngAfter: RngStreams;
}

export interface EventPayloads {
  HitResolved: { hitId: string; amount: number; critical: boolean; hpDamage: number; shieldDamage: number };
  ActionResolved: { actionId: string; cancelled: boolean };
  DamageApplied: { amount: number; hpAfter: number; shieldAfter: number };
  HealApplied: { actual: number; overheal: number; hpAfter: number };
  ShieldChanged: { before: number; after: number };
  StatusChanged: { status: 'venom' | 'charge' | 'bond' | 'healing-suppression'; stacks: number; remainingRounds: number };
  EnemyKilled: { enemyId: string; xp: number; ordinal: number };
  StageCompleted: { stageId: StageId; challengeId: ChallengeId | null; rewardIds: readonly string[] };
  LootCreated: { dropIds: readonly string[] };
  LootPickedUp: { dropId: string; trigger: PickupCommand['trigger'] };
  ItemDiscovered: { itemId: string; quality: Quality };
  PetProgressed: { petId: string; cumulativeXp: number; level: number };
  InventoryChanged: { itemIds: readonly string[]; petIds: readonly string[]; gemKeys: readonly string[]; dustDelta: number };
  TransactionCommitted: { receipt: TransactionReceipt };
  RunEntered: { stageId: StageId; challengeId: ChallengeId | null };
  CampEntered: { reason: 'manual' | 'load' | 'death' | 'settlement' };
}
export interface EventContext {
  runId?: string; encounterId?: string; sourceId?: string; targetId?: string;
  effectId?: MechanicSource['effectId']; rootActionId?: string; hitId?: string; hitClass?: HitClass;
}
export type EventIntent = { [K in keyof EventPayloads]: EventContext & { type: K; payload: EventPayloads[K] } }[keyof EventPayloads];
export type CommittedEvent = EventIntent & { eventId: string; eventSeq: number; transactionId: string };

// Plans are isolated candidates. Only the central committer may publish one.
export interface TransactionPlan {
  expectedRevision: number; state: ReleaseGameState; rng: RngStreams; counters: SaveEnvelope['counters'];
  events: readonly EventIntent[]; outcome: TransactionOutcome; consumedIds: readonly string[]; createdIds: readonly string[];
}
export interface CommitCandidate { envelope: SaveEnvelope; events: readonly CommittedEvent[] }
export interface SaveCommitter {
  commitSnapshot(expectedRevision: number, candidate: CommitCandidate): Promise<Result<TransactionReceipt>>;
}
export interface CommandPort {
  preview(command: PreviewableCommand): Result<CommandPreview>;
  validate(command: Command, envelope: CommandEnvelope): Result<ValidatedPlan>;
  dispatch(command: Command, envelope: CommandEnvelope): Promise<Result<TransactionReceipt>>;
}
export interface ItemCustomizationDelta { affixes: ItemInstance['affixes']; sockets: ItemInstance['sockets'] }
export interface GemReturnPlan { gems: readonly GemAmount[]; dust: number }
export type InventoryMove =
  | { kind: 'equipment'; item: EntityReference; from: ItemLocation; to: ItemLocation }
  | { kind: 'pet'; pet: EntityReference; from: PetLocation; to: PetLocation }
  | { kind: 'gem'; drop: EntityReference; gem: GemAmount }
  | { kind: 'dust'; drop: EntityReference; amount: number };
export interface InventoryProjection { inventory: InventoryState; warehouseCount: number; petCount: number; returnedGems: readonly GemAmount[] }
export interface PlacementInput { item: EntityReference; placement: Placement }
export interface PlacementPlan { itemId: string; placement: Placement; occupiedCells: readonly Cell[] }
// 13 verifies the drop/version/payload. 07 plans ownership or resource credit and validates net capacity/counts.
// 12 still owns embedded-gem returns; 14 alone commits the candidate and claims the drop.
export type TransferInput =
  | { kind: 'equipment'; item: EntityReference; destination: ItemLocation }
  | { kind: 'pet'; pet: EntityReference; destination: PetLocation }
  | { kind: 'gem'; drop: EntityReference; gem: GemAmount }
  | { kind: 'dust'; drop: EntityReference; amount: number };
export interface TransferPlan { moves: readonly InventoryMove[]; projection: InventoryProjection }
export interface PetGrowthResult { pet: PetInstance }
export interface GemChange { itemId: string; socketIndex: number; before: GemUnit | null; after: GemUnit | null }
