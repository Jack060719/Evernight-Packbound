import type { ActionSnapshot, ContentRegistry, EnemySnapshot } from '../../contracts';
import { Mutation, round1, type Mutable } from '../resource-transactions';
import { living } from './queue';
import { combatOf, damageEnemy, damageHero, healHero } from './damage';

export function beforeAction(tx:Mutation,action:Mutable<ActionSnapshot>,content:ContentRegistry) {
  if (action.beforeActionResolved) return;
  action.beforeActionResolved=true;
  const c=combatOf(tx);
  if (action.sourceKind==='pet') {
    let bonus=action.stats.petPowerBonus+(c.activeBondGrade?c.bondStacks*6:0);
    const target=living(c)[0];
    for (const m of action.mechanics) {
      if (m.sourceKind!=='pet' || !('powerBonus' in m.parameters)) continue;
      const p=m.parameters;
      if (p.requiredDirectHits && c.roundDirectHits<p.requiredDirectHits || p.requiresPoisonedTarget && !target?.poison.length || p.requiresEquipmentHealing && c.roundEquipmentHealing<=0 || p.requiresShield && c.heroShield<=0) continue;
      bonus+=p.powerBonus;
    }
    action.chargeMultiplier=1+bonus/100; c.bondStacks=0;
  }
  if (action.sourceKind!=='enemy') return;
  const enemy=c.enemies.find(e=>e.id===action.sourceId)!; enemy.actionCount++;
  // Cleanse precedes regeneration even when effect records arrive in another order.
  for (const m of enemy.mechanics) if ('kind' in m.parameters && m.parameters.kind==='cleanse' && enemy.actionCount%m.parameters.everyActions===0) enemy.poison.splice(0,m.parameters.removedStacks);
  for (const m of enemy.mechanics) if ('kind' in m.parameters && m.parameters.kind==='periodic-heal' && 'everyActions' in m.parameters && enemy.actionCount%m.parameters.everyActions===0) {
    const p=m.parameters,target=p.targetPolicy==='self'?enemy:living(c,'lowest-hp-ratio-ally')[0] as Mutable<EnemySnapshot>;
    if (target) target.hp=round1(Math.min(target.maxHp,target.hp+target.maxHp*(target.poison.length?p.poisonedFraction:p.maxHpFraction)));
    if (p.targetPolicy!=='self') action.hitPlan=[];
  }
  for (const m of enemy.mechanics) if ('kind' in m.parameters && m.parameters.kind==='barrier' && m.parameters.trigger==='action' && enemy.actionCount%m.parameters.everyActions===0) {
    enemy.shield=Math.max(enemy.shield,round1(enemy.maxHp*m.parameters.maxHpFraction));
    if (m.parameters.replacesAttack) action.hitPlan=[];
  }
}
export function resolveImpact(tx:Mutation,action:Mutable<ActionSnapshot>,content:ContentRegistry) {
  const c=combatOf(tx),s=tx.draft.state,entry=action.hitPlan[action.cursor.hitIndex];
  if (!entry) return;
  const hitId=`${action.actionId}:h${entry.hitIndex}:t${entry.targetOrdinal}`;
  if (action.cursor.lastResolvedHitId===hitId) return;
  const budget=c.actionProcBudgets.find(b=>b.actionId===action.actionId)!;
  if (action.sourceKind==='enemy') {
    const enemy=c.enemies.find(e=>e.id===action.sourceId)!;
    let multiplier=entry.coefficient;
    for (const m of enemy.mechanics) {
      if ('kind' in m.parameters && m.parameters.kind==='periodic-damage' && enemy.actionCount%m.parameters.everyActions===0) multiplier*=m.parameters.multiplier;
      if ('kind' in m.parameters && m.parameters.kind==='hp-threshold-damage' && enemy.frenzyActivated) multiplier*=m.parameters.multiplier;
    }
    damageHero(tx,enemy.attack*multiplier,content);
    if (entry.hitIndex===action.hitPlan.length-1) for (const m of enemy.mechanics) {
      const p=m.parameters;
      if ('kind' in p && p.kind==='healing-suppression' && enemy.actionCount%p.everyActions===0) {
        c.healingSuppression=c.healingSuppression.filter(e=>e.sourceId!==enemy.id);
        c.healingSuppression.push({ sourceId:enemy.id,multiplier:p.multiplier,expiresAfterSupportRound:c.round+1 });
      }
      if ('kind' in p && p.kind==='hero-poison' && c.heroPoison.length<p.maxStacks) c.heroPoison.push({ sourceId:enemy.id,sourceQuality:0,damagePerTick:p.damagePerTick,remainingTicks:p.durationTicks,createdOrder:s.simulation.elapsedTicks });
    }
  } else if (action.sourceKind==='charm' || action.sourceKind==='pet' && action.support?.kind==='healing') {
    healHero(tx,action.support!.power*action.chargeMultiplier,action,content);
  } else {
    const original=entry.hitClass==='primary' && action.originalTargetIds.length>1 ? c.enemies.find(e=>e.ordinal===entry.targetOrdinal && e.hp>0) : undefined;
    const target=(original ?? living(c,entry.targetPolicy)[0]) as Mutable<EnemySnapshot>|undefined;
    if (target) {
      const weapon=action.sourceKind==='weapon',w=action.weaponStats;
      const thorns=weapon?target.mechanics.find(m=>'kind' in m.parameters && m.parameters.kind==='retaliation'):undefined;
      const reflect=thorns && 'kind' in thorns.parameters && thorns.parameters.kind==='retaliation' && !budget.retaliatedEnemyIds.includes(target.id) ? Math.max(1,Math.round(target.attack*thorns.parameters.attackFraction)) : 0;
      const critical=weapon && tx.random.combat.next()<w!.critChance/100;
      const raw=weapon ? w!.damageD*entry.coefficient*action.chargeMultiplier*(critical?w!.critMultiplier:1)
        : action.sourceKind==='pet' ? action.support!.power*entry.coefficient*action.chargeMultiplier : action.stats.attack;
      const damage=damageEnemy(tx,target,raw,content,w?.armorPenetration??0);
      tx.events.push({ type:'HitResolved',sourceId:action.sourceId,targetId:target.id,rootActionId:action.actionId,hitId,hitClass:entry.hitClass,
        payload:{ hitId,...damage,critical } });
      if (weapon) {
        if (damage.hpDamage>0) {
          c.roundDirectHits++;
          if (w!.lifesteal>0) healHero(tx,damage.hpDamage*w!.lifesteal/100,action,content,true);
          const venom=action.mechanics.find(m=>m.effectId==='gem_venom');
          if (venom?.effectId==='gem_venom' && target.hp>0 && budget.venomApplications<venom.parameters.maxPerAction && target.poison.length<venom.parameters.maxPerEnemy) {
            const quality=content.economy.qualityMultipliers.indexOf(w!.qualityMultiplier) as 0|1|2|3|4|5;
            target.poison.push({ sourceId:action.sourceId,sourceQuality:quality,damagePerTick:venom.parameters.damagePerStack*w!.qualityMultiplier,remainingTicks:venom.parameters.durationTicks,createdOrder:s.simulation.elapsedTicks }); budget.venomApplications++;
          }
          if (c.activeBondGrade && s.inventory.activePetId && budget.bondCredits<2) { c.bondStacks=Math.min(c.activeBondGrade+2,c.bondStacks+1); budget.bondCredits++; }
        }
        const proc=(victim:Mutable<EnemySnapshot>,coefficient:number,effectId:'gem_sweep'|'gem_chain')=>{
          const damage=damageEnemy(tx,victim,w!.damageD*coefficient,content);
          tx.events.push({ type:'HitResolved',sourceId:action.sourceId,targetId:victim.id,rootActionId:action.actionId,effectId,hitClass:'proc',hitId:`${hitId}:${effectId}:${victim.id}`,
            payload:{ hitId:`${hitId}:${effectId}:${victim.id}`,...damage,critical:false } });
        };
        const sweep=action.mechanics.find(m=>m.effectId==='gem_sweep');
        if (sweep?.effectId==='gem_sweep' && !budget.sweepUsed) {
          budget.sweepUsed=true;
          for (const other of living(c).filter(e=>e.id!==target.id && !action.originalTargetIds.includes(e.id)).slice(0,sweep.parameters.maxTargets)) proc(other as Mutable<EnemySnapshot>,sweep.parameters.coefficient,'gem_sweep');
        }
        const chain=action.mechanics.find(m=>m.effectId==='gem_chain'),other=living(c,'lowest-hp')[0];
        if (target.hp===0 && chain?.effectId==='gem_chain' && !budget.chainUsed && c.roundChainUses<3 && other) {
          budget.chainUsed=true; c.roundChainUses++; proc(other as Mutable<EnemySnapshot>,chain.parameters.coefficient,'gem_chain');
        }
        if (reflect) { budget.retaliatedEnemyIds.push(target.id); damageHero(tx,reflect,content); }
      }
    }
  }
  action.cursor.lastResolvedHitId=hitId; action.cursor.hitIndex++; action.cursor.targetOrdinal=entry.targetOrdinal;
  action.cursor.phase=action.cursor.hitIndex===action.hitPlan.length?'action-complete':'waiting';
}
export function poisonPhase(tx:Mutation,content:ContentRegistry,hero:boolean) {
  const c=combatOf(tx);
  if (hero) {
    for (const stack of c.heroPoison) { if (tx.draft.state.hero.hp>0) damageHero(tx,stack.damagePerTick,content,true); stack.remainingTicks--; }
    c.heroPoison=c.heroPoison.filter(p=>p.remainingTicks>0);
  } else for (const enemy of c.enemies) if (enemy.hp>0) {
    for (const stack of [...enemy.poison]) { if (enemy.hp<=0) break; damageEnemy(tx,enemy,stack.damagePerTick,content,0,true); stack.remainingTicks--; }
    enemy.poison=enemy.hp>0?enemy.poison.filter(p=>p.remainingTicks>0):[];
  }
}
