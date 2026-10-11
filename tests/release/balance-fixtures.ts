import { releaseContent as content } from '../../src/game/registries';
import { initialEnvelope, Mutation } from '../../src/game/systems/resource-transactions';
import { makeItem } from '../../src/game/systems/affixes';
import { growPet } from '../../src/game/systems/pet-growth';
import { discoverOwned } from '../../src/game/systems/collection';
import { validatePlacement } from '../../src/game/systems/inventory';
import type { AffixStatId, GemType, ItemDefinitionId, GridPlacement } from '../../src/game/contracts';
import type { Quality } from '../../src/game/types';

export type Profile='early'|'mid'|'late'|'late-gem'|'return'|'wolf'|'ward'|'charge';
type Rolls=Partial<Record<AffixStatId,number>>;
type Gems=readonly (readonly [GemType,1|2|3])[];
export function balanceFixture(profile:Profile,seed:number,stashCount=profile==='early'?5:10,petCount=10){
  const tx=new Mutation(initialEnvelope(`balance-${profile}-${seed}`,seed)),s=tx.draft.state,inv=s.inventory;
  inv.itemById={};inv.locationById={};inv.warehouseOrder=[];
  function gear(def:ItemDefinitionId,q:Quality,rolls:Rolls,gems:Gems,place:GridPlacement|null){
    const item=structuredClone(makeItem(tx.id('item'),def,q,content,tx.random.crafting)) as typeof inv.itemById[string];
    item.affixes=Object.entries(rolls).map(([key,value])=>({statId:key as AffixStatId,value:value!,unit:content.affixes.find(a=>a.statId===key)!.unit,rolledQuality:q,rollVersion:content.version,origin:'drop'}));
    for(let i=0;i<gems.length;i++)item.sockets[i]={id:tx.id('gem'),type:gems[i][0],grade:gems[i][1]};
    inv.itemById[item.id]=item;inv.locationById[item.id]=place?{kind:'equipped',...place}:{kind:'warehouse',order:inv.warehouseOrder.length};if(!place)inv.warehouseOrder.push(item.id);return item;
  }
  const p=(row:number,col:number)=>({row,col,rotation:0 as const});
  const support=(def:ItemDefinitionId,q:Quality,rolls:Rolls,gems:Gems,row:number,col:number)=>gear(def,q,rolls,gems,p(row,col));
  let petKind:'wolf'|'fairy'='fairy',petQ:Quality=0,petXp=90;
  if(profile==='early'||profile==='return'){
    s.hero={level:9,cumulativeXp:1080,points:0,attackPoints:8,healthPoints:0,hp:100};
    if(profile==='return'){support('bow',4,{extraHits:2,critChance:20,lifesteal:10},[],0,0);petXp=0;}
    else{support('bow',1,{weaponBaseAdd:4},[],0,0);const sword=support('sword',0,{critChance:5},[],0,1);sword.affixes[0].origin='starter';support('shield',0,{maxHpAdd:6},[],0,3);support('charm',0,{maxHpAdd:6},[],2,2);support('ring',0,{maxHpAdd:6},[],2,4);}
  }else if(['mid','late','late-gem'].includes(profile)){
    const mid=profile==='mid',q:Quality=mid?2:4;
    s.hero={level:mid?21:41,cumulativeXp:mid?6300:24600,points:mid?5:10,attackPoints:mid?10:20,healthPoints:mid?5:10,hp:100};
    for(const [def,col] of [['moonwell-wide-staff',0],['ember-prism-bow',1],['sword',2]] as const)support(def,q,mid?{weaponBaseAdd:6,lifesteal:8}:{weaponBaseAdd:14,critChance:26,lifesteal:12},mid?[['venom',2]]:profile==='late-gem'?[['venom',3],['chain',3]]:[],0,col);
    support('shield',q,mid?{maxHpAdd:20,defenseAdd:2.5}:{maxHpAdd:46,defenseAdd:5,healingBonus:28},[['ward',mid?1:3]],0,3);
    support('charm',q,mid?{maxHpAdd:20,healingBonus:16}:{maxHpAdd:46,healingBonus:28,petPowerBonus:22},[['bond',mid?1:3]],2,2);
    support('ring',q,mid?{maxHpAdd:20,defenseAdd:2.5}:{maxHpAdd:46,defenseAdd:5,petPowerBonus:22},[],2,4);petXp=mid?1350:3150;petQ=mid?0:2;
  }else{
    // T12 late builds use all 48 unlocked cells: 56 expansion points are accounted for.
    s.hero={level:91,cumulativeXp:122850,points:4,attackPoints:20,healthPoints:10,hp:100};
    inv.unlockedCells=Array.from({length:48},(_,i)=>({row:Math.floor(i/8),col:i%8}));petQ=4;petXp=1350;petKind=profile==='ward'?'fairy':'wolf';
    const tank={maxHpAdd:46,defenseAdd:5,healingBonus:28},heal={healingBonus:28,maxHpAdd:46,petPowerBonus:22},hit={weaponBaseAdd:14,critChance:26,lifesteal:12};
    if(profile==='wolf'){
      support('verdant-scout-dagger',4,{extraHits:3,weaponBaseAdd:14,lifesteal:12},[['venom',3],['chain',2]],0,0);
      support('gale-feather-dagger',4,hit,[['venom',2],['sweep',2]],0,1);support('mire-reed-bow',4,{weaponBaseAdd:14,critChance:26,critMultiplier:.6},[['charge',3],['sweep',2]],0,2);
      support('shield',4,tank,[['ward',3]],0,3);support('verdant-dew-charm',4,heal,[['bond',3]],2,3);support('astral-bond-ring',4,{petPowerBonus:22,defenseAdd:5,maxHpAdd:46},[],0,5);
      support('mire-moss-armor',4,tank,[],2,0);support('staff',4,{weaponBaseAdd:14,critChance:26,critMultiplier:.6},[['chain',3],['sweep',3]],0,6);support('frost-balm-charm',4,heal,[],4,0);
    }else if(profile==='ward'){
      support('sword',4,{weaponBaseAdd:14,lifesteal:12,extraHits:2},[['charge',2],['venom',2]],0,0);support('shield',4,tank,[['ward',3]],0,1);
      support('frost-plate-armor',4,{maxHpAdd:46,defenseAdd:5,petPowerBonus:22},[],0,3);support('frost-balm-charm',4,heal,[['bond',3]],2,0);support('verdant-dew-charm',4,tank,[],2,2);
      support('moonwell-lantern-ring',4,{petPowerBonus:22,healingBonus:28,maxHpAdd:46},[],0,5);support('mire-reed-bow',4,hit,[['charge',3],['chain',2]],0,6);
      support('charm',4,tank,[],3,0);support('astral-bond-ring',4,{petPowerBonus:22,healingBonus:28,defenseAdd:5},[],2,4);
    }else{
      support('ember-prism-bow',4,{weaponBaseAdd:14,critChance:26,critMultiplier:.6},[['charge',3],['sweep',2]],0,0);support('moonwell-wide-staff',4,{weaponBaseAdd:14,critChance:26,extraHits:2},[['chain',3],['venom',2]],0,1);
      support('sword',4,hit,[['venom',3],['sweep',2]],0,2);support('shield',4,tank,[['ward',2]],0,3);support('charm',4,heal,[['bond',3]],2,2);support('ring',4,{petPowerBonus:22,defenseAdd:5,maxHpAdd:46},[],2,4);
      support('armor',4,tank,[],4,0);support('bow',4,hit,[['chain',2],['sweep',3]],0,6);support('frost-balm-charm',4,tank,[],3,2);
    }
  }
  for(let i=0;i<stashCount;i++)gear('sword',0,{weaponBaseAdd:2},[],null);
  for(let i=0;i<petCount;i++){const id=tx.id('pet'),pet=growPet({id,version:1,kind:i?i%2?'wolf':'fairy':petKind,quality:i?0:petQ,cumulativeXp:i?0:petXp,level:1,milestoneIds:[]},0,content);inv.petById[id]=structuredClone(pet) as typeof inv.petById[string];inv.petLocationById[id]={kind:'owned'};if(!i)inv.activePetId=id;}
  for(const stack of Object.values(inv.gemStacks))stack.count=100;
  s.world.completedStageIds=content.stages.map(d=>d.id);s.world.unlockedStageIds=content.stages.map(d=>d.id);s.world.firstWolfGranted=true;s.world.oneTimeRewards['first-cleared-verdant-02-gem']={state:'chosen',kind:'venom',dropId:'historic-choice'};
  s.settings.autoRepeatEnabled=true;s.settings.introSeen=true;discoverOwned(tx.draft);tx.finish();return tx.draft;
}

