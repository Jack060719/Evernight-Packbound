import type { GameEvent, Settings } from './game/types';

const sounds = ['attack', 'hurt', 'death', 'loot', 'level', 'pet', 'synthesis-success', 'synthesis-fail', 'ui'] as const;

export class GameAudio {
  private context?: AudioContext;
  private musicGain?: GainNode;
  private soundGain?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading?: Promise<void>;
  private voices = 0;
  private activeSounds = new Set<AudioBufferSourceNode>();

  async start(settings: Pick<Settings,'musicVolume'|'soundVolume'|'musicMuted'|'soundMuted'>) {
    if (!this.context) {
      this.context = new AudioContext();
      this.musicGain = this.context.createGain();
      this.soundGain = this.context.createGain();
      this.musicGain.connect(this.context.destination);
      this.soundGain.connect(this.context.destination);
    }
    this.sync(settings);
    await this.context.resume();
    if (!this.loading) {
      this.loading = this.load();
    }
    await this.loading;
  }

  private async load() {
    const context = this.context!;
    await Promise.all(['music', ...sounds].map(async (name) => {
      const response = await fetch(`${import.meta.env.BASE_URL}assets/audio/${name}.wav`);
      if (!response.ok) throw new Error(`Audio: ${name}`);
      this.buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
    }));
    const music = context.createBufferSource();
    music.buffer = this.buffers.get('music')!;
    music.loop = true;
    music.connect(this.musicGain!);
    music.start();
  }

  sync(settings: Pick<Settings,'musicVolume'|'soundVolume'|'musicMuted'|'soundMuted'>) {
    if (this.musicGain) this.musicGain.gain.value = settings.musicMuted ? 0 : settings.musicVolume * 0.55;
    if (this.soundGain) this.soundGain.gain.value = settings.soundMuted ? 0 : settings.soundVolume * 0.7;
  }

  async setHidden(hidden: boolean) {
    if (!this.context) return;
    if (hidden) {
      for (const source of this.activeSounds) source.stop();
      await this.context.suspend();
    }
    else await this.context.resume();
  }

  play(event: GameEvent) {
    if (!this.context || this.context.state !== 'running' || this.voices >= 6) return;
    const buffer = this.buffers.get(event.type === 'floor' ? 'level' : event.type === 'heal' ? 'pet' : event.type);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.soundGain!);
    this.voices++;
    this.activeSounds.add(source);
    source.onended = () => { this.voices--; this.activeSounds.delete(source); source.disconnect(); };
    source.start();
  }
}
