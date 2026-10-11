import {describe,it,expect} from 'vitest';
import {initialEnvelope,Mutation,type Draft} from '../../src/game/systems/resource-transactions';
import {releaseContent as content} from '../../src/game/registries';
import {startRun,combatTick,spawnWave} from '../../src/game/systems/stage-flow';
import {ReleaseEngine,planCommand} from '../../src/game/release-engine';
import {inspectSave,migrateToRelease} from '../../src/release-save';
import {advanceGround,settleGround,pickup,addDrop} from '../../src/game/systems/ground-loot';
import {balanceFixture} from './balance-fixtures';
import {createInitialState,GameEngine} from '../../src/game/engine';
import {legacyTick} from '../../src/game/systems/legacy-run';
import type {SaveCommitter,SaveEnvelope} from '../../src/game/contracts';

const writer:SaveCommitter={commitSnapshot:async(_revision,candidate)=>({ok:true,value:candidate.envelope.receipts.at(-1)!})};
describe('release integration acceptance',()=>{
  it('preserves the remaining half-second of an already resolved legacy killing action',()=>{
    const old=createInitialState();old.pauses=[];old.battle={phase:'combat',remaining:.375,enemies:[],round:1,stage:'weapons',actions:[{kind:'weapon',sourceId:old.items[0].id}],actionIndex:0,actionResolved:true};
    const migrated=migrateToRelease(JSON.stringify(old),'evernight-packbound-v2');expect(migrated.ok).toBe(true);if(!migrated.ok)return;
    const tx=new Mutation(migrated.value),prototype=new GameEngine(structuredClone(old),()=>1);
    for(let i=0;i<12;i++){legacyTick(tx,content);prototype.step(.05);const run=tx.draft.state.activeRun!;if(run.ruleset!=='legacy-v2')throw Error();expect(run.legacyWave).toBe(prototype.state.wave);expect(run.combat.remaining).toBeCloseTo(prototype.state.battle.remaining);expect(run.combat.actionResolved).toBe(prototype.state.battle.actionResolved);}
  });
  it('consumes exactly 30 entry ticks and ten ticks per action without a wave-end wait',()=>{
    const tx=new Mutation(balanceFixture('return',1));startRun(tx,'verdant-01',null,content);
    for(let i=0;i<39;i++)combatTick(tx,content);
    expect(tx.draft.state.activeRun?.waveIndex).toBe(0);
    combatTick(tx,content);expect(tx.draft.state.activeRun).toMatchObject({waveIndex:1,status:'wave-entry',phaseRemainingTicks:30});
  });
  it('expires a cross-wave healing debuff at the next support boundary',()=>{
    const tx=new Mutation(balanceFixture('return',2));startRun(tx,'verdant-01',null,content);const run=tx.draft.state.activeRun!;if(run.ruleset!=='release-r2')throw Error();
    run.combat.round=7;run.combat.healingSuppression=[{sourceId:'last-wave',multiplier:.6,expiresAfterSupportRound:8}];run.waveIndex=1;spawnWave(tx,content);
    expect(run.combat.healingSuppression[0].expiresAfterSupportRound).toBe(1);
    for(let i=0;i<40;i++)combatTick(tx,content);expect(run.combat.healingSuppression).toEqual([]);
  });
  it('roundtrips every durable impact and reproduces the uninterrupted outcome',()=>{
    const original=balanceFixture('charge',729),left=new Mutation(original);startRun(left,'verdant-10',null,content);left.finish();
    let right=new Mutation(left.draft);
    for(let n=0;n<1600;n++){
      for(const tx of [left,right]){tx.draft.state.simulation.elapsedTicks++;advanceGround(tx,50);combatTick(tx,content);tx.finish();}
      const raw=JSON.stringify(right.draft),checked=inspectSave(raw);expect(checked.ok,checked.ok?'':checked.error.message).toBe(true);
      right=new Mutation(JSON.parse(raw) as SaveEnvelope);
      expect(right.draft).toEqual(left.draft);
      if(left.draft.state.activeRun?.status==='settlement')break;
    }
    expect(left.draft.state.activeRun?.status).toBe('settlement');
  });
  it('keeps repeat preference through manual pause, hidden, load and explicit continue',async()=>{
    let e=planCommand(initialEnvelope('pause',44),{type:'world.start',stageId:'verdant-01',challengeId:null}).draft;
    e=planCommand(e,{type:'world.setAutoRepeat',enabled:true}).draft;
    const engine=new ReleaseEngine(e,writer);
    for(const [i,visible]of [false,true].entries())await engine.dispatch({type:'lifecycle.visibility',visible},{commandId:`v${i}`,commandSeq:i+1,expectedRevision:engine.envelope.revision});
    const before=JSON.stringify(engine.envelope);await engine.tick();expect(JSON.stringify(engine.envelope)).toBe(before);expect(engine.state.settings.autoRepeatEnabled).toBe(true);
    await engine.dispatch({type:'lifecycle.requestContinue'},{commandId:'resume',commandSeq:3,expectedRevision:engine.envelope.revision});
    expect(engine.state.lifecycle.resumeRequired).toBe(false);expect(engine.state.settings.autoRepeatEnabled).toBe(true);
  });
  it('rejects inventory writes during unpaused combat',async()=>{
    const e=planCommand(initialEnvelope('mode',42),{type:'world.start',stageId:'verdant-01',challengeId:null}).draft,engine=new ReleaseEngine(e,writer);
    const result=await engine.dispatch({type:'inventory.stash',item:{id:'i1',version:1}},{commandId:'bad',commandSeq:1,expectedRevision:0});
    expect(result).toMatchObject({ok:false,error:{code:'NOT_IN_ALLOWED_MODE'}});expect(engine.envelope).toEqual(e);
  });
  it('keeps the first successful exit pickup when a later drop exceeds capacity',async()=>{
    const tx=new Mutation(balanceFixture('early',4,59));startRun(tx,'verdant-01',null,content);
    const inv=tx.draft.state.inventory,source={origin:'enemy-kill' as const,runId:'r',encounterId:'e',stageId:'verdant-01' as const,waveIndex:0,enemyId:'e',eventId:'unique',rewardSlot:'equipment' as const,lootTableId:'loot-verdant' as const,challengeId:null};
    for(let i=0;i<2;i++){const item=structuredClone(inv.itemById[inv.warehouseOrder[0]]);item.id=`ground-${i}`;inv.itemById[item.id]=item;addDrop(tx,{kind:'equipment',itemId:item.id},{...source,eventId:`unique${i}`});}
    settleGround(tx);tx.draft.state.lifecycle={pauseReasons:[],resumeRequired:false,pendingChoice:null,exitRequest:{requestId:'exit',fromRunId:tx.draft.state.activeRun!.runId,targetStageId:'verdant-01',challengeId:null,reason:'repeat',nextDropId:null}};
    const engine=new ReleaseEngine(tx.draft,writer);await engine.tick();await engine.tick();
    expect(engine.state.inventory.warehouseOrder).toHaveLength(60);expect(engine.state.inventory.locationById['ground-0'].kind).toBe('warehouse');expect(engine.state.inventory.locationById['ground-1'].kind).toBe('ground');expect(engine.state.lifecycle.pauseReasons).toContain('capacity');
  });
  it.each(['early','mid','late','late-gem','return','wolf','ward','charge'] as const)('has a valid, reproducible %s balance fixture',profile=>{expect(inspectSave(JSON.stringify(balanceFixture(profile,73))).ok).toBe(true);});
  it('rejects malformed legacy JSON without throwing',()=>{expect(migrateToRelease('{broken','evernight-packbound-v2')).toMatchObject({ok:false});});
  it.each([
    ['missing counter',(e:Draft)=>{delete (e.counters as Partial<Draft['counters']>).nextEntitySeq;}],
    ['missing random stream',(e:Draft)=>{delete (e.rng as Partial<Draft['rng']>).combat;}],
    ['unknown collection',(e:Draft)=>{Object.assign(e.state.collection.equipmentHighestQualityByDefinition,{alien:1});}],
    ['unowned cosmetic',(e:Draft)=>{e.state.collection.selectedPresentationIds=['six-gem-lantern'];}],
    ['negative tracker',(e:Draft)=>{e.state.tracking.target={kind:'gem',type:'venom',grade:1,count:-1};}],
    ['invalid volume',(e:Draft)=>{e.state.settings.musicVolume=2;}],
    ['camp HP above maximum',(e:Draft)=>{e.state.hero.hp=101;}],
    ['bad loadout location',(e:Draft)=>{e.state.loadouts=[{slotId:1,name:'bad',items:[{itemId:'i1',observedVersion:1,placement:{row:99,col:0,rotation:0}}],pet:null}];}],
  ] as const)('rejects %s before publishing',(_name,mutate)=>{const e=structuredClone(initialEnvelope('invalid',82)) as Draft;mutate(e);expect(inspectSave(JSON.stringify(e)).ok).toBe(false);});
});
