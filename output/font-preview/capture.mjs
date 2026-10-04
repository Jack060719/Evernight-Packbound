import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.GAME_URL || 'http://127.0.0.1:5174';
const out = new URL('./', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const errors = [];
const refining = process.argv.includes('--refine-a');
const fonts = refining ? [['A2','PreviewRound']] : [['A','PreviewRound'],['B','PreviewHand'],['C','PreviewSans']];
await mkdir(new URL('screens/',out),{recursive:true});
const shot = (page,name) => page.screenshot({path:fileURLToPath(new URL(`screens/${name}.png`,out))});
try {
  for (const [id,family] of fonts) {
    const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${id}: ${error.message}`));
    await page.goto(base);
    await page.waitForFunction(() => window.__packbound && !document.querySelector('#start-button').disabled);
    await page.addStyleTag({url:base+'/output/font-preview/fonts.css'});
    await page.addStyleTag({content:`:root{font-family:${family},sans-serif!important;font-synthesis:weight}*{animation:none!important;transition:none!important}`});
    if (id === 'A2') await page.addStyleTag({url:base+'/output/font-preview/round-refined.css'});
    await page.evaluate(async family => {
      await Promise.all([400,700,900].map(weight => document.fonts.load(`${weight} 16px ${family}`,'永夜行囊晨光林徑灰鬃狼0123456789')));
      await document.fonts.ready;
    },family);
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const {root} = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.title-brand h1'});
    const rendered = await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    assert.ok(rendered.fonts.some(font => font.isCustomFont && font.glyphCount >= 4),`${id}: actual custom font rendered`);
    await shot(page,id+'-title');
    await page.evaluate(() => {
      document.querySelector('#start-button').click();
      window.__packbound.engine.setPause('manual',true);
    });
    await page.waitForFunction(() => !window.__packbound.ui.isBlocking());
    await page.evaluate(() => {
      const {engine,ui} = window.__packbound;
      engine.setPause('manual',true);
      engine.state.time = 0;
      engine.state.items = [
        ['sword',1,0,0],['ring',5,2,0],['dagger',0,3,0],['bow',1,0,1],
        ['staff',2,0,2],['armor',3,0,3],['shield',1,2,3],
      ].map(([kind,quality,row,col],i) => ({id:'font-'+i,kind,quality,placement:{row,col,rotation:0}}));
      engine.state.items.push({id:'font-charm',kind:'charm',quality:2,placement:null});
      engine.state.pets = [{id:'font-wolf',kind:'wolf',quality:1,xp:0,level:1},{id:'font-fairy',kind:'fairy',quality:2,xp:0,level:1}];
      engine.state.activePetId = 'font-wolf';
      engine.state.battle.phase = 'combat';
      engine.state.battle.enemies = [{id:'font-skeleton',kind:'skeleton',name:'骷髏',hp:180,maxHp:180,damage:1,xp:1}];
      ui.render();
      document.activeElement?.blur();
    });
    await page.waitForTimeout(250);
    await shot(page,id+'-battle');
    await page.locator('.game-header').screenshot({path:fileURLToPath(new URL(`screens/${id}-heading.png`,out))});
    await page.locator('[data-open="pets"]').tap();
    await shot(page,id+'-pets');
    await page.locator('.pet-card').first().screenshot({path:fileURLToPath(new URL(`screens/${id}-detail.png`,out))});
    if (id === 'A2') assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSynthesis),'none');
    for (const width of [360,390,430]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('#management-panel').scrollWidth > document.querySelector('#management-panel').clientWidth + 1),false,`${id} ${width}: overflow`);
      await page.locator('[data-tab="bag"]').tap();
      assert.equal(await page.locator('#management-sheet').evaluate(el => el.scrollWidth > el.clientWidth + 1),false);
      await page.locator('[data-tab="pets"]').tap();
    }
    results.push({variant:id,font:family,actualFonts:rendered.fonts,viewports:[360,390,430],overflow:false});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  if (refining) {
    const previous=JSON.parse(await readFile(new URL('validation.json',out),'utf8'));
    previous.results=previous.results.filter(result=>result.variant!=='A2').concat(results);
    previous.refinement='A2 disables synthesized bold; only large headings receive a 0.15-0.2px outline, with a lighter title shadow.';
    previous.errors=previous.errors.concat(errors);
    await writeFile(new URL('validation.json',out),JSON.stringify(previous,null,2));
  } else await writeFile(new URL('validation.json',out),JSON.stringify({results,errors,scope:'Fonts injected only into isolated screenshot sessions; game source and player save untouched. Canvas battle text stays at the original font until a final font is selected.'},null,2));
} finally { await browser.close(); }
