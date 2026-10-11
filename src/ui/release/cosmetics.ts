import type { ContentRegistry, PresentationId } from '../../game/contracts';
import { assetUrl } from '../../game/release-visual-manifest';
import { escapeHtml as esc } from './details';

export function campCosmetic(id:PresentationId,content:ContentRegistry){
  if(id==='goldleaf-backpack-border'||id==='title-astral-traveller')return '';
  if(id==='wooden-nameplate')return '<span class="r-nameplate">旅人的營地</span>';
  if(id==='camp-equipment-rack')return `<span class="r-rack" aria-label="收藏武器架">${['sword','bow','staff'].map(kind=>`<img src="${assetUrl(`icon-${kind}.png`)}" alt="">`).join('')}</span>`;
  if(id==='six-gem-lantern')return `<span class="r-lanterns" aria-label="六色寶石燈">${['#689c52','#e3a141','#63aebf','#ab82c3','#7fabc5','#d88a91'].map(color=>`<i style="--light:${color}">◆</i>`).join('')}</span>`;
  if(id==='spirit-companion-flag')return `<span class="r-pet-flag"><img src="${assetUrl('wolf.png')}" alt="靈狼"><img src="${assetUrl('fairy.png')}" alt="花精">伙伴旗</span>`;
  const region=content.regions.find(r=>id===`camp-rug-${r.id}`)!;
  return `<span class="r-rug" style="--rug:${['#658551','#bd7a4b','#75a7ba','#b39946','#749c94','#a1bac0','#9b81b3'][content.regions.indexOf(region)]}">${esc(region.name)}紀念毯</span>`;
}
