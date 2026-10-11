import type { ContentRegistry, InventoryState, ItemInstance } from '../../game/contracts';
import { occupied } from '../../game/systems/inventory';
import { escapeHtml as esc, itemIcon, itemName, qualityNames, qualityColors } from './details';

export function inventoryGrid(inv:InventoryState,content:ContentRegistry,selected:string|null,rotation:number,expand=false,activeSource?:string) {
  const cells=[...inv.unlockedCells];
  if(expand)for(const cell of inv.unlockedCells)for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const row=cell.row+dr,col=cell.col+dc;
    if(row>=0&&row<6&&col>=0&&col<8&&!cells.some(c=>c.row===row&&c.col===col))cells.push({row,col});
  }
  const rows=Math.max(...cells.map(c=>c.row))+1,cols=Math.max(...cells.map(c=>c.col))+1;
  const buttons=cells.map(cell=>{
    const opened=inv.unlockedCells.some(c=>c.row===cell.row&&c.col===cell.col);
    return `<button class="r-cell ${opened?'':'r-expand'}" data-cell="${cell.row},${cell.col}" style="grid-row:${cell.row+1};grid-column:${cell.col+1}" aria-label="${opened?'背包':'擴充'}第 ${cell.row+1} 列 ${cell.col+1} 格">${opened?'':'＋'}</button>`;
  }).join('');
  const items=Object.values(inv.itemById).flatMap(item=>{
    const place=inv.locationById[item.id];if(place?.kind!=='equipped')return [];
    const shape=occupied(item,place,content),height=Math.max(...shape.map(c=>c.row))-place.row+1,width=Math.max(...shape.map(c=>c.col))-place.col+1;
    return [`<button class="r-equipped ${selected===item.id?'selected':''} ${activeSource===item.id?'acting':''}" data-item="${esc(item.id)}" style="grid-row:${place.row+1}/span ${height};grid-column:${place.col+1}/span ${width};--quality:${qualityColors[item.quality]}" aria-label="${qualityNames[item.quality]}色 ${esc(itemName(item,content))}"><img draggable="false" src="${itemIcon(item)}" alt="" style="transform:rotate(${place.rotation*90}deg);${place.rotation%2?`width:${height/width*100}%;height:${width/height*100}%;max-width:none;max-height:none`:''}"><span class="r-quality">${qualityNames[item.quality]}${item.locked?' ▣':''}</span></button>`];
  }).join('');
  return `<div class="r-bag-frame"><div class="r-bag" style="--cols:${cols};--rows:${rows}" data-grid>${buttons}${items}</div></div>`;
}
export function itemCard(item:ItemInstance,content:ContentRegistry,selected:string|null,attribute='data-item') {
  return `<button class="r-item-card ${selected===item.id?'selected':''}" ${attribute}="${esc(item.id)}" style="--quality:${qualityColors[item.quality]}"><img draggable="false" src="${itemIcon(item)}" alt=""><span>${qualityNames[item.quality]} · ${esc(itemName(item,content))}${item.locked?' ▣':''}</span></button>`;
}
