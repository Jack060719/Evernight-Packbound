import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';

const source='assets-source/home-screen/icon-source.png',output='public/icons';
await mkdir(output,{recursive:true});
for(const [name,size] of [['apple-touch-icon',180],['icon-192',192],['icon-512',512]]){
  await sharp(source).resize(size,size).flatten({background:'#00251b'}).png().toFile(`${output}/${name}.png`);
}
// Extra padding keeps the emblem inside Android's maskable safe circle.
await sharp(source).resize(432,432).flatten({background:'#00251b'})
  .extend({top:40,bottom:40,left:40,right:40,extendWith:'copy'})
  .png().toFile(`${output}/icon-maskable-512.png`);
