import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileChartSkill,prepareChart,branchSampler} from '../assets/cm-chart.mjs';
import {chartScenarioSummary,marginalSummary} from '../assets/cm-model-presentation.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
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

const trace=(...points)=>points.map(([distance,rank])=>({distance,rank}));
test('real JP rank skills change chart contribution and the 120 SP decision on the same paired scenarios',async()=>{
 const cases=[
  {id:'900011',course:'10306',yes:trace([0,6],[1600,5]),no:trace([0,5]),cost:120},
  {id:'911041',course:'10306',yes:trace([0,2]),no:trace([0,2],[300,7],[600,2]),cost:120},
  {id:'200472',course:'10510',yes:trace([0,5],[900,6]),no:trace([0,6],[120,5]),cost:102}
 ];
 for(const c of cases){
  const scenarios=[{id:'eligible',weight:1,context:{rankTimeline:c.yes}},{id:'ineligible',weight:1,context:{rankTimeline:c.no}}];
  const chart=task(c.course,{style:3,raceContext:{scenarios}}),row=chart.rows.find(r=>r.id===c.id);
  const scored=chart.evaluate(row),[yes,no]=scored.scenarios;
  assert.ok(yes.activations>0,c.id);assert.equal(no.activations,0,c.id);
  assert.match(chartScenarioSummary(scored),/발동 관측 전개 1\/2개.*미발동 표본 평균/);
  if(c.id!=='200472'){assert.ok(yes.gain>.1,c.id);assert.equal(no.gain,0,c.id);}
  const stats=c.id==='200472'?{...actual.stats,stamina:900}:actual.stats;
  const plan=await recommendFinalPlan(data,pick(chart,[c.id]),{[c.id]:'5'},{...actual,stats},quick);
  assert.equal(plan.budget.used,c.cost,c.id);
  assert.deepEqual(plan.scenarioAlternatives.map(s=>[s.scenario,s.cost,s.removed]),[['ineligible',0,[c.id]]]);
  if(c.id==='200472')assert.ok(plan.scenarios[0].hpSuccessRate>plan.scenarios[1].hpSuccessRate);
 }
});
test('All-in!! bypasses popularity on its eligible tracks and keeps its ordinary stat bonus elsewhere',()=>{
 const native='100491',allIn='104901311';
 for(const [course,inside] of [['10906',true],['11203',true],['10306',false]]){
  for(const popularity of [1,4]){
   const corner=data.courses[course].corners.at(-1);
   const chart=task(course,{outfitId:'104901',style:3,raceContext:{popularity,rankTimeline:trace([0,5],[corner.start+1,4])}});
   const setup={...chart.setup,raceContext:{...chart.setup.raceContext,coherentRanks:true}};
   const compiled=[native,allIn].map(id=>compileChartSkill(data.skills[id],setup));
   const run=simulateSolo(setup,compiled,.5,{dt:.05,keepTrace:false,branchSampler:branchSampler(setup,[native],0)});
   assert.equal(run.passive.speed,60);assert.equal(run.passive.power,60);
   assert.equal(run.events.find(e=>e.id===allIn).index,inside?1:2);
   assert.equal(run.events.find(e=>e.id===native).index,inside||popularity>=4?1:2);
  }
 }
 const chart=task('10906',{outfitId:'104901',style:3,raceContext:{rankTimeline:trace([0,5],[1630,4])}});
 const ids=[native,allIn],compiled=new Map(ids.map(id=>[id,compileChartSkill(data.skills[id],chart.setup)]));
 const evaluator=new RaceEvaluator(chart.setup,compiled,[native],[native],branchSampler);
 const marginal=evaluator.marginal(ids,allIn,12,.05);
 assert.deepEqual(marginal.popularityResults.map(b=>[b.first,b.last]),[[1,3],[4,9]]);
 assert.match(marginalSummary({marginalContributions:{[allIn]:marginal}},allIn),/인기 1~3위.*인기 4~9위/);
 const packs=dependencyPacks(compiled,[{id:allIn}],[native],{selection:()=>({used:0})},2200);
 assert.ok(packs.some(pack=>pack.includes(native)&&pack.includes(allIn)));

});
