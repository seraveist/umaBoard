// Small release audit. Prices and stage replacements below are independent test
// inputs. Only trajectory scoring is shared with the production optimizer.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareChart,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {createFinalSetup,recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {buildPhysics} from '../assets/physics.mjs';

const read=file=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const prepare=input=>prepareChart(data,profiles,{}, {outfitId:'102201',scenarioId:'15',style:2,supportIds:[],...input});
const round=value=>Number(value.toFixed(6));

function chartAudit(){
 const results=[];
 for(const [courseId,id] of [['10808','201342'],['10606','202711'],['11703','202711']]){
  for(const rank of [null,3]){
   const task=prepare({courseId,supportIds:['30161'],raceContext:rank?{rankTimeline:[{distance:0,rank}]}:{}});
   const row=task.evaluate(task.rows.find(row=>row.id===id));
   assert.equal(row.samples,144);
   assert.equal(row.gain>0,courseId!=='11703');
   results.push({courseId,id,rank,gain:round(row.gain),activation:round(row.activationRate),usefulAcceleration:round(row.usefulAccelerationRate)});
  }
 }
 const task=prepare({courseId:'10510',style:3});
 const hp=[];
 for(const stamina of [400,600,1000]){
  const setup={...task.setup,stats:{...task.setup.stats,stamina}};
  const physics=buildPhysics(setup);
  const run=simulateSolo(setup,[],.5,{dt:.01,diagnostics:true,keepTrace:false,fullSpurt:true});
  const entry=run.diagnostics.frames.find(f=>f.phase===2);
  const expected=Math.max(0,(setup.course.distance-entry.x-60)*physics.consumption(physics.spurt,2)/physics.spurt-entry.hp);
  assert.ok(Math.abs(run.entryHpShortfall-expected)<1e-8);
  assert.equal(run.hpShortfall,Math.max(run.entryHpShortfall,run.peakHpDebt));
  hp.push({stamina,entryDeficit:round(expected),peakDebt:round(run.peakHpDebt),finishHp:round(run.hpRemaining),feasible:run.fullSpeedFeasible});
 }
 assert.ok(hp[0].entryDeficit>hp[1].entryDeficit&&hp[1].entryDeficit>0&&hp[2].feasible);
 return {results,hp};
}

const mediumInput={style:3,going:3,weather:3,season:4,time:2,samplingSeed:47};
const mediumStates={'201382':'owned','201381':'3','201392':'2','200512':'1','200352':'5','201571':'3'};
const mediumCosts={'201381':92,'201392':98,'200512':146,'200352':95,'201571':105};
const mediumStats={speed:2250,stamina:1760,power:1680,guts:1310,wisdom:1550};
const aptitude={distance:'S',surface:'A',style:'A'};
const cases={
 niigata:{input:{...mediumInput,courseId:'10306'},states:mediumStates,costs:mediumCosts,replacement:['201382','201381'],stats:mediumStats,discount:'studious',budgets:[220,370]},
 nakayama:{input:{...mediumInput,courseId:'10510'},states:mediumStates,costs:mediumCosts,replacement:['201382','201381'],stats:{...mediumStats,stamina:475},discount:'studious',budgets:[220,370]},
 kyoto:{input:{scenarioId:'12',courseId:'10807',supportIds:['30161'],going:1,weather:1,season:3,time:2},states:{'200362':'2','201102':'2','201112':'2','202711':'2','202712':'2'},costs:{'200362':136,'201102':80,'201112':80,'202711':288,'202712':144},replacement:['202712','202711'],stats:{speed:2100,stamina:2000,power:1700,guts:1400,wisdom:1500},discount:'none',budgets:[500],fullSpurtMode:'off'}
};
const priority=(a,b)=>Number(b.feasible)-Number(a.feasible)||(!a.feasible?(b.success-a.success||a.shortfall-b.shortfall):0)||
 Number(b.safe)-Number(a.safe)||(!a.safe?a.delay-b.delay:0);
const strict=(a,b)=>priority(a,b)||b.gain-a.gain||a.tail-b.tail||a.cost-b.cost||a.ids.join().localeCompare(b.ids.join());

const modes=[['strict',{gainTolerance:0}],['default',{}],['bounded',{exactPlanLimit:0}]];

