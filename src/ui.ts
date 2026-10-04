import { GameEngine } from './game/engine';
import { CAPACITY, COLS, ITEMS, PETS, QUALITY_COLORS, QUALITY_MULTIPLIERS, QUALITY_NAMES, ROWS, SYNTHESIS_CHANCES, rotateShape, xpForLevel } from './game/content';
import type { Cell, GameEvent, Item, OperationResult, Pet, Quality } from './game/types';

type Tab = 'bag' | 'pets' | 'growth' | 'settings';
type Callbacks = { onStart: () => void; onChange: () => void };
const floorNames = ['晨光林徑', '苔石遺跡', '古樹庭院'];
const qualityStyle = (quality: number) => `--quality:${QUALITY_COLORS[quality]};--quality-ink:${[1, 2, 4].includes(quality) ? '#fff' : '#382a16'}`;
const qualityBadge = (quality: number, corner = false) => `<span class="quality-badge${corner ? ' quality-corner' : ''}">${corner ? QUALITY_NAMES[quality][0] : QUALITY_NAMES[quality]}</span>`;
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}.png`;
const itemArt = (kind: Item['kind']) => asset(`icon-${kind === 'charm' ? 'amulet' : kind}`);

export function mountUI(engine: GameEngine, callbacks: Callbacks, options: { hasSave: boolean }) {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  let tab: Tab = 'bag';
  let onTitle = true;
  let transitioning = false;
  let ready = false;
  let hasSave = options.hasSave;
  let sheetOwnsPause = false;
  let transitionTimer = 0;
  let previewSnapshot = '';
  let selectedId: string | null = null;
  let rotation = 0;
  let expanding = false;
  let panelSnapshot = '';
  let toastTimer = 0;
  let confirmAction: (() => void) | null = null;
  let rangeActive = false;
  let suppressPointerClick = false;
  let drag: { id: string; x: number; y: number; moving: boolean; offset: Cell; target: Cell | null; mergeTarget: string | null } | null = null;

  app.innerHTML = `
    <main class="game-shell" style="--world:url('${asset('background')}')">
      <section class="title-screen" id="title-screen" aria-label="永夜行囊開始畫面">
        <div class="title-mist"></div><div class="title-brand"><span class="title-rune" aria-hidden="true">◇</span><h1>永夜行囊</h1><p>EVERNIGHT · PACKBOUND</p></div>
        <img class="title-hero" src="${asset('hero')}" alt="" draggable="false">
        <div class="title-actions"><button class="btn btn-primary start-button" data-action="start" id="start-button" disabled>準備中…</button><div class="title-links"><button data-action="menu">設定</button><span>·</span><button data-action="help">遊玩說明</button></div></div>
      </section>
      <section class="game-screen" id="game-screen" inert aria-label="冒險畫面">
        <header class="game-header"><div><div class="floor-meta"><span id="floor-number">第 1 層</span><span id="wave-number">1 / 5 波</span></div><h1 id="floor-name">晨光林徑</h1></div><div class="header-actions"><button class="icon-button" data-action="play" id="play-button" aria-label="暫停探索">Ⅱ</button><button class="icon-button" data-action="menu" aria-label="選單">☰</button></div></header>
        <section class="hero-status" aria-label="角色狀態"><span class="hero-level" id="hero-level">Lv.1</span><div class="hero-bars"><div class="meter hp-meter" role="meter" aria-label="生命值" id="hp-meter"><span id="hp-fill"></span></div><div class="meter xp-meter" role="meter" aria-label="等級經驗" id="xp-meter"><span id="xp-fill"></span></div></div><span class="hp-text" id="hp-text"></span></section>
        <section class="battle-wrap" aria-label="自動戰鬥畫面"><div id="battle-stage"></div><span class="scene-status" id="scene-status"></span></section>
        <div class="capacity-alert" id="capacity-alert" hidden><span id="capacity-message"></span><button data-action="organize">整理</button></div>
        <section class="equipped-section"><div class="preview-heading"><span>行囊</span><small id="bag-count"></small></div><div class="preview-space"><button class="bag-preview" id="bag-preview" data-action="organize" aria-label="整理行囊"></button></div></section>
        <nav class="game-nav" aria-label="角色管理"><button data-open="bag"><span aria-hidden="true">▦</span>行囊<i class="nav-badge" id="stash-badge" hidden></i></button><button data-open="pets"><span aria-hidden="true">♞</span>旅伴</button><button data-open="growth"><span aria-hidden="true">✧</span>成長<i class="nav-badge" id="point-badge" hidden></i></button></nav>
      </section>
      <div class="screen-transition" id="screen-transition" role="status" aria-live="polite" hidden><span class="transition-rune">◇</span><small id="transition-kicker"></small><h2 id="transition-title"></h2><i></i></div>
    </main>
    <dialog class="management-sheet" id="management-sheet" aria-labelledby="sheet-title"><header class="sheet-header"><h2 id="sheet-title">行囊</h2><button class="icon-button" data-action="close-sheet" aria-label="關閉管理">×</button></header><nav class="tabs" role="tablist" aria-label="角色管理">${(['bag', 'pets', 'growth', 'settings'] as Tab[]).map((value, index) => `<button class="tab" role="tab" id="tab-${value}" aria-controls="management-panel" aria-selected="${index === 0}" data-tab="${value}">${['行囊', '旅伴', '成長', '設定'][index]}</button>`).join('')}</nav><section class="management" id="management-panel" role="tabpanel" aria-labelledby="tab-bag"></section><div class="drag-ghost" id="drag-ghost" hidden></div></dialog>
    <dialog class="game-dialog" id="game-dialog" aria-labelledby="dialog-title"><div class="dialog-rune" aria-hidden="true">✧</div><h2 id="dialog-title"></h2><div id="dialog-content"></div><div class="dialog-actions"><button class="btn" data-action="cancel-dialog">取消</button><button class="btn btn-primary" data-action="confirm-dialog" id="confirm-dialog">確認</button></div></dialog>
    <dialog class="game-dialog help-dialog" id="help-dialog" aria-labelledby="help-title"><h2 id="help-title">遊玩說明</h2><ul><li>角色會自動戰鬥，依行囊由上到下、由左到右出招。</li><li>放入行囊的裝備才會生效。拖曳移動，↻ 旋轉。</li><li>將同品項、同品質裝備疊在一起可合成，確認後才消耗材料。</li><li>每 2 成長點可擴充一格行囊。</li></ul><p>本機自動保存，切到背景會暫停。</p><button class="btn btn-primary" data-action="close-help">明白了</button></dialog>
    <div class="toast" role="status" aria-live="polite" id="toast" popover="manual"></div>`;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const panel = $('management-panel');
  const dialog = $<HTMLDialogElement>('game-dialog');
  const sheet = $<HTMLDialogElement>('management-sheet');
  const helpDialog = $<HTMLDialogElement>('help-dialog');
  const selectedItem = () => engine.state.items.find(item => item.id === selectedId);
  const organizing = () => engine.state.pauses.includes('organize');

  function notify(message: string) {
    $('toast').textContent = message;
    $('toast').showPopover();
    $('toast').classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { $('toast').classList.remove('visible'); $('toast').hidePopover(); }, 2600);
  }

  function openSheet(nextTab: Tab) {
    tab = nextTab;
    selectedId = null;
    expanding = false;
    if (!sheet.open) {
      sheetOwnsPause = !organizing();
      engine.setPause('organize', true);
      sheet.showModal();
    }
    panelSnapshot = '';
    render();
    callbacks.onChange();
  }

  function closeSheet() {
    if (!sheet.open) return;
    sheet.close();
    if (sheetOwnsPause) engine.setPause('organize', false);
    sheetOwnsPause = false;
    selectedId = null;
    expanding = false;
    endPointer(true);
    changed();
  }

  function showTransition(kind: 'enter' | 'floor' | 'death') {
    window.clearTimeout(transitionTimer);
    transitioning = true;
    $('screen-transition').hidden = false;
    $('screen-transition').classList.remove('active');
    $('transition-kicker').textContent = kind === 'death' ? 'THE JOURNEY CONTINUES' : `FLOOR ${String(engine.state.floor).padStart(2, '0')}`;
    $('transition-title').textContent = kind === 'death' ? '再度起身' : floorNames[engine.state.floor - 1];
    void $('screen-transition').offsetWidth;
    $('screen-transition').classList.add('active');
    $('game-screen').inert = true;
    transitionTimer = window.setTimeout(() => {
      transitioning = false;
      $('screen-transition').hidden = true;
      $('screen-transition').classList.remove('active');
      $('game-screen').inert = onTitle;
      render();
      if (!onTitle && !sheet.open) $('play-button').focus({ preventScroll: true });
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 700);
  }

  function startJourney() {
    if (!ready || transitioning) return;
    onTitle = false;
    hasSave = true;
    $('title-screen').hidden = true;
    $('game-screen').classList.add('visible');
    engine.setPause('manual', false);
    engine.setPause('organize', false);
    engine.retryPending();
    showTransition('enter');
    callbacks.onStart();
    changed();
  }

  function returnToTitle() {
    engine.setPause('manual', true);
    closeSheet();
    onTitle = true;
    window.clearTimeout(transitionTimer);
    transitioning = false;
    $('screen-transition').hidden = true;
    $('game-screen').classList.remove('visible');
    $('game-screen').inert = true;
    $('title-screen').hidden = false;
    changed();
    $('start-button').focus({ preventScroll: true });
  }

  function changed(result?: OperationResult) {
    if (result?.message) notify(result.message);
    callbacks.onChange();
    render();
  }

  function enterOrganize() {
    if (!organizing()) engine.setPause('organize', true);
  }

  function selectItem(id: string) {
    const item = engine.state.items.find(value => value.id === id);
    if (!item) return;
    enterOrganize();
    selectedId = id;
    rotation = item.placement?.rotation ?? 0;
    expanding = false;
    changed();
  }

  function showDialog(title: string, content: string, action: () => void, label = '確認') {
    $('dialog-title').textContent = title;
    $('dialog-content').innerHTML = content;
    $('confirm-dialog').textContent = label;
    confirmAction = action;
    dialog.showModal();
  }

  function itemEffect(item: Item) {
    const definition = ITEMS[item.kind];
    const multiplier = QUALITY_MULTIPLIERS[item.quality];
    const details = [];
    if (definition.damage) details.push(`每回合傷害 ${(definition.damage * multiplier).toFixed(1)}`);
    if (definition.health) details.push(`生命 +${Math.round(definition.health * multiplier)}`);
    if (definition.defense) details.push(`防禦 +${(definition.defense * multiplier).toFixed(1)}`);
    if (definition.attack) details.push(`攻擊 +${(definition.attack * multiplier).toFixed(1)}`);
    if (definition.healing) details.push(`每 ${definition.everyRounds} 回合回復 ${(definition.healing * multiplier).toFixed(1)}`);
    return details.join(' · ');
  }

  function synthesisPartner(kind: 'item' | 'pet', id: string): Item | Pet | undefined {
    if (kind === 'item') {
      const first = engine.state.items.find(item => item.id === id);
      if (!first || first.quality === 5) return undefined;
      const matches = engine.state.items.filter(item => item.id !== id && item.kind === first.kind && item.quality === first.quality);
      return matches.find(item => !item.placement) ?? matches[0];
    }
    const first = engine.state.pets.find(pet => pet.id === id);
    return first && first.id !== engine.state.activePetId && first.quality < 5 ? engine.state.pets.find(pet => pet.id !== id && pet.id !== engine.state.activePetId && pet.kind === first.kind && pet.quality === first.quality) : undefined;
  }

  function equipmentArt(item: Item) {
    const placement = item.placement!;
    const base = ITEMS[item.kind].shape;
    const shape = rotateShape(base, placement.rotation);
    const cols = Math.max(...shape.map(cell => cell.col)) + 1;
    const rows = Math.max(...shape.map(cell => cell.row)) + 1;
    const baseCols = Math.max(...base.map(cell => cell.col)) + 1;
    const baseRows = Math.max(...base.map(cell => cell.row)) + 1;
    const filled = new Set(shape.map(cell => `${cell.row},${cell.col}`));
    const outline = shape.map(({ row, col }) => [
      !filled.has(`${row - 1},${col}`) ? `M${col} ${row}h1` : '',
      !filled.has(`${row + 1},${col}`) ? `M${col} ${row + 1}h1` : '',
      !filled.has(`${row},${col - 1}`) ? `M${col} ${row}v1` : '',
      !filled.has(`${row},${col + 1}`) ? `M${col + 1} ${row}v1` : '',
    ].join('')).join('');
    const active = engine.currentAction?.sourceId === item.id;
    return `<span class="equipment${selectedId === item.id ? ' selected' : ''}${active ? ' acting' : ''}" data-equipment="${item.id}" aria-hidden="true" style="grid-row:${placement.row + 1}/span ${rows};grid-column:${placement.col + 1}/span ${cols};${qualityStyle(item.quality)}"><svg class="item-footprint" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none">${shape.map(cell => `<rect x="${cell.col}" y="${cell.row}" width="1" height="1"/>`).join('')}<path class="quality-outline" d="${outline}" vector-effect="non-scaling-stroke"/><path d="${outline}" vector-effect="non-scaling-stroke"/></svg><img class="equipment-art" src="${itemArt(item.kind)}" alt="" draggable="false" style="width:${baseCols / cols * 100}%;height:${baseRows / rows * 100}%;transform:translate(-50%,-50%) rotate(${placement.rotation * 90}deg)">${qualityBadge(item.quality, true)}</span>`;
  }

  function board(editable: boolean, expand = false) {
    const { state } = engine;
    const unlocked = new Set(state.unlockedCells.map(cell => `${cell.row},${cell.col}`));
    const visible = new Map(state.unlockedCells.map(cell => [`${cell.row},${cell.col}`, cell]));
    if (expand) for (const { row, col } of state.unlockedCells) {
      for (const [r, c] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) visible.set(`${r},${c}`, { row: r, col: c });
      }
    }
    const occupied = new Map<string, Item>();
    const placed = state.items.filter(item => item.placement);
    for (const item of placed) for (const cell of rotateShape(ITEMS[item.kind].shape, item.placement!.rotation)) {
      occupied.set(`${cell.row + item.placement!.row},${cell.col + item.placement!.col}`, item);
    }
    const cells = [...visible.values()].sort((a, b) => a.row - b.row || a.col - b.col);
    const rows = Math.max(...cells.map(cell => cell.row)) + 1;
    const cols = Math.max(...cells.map(cell => cell.col)) + 1;
    const html = cells.map(({ row, col }) => {
      const item = occupied.get(`${row},${col}`);
      const open = unlocked.has(`${row},${col}`);
      const className = `${editable ? 'bag-cell' : 'preview-cell'}${item ? ' occupied' : ''}${open ? '' : ' expandable'}`;
      const style = `grid-row:${row + 1};grid-column:${col + 1}`;
      return editable ? `<button class="${className}" style="${style}" data-row="${row}" data-col="${col}" ${item ? `data-item="${item.id}"` : ''} aria-label="${row + 1} 列 ${col + 1} 欄，${item ? `${QUALITY_NAMES[item.quality]} ${ITEMS[item.kind].name}` : open ? '空格' : '可擴充'}">${open ? '' : '+'}</button>` : `<span class="${className}" style="${style}"></span>`;
    }).join('') + placed.map(equipmentArt).join('');
    return { html, cols, rows, used: occupied.size };
  }

  function renderBag() {
    const { state, stats } = engine;
    const layout = board(true, expanding);
    const item = selectedItem();
    const stash = state.items.filter(value => !value.placement);
    return `
      <div class="section-heading"><h3>${expanding ? '選擇 ＋ 擴充' : '行囊'}</h3><div class="bag-tools"><small>${layout.used} / ${state.unlockedCells.length} 格</small>${expanding ? '' : `<button class="icon-button expand-button" data-action="expand" aria-label="擴充行囊，需要 2 成長點" ${state.hero.points < 2 || state.unlockedCells.length === ROWS * COLS ? 'disabled' : ''}>＋</button>`}</div></div>
      <div class="bag-frame"><div class="bag-grid" id="bag-grid" style="--cols:${layout.cols};--rows:${layout.rows}" aria-label="行囊">${layout.html}</div></div>
      ${expanding ? `<div class="expand-footer"><small>${state.hero.points} 點可用 · 每格 2 點</small><button class="btn btn-small" data-action="cancel-expand">完成</button></div>` : ''}
      ${item ? `<div class="selection" style="${qualityStyle(item.quality)}"><div class="selection-head"><div class="selection-title">${ITEMS[item.kind].name}${qualityBadge(item.quality)}</div><button class="close-selection" data-action="deselect" aria-label="取消選取">×</button></div><p>${itemEffect(item)}</p><div class="selection-actions"><button class="btn btn-small rotate-button" data-action="rotate" aria-label="旋轉裝備">↻</button>${synthesisPartner('item', item.id) ? '<button class="btn btn-small" data-action="synthesize-item">合成</button>' : ''}${item.placement ? '<button class="btn btn-small" data-action="stash">卸下</button>' : '<button class="btn btn-small btn-danger" data-action="discard">丟棄</button>'}</div></div>` : ''}
      <details id="stash-details" class="disclosure" open><summary>待整理 <small>${stash.length} / ${CAPACITY}</small></summary>${stash.length ? `<div class="stash">${stash.map(value => `<button class="stash-item${value.id === selectedId ? ' active' : ''}" data-item="${value.id}" style="${qualityStyle(value.quality)}" aria-label="選取 ${QUALITY_NAMES[value.quality]} ${ITEMS[value.kind].name}"><img class="item-art" src="${itemArt(value.kind)}" alt="" draggable="false" style="transform:rotate(${value.id === selectedId ? rotation * 90 : 0}deg)">${qualityBadge(value.quality, true)}</button>`).join('')}</div>` : '<p class="empty-state">暫無戰利品</p>'}</details>
      <details id="stats-details" class="disclosure"><summary>角色能力</summary><div class="stat-strip"><div>傷害 / 回合<b>${stats.damagePerRound.toFixed(1)}</b></div><div>防禦<b>${stats.defense.toFixed(1)}</b></div><div>回復 / 3 回合<b>${stats.healPerThreeRounds.toFixed(1)}</b></div></div></details>
      <details id="bag-help" class="disclosure"><summary>整理說明</summary><p>拖曳移動，↻ 原地旋轉。也可點選物品後點空格放置。同品項、同品質疊放可合成，目標保留，拖入者消耗。</p></details>`;
  }

  function renderPets() {
    const { state } = engine;
    return `<div class="section-heading"><h3>旅伴</h3><small>${state.pets.length} / ${CAPACITY}</small></div>
      ${state.pets.length ? `<div class="pet-list">${state.pets.map(pet => {
        const definition = PETS[pet.kind];
        const active = pet.id === state.activePetId;
        return `<article class="pet-card${active ? ' equipped' : ''}" style="${qualityStyle(pet.quality)}"><div class="pet-main"><div class="pet-portrait" aria-hidden="true"><img src="${asset(pet.kind)}" alt=""></div><div class="pet-details"><h3>${definition.name}<small>${QUALITY_NAMES[pet.quality]} · Lv.${pet.level}</small></h3><p>${definition.description} · 經驗 ${pet.xp}</p></div>${active ? '<span class="pet-equipped">出戰中</span>' : ''}</div><div class="pet-actions"><button class="btn btn-small" data-action="equip-pet" data-id="${pet.id}">${active ? '回到營地' : '一起出發'}</button>${active ? '' : `<button class="btn btn-small" data-action="synthesize-pet" data-id="${pet.id}" ${synthesisPartner('pet', pet.id) ? '' : 'disabled'}>合成</button><button class="btn btn-small btn-danger" data-action="release-pet" data-id="${pet.id}">放生</button>`}</div></article>`;
      }).join('')}</div>` : '<div class="empty-state"><span class="empty-symbol">♞</span><p>通過第一層，獲得第一位旅伴。</p></div>'}
      <details id="pets-help" class="disclosure"><summary>旅伴說明</summary><p>一次出戰一位，不占行囊，隨戰鬥獲得經驗。合成只使用未出戰旅伴，保留經驗較高者；另一隻的經驗不會轉移。</p></details>`;
  }

  function renderGrowth() {
    const { hero, unlockedCells } = engine.state;
    return `<div class="point-card"><strong class="point-number">${hero.points}</strong><div><h3>成長點</h3><p>Lv.${hero.level}</p></div></div>
      <div class="growth-card"><span class="growth-icon">⚔</span><div class="growth-text"><h3>磨礪攻擊</h3><p>所有武器傷害 +2<br>已投入 ${hero.attackPoints} 點</p></div><button class="btn btn-small" data-action="grow-attack" ${hero.points < 1 ? 'disabled' : ''}>投入 1 點</button></div>
      <div class="growth-card"><span class="growth-icon">♡</span><div class="growth-text"><h3>強健體魄</h3><p>生命上限 +15<br>已投入 ${hero.healthPoints} 點</p></div><button class="btn btn-small" data-action="grow-health" ${hero.points < 1 ? 'disabled' : ''}>投入 1 點</button></div>
      <div class="growth-card"><span class="growth-icon">▦</span><div class="growth-text"><h3>擴充行囊</h3><p>解鎖一個相鄰格子<br>目前 ${unlockedCells.length} / 48 格</p></div><button class="btn btn-small" data-action="expand" ${hero.points < 2 || unlockedCells.length === 48 ? 'disabled' : ''}>使用 2 點</button></div>
      <details id="growth-help" class="disclosure"><summary>成長說明</summary><p>每次升級獲得 1 點。屬性與行囊共用成長點，可保留稍後分配。提升生命上限不會立即補血。</p></details>`;
  }

  function qualityOptions(value: Quality) {
    return QUALITY_NAMES.map((name, index) => index > 0 ? `<option value="${index}" ${value === index ? 'selected' : ''}>${name}</option>` : '').join('');
  }

  function renderSettings() {
    const settings = engine.state.settings;
    return `${onTitle ? '' : `<div class="menu-actions"><label class="floor-choice">樓層<select class="select" id="floor-select" aria-label="選擇樓層">${floorNames.slice(0, engine.state.unlockedFloor).map((name, index) => `<option value="${index + 1}" ${engine.state.floor === index + 1 ? 'selected' : ''}>${index + 1} · ${name}</option>`).join('')}</select></label><button class="btn" data-action="play">${engine.state.pauses.includes('manual') ? '繼續探索' : '暫停探索'}</button><button class="btn" data-action="return-title">返回開始畫面</button></div>`}
      <details id="auto-settings" class="disclosure"><summary>自動合成</summary>
      <div class="setting-group"><div class="setting-row"><label for="auto-items">裝備自動合成<small>僅消耗待整理區的裝備</small></label><input class="switch" type="checkbox" id="auto-items" data-setting="autoItems" ${settings.autoItems.enabled ? 'checked' : ''}></div><div class="setting-row"><label for="items-cap">最高產出品質</label><select class="select" id="items-cap" data-setting="itemsCap">${qualityOptions(settings.autoItems.maxQuality)}</select></div></div>
      <div class="setting-group"><div class="setting-row"><label for="auto-pets">旅伴自動合成<small>僅消耗未出戰的旅伴</small></label><input class="switch" type="checkbox" id="auto-pets" data-setting="autoPets" ${settings.autoPets.enabled ? 'checked' : ''}></div><div class="setting-row"><label for="pets-cap">最高產出品質</label><select class="select" id="pets-cap" data-setting="petsCap">${qualityOptions(settings.autoPets.maxQuality)}</select></div></div>
      <p class="section-note">失敗仍消耗一份材料。白→藍 90% · 藍→紫 80% · 紫→橘 70% · 橘→紅 60% · 紅→金 50%。</p></details>
      <div class="section-heading"><h3>聲音</h3></div>
      <div class="setting-group"><div class="setting-row"><label for="music-mute">背景音樂靜音</label><input class="switch" type="checkbox" id="music-mute" data-setting="musicMuted" ${settings.musicMuted ? 'checked' : ''}></div><div class="setting-row"><label for="music-volume">音樂音量</label><input class="volume" type="range" id="music-volume" data-setting="musicVolume" min="0" max="1" step="0.05" value="${settings.musicVolume}"></div><div class="setting-row"><label for="sound-mute">遊戲音效靜音</label><input class="switch" type="checkbox" id="sound-mute" data-setting="soundMuted" ${settings.soundMuted ? 'checked' : ''}></div><div class="setting-row"><label for="sound-volume">音效音量</label><input class="volume" type="range" id="sound-volume" data-setting="soundVolume" min="0" max="1" step="0.05" value="${settings.soundVolume}"></div></div>
      <details id="journal-details" class="disclosure"><summary>冒險手記</summary><div class="section-note">${engine.state.log.slice(0, 5).map(line => `<div>· ${escapeHtml(line)}</div>`).join('')}</div></details><button class="text-button" data-action="help">遊玩說明</button>`;
  }

  function render() {
    const { state, stats } = engine;
    const capacity = state.pauses.includes('capacity');
    $('start-button').textContent = ready ? hasSave ? '繼續旅程' : '開始旅程' : '準備中…';
    $<HTMLButtonElement>('start-button').disabled = !ready || transitioning;
    $('floor-number').textContent = `第 ${state.floor} 層`;
    $('floor-name').textContent = floorNames[state.floor - 1];
    $('wave-number').textContent = `${state.wave} / 5 波`;
    $('hero-level').textContent = `Lv.${state.hero.level}`;
    $('hp-text').textContent = `${Math.ceil(state.hero.hp)} / ${Math.round(stats.maxHp)}`;
    $('hp-fill').style.width = `${Math.max(0, Math.min(100, state.hero.hp / stats.maxHp * 100))}%`;
    $('hp-meter').setAttribute('aria-valuenow', String(Math.ceil(state.hero.hp)));
    $('hp-meter').setAttribute('aria-valuemin', '0');
    $('hp-meter').setAttribute('aria-valuemax', String(Math.round(stats.maxHp)));
    const xpStart = xpForLevel(state.hero.level);
    const xpGoal = xpForLevel(state.hero.level + 1);
    $('xp-fill').style.width = `${(state.hero.xp - xpStart) / (xpGoal - xpStart) * 100}%`;
    $('xp-meter').setAttribute('aria-valuenow', String(state.hero.xp - xpStart));
    $('xp-meter').setAttribute('aria-valuemax', String(xpGoal - xpStart));
    $('xp-meter').setAttribute('aria-valuemin', '0');
    $('scene-status').textContent = capacity ? '等待整理' : state.pauses.length ? '已暫停' : state.battle.phase === 'dead' ? '稍作休息' : state.battle.phase === 'travel' ? '前進中' : `回合 ${state.battle.round} · ${state.battle.stage === 'enemies' ? '敵方' : '我方'}`;
    $('scene-status').dataset.stage = state.battle.stage;
    const manual = state.pauses.includes('manual');
    $('play-button').textContent = manual ? '▷' : 'Ⅱ';
    $('play-button').setAttribute('aria-label', manual ? '繼續探索' : '暫停探索');
    $('capacity-alert').hidden = !capacity;
    $('capacity-message').textContent = `${state.pending.items.length + state.pending.pets.length} 份戰利品待領`;
    $('point-badge').hidden = state.hero.points === 0;
    $('point-badge').textContent = String(state.hero.points);
    const stashCount = state.items.filter(item => !item.placement).length;
    $('stash-badge').hidden = stashCount === 0;
    $('stash-badge').textContent = String(stashCount);
    const bagSnapshot = JSON.stringify([state.items.map(({ id, kind, quality, placement }) => ({ id, kind, quality, placement })), state.unlockedCells, engine.currentAction?.sourceId]);
    if (bagSnapshot !== previewSnapshot) {
      previewSnapshot = bagSnapshot;
      renderPreview();
    }
    if (!sheet.open) return;
    $('sheet-title').textContent = { bag: '整理行囊', pets: '旅伴', growth: '成長', settings: onTitle ? '設定' : '選單' }[tab];
    sheet.querySelector<HTMLElement>('.tabs')!.hidden = onTitle;
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
    panel.setAttribute('aria-labelledby', `tab-${tab}`);
    const focused = document.activeElement;
    if (drag || rangeActive || (focused instanceof HTMLInputElement && focused.type === 'range')) return;
    if (selectedId && !selectedItem()) selectedId = null;
    const snapshot = JSON.stringify({ tab, onTitle, selectedId, rotation, expanding, bagSnapshot, pets: state.pets, active: state.activePetId, points: state.hero.points, attack: state.hero.attackPoints, health: state.hero.healthPoints, level: state.hero.level, settings: state.settings, floor: state.floor, unlocked: state.unlockedFloor, manual, log: tab === 'settings' ? state.log.slice(0, 5) : undefined });
    if (snapshot === panelSnapshot) return;
    panelSnapshot = snapshot;
    const details = Array.from(panel.querySelectorAll<HTMLDetailsElement>('details')).map(element => [element.id, element.open] as const);
    panel.innerHTML = tab === 'bag' ? renderBag() : tab === 'pets' ? renderPets() : tab === 'growth' ? renderGrowth() : renderSettings();
    details.forEach(([id, open]) => { const element = document.getElementById(id) as HTMLDetailsElement | null; if (element) element.open = open; });
  }

  function renderPreview() {
    const { state } = engine;
    const layout = board(false);
    $('bag-count').textContent = `${layout.used} / ${state.unlockedCells.length}`;
    $('bag-preview').style.setProperty('--cols', String(layout.cols));
    $('bag-preview').style.setProperty('--rows', String(layout.rows));
    $('bag-preview').innerHTML = layout.html;
  }

  function confirmSynthesis(kind: 'item' | 'pet', id: string, materialId?: string) {
    enterOrganize();
    const first = kind === 'item' ? engine.state.items.find(item => item.id === id) : engine.state.pets.find(pet => pet.id === id);
    const second = materialId ? engine.state.items.find(item => item.id === materialId) : synthesisPartner(kind, id);
    if (!first || !second) return;
    const definition = kind === 'item' ? ITEMS[(first as Item).kind] : PETS[(first as Pet).kind];
    const quality = first.quality;
    const source = kind === 'item' ? itemArt((first as Item).kind) : asset((first as Pet).kind);
    const location = (value: Item) => value.placement ? `行囊 ${value.placement.row + 1} 列 ${value.placement.col + 1} 欄` : '待整理區';
    showDialog('合成', `<div class="synthesis-preview"><div class="synthesis-item" style="${qualityStyle(quality)}"><img src="${source}" alt="">${qualityBadge(quality)}<small>${definition.name} × 2</small></div><span>→</span><div class="synthesis-item" style="${qualityStyle(quality + 1)}"><img src="${source}" alt="">${qualityBadge(quality + 1)}<small>${definition.name}</small></div></div><p class="synthesis-chance">成功率 <b>${SYNTHESIS_CHANCES[quality] * 100}%</b></p><p>${kind === 'item' ? `保留主體：${location(first as Item)}<br>消耗材料：${location(second as Item)}` : `保留 ${Math.max((first as Pet).xp, (second as Pet).xp)} 經驗。`}</p><p class="risk-note">成功升一階；失敗主體不變。兩種結果都消耗材料，主體位置保留。</p>`, () => changed(engine.synthesize(kind, first.id, second.id)), '確認合成');
    changed();
  }

  app.addEventListener('click', event => {
    if (suppressPointerClick && event.detail > 0) { suppressPointerClick = false; return; }
    const target = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!target || target.hasAttribute('disabled')) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && focused.type === 'range') focused.blur();
    if (target.dataset.open) { openSheet(target.dataset.open as Tab); return; }
    if (target.dataset.tab) {
      tab = target.dataset.tab as Tab;
      selectedId = null;
      expanding = false;
      render();
      return;
    }
    if (target.dataset.row !== undefined) {
      const row = Number(target.dataset.row);
      const col = Number(target.dataset.col);
      if (expanding) changed(engine.expandCell(row, col));
      else if (selectedId) changed(engine.placeItem(selectedId, row, col, rotation));
      else if (target.dataset.item) selectItem(target.dataset.item);
      else notify('先點選一件待整理物品，再選擇放置位置。');
      return;
    }
    if (target.dataset.item) { selectItem(target.dataset.item); return; }
    const action = target.dataset.action;
    const item = selectedItem();
    if (action === 'start') startJourney();
    else if (action === 'menu') openSheet('settings');
    else if (action === 'close-sheet') closeSheet();
    else if (action === 'return-title') returnToTitle();
    else if (action === 'help') helpDialog.showModal();
    else if (action === 'close-help') helpDialog.close();
    else if (action === 'play') {
      if (engine.state.pauses.includes('manual')) {
        engine.setPause('manual', false);
        engine.retryPending();
        callbacks.onStart();
      } else engine.setPause('manual', true);
      closeSheet();
      changed();
    } else if (action === 'organize') {
      openSheet('bag');
    } else if (action === 'rotate' && item) {
      const next = (rotation + 1) % 4;
      if (item.placement) {
        const outcome = engine.placeItem(item.id, item.placement.row, item.placement.col, next);
        rotation = item.placement.rotation;
        changed(outcome.ok ? undefined : { ok: false, message: '空間不足，未旋轉。先移動裝備再試。' });
      } else { rotation = next; render(); }
    } else if (action === 'deselect') { selectedId = null; render(); }
    else if (action === 'stash' && item) changed(engine.stashItem(item.id));
    else if (action === 'discard' && item) {
      showDialog('放下這件裝備？', `<p>${QUALITY_NAMES[item.quality]}「${ITEMS[item.kind].name}」將永久丟棄。這個操作無法復原。</p>`, () => { changed(engine.discardItem(item.id)); }, '確認丟棄');
    } else if (action === 'synthesize-item' && item) confirmSynthesis('item', item.id);
    else if (action === 'synthesize-pet' && target.dataset.id) confirmSynthesis('pet', target.dataset.id);
    else if (action === 'equip-pet' && target.dataset.id) { enterOrganize(); changed(engine.setPet(engine.state.activePetId === target.dataset.id ? null : target.dataset.id)); }
    else if (action === 'release-pet' && target.dataset.id) {
      enterOrganize();
      const pet = engine.state.pets.find(value => value.id === target.dataset.id)!;
      showDialog('讓旅伴回歸荒野？', `<p>${QUALITY_NAMES[pet.quality]}「${PETS[pet.kind].name}」Lv.${pet.level} 將離開隊伍，其養成經驗也會失去。這個操作無法復原。</p>`, () => changed(engine.releasePet(pet.id)), '確認放生');
      changed();
    } else if (action === 'grow-attack' || action === 'grow-health') { enterOrganize(); changed(engine.spendPoint(action === 'grow-attack' ? 'attack' : 'health')); }
    else if (action === 'expand') { enterOrganize(); expanding = true; selectedId = null; tab = 'bag'; changed(); }
    else if (action === 'cancel-expand') { expanding = false; render(); }
    else if (action === 'cancel-dialog') { confirmAction = null; dialog.close(); }
    else if (action === 'confirm-dialog') { const actionToRun = confirmAction; confirmAction = null; dialog.close(); actionToRun?.(); }
  });

  function updateSetting(target: HTMLInputElement | HTMLSelectElement) {
    const settings = engine.state.settings;
    const key = target.dataset.setting;
    if (key === 'autoItems' || key === 'autoPets') {
      settings[key].enabled = (target as HTMLInputElement).checked;
      engine.retryPending();
    } else if (key === 'itemsCap' || key === 'petsCap') {
      settings[key === 'itemsCap' ? 'autoItems' : 'autoPets'].maxQuality = Number(target.value) as Quality;
      engine.retryPending();
    } else if (key === 'musicMuted' || key === 'soundMuted') settings[key] = (target as HTMLInputElement).checked;
    else if (key === 'musicVolume' || key === 'soundVolume') settings[key] = Number(target.value);
    changed();
  }

  app.addEventListener('change', event => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.id === 'floor-select') { changed(engine.changeFloor(Number(target.value))); return; }
    if (target.dataset.setting) updateSetting(target);
  });
  app.addEventListener('input', event => {
    const target = event.target as HTMLInputElement;
    if (target.type === 'range') updateSetting(target);
  });
  app.addEventListener('focusout', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'range') queueMicrotask(render);
  });

  app.addEventListener('pointerdown', event => {
    suppressPointerClick = false;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type === 'range') { rangeActive = true; return; }
    const tile = target.closest<HTMLElement>('[data-item]');
    if (!tile || event.button !== 0) return;
    const item = engine.state.items.find(value => value.id === tile.dataset.item);
    if (!item) return;
    enterOrganize();
    if (selectedId !== item.id) rotation = item.placement?.rotation ?? 0;
    selectedId = item.id;
    expanding = false;
    const offset = item.placement && tile.dataset.row !== undefined ? { row: Number(tile.dataset.row) - item.placement.row, col: Number(tile.dataset.col) - item.placement.col } : { row: 0, col: 0 };
    drag = { id: item.id, x: event.clientX, y: event.clientY, moving: false, offset, target: null, mergeTarget: null };
    tile.setPointerCapture(event.pointerId);
    callbacks.onChange();
  });

  app.addEventListener('pointermove', event => {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) drag.moving = true;
    if (!drag.moving) return;
    const ghost = $('drag-ghost');
    ghost.hidden = false;
    ghost.innerHTML = `<img src="${itemArt(selectedItem()!.kind)}" alt="" style="transform:rotate(${rotation * 90}deg)">${qualityBadge(selectedItem()!.quality, true)}`;
    ghost.style.setProperty('--quality', QUALITY_COLORS[selectedItem()!.quality]);
    ghost.style.setProperty('--quality-ink', [1, 2, 4].includes(selectedItem()!.quality) ? '#fff' : '#382a16');
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.bag-cell, .stash-item');
    drag.target = tile?.dataset.row !== undefined ? { row: Number(tile.dataset.row) - drag.offset.row, col: Number(tile.dataset.col) - drag.offset.col } : null;
    drag.mergeTarget = null;
    clearPlacementPreview();
    const item = selectedItem()!;
    const targetItem = engine.state.items.find(value => value.id === tile?.dataset.item);
    if (targetItem && targetItem.id !== item.id && targetItem.kind === item.kind && targetItem.quality === item.quality && item.quality < 5) {
      drag.mergeTarget = targetItem.id;
      panel.querySelectorAll(`[data-item="${targetItem.id}"], [data-equipment="${targetItem.id}"]`).forEach(element => element.classList.add('merge-ready'));
      ghost.classList.add('merge-ready');
      return;
    }
    ghost.classList.remove('merge-ready');
    if (!drag.target) return;
    const shape = rotateShape(ITEMS[item.kind].shape, rotation).map(cell => ({ row: cell.row + drag!.target!.row, col: cell.col + drag!.target!.col }));
    const unlocked = new Set(engine.state.unlockedCells.map(cell => `${cell.row},${cell.col}`));
    const valid = shape.every(cell => {
      if (!unlocked.has(`${cell.row},${cell.col}`)) return false;
      const occupied = panel.querySelector<HTMLElement>(`[data-row="${cell.row}"][data-col="${cell.col}"]`);
      return !occupied?.dataset.item || occupied.dataset.item === item.id;
    });
    shape.forEach(cell => panel.querySelector(`[data-row="${cell.row}"][data-col="${cell.col}"]`)?.classList.add(valid ? 'place-valid' : 'place-invalid'));
  });

  function clearPlacementPreview() {
    panel.querySelectorAll('.place-valid, .place-invalid, .merge-ready').forEach(cell => cell.classList.remove('place-valid', 'place-invalid', 'merge-ready'));
    $('drag-ghost').classList.remove('merge-ready');
  }

  function endPointer(cancel: boolean) {
    if (rangeActive) { rangeActive = false; render(); }
    if (!drag) return;
    const previous = drag;
    drag = null;
    suppressPointerClick = true;
    $('drag-ghost').hidden = true;
    clearPlacementPreview();
    if (!cancel && previous.moving && previous.mergeTarget) confirmSynthesis('item', previous.mergeTarget, previous.id);
    else if (!cancel && previous.moving && previous.target) changed(engine.placeItem(previous.id, previous.target.row, previous.target.col, rotation));
    else { if (!cancel && previous.moving) notify('未放入行囊，物品保留在原處。'); changed(); }
  }

  window.addEventListener('pointerup', () => endPointer(false));
  window.addEventListener('pointercancel', () => endPointer(true));
  dialog.addEventListener('cancel', () => { confirmAction = null; });
  sheet.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });
  sheet.addEventListener('keydown', event => {
    const target = event.target as HTMLElement;
    if (!target.dataset.tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs: Tab[] = ['bag', 'pets', 'growth', 'settings'];
    const index = tabs.indexOf(tab);
    tab = event.key === 'Home' ? 'bag' : event.key === 'End' ? 'settings' : tabs[(index + (event.key === 'ArrowRight' ? 1 : 3)) % 4];
    selectedId = null;
    expanding = false;
    render();
    $(`tab-${tab}`).focus();
  });
  render();
  return {
    render,
    notify,
    isBlocking: () => onTitle || transitioning,
    setReady: () => { ready = true; render(); },
    handleEvents: (events: GameEvent[]) => {
      if (onTitle) return;
      const event = events.find(value => value.type === 'death') ?? events.find(value => value.type === 'floor');
      if (!event) return;
      closeSheet();
      showTransition(event.type === 'death' ? 'death' : 'floor');
    },
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
