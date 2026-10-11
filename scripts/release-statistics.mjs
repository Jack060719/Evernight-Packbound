import {createServer} from 'vite';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
const {releaseContent:content}=await server.ssrLoadModule('/src/game/registries.ts');
const {initialEnvelope,Mutation}=await server.ssrLoadModule('/src/game/systems/resource-transactions.ts');
const {startRun}=await server.ssrLoadModule('/src/game/systems/stage-flow.ts');
const {resolveLoot,weighted}=await server.ssrLoadModule('/src/game/systems/reward-resolution.ts');
const {createRandomSource}=await server.ssrLoadModule('/src/game/contracts/index.ts');
const n=100000,distribution=[];
function record(name,observed,expected){const tolerance=Math.max(5/n,5*Math.sqrt(expected*(1-expected)/n));assert.ok(Math.abs(observed/n-expected)<=tolerance,`${name}: ${observed/n} vs ${expected}`);distribution.push({name,n,observed,expected,tolerance,status:'PASS'});}
for(const rank of ['S','N','G','H','E','B']){
 const counts={equipment:0,pet:0,gem:0,dust:0};
 for(let seed=1;seed<=5;seed++){
  const tx=new Mutation(initialEnvelope(`sampler-${rank}-${seed}`,seed*7919));startRun(tx,'verdant-10',null,content);const enemy={...tx.draft.state.activeRun.combat.enemies[0],rank};
  for(let i=0;i<n/5;i++){resolveLoot(tx,content,enemy);for(const d of tx.draft.state.groundDrops)counts[d.payloadRef.kind]++;tx.draft.state.groundDrops=[];const inv=tx.draft.state.inventory;inv.itemById={};inv.locationById={};inv.petById={};inv.petLocationById={};tx.events.length=0;tx.createdIds.length=0;}
 }
 const rates=content.lootTables[0].ranks[rank];for(const kind of Object.keys(counts))record(`${rank}/${kind}`,counts[kind],kind==='dust'?rates.dust.probability:rates[kind]);
}
for(const row of content.qualityRows)for(const category of ['equipment','pet','gem']){
 const rows=row[category],counts=rows.map(()=>0);
 for(let seed=1;seed<=5;seed++){const rng=createRandomSource({algorithm:'xorshift32-v1',seed:seed*6121,state:seed*6121,draws:0});for(let i=0;i<n/5;i++)counts[rows.indexOf(weighted(rows,x=>x.probability,rng))]++;}
 rows.forEach((r,i)=>record(`${row.id}/${category}/${r.quality??r.grade}`,counts[i],r.probability));
}
const expectedStages=content.stages.map(stage=>{
 const table=content.lootTables.find(t=>t.id===stage.lootTableId),enemies=stage.waves.flatMap(w=>w.enemies).map(e=>content.enemies.find(d=>d.id===e.definitionId)),ranks=Object.fromEntries(['N','S','G','H','E','B'].map(r=>[r,enemies.filter(e=>e.rank===r).length]));
 return {stage:stage.id,ranks,equipment:enemies.reduce((a,e)=>a+table.ranks[e.rank].equipment,0),pets:enemies.reduce((a,e)=>a+table.ranks[e.rank].pet,0),gems:enemies.reduce((a,e)=>a+table.ranks[e.rank].gem,0),dust:enemies.reduce((a,e)=>a+table.ranks[e.rank].dust.probability*table.ranks[e.rank].dust.count,0)};
});
function binomialCdf(k,n,p){let term=(1-p)**n,sum=term;for(let i=1;i<=k;i++){term*=(n-i+1)/i*p/(1-p);sum+=term;}return sum;}
function upper(k,n,alpha=.05){let low=0,high=.5;for(let i=0;i<70;i++){const p=(low+high)/2;if(binomialCdf(k,n,p)>alpha)low=p;else high=p;}return (low+high)/2;}
const names=(await readdir('docs/release/results')).filter(n=>n.startsWith('balance-C-')&&n.endsWith('-1000-900.json'));
const capacity=[];for(const name of names){const data=JSON.parse(await readFile(`docs/release/results/${name}`,'utf8'));for(const r of data.results){const bound=upper(r.capacityFailures,r.n),simultaneous=upper(r.capacityFailures,r.n,.05/16);assert.equal(r.deaths,0);assert.ok(simultaneous<.05);capacity.push({...r,rows:undefined,upperFailure95:bound,upperFailure95Bonferroni16:simultaneous});}}
const matrix=JSON.parse(await readFile('docs/release/results/balance-matrix-C-all-30-0.json','utf8'));
const matrixSummary={cases:matrix.results.length,runs:matrix.results.reduce((a,r)=>a+r.n,0),deaths:matrix.results.reduce((a,r)=>a+r.deaths,0),stalled:matrix.results.reduce((a,r)=>a+r.rows.filter(s=>!s.firstRun&&s.reason==='none').length,0)};
assert.equal(matrixSummary.deaths,0);assert.equal(matrixSummary.stalled,0);
const report={contentVersion:content.version,dropCandidate:'C',distribution,expectedStages,capacity,matrixSummary};
await writeFile('docs/release/results/statistical-validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({distributionRows:distribution.length,samples:36*n,capacityCases:capacity.length,capacityRuns:capacity.reduce((a,r)=>a+r.n,0),worstSimultaneousUpper:Math.max(...capacity.map(r=>r.upperFailure95Bonferroni16)),matrixSummary},null,2));await server.close();
