import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({channel:'chrome',headless:true});
const refining = process.argv.includes('--refine-a');
const variants = refining ? ['A','A2'] : ['A','B','C'];
const output = new URL(refining ? './qa-refined/' : './qa/',import.meta.url);
await mkdir(output,{recursive:true});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1280,height:1050},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400) errors.push(`${response.status()} ${response.url()}`);});
  await page.goto('http://127.0.0.1:5174/output/font-preview/'+(refining?'round-refined.html':'index.html'));
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.screen-button img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  await page.screenshot({path:fileURLToPath(new URL('desktop.png',output)),fullPage:true});
  for (const width of [360,390,430,1280]) {
    await page.setViewportSize({width,height:844});
    for (const font of variants) {
      if (await page.locator(`[data-font="${font}"]`).isVisible()) await page.locator(`[data-font="${font}"]`).click();
      assert.equal(await page.locator(`[data-id="${font}"]`).isVisible(),true);
      assert.equal(await page.locator('.card:visible').count(),width<(refining?620:760)?1:variants.length);
      for (const scene of ['battle','pets','title']) {
        await page.locator(`[data-scene="${scene}"]`).click();
        const img=page.locator(`[data-id="${font}"] .screen-button img`);
        await img.evaluate(img=>img.decode());
        assert.match(await img.getAttribute('src'),new RegExp(`${font}-${scene}.png$`));
        await page.locator(`[data-zoom="${font}"]`).click();
        assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);
        await page.locator('#zoom-image').evaluate(img=>img.decode());
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
    }
    if(width===390){
      await page.locator(`[data-font="${refining?'A2':'A'}"]`).click();
      await page.locator('[data-scene="pets"]').click();
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:fileURLToPath(new URL('mobile.png',output)),fullPage:true});
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(new URL('validation.json',output),JSON.stringify({widths:[360,390,430,1280],fontOptions:variants.length,scenes:3,combinationsChecked:variants.length*12,imageDecoding:'passed',zoomAndEscape:'passed',horizontalOverflow:false,errors},null,2));
}finally{await browser.close();}
