import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileChartSkill,createChartSetup,branchSampler,prepareChart} from '../assets/cm-chart.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {effectValue,effectDuration} from '../assets/cm-effect-policy.mjs';
import {RecordedPurchaseModel,recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {buildPhysics} from '../assets/physics.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const data=read(read('data/manifest.json').dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const input={outfitId:'101301',bloom:5,uniqueLevel:6,style:2,courseId:'10808',scenarioId:'15',supportIds:[]};
const setup=createChartSetup(data,profiles,input);
const run=(skills,s=setup,sample=0)=>simulateSolo(s,skills.map(skill=>compileChartSkill(skill,s)),.5,{dt:.01,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(s,[],sample)});
function skill(id,effects,condition=[[{field:'phase',operator:'==',value:1}]],extras={}){
 return {id,name_jp:id,rarity:'gold',inherited:false,parent_ids:[],invocations:[{index:1,condition,precondition:[],duration_raw:20000,duration_unit:'umatools_base_time',effects:effects.map(([kind,value,extra={}])=>({kind,value_raw:value,source_type:kind,unit:'umatools_raw',extras_raw:extra})),...extras}]};
}
test('acceleration plus vision retains the independently verified acceleration, without applying opponent debuffs to the runner',()=>{
 const s={...setup,style:3},actual=data.skills['104001211'],compiled=compileChartSkill(actual,s);
 assert.notEqual(compiled.status,'unsupported');assert.deepEqual(compiled.invocations[0].effects.map(e=>e.kind),['acceleration']);
 const clean={...actual,invocations:actual.invocations.map(i=>({...i,effects:i.effects.filter(e=>e.kind==='acceleration')}))};
 assert.equal(run([actual],s).finishTime,run([clean],s).finishTime);
 const mixed=skill('mixed',[['target_speed',3500],['current_speed',-2500,{target:9}]]),self=skill('mixed',[['target_speed',3500]]);
 assert.equal(run([mixed]).finishTime,run([self]).finishTime);assert.ok(compileChartSkill(mixed,setup).calculationNotes.length);
 assert.equal(compileChartSkill(data.skills['200772'],setup).status,'inactive');
});
test('pure vision keeps its record and verified purchase price with zero direct solo margin',()=>{
 const s={...setup,style:4},vision=data.skills['201501'];assert.notEqual(compileChartSkill(vision,s).status,'inactive');
 assert.equal(run([vision],s).finishTime,run([],s).finishTime);assert.equal(data.purchase_stages[vision.id].status,'verified');assert.equal(data.purchase_stages[vision.id].prerequisite_id,'201502');
});
test('Concentration reduces the existing start delay and a compound evolution also applies its passive stats once',()=>{
 const baseline=run([]),concentration=run([data.skills['200431']]);assert.ok(concentration.finishTime<baseline.finishTime);
 const compound=run([data.skills['102602211']]);assert.deepEqual(Object.values(compound.passive),[10,10,10,10,10]);
 assert.equal(compound.events.filter(e=>e.id==='102602211').length,1);assert.ok(compound.finishTime<concentration.finishTime);
 const negative=run([data.skills['202141']]);assert.equal(negative.passive.wisdom,-40);assert.ok(negative.finishTime>baseline.finishTime);
});
test('Oonige uses its own phase speed/acceleration and stamina coefficients only for front runners',()=>{
 const s={...setup,style:1},own=run([data.skills['202051']],s),plain=run([],s);
 assert.equal(own.passive.oonige,true);assert.ok(own.hpMax<plain.hpMax);
 const a=buildPhysics(s,{oonige:true}),b=buildPhysics(s);assert.ok(a.target(0)>b.target(0));assert.ok(a.target(1)<b.target(1));assert.ok(a.acceleration(0,false)>b.acceleration(0,false));
 assert.equal(run([data.skills['202051']]).finishTime,run([]).finishTime);
});
test('full-spurt acceleration activates only above raw speed2000, at a sampled position after entering full spurt',()=>{
 const actual=data.skills['204222'];assert.equal(actual.invocations[0].effects[0].kind,'full_spurt_acceleration');
 const below={...setup,stats:{...setup.stats,speed:2000}},above={...setup,stats:{...setup.stats,speed:2200}};
 assert.equal(run([actual],below).events.length,0);assert.equal(run([actual],below).finishTime,run([],below).finishTime);
 const enhanced=run([actual],above),base=run([],above);assert.ok(enhanced.finishTime<base.finishTime);assert.equal(enhanced.events.length,1);assert.ok(enhanced.events[0].x>2*above.course.distance/3);
 const first=run([actual],above,0),last=run([actual],above,1);assert.notEqual(first.events[0].x,last.events[0].x);
 const linked=data.skills['101703111'];assert.notEqual(compileChartSkill(linked,above).status,'unsupported');assert.deepEqual(run([linked],above).events.map(e=>e.index),[1,2]);
});
test('stat, skill-count and actual passive-count scaling use live inputs instead of unconditionally taking maximum',()=>{
 const physics=buildPhysics(setup),state={selected:new Set(['a','b']),passiveCount:2};
 const value=(scale,extra={})=>effectValue({value:1,scale},{setup,physics,state,...extra});
 assert.equal(value(2),1.02);assert.equal(value(14),0);state.passiveCount=3;assert.equal(value(14),1);state.passiveCount=6;assert.equal(value(14),3);
 const low={...setup,stats:{speed:599,stamina:599,power:599,guts:599,wisdom:599}};assert.equal(value(13,{setup:low}),.8);assert.equal(value(13),1.2);
 assert.equal(value(8,{q:.59}),0);assert.equal(value(8,{q:.6}),.02);assert.equal(value(8,{q:.9}),.04);
 const passive=skill('passive',[['passive_speed',400000]],[[{field:'always',operator:'==',value:1}]],{duration_raw:-1});
 const scaled=data.skills['100981'];assert.ok(run([scaled,passive]).finishTime<run([scaled]).finishTime);
});
test('HP-dependent durations use current HP and scale the final duration once by course length',()=>{
 const inv={duration:2.4*2.2,durationScale:3},state={hp:1999,evolutionDuration:1};
 assert.equal(effectDuration(inv,{setup,state}),5.28);state.hp=2000;assert.equal(effectDuration(inv,{setup,state}),7.92);state.hp=3500;assert.equal(effectDuration(inv,{setup,state}),21.12);
 assert.equal(effectDuration({...inv,evolution:true},{setup,state:{...state,evolutionDuration:1.2}}),25.344);
});
test('scenario ending bonuses use the pinned public simulator threshold-fulfilled multipliers',()=>{
 for(const id of ['210301','210321','210341','210361','210371','210381','210391','210401']){
  const s=id==='210321'?{...setup,course:data.courses['10903']}:setup;
  const c=compileChartSkill(data.skills[id],s);assert.notEqual(c.status,'unsupported',id);assert.ok(Array.from({length:32},(_,sample)=>run([data.skills[id]],s,sample).finishTime<run([],s,sample).finishTime).some(Boolean),id);
 }
 for(const id of ['210391','210401'])assert.ok(compileChartSkill(data.skills[id],setup).calculationNotes.some(n=>n.includes('1.2')));
});
test('repeating alternatives share their cooldown and cannot double-activate in one frame',()=>{
 const repeated=skill('repeat',[['target_speed',1000]],[[{field:'phase',operator:'==',value:1}]],{cooldown_raw:50000});
 repeated.invocations.push({...repeated.invocations[0],index:2});
 const events=run([repeated]).events;assert.ok(events.length>1);assert.ok(events.every(e=>e.index===1));
 for(let i=1;i<events.length;i++)assert.ok(events[i].t-events[i-1].t>11);
});
test('a repeated random trigger has one cached ten-metre chance and corner draws allow replacement',()=>{
 const repeated=skill('repeat-random',[['target_speed',1000]],[[{field:'phase_random',operator:'==',value:1}]],{cooldown_raw:50000});assert.equal(run([repeated]).events.length,1);
 const corner=skill('corners',[['target_speed',1000]],[[{field:'all_corner_random',operator:'==',value:1}]],{cooldown_raw:300000});
 const c=compileChartSkill(corner,setup);let duplicate=0;for(let sample=0;sample<64;sample++){
  const windows=branchSampler(setup,[],sample)(c.invocations[0].condition,corner.id,c.invocations[0],false)[0]?.windows||[];
  assert.equal(windows.length,2);const areas=windows.map(([at])=>setup.course.corners.findIndex(k=>at>=k.start&&at<k.start+k.length));duplicate+=Number(areas[0]===areas[1]);
 }
 assert.ok(duplicate>0&&duplicate<64);
});
test('forced rare activation uses the selected pack and cooldown, while unique replay deliberately fires again',()=>{
 const trigger=skill('trigger',[['invoke_rare',10000]],[[{field:'remain_distance',operator:'<',value:800}]]);
 const target=skill('target',[['target_speed',3500]],[[{field:'remain_distance',operator:'<',value:100}]]);
 const result=run([trigger,target]);const event=result.events.find(e=>e.id==='target');assert.ok(event.forced);assert.ok(event.x<1500);assert.equal(result.events.filter(e=>e.id==='target').length,1);
 const unique={...target,id:'unique',rarity:'unique',invocations:[{...target.invocations[0],condition:[[{field:'phase',operator:'==',value:1}]]}]};
 const replay=skill('replay',[['invoke_unique',10000]],[[{field:'phase',operator:'==',value:3}]]);
 const events=run([unique,replay]).events.filter(e=>e.id==='unique');assert.equal(events.length,2);assert.ok(events[1].forced);
});
test('all29 evolutions of the12 newly proven rare bases share their actual lower purchase chain and entered discounts',()=>{
 const bases=Object.entries(data.purchase_stages).filter(([,s])=>s.evidence==='umatools_relation_and_increment_umasim_evolution_total').map(([id])=>id);
 assert.equal(bases.length,12);const rules=data.evolution_rules.filter(r=>bases.includes(r.base_id));assert.equal(rules.length,29);
 for(const rule of rules){
  const lower=data.purchase_stages[rule.base_id].prerequisite_id,rows=[rule.evolved_id,rule.base_id,lower].map(id=>({...data.skills[id],evolutionBaseId:id===rule.evolved_id?rule.base_id:null}));
  const model=new RecordedPurchaseModel(data,rows,{[lower]:'5',[rule.base_id]:'2'}),price=model.selection([rule.evolved_id]);assert.ok(price.complete);assert.equal(price.stages.length,2);
  assert.equal(price.used,Math.floor(data.purchase_stages[lower].base_cost*.6)+Math.floor(data.purchase_stages[rule.base_id].base_cost*.8));
  assert.equal(new RecordedPurchaseModel(data,rows,{[rule.base_id]:'owned'}).selection([rule.evolved_id]).used,0);
 }
});
test('previously excluded self-strengthening evolutions are real chart and final recommendation candidates',async()=>{
 const id='101401111',rule=data.evolution_rules.find(r=>r.evolved_id===id);
 const task=prepareChart(data,profiles,{skills:{}},{...input,outfitId:rule.owner_id},{samples:1,dt:.05});assert.ok(task.rows.some(r=>r.id===id));
 const ids=[id,rule.base_id,data.purchase_stages[rule.base_id].prerequisite_id],rows=task.rows.filter(r=>ids.includes(r.id));
 const chart={setup:task.setup,modelVersion:task.modelVersion,nativeIds:task.nativeIds,rows},result=await recommendFinalPlan(data,chart,{[id]:'5',[rule.base_id]:'5'},{stats:task.setup.stats,spBudget:1000},{samples:1,dt:.05,searchSamples:1,searchDt:.05});
 assert.ok(result.evolutions.outfit.some(p=>p.id===id));assert.ok(result.purchases.some(p=>p.id===rule.base_id));assert.equal(result.effectPolicy,'self-performance-only');assert.ok(result.budget.used>0);assert.ok(result.budget.used<=1000);
});
