import { ReleaseEngine } from './game/release-engine';
import { initialEnvelope, Mutation } from './game/systems/resource-transactions';
import { settleGround, syncCapacity } from './game/systems/ground-loot';
import { ReleaseStorage, inspectSave, migrateToRelease, SAVE_KEY, LEGACY_SAVE_KEY } from './release-save';
import { CONTENT_VERSION, type SaveEnvelope, type Command, type CommandPreview } from './game/contracts';
import { ReleaseUI } from './ui/release/camp';
import { escapeHtml as esc } from './ui/release/details';
import { GameAudio } from './audio';

function download(raw:string,name='evernight-save.json'){const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function confirmDialog(title:string,body:string):Promise<boolean>{return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='r-dialog';dialog.innerHTML=`<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="r-actions"><button value="cancel">取消</button><button value="confirm">確認</button></div>`;document.body.append(dialog);dialog.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest('button');if(b)dialog.close(b.value);});dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='confirm');dialog.remove();},{once:true});dialog.showModal();});}
function pausedForLoad(envelope:SaveEnvelope){const tx=new Mutation(envelope);tx.draft.contentVersion=CONTENT_VERSION;if(tx.draft.state.activeRun?.ruleset==='release-r2'){tx.draft.state.activeRun.contentVersion=CONTENT_VERSION;tx.draft.state.activeRun.definitionVersion=CONTENT_VERSION;}tx.draft.state.lifecycle.pauseReasons=tx.draft.state.lifecycle.pauseReasons.filter(p=>p!=='hidden'&&p!=='save-error'&&p!=='save-conflict');if(!tx.draft.state.lifecycle.pauseReasons.includes('load'))tx.draft.state.lifecycle.pauseReasons.push('load');tx.draft.state.lifecycle.resumeRequired=true;settleGround(tx);syncCapacity(tx);tx.draft.revision++;tx.finish();return tx.draft;}
const randomId=()=>Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
function newSave(){return initialEnvelope(randomId(),crypto.getRandomValues(new Uint32Array(1))[0]||1);}

