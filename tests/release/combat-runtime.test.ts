import { describe,it,expect } from 'vitest';
import { releaseContent as content } from '../../src/game/registries';
import { initialEnvelope,Mutation,type Draft } from '../../src/game/systems/resource-transactions';
import { startRun,combatTick } from '../../src/game/systems/stage-flow';
import { beginRound,createAction } from '../../src/game/systems/combat/queue';
import { beforeAction,resolveImpact,poisonPhase } from '../../src/game/systems/combat/effects';
import { combatOf,damageEnemy,healHero } from '../../src/game/systems/combat/damage';
import { planCommand } from '../../src/game/release-engine';
import { inspectSave } from '../../src/release-save';
import { gemMechanics } from '../../src/game/systems/gems';
import { combatStats } from '../../src/game/systems/affixes';

function combat() {
  const tx=new Mutation(initialEnvelope('combat-test',123456));startRun(tx,'verdant-01',null,content);
  const run=tx.draft.state.activeRun!;if(run.ruleset!=='release-r2')throw Error();run.status='combat';run.phaseRemainingTicks=0;
  run.combat.enemies[0].hp=run.combat.enemies[0].maxHp=1000;run.combat.enemies[0].armor=0;beginRound(tx,content);return tx;
}
function action(tx:Mutation) {
  const c=combatOf(tx);c.currentAction=createAction(tx,c.roundSourceSnapshots[0],content);beforeAction(tx,c.currentAction,content);return c.currentAction;
}
describe('release combat runtime',()=>{
  it('completes all ten opening waves with the starter sword and preserves a valid save',()=>{
    const tx=new Mutation(initialEnvelope('opening',999));startRun(tx,'verdant-01',null,content);
    let ticks=0;
    while(tx.draft.state.activeRun?.status!=='settlement' && ticks<2000) { tx.draft.state.simulation.elapsedTicks++;combatTick(tx,content);ticks++; }
    expect(tx.draft.state.activeRun?.status).toBe('settlement');expect(tx.draft.state.hero.hp).toBeGreaterThan(0);
    expect(tx.draft.state.world.firstWolfGranted).toBe(true);expect(tx.draft.state.hero.cumulativeXp).toBe(136);
    tx.finish();const checked=inspectSave(JSON.stringify(tx.draft));expect(checked,checked.ok?'':checked.error.message).toMatchObject({ ok:true });
    expect(ticks*.05).toBeLessThan(40);
  });
  it('spreads true extra hits over one ten-tick action and independently draws critical chance',()=>{
    const tx=combat();tx.draft.state.inventory.itemById.i1.affixes=[{ statId:'extraHits',value:3,unit:'count',rollVersion:content.version,rolledQuality:5,origin:'drop' }];beginRound(tx,content);
    const a=action(tx);expect(a.hitPlan.map(h=>h.dueTick)).toEqual([0,2,5,7]);expect(a.hitPlan.map(h=>h.coefficient)).toEqual([1,.15,.1,.05]);
    for(let i=0;i<4;i++)resolveImpact(tx,a,content);
    expect(tx.random.combat.snapshot().draws).toBe(4);expect(a.cursor.hitIndex).toBe(4);
    const previous=JSON.stringify(tx.draft);resolveImpact(tx,a,content);expect(JSON.stringify(tx.draft)).toBe(previous);
  });
  it('uses round snapshots after reroll and immediately cancels removed sources',()=>{
    const tx=combat(),a=action(tx),before=a.weaponStats!.damageD;
    tx.draft.state.inventory.itemById.i1.affixes=[{ statId:'weaponBaseAdd',value:24,unit:'flat',rollVersion:content.version,rolledQuality:5,origin:'drop' }];
    resolveImpact(tx,a,content);expect(a.weaponStats!.damageD).toBe(before);
    const moved=planCommand(tx.draft,{ type:'inventory.stash',item:{ id:'i1',version:1 } });expect(combatOf(moved).cancelledSourceIds).toContain('i1');
    planCommand(moved.draft,{ type:'inventory.place',item:{ id:'i1',version:2 },placement:{ row:0,col:0,rotation:0 } });
    expect(combatOf(moved).cancelledSourceIds).toContain('i1');
  });
  it('counts only HP damage for poison and direct cooperation',()=>{
    const tx=combat();tx.draft.state.inventory.itemById.i1.sockets=[{ id:'gem',type:'venom',grade:3 }];beginRound(tx,content);
    const c=combatOf(tx);c.enemies[0].shield=100;resolveImpact(tx,action(tx),content);
    expect(c.enemies[0].poison).toEqual([]);expect(c.roundDirectHits).toBe(0);
    c.enemies[0].shield=0;c.currentAction=null;resolveImpact(tx,action(tx),content);
    expect(c.enemies[0].poison).toHaveLength(1);expect(c.roundDirectHits).toBe(1);
    const hp=c.enemies[0].hp;c.enemies[0].shield=100;poisonPhase(tx,content,false);
    expect(c.enemies[0].hp).toBe(hp-4);expect(c.enemies[0].shield).toBe(100);
  });
  it('uses the highest duplicate gem and caps qualified lifesteal before overheal',()=>{
    const tx=combat(),item=tx.draft.state.inventory.itemById.i1;
    item.sockets=[{ id:'g1',type:'venom',grade:1 },{ id:'g2',type:'venom',grade:3 }];expect(gemMechanics(item,content)).toHaveLength(1);
    expect(gemMechanics(item,content)[0].parameters).toMatchObject({ grade:3 });
    const c=combatOf(tx);c.activeWardGrade=3;const a=action(tx);
    healHero(tx,1000,a,content,true);healHero(tx,1000,a,content,true);
    expect(c.roundLifestealBudgetUsed).toBe(30);expect(c.heroShield).toBe(12);expect(tx.draft.state.hero.hp).toBe(100);
  });
  it('gives death priority over clearing when thorns kill the hero on the last enemy',()=>{
    const tx=combat(),run=tx.draft.state.activeRun!;if(run.ruleset!=='release-r2')throw Error();
    run.waveIndex=9;const enemy=run.combat.enemies[0];enemy.hp=1;enemy.attack=100;
    enemy.mechanics=[{ sourceId:enemy.id,sourceKind:'enemy',definitionVersion:content.version,effectId:'enemy_thorns',parameters:{ kind:'retaliation',attackFraction:.3,maxPerSourceAction:1 } }];
    tx.draft.state.hero.hp=1;beginRound(tx,content);combatTick(tx,content);
    expect(run.status).toBe('dead');expect(tx.draft.state.hero.cumulativeXp).toBe(8);expect(tx.draft.state.world.completedStageIds).toEqual([]);
    expect(tx.draft.state.world.firstWolfGranted).toBe(false);
  });
  it('finishes due healing and hero poison after the final kill instead of skipping support',()=>{
    const tx=combat(),inv=tx.draft.state.inventory;
    inv.itemById.charm={ ...structuredClone(inv.itemById.i1),id:'charm',definitionId:'charm',baseKind:'charm',affixes:[],sockets:[null] };
    inv.locationById.charm={ kind:'equipped',row:0,col:2,rotation:0 };
    const c=combatOf(tx);c.round=3;c.enemies[0].hp=1;c.heroPoison=[{ sourceId:'poison',sourceQuality:0,damagePerTick:10,remainingTicks:1,createdOrder:1 }];tx.draft.state.hero.hp=20;beginRound(tx,content);
    for(let i=0;i<22;i++)combatTick(tx,content);
    expect(tx.draft.state.hero.hp).toBe(24);
  });
  it('does not recursively trigger chain from sweep kills',()=>{
    const tx=combat(),c=combatOf(tx),inv=tx.draft.state.inventory;
    inv.itemById.i1.sockets=[{ id:'sweep',type:'sweep',grade:3 },{ id:'chain',type:'chain',grade:3 }];
    const first=c.enemies[0];first.hp=1;
    c.enemies.push(...[1,2,3,4].map(n=>({ ...structuredClone(first),id:`enemy${n}`,ordinal:n,hp:n===4?100:1 })));
    beginRound(tx,content);resolveImpact(tx,action(tx),content);
    expect(c.roundChainUses).toBe(1);expect(c.killedEnemyIds).toHaveLength(4);
    expect(c.enemies[4].hp).toBeCloseTo(91.2);expect(tx.random.combat.snapshot().draws).toBe(1);
  });
  it('keeps full health unchanged when larger max HP equipment is added',()=>{
    const tx=combat(),inv=tx.draft.state.inventory;
    inv.itemById.armor={ ...structuredClone(inv.itemById.i1),id:'armor',definitionId:'armor',baseKind:'armor',affixes:[] };
    inv.locationById.armor={ kind:'warehouse',order:0 };inv.warehouseOrder=['armor'];
    const changed=planCommand(tx.draft,{ type:'inventory.place',item:{ id:'armor',version:1 },placement:{ row:0,col:2,rotation:0 } });
    expect(combatStats(changed.draft.state,content).maxHp).toBe(135);expect(changed.draft.state.hero.hp).toBe(100);
  });
});
