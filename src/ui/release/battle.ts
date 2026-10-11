import type { ReadModel, CommittedEvent } from '../../game/contracts';
import { assetUrl, enemyArt, regionBackground } from '../../game/release-visual-manifest';
import { escapeHtml as esc, mechanicLabel } from './details';

export function heroPosition(model:ReadModel) {
  const run=model.activeRun;
  return run?.ruleset==='release-r2'&&run.status==='wave-entry'?90+(30-run.phaseRemainingTicks)*7:run?.status==='settlement'?270:90;
}
export class ReleaseBattle {
  private key='';
  private actors:HTMLElement;
  private feedback:HTMLElement;
  constructor(private host:HTMLElement) {
    this.actors=document.createElement('div');this.actors.className='r-actors';
    this.feedback=document.createElement('div');this.feedback.className='r-feedback';
    host.append(this.actors,this.feedback);
  }
  update(m:ReadModel) {
    const run=m.activeRun,region=m.catalog.stages.find(s=>s.id===(run?.stageId??m.world.selectedStageId))!.regionId;
    this.host.style.backgroundImage=`url("${regionBackground(region)}")`;
    this.host.classList.toggle('reduced-motion',m.settings.reducedMotion);
    const enemies=run?.ruleset==='legacy-v2'?run.combat.enemies.map((e,i)=>({id:e.id,name:e.name,hp:e.hp,maxHp:e.maxHp,shield:0,poison:0,src:assetUrl(e.kind==='boss'?'boss.png':e.kind==='skeleton'?'skeleton.png':'slime.png'),badges:'',ordinal:i})):m.battlefield.enemies.map(e=>({id:e.id,name:m.catalog.enemies.find(d=>d.id===e.definitionId)!.name,hp:e.hp,maxHp:e.maxHp,shield:e.shield,poison:e.poison.length,src:enemyArt(e.definitionId),badges:e.mechanics.map(mechanicLabel).filter(Boolean).join('·'),ordinal:e.ordinal}));
    const pet=m.pets.owned.find(p=>p.id===m.pets.activePetId);
    const combat=run?.ruleset==='release-r2'?run.combat:null;
    const html=`<div class="r-actor r-hero" data-actor="hero" style="left:${heroPosition(m)/3.6}%"><img src="${assetUrl('hero.png')}" alt="旅人"></div>${pet?`<div class="r-actor r-pet" data-actor="${esc(pet.id)}"><img src="${assetUrl(`${pet.kind}.png`)}" alt="${pet.kind==='wolf'?'靈狼':'花精'}"></div>`:''}${enemies.filter(e=>e.hp>0).map((e,i)=>`<button class="r-actor r-enemy" data-enemy="${esc(e.id)}" data-actor="${esc(e.id)}" style="left:${48+(i%3)*20}%;top:calc(100% - ${i<3?256:128}px);z-index:${i<3?2:3}"><span class="r-enemy-name">${esc(e.name)}</span><img src="${e.src}" alt=""><span class="r-mini-bar"><i style="width:${e.hp/e.maxHp*100}%"></i></span><span class="r-badges">${e.shield?'盾 ':''}${e.poison?`毒${e.poison} `:''}${e.badges}</span></button>`).join('')}${m.ground.map(d=>`<button class="r-ground ${d.state==='falling'?'falling':''}" style="left:${d.position.x/3.6}%;bottom:${d.state==='falling'?Math.round(d.claimRemainingMs/10)+2:2}px" data-drop="${esc(d.id)}" aria-label="領取地物">${({equipment:'▣',pet:'♧',gem:'◆',dust:'✦'})[d.payloadRef.kind]}</button>`).join('')}`;
    const status=`<span class="r-hero-status">${combat?.heroShield?`盾 ${combat.heroShield.toFixed(1)} `:''}${combat?.heroPoison.length?`毒 ${combat.heroPoison.length} `:''}${combat?.bondStacks?`共鳴 ${combat.bondStacks}`:''}</span>`;
    if(html+status!==this.key){this.actors.innerHTML=html+status;this.key=html+status;}
  }
  show(events:readonly CommittedEvent[],reduced:boolean) {
    for(const e of events) {
      if(e.type!=='HitResolved'&&e.type!=='HealApplied'&&e.type!=='DamageApplied')continue;
      const node=document.createElement('span');node.className=`r-float ${e.type==='HealApplied'?'heal':''}`;
      node.textContent=e.type==='HealApplied'?`+${e.payload.actual}`:e.type==='HitResolved'?`${e.payload.critical?'✦ ':''}${e.payload.amount}`:`−${e.payload.amount}`;
      const actor=[...this.host.querySelectorAll<HTMLElement>('[data-actor]')].find(n=>n.dataset.actor===(e.targetId??'hero'));
      node.style.left=actor?.style.left||'25%';node.style.top=actor?.style.top||'30px';
      this.feedback.append(node);setTimeout(()=>node.remove(),700);
      if(!reduced)actor?.animate([{transform:'translateX(0)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:180});
    }
  }
}
