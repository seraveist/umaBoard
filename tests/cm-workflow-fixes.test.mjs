import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileChartSkill,createChartSetup,prepareChart} from '../assets/cm-chart.mjs';
import {recommendFinalPlan,RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';
import {recommendTargetAcceleration} from '../assets/cm-acceleration-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {branchSampler} from '../assets/cm-chart.mjs';
import {strategyGoals,strategySkillIds} from '../assets/cm-strategy.mjs';
import {bulkAcquisition,retainedInheritanceCandidates} from '../assets/cm-state.mjs';
import {simulateSolo} from '../assets/solo.mjs';

const atom=(field,operator,value)=>({field,operator,value});
const quick={searchSamples:2,searchDt:.05,samples:4,dt:.02};
const stats={speed:1500,stamina:2000,power:1500,guts:1700,wisdom:1800};
const course={id:'c',selectable:true,distance:2200,distance_type:3,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:2200}],slopes:[]};
function skill(id,value=3000,{condition=[[atom('phase','==',3)]],rarity='white',kind='target_speed'}={}){
 return {id,name_jp:id,description_jp:id,rarity,inherited:false,parent_ids:[],jp_available:true,categories:[kind==='acceleration'?'acceleration':'speed'],invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',cooldown_raw:null,effects:[{kind,value_raw:value,unit:'umatools_raw',extras_raw:{}}]}]};
}
function fixture(list){
 const native=skill('native',0,{condition:[],rarity:'unique'});
 const data={skills:Object.fromEntries([native,...list].map(s=>[s.id,s])),outfits:{uma:{id:'uma',name_jp:'uma',base_stars:3}},supports:{},relations:[],evolution_rules:[],scenario_exclusive_groups:[],support_events:{},purchase_stages:Object.fromEntries(list.filter(s=>s.rarity!=='evolution').map(s=>[s.id,{status:'verified',base_cost:100}])),internal_acceleration_comparison_cost:{},acquisition_routes:[native,...list].map(s=>({skill_id:s.id,owner_type:'outfit',owner_id:'uma',kind:'self'}))};
 const chart={setup:{course,stats,aptitudes:{distance:'A',surface:'A',style:'A'},outfitId:'uma',scenarioId:'15',supportIds:[],style:2,bloom:5,uniqueLevel:6,mood:2,going:1,weather:1,season:3,time:2},nativeIds:['native'],rows:list.map(s=>({...s,name:s.name_jp})),evolutionOptions:[]};
 return {data,chart,input:{stats,aptitudes:chart.setup.aptitudes,spBudget:60,discountTrait:'none'}};
}
const pdm=()=>skill('201591',100,{condition:[[atom('accumulatetime','>=',5)]]});
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const actual=read(read('data/manifest.json').dataset_path),profiles=read('curated/cm-scenario-profiles.json');

test('real HP-gated gold and white heals wait for depletion instead of wasting healing at the start',()=>{
 const setup=createChartSetup(actual,profiles,{outfitId:'101301',scenarioId:'15',courseId:'10506',style:2,supportIds:[]});
 const baseline=simulateSolo(setup,[],.5,{dt:.01,fullSpurt:true,keepTrace:false});
 for(const id of ['200761','200762']){
  const c=compileChartSkill(actual.skills[id],setup),run=simulateSolo(setup,[c],.5,{dt:.01,fullSpurt:true,keepTrace:false});
  assert.ok(c.invocations.some(i=>i.condition.some(b=>b.dynamic.some(a=>a.field==='hp_per'))));
  assert.ok(run.events[0].t>100);assert.ok(run.hpRemaining>baseline.hpRemaining+50);
 }
});
test('final purchases use the same rank comparison and cannot score disjoint ranks as simultaneous triggers',async()=>{
 const {data,chart,input}=fixture([skill('front',3000,{condition:[[atom('phase','==',3),atom('order','<=',2)]]}),skill('rear',3000,{condition:[[atom('phase','==',3),atom('order','>=',5)]]})]);
 const plan=await recommendFinalPlan(data,chart,{front:'5',rear:'5'},{...input,spBudget:120},quick);
 const compiled=new Map(Object.values(data.skills).map(s=>[s.id,compileChartSkill(s,plan.setup)])),comparison=new RaceEvaluator(plan.setup,compiled,chart.nativeIds,chart.nativeIds,branchSampler);
 const score=comparison.evaluate(plan.activeIds,plan.sampling.count,quick.dt);
 assert.ok(Math.abs(plan.gain-score.gain)<1e-9);
 assert.deepEqual(plan.scenarios.map(s=>s.gain),score.scenarios.map(s=>s.gain));
 assert.ok(plan.scenarioCoverage.complete);
});
test('an available PDM skill survives a stronger numerical alternative and its protection can be disabled',async()=>{
 const {data,chart,input}=fixture([pdm(),skill('other',10000)]),states={'201591':'5',other:'5'},before=JSON.stringify(states);
 const protectedPlan=await recommendFinalPlan(data,chart,states,input,quick);
 assert.deepEqual(protectedPlan.maintainedStrategyIds,['201591']);assert.ok(protectedPlan.activeIds.includes('201591'));assert.ok(!protectedPlan.activeIds.includes('other'));
 const released=await recommendFinalPlan(data,chart,states,{...input,maintainStrategicSkills:false},quick);
 assert.ok(released.activeIds.includes('other'));assert.ok(!released.activeIds.includes('201591'));assert.equal(JSON.stringify(states),before);
});
test('PDM goals respect distance, surface and style instead of forcing the white on runners and short courses',()=>{
 const {data,chart}=fixture([pdm()]);assert.equal(strategyGoals(data,chart.setup).length,1);
 for(const setup of [{...chart.setup,style:1},{...chart.setup,course:{...course,distance:2000}},{...chart.setup,course:{...course,surface:2}}])assert.deepEqual(strategyGoals(data,setup),[]);
 assert.deepEqual(strategyGoals(data,{...chart.setup,style:4})[0].sources.length,4);
});
test('missing PDM is disclosed rather than invented, while an unaffordable protection requires an explicit release',async()=>{
 const {data,chart,input}=fixture([pdm(),skill('other',10000)]);
 const missing=await recommendFinalPlan(data,chart,{other:'5'},input,quick);
 assert.ok(!missing.activeIds.includes('201591'));assert.equal(missing.unavailableStrategyGoals[0].id,'pdm-release');
 await assert.rejects(recommendFinalPlan(data,chart,{'201591':'5'},{...input,spBudget:0},quick),/전략 핵심/);
 const released=await recommendFinalPlan(data,chart,{'201591':'5'},{...input,spBudget:0,maintainStrategicSkills:false},quick);assert.equal(released.budget.used,0);
});
test('an available gold supplies a purchasable PDM lower at Lv0 without fabricating a lower hint',async()=>{
 const gold=skill('201592',3500,{rarity:'gold',condition:[[atom('accumulatetime','>=',5)]]});
 const {data,chart,input}=fixture([pdm(),gold]);data.purchase_stages['201592'].prerequisite_id='201591';data.relations.push({kind:'version_family',from_id:'201591',to_id:'201592'});
 const states={'201591':'unavailable','201592':'5'},plan=await recommendFinalPlan(data,chart,states,{...input,spBudget:100},quick);
 assert.ok(plan.activeIds.includes('201591'));assert.equal(plan.budget.used,100);assert.equal(plan.purchases[0].hintLevel,0);assert.deepEqual(plan.inferredAvailableIds,['201591']);assert.equal(plan.acquisition['201591'],'unavailable');
});
test('a later-only evolution cannot erase the protected early PDM role',async()=>{
 const gold=skill('201592',3500,{rarity:'gold',condition:[[atom('accumulatetime','>=',5)]]}),late=skill('late',15000,{rarity:'evolution'});
 const {data,chart,input}=fixture([pdm(),gold,late]);data.purchase_stages['201592'].prerequisite_id='201591';data.evolution_rules.push({base_id:'201592',evolved_id:'late',owner_type:'outfit',owner_id:'uma'});
 chart.rows=chart.rows.filter(r=>r.id!=='late');chart.evolutionOptions=[{...late,name:late.name_jp,evolutionBaseId:'201592'}];
 const compiled=new Map(Object.values(data.skills).map(s=>[s.id,compileChartSkill(s,chart.setup)]));assert.ok(!strategySkillIds(strategyGoals(data,chart.setup)[0],compiled,chart.setup).includes('late'));
 const plan=await recommendFinalPlan(data,chart,{'201591':'5','201592':'5'},{...input,spBudget:1000},quick);
 assert.ok(!plan.activeIds.includes('late'));assert.ok(plan.maintainedStrategyIds.length);
 const released=await recommendFinalPlan(data,chart,{'201591':'5','201592':'5'},{...input,spBudget:1000,maintainStrategicSkills:false},quick);assert.ok(released.activeIds.includes('late'));
});
test('bulk hints preserve paid effects and their zero remaining cost through a second final recommendation',async()=>{
 const {data,chart,input}=fixture([pdm(),skill('other')]),states=bulkAcquisition(chart.rows,{'201591':'owned',other:'0'},'5');
 assert.equal(states['201591'],'owned');assert.equal(new RecordedPurchaseModel(data,chart.rows,states).selection(['201591']).used,0);
 const plan=await recommendFinalPlan(data,chart,states,{...input,spBudget:0},quick);
 assert.ok(plan.activeIds.includes('201591'));assert.equal(plan.budget.used,0);assert.equal(plan.gain,0);assert.deepEqual(plan.ownedIds,['201591']);
});
test('a new inheritance ranking preserves recorded skills outside Top10 and respects explicit alias removal',()=>{
 const rows=[{id:'other',inherited:true},{id:'91101411',inherited:true},{id:'ordinary',inherited:false}],shown=[];
 assert.deepEqual(retainedInheritanceCandidates(rows,shown,{other:'owned','901411':'5'}).map(r=>r.id),['other','91101411']);
 assert.deepEqual(retainedInheritanceCandidates(rows,shown,{'901411':'5','91101411':'unavailable'}),[]);
 assert.deepEqual(retainedInheritanceCandidates(rows,[rows[0]],{other:'owned'}),[]);
});
test('four scenario rare alternatives are recommended before training and actual hints constrain the final purchase',async()=>{
 const rare=Array.from({length:4},(_,i)=>skill('g'+i,1000+i*1000,{rarity:'gold'})),{data,chart,input}=fixture([skill('core',8000,{kind:'acceleration',condition:[[atom('phase','>=',2)]]}),...rare]);
 data.scenario_events={'15':{events:[{id:'choice',name_jp:'選択',choices:rare.map((s,i)=>({id:String(i+1),label:s.id,rewards:[{skill_id:s.id}]}))}]}};
 data.acquisition_routes=data.acquisition_routes.map(r=>r.skill_id.startsWith('g')?{...r,owner_type:'scenario',owner_id:'15',kind:'scenario_event',event_id:'choice'}:r);
 const target=await recommendTargetAcceleration(data,chart,quick);
 assert.equal(target.eventChoices.choice,'4');assert.equal(target.scenarioRewards.length,1);assert.deepEqual(target.scenarioRewards[0].ids,['g3']);assert.deepEqual(target.rewards,[]);
 const plan=await recommendFinalPlan(data,chart,{g1:'5'},{...input,spBudget:200},quick);assert.ok(plan.activeIds.includes('g1'));assert.ok(!plan.activeIds.includes('g3'));
});
test('the first-chart rank policy matches the target and final evaluator without an extra PDM score',()=>{
 const task=prepareChart(actual,profiles,{}, {outfitId:'101301',scenarioId:'15',courseId:'10808',style:2,supportIds:[]},{samples:4,dt:.02});
 const row=task.evaluate(task.rows.find(r=>r.id==='201591'));
 assert.deepEqual(row.strategicGoals,['pdm-release']);assert.ok(row.gain>0&&row.gain<2);assert.equal(row.scenarioCoverage.independentlyValidated,false);
});
test('actual Nakayama2500 records combine an HP-gated rare recovery with protected PDM under the recorded budget',async()=>{
 const task=prepareChart(actual,profiles,{}, {outfitId:'101301',scenarioId:'15',courseId:'10506',style:2,supportIds:['30275','30311','30023','30322','30289','30323']});
 const chart={setup:task.setup,nativeIds:task.nativeIds,rows:task.rows.filter(r=>['200761','200762','201591'].includes(r.id)),evolutionOptions:[]};
 assert.equal(chart.rows.length,3);
 const plan=await recommendFinalPlan(actual,chart,{'200761':'5','200762':'5','201591':'5'},{stats:chart.setup.stats,aptitudes:{distance:'S',surface:'A',style:'S'},spBudget:600},quick);
 assert.ok(plan.activeIds.includes('200761'));assert.ok(!plan.activeIds.includes('200762'));assert.ok(plan.activeIds.includes('201591'));
 assert.ok(plan.budget.used<=600);assert.ok(plan.scenarioCoverage.complete&&plan.scenarios.length===9);assert.deepEqual(plan.maintainedStrategyIds,['201591']);
});
