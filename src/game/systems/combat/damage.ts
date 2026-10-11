import type { ActionSnapshot, ContentRegistry, EnemySnapshot } from '../../contracts';
import { Mutation, round1, type Mutable } from '../resource-transactions';
import { combatStats } from '../affixes';
import { awardKill } from '../reward-resolution';

export function combatOf(tx: Mutation) { const run=tx.draft.state.activeRun; if (run?.ruleset!=='release-r2') throw new Error('Expected release run'); return run.combat; }
export function damageEnemy(tx: Mutation, target: Mutable<EnemySnapshot>, raw: number, content: ContentRegistry, penetration=0, poison=false) {
  const c=combatOf(tx);
  let value=raw;
  if (!poison) {
    value=Math.max(.1,value-target.armor*(1-penetration));
    for (const m of target.mechanics) if ('kind' in m.parameters && m.parameters.kind==='escort-guard') value*=1-Math.min(m.parameters.cap,c.enemies.filter(e=>e.hp>0 && e.rank!=='B' && e.id!==target.id).length*m.parameters.reductionPerAlly);
  }
  value=round1(Math.max(.1,value));
  const shieldDamage=poison?0:Math.min(target.shield,value),hpDamage=round1(Math.min(target.hp,value-shieldDamage));
  target.shield=round1(target.shield-shieldDamage); target.hp=round1(target.hp-hpDamage);
  if (target.hp/target.maxHp<=.35 && target.mechanics.some(m=>'kind' in m.parameters && m.parameters.kind==='hp-threshold-damage')) target.frenzyActivated=true;
  if (target.hp===0) { target.poison=[]; awardKill(tx,target,content); }
  return { amount:value,hpDamage,shieldDamage };
}
export function damageHero(tx: Mutation, raw:number, content:ContentRegistry, poison=false) {
  const s=tx.draft.state,c=combatOf(tx),amount=round1(poison?raw:Math.max(content.economy.minEnemyDamage,raw-combatStats(s,content).defense));
  const shield=poison?0:Math.min(c.heroShield,amount);
  c.heroShield=round1(c.heroShield-shield); s.hero.hp=round1(Math.max(0,s.hero.hp-amount+shield));
  tx.events.push({ type:'DamageApplied',targetId:'hero',payload:{ amount,hpAfter:s.hero.hp,shieldAfter:c.heroShield } });
}
export function healHero(tx:Mutation,raw:number,source:ActionSnapshot,content:ContentRegistry,lifesteal=false) {
  const s=tx.draft.state,c=combatOf(tx); if (s.hero.hp<=0) return;
  const stats=combatStats(s,content), suppression=Math.min(1,...c.healingSuppression.map(e=>e.multiplier));
  let amount=round1(raw*(1+source.stats.healingBonus/100)*suppression);
  if (lifesteal) {
    amount=Math.max(0,Math.min(amount,round1(stats.maxHp*content.economy.roundLifestealMaxHpFraction-c.roundLifestealBudgetUsed)));
    c.roundLifestealBudgetUsed=round1(c.roundLifestealBudgetUsed+amount);
  }
  const actual=round1(Math.min(stats.maxHp-s.hero.hp,amount)),overheal=round1(amount-actual);
  s.hero.hp=round1(s.hero.hp+actual);
  if (source.sourceKind==='charm') c.roundEquipmentHealing=round1(c.roundEquipmentHealing+actual);
  if (c.activeWardGrade && overheal>0) {
    const grade=c.activeWardGrade,before=c.heroShield;
    c.heroShield=round1(Math.min(stats.maxHp*[.2,.25,.3][grade-1],c.heroShield+overheal*[.2,.3,.4][grade-1]));
    tx.events.push({ type:'ShieldChanged',sourceId:source.sourceId,payload:{ before,after:c.heroShield } });
  }
  tx.events.push({ type:'HealApplied',sourceId:source.sourceId,payload:{ actual,overheal,hpAfter:s.hero.hp } });
}