/** T12 early and mid progression; the late definitions above remain the material baseline. */
export function progressionFixture(profile:'wolf'|'ward'|'charge',tier:'early'|'mid',seed:number){
  const e=balanceFixture(profile,seed,tier==='early'?5:10),s=e.state,inv=s.inventory,mid=tier==='mid',q:Quality=mid?2:0;
  s.hero={level:mid?21:9,cumulativeXp:mid?6300:1080,points:mid?5:0,attackPoints:mid?10:8,healthPoints:mid?5:0,hp:100};
  inv.unlockedCells=Array.from({length:20},(_,n)=>({row:Math.floor(n/5),col:n%5}));
  type Row=[ItemDefinitionId,Rolls,Gems];
  const rows:Row[]=profile==='wolf'?[
    [mid?'verdant-scout-dagger':'dagger',mid?{extraHits:2,critChance:20}:{extraHits:1},[['venom',mid?2:1]]],
    [mid?'gale-feather-dagger':'dagger',mid?{weaponBaseAdd:6,lifesteal:8}:{weaponBaseAdd:2},mid?[['venom',1]]:[]],
    [mid?'mire-reed-bow':'sword',mid?{weaponBaseAdd:6,critChance:20}:{critChance:5},mid?[['charge',1]]:[]],
    ['shield',mid?{maxHpAdd:20,defenseAdd:2.5}:{maxHpAdd:6},mid?[['ward',1]]:[]],
    [mid?'verdant-dew-charm':'charm',mid?{healingBonus:16,maxHpAdd:20}:{healingBonus:8},mid?[['bond',2]]:[]],
    [mid?'astral-bond-ring':'ring',mid?{petPowerBonus:12,healingBonus:16}:{petPowerBonus:5},[]],
  ]:profile==='ward'?[
    ['sword',mid?{weaponBaseAdd:6,lifesteal:8}:{lifesteal:4},mid?[['charge',1]]:[]],
    ['shield',mid?{maxHpAdd:20,defenseAdd:2.5}:{maxHpAdd:6},[['ward',mid?2:1]]],
    [mid?'frost-plate-armor':'armor',mid?{maxHpAdd:20,defenseAdd:2.5}:{defenseAdd:1},[]],
    [mid?'frost-balm-charm':'charm',mid?{healingBonus:16,maxHpAdd:20}:{healingBonus:8},mid?[['bond',1]]:[]],
    [mid?'verdant-dew-charm':'charm',mid?{healingBonus:16,defenseAdd:2.5}:{maxHpAdd:6},[]],
    [mid?'moonwell-lantern-ring':'ring',mid?{petPowerBonus:12,healingBonus:16}:{petPowerBonus:5},[]],
  ]:[
    [mid?'ember-prism-bow':'bow',mid?{weaponBaseAdd:6,critChance:20}:{critChance:15},[['charge',mid?2:1]]],
    [mid?'moonwell-wide-staff':'staff',mid?{weaponBaseAdd:6,critChance:20}:{weaponBaseAdd:2},[['chain',mid?2:1]]],
    ['sword',mid?{weaponBaseAdd:6,extraHits:2}:{extraHits:1},mid?[['venom',1]]:[]],
    ['shield',mid?{maxHpAdd:20,defenseAdd:2.5}:{maxHpAdd:6},mid?[['ward',1]]:[]],
    ['charm',mid?{healingBonus:16,maxHpAdd:20}:{healingBonus:8},mid?[['bond',1]]:[]],
    ['ring',mid?{petPowerBonus:12,healingBonus:16}:{petPowerBonus:5},[]],
  ];
  const equipped=Object.values(inv.itemById).filter(i=>inv.locationById[i.id].kind==='equipped');
  for(const item of equipped){delete inv.itemById[item.id];delete inv.locationById[item.id];}
  for(const [n,[definitionId,rolls,gems]] of rows.entries()){
    const item=equipped[n],definition=content.equipment.find(d=>d.id===definitionId)!;item.definitionId=definitionId;item.baseKind=definition.baseKind;item.quality=q;
    item.affixes=Object.entries(rolls).map(([statId,value])=>({statId:statId as AffixStatId,value:value!,unit:content.affixes.find(a=>a.statId===statId)!.unit,rolledQuality:q,rollVersion:content.version,origin:!mid&&profile==='wolf'&&n===2?'starter':'drop'}));
    item.sockets=[gems[0]?{id:`progression-gem-${n}`,type:gems[0][0],grade:gems[0][1]}:null];inv.itemById[item.id]=item;
    let placed=false;for(let row=0;row<4&&!placed;row++)for(let col=0;col<5&&!placed;col++){try{validatePlacement(item,{row,col,rotation:0},inv,content);inv.locationById[item.id]={kind:'equipped',row,col,rotation:0};placed=true;}catch{}}
    if(!placed)throw Error('T12 progression geometry does not fit');
  }
  const id=inv.activePetId!;inv.petById[id]=structuredClone(growPet({...inv.petById[id],quality:q,cumulativeXp:mid?450:90},0,content)) as typeof inv.petById[string];
  discoverOwned(e);return e;
}
