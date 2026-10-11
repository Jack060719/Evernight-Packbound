/** Task 04 identity catalog. Values contain no release encounter or balance data. */
export const REGION_IDS = ['verdant', 'ember', 'moonwell', 'mire', 'gale', 'frost', 'astral'] as const;
export type RegionId = typeof REGION_IDS[number];
export const STAGE_NUMBERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] as const;
export type StageNumber = typeof STAGE_NUMBERS[number];
export type StageId = `${RegionId}-${StageNumber}`;
export type BossDefinitionId = `${RegionId}-boss-${StageNumber}`;
export const STAGE_IDS: readonly StageId[] = REGION_IDS.flatMap(region => STAGE_NUMBERS.map(stage => `${region}-${stage}` as StageId));
export const BOSS_IDS: readonly BossDefinitionId[] = REGION_IDS.flatMap(region => STAGE_NUMBERS.map(stage => `${region}-boss-${stage}` as BossDefinitionId));

export const REGULAR_ENEMY_IDS = [
  'verdant-moss-slime', 'verdant-seedling', 'verdant-bark-bone', 'verdant-dew-bud', 'verdant-antler-guard',
  'ember-crystal-bug', 'ember-coal-mote', 'ember-ore-bone', 'ember-hearth-bud', 'ember-quarry-golem',
  'moonwell-lantern-slime', 'moonwell-spark', 'moonwell-shell-bone', 'moonwell-lotus-spirit', 'moonwell-mirror-wisp',
  'mire-mud-slime', 'mire-spore', 'mire-reed-bone', 'mire-herb-spirit', 'mire-marsh-witch',
  'gale-chime-bird', 'gale-featherling', 'gale-wind-bone', 'gale-bell-spirit', 'gale-horn-falcon',
  'frost-moss-slime', 'frost-ice-mote', 'frost-ice-bone', 'frost-warm-spirit', 'frost-white-antler',
  'astral-shard', 'astral-orbit', 'astral-star-bone', 'astral-prism-spirit', 'astral-gear-sentinel',
] as const;
export type RegularEnemyDefinitionId = typeof REGULAR_ENEMY_IDS[number];
export type EnemyDefinitionId = RegularEnemyDefinitionId | BossDefinitionId;
export const ENEMY_DEFINITION_IDS: readonly EnemyDefinitionId[] = [...REGULAR_ENEMY_IDS, ...BOSS_IDS];
export const ENEMY_RANKS = ['N', 'S', 'G', 'H', 'E', 'B'] as const;
export type EnemyRank = typeof ENEMY_RANKS[number];
export const WAVE_PATTERN_IDS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const;
export type WavePatternId = typeof WAVE_PATTERN_IDS[number];

export const ITEM_DEFINITION_IDS = [
  'sword', 'dagger', 'bow', 'staff', 'armor', 'shield', 'ring', 'charm',
  'verdant-scout-dagger', 'verdant-dew-charm', 'ember-prism-bow', 'ember-kiln-shield',
  'moonwell-wide-staff', 'moonwell-lantern-ring', 'mire-reed-bow', 'mire-moss-armor',
  'gale-feather-dagger', 'gale-wind-ring', 'frost-balm-charm', 'frost-plate-armor',
  'astral-focus-sword', 'astral-bond-ring',
] as const;
export type ItemDefinitionId = typeof ITEM_DEFINITION_IDS[number];
export const GEM_TYPES = ['venom', 'charge', 'ward', 'chain', 'sweep', 'bond'] as const;
export type GemType = typeof GEM_TYPES[number];
export const GEM_GRADES = [1, 2, 3] as const;
export type GemGrade = typeof GEM_GRADES[number];
export type GemStackKey = `${GemType}:${GemGrade}`;
export const GEM_STACK_KEYS: readonly GemStackKey[] = GEM_TYPES.flatMap(type => GEM_GRADES.map(grade => `${type}:${grade}` as GemStackKey));
export const AFFIX_STAT_IDS = ['weaponBaseAdd', 'extraHits', 'critChance', 'critMultiplier', 'lifesteal', 'maxHpAdd', 'defenseAdd', 'healingBonus', 'petPowerBonus'] as const;
export type AffixStatId = typeof AFFIX_STAT_IDS[number];

