import Phaser from 'phaser';
import type { GameEngine } from './game/engine';
import type { GameEvent } from './game/types';

export class BattleScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.TileSprite;
  private hero!: Phaser.GameObjects.Image;
  private companion?: Phaser.GameObjects.Image;
  private companionId: string | null = null;
  private enemies = new Map<string, { image: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics; label?: Phaser.GameObjects.Text }>();
  private lastTime = 0;
  private ready = false;

  constructor(private engine: GameEngine, private onReady: () => void, private isBlocked: () => boolean) { super('battle'); }

  preload() {
    for (const name of ['background', 'hero', 'skeleton', 'slime', 'boss', 'wolf', 'fairy']) {
      this.load.image(name, `${import.meta.env.BASE_URL}assets/${name === 'background' ? 'background-loop' : name}.png`);
    }
  }

  create() {
    this.background = this.add.tileSprite(240, 132, 480, 264, 'background');
    this.background.setTileScale(2);
    this.add.ellipse(116, 218, 54, 8, 0x405e3b, 0.2);
    this.hero = this.actor('hero', 116, 222);
    this.lastTime = this.engine.state.time;
    this.ready = true;
    this.game.canvas.setAttribute('aria-label', '自動回合戰鬥：旅人依序使用裝備，接著由怪物行動');
    this.game.canvas.setAttribute('role', 'img');
    this.onReady();
  }

  private actor(texture: string, x: number, y: number) {
    const actor = this.add.image(x, y, texture).setOrigin(0.5, 1);
    actor.setScale(2);
    return actor;
  }

  update() {
    if (!this.ready) return;
    const state = this.engine.state;
    const paused = state.pauses.length > 0 || this.isBlocked();
    this.tweens.timeScale = paused ? 0 : 1;
    const elapsed = Math.max(0, state.time - this.lastTime);
    this.lastTime = state.time;
    if (state.battle.phase === 'travel' && !paused) this.background.tilePositionX += elapsed * 35;
    this.hero.y = 222 + (state.battle.phase === 'travel' ? Math.round(Math.sin(state.time * 9) * 2) : 0);
    this.hero.setAngle(state.battle.phase === 'dead' ? -75 : 0);
    this.hero.setAlpha(state.battle.phase === 'dead' ? 0.45 : 1);

    const ids = new Set(state.battle.enemies.map(enemy => enemy.id));
    for (const [id, actor] of this.enemies) {
      if (!ids.has(id)) {
        this.tweens.killTweensOf(actor.image);
        actor.image.destroy(); actor.bar.destroy(); actor.label?.destroy();
        this.enemies.delete(id);
      }
    }
    state.battle.enemies.forEach((enemy, index) => {
      const x = 290 + index * 63;
      let actor = this.enemies.get(enemy.id);
      if (!actor) {
        actor = {
          image: this.actor(enemy.kind, x, 222),
          bar: this.add.graphics(),
          label: enemy.kind === 'boss' ? this.add.text(x, 236, enemy.name, { fontFamily: 'sans-serif', fontSize: '10px', color: '#334b36', backgroundColor: '#f2edcf' }).setOrigin(0.5) : undefined,
        };
        this.enemies.set(enemy.id, actor);
      }
      actor.image.y = 222 + (enemy.kind === 'slime' ? Math.round(Math.sin(state.time * 2.5 + index) * 2) : 0);
      actor.bar.clear();
      actor.bar.fillStyle(0x40533b).fillRect(x - 25, 226, 50, 5);
      actor.bar.fillStyle(0xed9671).fillRect(x - 24, 227, 48 * Math.max(0, enemy.hp / enemy.maxHp), 3);
    });

    if (this.companionId !== state.activePetId) {
      if (this.companion) { this.tweens.killTweensOf(this.companion); this.companion.destroy(); }
      const pet = state.pets.find(pet => pet.id === state.activePetId);
      this.companion = pet ? this.actor(pet.kind, 54, pet.kind === 'fairy' ? 179 : 228) : undefined;
      this.companionId = state.activePetId;
    }
  }

  showEvents(events: GameEvent[]) {
    if (!this.ready) return;
    for (const event of events) {
      if (!['attack', 'hurt', 'pet', 'heal'].includes(event.type)) continue;
      const target = event.target ? this.enemies.get(event.target)?.image : undefined;
      // A fixed-step catch-up can spawn and hit an enemy before Phaser creates its image.
      const receiver = event.target === 'hero' ? this.hero : target ?? { x: 290, y: 222, displayHeight: 80 };
      if (event.amount !== undefined) {
        const healing = event.type === 'heal' || (event.type === 'pet' && event.target === 'hero');
        const text = this.add.text(receiver.x, receiver.y - receiver.displayHeight - 7, `${healing ? '+' : '−'}${Math.round(event.amount)}`, {
          fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: healing ? '#b9f58a' : target ? '#fff2bc' : '#ffc6a6',
          stroke: '#344a33', strokeThickness: 3,
        }).setOrigin(0.5);
        this.tweens.add({ targets: text, y: text.y - 24, alpha: 0, duration: 700, onComplete: () => text.destroy() });
      }
      if (event.type === 'attack') {
        this.tweens.add({ targets: this.hero, x: 124, duration: 100, yoyo: true });
        const weapon = this.engine.state.items.find(item => item.id === event.source);
        if (target && (weapon?.kind === 'bow' || weapon?.kind === 'staff')) {
          const magic = weapon.kind === 'staff';
          const shot = this.add.rectangle(140, 174, magic ? 8 : 20, magic ? 8 : 3, magic ? 0x8fdde4 : 0xf6db97);
          if (magic) shot.setAngle(45);
          this.tweens.add({ targets: shot, x: target.x, y: target.y - target.displayHeight / 2, duration: 170, onComplete: () => shot.destroy() });
        }
      }
      if (event.type === 'pet' && this.companion) this.tweens.add({ targets: this.companion, x: 62, duration: 100, yoyo: true });
      if (event.type === 'hurt') {
        const attacker = event.source ? this.enemies.get(event.source)?.image : undefined;
        if (attacker) this.tweens.add({ targets: attacker, x: attacker.x - 12, duration: 100, yoyo: true });
        this.tweens.add({ targets: this.hero, alpha: 0.4, duration: 70, yoyo: true });
      }
      if (target) this.tweens.add({ targets: target, alpha: 0.35, duration: 70, yoyo: true });
    }
  }
}

export function createBattle(engine: GameEngine, onReady: () => void, isBlocked: () => boolean) {
  const scene = new BattleScene(engine, onReady, isBlocked);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'battle-stage',
    width: 480,
    height: 264,
    backgroundColor: '#b4d997',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
    audio: { noAudio: true },
    render: { antialias: false, pixelArt: true, roundPixels: true },
    banner: false,
  });
  return { scene, game };
}
