import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const sourceDir = 'assets-source/sunlit';
const records = [];
await mkdir('public/assets', { recursive: true });

// Only deterministic extraction, chroma cleanup and nearest-neighbor scaling of image_gen art.
async function cutout(source, rectangle) {
  let image = sharp(source);
  if (rectangle) image = image.extract(rectangle);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.min(r, b) - g > 55 && r > 105 && b > 105) data[i + 3] = 0;
    if (data[i + 3]) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || left === 0 || top === 0 || right === info.width - 1 || bottom === info.height - 1) {
    throw new Error('Empty or edge-clipped source: ' + source);
  }
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  return { buffer: await sharp(data, { raw: info }).extract(bounds).png().toBuffer(), bounds };
}

async function saveSprite(name, source, rectangle, output) {
  const { buffer, bounds } = await cutout(source, rectangle);
  let image;
  if (output.actorHeight) {
    image = sharp(buffer).resize({ height: output.actorHeight, kernel: 'nearest' })
      .extend({ top: 2, bottom: 2, left: 2, right: 2, background: '#00000000' });
  } else {
    const resized = await sharp(buffer).resize(output.width - 8, output.height - 8,
      { fit: 'inside', kernel: 'nearest' }).png().toBuffer();
    const dimensions = await sharp(resized).metadata();
    const left = Math.floor((output.width - dimensions.width) / 2);
    const top = Math.floor((output.height - dimensions.height) / 2);
    image = sharp({ create: { width: output.width, height: output.height, channels: 4, background: '#00000000' } })
      .composite([{ input: resized, left, top }]);
  }
  const path = 'public/assets/' + name + '.png';
  await image.png({ palette: true, colours: 48, dither: 0 }).toFile(path);
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let edge = 0, opaque = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (!data[(y * info.width + x) * 4 + 3]) continue;
    opaque++;
    if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) edge++;
  }
  if (!opaque || edge) throw new Error(name + ': failed alpha QC ' + JSON.stringify({ opaque, edge }));
  records.push({ name, path, source, sourceCell: rectangle ?? null, sourceBounds: bounds,
    width: info.width, height: info.height, outputEdgePixels: edge, fit: 'inside',
    actorHeight: output.actorHeight ?? null, scale: output.actorHeight ? 2 : null,
    facing: output.actorHeight ? (['skeleton', 'slime', 'boss'].includes(name) ? 'left' : 'right') : null });
}

const actors = [
  ['hero', 48, { left: 0, top: 0, width: 512, height: 512 }],
  ['skeleton', 40, { left: 512, top: 0, width: 512, height: 512 }],
  ['slime', 24, { left: 1024, top: 0, width: 512, height: 512 }],
  // The complete boss extends slightly beyond its nominal atlas column; the magenta gutter permits this safe cut.
  ['boss', 56, { left: 0, top: 512, width: 560, height: 512 }],
  ['wolf', 28, { left: 560, top: 512, width: 464, height: 512 }],
  ['fairy', 24, { left: 1024, top: 512, width: 512, height: 512 }],
];
for (const [name, actorHeight, rectangle] of actors) {
  await saveSprite(name, sourceDir + '/actors.raw.png', rectangle, { actorHeight });
}
const icons = [
  ['sword', 64, 128], ['dagger', 64, 64], ['bow', 64, 192],
  ['armor', 128, 128], ['ring', 64, 64], ['amulet', 128, 64],
];
for (let i = 0; i < icons.length; i++) {
  const [name, width, height] = icons[i];
  const rectangle = { left: i % 3 * 512, top: Math.floor(i / 3) * 512, width: 512, height: 512 };
  await saveSprite('icon-' + name, sourceDir + '/icons.raw.png', rectangle, { width, height });
}
await saveSprite('icon-staff', sourceDir + '/staff-straight.raw.png', null, { width: 64, height: 256 });
await saveSprite('icon-shield', sourceDir + '/shield-rectangle.raw.png', null, { width: 128, height: 128 });

const background = await sharp(sourceDir + '/background.raw.png').resize(240, 160, { kernel: 'nearest' })
  .png({ palette: true, colours: 96, dither: 0 }).toBuffer();
await writeFile('public/assets/background.png', background);
const reflected = await sharp(background).flop().png().toBuffer();
await sharp(background).extend({ right: 240, background: '#000000' })
  .composite([{ input: reflected, left: 240, top: 0 }]).png()
  .toFile('public/assets/background-loop.png');

const manifest = {
  generator: 'Built-in image_gen',
  style: 'Bright forest fantasy, warm sun, grass green and wood, crisp pixel art, roughly 3-head hero',
  processing: 'node scripts/process-art.mjs; chroma key, alpha crop, nearest-neighbor resizing and palette reduction; no procedural artwork',
  provenance: ['background', 'actors', 'icons', 'staff-straight', 'shield-rectangle'].map(name => ({
    source: sourceDir + '/' + name + '.raw.png', prompt: sourceDir + '/' + name + '.prompt.txt',
  })),
  historical: { retiredSources: ['staff.raw.png', 'shield.raw.png'],
    note: 'Earlier L-shaped variants are preserved only as history; rebuild uses the natural straight staff and complete rectangular shield.' },
  background: { path: 'public/assets/background.png', width: 240, height: 160,
    logicalGroundY: 109, anchor: [0, 0], renderOrder: 0, scrollFactor: 1, runtimeScale: 2 },
  loopingBackground: { path: 'public/assets/background-loop.png', width: 480, height: 160,
    processing: 'Original followed by horizontal reflection', axis: 'x', runtimeScale: 2 },
  sprites: records,
};
await writeFile('assets-source/graphics-manifest.json', JSON.stringify(manifest, null, 2));
await writeFile(sourceDir + '/graphics-manifest.json', JSON.stringify(manifest, null, 2));

const preview = [];
for (const [name, x, bottom] of [['hero', 80, 218], ['wolf', 190, 218], ['fairy', 285, 195],
  ['skeleton', 415, 218], ['slime', 535, 218], ['boss', 660, 218]]) {
  const size = await sharp('public/assets/' + name + '.png').metadata();
  preview.push({ input: await sharp('public/assets/' + name + '.png').resize(size.width * 2, size.height * 2, { kernel: 'nearest' }).toBuffer(),
    left: x, top: bottom - size.height * 2 });
}
for (const [i, name] of ['sword', 'dagger', 'bow', 'staff', 'armor', 'shield', 'ring', 'amulet'].entries()) {
  const sprite = await sharp('public/assets/icon-' + name + '.png').resize(66, 110, { fit: 'inside', kernel: 'nearest' }).toBuffer();
  preview.push({ input: sprite, left: 36 + i * 92, top: 275 });
}
await sharp('public/assets/background-loop.png').resize(960, 320, { kernel: 'nearest' })
  .extend({ bottom: 96, background: '#dddfb4' }).composite(preview).png()
  .toFile('assets-source/graphics-preview.png');
console.log(records.map(r => r.name + ': ' + r.width + 'x' + r.height + ', output-edge pixels=' + r.outputEdgePixels).join('\n'));
