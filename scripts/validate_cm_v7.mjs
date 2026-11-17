import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createChartSetup,compileChartSkill,branchSampler,generateChart,sortChartRows,CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {recommendFinalPlan,RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';
import {bulkAcquisition} from '../assets/cm-state.mjs';
import {activationProbability} from '../assets/race-sampling.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const old=read('docs/validation/cm-v6-20261117.json'),oldInput=read('docs/validation/cm-7000-20261117.json'),evidence=read('docs/validation/cm-event-evidence-20261117.json'),contexts=read('docs/validation/cm-event-context-20261117.json');
assert.equal(manifest.active_version,old.dataVersion);assert.equal(CM_MODEL_VERSION,'cm-first-chart-v7');
const setupFor=(courseId,style,stats=evidence.stats,extra={})=>({...createChartSetup(data,profiles,{...oldInput.input,courseId,style,supportIds:[]}),stats,...extra});
function score(setup,ids,baseline=[],samples=288){
 const all=[...new Set([...ids,...baseline])],compiled=new Map(all.map(id=>[id,compileChartSkill(data.skills[id],setup)]));
 return new RaceEvaluator(setup,compiled,baseline,baseline.filter(id=>data.skills[id].rarity.startsWith('unique')),branchSampler).evaluate(ids,samples,.01);
}
const compact=s=>({gain:s.gain,robustGain:s.robustGain,activationRates:s.activationRates,usefulAccelerationRates:s.usefulAccelerationRates,hpSuccessRate:s.hpSuccessRate,scenarios:s.scenarios,scenarioCoverage:s.scenarioCoverage,sampling:s.sampling});
async function fixedAcquisition(){
 const chart=await generateChart(data,profiles,display,oldInput.input,{samples:9,dt:.05}),states=bulkAcquisition(chart.rows,{},'5');
 const rows=sortChartRows(chart.inheritanceOptions.filter(row=>old.recommendedPlan.inheritedTopIds.includes(row.id)),data,display),historicalInheritedIds=rows.slice(0,6).map(row=>row.id);
 assert.equal(historicalInheritedIds.length,6);
 for(const id of old.recommendedPlan.activeIds.filter(id=>data.skills[id].inherited))assert.ok(historicalInheritedIds.includes(id));
 for(const row of chart.inheritanceOptions)states[row.id]=historicalInheritedIds.includes(row.id)?'5':'unavailable';
 const plan=await recommendFinalPlan(data,chart,states,oldInput.actual,{diagnostics:false,onProgress:p=>{if(p.completed===p.total)console.log('Fixed-record stage:',p.stage);}});
 return {input:oldInput.input,actual:oldInput.actual,dataVersion:manifest.active_version,modelVersion:plan.modelVersion,historicalInheritedIds,budget:plan.budget,gain:plan.gain,robustGain:plan.robustGain,activeIds:plan.activeIds,search:plan.search,interpretation:'same-available-ordinary-list-and-six-recorded-historical-inheritance-IDs; v7-context-objective'};
}
if(process.argv.includes('--fixed-only')){const fixed=await fixedAcquisition();fs.writeFileSync(new URL('.cache/cm-v7-fixed-records.json',root),JSON.stringify(fixed,null,2));console.log(JSON.stringify({gain:fixed.gain,budget:fixed.budget}));process.exit(0);}
let result;
if(process.argv.includes('--reuse-context'))result=read('.cache/cm-v7-context.json');
else{
 result={validatedAt:'2026-11-18 Asia/Seoul',engineBaselineCommit:'909c2951f39b0954d802fe7873f1410b8f0bcb6e',modelVersion:CM_MODEL_VERSION,dataVersion:manifest.active_version,interpretation:'paired-counterfactual-context-comparison-not-observed-win-or-trigger-probability',pricing:[],eventCases:[],contextCases:[],accelerationFamily:[],lotteries:[]};
 for(const [base,strong]of [['901351','91101351'],['901411','91101411']])for(const discountTrait of ['none','studious','fast-learner'])for(let hint=0;hint<=5;hint++){
  const rows=[data.skills[base],data.skills[strong]],normal=new RecordedPurchaseModel(data,rows,{[base]:String(hint)},{discountTrait}).selection([base]);
  const enhanced=new RecordedPurchaseModel(data,rows,{[strong]:String(hint)},{discountTrait}).selection([strong]),paid=new RecordedPurchaseModel(data,rows,{[base]:'owned',[strong]:String(hint)},{discountTrait}).selection([strong]);
  assert.equal(enhanced.complete,true);assert.equal(enhanced.used,normal.used);assert.equal(paid.used,0);
  result.pricing.push({base,strong,hint,discountTrait,normalCost:normal.used,strongCost:enhanced.used,alreadyPaidCost:paid.used,paidStageIds:enhanced.stages.map(s=>s.id)});
 }
 for(const row of evidence.cases){
  const event=evidence.events[row.event],setup={...setupFor(event.courseId,row.style),season:event.season,weather:event.weather,going:event.going,time:event.time};
  const value=score(setup,[row.id],[],144),precise=score(setup,[row.id],[],288);
  assert.equal(value.scenarioCoverage.complete,true);
  result.eventCases.push({event:row.event,courseId:event.courseId,id:row.id,name:row.name,style:row.style,source:row.source,v6ConditionalGain:row.gain,...compact(precise),gain144:value.gain,difference144vs288:value.gain-precise.gain});
 }
 console.log('36 public-source cases reevaluated');
 for(const row of contexts.contextCases){
  const setup=setupFor('10808',row.style,contexts.stats),value=score(setup,[...new Set([...row.baseline,row.candidate])],row.baseline);
  result.contextCases.push({context:row.name,style:row.style,baseline:row.baseline,id:row.candidate,name:row.nameJp,v6ConditionalMarginal:row.gain,...compact(value)});
 }
 const family=Object.values(data.skills).filter(s=>s.jp_available&&s.invocations.some(i=>i.effects.some(e=>e.kind==='acceleration'&&e.value_raw>0)&&(i.condition||[]).flat().some(a=>a.field==='is_finalcorner'&&a.value===1)));
 for(const courseId of ['10604','10808','11203'])for(const raw of family){
  const style=[2,3,4,1].find(style=>compileChartSkill(raw,setupFor(courseId,style)).invocations.length)||2,setup=setupFor(courseId,style),value=score(setup,[raw.id],[],72);
  result.accelerationFamily.push({courseId,id:raw.id,name:raw.name_jp,style,gain:value.gain,robustGain:value.robustGain,activationRate:value.activationRates[raw.id],usefulAccelerationRate:value.usefulAccelerationRates[raw.id],samples:72});
 }
 result.accelerationFamilySize=family.length;
 for(const item of old.lotteries){
  const setup=setupFor('10604',2,profiles.profiles['15'].stats,{raceContext:{postNumber:item.postNumber,popularity:item.popularity}}),value=score(setup,[item.id],[],288),expected=item.lotteryProbability*activationProbability(data.skills[item.id],setup);
  assert.ok(Math.abs(value.activationRates[item.id]-expected)<.03);
  result.lotteries.push({...item,expectedRate:expected,activationRate:value.activationRates[item.id],mean:value.gain,samples:288});
 }
 fs.mkdirSync(new URL('.cache/',root),{recursive:true});fs.writeFileSync(new URL('.cache/cm-v7-context.json',root),JSON.stringify(result,null,2));
 console.log(JSON.stringify({contextCases:result.contextCases.length,family:family.length,eventMaxDifference:Math.max(...result.eventCases.map(r=>Math.abs(r.difference144vs288)))}));
}
if(process.argv.includes('--context-only'))process.exit(0);
let plan;
if(process.argv.includes('--reuse-plan')){
 plan=read('.cache/cm-7000-validation.json');assert.equal(plan.modelVersion,'cm-post-training-v7');assert.equal(plan.search.screeningSamples,plan.sampling.count);assert.deepEqual(plan.input,oldInput.input);assert.deepEqual(plan.actual,oldInput.actual);
}else{
 const chart=await generateChart(data,profiles,display,oldInput.input,{onProgress:p=>{if(p.completed===p.total)console.log('Chart completed');}}),states=bulkAcquisition(chart.rows,{},'5');
 plan=await recommendFinalPlan(data,chart,states,oldInput.actual,{onProgress:p=>{if(p.completed===p.total)console.log('Plan stage:',p.stage);}});
}
const extended=compact(score(plan.setup,plan.activeIds,[...plan.nativeIds,...plan.ownedIds],288));
const oldInNewContexts=compact(score({...plan.setup,ownedSkillIds:[]},old.recommendedPlan.activeIds,plan.nativeIds,288));
assert.ok(plan.budget.used<=oldInput.actual.spBudget);assert.equal(plan.purchases.reduce((s,r)=>s+r.cost,0),plan.budget.used);assert.equal(plan.search.closureComplete,true);assert.equal(plan.scenarioCoverage.complete,true);
assert.ok(Math.abs(extended.gain-plan.gain)<.15,'same plan 144/288 stability');
result.same7000={input:oldInput.input,actual:oldInput.actual,acquisitionPolicy:'same-whole-list-Lv5-first-six-inheritance-origins; Top10-is-recomputed-by-current-model',v6Historical:{gain:old.recommendedPlan.gain,budget:old.recommendedPlan.budget,activeIds:old.recommendedPlan.activeIds},v6SelectionInV7Contexts:oldInNewContexts,recommended:{...compact(plan),modelVersion:plan.modelVersion,budget:plan.budget,activeIds:plan.activeIds,candidateCount:plan.candidateCount,excluded:plan.excluded,search:plan.search,purchases:plan.purchases.map(r=>({id:r.id,name:r.name,cost:r.cost,transformation:r.transformation,stages:r.stages})),evolutions:plan.evolutions,marginalContributions:plan.marginalContributions,physicsSensitivity:plan.physicsSensitivity,validation288:extended}};
// Match acquisition exactly as well: retain the historical v6 inheritance
// choices, then let the current optimizer compete on that same recorded pool.
if(!process.argv.includes('--skip-fixed-acquisition')){
 const fixed=process.argv.includes('--reuse-fixed')?read('.cache/cm-v7-fixed-records.json'):await fixedAcquisition();
 assert.deepEqual(fixed.input,oldInput.input);assert.deepEqual(fixed.actual,oldInput.actual);assert.equal(fixed.dataVersion,manifest.active_version);assert.equal(fixed.modelVersion,'cm-post-training-v7');assert.equal(fixed.search.screeningSamples,fixed.search.samples);assert.equal(fixed.search.closureComplete,true);
 fixed.validation288=compact(score({...plan.setup,ownedSkillIds:[]},fixed.activeIds,plan.nativeIds,288));assert.ok(Math.abs(fixed.validation288.gain-fixed.gain)<.15,'fixed acquisition sample stability');
 result.same7000.fixedHistoricalInheritance=fixed;
}
const output=new URL('docs/validation/cm-v7-20261118.json',root);fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({output:output.pathname,mean:plan.gain,minimumContext:plan.robustGain,validated288:extended.gain,budget:plan.budget,physicsSensitivity:plan.physicsSensitivity}));
