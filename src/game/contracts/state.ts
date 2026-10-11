import type { Cell, GameState as LegacyGameState, ItemKind, PetKind, Quality } from '../types';
import type {
  ActionId, AffixStatId, ChallengeId, CollectionRewardId, DropId,
  EffectId, EncounterId, EnemyDefinitionId, EnemyId, EnemyRank, EntityId, EventId, ExitRequestId,
  GearEffectId, GemGrade, GemId, GemStackKey, GemType, HitId, ItemDefinitionId, ItemId,
  LoadoutSlotId, LootTableId, PetId, PetMilestoneId, PresentationId, RunId, SaveId, StageId,
} from './ids';
import type { TransactionReceipt } from './protocol';

export type { GemStackKey } from './ids';
export type Rotation = 0 | 1 | 2 | 3;
export interface GridPlacement { readonly row: number; readonly col: number; readonly rotation: Rotation }
export type AffixUnit = 'flat' | 'count' | 'percentage-points' | 'multiplier';
export type AffixOrigin = 'drop' | 'starter' | 'reroll' | 'upgrade-added' | 'migration';
export interface AffixRoll {
  readonly statId: AffixStatId;
  readonly value: number;
  /** Percentage values use the table's units: 15 means fifteen percentage points. */
  readonly unit: AffixUnit;
  readonly rollVersion: string;
  readonly rolledQuality: Quality;
  readonly origin: AffixOrigin;
}
export interface GemUnit { readonly id: GemId; readonly type: GemType; readonly grade: GemGrade }
export interface GemStack { readonly type: GemType; readonly grade: GemGrade; readonly count: number }
export interface ItemInstance {
  readonly id: ItemId;
  readonly version: number;
  readonly definitionId: ItemDefinitionId;
  readonly baseKind: ItemKind;
  readonly quality: Quality;
  readonly locked: boolean;
  readonly affixes: readonly AffixRoll[];
  readonly sockets: readonly (GemUnit | null)[];
}
export type ItemLocation =
  | ({ readonly kind: 'equipped' } & GridPlacement)
  | { readonly kind: 'warehouse'; readonly order: number }
  | { readonly kind: 'ground'; readonly dropId: DropId };
export interface PetInstance {
  readonly id: PetId;
  readonly version: number;
  readonly kind: PetKind;
  readonly quality: Quality;
  readonly cumulativeXp: number;
  readonly level: number;
  readonly milestoneIds: readonly PetMilestoneId[];
}
export type PetLocation = { readonly kind: 'owned' } | { readonly kind: 'ground'; readonly dropId: DropId };
export interface InventoryState {
  /** Maps include ground entities. Ownership comes only from the corresponding location. */
  readonly itemById: Readonly<Record<ItemId, ItemInstance>>;
  readonly locationById: Readonly<Record<ItemId, ItemLocation>>;
  readonly unlockedCells: readonly Readonly<Cell>[];
  readonly warehouseOrder: readonly ItemId[];
  readonly petById: Readonly<Record<PetId, PetInstance>>;
  readonly petLocationById: Readonly<Record<PetId, PetLocation>>;
  readonly activePetId: PetId | null;
  readonly gemStacks: Readonly<Record<GemStackKey, GemStack>>;
  readonly resources: { readonly dust: number };
}
export interface HeroState {
  readonly level: number;
  readonly cumulativeXp: number;
  readonly points: number;
  readonly attackPoints: number;
  readonly healthPoints: number;
  /** Sole current hero HP authority; combat snapshots do not duplicate it. */
  readonly hp: number;
}
export interface CombatStats {
  readonly maxHp: number;
  readonly attack: number;
  readonly defense: number;
  /** Percentage points: 20 means +20%, applied as 1 + value / 100. */
  readonly healingBonus: number;
  readonly petPowerBonus: number;
}
export interface WeaponStats {
  readonly baseDamage: number;
  readonly attackCoefficient: number;
  readonly qualityMultiplier: number;
  readonly damageD: number;
  readonly extraHits: number;
  /** critChance and lifesteal use percentage points; multipliers use scalar ratios. */
  readonly critChance: number;
  readonly critMultiplier: number;
  readonly lifesteal: number;
  readonly armorPenetration: number;
}
export interface StatModifier {
  readonly sourceId: ItemId;
  readonly statId: AffixStatId;
  readonly value: number;
  readonly unit: AffixUnit;
  readonly scope: 'weapon-local' | 'backpack-global';
}

