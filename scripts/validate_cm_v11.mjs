// Reproduce the v10 audit against v11 without changing historical artifacts.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as chart from '../assets/cm-chart.mjs';
import * as final from '../assets/cm-final-plan.mjs';
import {finalAcquisitionSnapshot} from '../assets/cm-evolution.mjs';
import {branchReady} from '../assets/activation.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {activeSkillIds} from '../assets/skill-context.mjs';
import {selectionRules} from '../assets/selection.mjs';
import {createAcquisitionConstraints} from '../assets/acquisition-constraints.mjs';
import {compareRacePlans} from '../assets/race-objective.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const hash=(dir='assets/')=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL(dir,root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL(dir+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
const baselineCommit='5699d480ec7fb4db09a3c739b5c1212a46314838',baselineHash='779d0b8477d178c8bded03db8a497462134647002554b3d6cda3d5bab39d8833',baselineDir=`.cache/v11-frozen-v10-${process.argv.includes('--bounded')?'bounded':'checks'}/`;
fs.mkdirSync(new URL(baselineDir+'assets/',root),{recursive:true});
for(const path of execFileSync('git',['ls-tree','-r','--name-only',baselineCommit,'assets'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim().split('\n').filter(p=>/\.(mjs|css)$/.test(p)))fs.writeFileSync(new URL(baselineDir+path,root),execFileSync('git',['show',`${baselineCommit}:${path}`],{cwd:fileURLToPath(root)}));
assert.equal(hash(baselineDir+'assets/'),baselineHash);
const old={...await import(new URL(baselineDir+'assets/cm-chart.mjs',root)),...await import(new URL(baselineDir+'assets/cm-final-plan.mjs',root)),...await import(new URL(baselineDir+'assets/cm-evolution.mjs',root)),...await import(new URL(baselineDir+'assets/activation.mjs',root))};
assert.equal(chart.CM_MODEL_VERSION,'cm-first-chart-v11');assert.equal(final.FINAL_MODEL_VERSION,'cm-post-training-v11');
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
assert.equal(manifest.active_version,'0b105741168200654ef4ef6523e1cb0bc0b7d9852107f3d478ea0fdcd6b7ad26');
const stamp={date:'2026-11-18 Asia/Seoul',baselineCommit,baselineAssetsSha256:baselineHash,assetsSha256:hash(),worktreeBaseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim(),modelVersion:chart.CM_MODEL_VERSION,finalModelVersion:final.FINAL_MODEL_VERSION,dataVersion:manifest.active_version,interpretation:'same-input regression under unchanged assumed encounter population and objective; not empirical race probabilities'};
const save=(name,out)=>{assert.equal(hash(),stamp.assetsSha256);fs.writeFileSync(new URL(`docs/validation/cm-v11-${name}-20261118.json`,root),JSON.stringify({...stamp,...out},null,2)+'\n');};
const input=(courseId,extra={})=>({outfitId:'102201',scenarioId:'15',style:2,supportIds:[],courseId,going:1,weather:1,season:3,time:2,...extra});
const compact=r=>({gain:r.gain,hpSuccessRate:r.hpSuccessRate,hpShortfall:r.hpShortfall,performance:r.performance,activationRates:r.activationRates,usefulAccelerationRates:r.usefulAccelerationRates});

if(process.argv.includes('--candidates')){
 const id='204142',out={scope:'one real stat-gated white across ten profiles and three courses; original audit purchase inputs without manual row restoration',matrix:[],plans:[]};
 for(const scenarioId of Object.keys(profiles.profiles))for(const courseId of ['10604','10810','10704']){
  const raceInput=input(courseId,{scenarioId}),previous=old.prepareChart(data,profiles,{},raceInput,{samples:1,dt:.05}),now=chart.prepareChart(data,profiles,{},raceInput,{samples:1,dt:.05});
  const a=previous.rows.find(r=>r.id===id),b=now.rows.find(r=>r.id===id);assert.ok(b);
  out.matrix.push({scenarioId,courseId,baseStamina:now.setup.stats.stamina,previous:{inChecklist:!!a,hint:old.finalAcquisitionSnapshot(data,previous,{[id]:'2'})[id]??null},current:{inChecklist:true,state:b.calculationState,hint:finalAcquisitionSnapshot(data,now,{[id]:'2'})[id]}});
  assert.equal(out.matrix.at(-1).current.hint,'2');
 }
 const raceInput=input('10810',{scenarioId:'8'}),before=old.prepareChart(data,profiles,{},raceInput,{samples:1,dt:.05}),after=await chart.generateChart(data,profiles,{},raceInput,{samples:1,dt:.05});
 assert.ok(!before.rows.some(r=>r.id===id));assert.ok(after.rows.some(r=>r.id===id));
 // Same reduced recorded pool as the audit. The v11 row now comes directly
 // from normal chart generation rather than a modified profile or manual add.
 const reduced=t=>({...t,rows:t.rows.filter(r=>r.id===id),evolutionOptions:[],inheritanceOptions:[]}),states={[id]:'2'};
 for(const stamina of [1199,1200,1800,2400]){
  const actual={stats:{...after.setup.stats,stamina},aptitudes:after.setup.aptitudes,spBudget:200},options={samples:144,dt:.01,diagnostics:false};
  const previous=await old.recommendFinalPlan(data,reduced(before),states,actual,options),current=await final.recommendFinalPlan(data,reduced(after),states,actual,options);
  assert.equal(current.acquisition[id],'2');assert.equal(current.activeIds.includes(id),stamina>=1200);assert.equal(current.budget.used,stamina>=1200?144:0);
  const audit=read('docs/validation/cm-v10-reaudit-candidates-20261118.json').plans.find(p=>p.actual.stats.stamina===stamina);assert.equal(current.gain,audit.candidateRestored.gain);assert.equal(previous.gain,audit.missing.gain);
  out.plans.push({input:raceInput,id,actual,previous:{selectedIds:previous.activeIds,acquisition:previous.acquisition[id]??null,budget:previous.budget,...compact(previous)},current:{selectedIds:current.activeIds,acquisition:current.acquisition[id],budget:current.budget,...compact(current)}});
 }
 const actual={stats:{...after.setup.stats,stamina:1199},spBudget:0},owned=await final.recommendFinalPlan(data,after,{[id]:'owned'},actual,{samples:144,dt:.01,diagnostics:false});
 assert.ok(owned.activeIds.includes(id));assert.equal(owned.acquisition[id],'owned');assert.equal(owned.budget.used,0);
 out.inactiveOwned={id,actual,selectedIds:owned.activeIds,acquisition:owned.acquisition[id],budget:owned.budget,...compact(owned)};
 save('candidates',out);console.log('v11 candidate matrix',out.matrix.length,'plans',out.plans.length);
}

if(process.argv.includes('--clock')){
 const audit=read('docs/validation/cm-v10-reaudit-clock-20261118.json'),out={referenceSource:audit.referenceSource,referenceScope:audit.referenceScope,predicate:{...audit.predicate,current:branchReady(audit.predicate.branch,audit.predicate.state,'clock'),previous:old.branchReady(audit.predicate.branch,audit.predicate.state,'clock')},records:[]};
 assert.equal(out.predicate.current,false);assert.equal(out.predicate.previous,true);
 for(const row of audit.records){
  assert.notEqual(row.status,'unsupported');
  const t=chart.prepareChart(data,profiles,{},input(row.courseId,{style:row.style}),{samples:1,dt:.05}),s={...t.setup,stats:{...t.setup.stats,stamina:2200}},compiled=new Map([[row.id,chart.compileChartSkill(data.skills[row.id],s)]]),r=new RaceEvaluator(s,compiled,[],[],chart.branchSampler).evaluate([row.id],144,.01);
  assert.equal(r.gain,row.reference.gain);assert.equal(r.hpSuccessRate,row.reference.hpSuccessRate);
  out.records.push({courseId:row.courseId,id:row.id,previous:row.current,reference:row.reference,current:compact(r),differenceFromPrevious:r.gain-row.current.gain,differenceFromReference:r.gain-row.reference.gain});
 }
 save('clock',out);console.log('v11 clock matches pinned-source reference',out.records.length);
}

if(process.argv.includes('--bounded')){
 const audit=read('docs/validation/cm-v10-reaudit-bounded-20261118.json'),out={scope:'same six recommendation inputs and independent finite-pool subset oracle as the frozen v10 audit; shared physics and objective',records:[]};
 for(const courseId of ['10307','10704','10905']){
  const source=audit.records.find(r=>r.input.courseId===courseId),ids=source.candidateIds,t=chart.prepareChart(data,profiles,{},source.input,{samples:1,dt:.05}),rows=t.rows.filter(r=>ids.includes(r.id));assert.equal(rows.length,10);
  const c={setup:t.setup,nativeIds:t.nativeIds,rows,evolutionOptions:[],modelVersion:t.modelVersion},states=source.states,s=final.createFinalSetup(c,source.actual);s.ownedSkillIds=[];
  const compiled=new Map([...new Set([...ids,...t.nativeIds])].map(id=>[id,chart.compileChartSkill(data.skills[id],s)])),ev=new RaceEvaluator(s,compiled,t.nativeIds,t.nativeIds,chart.branchSampler),rules=selectionRules(data,new Map([...compiled.keys()].map(id=>[id,data.skills[id]]))),constraints=createAcquisitionConstraints(data,s),memo=new Map();
  for(let mask=0;mask<2**ids.length;mask++){
   const picked=ids.filter((_,i)=>mask&(1<<i)),active=activeSkillIds([...t.nativeIds,...picked],s.possessionGraph),key=active.join(',');if(memo.has(key))continue;
   if(!active.every((id,i)=>active.slice(0,i).every(other=>rules.compatible(id,other)))||!constraints.allowed(active))continue;
   const stages=new Set();for(const id of active.filter(id=>!t.nativeIds.includes(id))){let k=id;while(k){if(stages.has(k))break;stages.add(k);assert.equal(data.purchase_stages[k].status,'verified');k=data.purchase_stages[k].prerequisite_id;}}
   const cost=[...stages].reduce((sum,id)=>sum+Math.floor(data.purchase_stages[id].base_cost*80/100),0);if(cost>800)continue;
   memo.set(key,{ids:active,cost,...ev.evaluate(active,144,.01)});
  }
  for(const budget of [500,800]){
   const original=audit.records.find(r=>r.input.courseId===courseId&&r.actual.spBudget===budget),actual={...original.actual,spBudget:budget},expected=[...memo.values()].filter(r=>r.cost<=budget).sort(compareRacePlans)[0],plan=await final.recommendFinalPlan(data,c,states,actual,{samples:144,dt:.01,diagnostics:false}),measured={ids:plan.activeIds,cost:plan.budget.used,...ev.evaluate(plan.activeIds,144,.01)};
   assert.equal(measured.gain,plan.gain);assert.equal(plan.gain,original.recommendation.gain);assert.deepEqual(plan.activeIds,original.recommendation.selectedIds);assert.ok(compareRacePlans(measured,expected)<=0);
   out.records.push({input:source.input,actual,candidateIds:ids,states,enumeratedMasks:2**ids.length,affordableDistinctPlans:[...memo.values()].filter(r=>r.cost<=budget).length,previous:original.recommendation,current:{selectedIds:plan.activeIds,budget:plan.budget,...compact(plan),search:plan.search},oracle:{selectedIds:expected.ids,cost:expected.cost,...compact(expected)},matchesOracleObjective:true,gainGap:expected.gain-plan.gain});
   console.log('v11 bounded',courseId,budget,plan.gain,'oracle gap',expected.gain-plan.gain);
  }
 }
 save('bounded',out);
}

if(process.argv.includes('--conditional')){
 const audit=read('docs/validation/cm-v10-reaudit-conditional-20261118.json'),out={scope:'same isolated King/Gunrin gold/white inputs and full-spurt sensitivity controls as v10; unchanged assumed population, no measured probability claim',records:[]};
 for(const row of audit.records){
  const t=chart.prepareChart(data,profiles,{},row.input,{samples:1,dt:.05});assert.ok(t.rows.some(r=>r.id===row.id));
  let s=final.createFinalSetup(t,row.actual);if(row.policy==='off')s={...s,fullSpurtMode:'off'};
  const selected=activeSkillIds([...t.nativeIds,row.id],s.possessionGraph),compiled=new Map(selected.map(id=>[id,chart.compileChartSkill(data.skills[id],s)])),r=new RaceEvaluator(s,compiled,t.nativeIds,t.nativeIds,chart.branchSampler).evaluate(selected,144,.01);
  assert.equal(r.gain,row.gain);assert.equal(r.hpSuccessRate,row.hpSuccessRate);assert.equal(r.activationRates[row.id],row.activationRate);assert.equal(r.usefulAccelerationRates[row.id],row.usefulRate);
  out.records.push({input:row.input,actual:row.actual,id:row.id,policy:row.policy,previous:compact(row),current:compact(r),gainDifference:r.gain-row.gain});
 }
 save('conditional',out);console.log('v11 conditional controls unchanged',out.records.length);
}
