import type { ContentRegistry, ItemInstance, AffixStatId, GemType, MechanicSource } from '../../game/contracts';
import { gemNames } from '../../game/content/gems';
import { gearParameters, weaponStats } from '../../game/systems/affixes';
import { assetUrl } from '../../game/release-visual-manifest';

export const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
export const qualityNames = ['白','藍','紫','橙','紅','金'];
export const qualityColors = ['#ddd7bc','#4d9ad9','#a077d4','#dc963f','#d95c67','#d6b140'];
export const affixNames: Record<AffixStatId,string> = { weaponBaseAdd:'武器基值',extraHits:'額外連擊',critChance:'暴擊率',critMultiplier:'暴擊倍率',lifesteal:'實傷吸血',maxHpAdd:'最大生命',defenseAdd:'防禦',healingBonus:'治療量',petPowerBonus:'寵物力量' };
export const gemDescriptions: Record<GemType,string> = {
  venom:'武器直接造成生命傷害後疊毒，持續 3 輪；毒穿過護甲與護盾，最多 8 層。',
  charge:'本武器前兩次行動傷害 ×0.75，第三次爆發。充能跨波保留，卸裝不會充滿。',
  ward:'支援裝備光環：合格過量治療轉為護盾，上限依最大生命。全隊只取最高等級。',
  chain:'本武器直接擊殺後彈向另一名低血敵人；每次行動最多一次，全隊每輪三次，不連續觸發。',
  sweep:'首個直接命中後掃擊其他敵人，排除原本已被範圍主擊鎖定的目標。月紋廣域杖不相容。',
  bond:'支援裝備光環：每個武器行動最多累積兩層共鳴，下一次寵物行動每層加 6% 力量。',
};
export function gemEffect(type:GemType,grade:number) {
  return ({ venom:`每層 ${grade+1} × 來源品質傷害；每行動至多 ${grade+2} 層`,charge:`第三次 ×${[1.6,1.85,2.1][grade-1]}`,
    ward:`過療 ${[20,30,40][grade-1]}% 轉盾，生命上限 ${[20,25,30][grade-1]}%`,chain:`彈跳 ${[35,45,55][grade-1]}% 基礎傷害`,
    sweep:`掃 ${grade} 敵，各 ${[18,24,30][grade-1]}% 基礎傷害`,bond:`最多 ${grade+2} 層，合計 +${(grade+2)*6}%` } as Record<GemType,string>)[type];
}
export const itemIcon = (item:Pick<ItemInstance,'baseKind'>) => assetUrl(`icon-${item.baseKind==='charm'?'amulet':item.baseKind}.png`);
export function itemName(item:ItemInstance,content:ContentRegistry) { return content.equipment.find(d=>d.id===item.definitionId)!.name; }
export function affixText(item:ItemInstance) { return item.affixes.map(a=>`${affixNames[a.statId]} +${a.value}${a.unit==='percentage-points'?'%':a.unit==='multiplier'?' 倍':''}`).join(' · '); }
export function itemDescription(item:ItemInstance,attack:number,content:ContentRegistry) {
  const base=gearParameters(item,content),q=content.economy.qualityMultipliers[item.quality],w=weaponStats(item,attack,content);
  if(base.kind==='weapon') return `${base.maxTargets>1?`最多 ${base.maxTargets} 敵`:'單體'} · ${base.primaryCoefficients.length} 段主擊 · 基礎傷害 ${w!.damageD.toFixed(1)}。${base.targetPolicy==='lowest-hp'?'優先最低生命敵人':'優先最前方敵人'}。額外連擊依首主擊的 15／10／5% 計算，各自暴擊與吸血。`;
  if(base.kind==='periodic-heal')return `每 ${base.everyRounds} 輪治療 ${(base.healing*q).toFixed(1)}${base.maxHp?`，最大生命 +${base.maxHp*q}`:''}。`;
  return [base.maxHp?`生命 ${base.maxHp*q>0?'+':''}${(base.maxHp*q).toFixed(1)}`:'',base.defense?`防禦 ${base.defense*q>0?'+':''}${(base.defense*q).toFixed(1)}`:'',base.attack?`攻擊 +${(base.attack*q).toFixed(1)}`:'',base.healingBonus?`治療 +${base.healingBonus}%`:'',base.petPowerBonus?`靈寵 +${base.petPowerBonus}%`:''].filter(Boolean).join(' · ');
}
export function mechanicLabel(mechanic:MechanicSource) {
  const p=mechanic.parameters;
  if(!('kind' in p))return '';
  return ({ armor:'護甲', 'periodic-damage':'蓄勢重擊','periodic-heal':'回復',barrier:'屏障',retaliation:'反傷',cleanse:'淨化','multi-hit':'雙擊','healing-suppression':'減療','hp-threshold-damage':'狂熱','escort-guard':'護衛減傷','hero-poison':'施毒' } as Record<string,string>)[p.kind]??'';
}
export function mechanicDescription(mechanic:MechanicSource) {
  const p=mechanic.parameters;if(!('kind' in p))return '';
  switch(p.kind){
    case 'armor':return `護甲 ${p.flatArmor}：每次直接命中扣除固定傷害，毒不受影響。`;
    case 'periodic-damage':return `每 ${p.everyActions} 次行動，傷害 ×${p.multiplier}。`;
    case 'periodic-heal':return 'maxHpFraction' in p?`每 ${p.everyActions} 次行動回復${p.targetPolicy==='self'?'自己':'生命比例最低友軍'} ${p.maxHpFraction*100}% 最大生命；中毒時為 ${p.poisonedFraction*100}%。`:'';
    case 'barrier':return `${p.trigger==='spawn'?'入場時':`每 ${p.everyActions} 次行動`}獲得最大生命 ${p.maxHpFraction*100}% 護盾${p.replacesAttack?'，當次不攻擊':''}。`;
    case 'retaliation':return `每個武器行動首次直接命中時反傷，基值為敵攻擊 ${p.attackFraction*100}%；本次擊殺仍反傷。`;
    case 'cleanse':return `每 ${p.everyActions} 次行動清除最早 ${p.removedStacks} 層毒。`;
    case 'multi-hit':return `同次行動連擊 ${p.coefficients.length} 次，每擊 ${p.coefficients[0]*100}% 攻擊力。`;
    case 'healing-suppression':return `每 ${p.everyActions} 次行動使治療量 ×${p.multiplier}，直到下一次旅人支援階段結束。`;
    case 'hp-threshold-damage':return `生命降至 ${p.hpFraction*100}% 後傷害永久 ×${p.multiplier}。`;
    case 'escort-guard':return `每個存活護衛減傷 ${p.reductionPerAlly*100}%，上限 ${p.cap*100}%。`;
    case 'hero-poison':return `攻擊附毒，每輪 ${p.damagePerTick} 傷害、持續 ${p.durationTicks} 輪，最多 ${p.maxStacks} 層；穿過護盾。`;
    default:return '';
  }
}
export { gemNames };