export const GEAR_EFFECT_IDS = [
  'weapon_single', 'weapon_flurry', 'weapon_low_hp', 'weapon_area_three',
  'armor_vitality', 'shield_defense', 'ring_attack', 'charm_periodic_three',
  'weapon_scout_flurry', 'charm_dew_three', 'weapon_front_bow', 'shield_kiln',
  'weapon_area_five', 'ring_lantern', 'weapon_pierce_bow', 'armor_moss',
  'weapon_feather_flurry', 'ring_wind', 'charm_periodic_two', 'armor_frost',
  'weapon_focus_single', 'ring_bond',
] as const;
export type GearEffectId = typeof GEAR_EFFECT_IDS[number];
export const GEM_EFFECT_IDS = ['gem_venom', 'gem_charge', 'gem_ward', 'gem_chain', 'gem_sweep', 'gem_bond'] as const;
export type GemEffectId = typeof GEM_EFFECT_IDS[number];
export const ENEMY_EFFECT_IDS = [
  'enemy_armor', 'enemy_heavy', 'enemy_regen', 'enemy_barrier', 'enemy_thorns',
  'enemy_cleanse', 'enemy_double', 'enemy_suppress_healing', 'enemy_frenzy', 'enemy_escort_guard',
  'enemy_guard_armor', 'enemy_heal_ally',
] as const;
export type EnemyEffectId = typeof ENEMY_EFFECT_IDS[number];
export const ELITE_EFFECT_IDS = ['elite_barrier_cycle', 'elite_armor', 'elite_spawn_barrier', 'elite_venom', 'elite_double', 'elite_healing_suppression', 'elite_cleanse'] as const;
export type EliteEffectId = typeof ELITE_EFFECT_IDS[number];
export const PET_MILESTONE_IDS = ['wolf-l3', 'wolf-l6', 'wolf-l10', 'fairy-l3', 'fairy-l6', 'fairy-l10'] as const;
export type PetMilestoneId = typeof PET_MILESTONE_IDS[number];
export const EFFECT_IDS = [...GEAR_EFFECT_IDS, ...GEM_EFFECT_IDS, ...ENEMY_EFFECT_IDS, ...ELITE_EFFECT_IDS, ...PET_MILESTONE_IDS] as const;
export type EffectId = typeof EFFECT_IDS[number];

export const CHALLENGE_IDS = ['verdant-thorns', 'ember-heavy', 'moonwell-barrier', 'mire-recovery', 'gale-double', 'frost-suppression', 'astral-cleanse'] as const;
export type ChallengeId = typeof CHALLENGE_IDS[number];
export const FIRST_REWARD_IDS = ['first-wolf', 'first-cleared-verdant-02-gem'] as const;
export type FirstRewardId = typeof FIRST_REWARD_IDS[number];
// Names mechanically identify the already approved T08 milestones and cosmetic rewards.
export type RegionCollectionRewardId = `collection-region-${RegionId}`;
export const COLLECTION_REWARD_IDS = [
  'collection-equipment-8', 'collection-equipment-14', 'collection-equipment-22',
  'collection-gems-6', 'collection-pets-level-6',
  ...REGION_IDS.map(region => `collection-region-${region}` as RegionCollectionRewardId),
  'collection-all-regions',
] as const;
export type CollectionRewardId = typeof COLLECTION_REWARD_IDS[number];
export type RegionPresentationId = `camp-rug-${RegionId}`;
export const PRESENTATION_IDS = [
  'wooden-nameplate', 'goldleaf-backpack-border', 'camp-equipment-rack', 'six-gem-lantern', 'spirit-companion-flag',
  ...REGION_IDS.map(region => `camp-rug-${region}` as RegionPresentationId),
  'title-astral-traveller',
] as const;
export type PresentationId = typeof PRESENTATION_IDS[number];
export type LootTableId = `loot-${RegionId}` | 'loot-legacy-v2';
export const LOOT_TABLE_IDS: readonly LootTableId[] = [...REGION_IDS.map(region => `loot-${region}` as LootTableId), 'loot-legacy-v2'];
export type QualityRowId = `quality-depth-${StageNumber}` | 'quality-legacy-v2';
export const QUALITY_ROW_IDS: readonly QualityRowId[] = [...STAGE_NUMBERS.map(depth => `quality-depth-${depth}` as QualityRowId), 'quality-legacy-v2'];
export const LOADOUT_SLOT_IDS = [1, 2, 3, 4, 5, 6] as const;
export type LoadoutSlotId = typeof LOADOUT_SLOT_IDS[number];

// Instance aliases preserve existing IDs (such as i1 and p1); new IDs use the envelope counters.
export type EntityId = string;
export type ItemId = EntityId;
export type PetId = EntityId;
export type EnemyId = EntityId;
export type GemId = EntityId;
export type DropId = EntityId;
export type SaveId = string;
export type RunId = string;
export type EncounterId = string;
export type ActionId = string;
export type HitId = string;
export type EventId = string;
export type TransactionId = string;
export type CommandId = string;
export type ExitRequestId = string;
