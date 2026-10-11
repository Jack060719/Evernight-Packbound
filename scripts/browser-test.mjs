import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.GAME_URL || 'http://127.0.0.1:5173';
const output = new URL('../test-results/', import.meta.url);
const saveKey = 'evernight-packbound-v2';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const failures = [];
const stateOf = page => page.evaluate(() => structuredClone(window.__packbound.engine.state));
const tap = (page, selector) => page.locator(selector).tap();
const shot = (page, name) => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true });
const noOverflow = async (page, label) => assert.equal(await page.evaluate(() =>
  document.documentElement.scrollWidth > innerWidth || Array.from(document.querySelectorAll('dialog[open], #management-panel'))
    .some(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1)), false, label);
const gameReady = page => page.waitForFunction(() => window.__packbound && !window.__packbound.ui.isBlocking());
const closeSheet = async page => {
  await tap(page, '[data-action="close-sheet"]');
  await page.waitForFunction(() => !document.querySelector('#management-sheet').open);
};
async function openSheet(page, tab) {
  if (await page.locator('#management-sheet').evaluate(dialog => dialog.open)) {
    await tap(page, '[data-tab="' + tab + '"]');
  } else {
    await tap(page, tab === 'settings' ? '#game-screen [data-action="menu"]' : '[data-open="' + tab + '"]');
  }
  assert.equal(await page.locator('[data-tab="' + tab + '"]').getAttribute('aria-selected'), 'true');
}
async function compactScreen(page, label) {
  await noOverflow(page, label);
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false, label + ' vertical overflow');
  assert.ok((await page.locator('body').innerText()).length < 300, label + ' keeps the visible copy concise');
  assert.equal(await page.locator('#management-panel').isVisible(), false, label + ' hides management until requested');
}
async function enterGame(page) {
  await page.waitForFunction(() => !document.querySelector('[data-action="start"]').disabled);
  await tap(page, '[data-action="start"]');
  await gameReady(page);
  assert.equal(await page.locator('#title-screen').isVisible(), false);
  assert.equal(await page.locator('#game-screen').isVisible(), true);
  const canvas = await page.locator('#battle-stage canvas').boundingBox();
  assert.ok(canvas && canvas.width > 100 && canvas.height > 100, 'Canvas is visible after leaving the title');
}

async function touchDrag(page, from, to) {
  await page.locator(from).first().scrollIntoViewIfNeeded();
  await page.locator(to).first().scrollIntoViewIfNeeded();
  const start = await page.locator(from).first().boundingBox();
  const finish = await page.locator(to).first().boundingBox();
  assert.ok(start && finish, 'Drag targets visible');
  const a = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
  const b = { x: finish.x + finish.width / 2, y: finish.y + finish.height / 2 };
  assert.ok(a.y > 0 && a.y < 844 && b.y > 0 && b.y < 844, 'Touch points inside viewport');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  for (let index = 1; index <= 8; index++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * index / 8, y: a.y + (b.y - a.y) * index / 8 }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // CDP touch drags can suppress the next compatibility click for longer than 350 ms.
  await page.waitForTimeout(1000);
  await cdp.detach();
}

