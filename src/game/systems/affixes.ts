import { CONTENT_VERSION, type AffixRoll, type ContentRegistry, type ItemInstance, type RandomSource, type CombatStats, type ReleaseGameState, type WeaponStats } from '../contracts';
import type { Quality } from '../types';
import { round1 } from './resource-transactions';

export function rollAffixes(item: Pick<ItemInstance, 'definitionId' | 'quality'>, origin: AffixRoll['origin'], content: ContentRegistry, rng: RandomSource, existing: readonly AffixRoll[] = []): AffixRoll[] {
  const definition = content.equipment.find(d => d.id === item.definitionId)!;
  const pool = definition.affixPool.filter(id => !existing.some(roll => roll.statId === id) && (id !== 'critMultiplier' || item.quality >= 2));
  const rolls = [...existing];
  while (rolls.length < content.economy.affixCounts[item.quality]) {
    const id = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    const affix = content.affixes.find(d => d.statId === id)!;
    const range = affix.ranges.find(r => r.quality === item.quality)!;
    const value = Math.round((range.min + Math.floor(rng.next() * (Math.round((range.max-range.min)/range.step)+1)) * range.step) * 100) / 100;
    rolls.push({ statId: id, value, unit: affix.unit, rollVersion: content.version, rolledQuality: item.quality, origin });
  }
  return rolls;
}
export function makeItem(id: string, definitionId: ItemInstance['definitionId'], quality: Quality, content: ContentRegistry, rng: RandomSource, origin: AffixRoll['origin'] = 'drop'): ItemInstance {
  return { id, version: 1, definitionId, quality, baseKind: content.equipment.find(d => d.id === definitionId)!.baseKind, locked: false,
    affixes: rollAffixes({ definitionId, quality }, origin, content, rng), sockets: Array(content.economy.socketCounts[quality]).fill(null) };
}
export const affixValue = (item: ItemInstance, stat: AffixRoll['statId']) => item.affixes.find(a => a.statId === stat)?.value ?? 0;
export function gearParameters(item: ItemInstance, content: ContentRegistry) {
  return content.gearEffects.find(e => e.id === content.equipment.find(d => d.id === item.definitionId)!.effectId)!.parameters;
}
export function equipped(state: ReleaseGameState) {
  return Object.values(state.inventory.itemById).filter(item => state.inventory.locationById[item.id]?.kind === 'equipped').sort((a,b) => {
    const pa = state.inventory.locationById[a.id], pb = state.inventory.locationById[b.id];
    return pa.kind === 'equipped' && pb.kind === 'equipped' ? pa.row-pb.row || pa.col-pb.col || a.id.localeCompare(b.id) : 0;
  });
}
export function combatStats(state: ReleaseGameState, content: ContentRegistry): CombatStats {
  let maxHp = 100 + state.hero.healthPoints * 15, attack = 4 + state.hero.attackPoints * 2, defense = 0, healingBonus = 0, petPowerBonus = 0;
  for (const item of equipped(state)) {
    const base = gearParameters(item, content), q = content.economy.qualityMultipliers[item.quality];
    if (base.kind !== 'weapon') {
      maxHp += base.maxHp * q;
      if (base.kind === 'passive') { attack += base.attack * q; defense += base.defense * q; healingBonus += base.healingBonus; petPowerBonus += base.petPowerBonus; }
      maxHp += affixValue(item, 'maxHpAdd'); defense += affixValue(item, 'defenseAdd');
      healingBonus += affixValue(item, 'healingBonus'); petPowerBonus += affixValue(item, 'petPowerBonus');
    }
  }
  return { maxHp: Math.max(1,round1(maxHp)), attack: round1(attack), defense: Math.max(0,round1(defense)),
    healingBonus: Math.min(content.economy.maxHealingBonus, healingBonus), petPowerBonus: Math.min(content.economy.maxPetPowerBonus,petPowerBonus) };
}
export function weaponStats(item: ItemInstance, attack: number, content: ContentRegistry): WeaponStats | null {
  const base = gearParameters(item, content); if (base.kind !== 'weapon') return null;
  const e = content.economy, qualityMultiplier = e.qualityMultipliers[item.quality];
  return { baseDamage: base.baseDamage, attackCoefficient: base.attackCoefficient, qualityMultiplier,
    damageD: (base.baseDamage + affixValue(item, 'weaponBaseAdd') + attack * base.attackCoefficient) * qualityMultiplier,
    extraHits: Math.min(3, affixValue(item, 'extraHits')), critChance: Math.min(e.maxCritChance, e.baseCritChance + base.critChanceBonus + affixValue(item, 'critChance')),
    critMultiplier: Math.min(e.maxCritMultiplier, base.critMultiplier + affixValue(item, 'critMultiplier')), lifesteal: Math.min(e.maxLifesteal, affixValue(item, 'lifesteal')), armorPenetration: base.armorPenetration };
}
export { CONTENT_VERSION };
