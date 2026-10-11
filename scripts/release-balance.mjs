import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
const {balanceFixture,progressionFixture}=await server.ssrLoadModule('/tests/release/balance-fixtures.ts');
const {releaseContent:content}=await server.ssrLoadModule('/src/game/registries.ts');
const {Mutation}=await server.ssrLoadModule('/src/game/systems/resource-transactions.ts');
const {startRun,combatTick}=await server.ssrLoadModule('/src/game/systems/stage-flow.ts');
const {advanceGround,pickup,settleGround}=await server.ssrLoadModule('/src/game/systems/ground-loot.ts');
const {inspectSave}=await server.ssrLoadModule('/src/release-save.ts');
const petGrowth=await server.ssrLoadModule('/src/game/systems/pet-growth.ts');
const {warehouseCount,petCount}=await server.ssrLoadModule('/src/game/systems/inventory.ts');
const defaultCases=[['early','verdant-01'],['mid','verdant-04'],['late','verdant-10'],['late-gem','verdant-10'],['return','verdant-01'],['wolf','verdant-10'],['ward','verdant-10'],['charge','verdant-10']];
const cases=process.env.BALANCE_MATRIX==='1'?['wolf','ward','charge'].flatMap(p=>content.stages.filter(s=>!process.env.BALANCE_TIER||(process.env.BALANCE_TIER==='early'?s.regionId==='verdant'&&s.depth<=3:s.depth>=4&&s.depth<=6)).map(s=>[p,s.id])):defaultCases;
function simulate(profile,stageId,challenge,seed,seconds=900){
 const fixture=process.env.BALANCE_TIER?progressionFixture(profile,process.env.BALANCE_TIER,seed):balanceFixture(profile,seed);
 const inv=fixture.state.inventory,variant=process.env.BALANCE_VARIANT;
 const equipped=Object.values(inv.itemById).filter(i=>inv.locationById[i.id].kind==='equipped');
 if(variant==='no-gems')for(const item of equipped)item.sockets=item.sockets.map(()=>null);
 if(variant==='no-main'){const item=equipped[0];delete inv.itemById[item.id];delete inv.locationById[item.id];}
 if(variant==='swap-pet'){const pet=inv.petById[inv.activePetId];pet.kind=pet.kind==='wolf'?'fairy':'wolf';const {growPet}=petGrowth;Object.assign(pet,growPet(pet,0,content));}
 if(variant==='common-main'){const item=equipped[0];item.definitionId=item.baseKind;}
 const checked=inspectSave(JSON.stringify(fixture));if(!checked.ok)throw Error(profile+': '+checked.error.message);
 const tx=new Mutation(fixture),s=tx.draft.state;const cid=challenge?content.challenges.find(c=>c.regionId===stageId.slice(0,-3)).id:null;
 startRun(tx,stageId,cid,content);let ticks=0,runs=0,runStart=0,firstRun=0,actions=0,reason='none';
 while(ticks<(seconds===0?12000:seconds*20)){
  if(s.lifecycle.pauseReasons.includes('capacity')){reason='capacity';break;}if(s.activeRun.status==='dead'){reason='death';break;}
  ticks++;s.simulation.elapsedTicks++;advanceGround(tx,50);
  const r=s.activeRun;
  if(r.status==='settlement'&&r.phaseRemainingTicks===0){const drop=s.groundDrops.find(d=>d.state!=='claimed');if(drop){settleGround(tx);pickup(tx,{id:drop.id,version:drop.version},'stage-exit');}else{runs++;if(!firstRun)firstRun=(ticks-runStart)*.05;runStart=ticks;if(seconds===0)break;startRun(tx,stageId,cid,content);}}
  else combatTick(tx,content);
  const active=s.activeRun,x=active.status==='wave-entry'?90+(30-active.phaseRemainingTicks)*7:active.status==='settlement'?270:90;
  for(const drop of s.groundDrops.filter(d=>d.state==='available'&&Math.abs(d.position.x-x)<=72)){try{pickup(tx,{id:drop.id,version:drop.version},'proximity');}catch{reason='capacity';break;}}
  actions+=tx.events.filter(e=>e.type==='ActionResolved').length;tx.events.length=0;
 }
 tx.finish();return {seconds:ticks*.05,runs,firstRun,actions,reason,equipment:warehouseCount(s.inventory)-fixture.state.inventory.warehouseOrder.length,pets:petCount(s.inventory)-10,hp:s.hero.hp};
}
const samples=Number(process.env.BALANCE_SAMPLES||30),seconds=Number(process.env.BALANCE_SECONDS||900),results=[];
for(const [profile,stage]of cases.filter(([p])=>!process.env.BALANCE_PROFILES||process.env.BALANCE_PROFILES.split(',').includes(p)))for(const challenge of [false,true]){
 const rows=[];for(let i=1;i<=samples;i++)rows.push(simulate(profile,stage,challenge,(i*2654435761)>>>0,seconds));
 const sorted=rows.map(r=>r.firstRun).sort((a,b)=>a-b),failed=rows.filter(r=>r.reason==='capacity').length,dead=rows.filter(r=>r.reason==='death').length;
 const report={profile,stage,challenge,n:samples,capacityFailures:failed,deaths:dead,firstRunSeconds:{p05:sorted[Math.floor(samples*.05)],p50:sorted[Math.floor(samples*.5)],p95:sorted[Math.min(samples-1,Math.floor(samples*.95))]},meanEquipment:rows.reduce((a,r)=>a+r.equipment,0)/samples,meanPets:rows.reduce((a,r)=>a+r.pets,0)/samples,rows};results.push(report);console.log(JSON.stringify({...report,rows:undefined}));
}
await mkdir('docs/release/results',{recursive:true});await writeFile(`docs/release/results/balance-${process.env.BALANCE_MATRIX==="1"?"matrix-":""}${process.env.BALANCE_LABEL||"C"}-${process.env.BALANCE_PROFILES||"all"}-${samples}-${seconds}.json`,JSON.stringify({version:content.version,clock:'50ms simulation ticks; includes ground exit pickups; no storage latency',results},null,2));
await server.close();
