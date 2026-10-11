import { describe,it,expect } from 'vitest';
import { initialEnvelope, type Draft } from '../../src/game/systems/resource-transactions';
import { inspectSave,migrateToRelease,SAVE_KEY,LEGACY_SAVE_KEY } from '../../src/release-save';
import { createInitialState } from '../../src/game/engine';

describe('release save validation and deterministic migration',()=>{
  it('roundtrips the complete starter envelope and rejects future schemas and duplicate IDs',()=>{
    const e=initialEnvelope('test',42);expect(inspectSave(JSON.stringify(e))).toEqual({ ok:true,value:e });
    expect(inspectSave(JSON.stringify({ ...e,schemaVersion:99 })).ok).toBe(false);
    const bad=structuredClone(e) as Draft;bad.state.inventory.itemById.i1.sockets=[{ id:'i1',type:'venom',grade:1 }];
    expect(inspectSave(JSON.stringify(bad)).ok).toBe(false);
  });
  it('migrates legacy v2 without resetting HP, action resolution, RNG-relevant reward ownership, or user identities',()=>{
    const old=createInitialState();old.hero.hp=37;old.firstFloorReward=true;old.completedRuns=1;old.settings.autoItems.enabled=true;
    const raw=JSON.stringify(old),a=migrateToRelease(raw,SAVE_KEY),b=migrateToRelease(raw,SAVE_KEY);
    expect(a).toEqual(b);expect(a.ok).toBe(true);if(!a.ok)return;
    expect(a.value.state.hero.hp).toBe(37);expect(a.value.state.world.unlockedStageIds).toEqual(expect.arrayContaining(['verdant-04','ember-01','moonwell-01']));
    expect(a.value.state.world.unlockedStageIds).not.toContain('verdant-05');
    expect(a.value.state.activeRun?.ruleset).toBe('legacy-v2');
    expect(a.value.state.activeRun?.combat).toEqual(old.battle);
    expect(a.value.state.settings).not.toHaveProperty('autoItems');
    expect(a.value.state.world.oneTimeRewards['first-cleared-verdant-02-gem']).toEqual({ state:'unearned' });
    const checked=inspectSave(JSON.stringify(a.value));expect(checked,checked.ok?'':checked.error.message).toMatchObject({ ok:true });
  });
  it('migrates v1 to paused camp without granting the old prototype full-heal reset',()=>{
    const old={ ...createInitialState(),version:1 };old.hero.hp=17;
    const migrated=migrateToRelease(JSON.stringify(old),LEGACY_SAVE_KEY);expect(migrated.ok).toBe(true);if(!migrated.ok)return;
    expect(migrated.value.state.hero.hp).toBe(17);expect(migrated.value.state.activeRun).toBe(null);expect(migrated.value.state.lifecycle.resumeRequired).toBe(true);
  });
  it('keeps legacy pending items on the ground and does not discover them early',()=>{
    const old=createInitialState();old.pending.items=[{ id:'i70',kind:'staff',quality:3,placement:null }];old.nextId=71;
    const migrated=migrateToRelease(JSON.stringify(old),SAVE_KEY);expect(migrated.ok).toBe(true);if(!migrated.ok)return;
    expect(migrated.value.state.inventory.locationById.i70.kind).toBe('ground');
    expect(migrated.value.state.collection.equipmentHighestQualityByDefinition.staff).toBeUndefined();
    expect(migrated.value.state.groundDrops[0].state).toBe('available');
  });
});
