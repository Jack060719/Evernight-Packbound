import { describe, it, expect } from 'vitest';
import { releaseContent as content } from '../../src/game/registries';
import { BOSS_IDS, ENEMY_DEFINITION_IDS, ITEM_DEFINITION_IDS } from '../../src/game/contracts';

describe('complete approved release content',()=>{
  it('expands every named stage into ten legal waves with its boss in wave ten',()=>{
    expect(content.regions).toHaveLength(7);expect(content.stages).toHaveLength(70);expect(content.enemies).toHaveLength(105);
    expect(new Set(content.stages.map(s=>s.bossId))).toEqual(new Set(BOSS_IDS));
    for(const stage of content.stages) {
      expect(stage.waves).toHaveLength(10);
      for(const [index,wave] of stage.waves.entries()) {
        expect(wave.enemies.length).toBeGreaterThan(0);expect(wave.enemies.length).toBeLessThanOrEqual(5);
        expect(wave.enemies.map(e=>e.ordinal)).toEqual(wave.enemies.map((_,i)=>i));
        for(const enemy of wave.enemies) { expect(ENEMY_DEFINITION_IDS).toContain(enemy.definitionId);expect(enemy.hp).toBeGreaterThan(0); }
        expect(wave.enemies.some(e=>e.definitionId===stage.bossId)).toBe(index===9);
      }
    }
    expect(content.stages.reduce((sum,s)=>sum+s.waves.reduce((n,w)=>n+w.enemies.reduce((x,e)=>x+e.xp,0),0),0)).toBe(61192);
  });
  it('makes all seventy stages reachable through the specified branching graph',()=>{
    const cleared=new Set<string>();
    for(let i=0;i<70;i++) for(const s of content.stages) if(!s.unlock.length || s.unlock.some(clause=>clause.every(id=>cleared.has(id)))) cleared.add(s.id);
    expect(cleared.size).toBe(70);
    expect(content.stages.find(s=>s.id==='frost-01')!.unlock).toEqual([['verdant-06','mire-03'],['verdant-06','gale-03']]);
  });
  it('provides compatible effects and normalized independent loot tables',()=>{
    expect(content.equipment.map(d=>d.id)).toEqual(ITEM_DEFINITION_IDS);
    expect(content.gems).toHaveLength(18);expect(content.petMilestones).toHaveLength(6);
    for(const table of content.lootTables) for(const pool of [table.equipmentPool,table.gemPool,table.petPool]) expect(pool.reduce((n,row)=>n+row.weight,0)).toBeCloseTo(1);
    for(const row of content.qualityRows) for(const pool of [row.equipment,row.pet,row.gem]) expect(pool.reduce((n,r)=>n+r.probability,0)).toBeCloseTo(1);
    for(const d of content.equipment) { expect(content.gearEffects.some(e=>e.id===d.effectId)).toBe(true);expect(d.affixPool.length).toBeGreaterThanOrEqual(3); }
    expect(content.equipment.find(e=>e.id==='moonwell-wide-staff')!.gemTypes).not.toContain('sweep');
  });
});
