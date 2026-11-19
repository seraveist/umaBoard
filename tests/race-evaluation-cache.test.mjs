import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {compileChartSkill,branchSampler,createFinalBranchSampler} from '../assets/cm-chart.mjs';
import {ENCOUNTER_POLICY} from '../assets/race-scenarios.mjs';
const course={id:'cache',selectable:true,distance:1200,distance_type:1,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:1200}],slopes:[]};
const setup={course,stats:{speed:1600,stamina:3000,power:1500,guts:1200,wisdom:1000},style:2,going:1,mood:2,bloom:5,uniqueLevel:6,aptitudes:{distance:'A',surface:'A',style:'A'},encounterPolicy:ENCOUNTER_POLICY,raceContext:{},externalDomains:{}};
const raw=(id,kind,value)=>({id,name_jp:id,rarity:'white',inherited:false,activation_raw:10000,invocations:[{index:1,condition:[[{field:'remain_distance',operator:'<=',value:400}]],precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',effects:[{kind,source_type:kind,value_raw:value,unit:'umatools_raw',extras_raw:{}}]}]});
const skills=[raw('speed','target_speed',1500),raw('heal','heal',150)],compiled=s=>new Map(skills.map(skill=>[skill.id,compileChartSkill(skill,s)]));
const evaluator=(s=setup,limit=65536)=>new RaceEvaluator(s,compiled(s),[],[],branchSampler,{sampleCacheLimit:limit});

test('extending and shrinking stable prefixes exactly preserves all evaluation fields without replaying samples',()=>{
 const cached=evaluator(),fresh=evaluator(setup,0);let runs=0;
 const original=cached.run.bind(cached);cached.run=(...args)=>{if(!args[3])runs++;return original(...args);};
 for(const count of [18,36,18,72]){
  cached.runs.clear();fresh.runs.clear();
  assert.deepEqual(cached.evaluate(['speed','heal'],count,.02),fresh.evaluate(['speed','heal'],count,.02));
 }
 assert.equal(runs,72);assert.equal(cached.cachedSamples,72);assert.equal(cached.sampleCacheHits,72);
});

test('an HP-rejected prefix can later extend to a complete result without caching rejection as a score',()=>{
 const s={...setup,stats:{...setup.stats,stamina:1}},cached=evaluator(s),fresh=evaluator(s,0);
 assert.equal(cached.evaluate(['speed'],18,.02,{stopOnHpFailure:true}).hpRejected,true);
 assert.deepEqual(cached.evaluate(['speed'],36,.02),fresh.evaluate(['speed'],36,.02));
 assert.equal(cached.cachedSamples,36);assert.ok(cached.sampleCacheHits>0);
});

test('bounded prefix storage separates plan and time-step keys and recomputes evicted observations exactly',()=>{
 const cached=evaluator(setup,18),fresh=evaluator(setup,0);
 for(const [ids,dt]of [[['speed'],.02],[['heal'],.02],[['speed'],.01],[['speed'],.02]]){
  assert.deepEqual(cached.evaluate(ids,18,dt),fresh.evaluate(ids,18,dt));
  assert.ok(cached.cachedSamples<=18);assert.equal(cached.sampleCache.size,1);
 }
});

test('compact prefix observations preserve weighted scenario results and nonuniform activation rates',()=>{
 const s={...setup,raceContext:{scenarios:[{id:'one',weight:1,context:{}},{id:'two',weight:3,context:{}}]}},cached=evaluator(s),fresh=evaluator(s,0);
 cached.evaluate(['speed','heal'],8,.02);
 assert.deepEqual(cached.evaluate(['speed','heal'],64,.02),fresh.evaluate(['speed','heal'],64,.02));
 assert.ok(cached.sampleCacheHits>=8);assert.equal(cached.evaluate(['speed','heal'],64,.02).scenarioCoverage.complete,true);
});

test('shared activation draws and finish-line probes reproduce full trajectories for scores and marginal comparisons',()=>{
 const s={...setup,raceContext:{scenarios:[{id:'one',weight:1,context:{postNumber:1}},{id:'two',weight:3,context:{popularity:8}}]}};
 const skills=compiled(s),compact=new RaceEvaluator(s,skills,['speed'],[],createFinalBranchSampler(),{compactComparisons:true});
 const full=new RaceEvaluator(s,skills,['speed'],[],branchSampler);
 for(const [ids,count,dt] of [[[],4,.05],[['speed'],8,.02],[['heal','speed'],12,.02]]){
  assert.deepEqual(compact.evaluate(ids,count,dt,{scenarioPriorities:true}),full.evaluate(ids,count,dt,{scenarioPriorities:true}));
 }
 assert.deepEqual(compact.marginal(['speed','heal'],'speed',12,.02),full.marginal(['speed','heal'],'speed',12,.02));
 assert.equal(compact.runs.size,0);
});