try {
  for (const width of [360, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => failures.push(width + ': ' + error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(width + ': HTTP ' + response.status() + ' ' + response.url()); });
    await page.goto(baseURL);
    await page.waitForFunction(() => window.__packbound?.engine);
    await page.waitForFunction(() => !document.querySelector('[data-action="start"]').disabled);
    assert.equal(await page.locator('#title-screen').isVisible(), true);
    assert.match(await page.locator('[data-action="start"]').innerText(), /開始旅程/);
    await page.waitForTimeout(150);
    assert.equal((await stateOf(page)).time, 0, 'Title screen never starts combat');
    await compactScreen(page, 'Title ' + width);
    await shot(page, 'mobile-' + width + '-title.png');
    if (width === 390) {
      await tap(page, '#title-screen [data-action="menu"]');
      assert.equal(await page.locator('#management-sheet').evaluate(dialog => dialog.open), true);
      await closeSheet(page);
      assert.equal(await page.locator('#title-screen').isVisible(), true);
      assert.equal((await stateOf(page)).time, 0, 'Title settings never start combat');
    }
    await enterGame(page);
    await page.waitForSelector('#battle-stage canvas');
    if (width === 390) {
      await openSheet(page, 'bag');
      const sheetTime = (await stateOf(page)).time;
      await page.waitForTimeout(150);
      assert.equal((await stateOf(page)).time, sheetTime, 'Management freezes a running game');
      await page.keyboard.press('Escape');
      assert.equal((await stateOf(page)).pauses.includes('organize'), false);
      await page.waitForFunction(time => window.__packbound.engine.state.time > time, sheetTime);
    }
    await tap(page, '#play-button');
    assert.ok((await stateOf(page)).pauses.includes('manual'));
    await compactScreen(page, 'Game ' + width);
    await shot(page, 'mobile-' + width + '-game.png');
    if (width === 360) {
      await page.setViewportSize({ width, height: 740 });
      await compactScreen(page, 'Game 360 × 740');
      await shot(page, 'mobile-360-short-game.png');
      await page.setViewportSize({ width, height: 844 });
    }
    await openSheet(page, 'bag');
    assert.equal(await page.locator('.bag-cell').count(), 20, 'Only unlocked cells are shown');
    assert.equal(await page.locator('.bag-cell.locked, .cell-continuation, .preview-cell i').count(), 0);
    assert.equal(await page.locator('#bag-preview [data-equipment]').count(), 3, 'Each equipped item has one complete image');
    const previewWidth = (await page.locator('#bag-preview').boundingBox()).width;
    assert.ok(previewWidth > width * 0.75, 'Initial backpack uses most of the screen width');
    await shot(page, 'mobile-' + width + '-bag.png');

    // All three target widths exercise actual touch selection, rotation, and placement.
    await tap(page, '.stash-item[data-item="i5"]');
    await tap(page, '[data-action="rotate"]');
    await tap(page, '.bag-cell[data-row="2"][data-col="2"]');
    let state = await stateOf(page);
    assert.deepEqual(state.items.find(item => item.id === 'i5').placement, { row: 2, col: 2, rotation: 1 });
    const itemCount = state.items.length;
    await touchDrag(page, '.bag-cell[data-item="i5"]', '.bag-cell[data-row="0"][data-col="1"]');
    state = await stateOf(page);
    assert.equal(state.items.length, itemCount);
    assert.deepEqual(state.items.find(item => item.id === 'i5').placement, { row: 2, col: 2, rotation: 1 }, 'Invalid placement preserves original');
    for (const tab of ['pets', 'growth', 'settings', 'bag']) {
      await tap(page, '[data-tab="' + tab + '"]');
      assert.equal(await page.locator('[data-tab="' + tab + '"]').getAttribute('aria-selected'), 'true');
      await noOverflow(page, tab + ' overflow ' + width);
    }

    if (width === 390) {
      // A user gesture starts combat and unlocks local audio.
      await closeSheet(page);
      await tap(page, '#play-button');
      await page.waitForFunction(() => window.__packbound.audio.buffers.size === 10 && window.__packbound.audio.context.state === 'running');
      await page.waitForFunction(() => window.__packbound.engine.state.battle.phase === 'combat');
      await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('visible'));
      await shot(page, 'mobile-390-combat.png');
      await tap(page, '#play-button');
      assert.ok((await stateOf(page)).pauses.includes('manual'));
      const voices = await page.evaluate(() => {
        const audio = window.__packbound.audio;
        for (let index = 0; index < 30; index++) audio.play({ type: 'attack' });
        return audio.voices;
      });
      assert.ok(voices > 0 && voices <= 6, 'At most six simultaneous effects');

      // Drag-to-merge confirmation preserves both items until explicitly confirmed.
      await openSheet(page, 'bag');
      await tap(page, '.bag-cell[data-row="2"][data-col="2"]');
      await tap(page, '[data-action="stash"]');
      await touchDrag(page, '.stash-item[data-item="i6"]', '.stash-item[data-item="i5"]');
      assert.match(await page.locator('#dialog-content').innerText(), /90%/);
      assert.match(await page.locator('#dialog-content').innerText(), /失敗/);
      const beforeMerge = (await stateOf(page)).items.length;
      await tap(page, '[data-action="cancel-dialog"]');
      assert.equal((await stateOf(page)).items.length, beforeMerge);
      await page.evaluate(() => { window.__packbound.engine.random = () => 0.99; });
      await touchDrag(page, '.stash-item[data-item="i6"]', '.stash-item[data-item="i5"]');
      await tap(page, '[data-action="confirm-dialog"]');
      state = await stateOf(page);
      assert.equal(state.items.length, beforeMerge - 1);
      assert.equal(state.items.find(item => item.id === 'i5').quality, 0);
      assert.equal(state.items.some(item => item.id === 'i6'), false);
      assert.ok(state.items.find(item => item.id === 'i1').placement);
      await tap(page, '.stash-item[data-item="i5"]');
      await tap(page, '[data-action="discard"]');
      await tap(page, '[data-action="cancel-dialog"]');
      assert.ok((await stateOf(page)).items.some(item => item.id === 'i5'));
      await tap(page, '[data-action="discard"]');
      await tap(page, '[data-action="confirm-dialog"]');
      assert.equal((await stateOf(page)).items.some(item => item.id === 'i5'), false);

      await touchDrag(page, '.stash-item[data-item="i4"]', '.bag-cell[data-row="0"][data-col="3"]');
      assert.deepEqual((await stateOf(page)).items.find(item => item.id === 'i4').placement, { row: 0, col: 3, rotation: 0 }, 'Real touch drag');
      await touchDrag(page, '.bag-cell[data-item="i4"]', '.bag-cell[data-row="0"][data-col="1"]');
      assert.deepEqual((await stateOf(page)).items.find(item => item.id === 'i4').placement, { row: 0, col: 3, rotation: 0 }, 'Invalid touch drag preserves item');

      // Seed earned points; controls perform allocation and adjacent-cell expansion.
      await page.evaluate(() => { window.__packbound.engine.state.hero.points = 5; window.__packbound.ui.render(); });
      await tap(page, '[data-tab="growth"]');
      await tap(page, '[data-action="grow-attack"]');
      await tap(page, '[data-action="grow-health"]');
      state = await stateOf(page);
      assert.equal(state.hero.attackPoints, 1);
      assert.equal(state.hero.healthPoints, 1);
      assert.equal(state.hero.points, 3);
      await tap(page, '[data-action="expand"]');
      await tap(page, '.bag-cell[data-row="0"][data-col="5"]');
      state = await stateOf(page);
      assert.equal(state.unlockedCells.length, 21);
      assert.equal(state.hero.points, 1);
      await shot(page, 'mobile-390-expanded.png');
      await tap(page, '[data-action="cancel-expand"]');

      // Pet selection, synthesis experience retention, and release confirmation.
      await page.evaluate(() => {
        const { engine, ui } = window.__packbound;
        engine.random = () => 0;
        engine.state.pets = [
          { id: 'test-wolf', kind: 'wolf', quality: 0, xp: 0, level: 1 },
          { id: 'test-fairy', kind: 'fairy', quality: 0, xp: 0, level: 1 },
          { id: 'test-wolf-old', kind: 'wolf', quality: 0, xp: 90, level: 3 },
        ];
        ui.render();
      });
      await tap(page, '[data-tab="pets"]');
      await tap(page, '[data-action="equip-pet"][data-id="test-wolf"]');
      assert.equal((await stateOf(page)).activePetId, 'test-wolf');
      await tap(page, '[data-action="equip-pet"][data-id="test-fairy"]');
      assert.equal((await stateOf(page)).activePetId, 'test-fairy');
      await tap(page, '[data-action="synthesize-pet"][data-id="test-wolf"]');
      assert.match(await page.locator('#dialog-content').innerText(), /90 經驗/);
      await shot(page, 'mobile-390-synthesis.png');
      await tap(page, '[data-action="confirm-dialog"]');
      state = await stateOf(page);
      assert.equal(state.pets.find(pet => pet.id === 'test-wolf-old').quality, 1);
      assert.equal(state.pets.find(pet => pet.id === 'test-wolf-old').xp, 90);
      assert.equal(state.activePetId, 'test-fairy');
      await shot(page, 'mobile-390-pets.png');
      await tap(page, '[data-action="release-pet"][data-id="test-wolf-old"]');
      await tap(page, '[data-action="cancel-dialog"]');
      assert.equal((await stateOf(page)).pets.length, 2);
      await tap(page, '[data-action="release-pet"][data-id="test-wolf-old"]');
      await tap(page, '[data-action="confirm-dialog"]');
      assert.equal((await stateOf(page)).pets.length, 1);

      await tap(page, '[data-tab="settings"]');
      await tap(page, '#auto-settings > summary');
      await page.locator('#items-cap').selectOption('2');
      await page.locator('#pets-cap').selectOption('3');
      await page.locator('#auto-items').check();
      await page.locator('#auto-pets').check();
      await page.locator('#music-mute').check();
      await page.locator('#sound-mute').check();
      await page.locator('#sound-mute').uncheck();
      await page.locator('#music-volume').fill('0.4');
      await page.locator('#sound-volume').fill('0.6');
      state = await stateOf(page);
      assert.deepEqual(state.settings.autoItems, { enabled: true, maxQuality: 2 });
      assert.deepEqual(state.settings.autoPets, { enabled: true, maxQuality: 3 });
      assert.equal(state.settings.musicMuted, true);
      assert.equal(state.settings.soundMuted, false);
      assert.equal(state.settings.musicVolume, 0.4);
      assert.equal(state.settings.soundVolume, 0.6);
      const gains = await page.evaluate(() => ({ music: window.__packbound.audio.musicGain.gain.value, sound: window.__packbound.audio.soundGain.gain.value }));
      assert.equal(gains.music, 0);
      assert.ok(Math.abs(gains.sound - 0.42) < 0.001);
      await shot(page, 'mobile-390-settings.png');

      // Background preserves organize/manual pause reasons and never advances time.
      const beforeHidden = (await stateOf(page)).time;
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(() => window.__packbound.audio.context.state === 'suspended');
      await page.waitForTimeout(150);
      state = await stateOf(page);
      assert.equal(state.time, beforeHidden);
      assert.ok(state.pauses.includes('organize') && state.pauses.includes('hidden'));
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(() => window.__packbound.audio.context.state === 'running');
      state = await stateOf(page);
      assert.equal(state.time, beforeHidden);
      assert.ok(state.pauses.includes('organize') && state.pauses.includes('manual') && !state.pauses.includes('hidden'));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#management-sheet').evaluate(dialog => dialog.open), false);
      state = await stateOf(page);
      assert.ok(state.pauses.includes('manual'), 'Esc must preserve manual/background pause');
      assert.equal(state.pauses.includes('organize'), false);
      await page.waitForTimeout(150);
      assert.equal((await stateOf(page)).time, beforeHidden);

      // Returning to the title saves and stays paused until an explicit continue.
      await openSheet(page, 'settings');
      await tap(page, '[data-action="return-title"]');
      await page.waitForFunction(() => !document.querySelector('#title-screen').hidden && document.querySelector('#screen-transition').hidden);
      assert.equal(await page.locator('#management-sheet').evaluate(dialog => dialog.open), false);
      assert.match(await page.locator('[data-action="start"]').innerText(), /繼續旅程/);
      await page.waitForTimeout(150);
      assert.equal((await stateOf(page)).time, beforeHidden);
      await enterGame(page);
      await tap(page, '#play-button');
      await openSheet(page, 'bag');

      // Capacity pause and unclaimed loot survive reload. Discarding claims the held item.
      await page.evaluate(() => {
        const { engine, ui, save } = window.__packbound;
        engine.state.settings.autoItems.enabled = false;
        engine.state.items = engine.state.items.filter(item => item.placement);
        engine.state.items.push(...Array.from({ length: 30 }, (_, index) => ({ id: 'full-' + index, kind: 'dagger', quality: 0, placement: null })));
        engine.state.pending.items = [{ id: 'pending-item', kind: 'ring', quality: 0, placement: null }];
        engine.retryPending(); ui.render(); save();
      });
      const savedTime = (await stateOf(page)).time;
      await page.reload();
      await page.waitForFunction(() => window.__packbound?.engine);
      state = await stateOf(page);
      assert.equal(state.time, savedTime);
      assert.ok(state.pauses.includes('manual') && state.pauses.includes('capacity'));
      assert.equal(state.pending.items[0].id, 'pending-item');
      assert.equal(state.settings.musicVolume, 0.4);
      assert.equal(state.settings.soundVolume, 0.6);
      assert.equal(await page.locator('#title-screen').isVisible(), true);
      await page.waitForTimeout(150);
      assert.equal((await stateOf(page)).time, savedTime);
      await enterGame(page);
      assert.equal((await stateOf(page)).pauses.includes('organize'), false, 'Continue clears saved organize state');
      await openSheet(page, 'bag');
      await tap(page, '.stash-item[data-item="full-0"]');
      await tap(page, '[data-action="discard"]');
      await tap(page, '[data-action="confirm-dialog"]');
      state = await stateOf(page);
      assert.equal(state.pending.items.length, 0);
      assert.ok(state.items.some(item => item.id === 'pending-item'));
      assert.equal(state.pauses.includes('capacity'), false);
      assert.equal(state.items.filter(item => !item.placement).length, 30);
    }

    await page.evaluate(() => {
      const { engine, ui } = window.__packbound;
      engine.state.unlockedCells = Array.from({ length: 30 }, (_, index) => ({ row: Math.floor(index / 5), col: index % 5 }));
      ui.render();
    });
    await closeSheet(page);
    await compactScreen(page, 'Six-row preview ' + width);
    if (width === 360) {
      await page.setViewportSize({ width, height: 740 });
      await compactScreen(page, 'Six-row preview 360 × 740');
      await shot(page, 'mobile-360-tall-bag-preview.png');
      await page.setViewportSize({ width, height: 844 });
    }
    await page.evaluate(() => {
      const { engine, ui } = window.__packbound;
      engine.state.unlockedCells = Array.from({ length: 48 }, (_, index) => ({ row: Math.floor(index / 8), col: index % 8 }));
      ui.render();
    });
    await openSheet(page, 'bag');
    await noOverflow(page, 'Maximum bag overflow ' + width);
    assert.equal(await page.locator('.bag-cell.locked').count(), 0);
    results.push({ width, titleAndCompactGame: 'passed', touchPlacement: 'passed', sheets: 'passed', maximumBagOverflow: false, ...(width === 390 ? { deepFlows: 'passed', actualTouchDrag: 'passed', audio: 'passed', saveAndVisibility: 'passed', titleAndResume: 'passed' } : {}) });
    await context.close();
  }

  // Every source/target location supports touch merging; the drop target keeps its position.
  const mergeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mergePage = await mergeContext.newPage();
  mergePage.on('pageerror', error => failures.push('merging: ' + error.message));
  await mergePage.goto(baseURL);
  await enterGame(mergePage);
  await tap(mergePage, '#play-button');
  await openSheet(mergePage, 'bag');
  for (const [sourceBag, targetBag] of [[false, false], [false, true], [true, false], [true, true]]) {
    await mergePage.evaluate(([sourceBag, targetBag]) => {
      const { engine, ui } = window.__packbound;
      engine.random = () => 0;
      engine.state.items = [
        { id: 'merge-source', kind: 'sword', quality: 0, placement: sourceBag ? { row: 0, col: 0, rotation: 0 } : null },
        { id: 'merge-target', kind: 'sword', quality: 0, placement: targetBag ? { row: 0, col: 2, rotation: 0 } : null },
      ];
      ui.render();
    }, [sourceBag, targetBag]);
    const source = (sourceBag ? '.bag-cell' : '.stash-item') + '[data-item="merge-source"]';
    const target = (targetBag ? '.bag-cell' : '.stash-item') + '[data-item="merge-target"]';
    const before = (await stateOf(mergePage)).items;
    await touchDrag(mergePage, source, target);
    await mergePage.waitForSelector('#game-dialog[open]');
    assert.match(await mergePage.locator('#dialog-content').innerText(), /90%/);
    await tap(mergePage, '[data-action="cancel-dialog"]');
    await mergePage.waitForFunction(() => !document.querySelector('#game-dialog').open);
    assert.deepEqual((await stateOf(mergePage)).items, before, 'Cancelling never moves or consumes either item');
    await touchDrag(mergePage, source, target);
    await tap(mergePage, '[data-action="confirm-dialog"]');
    await mergePage.waitForFunction(() => !document.querySelector('#game-dialog').open);
    const merged = (await stateOf(mergePage)).items;
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'merge-target');
    assert.equal(merged[0].quality, 1);
    assert.deepEqual(merged[0].placement, before[1].placement);
  }
  await shot(mergePage, 'mobile-390-merged-equipment.png');
  // Rotating a placed item takes one tap and preserves its origin when legal.
  await tap(mergePage, '.bag-cell[data-item="merge-target"][data-row="0"]');
  await tap(mergePage, '[data-action="rotate"]');
  assert.deepEqual((await stateOf(mergePage)).items[0].placement, { row: 0, col: 2, rotation: 1 });
  assert.doesNotMatch(await mergePage.locator('[data-action="rotate"]').innerText(), /°|90|180/);
  results.push({ dragSynthesisAcrossAllLocations: 'passed', mergeCancellationAndTargetRetention: 'passed', oneTapRotation: 'passed' });
  await mergeContext.close();

  // Asset readiness, transitions, and death recovery run through the real controls and clock.
  const transitionContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const transitionPage = await transitionContext.newPage();
  transitionPage.on('pageerror', error => failures.push('transitions: ' + error.message));
  let releaseHero;
  const heroGate = new Promise(resolve => { releaseHero = resolve; });
  await transitionPage.route('**/assets/hero.png', async route => { await heroGate; await route.continue(); });
  await transitionPage.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await transitionPage.waitForFunction(() => window.__packbound?.engine);
  assert.equal(await transitionPage.locator('[data-action="start"]').isDisabled(), true, 'Cannot start before the battle artwork is ready');
  assert.equal((await stateOf(transitionPage)).time, 0);
  releaseHero();
  await transitionPage.waitForFunction(() => !document.querySelector('[data-action="start"]').disabled);
  await tap(transitionPage, '[data-action="start"]');
  await transitionPage.waitForSelector('#screen-transition.active');
  assert.equal((await stateOf(transitionPage)).time, 0, 'Entry transition blocks combat');
  await transitionPage.waitForTimeout(150);
  assert.equal((await stateOf(transitionPage)).time, 0);
  await shot(transitionPage, 'mobile-390-entry-transition.png');
  await gameReady(transitionPage);
  await tap(transitionPage, '#play-button');

  await transitionPage.evaluate(() => { window.__packbound.engine.state.unlockedFloor = 2; window.__packbound.ui.render(); });
  await openSheet(transitionPage, 'settings');
  await transitionPage.locator('#floor-select').selectOption('2');
  await transitionPage.waitForSelector('#screen-transition.active');
  assert.match(await transitionPage.locator('#screen-transition').innerText(), /苔石遺跡/);
  const beforeFloor = (await stateOf(transitionPage)).time;
  await transitionPage.waitForTimeout(150);
  assert.equal((await stateOf(transitionPage)).time, beforeFloor);
  await shot(transitionPage, 'mobile-390-floor-transition.png');
  await gameReady(transitionPage);
  if (await transitionPage.locator('#management-sheet').evaluate(dialog => dialog.open)) await closeSheet(transitionPage);
  assert.equal((await stateOf(transitionPage)).floor, 2);

  await transitionPage.evaluate(() => {
    const { engine, ui } = window.__packbound;
    engine.state.hero.hp = 1;
    engine.state.battle = {
      phase: 'combat', remaining: 0, round: 1, stage: 'enemies',
      actions: [{ kind: 'enemy', sourceId: 'lethal-test' }], actionIndex: 0, actionResolved: false,
      enemies: [{ id: 'lethal-test', kind: 'skeleton', name: '小骨兵', hp: 9999, maxHp: 9999, damage: 999, xp: 0 }],
    };
    ui.render();
  });
  await tap(transitionPage, '#play-button');
  await transitionPage.waitForSelector('#screen-transition.active');
  assert.match(await transitionPage.locator('#screen-transition').innerText(), /再度起身/);
  const beforeDeath = (await stateOf(transitionPage)).time;
  await transitionPage.waitForTimeout(150);
  assert.equal((await stateOf(transitionPage)).time, beforeDeath, 'Death transition freezes its recovery timer');
  await shot(transitionPage, 'mobile-390-death-transition.png');
  await gameReady(transitionPage);
  await transitionPage.waitForFunction(() => window.__packbound.engine.state.battle.phase === 'travel');
  assert.equal((await stateOf(transitionPage)).wave, 1);
  assert.ok((await stateOf(transitionPage)).hero.hp > 0);
  results.push({ assetReadiness: 'passed', entryFloorAndDeathTransitions: 'passed' });
  await transitionContext.close();

  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(baseURL);
  await reducedPage.waitForFunction(() => window.__packbound && !document.querySelector('[data-action="start"]').disabled);
  const reducedStarted = Date.now();
  await enterGame(reducedPage);
  assert.ok(Date.now() - reducedStarted < 650, 'Reduced motion uses a short transition');
  await compactScreen(reducedPage, 'Reduced-motion game');
  results.push({ reducedMotion: 'passed' });
  await reducedContext.close();

  // Task 04: opening, hiding and even a forced start click cannot unlock a damaged save.
  const context = await browser.newContext();
  const corrupt = JSON.stringify({ version: 999, keep: 'original' });
  await context.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [saveKey, corrupt]);
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.waitForFunction(() => window.__packbound?.engine);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), corrupt, 'Unrecognized save must not be silently overwritten');
  await page.waitForFunction(() => document.querySelector('[data-action="start"]').textContent === '存檔需要恢復');
  assert.equal(await page.locator('[data-action="start"]').isDisabled(), true);
  const protectedState = await stateOf(page);
  await page.evaluate(() => {
    const button = document.querySelector('[data-action="start"]');
    button.disabled = false;
    button.click();
    window.__packbound.save();
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#title-screen').isVisible(), true, 'Forced click cannot bypass the readonly guard');
  assert.deepEqual(await stateOf(page), protectedState, 'Readonly mode does not start or simulate the fallback state');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), corrupt, 'Explicit start cannot overwrite an unrecognized save');
  results.push({ corruptSaveLockedAcrossStartAndPagehide: true });
  await context.close();
  assert.deepEqual(failures, [], 'Browser errors');
  await writeFile(new URL('browser-results.json', output), JSON.stringify({ results, failures }, null, 2));
  console.log(JSON.stringify({ results, failures }, null, 2));
} catch (error) {
  const page = browser.contexts().flatMap(context => context.pages()).at(-1);
  if (page) await shot(page, 'browser-failure.png').catch(() => {});
  throw error;
} finally {
  await browser.close();
}