export type TargetPolicy = 'front' | 'lowest-hp' | 'stable-ordinal' | 'self' | 'lowest-hp-ratio-ally';
export type GearMechanicParameters =
  | { readonly kind: 'weapon'; readonly baseDamage: number; readonly attackCoefficient: number; readonly primaryCoefficients: readonly number[]; readonly maxTargets: number; readonly targetPolicy: TargetPolicy; readonly critChanceBonus: number; readonly critMultiplier: number; readonly armorPenetration: number }
  | { readonly kind: 'passive'; readonly maxHp: number; readonly defense: number; readonly attack: number; readonly healingBonus: number; readonly petPowerBonus: number }
  | { readonly kind: 'periodic-heal'; readonly everyRounds: number; readonly healing: number; readonly maxHp: number };
export type EnemyMechanicParameters =
  | { readonly kind: 'armor'; readonly flatArmor: number }
  | { readonly kind: 'periodic-damage'; readonly everyActions: number; readonly multiplier: number }
  | { readonly kind: 'periodic-heal'; readonly everyActions: number; readonly maxHpFraction: number; readonly poisonedFraction: number; readonly targetPolicy: 'self' | 'lowest-hp-ratio-ally' }
  | { readonly kind: 'barrier'; readonly trigger: 'spawn' | 'action'; readonly everyActions: number; readonly maxHpFraction: number; readonly replacesAttack: boolean }
  | { readonly kind: 'retaliation'; readonly attackFraction: number; readonly maxPerSourceAction: number }
  | { readonly kind: 'cleanse'; readonly everyActions: number; readonly removedStacks: number }
  | { readonly kind: 'multi-hit'; readonly coefficients: readonly number[] }
  | { readonly kind: 'healing-suppression'; readonly everyActions: number; readonly multiplier: number; readonly expires: 'next-player-support-end' }
  | { readonly kind: 'hp-threshold-damage'; readonly hpFraction: number; readonly multiplier: number }
  | { readonly kind: 'escort-guard'; readonly reductionPerAlly: number; readonly cap: number }
  | { readonly kind: 'hero-poison'; readonly damagePerTick: number; readonly durationTicks: number; readonly maxStacks: number };
export interface PetMilestoneParameters {
  readonly requiredDirectHits: number;
  readonly requiresPoisonedTarget: boolean;
  readonly requiresEquipmentHealing: boolean;
  readonly requiresShield: boolean;
  /** Percentage points, added to petPowerBonus; 20 means +20%. */
  readonly powerBonus: number;
  readonly extraAttackCoefficient: number;
  readonly healingEveryRounds: number | null;
}
interface MechanicIdentity {
  readonly sourceId: EntityId;
  readonly sourceKind: 'gear' | 'gem' | 'pet' | 'enemy' | 'challenge';
  readonly definitionVersion: string;
}
export type MechanicDefinition =
  | { readonly effectId: GearEffectId; readonly parameters: GearMechanicParameters }
  | { readonly effectId: 'gem_venom'; readonly parameters: { readonly grade: GemGrade; readonly damagePerStack: number; readonly durationTicks: number; readonly maxPerAction: number; readonly maxPerEnemy: number } }
  | { readonly effectId: 'gem_charge'; readonly parameters: { readonly grade: GemGrade; readonly cycleLength: number; readonly normalMultiplier: number; readonly chargedMultiplier: number } }
  | { readonly effectId: 'gem_ward'; readonly parameters: { readonly grade: GemGrade; readonly overhealFraction: number; readonly maxHpCapFraction: number } }
  | { readonly effectId: 'gem_chain'; readonly parameters: { readonly grade: GemGrade; readonly coefficient: number; readonly maxPerAction: number; readonly maxPerRound: number } }
  | { readonly effectId: 'gem_sweep'; readonly parameters: { readonly grade: GemGrade; readonly coefficient: number; readonly maxTargets: number; readonly maxPerAction: number } }
  // bonusPerStack uses percentage points (6 means +6% per stack).
  | { readonly effectId: 'gem_bond'; readonly parameters: { readonly grade: GemGrade; readonly bonusPerStack: number; readonly maxStacks: number; readonly maxPerAction: number } }
  | { readonly effectId: Exclude<EffectId, GearEffectId | `gem_${GemType}` | PetMilestoneId>; readonly parameters: EnemyMechanicParameters }
  | { readonly effectId: PetMilestoneId; readonly parameters: PetMilestoneParameters }
;
export type MechanicSource = MechanicIdentity & MechanicDefinition;

