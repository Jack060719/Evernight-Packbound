import type { Cell, ItemKind, PetKind, Placement, Quality } from '../types';
import type {
  AffixStatId, ChallengeId, CollectionRewardId, EnemyDefinitionId, EnemyRank, GearEffectId,
  GemGrade, GemType, ItemDefinitionId, LootTableId, PetMilestoneId, PresentationId, QualityRowId, RegionId, StageId,
} from './ids';
import type {
  AffixRoll, CombatSnapshot, CombatStats, ExitRequest, GearMechanicParameters, GemUnit, GroundDrop, InventoryState, ItemInstance,
  MechanicDefinition, MechanicSource, PetInstance, ReleaseGameState, RngState, SaveEnvelope, StatModifier, TrackingTarget, WorldProgress,
} from './state';
import type {
  CollectionCommand, CommandEnvelope, CommandPort, CommandPreview, CommittedEvent, CustomizationCommand, EntityReference, EventIntent,
  GemReturnPlan, InventoryCommand, InventoryMove, InventoryProjection, ItemCustomizationDelta, LoadoutCommand,
  PairInput, PetCommand, PetGrowthResult, PlacementInput, PlacementPlan, Result, SalvageCommand, SynthesisCommand,
  TransactionPlan, TransferInput, TransferPlan, TrackingCommand, WorldCommand,
} from './protocol';

export interface RandomSource { next(): number; snapshot(): RngState }
export interface ClockPort { advance(nowMs: number, blocked: boolean, step: (seconds: number) => void): void; reset(): void }
export type EffectDefinition = MechanicDefinition;
/** Outer clauses are OR, each inner clause is AND; an empty outer list is unconditional. */
export type UnlockRequirement = readonly (readonly StageId[])[];
export interface RegionDefinition { id: RegionId; name: string; stageIds: readonly StageId[]; unlock: UnlockRequirement }
export interface EnemySpawn { definitionId: EnemyDefinitionId; ordinal: number; hp: number; attack: number; xp: number; effects: readonly EffectDefinition[] }
export interface WaveDefinition { enemies: readonly EnemySpawn[] }
export interface StageDefinition {
  id: StageId; name: string; regionId: RegionId; depth: number; waves: readonly WaveDefinition[];
  bossId: EnemyDefinitionId; lootTableId: LootTableId; qualityRowId: QualityRowId; unlock: UnlockRequirement;
}
export interface EnemyDefinition { id: EnemyDefinitionId; name: string; rank: EnemyRank; effects: readonly EffectDefinition[] }
export interface EquipmentDefinition {
  id: ItemDefinitionId; baseKind: ItemKind; name: string; shape: readonly Cell[]; effectId: GearEffectId;
  affixPool: readonly AffixStatId[]; gemTypes: readonly GemType[];
}
export interface GearEffectDefinition { id: GearEffectId; parameters: GearMechanicParameters }
export interface AffixDefinition { statId: AffixStatId; unit: AffixRoll['unit']; ranges: readonly { quality: Quality; min: number; max: number; step: number }[] }
export interface GemDefinition { type: GemType; grade: GemGrade; effect: EffectDefinition; compatibleKinds: readonly ItemKind[] }
export interface PetMilestoneDefinition { id: PetMilestoneId; kind: PetKind; level: number; effect: EffectDefinition }
export type MilestoneTable = readonly PetMilestoneDefinition[];
export interface PetCooperationDefinition { kind: PetKind; basePower: number; everyRounds: number; growthPerLevel: number; effects: readonly EffectDefinition[] }
export interface LootRankRates { equipment: number; pet: number; gem: number; dust: { probability: number; count: number } }
export interface LootTableDefinition {
  id: LootTableId; ranks: Readonly<Record<EnemyRank, LootRankRates>>;
  equipmentPool: readonly { definitionId: ItemDefinitionId; weight: number }[];
  gemPool: readonly { type: GemType; weight: number }[];
  petPool: readonly { kind: PetKind; weight: number }[];
}
export interface QualityRowDefinition {
  id: QualityRowId; equipment: readonly { quality: Quality; probability: number }[];
  pet: readonly { quality: Quality; probability: number }[]; gem: readonly { grade: GemGrade; probability: number }[];
}
export interface ChallengeDefinition {
  id: ChallengeId; regionId: RegionId; hpMultiplier: number; attackMultiplier: number; addedEffects: readonly EffectDefinition[];
  completionReward: { equipmentProbability: number; gemProbability: number; dust: number };
}
export type CollectionRequirement =
  | { kind: 'equipment-count' | 'gem-kind-count'; count: number }
  | { kind: 'pet-level'; level: number; species: readonly PetKind[] }
  | { kind: 'region-clear'; regionId: RegionId }
  | { kind: 'all-regions-clear' };
