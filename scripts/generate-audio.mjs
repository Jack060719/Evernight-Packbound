// Original score and effects, synthesized without external recordings or samples.
import { mkdir, writeFile } from 'node:fs/promises';

const sampleRate = 22050;
const tau = Math.PI * 2;
const destination = new URL('../public/assets/audio/', import.meta.url);
await mkdir(destination, { recursive: true });

async function writeWav(name, data) {
  const bytes = Buffer.alloc(44 + data.length * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36);
  bytes.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) bytes.writeInt16LE(Math.round(Math.tanh(data[i]) * 28000), 44 + i * 2);
  await writeFile(new URL(`${name}.wav`, destination), bytes);
}

function note(data, start, duration, midi, volume, bell = false) {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  for (let i = 0; i < duration * sampleRate; i++) {
    const time = i / sampleRate;
    const envelope = bell ? Math.min(1, time * 60) * Math.exp(-time * 2.2) : Math.sin(Math.PI * time / duration) ** 2;
    const tone = Math.sin(tau * frequency * time) + 0.23 * Math.sin(tau * frequency * 2 * time) + 0.08 * Math.sin(tau * frequency * 3 * time);
    const sample = tone * envelope * volume;
    const position = Math.floor(start * sampleRate) + i;
    data[position % data.length] += sample;
    if (bell) {
      data[(position + Math.round(sampleRate * 0.29)) % data.length] += sample * 0.22;
      data[(position + Math.round(sampleRate * 0.57)) % data.length] += sample * 0.10;
    }
  }
}

// 32 seconds, C / F / A minor / G, gentle bells above warm forest-adventure chords.
const music = new Float32Array(sampleRate * 32);
const chords = [[48, 55, 64], [53, 60, 69], [45, 52, 60], [43, 50, 59]];
chords.forEach((chord, bar) => {
  chord.forEach((pitch) => note(music, bar * 8, 10, pitch, 0.055));
  [0, 1, 2, 1, 0, 2, 1, 2].forEach((index, beat) => note(music, bar * 8 + beat, 2.5, chord[index] + 12, 0.055, true));
});
await writeWav('music', music);

const effects = {
  attack: [57, 45], hurt: [39, 34], death: [45, 41, 38, 26], loot: [74, 81],
  level: [62, 65, 69, 74], pet: [81, 86], 'synthesis-success': [62, 69, 74, 81],
  'synthesis-fail': [50, 49, 38], ui: [74],
};
for (const [name, pitches] of Object.entries(effects)) {
  const effect = new Float32Array(Math.ceil((pitches.length * 0.09 + 0.22) * sampleRate));
  pitches.forEach((pitch, index) => note(effect, index * 0.09, 0.2, pitch, 0.25, true));
  await writeWav(name, effect);
}
console.log('Generated 32-second loop and 9 event sounds.');