export type HitClass = 'primary' | 'extra' | 'proc';
export type ImpactOrigin =
  | { readonly kind: 'weapon-direct'; readonly itemId: ItemId }
  | { readonly kind: 'unarmed' }
  | { readonly kind: 'pet'; readonly petId: PetId }
  | { readonly kind: 'enemy'; readonly enemyId: EnemyId }
  | { readonly kind: 'dot'; readonly sourceId: EntityId }
  | { readonly kind: 'gem-proc'; readonly parentHitId: HitId; readonly depth: 1; readonly effectId: 'gem_chain' | 'gem_sweep' }
  | { readonly kind: 'retaliation'; readonly enemyId: EnemyId; readonly parentHitId: HitId };
export interface HitPlanEntry {
  readonly hitIndex: number;
  readonly targetOrdinal: number;
  readonly hitClass: Exclude<HitClass, 'proc'>;
  readonly coefficient: number;
  readonly targetPolicy: TargetPolicy;
  readonly effectSourceId: EntityId;
  /** Zero-based due tick within the ten-tick source action, not an extra action duration. */
  readonly dueTick: number;
}
export interface ImpactCursor {
  readonly rootActionId: ActionId;
  readonly hitIndex: number;
  readonly targetOrdinal: number;
  readonly phase: 'waiting' | 'ready' | 'action-complete';
  readonly lastResolvedHitId: HitId | null;
  /** Ticks left in the source action; hit due ticks are relative to its start. */
  readonly remainingTicks: number;
}
export type ActionSourceKind = 'weapon' | 'unarmed' | 'charm' | 'pet' | 'enemy';
export interface SupportSnapshot {
  readonly kind: 'healing' | 'pet-attack';
  readonly power: number;
  readonly everyRounds: number;
}
export interface RoundSourceSnapshot {
  readonly sourceId: EntityId;
  readonly sourceKind: ActionSourceKind;
  readonly sourceVersion: number;
  readonly placement: GridPlacement | null;
  readonly stats: CombatStats;
  readonly weaponStats: WeaponStats | null;
  readonly support: SupportSnapshot | null;
  readonly mechanics: readonly MechanicSource[];
}
export interface CombatAction {
  readonly actionId: ActionId;
  readonly sourceId: EntityId;
  readonly sourceKind: ActionSourceKind;
}
export interface ActionSnapshot extends RoundSourceSnapshot {
  readonly actionId: ActionId;
  readonly sourceStillEligible: boolean;
  readonly beforeActionResolved: boolean;
  readonly chargeMultiplier: number;
  readonly originalTargetIds: readonly EnemyId[];
  readonly hitPlan: readonly HitPlanEntry[];
  readonly cursor: ImpactCursor;
}
export interface CombatHookCursor {
  readonly phase: 'round-start' | 'enemy-before-action' | 'enemy-dot' | 'hero-dot' | 'support-end' | 'round-end';
  readonly sourceOrdinal: number;
  readonly targetOrdinal: number;
  readonly effectOrdinal: number;
  readonly resolved: boolean;
}
export interface PoisonStack {
  readonly sourceId: EntityId;
  readonly sourceQuality: Quality;
  readonly damagePerTick: number;
  readonly remainingTicks: number;
  readonly createdOrder: number;
}
export interface EnemySnapshot {
  readonly id: EnemyId;
  readonly definitionId: EnemyDefinitionId;
  readonly rank: EnemyRank;
  readonly ordinal: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly attack: number;
  readonly armor: number;
  readonly xp: number;
  readonly shield: number;
  readonly actionCount: number;
  /** Once enemy_frenzy activates, healing above the threshold does not undo it. */
  readonly frenzyActivated: boolean;
  readonly poison: readonly PoisonStack[];
  readonly mechanics: readonly MechanicSource[];
}
export interface ActionProcBudget {
  readonly actionId: ActionId;
  readonly venomApplications: number;
  readonly bondCredits: number;
  readonly chainUsed: boolean;
  readonly sweepUsed: boolean;
  readonly retaliatedEnemyIds: readonly EnemyId[];
}
export interface CombatSnapshot {
  readonly round: number;
  readonly stage: 'weapons' | 'support' | 'enemy-dot' | 'enemies' | 'hero-dot' | 'round-end';
  readonly enemies: readonly EnemySnapshot[];
  readonly queue: readonly CombatAction[];
  readonly actionIndex: number;
  readonly currentAction: ActionSnapshot | null;
  readonly roundSourceSnapshots: readonly RoundSourceSnapshot[];
  readonly cancelledSourceIds: readonly EntityId[];
  readonly hookCursor: CombatHookCursor | null;
  readonly dueSupportSourceIds: readonly EntityId[];
  readonly heroPoison: readonly PoisonStack[];
  readonly heroShield: number;
  readonly healingSuppression: readonly { readonly sourceId: EnemyId; readonly multiplier: number; readonly expiresAfterSupportRound: number }[];
  readonly chargeActionsBySource: Readonly<Record<ItemId, number>>;
  readonly bondStacks: number;
  readonly activeWardGrade: GemGrade | null;
  readonly activeBondGrade: GemGrade | null;
  readonly roundDirectHits: number;
  readonly roundEquipmentHealing: number;
  readonly roundLifestealBudgetUsed: number;
  readonly roundChainUses: number;
  readonly actionProcBudgets: readonly ActionProcBudget[];
  readonly killedEnemyIds: readonly EnemyId[];
  readonly heroDeathResolved: boolean;
  readonly roundEndResolved: boolean;
  readonly waveCompletionResolved: boolean;
  readonly stageCompletionResolved: boolean;
}