export async function bootRelease(root:HTMLElement){
  const storage=await ReleaseStorage.open();let raw=await storage.read(),source:{key:string;raw:string}|undefined;
  if(raw===null){for(const key of [SAVE_KEY,LEGACY_SAVE_KEY]){const legacy=localStorage.getItem(key);if(legacy!==null){source={key,raw:legacy};raw=legacy;break;}}}
  const inspected=raw===null?{ok:true as const,value:newSave()}:source?migrateToRelease(raw,source.key):inspectSave(raw);
  if(!inspected.ok){
    root.innerHTML=`<section class="r-recovery"><h1>存檔需要處理</h1><p>${esc(inspected.error.message)}</p><p>原始內容保留，遊戲目前不會覆寫進度。</p><button id="raw-export">匯出原始存檔</button><label>選擇備份<input type="file" id="recover-import" accept=".json"></label><button id="fresh-save">備份後開始新旅程</button></section>`;
    root.querySelector('#raw-export')!.addEventListener('click',()=>download(raw!,'evernight-original.json'));
    const replace=async(envelope:SaveEnvelope)=>{if(!await confirmDialog('確認取代目前存檔',`將使用 Lv.${envelope.state.hero.level}、已通過 ${envelope.state.world.completedStageIds.length} 關的進度。目前原始存檔會另存備份。`))return;const current=await storage.read();if(current!==(source?null:raw)){root.querySelector('p')!.textContent='另一分頁已更新進度，請重新載入後再確認。';return;}const next=pausedForLoad(envelope),saved=await storage.write(0,next,source,current??undefined);if(saved.ok)location.reload();else root.querySelector('p')!.textContent=saved.error.message;};
    root.querySelector('#fresh-save')!.addEventListener('click',()=>void replace(newSave()));
    root.querySelector('#recover-import')!.addEventListener('change',e=>void(async()=>{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;const checked=inspectSave(await file.text());if(checked.ok)await replace(checked.value);else root.querySelector('p')!.textContent=checked.error.message;})());return;
  }
  const envelope=raw===null?inspected.value:pausedForLoad(inspected.value),saved=await storage.write(source||raw===null?0:inspected.value.revision,envelope,source,!source&&raw!==null&&inspected.value.contentVersion!==CONTENT_VERSION?raw:undefined);
  if(!saved.ok)throw new Error(saved.error.message);
  const engine=new ReleaseEngine(envelope,storage),audio=new GameAudio();let chain=Promise.resolve(),queued=0,ui:ReleaseUI;
  function serialize<T>(work:()=>Promise<T>):Promise<T>{queued++;const task=chain.then(work);chain=task.then(()=>{},()=>{}).finally(()=>{queued--;});return task;}
  async function dispatch(command:Command,preview?:CommandPreview){return serialize(async()=>{const seq=engine.envelope.counters.lastAppliedCommandSeq+1;const result=await engine.dispatch(command,{commandId:`${engine.envelope.saveId}:cmd${seq}:${randomId()}`,commandSeq:seq,expectedRevision:engine.envelope.revision,confirmedPreview:preview?.token});if(!result.ok)ui.notify(result.error.message);else if(result.value.outcome.kind!=='accepted'){audio.play({type:result.value.outcome.kind==='synthesis-success'?'synthesis-success':'synthesis-fail'});ui.notify(result.value.outcome.kind==='synthesis-success'?'合成成功！原有詞條與寶石保留。':'合成失敗，主體保留，材料寶石已退回。');}audio.sync(engine.state.settings);return result.ok;});}
  ui=new ReleaseUI(root,engine,{dispatch,exportSave:()=>download(JSON.stringify(engine.envelope,null,2)),audio:()=>{void audio.start(engine.state.settings).then(()=>audio.play({type:'ui'})).catch(()=>{});},importSave:async(file)=>{
    const text=await file.text(),checked=inspectSave(text);if(!checked.ok){ui.notify(checked.error.message);return;}
    if(!await confirmDialog('匯入存檔',`Lv.${checked.value.state.hero.level} · 已通過 ${checked.value.state.world.completedStageIds.length}/70 關 · ${checked.value.state.inventory.warehouseOrder.length} 件倉庫裝備。確認後取代目前進度，原進度另存備份。`))return;
    await serialize(async()=>{const current=await storage.read();if(current===null){ui.notify('目前存檔已變更，請重新載入。');return;}const parsed=inspectSave(current);if(!parsed.ok||parsed.value.revision!==engine.envelope.revision){ui.notify('另一分頁已更新進度，請重新載入。');return;}const next=pausedForLoad(checked.value);next.revision=engine.envelope.revision+1;const outcome=await storage.write(engine.envelope.revision,next,undefined,current);if(outcome.ok)location.reload();else ui.notify(outcome.error.message);});
  }});
  let last=performance.now(),accumulator=0,lastRender=0,ticking=false;
  function frame(now:number){const elapsed=Math.min(250,now-last);last=now;
    if(document.hidden||queued||engine.busy||engine.blocked)accumulator=0;else accumulator+=elapsed;
    if(accumulator>=50&&!ticking&&!queued&&!document.hidden){accumulator-=50;ticking=true;void serialize(()=>engine.tick()).catch(error=>ui.notify(error instanceof Error?error.message:'模擬已暫停。')).finally(()=>{ticking=false;});}
    if(now-lastRender>=100){const events=engine.drainEvents();ui.render(events);for(const e of events){if(e.type==='HitResolved')audio.play({type:'attack'});if(e.type==='LootPickedUp')audio.play({type:'loot'});if(e.type==='HealApplied')audio.play({type:'heal'});}lastRender=now;}requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange',()=>{accumulator=0;void audio.setHidden(document.hidden);void dispatch({type:'lifecycle.visibility',visible:!document.hidden});});
  window.addEventListener('pagehide',()=>{void serialize(()=>engine.checkpoint());});
  if(envelope.migrationReport)ui.notify(envelope.migrationReport.combatDisposition==='legacy-v2-preserved'?'舊旅程已保留，手動繼續後完成本次五波；下一次出發改為十波。':'舊進度已保留，請手動出發。');
}
