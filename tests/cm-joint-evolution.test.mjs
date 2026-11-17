import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {generateChart,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {recommendFinalPlan,RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';
import {bulkAcquisition} from '../assets/cm-state.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {EventConstraints} from '../assets/cm-event-constraints.mjs';
import {possibleInContext} from '../assets/candidates.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const input={outfitId:'101301',bloom:5,uniqueLevel:6,style:2,courseId:'10808',going:1,weather:2,season:3,time:2,scenarioId:'15',supportIds:['30275','30311','30300','30322','30289','30323']};

test('rare-only chart keeps every hidden evolution and jointly spends the real 7000-SP Lv5 budget',async()=>{
 const chart=await generateChart(data,profiles,display,input);
 assert.ok(chart.rows.every(row=>row.rarity!=='evolution'));
 assert.ok(chart.evolutionOptions.length>=4);
 for(const option of chart.evolutionOptions)assert.ok(chart.rows.some(row=>row.id===option.evolutionBaseId));
 const states=bulkAcquisition(chart.rows,{},'5'),actual={stats:profiles.profiles['15'].stats,spBudget:7000,discountTrait:'none',aptitudes:{distance:'A',surface:'A',style:'S'}};
 const plan=await recommendFinalPlan(data,chart,states,actual);
 assert.ok(plan.budget.used>=6800&&plan.budget.used<=7000,JSON.stringify(plan.budget));
 assert.ok(plan.gain>0);assert.notEqual(new EventConstraints(data,plan.setup).selection(plan.activeIds),null);assert.ok(plan.fullSpeedFeasible);assert.ok(plan.search.closureComplete||plan.search.refinementLimited);assert.ok(plan.search.refinementEvaluations<=256);
 assert.equal(plan.purchases.reduce((sum,row)=>sum+row.cost,0),plan.budget.used);
 assert.ok(plan.purchases.every(row=>row.rarity!=='evolution'));
 assert.equal(plan.evolutions.scenario.length,2);
 assert.deepEqual(plan.finalSkills.map(row=>row.id),plan.activeIds);
 const stages=new RecordedPurchaseModel(data,[...chart.rows,...chart.evolutionOptions],states,actual).selection(plan.activeIds);
 assert.equal(stages.used,plan.budget.used);assert.equal(stages.stages.length,new Set(stages.stages.map(row=>row.id)).size);
 for(const row of [...plan.evolutions.outfit,...plan.evolutions.scenario]){
  assert.ok(plan.purchases.some(p=>p.id===row.baseId));assert.ok(!plan.activeIds.includes(row.baseId));assert.equal(row.additionalSp,0);
 }
 mkdirSync(new URL('../.cache/',import.meta.url),{recursive:true});
 writeFileSync(new URL('../.cache/cm-7000-validation.json',import.meta.url),JSON.stringify({dataVersion:manifest.active_version,input,actual,chartRows:chart.rows.length,inheritedTopIds:chart.inheritedTopIds,evolutionOptions:chart.evolutionOptions.map(row=>row.id),...plan},null,2));
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