export type RunStatus = 'wave-entry' | 'travel' | 'combat' | 'settlement' | 'exit-wait' | 'dead';
interface RunIdentity {
  readonly runId: RunId;
  readonly stageId: StageId;
  readonly challengeId: ChallengeId | null;
  readonly contentVersion: string;
  readonly definitionVersion: string;
  readonly waveIndex: number;
  readonly encounterId: EncounterId;
  readonly status: RunStatus;
}
export type ActiveRun =
  | (RunIdentity & { readonly ruleset: 'release-r2'; readonly phaseRemainingTicks: number; readonly combat: CombatSnapshot })
  | (RunIdentity & {
      readonly ruleset: 'legacy-v2';
      readonly legacyFloor: number;
      readonly legacyWave: number;
      readonly legacyTime: number;
      readonly legacyTickRemainder: number;
      readonly combat: Readonly<Omit<LegacyGameState['battle'], 'enemies' | 'actions'>> & {
        readonly enemies: readonly Readonly<LegacyGameState['battle']['enemies'][number]>[];
        readonly actions: readonly Readonly<LegacyGameState['battle']['actions'][number]>[];
      };
    });
export type FirstGemReward =
  | { readonly state: 'unearned' }
  | { readonly state: 'awaiting-choice'; readonly runId: RunId }
  | { readonly state: 'chosen'; readonly kind: GemType; readonly dropId: DropId };
export interface WorldProgress {
  readonly unlockedStageIds: readonly StageId[];
  readonly completedStageIds: readonly StageId[];
  readonly completionCounts: Readonly<Partial<Record<StageId, number>>>;
  readonly selectedStageId: StageId;
  readonly selectedChallengeId: ChallengeId | null;
  readonly firstWolfGranted: boolean;
  readonly oneTimeRewards: { readonly 'first-cleared-verdant-02-gem': FirstGemReward };
  readonly importedProgress: { readonly sourceVersion: 1 | 2; readonly floor: number; readonly unlockedFloor: number; readonly completedRuns: number } | null;
}
export type GroundPayload =
  | { readonly kind: 'equipment'; readonly itemId: ItemId }
  | { readonly kind: 'pet'; readonly petId: PetId }
  | { readonly kind: 'gem'; readonly type: GemType; readonly grade: GemGrade; readonly count: number }
  | { readonly kind: 'dust'; readonly amount: number };
export interface LootProvenance {
  readonly origin: 'enemy-kill' | 'challenge-clear' | 'first-wolf' | 'first-gem-choice' | 'legacy-pending';
  readonly runId: RunId | null;
  readonly encounterId: EncounterId | null;
  readonly stageId: StageId | null;
  readonly waveIndex: number | null;
  readonly enemyId: EnemyId | null;
  readonly eventId: EventId;
  readonly rewardSlot: 'equipment' | 'pet' | 'gem' | 'dust';
  readonly lootTableId: LootTableId | null;
  readonly challengeId: ChallengeId | null;
}
export interface GroundDrop {
  readonly id: DropId;
  readonly version: number;
  readonly payloadRef: GroundPayload;
  readonly provenance: LootProvenance;
  readonly position: { readonly x: number; readonly y: number };
  readonly order: number;
  readonly state: 'falling' | 'available' | 'claimed';
  readonly claimRemainingMs: number;
}
export interface CollectionState {
  readonly equipmentHighestQualityByDefinition: Readonly<Partial<Record<ItemDefinitionId, Quality>>>;
  readonly gemHighestGradeByKind: Readonly<Partial<Record<GemType, GemGrade>>>;
  readonly petHighestQualityBySpecies: Readonly<Partial<Record<PetKind, Quality>>>;
  readonly petHighestLevelBySpecies: Readonly<Partial<Record<PetKind, number>>>;
  readonly rewardClaimIds: readonly CollectionRewardId[];
  readonly selectedPresentationIds: readonly PresentationId[];
}
export interface Loadout {
  readonly slotId: LoadoutSlotId;
  readonly name: string;
  readonly items: readonly { readonly itemId: ItemId; readonly observedVersion: number; readonly placement: GridPlacement }[];
  readonly pet: { readonly petId: PetId; readonly observedVersion: number } | null;
}
export type TrackingTarget =
  | { readonly kind: 'equipment'; readonly definitionId: ItemDefinitionId; readonly quality: Quality; readonly count: number }
  | { readonly kind: 'gem'; readonly type: GemType; readonly grade: GemGrade; readonly count: number };
