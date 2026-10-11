import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173',out='test-results/release';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const state=page=>page.evaluate(async()=>{const {ReleaseStorage}=await import('/src/release-save.ts');const store=await ReleaseStorage.open(),raw=await store.read();store.close();return JSON.parse(raw);});
async function ready(page){await page.waitForSelector('.r-app');if(await page.locator('[data-action="intro-skip"]').count())await page.locator('[data-action="intro-skip"]').click();}
async function fresh(width=390,height=844){const context=await browser.newContext({viewport:{width,height},hasTouch:width<700,isMobile:width<700});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await ready(page);return {context,page,errors};}
async function fixture(page,profile='wolf',full=true){await page.evaluate(async({profile,full})=>{const {balanceFixture}=await import('/tests/release/balance-fixtures.ts'),{ReleaseStorage}=await import('/src/release-save.ts'),{Mutation}=await import('/src/game/systems/resource-transactions.ts'),{startRun,spawnWave}=await import('/src/game/systems/stage-flow.ts'),{releaseContent}=await import('/src/game/registries.ts');const storage=await ReleaseStorage.open(),current=JSON.parse(await storage.read()),e=balanceFixture(profile,731,full?60:10,full?30:10);e.revision=current.revision+1;const tx=new Mutation(e);startRun(tx,'verdant-10',null,releaseContent);tx.draft.state.activeRun.waveIndex=9;spawnWave(tx,releaseContent);tx.draft.state.lifecycle.pauseReasons=['camp'];tx.draft.state.lifecycle.resumeRequired=true;tx.finish();const result=await storage.write(current.revision,tx.draft);if(!result.ok)throw Error(result.error.message);storage.close();},{profile,full});await page.reload();await ready(page);}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal overflow');}
async function touchDrag(page,from,to){const a=await page.locator(from).boundingBox(),b=await page.locator(to).boundingBox(),cdp=await page.context().newCDPSession(page);const x=a.x+a.width/2,y=a.y+a.height/2,dx=b.x+b.width/2,dy=b.y+b.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let n=1;n<=6;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(dx-x)*n/6,y:y+(dy-y)*n/6}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
try{
 for(const input of ['mouse','touch']){
  const {context,page,errors}=await fresh();await fixture(page,'mid',false);
  for(const [selector,destination]of [['[data-page="inventory"]','inventory'],['[data-page="ground"]','ground'],['[data-page="camp"]','camp'],['[data-action="continue"]','battle']]){
   await page.locator('.r-topnav [data-page="camp"]').click();await page.locator('[data-page="map"]').click();await page.waitForSelector('.r-app[data-page="map"]');
   const target=page.locator(`.r-footer ${selector}`);
   if(input==='mouse')await target.click({delay:250});else{const box=await target.boundingBox(),cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await page.waitForTimeout(250);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
   await page.waitForSelector(`.r-app[data-page="${destination}"]`,{timeout:3000});
   assert.equal((await state(page)).state.lifecycle.resumeRequired,destination!=='battle',`${input} footer ${destination} changes page and pause state`);
  }
  assert.deepEqual(errors,[]);results.push({case:`footer-${input}-held-press-across-renders`,status:'PASS'});await context.close();
 }
 for(const [width,height]of [[360,740],[390,844],[430,932],[1024,720],[1366,768],[1440,900],[1920,1080]]){
  const {context,page,errors}=await fresh(width,height);await page.screenshot({path:`${out}/camp-${width}.png`,fullPage:true});await fixture(page);
  await page.locator('[data-action="continue"]').click();await page.waitForSelector('.r-app[data-page="battle"]');await page.locator('[data-action="pause"]').click();
  assert.equal(await page.locator('.r-cell').count(),48);assert.equal(await page.locator('.r-enemy').count(),5);await noOverflow(page);
  const stage=await page.locator('.r-stage').boundingBox();for(const badge of await page.locator('.r-enemy .r-badges').all()){const box=await badge.boundingBox();assert.ok(box.y+box.height<=stage.y+stage.height+1,'enemy status labels are not clipped');}
  const bag=await page.locator('.r-bag-frame').boundingBox(),footer=await page.locator('.r-footer').boundingBox();assert.ok(bag.y+bag.height<=footer.y,'all 48 cells above footer');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,'battle fits viewport');await page.screenshot({path:`${out}/battle-full-${width}.png`});
  await page.locator('.r-footer [data-page="inventory"]').click();await page.waitForSelector('.is-inventory');await noOverflow(page);
  assert.equal(await page.locator('.r-scroll .r-item-card').count(),60);const before=await page.locator('.r-bag').boundingBox();await page.locator('.r-scroll').evaluate(e=>e.scrollTop=9999);const after=await page.locator('.r-bag').boundingBox();assert.equal(before.y,after.y,'bag fixed while warehouse scrolls');await page.screenshot({path:`${out}/inventory-full-${width}.png`});
  for(const p of ['forge','pets','growth','map','collection','loadouts','tracker','settings','ground']){await page.locator('.r-topnav [data-page="camp"]').click();await page.locator(`[data-page="${p}"]`).first().click();await noOverflow(page);}
  assert.deepEqual(errors,[]);results.push({case:`${width<700?'mobile':'desktop'}-${width}x${height}`,status:'PASS'});await context.close();
 }
 {
  const {context,page,errors}=await fresh();await page.locator('[data-page="inventory"]').first().click();await page.locator('[data-item="i1"]').click();await page.locator('[data-action="select-place"]').click();await page.locator('[data-cell="0,2"]').click();assert.equal((await state(page)).state.inventory.locationById.i1.col,2);
  await touchDrag(page,'[data-item="i1"]','[data-cell="2,2"]');await page.waitForTimeout(100);assert.equal((await state(page)).state.inventory.locationById.i1.row,2,'real touch drag moves the retained item');
  await page.locator('.r-topnav [data-page="camp"]').click();await page.locator('[data-page="loadouts"]').click();await page.locator('#slot-1').fill('Sword');await page.locator('[data-slot="1"][data-slot-action="save"]').click();assert.equal((await state(page)).state.loadouts[0].name,'Sword');
  await page.reload();await ready(page);assert.equal((await state(page)).state.inventory.locationById.i1.col,2);assert.equal((await state(page)).state.lifecycle.resumeRequired,true);
  await fixture(page,'mid',false);await page.locator('[data-page="forge"]').click();const id=(await state(page)).state.inventory.warehouseOrder[0];await page.locator(`[data-item="${id}"]`).click();await page.locator('[data-action="choose-material"]').click();const second=(await state(page)).state.inventory.warehouseOrder[1];await page.locator(`[data-item="${second}"]`).click();await page.waitForSelector('[data-action="confirm"]');const before=await state(page);await page.locator('[data-action="close"]').first().click();assert.deepEqual((await state(page)).rng,before.rng,'preview cancellation draws no RNG');
  assert.deepEqual(errors,[]);results.push({case:'touch-placement-loadout-preview-reload',status:'PASS'});await context.close();
 }
 {
  const {context,page}=await fresh();const answer=await page.evaluate(async()=>{
   const {ReleaseStorage}=await import('/src/release-save.ts');const a=await ReleaseStorage.open(),b=await ReleaseStorage.open(),e=JSON.parse(await a.read()),candidate=structuredClone(e);candidate.revision++;
   const race=await Promise.all([a.write(e.revision,candidate),b.write(e.revision,candidate)]);a.close();b.close();return race.map(r=>r.ok?'ok':r.error.code);
  });assert.equal(answer.filter(v=>v==='ok').length,1);assert.ok(answer.includes('SAVE_CONFLICT'));results.push({case:'real-indexeddb-multitab-single-winner',status:'PASS'});await context.close();
 }
 {
  const {context,page}=await fresh();const answer=await page.evaluate(async()=>{
   const {ReleaseStorage}=await import('/src/release-save.ts');const store=await ReleaseStorage.open(),raw=await store.read(),e=JSON.parse(raw),candidate=structuredClone(e);candidate.revision++;
   const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);this.transaction.abort();return request;};let outcome;try{outcome=await store.write(e.revision,candidate);}finally{IDBObjectStore.prototype.put=put;}
   const after=await store.read();store.close();return {ok:outcome.ok,unchanged:raw===after};
  });assert.deepEqual(answer,{ok:false,unchanged:true});results.push({case:'real-indexeddb-abort-after-put',status:'PASS'});await context.close();
 }
 {
  const context=await browser.newContext(),page=await context.newPage();await page.route('**/migration-harness',route=>route.fulfill({contentType:'text/html',body:'<html lang="zh-Hant"><body>Isolated migration fixture</body></html>'}));await page.goto(`${base}/migration-harness`);
  const raw=await page.evaluate(async()=>{const {createInitialState}=await import('/src/game/engine.ts');const e=createInitialState();e.hero.hp=37;e.settings.autoItems.enabled=true;e.settings.autoPets.enabled=true;const raw=JSON.stringify(e,null,'\t');localStorage.setItem('evernight-packbound-v2',raw);return raw;});
  await page.goto(base);await ready(page);const migrated=await state(page);assert.equal(migrated.state.hero.hp,37);assert.equal(migrated.state.activeRun.ruleset,'legacy-v2');assert.equal(migrated.state.lifecycle.resumeRequired,true);
  const backups=await page.evaluate(async()=>{const {ReleaseStorage}=await import('/src/release-save.ts');const storage=await ReleaseStorage.open(),keys=await storage.keys(),values=await Promise.all(keys.filter(k=>String(k).startsWith('raw:')).map(k=>storage.read(k)));storage.close();return {values,legacy:localStorage.getItem('evernight-packbound-v2')};});assert.equal(backups.legacy,raw);assert.ok(backups.values.includes(raw),'migration preserves byte-for-byte original');results.push({case:'legacy-v2-real-storage-migration',status:'PASS'});await context.close();
 }
 {
  const {context,page}=await fresh();await page.locator('[data-page="settings"]').first().click();const before=await state(page),imported=structuredClone(before);imported.state.hero.hp=42;
  const file={name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))};await page.locator('#import-file').setInputFiles(file);await page.locator('dialog[open] button[value="cancel"]').click();assert.deepEqual(await state(page),before,'cancel import does not publish');
  await page.locator('#import-file').setInputFiles([]);await page.locator('#import-file').setInputFiles(file);await page.locator('dialog[open] button[value="confirm"]').click();await page.waitForSelector('.r-camp-scene');assert.equal((await state(page)).state.hero.hp,42);results.push({case:'import-preview-cancel-confirm-no-heal',status:'PASS'});await context.close();
 }
 {
  const {context,page}=await fresh();const raw='{"schemaVersion":999,"valuable":"keep exactly"}';await page.evaluate(async raw=>{const request=indexedDB.open('evernight-packbound',1);await new Promise((resolve,reject)=>{request.onsuccess=()=>{const tx=request.result.transaction('saves','readwrite');tx.objectStore('saves').put(raw,'current');tx.oncomplete=()=>{request.result.close();resolve();};tx.onabort=reject;};});},raw);await page.reload();await page.waitForSelector('.r-recovery');assert.equal(await page.evaluate(async()=>{const {ReleaseStorage}=await import('/src/release-save.ts');const store=await ReleaseStorage.open(),raw=await store.read();store.close();return raw;}),raw);results.push({case:'future-save-readonly-raw-preserved',status:'PASS'});await context.close();
 }
}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(JSON.stringify(results,null,2));
