// Read-only calculation and merge-readiness audit. Never merges or rebases.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {prepareChart,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {RecordedPurchaseModel,recommendFinalPlan,createFinalSetup} from '../assets/cm-final-plan.mjs';
import {selectionRules} from '../assets/selection.mjs';
import {activeSkillIds} from '../assets/skill-context.mjs';
import {createAcquisitionConstraints} from '../assets/acquisition-constraints.mjs';
import {buildAcquisitionHierarchy} from '../assets/cm-state.mjs';
import {checklistPlanKey,restoreChecklistPlan} from '../assets/cm-plan-storage.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {compareRacePlans} from '../assets/race-objective.mjs';
import {inheritanceOrigins,skillTransforms} from '../assets/skill-transforms.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:60e6}).trimEnd();
const hash=t=>createHash('sha256').update(t).digest('hex'),body=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n');
const release=read('docs/validation/cm-optimization-v1-release-20261118.json'),manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const core=JSON.parse(execFileSync(process.execPath,['scripts/check_cm_algorithm_v1.mjs'],{cwd:root,encoding:'utf8'}));assert.equal(core.status,'passed');
const protectedFiles=[...release.modules,...read(release.parentBaseline.path).inputs,...read(release.parentBaseline.path).evidence],startHashes=protectedFiles.map(x=>({path:x.path,sha256:hash(body(x.path))}));
const stamp={date:'2026-11-18 Asia/Seoul',auditedHead:git('rev-parse','HEAD'),algorithm:core.algorithm,coreSha256:release.coreSha256,dataVersion:manifest.active_version};
function save(kind,out){for(const f of startHashes)assert.equal(hash(body(f.path)),f.sha256,'Protected file changed: '+f.path);fs.writeFileSync(new URL(`docs/validation/cm-optimization-v1-premerge-${kind}-20261118.json`,root),JSON.stringify({...stamp,...out},null,2)+'\n');}
const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const rows=Object.values(data.skills),transforms=new Map(skillTransforms(data).map(r=>[r.evolved_id,r.base_id]));
// Independent purchase graph from verified raw stages; integer-only rounding.
function stages(id,owned=new Set(),visiting=[]){
 assert.ok(!visiting.includes(id),'Source purchase cycle '+id);if(owned.has(id))return [];
 const skill=data.skills[id];assert.ok(skill,id);if(['unique','unique_low_star','unique_upgraded'].includes(skill.rarity))return [];
 const base=transforms.get(id);if(base)return stages(base,owned,[...visiting,id]);
 const s=data.purchase_stages[id];if(!s||s.status!=='verified')return null;
 const low=s.prerequisite_id?stages(s.prerequisite_id,owned,[...visiting,id]):[];return low===null?null:[...low,id];
}
const reductions=[0,10,20,30,35,40],traits={none:0,studious:4,'fast-learner':10};
function independentPrice(ids,states,trait){
 const owned=new Set(Object.keys(states).filter(id=>states[id]==='owned')),union=new Map();
 for(const id of ids){const chain=stages(id,owned);if(chain===null)return null;for(const stage of chain){const explicit=/^[0-5]$/.test(states[stage]??'')?Number(states[stage]):null,fallback=transforms.has(id)&&stage===chain.at(-1)&&/^[0-5]$/.test(states[id]??'')?Number(states[id]):0,level=explicit??fallback;union.set(stage,Math.max(union.get(stage)??0,level));}}
 return [...union].reduce((sum,[id,level])=>sum+Number(BigInt(data.purchase_stages[id].base_cost)*BigInt(100-reductions[level]-traits[trait])/100n),0);
}
if(process.argv.includes('--prices')){
 let verified=0,unknown=0,checks=0,paidChecks=0,sharedChecks=0,evolutionChecks=0;const unknownIds=[];
 for(const skill of rows){
  const chain=stages(skill.id);if(chain===null){unknown++;unknownIds.push(skill.id);for(const trait of Object.keys(traits)){assert.equal(new RecordedPurchaseModel(data,rows,{}, {discountTrait:trait}).selection([skill.id]).complete,false);checks++;}continue;}verified++;
  for(const trait of Object.keys(traits))for(let level=0;level<=5;level++){
   const states=Object.fromEntries(chain.map((id,i)=>[id,String((level+i)%6)]));states[skill.id]=String(level);
   const expected=independentPrice([skill.id],states,trait),actual=new RecordedPurchaseModel(data,rows,states,{discountTrait:trait}).selection([skill.id]);assert.equal(actual.complete,true);assert.equal(actual.used,expected);assert.equal(new Set(actual.stages.map(x=>x.id)).size,actual.stages.length);checks++;if(transforms.has(skill.id))evolutionChecks++;
   const duplicated=new RecordedPurchaseModel(data,rows,states,{discountTrait:trait}).selection([skill.id,...chain,skill.id]);assert.equal(duplicated.used,independentPrice([skill.id,...chain],states,trait));sharedChecks++;
   if(chain.length>1){const paid={...states,[chain[0]]:'owned'};assert.equal(new RecordedPurchaseModel(data,rows,paid,{discountTrait:trait}).selection([skill.id]).used,independentPrice([skill.id],paid,trait));paidChecks++;}
  }
 }
 save('prices',{status:'passed',scope:'Every active skill; independent BigInt stage rounding, mixed hints, all traits, sunk prerequisites, shared stages and transformations; no race simulation',skillRecords:rows.length,pricedRecords:verified,unverifiedRecords:unknown,selectionChecks:checks,sharedStageChecks:sharedChecks,paidPrerequisiteChecks:paidChecks,evolutionChecks,unknownIds});console.log('purchase audit passed',checks,sharedChecks,paidChecks);
}
if(process.argv.includes('--integration')){
 assert.equal(typeof vm.SourceTextModule,'function','Use node --experimental-vm-modules for the static module link audit.');
 const target=process.argv.find(x=>x.startsWith('--target='))?.slice(9)||'FETCH_HEAD',targetSha=git('rev-parse',target),r=spawnSync('git',['merge-tree','--write-tree','HEAD',targetSha],{cwd:root,encoding:'utf8',maxBuffer:4e6});assert.ok([0,1].includes(r.status));
 const lines=r.stdout.split('\n'),tree=lines[0],conflicts=[...new Set(lines.filter(x=>/^100\d+\s+\w+\s+[123]\t/.test(x)).map(x=>x.split('\t')[1]))],show=(ref,p)=>git('show',ref+':'+p);
 const mainManifest=JSON.parse(show(targetSha,'data/manifest.json')),mainData=JSON.parse(show(targetSha,mainManifest.dataset_path)),mergedManifest=JSON.parse(show(tree,'data/manifest.json'));
 const changedSections={};for(const k of [...new Set([...Object.keys(data),...Object.keys(mainData)])])if(stable(data[k])!==stable(mainData[k])){const a=data[k],b=mainData[k];changedSections[k]=Array.isArray(a)?{branchCount:a.length,mainCount:b.length}:a&&typeof a==='object'?{branchCount:Object.keys(a).length,mainCount:Object.keys(b).length,changedKeys:[...new Set([...Object.keys(a),...Object.keys(b)])].filter(id=>stable(a[id])!==stable(b[id]))}:{changed:true};}
 async function linkWorker(projection){const context=vm.createContext({}),modules=new Map(),get=p=>{if(!modules.has(p)){const ref=projection&&!conflicts.includes(p)?tree:stamp.auditedHead;modules.set(p,new vm.SourceTextModule(show(ref,p),{context,identifier:p}));}return modules.get(p);};try{await get('assets/cm-worker.mjs').link((specifier,from)=>get(path.posix.normalize(path.posix.join(path.posix.dirname(from.identifier),specifier))));return {linked:true,moduleCount:modules.size};}catch(e){return {linked:false,error:e.message};}}
 const branchLink=await linkWorker(false),chooseV1Link=await linkWorker(true);assert.equal(branchLink.linked,true);
 const fixture=read('docs/validation/cm-v11-reaudit-plans-20261118.json').records[0],t=prepareChart(data,profiles,{},fixture.input,{samples:1,dt:.05}),on=createFinalSetup(t,{...fixture.actual,maintainTargetAcceleration:true,maintainStrategicSkills:true}),off=createFinalSetup(t,{...fixture.actual,maintainTargetAcceleration:false,maintainStrategicSkills:false});
 const input=fixture.input,mainKey=checklistPlanKey(input,mainManifest.checklist_data_sha256||mainManifest.active_version),branchKey=checklistPlanKey(input,manifest.checklist_data_sha256||manifest.active_version),example={states:{[fixture.ownedId]:'owned'},postTraining:{values:fixture.actual},savedAt:'2026-11-18T00:00:00.000Z'};
 const recordsMigration={branchChecklistDataSha256:manifest.checklist_data_sha256,mainChecklistDataSha256:mainManifest.checklist_data_sha256,keysDiffer:branchKey!==mainKey,mainDraftRestoredOnBranch:!!restoreChecklistPlan({[mainKey]:example},input,manifest).plan,branchDraftRestoredWithMainData:!!restoreChecklistPlan({[branchKey]:example},input,mainManifest).plan,scope:'In-memory example not restored under the other namespace; existing stored records were not deleted or modified'};
 const out={status:r.status?'blocked':'mergeable',target:targetSha,mergeBase:git('merge-base','HEAD',targetSha),divergence:git('rev-list','--left-right','--count',targetSha+'...HEAD'),conflictedFiles:conflicts,provisionalMergeTree:tree,branchCoreStatus:core.status,branchWorkerLink:branchLink,counterfactualChooseV1ForAllConflicts:{scope:'Only a counterfactual module-link check, not a resolved merge or production modification',workerLink:chooseV1Link},mergedDataVersion:mergedManifest.active_version,mergedDataMatchesV1:mergedManifest.active_version===manifest.active_version,changedDataSections:changedSections,mainPolicyInputs:{maintainTargetAccelerationNormalized:on.maintainTargetAcceleration??null,maintainStrategicSkillsNormalized:on.maintainStrategicSkills??null,onOffIdenticalInV1:stable(on)===stable(off)},recordsMigration};
 save('integration',out);console.log(JSON.stringify({status:out.status,target:targetSha,conflicts:conflicts.length,projectionLink:chooseV1Link,dataMatchesV1:out.mergedDataMatchesV1,recordsMigration}));if(out.status==='blocked')process.exitCode=1;
}
if(process.argv.includes('--oracle')){
 const source=read('docs/validation/cm-v11-reaudit-plans-20261118.json'),hierarchy=buildAcquisitionHierarchy(data),graph=Object.fromEntries([...hierarchy.lower].map(([id,low])=>[id,[...low]])),origins=inheritanceOrigins(data),results=[];
 for(const [key,trait,budgets]of [['mile','studious',[300,520]],['long','fast-learner',[300,520]]]){
  const base=source.records.find(r=>r.key===key),ids=[...new Set([...base.candidateIds.slice(0,6),base.ownedId])],t=prepareChart(data,profiles,{},base.input,{samples:1,dt:.05}),chart={setup:t.setup,nativeIds:t.nativeIds,rows:t.rows.filter(r=>ids.includes(r.id)),evolutionOptions:[],modelVersion:t.modelVersion},states=Object.fromEntries(ids.map((id,i)=>[id,String([0,5,2,4,1,3,0][i])])),actual={...base.actual,stats:{...base.actual.stats,stamina:2100},discountTrait:trait};states[base.ownedId]='owned';assert.equal(chart.rows.length,ids.length);
  const setup={...createFinalSetup(chart,actual),ownedSkillIds:[base.ownedId],possessionGraph:graph,inheritanceOrigins:origins},required=activeSkillIds([...t.nativeIds,base.ownedId],graph),compiled=new Map([...new Set([...ids,...required])].map(id=>[id,compileChartSkill(data.skills[id],setup)])),ev=new RaceEvaluator(setup,compiled,required,t.nativeIds,branchSampler),rules=selectionRules(data,new Map(Object.entries(data.skills))),constraints=createAcquisitionConstraints(data,setup),available=ids.filter(id=>id!==base.ownedId),plans=new Map();
  for(let mask=0;mask<2**available.length;mask++){
   const active=activeSkillIds([...required,...available.filter((id,i)=>mask&(1<<i))],graph),id=active.join(',');if(plans.has(id))continue;
   if(!required.every(id=>active.includes(id)||active.some(high=>hierarchy.lower.get(high)?.has(id)))||active.some((id,i)=>active.slice(0,i).some(other=>!rules.compatible(id,other)))||!constraints.allowed([...active,base.ownedId]))continue;
   const cost=independentPrice(active,states,trait);if(cost===null||cost>Math.max(...budgets))continue;plans.set(id,{ids:active,cost,...ev.evaluate(active,144,.01)});
  }
  for(const budget of budgets){const oracle=[...plans.values()].filter(p=>p.cost<=budget).sort(compareRacePlans)[0],p=await recommendFinalPlan(data,chart,states,{...actual,spBudget:budget},{samples:144,dt:.01,diagnostics:false}),priced=independentPrice(p.activeIds,p.acquisition,trait),score=ev.evaluate(p.activeIds,144,.01);assert.equal(p.search.method,'exhaustive');assert.equal(p.budget.used,priced);assert.ok(compareRacePlans({ids:p.activeIds,cost:priced,...score},oracle)<=0);assert.ok(Math.abs(p.gain-score.gain)<1e-10);results.push({key,input:base.input,actual:{...actual,spBudget:budget},states,enumeratedMasks:2**available.length,affordableDistinctPlans:[...plans.values()].filter(p=>p.cost<=budget).length,recommendation:{ids:p.activeIds,cost:priced,gain:p.gain,hpSuccessRate:p.hpSuccessRate},oracle:{ids:oracle.ids,cost:oracle.cost,gain:oracle.gain,hpSuccessRate:oracle.hpSuccessRate},objectiveMatch:true});console.log('real pool oracle passed',key,trait,budget);}
 }
 save('oracle',{status:'passed',scope:'Fresh finite-pool subset enumeration and independent integer prices; shared current race physics and comparator, not empirical accuracy or a new global proof for bounded search',records:results});
}