export interface TrackingState {
  readonly target: TrackingTarget | null;
  readonly selectedSourceStageId: StageId | null;
  readonly craftingGoal: { readonly kind: 'synthesis' | 'reroll'; readonly itemId: ItemId } | null;
}
export const PAUSE_REASONS = ['manual', 'organize', 'capacity', 'hidden', 'camp', 'load', 'save-error', 'save-conflict'] as const;
export type PauseReason = typeof PAUSE_REASONS[number];
export type PendingChoice =
  | { readonly kind: 'death'; readonly runId: RunId }
  | { readonly kind: 'first-gem'; readonly rewardId: 'first-cleared-verdant-02-gem' }
  | { readonly kind: 'stage-result'; readonly runId: RunId };
export interface ExitRequest {
  readonly requestId: ExitRequestId;
  readonly fromRunId: RunId;
  readonly targetStageId: StageId;
  readonly challengeId: ChallengeId | null;
  readonly reason: 'repeat' | 'next' | 'abandon' | 'retry';
  readonly nextDropId: DropId | null;
}
export interface LifecycleState {
  readonly resumeRequired: boolean;
  readonly pauseReasons: readonly PauseReason[];
  readonly pendingChoice: PendingChoice | null;
  readonly exitRequest: ExitRequest | null;
}
export interface UserSettings {
  readonly autoRepeatEnabled: boolean;
  readonly musicVolume: number;
  readonly soundVolume: number;
  readonly musicMuted: boolean;
  readonly soundMuted: boolean;
  readonly reducedMotion: boolean;
  readonly introSeen: boolean;
}
export interface SimulationState { readonly elapsedTicks: number; readonly tickRemainderMs: number }
export interface ReleaseGameState {
  readonly hero: HeroState;
  readonly inventory: InventoryState;
  readonly world: WorldProgress;
  readonly activeRun: ActiveRun | null;
  readonly groundDrops: readonly GroundDrop[];
  readonly collection: CollectionState;
  readonly loadouts: readonly Loadout[];
  readonly tracking: TrackingState;
  readonly lifecycle: LifecycleState;
  readonly settings: UserSettings;
  readonly simulation: SimulationState;
}
export interface RngState {
  readonly algorithm: 'xorshift32-v1';
  readonly seed: number;
  readonly state: number;
  readonly draws: number;
}
export interface RngStreams { readonly combat: RngState; readonly reward: RngState; readonly crafting: RngState }
export interface SaveCounters {
  readonly nextEntitySeq: number;
  readonly nextRunSeq: number;
  readonly nextTransactionSeq: number;
  readonly eventSeq: number;
  readonly lastAppliedCommandSeq: number;
}
export interface MigrationReport {
  readonly sourceVersion: 1 | 2 | 3;
  readonly sourceKey: string;
  readonly sourceDigest: string;
  readonly initializationVersion: string;
  readonly preservedEntityIds: readonly EntityId[];
  readonly movedItemIds: readonly ItemId[];
  readonly pendingDropIds: readonly DropId[];
  readonly combatDisposition: 'legacy-v2-preserved' | 'v1-restart-required' | 'release-preserved';
  readonly warnings: readonly string[];
}
export interface SaveEnvelope {
  readonly schemaVersion: 3;
  readonly contractVersion: string;
  readonly contentVersion: string;
  readonly saveId: SaveId;
  readonly revision: number;
  readonly state: ReleaseGameState;
  readonly rng: RngStreams;
  readonly counters: SaveCounters;
  readonly receipts: readonly TransactionReceipt[];
  readonly migrationReport: MigrationReport | null;
}