async function planAudit(fixture,checks=modes){
 const {input,states,costs,replacement:[lower,upper]=[],stats,discount,budgets}=fixture;
 const task=prepare(input),rows=Object.keys(states).map(id=>{const row=task.rows.find(r=>r.id===id);assert.ok(row,id);return row;});
 const chart={setup:{...task.setup,fullSpurtMode:fixture.fullSpurtMode??task.setup.fullSpurtMode},modelVersion:task.modelVersion,nativeIds:task.nativeIds,rows,evolutionOptions:[]};
 const actual={stats,aptitudes:aptitude,discountTrait:discount,spBudget:Math.max(...budgets)};
 const setup=createFinalSetup(chart,actual),owned=Object.keys(states).filter(id=>states[id]==='owned');
 setup.ownedSkillIds=owned;setup.possessionGraph=upper?{[upper]:[lower]}:{};
 const base=[...task.nativeIds,...owned],choices=Object.keys(costs);
 const compiled=new Map([...new Set([...base,...choices])].map(id=>[id,compileChartSkill(data.skills[id],setup)]));
 const evaluator=new RaceEvaluator(setup,compiled,base,task.nativeIds,branchSampler);
 const scores=[];
 for(let mask=0;mask<2**choices.length;mask++){
  const selected=choices.filter((_,i)=>mask&(1<<i));
  if(selected.includes(upper)&&selected.includes(lower))continue;
  const cost=selected.reduce((sum,id)=>sum+costs[id],0);
  if(cost>actual.spBudget)continue;
  const ids=[...base.filter(id=>id!==lower||!selected.includes(upper)),...selected].sort();
  const score=evaluator.evaluate(ids,144,.01);
  scores.push({ids,cost,gain:score.gain,feasible:score.feasible,success:score.hpSuccessRate,shortfall:score.hpShortfall,safe:score.performance.risk.withinLimit,delay:score.performance.risk.tailDelay,tail:score.performance.tailFinishTime});
 }
 const results=[],seedChecks=[];
 for(const spBudget of budgets){
  const legal=scores.filter(row=>row.cost<=spBudget).sort(strict),anchor=legal[0];
  const cheap=legal.filter(row=>priority(row,anchor)===0&&row.gain>=anchor.gain-.1-1e-12).sort((a,b)=>a.cost-b.cost||strict(a,b))[0];
  if(cheap.cost<anchor.cost){
   const seed=193,alternate={...setup,samplingSeed:seed};
   const heldOut=new RaceEvaluator(alternate,compiled,base,task.nativeIds,branchSampler);
   const a=heldOut.evaluate(anchor.ids,144,.01),b=heldOut.evaluate(cheap.ids,144,.01);
   seedChecks.push({spBudget,seed,signedLoss:round(a.gain-b.gain),anchorHp:round(a.hpSuccessRate),cheaperHp:round(b.hpSuccessRate),anchorShortfall:round(a.hpShortfall),cheaperShortfall:round(b.hpShortfall),anchorTailGuard:a.performance.risk.withinLimit,cheaperTailGuard:b.performance.risk.withinLimit});
  }
  for(const [mode,options] of checks){
   const plan=await recommendFinalPlan(data,chart,states,{...actual,spBudget},{diagnostics:false,...options});
   const expect=mode==='strict'?anchor:cheap;
   assert.deepEqual([...plan.activeIds].sort(),expect.ids,mode+' '+spBudget);
   assert.equal(plan.budget.used,expect.cost);assert.equal(plan.purchases.reduce((sum,p)=>sum+p.cost,0),expect.cost);
   assert.ok(Math.abs(plan.gain-expect.gain)<1e-10&&Math.abs(plan.hpShortfall-expect.shortfall)<1e-10);
   if(legal.length<=16&&mode!=='bounded')assert.ok(plan.search.allAffordablePlansMeasured);
   results.push({spBudget,mode,affordable:legal.length,measured:plan.search.approximation.fullyEvaluatedPlans,ids:expect.ids,cost:expect.cost,gain:round(expect.gain),hpSuccess:round(expect.success),shortfall:round(expect.shortfall),tailGuard:expect.safe,loss:round(anchor.gain-expect.gain),savedSp:anchor.cost-expect.cost});
  }
 }
 return {input,stats,states,stageCosts:costs,results,seedChecks};
}
const name=process.argv[2];
let output;
if(name==='distance'){
 output=[];
 for(const [courseId,stamina] of [['10501',1100],['10602',1100],['10811',1050]]){
  output.push(await planAudit({input:{courseId,samplingSeed:141},states:{'201312':'2','200352':'2'},costs:{'201312':104,'200352':136},stats:{...mediumStats,stamina},discount:'none',budgets:[140]},[['default',{}]]));
 }
}else if(name==='chart')output=chartAudit();
else if(Object.hasOwn(cases,name))output=await planAudit(cases[name]);
else throw new Error('Choose chart, niigata, nakayama, kyoto or distance.');
console.log(JSON.stringify(output,null,2));
