import { actionHitTicks, type ActionSnapshot, type CombatSnapshot, type ContentRegistry, type EnemySnapshot, type RoundSourceSnapshot, type HitPlanEntry, type MechanicSource } from '../../contracts';
import { Mutation, type Mutable } from '../resource-transactions';
import { combatStats, equipped, gearParameters, weaponStats } from '../affixes';
import { gemMechanics } from '../gems';

export function emptyCombat(): Mutable<CombatSnapshot> {
  return { round:1,stage:'weapons',enemies:[],queue:[],actionIndex:0,currentAction:null,roundSourceSnapshots:[],cancelledSourceIds:[],hookCursor:null,dueSupportSourceIds:[],heroPoison:[],heroShield:0,healingSuppression:[],chargeActionsBySource:{},bondStacks:0,activeWardGrade:null,activeBondGrade:null,
    roundDirectHits:0,roundEquipmentHealing:0,roundLifestealBudgetUsed:0,roundChainUses:0,actionProcBudgets:[],killedEnemyIds:[],heroDeathResolved:false,roundEndResolved:false,waveCompletionResolved:false,stageCompletionResolved:false };
}
export function living(combat: CombatSnapshot, policy: 'front'|'lowest-hp'|'stable-ordinal'|'lowest-hp-ratio-ally'|'self' = 'front') {
  return combat.enemies.filter(e=>e.hp>0).slice().sort((a,b)=>policy==='lowest-hp' ? a.hp-b.hp || a.ordinal-b.ordinal : policy==='lowest-hp-ratio-ally' ? a.hp/a.maxHp-b.hp/b.maxHp || a.ordinal-b.ordinal : a.ordinal-b.ordinal);
}
export function beginRound(tx: Mutation, content: ContentRegistry) {
  const s=tx.draft.state, run=s.activeRun;
  if (run?.ruleset!=='release-r2') return;
  const c=run.combat, stats=combatStats(s,content), sources: RoundSourceSnapshot[]=[];
  c.stage='weapons'; c.actionIndex=0; c.currentAction=null; c.cancelledSourceIds=[]; c.hookCursor=null;
  c.roundDirectHits=0; c.roundEquipmentHealing=0; c.roundLifestealBudgetUsed=0; c.roundChainUses=0; c.actionProcBudgets=[]; c.roundEndResolved=false;
  for (const item of equipped(s)) {
    const placement=s.inventory.locationById[item.id]; if (placement.kind!=='equipped') continue;
    const parameters=gearParameters(item,content), mechanics: MechanicSource[]=[
      { effectId:content.equipment.find(d=>d.id===item.definitionId)!.effectId,parameters,sourceId:item.id,sourceKind:'gear',definitionVersion:content.version }, ...gemMechanics(item,content) ];
    if (parameters.kind==='passive') continue;
    if (parameters.kind==='periodic-heal' && c.round%parameters.everyRounds!==0) continue;
    sources.push({ sourceId:item.id,sourceKind:parameters.kind==='weapon'?'weapon':'charm',sourceVersion:item.version,placement:{ row:placement.row,col:placement.col,rotation:placement.rotation },stats,
      weaponStats:weaponStats(item,stats.attack,content),support:parameters.kind==='periodic-heal'?{ kind:'healing',power:parameters.healing*content.economy.qualityMultipliers[item.quality],everyRounds:parameters.everyRounds }:null,mechanics });
  }
  const weapons=sources.filter(s=>s.sourceKind==='weapon'), support=sources.filter(s=>s.sourceKind==='charm');
  if (!weapons.length) weapons.push({ sourceId:'hero',sourceKind:'unarmed',sourceVersion:1,placement:null,stats,weaponStats:null,support:null,mechanics:[] });
  const pet=s.inventory.activePetId ? s.inventory.petById[s.inventory.activePetId] : null;
  if (pet) {
    const everyRounds=pet.kind==='wolf'?1:pet.level>=10?2:3;
    if (c.round%everyRounds===0) support.push({ sourceId:pet.id,sourceKind:'pet',sourceVersion:pet.version,placement:null,stats,weaponStats:null,
      support:{ kind:pet.kind==='wolf'?'pet-attack':'healing',power:(pet.kind==='wolf'?8:16)*content.economy.qualityMultipliers[pet.quality]*(1+.15*(pet.level-1)),everyRounds },
      mechanics:content.petMilestones.filter(m=>m.kind===pet.kind && m.level<=pet.level).map(m=>({ ...m.effect,sourceId:pet.id,sourceKind:'pet',definitionVersion:content.version })) });
  }
  const enemies: RoundSourceSnapshot[]=living(c).map(e=>({ sourceId:e.id,sourceKind:'enemy',sourceVersion:1,placement:null,stats,weaponStats:null,support:null,mechanics:e.mechanics }));
  c.roundSourceSnapshots=structuredClone([...weapons,...support,...enemies]) as Mutable<RoundSourceSnapshot[]>;
  c.dueSupportSourceIds=support.map(s=>s.sourceId);
  c.queue=c.roundSourceSnapshots.map((source,n)=>({ actionId:`${run.encounterId}:r${c.round}:a${n}:${source.sourceId}`,sourceId:source.sourceId,sourceKind:source.sourceKind }));
  const auras=equipped(s).flatMap(item=>gemMechanics(item,content));
  for (const type of ['ward','bond'] as const) {
    const grade=Math.max(0,...auras.filter(m=>m.effectId===`gem_${type}`).map(m=>'grade' in m.parameters?m.parameters.grade:0));
    if (type==='ward') { c.activeWardGrade=grade?grade as 1|2|3:null; c.heroShield=Math.min(c.heroShield,grade?stats.maxHp*[.2,.25,.3][grade-1]:0); }
    else { c.activeBondGrade=grade?grade as 1|2|3:null; c.bondStacks=Math.min(c.bondStacks,grade?grade+2:0); }
  }
}
export function eligible(tx: Mutation, source: RoundSourceSnapshot): boolean {
  const s=tx.draft.state,run=s.activeRun;
  if (run?.ruleset!=='release-r2' || s.hero.hp<=0 || run.combat.cancelledSourceIds.includes(source.sourceId)) return false;
  if (source.sourceKind==='weapon' || source.sourceKind==='charm') return s.inventory.locationById[source.sourceId]?.kind==='equipped' && (source.sourceKind==='charm' || living(run.combat).length>0);
  if (source.sourceKind==='pet') return s.inventory.activePetId===source.sourceId && (source.support?.kind==='healing' || living(run.combat).length>0);
  if (source.sourceKind==='enemy') return run.combat.enemies.some(e=>e.id===source.sourceId && e.hp>0);
  return living(run.combat).length>0;
}
export function createAction(tx: Mutation, source: RoundSourceSnapshot, content: ContentRegistry): Mutable<ActionSnapshot> {
  const run=tx.draft.state.activeRun!;
  if (run.ruleset!=='release-r2') throw new Error('Expected release run');
  const c=run.combat, identity=c.queue[c.actionIndex];
  let chargeMultiplier=1;
  const plan: Omit<HitPlanEntry,'dueTick'|'hitIndex'>[]=[], targets: EnemySnapshot[]=[];
  const add=(coefficient:number,targetOrdinal=0,hitClass:'primary'|'extra'='primary',targetPolicy:HitPlanEntry['targetPolicy']='front')=>plan.push({ coefficient,targetOrdinal,hitClass,targetPolicy,effectSourceId:source.sourceId });
  if (source.sourceKind==='weapon') {
    const base=source.mechanics.find(m=>m.sourceKind==='gear')!.parameters;
    if (!('kind' in base) || base.kind!=='weapon') throw new Error('Expected weapon mechanic');
    targets.push(...living(c,base.targetPolicy).slice(0,base.maxTargets));
    for (const coefficient of base.primaryCoefficients) for (const enemy of targets) add(coefficient,enemy.ordinal,'primary',base.targetPolicy);
    for (let i=0;i<source.weaponStats!.extraHits;i++) add(base.primaryCoefficients[0]*content.economy.extraHitCoefficients[i],targets[0]?.ordinal ?? 0,'extra',base.targetPolicy);
    const charge=source.mechanics.find(m=>m.effectId==='gem_charge');
    if (charge?.effectId==='gem_charge') {
      const count=(c.chargeActionsBySource[source.sourceId]??0)+1; c.chargeActionsBySource[source.sourceId]=count;
      chargeMultiplier=count%charge.parameters.cycleLength===0?charge.parameters.chargedMultiplier:charge.parameters.normalMultiplier;
    }
  } else if (source.sourceKind==='enemy') {
    const multi=source.mechanics.find(m=>'kind' in m.parameters && m.parameters.kind==='multi-hit');
    const coefficients=multi && 'kind' in multi.parameters && multi.parameters.kind==='multi-hit'?multi.parameters.coefficients:[1];
    coefficients.forEach(coefficient=>add(coefficient));
  } else if (source.sourceKind==='pet' && source.support?.kind==='pet-attack') {
    add(1); if (source.mechanics.some(m=>m.effectId==='wolf-l10')) add(.4,0,'primary','lowest-hp');
  } else add(1);
  const ticks=actionHitTicks(plan.length);
  const action: Mutable<ActionSnapshot>={ ...structuredClone(source) as Mutable<RoundSourceSnapshot>,actionId:identity.actionId,sourceStillEligible:true,beforeActionResolved:false,chargeMultiplier,
    originalTargetIds:targets.map(e=>e.id),hitPlan:plan.map((entry,index)=>({ ...entry,hitIndex:index,dueTick:ticks[index] })),
    cursor:{ rootActionId:identity.actionId,hitIndex:0,targetOrdinal:0,phase:'ready',lastResolvedHitId:null,remainingTicks:10 } };
  c.actionProcBudgets.push({ actionId:action.actionId,venomApplications:0,bondCredits:0,chainUsed:false,sweepUsed:false,retaliatedEnemyIds:[] });
  return action;
}
