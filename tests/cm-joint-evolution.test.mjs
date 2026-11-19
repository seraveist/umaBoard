import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {generateChart,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {recommendFinalPlan,RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';
import {bulkAcquisition} from '../assets/cm-state.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {possibleInContext} from '../assets/candidates.mjs';
import {acquisitionEventGroups,createAcquisitionConstraints} from '../assets/acquisition-constraints.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {comparePlanPriorities} from '../assets/cm-plan-compression.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const input={outfitId:'101301',bloom:5,uniqueLevel:6,style:2,courseId:'10808',going:1,weather:2,season:3,time:2,scenarioId:'15',supportIds:['30275','30311','30300','30322','30289','30323']};

test('rare-only chart jointly spends a 7000-SP budget with consistent reviewed event choices',async()=>{
 const chart=await generateChart(data,profiles,display,input);
 assert.ok(chart.rows.every(row=>row.rarity!=='evolution'));
 assert.ok(chart.evolutionOptions.length>=4);
 for(const option of chart.evolutionOptions)assert.ok(chart.rows.some(row=>row.id===option.evolutionBaseId));
 // Replay the same six inherited hints even when a chart revision changes Top 10.
 const witness=read('docs/validation/cm-v10-search-witness-20261118.json');
 const recordedInheritance=witness.activeIds.filter(id=>data.skills[id].inherited).map(id=>{
  const row=chart.inheritanceOptions.find(row=>row.id===id);assert.ok(row,id);return row;
 });
 assert.equal(recordedInheritance.length,6);
 const states=bulkAcquisition([...chart.rows.filter(row=>!row.inherited),...recordedInheritance],{},'5'),acquisitionChoices=Object.fromEntries(acquisitionEventGroups(data,chart.setup).map(event=>[event.key,event.choices[0].id]));
 const constraints=createAcquisitionConstraints(data,{...chart.setup,acquisitionChoices});
 // A deterministic benchmark assumption, not an actual player's hint dump.
 // Ordinary hints remain hypothetical Lv5; reviewed gold rewards follow the
 // declared choices, while unknown routes stay visible as evidence gaps.
 for(const row of chart.rows)if(row.rarity==='gold'&&!constraints.allowed([row.id]))states[row.id]='unavailable';
 const actual={stats:profiles.profiles['15'].stats,spBudget:7000,discountTrait:'none',aptitudes:{distance:'A',surface:'A',style:'S'},acquisitionChoices};
 const previous=read('docs/validation/cm-optimization-v1-tolerance-large-20261118.json').current;
 const plan=await recommendFinalPlan(data,chart,states,{...actual,maintainStrategicSkills:false,previousPlanIds:previous.ids},{onProgress:p=>{if(p.completed===p.total)console.info(`CM7000 ${p.stage}`);}});
 console.info('CM7000 result',JSON.stringify({cost:plan.budget.used,gain:plan.gain,hp:plan.hpSuccesses,samples:plan.sampling.count,loss:plan.search.approximation.knownMeanLoss,previousPlanCompared:plan.search.previousPlanCompared}));
 assert.ok(plan.budget.used>0&&plan.budget.used<=7000,JSON.stringify(plan.budget));
 assert.ok(plan.gain>0,`gain=${plan.gain}`);assert.ok(plan.sampling.count>=128);assert.ok(plan.hpSuccessRate>=0&&plan.hpSuccessRate<=1);
 assert.equal(plan.search.closureComplete,false);assert.equal(plan.search.approximation.gainTolerance,.1);assert.ok(plan.search.approximation.knownMeanLoss<=.1+1e-10);
 assert.equal(plan.acquisitionValidation.feasible,true);assert.ok(constraints.allowed(plan.activeIds));
 assert.equal(plan.purchases.reduce((sum,row)=>sum+row.cost,0),plan.budget.used);
 assert.ok(plan.purchases.every(row=>row.rarity!=='evolution'));
 assert.equal(plan.evolutions.scenario.length,2);
 assert.deepEqual(plan.finalSkills.map(row=>row.id),plan.activeIds);
 const stages=new RecordedPurchaseModel(data,[...chart.rows,...chart.evolutionOptions],states,actual).selection(plan.activeIds);
 assert.equal(stages.used,plan.budget.used);assert.equal(stages.stages.length,new Set(stages.stages.map(row=>row.id)).size);
 for(const row of [...plan.evolutions.outfit,...plan.evolutions.scenario]){
  assert.ok(plan.purchases.some(p=>p.id===row.baseId));assert.ok(!plan.activeIds.includes(row.baseId));assert.equal(row.additionalSp,0);
 }
 // An independently found legal plan exposed a coarse-search miss. Recompute
 // its result with the current engine, rather than fitting a gain constant.
 assert.deepEqual(witness.input,input);
 assert.equal(witness.dataVersion,read('docs/validation/cm-algorithm-v1-baseline-20261118.json').data.activeVersion);
 const {acquisitionChoices:oldChoices,...oldActual}=witness.actual;
 assert.deepEqual({...oldActual,acquisitionChoices},actual);
 for(const [event,choice]of Object.entries(oldChoices))assert.equal(acquisitionChoices[event],choice);
 const witnessPrice=new RecordedPurchaseModel(data,[...chart.rows,...chart.evolutionOptions,...chart.inheritanceOptions],states,actual).selection(witness.activeIds);
 assert.ok(witnessPrice.complete&&witnessPrice.used<=actual.spBudget);assert.ok(constraints.allowed(witness.activeIds));
 assert.ok(plan.search.previousPlanCompared);
 const required=[...plan.nativeIds,...plan.ownedIds],compiled=new Map([...new Set([...required,...witness.activeIds,...previous.ids])].map(id=>[id,compileChartSkill(data.skills[id],plan.setup)]));
 const evaluator=new RaceEvaluator(plan.setup,compiled,required,plan.nativeIds,branchSampler),alternative=evaluator.evaluate(witness.activeIds,144,.01),reference=evaluator.evaluate(previous.ids,144,.01);
 // Same search and objective as the v1.6.3 main release, including all nine encounter scenarios.
 assert.deepEqual(plan.activeIds,previous.ids);assert.equal(plan.budget.used,6948);
 const launchGains=[33.32078600452083,35.05915019419816,37.79836792066868,35.37822059708595,37.501898084109996,36.41911722310746,33.88992356294575,37.36449872340615,33.47756403887586];
 assert.deepEqual(plan.scenarios.map(s=>s.id),launchGains.map((_,i)=>'coverage-'+(i+1)));
 plan.scenarios.forEach((s,i)=>{assert.ok(Math.abs(s.gain-launchGains[i])<1e-9);assert.equal(s.hpSuccessRate,1);});
 assert.ok(Math.abs(reference.gain-35.57883626099098)<1e-9,'fixed-plan replay on the revision 6 and 6.1 matrix');
 const previousPrice=new RecordedPurchaseModel(data,[...chart.rows,...chart.evolutionOptions,...chart.inheritanceOptions],states,actual).selection(previous.ids);
 assert.ok(previousPrice.complete&&previousPrice.used<=actual.spBudget&&constraints.allowed(previous.ids));
 for(const [score,cost] of [[reference,previousPrice.used],[alternative,witnessPrice.used]]){
  const priority=comparePlanPriorities(plan,score);assert.ok(priority<=0);
  if(priority===0){
   assert.ok(score.gain-plan.gain<=.1+1e-10,`measured witness ${score.gain} vs selected ${plan.gain}`);
   if(plan.gain<score.gain)assert.ok(plan.budget.used<=cost,`selected ${plan.budget.used} SP / ${plan.gain}, reference ${cost} SP / ${score.gain}`);
  }
 }
 assert.equal(plan.search.finalValidationComplete,true);assert.equal(plan.search.precisionSeedCandidates,plan.candidateCount);assert.equal(plan.search.precisionSeedCount,2);assert.ok(plan.search.seedEvaluationSamples<=plan.sampling.count);assert.ok(plan.search.constructiveEvaluationSamples<plan.sampling.count);
 mkdirSync(new URL('../.cache/',import.meta.url),{recursive:true});
 writeFileSync(new URL('../.cache/cm-current-7000-validation.json',import.meta.url),JSON.stringify({dataVersion:manifest.active_version,input,actual,acquisition:states,acquisitionAssumption:'reviewed-first-event-choices; hypothetical-Lv5; partial-route-coverage-not-a-real-training-replay',chartRows:chart.rows.length,inheritedTopIds:chart.inheritedTopIds,evolutionOptions:chart.evolutionOptions.map(row=>row.id),...plan},null,2));
});

test('latest Daring Tact has seven sourced additions, a real 190+190 chain and three sequential unique invocations',async()=>{
 for(const id of ['100751','900751','107501211','107501221','204911','107501111','204912'])assert.ok(data.skills[id]?.jp_available,id);
 assert.equal(data.purchase_stages['204911'].base_cost,190);assert.equal(data.purchase_stages['204911'].prerequisite_id,'204912');
 const chart=await generateChart(data,profiles,display,{...input,outfitId:'107501',style:3,supportIds:[]},{samples:1,dt:.05});
 assert.ok(chart.nativeIds.includes('100751'));assert.equal(chart.evolutionOptions.filter(row=>row.evolutionBaseId==='203591').length,1); // medium branch only
 const compiled=compileChartSkill(data.skills['100751'],chart.setup);assert.equal(compiled.invocations.length,3);
 const run=simulateSolo(chart.setup,[compiled],.5,{dt:.01,fullSpurt:true,branchSampler:branchSampler(chart.setup,chart.nativeIds,0)});
 assert.deepEqual(run.events.filter(row=>row.id==='100751').map(row=>row.index),[1,2,3]);
 assert.ok(!possibleInContext(data.skills['100751'],{ground_type:2}));
});