export interface CollectionDefinition { id: CollectionRewardId; requirement: CollectionRequirement; presentationId: PresentationId }
export interface EconomyDefinition {
  qualityMultipliers: readonly number[]; synthesisChances: readonly number[]; rerollDust: readonly number[];
  salvageDust: readonly number[]; affixCounts: readonly number[]; socketCounts: readonly number[];
  extraHitCoefficients: readonly number[];
  /** Chance/bonus/rate values use percentage points; damage multipliers and HP fractions do not. */
  baseCritChance: number; maxCritChance: number; maxCritMultiplier: number; maxLifesteal: number;
  roundLifestealMaxHpFraction: number; maxHealingBonus: number; maxPetPowerBonus: number;
  minPlayerDamage: number; minEnemyDamage: number;
}
// Empty tables are valid in the uninstalled skeleton, never a playable content pack.
export interface ContentRegistry {
  version: string; regions: readonly RegionDefinition[]; stages: readonly StageDefinition[]; enemies: readonly EnemyDefinition[];
  equipment: readonly EquipmentDefinition[]; gearEffects: readonly GearEffectDefinition[]; affixes: readonly AffixDefinition[];
  gems: readonly GemDefinition[]; petMilestones: MilestoneTable; petCooperation: readonly PetCooperationDefinition[];
  lootTables: readonly LootTableDefinition[]; qualityRows: readonly QualityRowDefinition[];
  challenges: readonly ChallengeDefinition[]; collections: readonly CollectionDefinition[]; economy: EconomyDefinition;
}
export interface RuleContext { snapshot: Readonly<SaveEnvelope>; content: Readonly<ContentRegistry> }
export interface CombatContext extends RuleContext { combat: Readonly<CombatSnapshot>; tick: number }
export interface CombatOutcome { plan: TransactionPlan; rewards: readonly RewardIntent[] }
export type RewardIntent =
  | { kind: 'enemy-killed'; enemyId: string; ordinal: number; xp: number; rewardId: string }
  | { kind: 'stage-completed'; stageId: StageId; challengeId: ChallengeId | null; rewardId: string }
  | { kind: 'first-wolf'; rewardId: 'first-wolf' }
  | { kind: 'first-gem-choice'; rewardId: 'first-cleared-verdant-02-gem'; gemType: GemType };
