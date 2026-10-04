import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const sourceDir = 'assets-source/cartoon-c';
const records = [];
await mkdir('public/assets', { recursive: true });

// Only deterministic extraction, chroma cleanup and smooth scaling of image_gen art.
async function cutout(source, rectangle, key = 'magenta') {
  let image = sharp(source);
  if (rectangle) image = image.extract(rectangle);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const spill = key === 'cyan' ? Math.min(g, b) - r : Math.min(r, b) - g;
    const backgroundPixel = key === 'cyan'
      ? spill > 80 && g > 140 && b > 140 && Math.abs(g - b) < 35
      : spill > 40;
    if (backgroundPixel) data[i + 3] = 0;
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
  const { buffer, bounds } = await cutout(source, rectangle, output.key);
  let image;
  if (output.actorHeight) {
    image = sharp(buffer).resize({ height: output.actorHeight, kernel: 'lanczos3' })
      .extend({ top: 2, bottom: 2, left: 2, right: 2, background: '#00000000' });
  } else {
    const resized = await sharp(buffer).resize(output.width - 8, output.height - 8,
      { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
    const dimensions = await sharp(resized).metadata();
    const left = Math.floor((output.width - dimensions.width) / 2);
    const top = Math.floor((output.height - dimensions.height) / 2);
    image = sharp({ create: { width: output.width, height: output.height, channels: 4, background: '#00000000' } })
      .composite([{ input: resized, left, top }]);
  }
  const path = 'public/assets/' + name + '.png';
  await image.png().toFile(path);
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
    actorHeight: output.actorHeight ?? null, displayHeight: output.displayHeight ?? null,
    facing: output.actorHeight ? (['skeleton', 'slime', 'boss'].includes(name) ? 'left' : 'right') : null });
}

const actors = [
  ['hero', 384, 108, { left: 0, top: 0, width: 512, height: 490 }],
  ['skeleton', 320, 90, { left: 512, top: 0, width: 512, height: 490 }],
  ['slime', 192, 54, { left: 1024, top: 0, width: 512, height: 490 }],
  // Use the empty gutters to preserve the boss cape and crown beyond the nominal cell.
  ['boss', 448, 124, { left: 0, top: 490, width: 550, height: 534 }],
  ['wolf', 224, 64, { left: 550, top: 490, width: 474, height: 534 }],
  ['fairy', 192, 54, { left: 1024, top: 490, width: 512, height: 534 }],
];
for (const [name, actorHeight, displayHeight, rectangle] of actors) {
  await saveSprite(name, sourceDir + '/actors.raw.png', rectangle, { actorHeight, displayHeight });
}
const icons = [
  ['sword', 128, 256], ['dagger', 128, 128], ['bow', 128, 384], ['staff', 128, 512],
  ['armor', 256, 256], ['shield', 256, 256], ['ring', 128, 128], ['amulet', 256, 128],
];
for (let i = 0; i < icons.length; i++) {
  const [name, width, height] = icons[i];
  const rectangle = { left: i % 4 * 384, top: i < 4 ? 0 : 540, width: 384, height: i < 4 ? 540 : 484 };
  await saveSprite('icon-' + name, sourceDir + '/icons.raw.png', rectangle, { width, height, key: 'cyan' });
}
await saveSprite('ornament-corner', sourceDir + '/ornament.raw.png', null, { width: 256, height: 256 });

const background = await sharp(sourceDir + '/background.raw.png').resize(960, 528).png().toBuffer();
await writeFile('public/assets/background.png', background);
const reflected = await sharp(background).flop().png().toBuffer();
await sharp(background).extend({ right: 960, background: '#000000' })
  .composite([{ input: reflected, left: 960, top: 0 }]).png()
  .toFile('public/assets/background-loop.png');

const manifest = {
  generator: 'Built-in image_gen',
  reference: 'output/art-exploration/round-02/C-cartoon-ornament.png',
  style: '04 bold outlined cartoon actors and scenery + C golden botanical UI ornaments',
  processing: 'node scripts/process-art.mjs; chroma key, alpha crop, Lanczos resizing; no procedural artwork',
  provenance: ['background', 'actors', 'icons', 'ornament'].map(name => ({
    source: sourceDir + '/' + name + '.raw.png', prompt: sourceDir + '/' + name + '.prompt.txt',
  })),
  background: { path: 'public/assets/background.png', width: 960, height: 528,
    logicalGroundY: 222, anchor: [0, 0], renderOrder: 0, scrollFactor: 1, runtimeScale: 0.5,
    role: 'Non-interactive flat battle scenery; existing encounter layout preserved' },
  loopingBackground: { path: 'public/assets/background-loop.png', width: 1920, height: 528,
    processing: 'Original followed by horizontal reflection', axis: 'x', runtimeScale: 0.5 },
  sprites: records,
};
await writeFile('assets-source/graphics-manifest.json', JSON.stringify(manifest, null, 2));
await writeFile(sourceDir + '/graphics-manifest.json', JSON.stringify(manifest, null, 2));

const preview = [];
for (const [name, x, bottom] of [['hero', 50, 590], ['wolf', 285, 590], ['fairy', 490, 535],
  ['skeleton', 630, 590], ['slime', 825, 590], ['boss', 985, 590]]) {
  const height = records.find(record => record.name === name).displayHeight * 2;
  preview.push({ input: await sharp('public/assets/' + name + '.png').resize({ height }).toBuffer(),
    left: x, top: bottom - height });
}
for (const [i, name] of icons.entries()) {
  const sprite = await sharp('public/assets/icon-' + name[0] + '.png').resize(90, 150, { fit: 'inside' }).toBuffer();
  preview.push({ input: sprite, left: 40 + i * 156, top: 720 });
}
await sharp(background).resize(1280, 704).extend({ bottom: 180, background: '#49301f' }).composite(preview).png()
  .toFile('assets-source/graphics-preview.png');
console.log(records.map(r => r.name + ': ' + r.width + 'x' + r.height + ', output-edge pixels=' + r.outputEdgePixels).join('\n'));
