import { getExecutionPermission, type ReadModel } from './contracts';
import type { ReleaseEngine } from './release-engine';
import { combatStats } from './systems/affixes';
import { occupied } from './systems/inventory';
import { trackingView } from './systems/loot-tracking';
import { legacyStats } from './systems/legacy-run';

export function readModel(engine:ReleaseEngine,selected:string|null=null):ReadModel {
  const s=engine.state,inv=s.inventory,catalog=engine.content,run=s.activeRun;
  return { revision:engine.envelope.revision,hero:s.hero,stats:run?.ruleset==='legacy-v2'?{...legacyStats(s),healingBonus:0,petPowerBonus:0}:combatStats(s,catalog),world:s.world,activeRun:run,lifecycle:s.lifecycle,
    gemStacks:inv.gemStacks,resources:inv.resources,collection:s.collection,loadouts:s.loadouts,settings:s.settings,catalog,
    backpack:{ rows:6,cols:8,unlockedCells:inv.unlockedCells,selectedItemId:selected,items:Object.values(inv.itemById).flatMap(item=>{
      const p=inv.locationById[item.id];return p.kind==='equipped'?[{item,placement:p,cells:occupied(item,p,catalog),iconKey:item.baseKind}]:[];
    }) },warehouse:{capacity:60,items:inv.warehouseOrder.map(id=>inv.itemById[id])},
    pets:{capacity:30,activePetId:inv.activePetId,owned:Object.values(inv.petById).filter(p=>inv.petLocationById[p.id].kind==='owned')},
    battlefield:{enemies:run?.ruleset==='release-r2'?run.combat.enemies:[],round:run?.combat.round??0,cursor:run?.ruleset==='release-r2'?run.combat.currentAction:null},
    ground:s.groundDrops.filter(d=>d.state!=='claimed'),details:selected&&inv.itemById[selected]?{item:inv.itemById[selected],name:catalog.equipment.find(d=>d.id===inv.itemById[selected].definitionId)!.name,stats:[],gems:inv.itemById[selected].sockets}:null,
    tracking:trackingView(s,catalog),autoRepeatEnabled:s.settings.autoRepeatEnabled,
    permission:getExecutionPermission(s,{visible:!document.hidden,storageGate:!!engine.blocked,settlementReady:run?.ruleset!=='release-r2'||run.phaseRemainingTicks===0,exitReady:true}),
    saveStatus:engine.blocked==='save-conflict'?'conflict':engine.blocked?'read-only':engine.busy?'committing':'ready' };
}
