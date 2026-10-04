import './style.css';
import { GameEngine } from './game/engine';
import { mountUI } from './ui';
import { GameClock } from './clock';
import { loadGame, saveGame } from './save';
import { GameAudio } from './audio';
import { createBattle } from './battle';

const loaded = loadGame(localStorage);
const engine = new GameEngine(loaded.state);
const clock = new GameClock();
const audio = new GameAudio();
let storageFailed = false;
let audioFailed = false;
let started = false;
let saveAllowed = !loaded.message;

function save() {
  if (!saveAllowed) return;
  const saved = saveGame(localStorage, engine.state);
  if (!saved && !storageFailed) ui.notify('無法儲存進度，請確認瀏覽器的本機儲存空間。');
  storageFailed = !saved;
}

const ui = mountUI(engine, {
  onStart: () => {
    started = true;
    saveAllowed = true;
    void audio.start(engine.state.settings).catch(() => {
      if (!audioFailed) ui.notify('音訊暫時無法播放，遊戲仍可繼續。');
      audioFailed = true;
    });
    clock.reset();
    requestAnimationFrame(() => battle.game.scale.refresh());
    save();
  },
  onChange: () => {
    audio.sync(engine.state.settings);
    audio.play({ type: 'ui' });
    save();
  },
}, { hasSave: Boolean(loaded.state) });
const battle = createBattle(engine, () => ui.setReady(), () => ui.isBlocking());
if (loaded.message) ui.notify(loaded.message);
else if (loaded.migration) ui.notify(loaded.migration);

let lastRender = 0;
let lastSave = 0;
function frame(now: number) {
  clock.advance(now, engine.state.pauses.length > 0 || ui.isBlocking(), seconds => engine.step(seconds));
  const events = engine.drainEvents();
  if (events.length) {
    ui.handleEvents(events);
    battle.scene.showEvents(events);
    for (const event of events) audio.play(event);
    if (events.some(event => !['attack', 'hurt', 'pet', 'heal'].includes(event.type))) save();
  }
  if (now - lastRender >= 100) {
    ui.render();
    lastRender = now;
  }
  if (started && now - lastSave >= 5000) {
    save();
    lastSave = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function visibilityChanged() {
  engine.setPause('hidden', document.hidden);
  clock.reset();
  if (document.hidden) {
    save();
  } else {
    engine.setPause('manual', true);
    ui.render();
  }
  void audio.setHidden(document.hidden).catch(() => {});
}
document.addEventListener('visibilitychange', visibilityChanged);
window.addEventListener('pagehide', () => { clock.reset(); save(); });
if (document.hidden) visibilityChanged();

// Development-only inspection lets browser checks exercise real controls with reproducible saves.
if (import.meta.env.DEV) {
  Object.assign(window, { __packbound: { engine, clock, ui, audio, save } });
}
