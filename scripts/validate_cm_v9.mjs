// Reuse the frozen v8 audit inputs. Do not overwrite historical results.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {prepareChart,createChartSetup,compileChartSkill,branchSampler,CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {recommendFinalPlan,FINAL_MODEL_VERSION,RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds} from '../assets/cm-state.mjs';
import {styleRecommendation,selectInheritedTop} from '../assets/cm-recommendation.mjs';
import {selectableCourse,withReviewedGeometry} from '../assets/reviewed-course-geometry.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),write=(p,v)=>fs.writeFileSync(new URL(p,root),JSON.stringify(v,null,2)+'\n');
assert.equal(CM_MODEL_VERSION,'cm-first-chart-v9');assert.equal(FINAL_MODEL_VERSION,'cm-post-training-v9');
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const audit=read('docs/validation/cm-v8-holdout-20261118.json'),counter=read('docs/validation/cm-v8-counterexamples-20261118.json'),old=read('docs/validation/cm-v8-20261118.json');assert.equal(manifest.active_version,audit.dataVersion);
const hierarchy=buildAcquisitionHierarchy(data),graph=Object.fromEntries([...hierarchy.lower].map(([id,low])=>[id,[...low]]));
const closure=ids=>[...new Set(ids.flatMap(id=>[id,...relatedAcquisitionIds(hierarchy,id)]))];
const input=(race,style)=>({outfitId:'102201',style,courseId:race.courseId,scenarioId:'12',supportIds:[],season:race.season,weather:race.weather,going:race.going,time:2});
const setup=(race,style,extra={})=>({...createChartSetup(data,profiles,input(race,style)),stats:audit.stats,aptitudes:audit.aptitudes,possessionGraph:graph,...extra});
const summary=s=>({gain:s.gain,activationRates:s.activationRates,usefulAccelerationRates:s.usefulAccelerationRates,performance:s.performance,hpSuccessRate:s.hpSuccessRate,scenarioSensitivity:s.scenarioSensitivity});
function evaluate(s,ids,count=144,dt=.01,baseline=[]){
 const compiled=new Map([...new Set([...ids,...baseline,...(s.ownedSkillIds||[])])].map(id=>[id,compileChartSkill(data.skills[id],s)]));
 const ev=new RaceEvaluator(s,compiled,baseline,baseline.filter(id=>data.skills[id].rarity==='unique'),branchSampler);
 return {compiledStatus:Object.fromEntries([...compiled].map(([id,c])=>[id,c.status])),...summary(ev.evaluate(ids,count,dt))};
}
const stamp={date:'2026-11-18 Asia/Seoul',baselineCommit:'0558f7cf024d6875e84fa9df50af3ad9592e541c',dataVersion:manifest.active_version,modelVersion:CM_MODEL_VERSION,finalModelVersion:FINAL_MODEL_VERSION,unchangedPolicies:['race-scenarios.mjs','race-objective.mjs','cm-effect-policy.mjs'],interpretation:'same assumed encounter population and objective; mechanical fixes only; not empirical probability calibration'};
const assetHash=()=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL('assets/',root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
stamp.assetsSha256=assetHash();
fs.mkdirSync(new URL('.cache/',root),{recursive:true});
if(process.argv.includes('--mechanics')){
 const out={...stamp,matrix:[],inheritancePolicy:[],boundaries:[],corners:[],holdoutPlans:[],usGeometry:[]};
 for(const race of audit.races){for(const style of race.styles)for(const id of race.skills){const before=audit.matrix.find(x=>x.race===race.key&&x.style===style&&x.id===id);out.matrix.push({race:race.key,style,id,previousGain:before?.gain??null,...evaluate(setup(race,style),[id])});}console.log('v9 matrix',race.key);}
 assert.equal(out.matrix.length,163);
 for(const before of audit.inheritancePolicy){
  const race=audit.races.find(r=>r.key===before.race),task=prepareChart(data,profiles,display,input(race,before.style),{samples:144,dt:.01}),row=task.evaluate(task.rows.find(r=>r.id==='900511'));
  out.inheritancePolicy.push({race:before.race,style:before.style,previous:before,now:{gain:row.gain,recommendation:row.recommendation,admittedWhenOnlyCandidate:selectInheritedTop([row]).length===1}});
  assert.equal(row.recommendation.eligible,true);assert.equal(selectInheritedTop([row]).length,1);
 }
 for(const courseId of ['10708','10907']){
  const race=audit.races.find(r=>r.courseId===courseId),s=setup(race,3,{raceContext:{rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}}});
  const c=compileChartSkill(data.skills['900591'],s),run=simulateSolo(s,[c],.5,{dt:.01,keepTrace:false,branchSampler:branchSampler(s,[],0)});
  const value=evaluate(s,['900591']);out.boundaries.push({courseId,geometryUnchanged:true,previousGain:counter.geometryBoundary.find(r=>r.courseId===courseId&&r.finalCornerShiftMetres===0).gain,...value,event:run.events[0]});
  assert.equal(run.events.length,1);assert.ok(run.events[0].frameStartX<s.course.distance*2/3&&run.events[0].x>=s.course.distance*2/3);assert.ok(value.gain>0);
 }
 for(const before of counter.cornerDraws){const race=audit.races.find(r=>r.courseId===before.courseId);out.corners.push({courseId:before.courseId,previousWithoutReplacement:before.currentWithoutReplacement.gain,v8DiagnosticWithReplacement:before.citedUpstreamWithReplacement.gain,...evaluate(setup(race,3),['200341'],576)});}
 for(const c of Object.values(data.courses).filter(c=>Number(c.track_id)>=10202))out.usGeometry.push({id:c.id,selectable:selectableCourse(c),review:withReviewedGeometry(c).geometryReview??null});
 assert.equal(out.usGeometry.filter(c=>c.selectable).length,14);assert.ok(out.usGeometry.find(c=>c.id==='11709').selectable);
 for(const before of audit.plans){
  const race=audit.races.find(r=>r.key===before.race),task=prepareChart(data,profiles,display,input(race,before.style),{samples:1,dt:.05});
  const chart={setup:task.setup,nativeIds:task.nativeIds,rows:task.rows.filter(r=>before.availableIds.includes(r.id)),modelVersion:task.modelVersion,evolutionOptions:[]},states=Object.fromEntries(before.availableIds.map(id=>[id,'5']));
  const p=await recommendFinalPlan(data,chart,states,before.actual,{samples:144,dt:.01,diagnostics:false});assert.ok(p.search.globalOptimal);
  out.holdoutPlans.push({race:before.race,style:before.style,tailMass:before.tailMass,previousGain:before.gain,previousIds:before.activeIds,activeIds:p.activeIds,...summary(p),budget:p.budget,search:p.search});
  console.log('v9 holdout plan',before.race,before.tailMass,p.gain);write('.cache/cm-v9-mechanics.json',out);
 }
 write('.cache/cm-v9-mechanics.json',out);
}
if(process.argv.includes('--legacy')){
 const shardArg=process.argv.find(a=>a.startsWith('--shard='))?.slice(8),[shard,total]=shardArg?shardArg.split('/').map(Number):[0,1];
 assert.ok(Number.isInteger(shard)&&Number.isInteger(total)&&shard>=0&&shard<total);
 const output=total===1?'.cache/cm-v9-legacy.json':`.cache/cm-v9-legacy-${shard}.json`;
 const out={...stamp,records:[]};
 for(const [caseIndex,before]of old.plans.records.entries()){
  if(caseIndex%total!==shard)continue;
  const t=prepareChart(data,profiles,display,before.input,{samples:1,dt:.05}),known=new Map(t.rows.map(r=>[r.id,r]));
  const evolutions=before.kind==='orfe'?t.rows.filter(r=>r.rarity==='evolution'&&r.evolutionBaseId===before.target).map(r=>r.id):[];
  const rows=closure([...before.core,...before.available,...evolutions]).map(id=>known.get(id)??{...data.skills[id],name:data.skills[id].name_jp,evolutionBaseId:data.evolution_rules.find(r=>r.evolved_id===id)?.base_id});
  const states=Object.fromEntries(rows.map(r=>[r.id,'unavailable']));for(const id of closure(before.available))states[id]=String(before.recordedHint);for(const id of before.core)states[id]='owned';
  const chart={setup:{...t.setup,samplingSeed:before.seed},nativeIds:t.nativeIds,rows,evolutionOptions:rows.filter(r=>r.rarity==='evolution'),modelVersion:t.modelVersion};
  const actual={stats:before.setup.stats,aptitudes:before.setup.aptitudes,spBudget:before.budget,raceContext:before.setup.raceContext,riskPolicy:before.setup.riskPolicy};
  const p=await recommendFinalPlan(data,chart,states,actual,{samples:144,dt:.01,diagnostics:false});assert.ok(p.search.globalOptimal);assert.ok(p.budget.used<=p.budget.total);assert.ok(p.acquisitionValidation.feasible);
  out.records.push({caseIndex,case:before.case,kind:before.kind,mode:before.mode,budget:before.budget,recordedHint:before.recordedHint,target:before.target,previousGain:before.gain,previousIds:before.activeIds,activeIds:p.activeIds,targetApplied:p.activeIds.includes(before.target),...summary(p),budgetResult:p.budget,search:p.search});
  console.log('v9 legacy',caseIndex,before.case,before.recordedHint,before.budget,p.gain);write(output,out);
 }
 assert.equal(out.records.length,old.plans.records.filter((_,i)=>i%total===shard).length);
}
if(process.argv.includes('--merge-legacy')){
 const shards=Array.from({length:4},(_,i)=>read(`.cache/cm-v9-legacy-${i}.json`));for(const s of shards)assert.equal(s.assetsSha256,stamp.assetsSha256);
 const records=shards.flatMap(s=>s.records).sort((a,b)=>a.caseIndex-b.caseIndex);assert.equal(records.length,32);assert.deepEqual(records.map(r=>r.caseIndex),Array.from({length:32},(_,i)=>i));
 const rep=records.filter(r=>r.kind==='aggregation');assert.deepEqual(rep[0].activeIds,rep[1].activeIds);assert.equal(rep[0].gain,rep[1].gain);write('.cache/cm-v9-legacy-final.json',{...stamp,records});
}
if(process.argv.includes('--browser-replay')){
 const record=read('docs/validation/cm-v9-browser-20261118.json'),t=prepareChart(data,profiles,display,record.input,{samples:1,dt:.05});
 const states=Object.fromEntries(t.rows.map(r=>[r.id,'unavailable']));Object.assign(states,record.states);
 const p=await recommendFinalPlan(data,t,states,record.actual,{samples:144,dt:.01,diagnostics:false});
 assert.deepEqual(p.activeIds,record.expected.activeIds);assert.deepEqual(p.budget,record.expected.budget);assert.ok(Math.abs(p.gain-record.expected.gain)<1e-9);assert.equal(p.hpSuccessRate,1);
 record.currentEngineReplay={assetsSha256:stamp.assetsSha256,...summary(p),activeIds:p.activeIds,budget:p.budget,search:p.search};write('docs/validation/cm-v9-browser-20261118.json',record);console.log('v9 browser replay',p.gain);
}
if(process.argv.includes('--heldout')){
 const plans=read('.cache/cm-v9-legacy-final.json');assert.equal(plans.assetsSha256,stamp.assetsSha256);
 const records=plans.records.map(p=>{
  const before=old.plans.records[p.caseIndex],s={...before.setup,chartPolicy:CM_MODEL_VERSION,samplingSeed:20261118};
  return {caseIndex:p.caseIndex,case:p.case,kind:p.kind,budget:p.budget,recordedHint:p.recordedHint,selectedIds:p.activeIds,selectionGain:p.gain,...evaluate(s,p.activeIds,288,.01,before.referenceIds)};
 });write('.cache/cm-v9-heldout.json',{...stamp,seed:20261118,samples:288,interpretation:'fixed selected plans on a different random seed; same unmeasured context population; not independent real races or reoptimization',records});console.log('v9 heldout',records.length);
}
if(process.argv.includes('--large-compare')){
 const before=old.consistent7000,now=read('.cache/cm-v9-7000-validation.json');
 const changedRecords=[...new Set([...Object.keys(before.acquisition),...Object.keys(now.acquisition)])].filter(id=>(before.acquisition[id]??'unavailable')!==(now.acquisition[id]??'unavailable')).map(id=>({id,before:before.acquisition[id]??'unavailable',now:now.acquisition[id]??'unavailable'}));
 const t=prepareChart(data,profiles,display,before.input,{samples:1,dt:.05}),selection=new RecordedPurchaseModel(data,t.rows,before.acquisition,before.actual).selection(before.activeIds);
 assert.equal(selection.used,before.budget.used);
 const fixed=evaluate({...before.setup,chartPolicy:CM_MODEL_VERSION},before.activeIds,144,.01,before.nativeIds);
 write('.cache/cm-v9-large-compare.json',{...stamp,interpretation:'same benchmark procedure but bulk inheritance admission changes two acquisition states; do not call gains a paired identical-input improvement',changedRecords,originalPlanReevaluation:{selectedIds:before.activeIds,recordedBudget:before.budget,recheckedCost:selection.used,previousGain:before.gain,...fixed},currentBenchmark:{gain:now.gain,budget:now.budget,globalOptimal:now.search.globalOptimal}});console.log('v9 large compare',fixed.gain);
}
if(process.argv.includes('--collect')){
 const mechanics=read('.cache/cm-v9-mechanics.json'),legacy=read('.cache/cm-v9-legacy-final.json'),large=read('.cache/cm-v9-7000-validation.json');
 assert.equal(mechanics.assetsSha256,stamp.assetsSha256);assert.equal(legacy.assetsSha256,stamp.assetsSha256);
 assert.equal(mechanics.matrix.length,163);assert.equal(mechanics.holdoutPlans.length,12);assert.equal(legacy.records.length,32);assert.equal(large.modelVersion,FINAL_MODEL_VERSION);assert.ok(large.acquisitionValidation.feasible);
 const unchangedPoliciesVerification=Object.fromEntries(stamp.unchangedPolicies.map(n=>{
  const current=fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n'),before=execFileSync('git',['show',`${stamp.baselineCommit}:assets/${n}`],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');assert.equal(current,before);
  return [n,{unchanged:true,sha256:createHash('sha256').update(current).digest('hex')}];
 }));
 const browser=read('docs/validation/cm-v9-browser-20261118.json');assert.equal(browser.currentEngineReplay.assetsSha256,stamp.assetsSha256);
 const heldout=read('.cache/cm-v9-heldout.json');assert.equal(heldout.assetsSha256,stamp.assetsSha256);assert.equal(heldout.records.length,32);
 for(const r of heldout.records){assert.ok(r.gain>=0);assert.equal(r.hpSuccessRate,1);assert.equal(r.performance.risk.withinLimit,true);}
 const largeComparison=read('.cache/cm-v9-large-compare.json');assert.equal(largeComparison.assetsSha256,stamp.assetsSha256);
 write('docs/validation/cm-v9-20261118.json',{...stamp,unchangedPoliciesVerification,mechanics,legacy,heldout,consistent7000:large,largeComparison,browserRuntime:'cm-v9-browser-20261118.json'});console.log('v9 collected');
}
