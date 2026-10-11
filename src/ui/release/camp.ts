import type { Quality } from '../../game/types';
import type { Command, PreviewableCommand, CommandPreview, GemType, StageId, ReadModel, CommittedEvent } from '../../game/contracts';
import type { ReleaseEngine } from '../../game/release-engine';
import { readModel } from '../../game/read-model';
import { collectionEligible } from '../../game/systems/collection';
import { assetUrl } from '../../game/release-visual-manifest';
import { inventoryGrid, itemCard } from './inventory';
import { ReleaseBattle } from './battle';
import { campCosmetic } from './cosmetics';
import { escapeHtml as esc, itemIcon, itemName, itemDescription, affixText, qualityNames, gemNames, gemEffect, gemDescriptions, mechanicDescription } from './details';

type Page='camp'|'battle'|'inventory'|'forge'|'pets'|'growth'|'map'|'collection'|'loadouts'|'tracker'|'settings'|'ground';
interface Actions { dispatch(command:Command,preview?:CommandPreview):Promise<boolean>; exportSave():void; importSave(file:File):Promise<void>; audio():void }
const pageNames:Record<Page,string>={camp:'營地',battle:'冒險',inventory:'背包整理',forge:'鍛造',pets:'靈寵',growth:'成長',map:'世界地圖',collection:'收藏',loadouts:'配裝',tracker:'掉落追蹤',settings:'設定',ground:'待領地物'};
const presentationNames:Record<string,string>={'wooden-nameplate':'旅人木牌','goldleaf-backpack-border':'金葉背包邊框','camp-equipment-rack':'營地武器架','six-gem-lantern':'六色寶石燈','spirit-companion-flag':'靈寵伙伴旗','title-astral-traveller':'星界旅人'};
const button=(action:string,label:string,disabled=false)=>`<button data-action="${action}" ${disabled?'disabled':''}>${label}</button>`;
export class ReleaseUI {
  private page:Page='camp';
  private selected:string|null=null;
  private rotation=0;
  private expand=false;
  private pair:string|null=null;
  private preview:CommandPreview|null=null;
  private pageKey='';
  private footerKey='';
  private intro=0;
  private dialog:HTMLDialogElement;
  private battle:ReleaseBattle;
  private dragging:{id:string;x:number;y:number}|null=null;
  private suppressedClick:{x:number;y:number}|null=null;
  private toastTimer=0;
  private ghost:HTMLImageElement|null=null;
  private lastLevel:number;
  constructor(private root:HTMLElement,private engine:ReleaseEngine,private actions:Actions) {
    this.lastLevel=engine.state.hero.level;
    root.innerHTML=`<main class="r-app"><header class="r-header"></header><nav class="r-topnav"><button data-page="camp">⌂ 營地</button><strong id="r-title">營地</strong><button data-page="settings" aria-label="設定">⚙</button></nav><section class="r-stage" aria-label="戰場"></section><section class="r-round"></section><section class="r-body"></section><footer class="r-footer"></footer><div class="r-toast" role="status" hidden></div><dialog class="r-dialog"></dialog></main>`;
    this.dialog=root.querySelector('dialog')!;this.battle=new ReleaseBattle(root.querySelector('.r-stage')!);
    root.addEventListener('click',e=>{const suppressed=this.suppressedClick;this.suppressedClick=null;if(suppressed&&Math.hypot(e.clientX-suppressed.x,e.clientY-suppressed.y)<12)return;void this.click(e).catch(error=>this.notify(error instanceof Error?error.message:'操作未完成。'));});
    root.addEventListener('change',e=>void this.change(e));
    root.addEventListener('pointerdown',e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-item]');if(el&&this.page==='inventory')this.dragging={id:el.dataset.item!,x:e.clientX,y:e.clientY};});
    root.addEventListener('pointermove',e=>{const drag=this.dragging;if(!drag||Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<12)return;
      if(!this.ghost){this.ghost=document.createElement('img');this.ghost.className='r-drag-ghost';this.ghost.src=itemIcon(engine.state.inventory.itemById[drag.id]);document.body.append(this.ghost);}
      this.ghost.style.left=`${e.clientX}px`;this.ghost.style.top=`${e.clientY}px`;
    });
    root.addEventListener('pointerup',e=>{const drag=this.dragging;this.dragging=null;this.ghost?.remove();this.ghost=null;if(!drag||Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<12)return;
      this.suppressedClick={x:e.clientX,y:e.clientY};this.selected=drag.id;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-cell],[data-item]');
      if(target?.dataset.cell)void this.place(target.dataset.cell);else if(target?.dataset.item&&target.dataset.item!==drag.id)void this.merge(target.dataset.item,drag.id,false);
    });
    this.dialog.addEventListener('close',()=>{this.preview=null;});
    root.addEventListener('pointercancel',()=>{this.dragging=null;this.ghost?.remove();this.ghost=null;});
    root.addEventListener('keydown',e=>{if(e.key==='Escape'){this.selected=null;this.pair=null;this.pageKey='';this.render();}});
    this.render();
    if(!engine.state.settings.introSeen)this.showIntro();
  }
  notify(message:string) { const el=this.root.querySelector<HTMLElement>('.r-toast')!;el.textContent=message;el.hidden=false;clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>el.hidden=true,4500); }
  private modal(title:string,body:string) {this.dialog.innerHTML=`<div class="r-dialog-title"><h2>${esc(title)}</h2><button data-action="close" aria-label="關閉">×</button></div>${body}`;if(!this.dialog.open)this.dialog.showModal();}
  private showIntro(){this.modal(this.intro===0?'永夜行囊':'出發前的小提示',this.intro===0?`<p>把裝備放進背包，旅人就會依排列順序自動戰鬥。相同裝備不會自動合成，留給你決定流派。</p><img class="r-intro-hero" src="${assetUrl('hero.png')}" alt="背起行囊的旅人"><div class="r-actions">${button('intro-skip','略過')}${button('intro-next','下一頁')}</div>`:`<p>點擊掉落物即可領取。回營地、整理背包或離開頁面會暫停；按「繼續」才會再出發。</p><p>倒下不會失去已得到的經驗與戰利品。紅金裝備是多日養成目標。</p>${button('intro-skip','準備好了')}`);}
  private ref(id:string,pet=false){const inv=this.engine.state.inventory;return {id,version:(pet?inv.petById[id]:inv.itemById[id]).version};}
  private async send(command:Command,preview?:CommandPreview){const ok=await this.actions.dispatch(command,preview);this.pageKey='';this.render();return ok;}
  private async pause(){if(!this.engine.state.lifecycle.pauseReasons.includes('camp'))await this.send({type:'lifecycle.pause',reason:'camp',paused:true});}
  private async navigate(page:Page){if(page!=='battle')await this.pause();this.page=page;this.expand=page==='growth';this.pair=null;this.pageKey='';this.render();}
  private async ask(command:PreviewableCommand){await this.pause();const checked=this.engine.preview(command);if(!checked.ok){this.notify(checked.error.message);return;}this.preview=checked.value;
    const p=checked.value,inv=this.engine.state.inventory,name=(id:string)=>inv.itemById[id]?`${qualityNames[inv.itemById[id].quality]} ${itemName(inv.itemById[id],this.engine.content)}`:inv.petById[id]?`${inv.petById[id].kind==='wolf'?'靈狼':'花精'} Lv.${inv.petById[id].level}`:id;
    const isMerge=command.type.startsWith('synthesis');
    this.modal(isMerge?'確認合成':command.type==='customize.reroll'?'重洗全部詞條':'確認操作',`<p>${isMerge?`成功率 <strong>${p.successChance!*100}%</strong>，成功升為${qualityNames[p.nextQuality!]}色。失敗只消耗材料。主體原有詞條及寶石保留。`:command.type==='customize.reroll'?'全部詞條會立即重抽並覆蓋，沒有挑選或保留舊詞條的步驟。':command.type==='world.abandon'?'放棄目前波次並回營地選擇新關卡。已獲經驗與物品保留，地物留待領取。':'此操作完成後無法撤回。'}</p>${p.retainedIds.length?`<p>保留：${p.retainedIds.map(name).map(esc).join('、')}</p>`:''}${p.consumedIds.length?`<p>消耗：${p.consumedIds.map(name).map(esc).join('、')}</p>`:''}<p>粉塵：${p.dustCost?`消耗 ${p.dustCost}`:`獲得 ${p.dustReturned}`} · 倉庫 ${p.resultingWarehouseCount}/60 · 靈寵 ${p.resultingPetCount}/30</p><p>退還寶石：${p.returnedGems.map(g=>`${gemNames[g.type]} ${g.grade}級 ×${g.count}`).join('、')||'無'}</p><div class="r-actions">${button('close','取消')}${button('confirm','確認')}</div>`);
  }
  private async merge(primary:string,material:string,pet:boolean){await this.ask({type:pet?'synthesis.pet':'synthesis.item',pair:{primary:this.ref(primary,pet),material:this.ref(material,pet)}});}
  private async place(cell:string){if(this.expand){const [row,col]=cell.split(',').map(Number);await this.send({type:'inventory.expand',cell:{row,col}});return;}if(!this.selected)return;
    const [row,col]=cell.split(',').map(Number);await this.send({type:'inventory.place',item:this.ref(this.selected),placement:{row,col,rotation:this.rotation}});
  }
  private itemDetails(id:string){const inv=this.engine.state.inventory,item=inv.itemById[id],content=this.engine.content;if(!item)return;this.selected=id;
    const owned=inv.locationById[id].kind!=='ground',m=readModel(this.engine,id);
    this.modal(`${qualityNames[item.quality]} · ${itemName(item,content)}`,`<p>${esc(itemDescription(item,m.stats.attack,content))}</p><p>${esc(affixText(item))}</p><p>${item.sockets.map((g,i)=>`孔 ${i+1}：${g?`${gemNames[g.type]} ${g.grade}級`:'空'}`).join(' · ')}</p><div class="r-actions">${owned?button('select-place','放置／移動')+button('customize','鑲嵌／重洗')+button('lock',item.locked?'解除鎖定':'鎖定'):''}${inv.locationById[id].kind==='equipped'?button('stash','移至倉庫'):owned?button('salvage','分解')+button('discard','丟棄'):''}</div>${owned?button('choose-material','選合成材料',item.quality===5):''}`);
  }
  private forgeDetails(){const inv=this.engine.state.inventory,item=this.selected?inv.itemById[this.selected]:null;if(!item){this.notify('請先選擇裝備。');return;}
    const def=this.engine.content.equipment.find(d=>d.id===item.definitionId)!;
    this.modal(`鍛造 · ${itemName(item,this.engine.content)}`,`<p>${esc(affixText(item))}</p><p>粉塵 ${inv.resources.dust} · 重洗需 ${this.engine.content.economy.rerollDust[item.quality]}</p>${button('track-material','追蹤合成材料')}${button('track-reroll','追蹤重洗粉塵')}${button('reroll','重洗全部詞條')}<p>鑲嵌、取下及替換皆免費。同類寶石在同件裝備只取最高級；護佑與共鳴全隊只取最高級。</p>${item.sockets.map((g,i)=>`<section class="r-card"><strong>孔 ${i+1}：${g?`${gemNames[g.type]} ${g.grade}級`:'空'}</strong>${g?`<p>${gemEffect(g.type,g.grade)}</p><button data-remove-gem="${i}">取下寶石</button>`:''}<select aria-label="孔 ${i+1} 可用寶石" data-socket="${i}"><option value="">選擇寶石</option>${Object.values(inv.gemStacks).filter(g=>g.count>0&&def.gemTypes.includes(g.type)).map(g=>`<option value="${g.type}:${g.grade}">${gemNames[g.type]} ${g.grade}級 ×${g.count}</option>`).join('')}</select></section>`).join('')}`);
  }
  private async click(event:MouseEvent){const el=(event.target as HTMLElement).closest<HTMLElement>('button');if(!el)return;this.actions.audio();
    if(el.dataset.page){this.dialog.close();await this.navigate(el.dataset.page as Page);return;}
    if(el.dataset.cell){await this.place(el.dataset.cell);return;}
    if(el.dataset.item){const id=el.dataset.item;if(this.pair){const primary=this.pair;this.pair=null;await this.merge(primary,id,false);}else{await this.pause();this.itemDetails(id);}return;}
    if(el.dataset.pet){const id=el.dataset.pet;if(this.pair){const primary=this.pair;this.pair=null;await this.merge(primary,id,true);return;}this.selected=id;const pet=this.engine.state.inventory.petById[id];
      const power=(pet.kind==='wolf'?8:16)*this.engine.content.economy.qualityMultipliers[pet.quality]*(1+.15*(pet.level-1));
      const milestones=pet.kind==='wolf'?['本輪武器直接命中至少 3 次，力量 +20%。','目標中毒時，力量額外 +20%。','增加一次 40% 力量攻擊，優先最低生命敵人。']:['本輪裝備已實際治療生命，力量 +20%。','持有護盾時，力量 +15%。','治療由每三輪改為每兩輪。'];
      this.modal(`${pet.kind==='wolf'?'靈狼':'花精'} · ${qualityNames[pet.quality]} Lv.${pet.level}`,`<p>基礎${pet.kind==='wolf'?'攻擊':'治療'} ${power.toFixed(1)} · 升級尚需 ${15*pet.level*(pet.level+1)-pet.cumulativeXp} 經驗。</p><p>只有出戰靈寵獲得經驗；目前累積 ${pet.cumulativeXp}。</p>${milestones.map((text,i)=>`<p>${pet.level>=[3,6,10][i]?'✓':'○'} Lv.${[3,6,10][i]}：${text}</p>`).join('')}<div class="r-actions">${button('activate-pet',this.engine.state.inventory.activePetId===id?'休息':'出戰')}${button('merge-pet','選合成材料',pet.quality===5)}${button('release-pet','放生')}</div><p>合成需兩隻皆未出戰；保留累積經驗較高個體與 ID。</p>`);return;}
    if(el.dataset.drop){const d=this.engine.state.groundDrops.find(d=>d.id===el.dataset.drop)!;await this.send({type:'loot.pickup',drop:{id:d.id,version:d.version},trigger:'tap'});return;}
    if(el.dataset.stage){const id=el.dataset.stage as StageId;if(await this.send({type:'world.selectChallenge',stageId:id,challengeId:null})){await this.navigate('map');}return;}
    if(el.dataset.enemy){const m=readModel(this.engine),e=m.battlefield.enemies.find(e=>e.id===el.dataset.enemy);await this.pause();if(e)this.modal(m.catalog.enemies.find(d=>d.id===e.definitionId)!.name,`<p>生命 ${e.hp}/${e.maxHp} · 攻擊 ${e.attack} · 護甲 ${e.armor} · 護盾 ${e.shield}</p><p>${e.mechanics.map(mechanicDescription).filter(Boolean).join('、')||'普通攻擊'}</p><p>毒 ${e.poison.length} 層</p>`);return;}
    if(el.dataset.removeGem!==undefined&&this.selected){await this.send({type:'customize.removeGem',item:this.ref(this.selected),socketIndex:Number(el.dataset.removeGem)});this.forgeDetails();return;}
    if(el.dataset.reward){await this.send({type:'collection.claim',rewardId:el.dataset.reward as never});return;}
    if(el.dataset.presentation){await this.send({type:'collection.select',presentationId:el.dataset.presentation as never});return;}
    if(el.dataset.trackItem){await this.send({type:'tracking.set',target:{kind:'equipment',definitionId:el.dataset.trackItem as never,quality:Number(this.input('track-quality')||0) as Quality,count:Number(this.input('track-count')||1)},craftingGoal:null});await this.navigate('tracker');return;}
    if(el.dataset.trackGem){const [type,grade]=el.dataset.trackGem.split(':');await this.send({type:'tracking.set',target:{kind:'gem',type:type as GemType,grade:Number(grade) as 1|2|3,count:Number(this.input('track-count')||1)},craftingGoal:null});await this.navigate('tracker');return;}
    if(el.dataset.firstGem){await this.send({type:'world.chooseFirstReward',rewardId:'first-cleared-verdant-02-gem',gemType:el.dataset.firstGem as GemType});this.dialog.close();return;}
    if(el.dataset.slot){const slot=Number(el.dataset.slot),action=el.dataset.slotAction!;if(action==='save'||action==='rename'){await this.send({type:action==='save'?'loadout.save':'loadout.rename',slot,name:this.input(`slot-${slot}`)||`配裝 ${slot}`});}else await this.send({type:action==='apply'?'loadout.apply':'loadout.remove',slot});return;}
    const action=el.dataset.action,run=this.engine.state.activeRun,item=this.selected&&this.engine.state.inventory.itemById[this.selected];
    switch(action){
      case 'close':this.dialog.close();break;
      case 'intro-next':this.intro++;this.showIntro();break;
      case 'intro-skip':this.dialog.close();break;
      case 'confirm':{const p=this.preview;if(p&&await this.send(p.command,p)){this.dialog.close();this.selected=null;}break;}
      case 'start':if(await this.send({type:'world.start',stageId:this.engine.state.world.selectedStageId,challengeId:this.engine.state.world.selectedChallengeId}))await this.navigate('battle');break;
      case 'continue':if(await this.send({type:'lifecycle.requestContinue'}))await this.navigate('battle');break;
      case 'pause':await this.send({type:'lifecycle.pause',reason:'manual',paused:true});break;
      case 'repeat':if(run&&await this.send({type:'world.repeat',runId:run.runId}))await this.navigate('battle');break;
      case 'abandon':if(run)await this.ask({type:'world.abandon',runId:run.runId});break;
      case 'rotate':if(item){this.rotation=(this.rotation+1)%4;this.notify(`放置旋轉 ${this.rotation*90}°，點擊空格放下。`);}break;
      case 'cancel-place':this.selected=null;this.pair=null;break;
      case 'track-material':case 'track-reroll':if(item){await this.send({type:'tracking.set',target:{kind:'equipment',definitionId:item.definitionId,quality:item.quality,count:action==='track-material'?2:1},craftingGoal:{kind:action==='track-material'?'synthesis':'reroll',itemId:item.id}});this.dialog.close();await this.navigate('tracker');}break;
      case 'select-place':this.dialog.close();await this.navigate('inventory');this.rotation=item&&this.engine.state.inventory.locationById[item.id].kind==='equipped'?(this.engine.state.inventory.locationById[item.id] as {rotation:number}).rotation:0;this.notify('點擊背包空格放置，也可拖放。');break;
      case 'stash':if(item)await this.send({type:'inventory.stash',item:this.ref(item.id)});this.dialog.close();break;
      case 'lock':if(item)await this.send({type:'inventory.lock',item:this.ref(item.id),locked:!item.locked});if(item)this.itemDetails(item.id);break;
      case 'sort':await this.send({type:'inventory.sort'});break;
      case 'customize':this.forgeDetails();break;
      case 'reroll':if(item)await this.ask({type:'customize.reroll',item:this.ref(item.id),costVersion:this.engine.content.version});break;
      case 'salvage':case 'discard':if(item)await this.ask({type:action==='salvage'?'salvage.single':'inventory.discard',item:this.ref(item.id)});break;
      case 'choose-material':this.pair=this.selected;this.dialog.close();this.page='forge';this.pageKey='';this.notify('選擇同品項、同品質的未鎖定材料。');break;
      case 'activate-pet':if(this.selected)await this.send({type:'pet.activate',pet:this.engine.state.inventory.activePetId===this.selected?null:this.ref(this.selected,true)});this.dialog.close();break;
      case 'merge-pet':this.pair=this.selected;this.dialog.close();this.notify('選擇同種、同品質且未出戰的材料。');break;
      case 'release-pet':if(this.selected)await this.ask({type:'pet.release',pet:this.ref(this.selected,true)});break;
      case 'attack-point':case 'health-point':await this.send({type:'inventory.spendPoint',stat:action==='attack-point'?'attack':'health'});break;
      case 'clear-track':await this.send({type:'tracking.clear'});break;
      case 'export':this.actions.exportSave();break;
      case 'choose-first':this.modal('首次通關 · 自選一顆一級寶石',Object.entries(gemNames).map(([type,name])=>`<section class="r-card"><strong>${name}</strong><p>${gemDescriptions[type as GemType]}</p><button data-first-gem="${type}">選擇${name}</button></section>`).join(''));break;
    }
    this.render();
  }
  private input(id:string){return this.root.querySelector<HTMLInputElement>(`#${id}`)?.value??'';}
  private async change(event:Event){const el=event.target as HTMLInputElement;
    if(el.dataset.socket!==undefined&&el.value&&this.selected){const [type,grade]=el.value.split(':');const item=this.engine.state.inventory.itemById[this.selected],index=Number(el.dataset.socket);await this.send({type:item.sockets[index]?'customize.replaceGem':'customize.socket',item:this.ref(item.id),socketIndex:index,gem:{type:type as GemType,grade:Number(grade) as 1|2|3}});this.forgeDetails();}
    if(el.dataset.setting){const key=el.dataset.setting;await this.send({type:'settings.update',changes:{[key]:el.type==='checkbox'?el.checked:Number(el.value)}});}
    if(el.id==='auto-repeat')await this.send({type:'world.setAutoRepeat',enabled:el.checked});
    if(el.id==='challenge'){const stageId=this.engine.state.world.selectedStageId,region=this.engine.content.stages.find(s=>s.id===stageId)!.regionId;await this.send({type:'world.selectChallenge',stageId,challengeId:el.checked?this.engine.content.challenges.find(c=>c.regionId===region)!.id:null});}
    if(el.id==='import-file'&&el.files?.[0])await this.actions.importSave(el.files[0]);
  }
  render(events:readonly CommittedEvent[]=[]){const m=readModel(this.engine,this.selected),s=this.engine.state,run=s.activeRun;
    if(s.hero.level>this.lastLevel)this.notify(`提升至 Lv.${s.hero.level}！營地「成長」可分配 ${s.hero.points} 點。`);
    this.lastLevel=s.hero.level;
    if(events.some(e=>e.type==='LootCreated'&&e.payload.dropIds.some(id=>s.groundDrops.find(d=>d.id===id)?.provenance.origin==='first-wolf')))this.notify('第一隻靈狼等你領取，領取後到「靈寵」選擇出戰。');
    this.root.querySelector('.r-header')!.innerHTML=`<span>Lv.${m.hero.level} 旅人</span><span>♥ ${m.hero.hp.toFixed(1)}/${m.stats.maxHp.toFixed(1)}</span><span>✦ ${m.resources.dust}</span>`;
    this.root.querySelector('#r-title')!.textContent=pageNames[this.page];
    this.root.querySelector<HTMLElement>('.r-app')!.dataset.page=this.page;
    this.root.querySelector('.r-body')!.classList.toggle('is-inventory',this.page==='inventory');
    const stage=this.root.querySelector<HTMLElement>('.r-stage')!;stage.hidden=this.page!=='battle';
    if(this.page==='battle'){this.battle.update(m);this.battle.show(events,m.settings.reducedMotion);}
    const round=this.root.querySelector<HTMLElement>('.r-round')!;round.hidden=this.page!=='battle';
    round.textContent=run?`${m.catalog.stages.find(d=>d.id===run.stageId)!.name} · ${run.ruleset==='legacy-v2'?'舊旅程 ':''}${run.waveIndex+1}/${run.ruleset==='legacy-v2'?5:10} 波 · 第 ${m.battlefield.round} 輪${m.permission.blockedReasons.length?' · 暫停':''}`:'準備出發';
    const key=JSON.stringify([this.page,this.selected,this.pair,this.expand,s.inventory,s.hero.level,s.hero.points,s.world,s.collection,s.loadouts,s.tracking,s.settings,s.lifecycle,s.groundDrops.map(d=>[d.id,d.state]),run?.status,m.battlefield.cursor?.sourceId,this.engine.blocked]);
    if(key!==this.pageKey){const body=this.root.querySelector<HTMLElement>('.r-body')!,scroll=body.querySelector('.r-scroll')?.scrollTop??0;
      if(!body.contains(document.activeElement)||!(document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLSelectElement)){body.innerHTML=this.body(m);const sc=body.querySelector('.r-scroll');if(sc)sc.scrollTop=scroll;this.pageKey=key;}}
    const first=s.world.oneTimeRewards['first-cleared-verdant-02-gem'].state==='awaiting-choice';
    const footer=this.root.querySelector('.r-footer')!;const footerHtml=this.engine.blocked?`<strong>儲存已停止，請匯出備份並重新載入。</strong>${button('export','匯出備份')}`:first?button('choose-first','選擇首次通關寶石'):run?.status==='dead'?`${button('repeat','重新挑戰')}<button data-page="inventory">整理裝備</button>`:run?.status==='settlement'?`${button('repeat','再挑戰')}<button data-page="map">選擇下一關</button>${s.lifecycle.resumeRequired?button('continue','繼續結算'):''}`:run?`${button(s.lifecycle.resumeRequired?'continue':'pause',s.lifecycle.resumeRequired?'繼續冒險':'暫停')}<button data-page="inventory">整理</button><button data-page="ground">待領 ${m.ground.length}</button><button data-page="camp">營地</button>`:button('start','出發');
    if(this.footerKey!==footerHtml){footer.innerHTML=footerHtml;this.footerKey=footerHtml;}
    this.root.querySelector('.r-bag-frame')?.classList.toggle('gold-border',s.collection.selectedPresentationIds.includes('goldleaf-backpack-border'));
  }
  private body(m:ReadModel):string {const s=this.engine.state,inv=s.inventory,c=m.catalog;
    const owned=Object.values(inv.itemById).filter(i=>inv.locationById[i.id].kind!=='ground');
    const cards=owned.map(i=>itemCard(i,c,this.selected)).join('');
    if(this.page==='battle'||this.page==='inventory'||this.page==='growth')return `<div class="r-bag-top"><div class="r-section-label"><strong>行囊 ${inv.unlockedCells.length}/48</strong><span>攻 ${m.stats.attack} · 防 ${m.stats.defense}</span></div>${inventoryGrid(inv,c,this.selected,this.rotation,this.expand,m.battlefield.cursor?.sourceId)}${this.page==='inventory'?`<div class="r-actions">${button('rotate','↻ 旋轉',!this.selected)}${button('cancel-place','取消選取',!this.selected)}${button('sort','整理倉庫')}<button data-page="forge">合成／鍛造</button></div><p class="r-hint">${this.selected&&inv.itemById[this.selected]?`已選 ${esc(itemName(inv.itemById[this.selected],c))}，點空格放置。`:'點裝備看詳情；選取後點空格或拖放移動。'}</p>`:''}</div>${this.page==='inventory'?`<div class="r-section-label"><strong>倉庫 ${m.warehouse.items.length}/60</strong><button data-page="pets">靈寵 ${m.pets.owned.length}/30</button></div><div class="r-scroll r-item-list">${m.warehouse.items.map(i=>itemCard(i,c,this.selected)).join('')||'<p>倉庫目前是空的。</p>'}</div>`:this.page==='growth'?`<section class="r-card"><p>可用成長點 ${m.hero.points} · 下一級還需 ${15*m.hero.level*(m.hero.level+1)-m.hero.cumulativeXp} 經驗</p><div class="r-actions">${button('attack-point','1 點：攻擊 +2',!m.hero.points)}${button('health-point','1 點：生命 +15',!m.hero.points)}</div><p>點背包外緣的「＋」花費 2 點擴充一格。</p></section>`:`<p class="r-hint">依背包從上到下、從左到右行動；點怪物查看能力。</p><label class="r-toggle"><input id="auto-repeat" type="checkbox" ${s.settings.autoRepeatEnabled?'checked':''}> 自動重複本關</label>`}`;
    if(this.page==='camp')return `<section class="r-camp-scene ${s.collection.selectedPresentationIds.includes('goldleaf-backpack-border')?'gold-border':''}"><img src="${assetUrl('hero.png')}" alt="旅人"><div><h1>${s.collection.selectedPresentationIds.includes('title-astral-traveller')?'星界旅人':'永夜行囊'}</h1><p>帶著你的行囊，走過七片土地。</p>${s.collection.selectedPresentationIds.map(id=>campCosmetic(id,c)).join('')}</div></section><p class="r-hint">商隊尚未抵達（未來商店）</p><div class="r-menu">${(['map','inventory','forge','pets','growth','collection','loadouts','tracker','ground'] as Page[]).map(p=>`<button data-page="${p}">${pageNames[p]}</button>`).join('')}</div><section class="r-card"><p>已通過 ${s.world.completedStageIds.length}/70 關 · 裝備收藏 ${Object.keys(s.collection.equipmentHighestQualityByDefinition).length}/22</p><p>倉庫 ${m.warehouse.items.length}/60 · 靈寵 ${m.pets.owned.length}/30</p>${m.ground.length?`<p>地上還有 ${m.ground.length} 件物品等你領取。</p>`:''}${s.activeRun?button('abandon','放棄本次旅程'):''}</section>`;
    if(this.page==='forge')return `<p>${this.pair?'請選擇合成材料；主體原有詞條與寶石保留。':'選一件裝備，進行合成、鑲嵌、重洗或分解。'}</p><div class="r-item-list">${cards}</div>`;
    if(this.page==='pets')return `<p>靈寵 ${m.pets.owned.length}/30 · 同時出戰一隻</p><div class="r-item-list">${m.pets.owned.map(p=>`<button class="r-item-card" data-pet="${esc(p.id)}"><img src="${assetUrl(`${p.kind}.png`)}" alt=""><span>${qualityNames[p.quality]} ${p.kind==='wolf'?'靈狼':'花精'} Lv.${p.level}${p.id===inv.activePetId?' · 出戰':''}</span></button>`).join('')||'<p>完成翠林第一關，可領取第一隻靈狼。</p>'}</div>`;
    if(this.page==='map'){const selected=c.stages.find(d=>d.id===s.world.selectedStageId)!;return `<section class="r-card"><h2>${selected.name}</h2><p>10 波 · 首領 ${c.enemies.find(e=>e.id===selected.bossId)!.name}</p><label class="r-toggle"><input id="challenge" type="checkbox" ${s.world.selectedChallengeId?'checked':''} ${s.world.completedStageIds.includes(selected.id)?'':'disabled'}> 挑戰：敵生命 ×1.25、攻擊 ×1.15</label><p>通過普通關後可挑戰；額外裝備 10%、寶石 15%、粉塵 4。</p>${button('start','前往此關',!!s.activeRun&&!['dead','settlement'].includes(s.activeRun.status))}${s.activeRun&&!['dead','settlement'].includes(s.activeRun.status)?'<p>目前仍有旅程，先繼續或在營地確認放棄。</p>':''}</section>${c.regions.map(r=>`<section class="r-card"><h2>${r.name}</h2><div class="r-stage-list">${c.stages.filter(d=>d.regionId===r.id).map(d=>`<button data-stage="${d.id}" ${s.world.unlockedStageIds.includes(d.id)?'':'disabled'} class="${d.id===selected.id?'selected':''}">${s.world.completedStageIds.includes(d.id)?'✓ ':''}${d.name}</button>`).join('')}</div>${r.unlock.length?`<p class="r-hint">開啟條件：${r.unlock.map(group=>group.map(id=>c.stages.find(d=>d.id===id)!.name).join(' ＋ ')).join(' 或 ')}</p>`:''}</section>`).join('')}`;}
    if(this.page==='loadouts')return `<p>儲存目前裝備位置與出戰靈寵。套用前檢查所有個體；寶石與詞條以持有實物為準。</p>${Array.from({length:6},(_,i)=>{const slot=i+1,l=s.loadouts.find(l=>l.slotId===slot);return `<section class="r-card"><label>配裝 ${slot}<input id="slot-${slot}" maxlength="12" value="${esc(l?.name??'')}" placeholder="最多 12 字"></label><p>${l?`${l.items.length} 件裝備 · ${l.pet?'含靈寵':'未帶靈寵'}`:'尚未儲存'}</p><div class="r-actions"><button data-slot="${slot}" data-slot-action="save">存入目前</button>${l?`<button data-slot="${slot}" data-slot-action="apply">套用</button><button data-slot="${slot}" data-slot-action="rename">改名</button><button data-slot="${slot}" data-slot-action="remove">刪除</button>`:''}</div></section>`;}).join('')}`;
    if(this.page==='collection')return `<h2>旅途收藏</h2><p>成功領取、合成或成長會永久記錄，分解後仍保留。裝飾不增加戰力。</p>${c.collections.map(reward=>{const claimed=s.collection.rewardClaimIds.includes(reward.id),eligible=collectionEligible(reward,s,c),name=presentationNames[reward.presentationId]??`${c.regions.find(r=>reward.presentationId.endsWith(r.id))?.name}營地毯`;return `<div class="r-card"><strong>${esc(name)}</strong><p>${reward.requirement.kind==='equipment-count'?`收集 ${reward.requirement.count} 種裝備`:reward.requirement.kind==='gem-kind-count'?'收集六種寶石':reward.requirement.kind==='pet-level'?'兩種靈寵皆達 Lv.6':reward.requirement.kind==='all-regions-clear'?'通過全部 70 關':'通過區域全部 10 關'}</p>${claimed?`<button data-presentation="${reward.presentationId}">${s.collection.selectedPresentationIds.includes(reward.presentationId)?'收起裝飾':'擺放裝飾'}</button>`:`<button data-reward="${reward.id}" ${eligible?'':'disabled'}>領取裝飾</button>`}</div>`;}).join('')}<h2>裝備 ${Object.keys(s.collection.equipmentHighestQualityByDefinition).length}/22</h2><label>追蹤品質 <select id="track-quality">${qualityNames.map((q,i)=>`<option value="${i}">${q}</option>`).join('')}</select></label><label>目標數量 <input id="track-count" type="number" value="1" min="1"></label><div class="r-stage-list">${c.equipment.map(d=>`<button data-track-item="${d.id}">${d.name} · ${s.collection.equipmentHighestQualityByDefinition[d.id]===undefined?'未發現':qualityNames[s.collection.equipmentHighestQualityByDefinition[d.id]!]}<small>追蹤來源</small></button>`).join('')}</div><h2>寶石</h2>${c.gems.map(g=>`<div class="r-card"><strong>${gemNames[g.type]} ${g.grade}級 ×${inv.gemStacks[`${g.type}:${g.grade}`].count}</strong><p>${gemEffect(g.type,g.grade)}</p><button data-track-gem="${g.type}:${g.grade}">追蹤來源</button></div>`).join('')}`;
    if(this.page==='tracker'){const t=m.tracking,target=t.target;return target?`<h2>${target.kind==='equipment'?`${qualityNames[target.quality]} ${c.equipment.find(d=>d.id===target.definitionId)!.name}`:`${gemNames[target.type]} ${target.grade}級`} ×${target.count}</h2><p>背包 ${t.owned.equipped} · 倉庫 ${t.owned.warehouse} · 堆疊 ${t.owned.stacked} · 已嵌入 ${t.owned.embedded} · 地上 ${t.owned.onGround}</p><p>尚缺 ${t.missing.equipment+t.missing.gems} · 尚缺粉塵 ${t.missing.dust}</p>${button('clear-track','取消追蹤')}<p>點來源會在地圖選取關卡。</p><div class="r-stage-list">${t.sources.map(d=>`<button data-stage="${d.stageId}" ${d.unlocked?'':'disabled'}>${c.stages.find(s=>s.id===d.stageId)!.name}${d.unlocked?'':' · 尚未解鎖'}</button>`).join('')}</div>`:`<p>尚未設定追蹤目標。</p><button data-page="collection">從收藏選擇品項或寶石</button>`;}
    if(this.page==='ground')return `<p>逐件領取；容量不足時可以先整理。切換關卡前會嘗試依序領取，已領取的物品不會退回。</p>${m.ground.map(d=>{const p=d.payloadRef;return `<section class="r-card"><strong>${p.kind==='equipment'?`${qualityNames[inv.itemById[p.itemId].quality]} ${itemName(inv.itemById[p.itemId],c)}`:p.kind==='pet'?`${qualityNames[inv.petById[p.petId].quality]} ${inv.petById[p.petId].kind==='wolf'?'靈狼':'花精'}`:p.kind==='gem'?`${gemNames[p.type]} ${p.grade}級 ×${p.count}`:`粉塵 ×${p.amount}`}</strong><button data-drop="${esc(d.id)}" ${d.state==='falling'?'disabled':''}>${d.state==='falling'?'落下中':'領取'}</button></section>`;}).join('')||'<p>沒有待領物品。</p>'}<button data-page="inventory">整理容量</button>`;
    return `<h2>聲音與畫面</h2>${(['musicVolume','soundVolume'] as const).map(key=>`<label>${key==='musicVolume'?'音樂':'音效'}音量<input data-setting="${key}" type="range" min="0" max="1" step="0.05" value="${s.settings[key]}"></label>`).join('')}${(['musicMuted','soundMuted','reducedMotion'] as const).map(key=>`<label class="r-toggle"><input type="checkbox" data-setting="${key}" ${s.settings[key]?'checked':''}> ${{musicMuted:'音樂靜音',soundMuted:'音效靜音',reducedMotion:'減少動態效果'}[key]}</label>`).join('')}<section class="r-card"><h2>存檔備份</h2><p>進度保存在此瀏覽器。匯入前會預覽，確認後保留目前原文備份。</p>${button('export','匯出存檔')}<label>匯入存檔<input id="import-file" type="file" accept=".json,application/json"></label></section>`;
  }
}
