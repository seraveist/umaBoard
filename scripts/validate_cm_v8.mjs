// Re-evaluate the frozen v7 audit inputs. Historical fixtures are read-only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareChart,createChartSetup,compileChartSkill,branchSampler,CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {recommendFinalPlan,FINAL_MODEL_VERSION} from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds} from '../assets/cm-state.mjs';
import {activeSkillIds,withoutSkill} from '../assets/skill-context.mjs';
import {performanceSummary} from '../assets/race-objective.mjs';
import {createAcquisitionConstraints,assertAcquisitionFeasible} from '../assets/acquisition-constraints.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),write=(p,v)=>fs.writeFileSync(new URL(p,root),JSON.stringify(v,null,2));
assert.equal(CM_MODEL_VERSION,'cm-first-chart-v8');assert.equal(FINAL_MODEL_VERSION,'cm-post-training-v8');
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const prior=read('docs/validation/cm-v7-guide-audit-20261118.json'),history=read('docs/validation/cm-v7-20261118.json');assert.equal(manifest.active_version,prior.dataVersion);
const hierarchy=buildAcquisitionHierarchy(data),graph=Object.fromEntries([...hierarchy.lower].map(([id,low])=>[id,[...low]])),samples=144,dt=.01,stats=prior.matrix.stats,aptitudes={distance:'S',surface:'A',style:'A'};
const closure=ids=>[...new Set(ids.flatMap(id=>[id,...relatedAcquisitionIds(hierarchy,id)]))];
const stamp={date:'2026-11-18 Asia/Seoul',baselineCommit:'d68f1ae66c99e1b2902b20943b774a1c467c0ab6',modelVersion:CM_MODEL_VERSION,finalModelVersion:FINAL_MODEL_VERSION,dataVersion:manifest.active_version,samples,dt,interpretation:'fixed-source-guide-inputs-and-model-validation; no observed win-rate or trigger-rate calibration'};
const inputFor=(race,style,outfit)=>({...prior.matrix.chartCases.find(c=>c.input.style===style).input,...prior.matrix.raceSettings[race],style,outfitId:outfit,...(race==='longchamp'&&style===4?{supportIds:prior.longPlans.plans.find(p=>p.style===4).input.supportIds}:{})});
const setupFor=(input,actualStats=stats,extra={})=>({...createChartSetup(data,profiles,input),stats:actualStats,aptitudes,possessionGraph:graph,...extra});
const evaluator=(setup,ids,baseline)=>new RaceEvaluator(setup,new Map([...new Set([...ids,...baseline,...(setup.ownedSkillIds||[])])].map(id=>[id,compileChartSkill(data.skills[id],setup)])),activeSkillIds(baseline,graph),baseline.filter(id=>data.skills[id].rarity.startsWith('unique')),branchSampler);
function score(setup,ids,baseline=[],count=samples,step=dt){return evaluator(setup,ids,baseline).evaluate(activeSkillIds(ids,graph),count,step);}
function compact(s){return {gain:s.gain,robustGain:s.robustGain,scenarioSensitivity:s.scenarioSensitivity,performance:s.performance,hpSuccessRate:s.hpSuccessRate,activationRates:s.activationRates,usefulAccelerationRates:s.usefulAccelerationRates,scenarios:s.scenarios,scenarioCoverage:s.scenarioCoverage,sampling:s.sampling};}
fs.mkdirSync(new URL('.cache/',root),{recursive:true});
const cases=[
 ...prior.plans.controlled.map(p=>({...p,kind:'kyoto',hint:p.recordedHint,previousGain:p.gain,previousIds:p.activeIds})),
 ...prior.plans.evolution.map(p=>({...p,kind:'orfe',outfit:'111501',style:4,target:'202871',core:['111501211','203902','91101351'],available:['202871','202872','201452','201462','201102','201112','200512'],hint:2,allowEvolution:true,previousGain:p.gain,previousIds:p.activeIds})),
 ...prior.longPlans.plans.map(p=>({...p,kind:'longchamp',hint:p.recordedHint,previousGain:p.gain,previousIds:p.activeIds})),
 ...prior.rankPlans.plans.map(p=>({...p,kind:'aggregation',outfit:p.input.outfitId,style:2,target:'202711',core:[],hint:5,previousGain:p.gain,previousIds:p.activeIds}))
];
function recordedChart(row){
 const task=prepareChart(data,profiles,display,row.input,{samples:1,dt:.05}),known=new Map(task.rows.map(r=>[r.id,r]));
 const evolution=row.allowEvolution?task.rows.filter(r=>r.rarity==='evolution'&&r.evolutionBaseId===row.target).map(r=>r.id):[];
 const rows=closure([...row.core,...row.available,...evolution]).map(id=>{assert.ok(!row.available.includes(id)||known.has(id),'A recorded purchase must genuinely be in the chart: '+id);return known.get(id)??{...data.skills[id],name:data.skills[id].name_jp,evolutionBaseId:data.evolution_rules.find(r=>r.evolved_id===id)?.base_id};});
 const states=Object.fromEntries(rows.map(r=>[r.id,'unavailable']));for(const id of closure(row.available))states[id]=String(row.hint);for(const id of row.core)states[id]='owned';
 return {chart:{setup:task.setup,nativeIds:task.nativeIds,rows,evolutionOptions:rows.filter(r=>r.rarity==='evolution'),modelVersion:CM_MODEL_VERSION},states};
}
async function recommend(row,{seed=0,riskPolicy}={}){
 const {chart,states}=recordedChart(row),actual={stats,aptitudes,spBudget:row.budget,raceContext:row.raceContext??{},riskPolicy};chart.setup.samplingSeed=seed;
 const plan=await recommendFinalPlan(data,chart,states,actual,{samples,dt,searchSamples:9,searchDt:.05,diagnostics:true});
 assert.equal(plan.search.globalOptimal,true);assert.equal(plan.acquisitionValidation.feasible,true);assert.ok(plan.budget.used<=row.budget);assert.equal(plan.purchases.reduce((sum,p)=>sum+p.cost,0),plan.budget.used);
 return {case:row.context,kind:row.kind,mode:row.mode??null,input:row.input,core:row.core,available:row.available,recordedHint:row.hint,budget:row.budget,previousGain:row.previousGain,previousIds:row.previousIds,target:row.target,seed,
  targetApplied:plan.activeIds.includes(row.target),activeIds:plan.activeIds,purchases:plan.purchases.map(p=>({id:p.id,name:p.name,cost:p.cost})),budgetResult:plan.budget,...compact(plan),contributions:plan.marginalContributions,search:plan.search,acquisitionValidation:plan.acquisitionValidation,objectivePolicy:plan.objectivePolicy,physicsSensitivity:plan.physicsSensitivity,setup:plan.setup,referenceIds:activeSkillIds([...plan.nativeIds,...plan.ownedIds],graph)};
}
let matrix,plans;
if(!process.argv.includes('--plans-only')&&!process.argv.includes('--collect')){
 matrix={...stamp,courseCases:[],chartCases:[],contextCases:[],evolutionCases:[],longchampContexts:[],contextConvergence:[],prior7000:null};
 for(const row of prior.matrix.courseCases){
  const setup=setupFor(inputFor(row.race,row.style,row.style===4?'100701':'112901')),value=score(setup,[row.id]);
  matrix.courseCases.push({race:row.race,style:row.style,id:row.id,previousGain:row.gain,...compact(value)});
  if(row.status==='inactive')assert.equal(value.gain,0);
 }
 for(const row of prior.matrix.chartCases){const t=prepareChart(data,profiles,display,row.input,{samples,dt});matrix.chartCases.push({context:row.context,previousGain:row.gain,...t.evaluate(t.rows.find(r=>r.id===row.id))});}
 for(const row of prior.matrix.contextCases){
  const original=prior.matrix.chartCases.find(c=>c.context===row.context),setup=setupFor(original.input,row.stats,{ownedSkillIds:closure(row.baseline),fullSpurtMode:row.fullSpurtMode});
  const value=score(setup,[...row.baseline,row.id],row.baseline);matrix.contextCases.push({context:row.context,profile:row.profile,fullSpurtMode:row.fullSpurtMode,id:row.id,previousGain:row.gain,...compact(value)});
 }
 for(const row of prior.matrix.evolutionCases){
  const core=['203902','91101351'],t=prepareChart(data,profiles,display,inputFor('kyoto',4,row.outfit),{samples:1,dt:.05}),setup=setupFor(inputFor('kyoto',4,row.outfit),stats,{ownedSkillIds:closure(core)}),baseline=[...t.nativeIds,...core];
  matrix.evolutionCases.push({outfit:row.outfit,normal:row.normal,evolved:row.evolved,normalResult:compact(score(setup,[...baseline,row.normal],baseline)),evolvedResult:compact(score(setup,[...baseline,row.evolved],baseline))});
 }
 for(const row of prior.extra.longchampContexts){
  const input=inputFor('longchamp',row.style,row.outfit),t=prepareChart(data,profiles,display,input,{samples:1,dt:.05}),setup=setupFor(input,stats,{ownedSkillIds:closure(row.core)}),baseline=[...t.nativeIds,...row.core];
  matrix.longchampContexts.push({context:row.id,id:row.target,previousGain:row.gain,...compact(score(setup,[...baseline,row.target],baseline))});
 }
 for(const row of prior.extra.contextConvergence){
  const source=prior.plans.controlled.find(c=>c.context===row.context),t=prepareChart(data,profiles,display,source.input,{samples:1,dt:.05}),setup=setupFor(source.input,stats,{ownedSkillIds:closure(source.core)}),baseline=[...t.nativeIds,...source.core];
  matrix.contextConvergence.push({context:row.context,id:row.id,previousGain:row.gain,...compact(score(setup,[...baseline,row.id],baseline,576))});
 }
 const previous=history.same7000,model=createAcquisitionConstraints(data,previous.input),selection=previous.recommended.activeIds;
 const result=model.check(selection,{explain:true});assert.equal(result.feasible,false);assert.throws(()=>assertAcquisitionFeasible(model,selection),error=>error.code==='ACQUISITION_CONFLICT');matrix.prior7000={input:previous.input,selectedIds:selection,validation:result,interpretation:'old-selected-gold-set-is-now-rejected; not a numerical before/after comparison of feasible purchases'};
 write('.cache/cm-v8-matrix.json',matrix);console.log('v8 matrix complete');if(process.argv.includes('--matrix-only'))process.exit(0);
}
if(!process.argv.includes('--matrix-only')&&!process.argv.includes('--collect')){
 plans={...stamp,records:[],holdoutReoptimization:[],selectedPlanChecks:[]};
 for(const row of cases){const value=await recommend(row);plans.records.push(value);console.log('v8 plan',row.context,row.mode??'',row.hint,row.budget,value.targetApplied,value.gain);write('.cache/cm-v8-plans.json',plans);}
 const bare=plans.records.filter(p=>p.kind==='aggregation');assert.deepEqual(bare[0].activeIds,bare[1].activeIds);assert.equal(bare[0].gain,bare[1].gain);assert.ok(bare[0].targetApplied);
 for(const row of [cases.find(r=>r.kind==='aggregation'&&r.mode==='default-worst-context'),cases.find(r=>r.context==='almond-guide'&&r.hint===2&&r.budget===500)])plans.holdoutReoptimization.push(await recommend(row,{seed:20261118}));
 for(const record of plans.records){
  const setup={...record.setup,samplingSeed:20261118},value=score(setup,record.activeIds,record.referenceIds,288),item={context:record.case,kind:record.kind,mode:record.mode,budget:record.budget,hint:record.recordedHint,heldoutSeed:20261118,gain144:record.gain,holdout288:compact(value)};
  // Re-use the same trajectories when varying the risk preference. This is
  // sensitivity of this selection, not proof that every risk policy reselects it.
  if(record.kind==='aggregation'||record.case==='almond-guide'&&record.budget===500&&record.recordedHint===2){
   const ev=evaluator(record.setup,record.activeIds,record.referenceIds),after=[],before=[];
   for(let i=0;i<samples;i++){const x=ev.run(record.activeIds,i,dt),y=ev.run(record.referenceIds,i,dt,true),n=record.scenarios.find(s=>s.id===x.scenario.id).count;after.push({value:x.finishTime,weight:x.scenario.weight/n});before.push({value:y.finishTime,weight:y.scenario.weight/n});}
   item.riskSensitivity=[.1,.25,.5].map(tailMass=>({tailMass,...performanceSummary(after,before,{tailMass})}));item.integration005=compact(score(record.setup,record.activeIds,record.referenceIds,samples,.005));
  }
  plans.selectedPlanChecks.push(item);write('.cache/cm-v8-plans.json',plans);
 }
 console.log('v8 plans and holdout checks complete');if(process.argv.includes('--plans-only'))process.exit(0);
}
if(process.argv.includes('--collect')){matrix=read('.cache/cm-v8-matrix.json');plans=read('.cache/cm-v8-plans.json');}
assert.equal(matrix.courseCases.length,75);assert.equal(matrix.contextCases.length,16);assert.equal(plans.records.length,32);assert.equal(plans.holdoutReoptimization.length,2);assert.equal(plans.selectedPlanChecks.length,32);
for(const block of [matrix,plans]){assert.equal(block.modelVersion,CM_MODEL_VERSION);assert.equal(block.samples,144);assert.equal(block.dt,.01);assert.equal(block.dataVersion,manifest.active_version);}
const large=read('.cache/cm-v8-7000-validation.json');assert.equal(large.modelVersion,FINAL_MODEL_VERSION);assert.equal(large.acquisitionValidation.feasible,true);assert.equal(large.acquisitionAssumption,'reviewed-first-event-choices; hypothetical-Lv5; partial-route-coverage-not-a-real-training-replay');
// Long validations can finish while display/ablation fixes are being made.
// Verify every chosen plan with the collection-time engine and refresh the
// diagnostic ablations whose owned-prerequisite restoration has changed.
const collectionVerification={selectedPlansRechecked:0,holdoutReoptimizationsRechecked:0,maximumGainDifference:0,refreshedContributionIds:[]};
for(const record of [...plans.records,...plans.holdoutReoptimization]){
 const ev=evaluator(record.setup,record.activeIds,record.referenceIds),fresh=ev.evaluate(record.activeIds,samples,dt),difference=Math.abs(fresh.gain-record.gain);
 assert.ok(difference<1e-8,`Selected score changed: ${record.case}/${record.budget}`);
 assert.equal(fresh.performance.risk.withinLimit,record.performance.risk.withinLimit);
 if(plans.records.includes(record))collectionVerification.selectedPlansRechecked++;else collectionVerification.holdoutReoptimizationsRechecked++;
 collectionVerification.maximumGainDifference=Math.max(collectionVerification.maximumGainDifference,difference);
 Object.assign(record,compact(fresh));
 for(const [id,contribution] of Object.entries(record.contributions)){
  const expected=withoutSkill(record.activeIds,id,[...record.referenceIds,...(record.setup.ownedSkillIds||[])],graph).restoredIds.sort();
  if(JSON.stringify(expected)!==JSON.stringify([...(contribution.restoredIds||[])].sort())){
   Object.assign(contribution,ev.marginal(record.activeIds,id,samples,dt));
   collectionVerification.refreshedContributionIds.push({case:record.case,seed:record.seed,hint:record.recordedHint,budget:record.budget,id,restoredIds:expected});
  }
 }
}
const hash=createHash('sha256');for(const name of fs.readdirSync(new URL('assets/',root)).filter(name=>/\.(mjs|css)$/.test(name)).sort())hash.update(name+'\n'+fs.readFileSync(new URL('assets/'+name,root),'utf8').replace(/\r\n/g,'\n')+'\n');
collectionVerification.assetsSha256=hash.digest('hex');collectionVerification.fingerprintBasis='sorted asset filename + LF-normalized mjs/css content at collection';
write('.cache/cm-v8-plans.json',plans);
write('docs/validation/cm-v8-20261118.json',{...stamp,matrix,plans,consistent7000:large,collectionVerification});console.log('v8 validation collected',collectionVerification);
