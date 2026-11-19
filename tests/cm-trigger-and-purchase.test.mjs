import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileChartSkill,prepareChart} from '../assets/cm-chart.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {dependencyPacks} from '../assets/skill-dependencies.mjs';
import {createPlanSignature} from '../assets/cm-plan-compression.mjs';
import {RecordedPurchaseModel,recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {createAcquisitionConstraints} from '../assets/acquisition-constraints.mjs';
import {bulkAcquisition} from '../assets/cm-state.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const data=read(read('data/manifest.json').dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const task=(courseId,extras={})=>prepareChart(data,profiles,{},{
 outfitId:'102201',scenarioId:'15',style:2,courseId,supportIds:[],...extras
},{samples:4,dt:.05});
const actual={stats:{speed:2280,stamina:1850,power:1729,guts:1480,wisdom:1748},spBudget:120};
const quick={searchSamples:2,searchDt:.05,samples:4,dt:.05,diagnostics:false};
const pick=(chart,ids)=>({...chart,rows:ids.map(id=>{
 const row=chart.rows.find(r=>r.id===id);assert.ok(row,id);return row;
}),evolutionOptions:[]});
function trigger(id,percentage,kind){
 return {id,activation_raw:0,rarity:'white',name_jp:id,invocations:[{index:1,precondition:[],
  condition:[[{field:'distance_rate',operator:'>=',value:percentage}]],duration_raw:10000,
  duration_unit:'umatools_base_time',effects:[{kind,value_raw:100,unit:'umatools_raw',extras_raw:{}}]}]};
}
function race(setup,skills,options={}){
 return simulateSolo(setup,skills.map(skill=>compileChartSkill(skill,setup)),.5,{dt:.05,keepTrace:false,...options}).events;
}

test('Joy requires an actual positive heal in the early middle phase to unlock its later effect',async()=>{
 const id='910771',chart=task('10808',{raceContext:{conditions:{is_activate_heal_skill:1},rankTimeline:[{distance:0,rank:3}]}}),joy=data.skills[id];
 const evaluate=(source,options)=>race(chart.setup,[joy,...source],options).filter(e=>e.id===id);
 assert.deepEqual(evaluate([]),[]);assert.deepEqual(evaluate([trigger('early',5,'heal')]),[]);
 assert.deepEqual(evaluate([trigger('speed',25,'target_speed')]),[]);
 assert.deepEqual(evaluate([trigger('miss',25,'heal')],{failHeals:true}),[]);
 const healed=evaluate([trigger('heal',25,'heal')]);assert.ok(healed.length>0);assert.ok(healed[0].x>=chart.setup.course.distance*.45);
 const row=chart.rows.find(r=>r.id===id),score=chart.evaluate(row);assert.equal(score.activationRate,0);assert.equal(score.gain,0);
 const plan=await recommendFinalPlan(data,pick(chart,[id]),{[id]:'5'},actual,quick);
 assert.equal(plan.budget.used,0);assert.equal(plan.gain,0);
});

test('both 二段構え stages need a distinct preceding frame event within their own phase',()=>{
 const id='202832',chart=task('10406',{raceContext:{conditions:{is_activate_any_skill:1}}}),skill=data.skills[id];
 const evaluate=sources=>race(chart.setup,[skill,...sources]);
 assert.deepEqual(evaluate([]),[]);
 const middle=trigger('z-middle',30,'target_speed'),late=trigger('a-late',75,'target_speed');
 assert.deepEqual(evaluate([late]).filter(e=>e.id===id),[]);
 assert.deepEqual(evaluate([middle]).filter(e=>e.id===id).map(e=>e.index),[1]);
 const events=evaluate([middle,late]),stages=events.filter(e=>e.id===id);
 assert.deepEqual(stages.map(e=>e.index),[1,2]);
 for(const [i,source]of [middle,late].entries())assert.ok(Math.abs(stages[i].t-events.find(e=>e.id===source.id).t-.05)<1e-8);
});

test('Gold City rare rewards are exclusive and paid 先行直線○ survives bulk Lv5',async()=>{
 const chart=task('10602',{season:2,supportIds:['30153']}),gold=['200184','202671'],constraints=createAcquisitionConstraints(data,chart.setup);
 for(const id of gold)assert.ok(constraints.allowed([id]));
 assert.equal(constraints.allowed(gold),false);
 // An independent outfit reward can cover one side of the same card's choice.
 assert.ok(createAcquisitionConstraints(data,{...chart.setup,outfitId:'108201'}).allowed(gold));
 const sameSet=createAcquisitionConstraints(data,{...chart.setup,supportIds:['30242']});
 assert.ok(sameSet.allowed(['202701','203431']));
 await assert.rejects(()=>recommendFinalPlan(data,pick(chart,gold),Object.fromEntries(gold.map(id=>[id,'5'])),{...actual,spBudget:900},quick),{code:'ACQUISITION_CONFLICT'});
 const lower='201312',upper='201311',rows=pick(chart,[lower,upper]).rows,states=bulkAcquisition(rows,{[lower]:'owned'},'5');
 const cost=new RecordedPurchaseModel(data,rows,states).selection([upper]);
 assert.equal(states[lower],'owned');assert.equal(cost.used,84);assert.deepEqual(cost.stages.map(s=>s.id),[upper]);
});

test('bounded search keeps timed helpers available for both previous-frame dependencies',()=>{
 for(const [course,id,kind]of [['10808','910771','heal'],['10406','202832','target_speed']]){
  const chart=task(course),skills=[data.skills[id],trigger('required',5,kind),trigger('early',10,kind),trigger('middle',25,kind)];
  const compiled=new Map(skills.map(skill=>[skill.id,compileChartSkill(skill,chart.setup)]));
  const candidates=[id,'early','middle'].map(id=>({id}));
  const packs=dependencyPacks(compiled,candidates,['required'],{selection:()=>({used:1})},chart.setup.course.distance);
  for(const helper of ['early','middle'])assert.ok(packs.some(pack=>pack.length===2&&pack.includes(id)&&pack.includes(helper)));
  const signature=createPlanSignature(compiled,new Map(),chart.setup.course.distance,{scope:'complete-plan-profile'});
  assert.notEqual(signature([id,'early']),signature([id,'middle']));
 }
});