export interface RewardPlan {
  xp: number; items: readonly ItemInstance[]; pets: readonly PetInstance[]; drops: readonly GroundDrop[];
  nextEntitySeq: number; rngAfter: RngState;
}
export interface CombatPort {
  resolveImpact(context: CombatContext, rng: RandomSource): Result<CombatOutcome>;
  resolveHook(context: CombatContext, rng: RandomSource): Result<CombatOutcome>;
  recalculatePetGrowth(pet: Readonly<PetInstance>, table: MilestoneTable): PetGrowthResult;
  evaluateCooperation(context: CombatContext): readonly StatModifier[];
}
export interface ExecutionPermission { battleAllowed: boolean; groundAllowed: boolean; canRepeat: boolean; blockedReasons: readonly string[] }
export interface ExecutionEnvironment { visible: boolean; storageGate: boolean; settlementReady: boolean; exitReady: boolean }
export interface WorldPort {
  planWorldCommand(command: WorldCommand, context: RuleContext): Result<TransactionPlan>;
  getExecutionPermission(state: Readonly<ReleaseGameState>, environment: ExecutionEnvironment): ExecutionPermission;
  planStageExit(exit: ExitRequest, context: RuleContext, ground: GroundReadPort): Result<TransactionPlan>;
}
export interface InventoryPort {
  planCommand(command: InventoryCommand | SynthesisCommand | SalvageCommand | PetCommand, context: RuleContext,
    customization: CustomizationPort, growth: PetGrowthPort, rng: RandomSource): Result<TransactionPlan>;
  validatePlacement(input: PlacementInput, state: Readonly<InventoryState>): Result<PlacementPlan>;
  projectNetInventory(moves: readonly InventoryMove[], state: Readonly<InventoryState>): Result<InventoryProjection>;
  planTransfer(input: TransferInput, state: Readonly<InventoryState>): Result<TransferPlan>;
  previewInventory(command: InventoryCommand, context: RuleContext): Result<CommandPreview>;
  previewSynthesis(input: PairInput & { kind: 'equipment' | 'pet' }, context: RuleContext, customization: CustomizationPort, growth: PetGrowthPort): Result<CommandPreview>;
  previewSalvage(item: EntityReference, context: RuleContext, gems: GemReturnPort): Result<CommandPreview>;
}
export interface GemReturnPort { reserveReturnMaterialsGems(items: readonly ItemInstance[], inventory: Readonly<InventoryState>): Result<GemReturnPlan> }
export interface PetGrowthPort { recalculatePetGrowth(pet: Readonly<PetInstance>, table: MilestoneTable): PetGrowthResult }
export interface CustomizationPort extends GemReturnPort {
  planCommand(command: CustomizationCommand, context: RuleContext, rng: RandomSource): Result<TransactionPlan>;
  initializeAffixes(item: Readonly<ItemInstance>, origin: AffixRoll['origin'], content: ContentRegistry, rng: RandomSource): readonly AffixRoll[];
  extendForQualityUpgrade(item: Readonly<ItemInstance>, next: Quality, content: ContentRegistry, rng: RandomSource): ItemCustomizationDelta;
  previewGemCommand(command: Exclude<CustomizationCommand, { type: 'customize.reroll' }>, context: RuleContext): Result<CommandPreview>;
  previewReroll(command: Extract<CustomizationCommand, { type: 'customize.reroll' }>, context: RuleContext): Result<CommandPreview>;
  collectStatModifiers(item: Readonly<ItemInstance>, content: ContentRegistry): readonly StatModifier[];
  collectGemMechanics(item: Readonly<ItemInstance>, content: ContentRegistry): readonly MechanicSource[];
}
export interface LootSourceView { stageId: StageId; unlocked: boolean; challengeId: ChallengeId | null; tableId: LootTableId }
export interface TrackingView {
  target: TrackingTarget | null; sources: readonly LootSourceView[];
  owned: { equipped: number; warehouse: number; stacked: number; embedded: number; onGround: number };
  missing: { equipment: number; gems: number; dust: number };
}
export interface CollectionPort {
  planCollection(command: CollectionCommand, context: RuleContext): Result<TransactionPlan>;
  planLoadout(command: LoadoutCommand, context: RuleContext, inventory: InventoryPort): Result<TransactionPlan>;
  discover(events: readonly EventIntent[], state: Readonly<ReleaseGameState>): ReleaseGameState['collection'];
  queryLootSources(target: TrackingTarget, progress: Readonly<WorldProgress>, content: ContentRegistry): readonly LootSourceView[];
  getTrackingView(context: RuleContext): TrackingView;
  planTracking(command: TrackingCommand, context: RuleContext): Result<TransactionPlan>;
}
export interface PickupBlocker { dropId: string; reason: 'WAREHOUSE_FULL' | 'PET_CAPACITY' | 'LOOT_NOT_READY' | 'GEM_RETURN_INVALID' }
export interface GroundReadPort {
  getPendingPickupBlockers(context: RuleContext, inventory: InventoryPort): readonly PickupBlocker[];
  planNextExitPickup(exit: ExitRequest, context: RuleContext): Result<string | 'exit-ready'>;
}
export interface GroundPort extends GroundReadPort {
  planGroundDrops(reward: RewardPlan, context: RuleContext): Result<TransactionPlan>;
  planPickup(drop: EntityReference, context: RuleContext, inventory: InventoryPort): Result<TransactionPlan>;
  applyLootLifecycle(input: { kind: 'tick'; elapsedMs: number } | { kind: 'camp' | 'death' | 'load' }, context: RuleContext): Result<TransactionPlan>;
}
export interface EquippedItemView { item: Readonly<ItemInstance>; placement: Placement; cells: readonly Cell[]; iconKey: string }
export interface ItemDetailsView { item: Readonly<ItemInstance>; name: string; stats: readonly StatModifier[]; gems: readonly (GemUnit | null)[] }
export interface ReadModel {
  revision: number; hero: ReleaseGameState['hero']; stats: CombatStats; world: Readonly<WorldProgress>;
  activeRun: ReleaseGameState['activeRun']; lifecycle: ReleaseGameState['lifecycle'];
  gemStacks: InventoryState['gemStacks']; resources: InventoryState['resources'];
  collection: ReleaseGameState['collection']; loadouts: ReleaseGameState['loadouts']; settings: ReleaseGameState['settings'];
  catalog: Readonly<ContentRegistry>;
  backpack: { rows: number; cols: number; unlockedCells: readonly Cell[]; items: readonly EquippedItemView[]; selectedItemId: string | null };
  warehouse: { capacity: number; items: readonly Readonly<ItemInstance>[] };
  pets: { capacity: number; activePetId: string | null; owned: readonly Readonly<PetInstance>[] };
  battlefield: { enemies: CombatSnapshot['enemies']; round: number; cursor: CombatSnapshot['currentAction'] | null };
  ground: readonly Readonly<GroundDrop>[]; details: ItemDetailsView | null; tracking: TrackingView;
  autoRepeatEnabled: boolean; permission: ExecutionPermission; saveStatus: 'ready' | 'committing' | 'read-only' | 'conflict';
}
export type Dispatch = (command: Parameters<CommandPort['dispatch']>[0], envelope: CommandEnvelope) => ReturnType<CommandPort['dispatch']>;
export interface View { update(model: Readonly<ReadModel>): void; dispose(): void }
export type UICommands = Pick<CommandPort, 'preview' | 'dispatch'>;
export interface UIPort { render(model: Readonly<ReadModel>, commands: UICommands): View }
export interface VisualManifestEntry { id: string; src: string; width: number; height: number }
export interface BattleView { update(model: Readonly<ReadModel>): void; showCommittedEvents(events: readonly CommittedEvent[]): void; dispose(): void }
export interface VisualPort { createBattle(host: HTMLElement, model: Readonly<ReadModel>): BattleView; manifest: readonly VisualManifestEntry[] }
export interface RewardPort { resolveRewards(intent: RewardIntent, context: RuleContext, rng: RandomSource): Result<RewardPlan> }
export interface ModulePorts {
  combat: CombatPort; world: WorldPort; inventory: InventoryPort; collection: CollectionPort;
  customization: CustomizationPort; ground: GroundPort; ui: UIPort; visuals: VisualPort; rewards: RewardPort;
}
export interface MigrationInspection { sourceVersion: number; targetVersion: number; steps: readonly string[]; blockedBy: string | null }
export interface ReleaseStoragePort {
  loadSnapshot(): Promise<Result<SaveEnvelope | null>>;
  inspectMigration(raw: string): Result<MigrationInspection>;
  exportRawBackup(sourceKey: string): Result<string>;
  // A confirmed restore still performs compare-and-write and preserves the replaced raw value.
  restoreValidatedBackup(raw: string, expectedRevision: number, confirmed: true): Promise<Result<SaveEnvelope>>;
}
