import { describe, it, expect } from 'vitest';
import { initialEnvelope, Mutation, type Draft } from '../../src/game/systems/resource-transactions';
import { planCommand, previewCommand, ReleaseEngine } from '../../src/game/release-engine';
import { releaseContent as content } from '../../src/game/registries';
import type { Command, SaveCommitter, SaveEnvelope } from '../../src/game/contracts';
import { settleGround, addDrop, pickup } from '../../src/game/systems/ground-loot';

function fixture():Draft {
  const e=structuredClone(initialEnvelope('test',1234)) as Draft;
  e.state.inventory.itemById.i2={ ...structuredClone(e.state.inventory.itemById.i1),id:'i2',sockets:[{ id:'g2',type:'venom',grade:2 }] };
  e.state.inventory.locationById.i2={ kind:'warehouse',order:0 };e.state.inventory.warehouseOrder=['i2'];
  e.state.inventory.resources.dust=100;return e;
}
const pair={ primary:{ id:'i1',version:1 },material:{ id:'i2',version:1 } };
describe('atomic player operations',()=>{
  it('previews repeatedly without consuming RNG and returns embedded gems even on failed synthesis',()=>{
    const e=fixture(),before=JSON.stringify(e),command:Command={ type:'synthesis.item',pair };
    for(let i=0;i<10;i++) expect(previewCommand(e,command).ok).toBe(true);
    expect(JSON.stringify(e)).toBe(before);
    let failed:Mutation|undefined;
    for(let state=1;state<100000;state+=137) {
      const sample=structuredClone(e);sample.rng.crafting.state=state;
      const tx=planCommand(sample,command); if(tx.outcome.kind==='synthesis-failed') { failed=tx;break; }
    }
    expect(failed).toBeDefined();expect(failed!.draft.state.inventory.itemById.i1.quality).toBe(0);
    expect(failed!.draft.state.inventory.itemById.i2).toBeUndefined();expect(failed!.draft.state.inventory.gemStacks['venom:2'].count).toBe(1);
  });
  it('rejects locked material and invalid placement without changing the input',()=>{
    const e=fixture();e.state.inventory.itemById.i2.locked=true;const before=JSON.stringify(e);
    expect(()=>planCommand(e,{ type:'synthesis.item',pair })).toThrow('鎖定');
    expect(()=>planCommand(e,{ type:'inventory.place',item:pair.material,placement:{ row:0,col:0,rotation:0 } })).toThrow('重疊');
    expect(JSON.stringify(e)).toBe(before);
  });
  it('keeps the actual higher-XP pet identity on a merge',()=>{
    const e=fixture();for(const [id,xp] of [['p1',0],['p2',450]] as const) { e.state.inventory.petById[id]={ id,version:1,kind:'wolf',quality:0,cumulativeXp:xp,level:xp?6:1,milestoneIds:[] };e.state.inventory.petLocationById[id]={ kind:'owned' }; }
    const next=planCommand(e,{ type:'synthesis.pet',pair:{ primary:{ id:'p1',version:1 },material:{ id:'p2',version:1 } } }).draft;
    expect(next.state.inventory.petById.p1).toBeUndefined();expect(next.state.inventory.petById.p2.cumulativeXp).toBe(450);expect(next.state.inventory.petById.p2.level).toBe(6);
  });
  it('replaces gems as one net transaction, and rejects incompatible gems',()=>{
    const e=fixture();e.state.inventory.gemStacks['charge:1'].count=1;
    const next=planCommand(e,{ type:'customize.replaceGem',item:pair.material,socketIndex:0,gem:{ type:'charge',grade:1 } }).draft;
    expect(next.state.inventory.gemStacks['charge:1'].count).toBe(0);expect(next.state.inventory.gemStacks['venom:2'].count).toBe(1);
    expect(()=>planCommand(e,{ type:'customize.replaceGem',item:pair.material,socketIndex:0,gem:{ type:'ward',grade:1 } })).toThrow('相容');
  });
  it('applies loadouts using current item identities and rejects a missing reference entirely',()=>{
    let e:SaveEnvelope=planCommand(fixture(),{ type:'loadout.save',slot:1,name:'起始' }).draft;
    e=planCommand(e,{ type:'inventory.stash',item:pair.primary }).draft;
    const applied=planCommand(e,{ type:'loadout.apply',slot:1 }).draft;
    expect(applied.state.inventory.locationById.i1.kind).toBe('equipped');
    const missing=structuredClone(e) as Draft;delete missing.state.inventory.itemById.i1;delete missing.state.inventory.locationById.i1;const before=JSON.stringify(missing);
    expect(()=>planCommand(missing,{ type:'loadout.apply',slot:1 })).toThrow('缺少');expect(JSON.stringify(missing)).toBe(before);
  });
  it('publishes nothing when the save transaction aborts',async()=>{
    const e=fixture(),writer:SaveCommitter={ commitSnapshot:async()=>({ ok:false,error:{ code:'SAVE_FAILED',message:'abort after put' } }) };
    const engine=new ReleaseEngine(e,writer),command:Command={ type:'synthesis.item',pair };
    const preview=engine.preview(command);expect(preview.ok).toBe(true);if(!preview.ok)return;
    const answer=await engine.dispatch(command,{ commandId:'cmd1',commandSeq:1,expectedRevision:0,confirmedPreview:preview.value.token });
    expect(answer.ok).toBe(false);expect(engine.envelope).toEqual(e);expect(engine.drainEvents()).toEqual([]);expect(engine.blocked).toBe('save-error');
  });
  it('deduplicates command retries and rejects changed payloads',async()=>{
    const writer:SaveCommitter={ commitSnapshot:async(_,c)=>({ ok:true,value:c.envelope.receipts.at(-1)! }) };
    const engine=new ReleaseEngine(fixture(),writer),envelope={ commandId:'cmd1',commandSeq:1,expectedRevision:0 };
    const command:Command={ type:'inventory.lock',item:pair.material,locked:true };
    const first=await engine.dispatch(command,envelope);expect(first.ok).toBe(true);
    expect(await engine.dispatch(command,envelope)).toEqual(first);expect(engine.envelope.revision).toBe(1);
    expect((await engine.dispatch({ ...command,locked:false },envelope)).ok).toBe(false);
  });
  it('keeps ground ownership until one successful pickup and rejects repeated claims',()=>{
    const tx=new Mutation(fixture());
    const id=addDrop(tx,{ kind:'gem',type:'ward',grade:3,count:1 },{ origin:'first-gem-choice',runId:null,encounterId:null,stageId:null,waveIndex:null,enemyId:null,eventId:'e1',rewardSlot:'gem',lootTableId:null,challengeId:null });
    expect(()=>pickup(tx,{ id,version:1 },'tap')).toThrow('落下');settleGround(tx);
    pickup(tx,{ id,version:2 },'tap');expect(tx.draft.state.inventory.gemStacks['ward:3'].count).toBe(1);
    expect(()=>pickup(tx,{ id,version:3 },'proximity')).toThrow('已領取');
  });
});
