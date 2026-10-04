import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

// Deterministic chroma cleanup of image_gen originals, with no generated drawing.
const actors = ['hero', 'skeleton', 'slime', 'boss', 'wolf', 'fairy'];
const icons = ['sword', 'dagger', 'bow', 'staff', 'armor', 'shield', 'ring', 'amulet'];
const records = [];
await mkdir('public/assets', { recursive: true });

async function extract(name, source, rect, icon = false) {
  let input = sharp(source);
  if (rect) input = input.extract(rect);
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  let removed = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const excess = Math.min(r, b) - g;
      if (excess > 65 && r > 110 && b > 110) {
        data[i + 3] = 0;
        removed++;
      } else if (excess > 30 && Math.abs(r - b) < 85 && b > g * 1.6) {
        // Remove magenta spill at anti-aliased subject edges.
        data[i + 2] = g;
        data[i] = Math.max(g, r - excess);
      }
      if (data[i + 3] > 0) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || removed === 0) throw new Error(`No keyed subject: ${name}`);
  if (left === 0 || top === 0 || right === info.width - 1 || bottom === info.height - 1) {
    throw new Error(`Subject touches source edge: ${name}`);
  }
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  let output = sharp(data, { raw: info }).extract(bounds);
  if (icon) {
    output = output.resize(112, 112, { fit: 'inside' });
    const resized = await output.png().toBuffer();
    const size = await sharp(resized).metadata();
    output = sharp(resized).extend({
      top: Math.floor((128 - size.height) / 2), bottom: Math.ceil((128 - size.height) / 2),
      left: Math.floor((128 - size.width) / 2), right: Math.ceil((128 - size.width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  } else {
    output = output.resize(504, 504, { fit: 'inside', withoutEnlargement: true })
      .extend({ top: 4, bottom: 4, left: 4, right: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  const path = `public/assets/${name}.png`;
  await output.png().toFile(path);
  const meta = await sharp(path).metadata();
  records.push({ name, path, source, sourceCell: rect ?? null, bounds, width: meta.width,
    height: meta.height, hasAlpha: meta.hasAlpha, sourceEdgeTouch: false,
    facing: icon ? null : (['skeleton', 'slime', 'boss'].includes(name) ? 'left' : 'right') });
}

for (const name of actors) await extract(name, `assets-source/${name}.raw.png`);
const sheet = await sharp('assets-source/icons.raw.png').metadata();
for (let i = 0; i < icons.length; i++) {
  const x1 = Math.round((i % 4) * sheet.width / 4);
  const x2 = Math.round(((i % 4) + 1) * sheet.width / 4);
  const y1 = Math.round(Math.floor(i / 4) * sheet.height / 2);
  const y2 = Math.round((Math.floor(i / 4) + 1) * sheet.height / 2);
  await extract(`icon-${icons[i]}`, 'assets-source/icons.raw.png',
    { left: x1, top: y1, width: x2 - x1, height: y2 - y1 }, true);
}
const background = await sharp('assets-source/background.raw.png').resize(960, 640).png().toBuffer();
const reflected = await sharp(background).flop().png().toBuffer();
await sharp(background).extend({ right: 960, background: { r: 0, g: 0, b: 0, alpha: 1 } })
  .composite([{ input: reflected, left: 960, top: 0 }]).png().toFile('public/assets/background-loop.png');
await writeFile('assets-source/graphics-manifest.json', JSON.stringify({
  generator: 'Built-in image_gen',
  processing: 'node scripts/process-art.mjs; sharp chroma key, crop, resize, transparent padding',
  background: { path: 'public/assets/background.png', source: 'assets-source/background.raw.png',
    width: 1536, height: 1024, kind: 'flat scenery-only battle plate', scrollAxis: 'x',
    anchor: [0, 0], renderOrder: 0, scrollFactor: 1,
    repeatPolicy: 'periodic plate; wrap seam is not guaranteed seamless' },
  loopingBackground: { path: 'public/assets/background-loop.png', width: 1920, height: 640,
    source: 'assets-source/background.raw.png', processing: 'Resize to 960x640 and append horizontal reflection',
    scrollAxis: 'x', anchor: [0, 0], renderOrder: 0, scrollFactor: 1,
    repeatPolicy: 'alternate original and reflection; identical pixels at joins and wrap edges' },
  sprites: records,
}, null, 2));
const preview = [];
for (const [name, height, left, top] of [
  ['hero', 170, 80, 270], ['wolf', 95, 190, 350], ['fairy', 95, 300, 300],
  ['skeleton', 170, 440, 270], ['slime', 85, 600, 355], ['boss', 205, 750, 235],
]) {
  preview.push({ input: await sharp(`public/assets/${name}.png`).resize({ height }).toBuffer(), left, top });
}
for (let i = 0; i < icons.length; i++) {
  preview.push({ input: await sharp(`public/assets/icon-${icons[i]}.png`).resize(70, 70).toBuffer(),
    left: 80 + i * 105, top: 510 });
}
await sharp('public/assets/background.png').resize(960, 640).composite(preview)
  .png().toFile('assets-source/graphics-preview.png');
console.log(records.map(r => `${r.name}: ${r.width}x${r.height}, alpha=${r.hasAlpha}`).join('\n'));
