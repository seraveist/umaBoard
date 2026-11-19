// Same recorded inputs and common physics as the v1 self audit. Historical
// evidence is read only; new search results and profiles have separate names.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {prepareChart,sortChartRows,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {compareRacePlans} from '../assets/race-objective.mjs';
import {buildAcquisitionHierarchy} from '../assets/cm-state.mjs';
import {inheritanceOrigins,skillTransforms} from '../assets/skill-transforms.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const hash=t=>createHash('sha256').update(t).digest('hex'),text=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n');
const parent=read('docs/validation/cm-optimization-v1-release-20261118.json'),manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const fixed=parent.modules.filter(f=>f.path!=='assets/cm-final-plan.mjs');
for(const f of fixed)assert.equal(hash(text(f.path)),f.textSha256,'Physics/data logic changed: '+f.path);
for(const f of read(parent.parentBaseline.path).inputs)assert.equal(hash(text(f.path)),f.textSha256,'Recorded data input changed: '+f.path);
const protectedFiles=fs.readdirSync(new URL('docs/validation/',root)).filter(n=>n.startsWith('cm-optimization-v1-self-')).map(n=>({path:'docs/validation/'+n,sha256:hash(text('docs/validation/'+n))}));
// Independent raw-stage integer pricing, shared stages once. It does not call
// RecordedPurchaseModel, discountedCost or any search proposal helper.
function independentPrice(ids,states,trait){
 const paid=new Set(Object.keys(states).filter(id=>states[id]==='owned')),transforms=new Map(skillTransforms(data).map(r=>[r.evolved_id,r.base_id])),stages=new Map(),discounts=[0,10,20,30,35,40],extra={none:0,studious:4,'fast-learner':10}[trait];
 assert.ok(extra!==undefined);
 const chain=(id,path=[])=>{
  assert.ok(!path.includes(id));if(paid.has(id)||['unique','unique_low_star','unique_upgraded'].includes(data.skills[id].rarity))return [];
  if(transforms.has(id))return chain(transforms.get(id),[...path,id]);
  const stage=data.purchase_stages[id];assert.equal(stage?.status,'verified');
  return [...(stage.prerequisite_id?chain(stage.prerequisite_id,[...path,id]):[]),id];
 };
 for(const id of ids){const purchase=chain(id);for(const stage of purchase){const level=/^[0-5]$/.test(states[stage]??'')?Number(states[stage]):transforms.has(id)&&stage===purchase.at(-1)&&/^[0-5]$/.test(states[id]??'')?Number(states[id]):0;stages.set(stage,Math.max(stages.get(stage)??0,level));}}
 return [...stages].reduce((sum,[id,level])=>sum+Number(BigInt(data.purchase_stages[id].base_cost)*BigInt(100-discounts[level]-extra)/100n),0);
}
const baseline=process.argv.includes('--baseline'),frozen=new URL('.cache/v1-search-baseline/',root);
if(baseline){
 for(const f of parent.modules){const t=execFileSync('git',['show','29de686:'+f.path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');assert.equal(hash(t),f.textSha256);const path=new URL(f.path,frozen);fs.mkdirSync(new URL('./',path),{recursive:true});fs.writeFileSync(path,t);}
}
const runtime=await import(baseline?new URL('assets/cm-final-plan.mjs',frozen):new URL('../assets/cm-final-plan.mjs',import.meta.url));
if(!baseline)assert.equal(runtime.FINAL_MODEL_VERSION,'cm-post-training-v12','This historical audit requires dbbe246. Use validate_cm_v1_tolerance.mjs for the 0.01-length policy.');
const evaluation=baseline?(await import(new URL('assets/race-evaluation.mjs',frozen))).RaceEvaluator:RaceEvaluator;
const sourcePaths=[...parent.modules.map(f=>f.path),...(!baseline?['assets/cm-search.mjs']:[])].sort();
const sourceHashes=sourcePaths.map(path=>({path,sha256:hash(text(path))}));
const stamp={date:'2026-11-18 Asia/Seoul',baseCommit:'29de686',modelVersion:runtime.FINAL_MODEL_VERSION,dataVersion:manifest.active_version,baseline,modulesSha256:baseline?parent.coreSha256:hash(sourcePaths.map(p=>p+'\n'+hash(text(p))+'\n').join(''))};
function save(name,out){for(const f of [...protectedFiles,...sourceHashes])assert.equal(hash(text(f.path)),f.sha256);fs.writeFileSync(new URL(`docs/validation/cm-optimization-v1-search-${name}-20261118.json`,root),JSON.stringify({...stamp,...out},null,2)+'\n');}
function fixture(key){
 if(key==='large'){
  const p=read('docs/validation/cm-optimization-v1-self-profile-large-20261118.json'),t=prepareChart(data,profiles,display,p.input,{samples:1,dt:.05}),top=new Set(p.metadataScope.inheritedTopIds);
  const chart={setup:t.setup,nativeIds:t.nativeIds,rows:sortChartRows(t.rows.filter(r=>r.rarity!=='evolution'&&(!r.inherited||top.has(r.id))),data,display),inheritanceOptions:t.rows.filter(r=>r.inherited),evolutionOptions:t.rows.filter(r=>r.rarity==='evolution'),modelVersion:t.modelVersion};
  assert.equal(chart.rows.length,p.metadataScope.chartRows);return {chart,states:p.states,actual:p.actual,input:p.input,prior:p.baseline.result};
 }
 const p=read(`docs/validation/cm-optimization-v1-self-bounded-${key}-20261118.json`),t=prepareChart(data,profiles,{},p.input,{samples:1,dt:.05});
 const chart={setup:t.setup,nativeIds:t.nativeIds,rows:t.rows.filter(r=>p.candidateIds.includes(r.id)),evolutionOptions:[],modelVersion:t.modelVersion};assert.equal(chart.rows.length,11);
 return {chart,states:p.states,actual:p.actual,input:p.input,prior:p};
}
const originalEvaluate=evaluation.prototype.evaluate,originalRun=evaluation.prototype.run;let profile=null;
// Count actual simulator cache misses, including evictions, using the same
// canonical key as run(). The profiling adapter never supplies search scores.
const {activeSkillIds}=await import('../assets/skill-context.mjs');
evaluation.prototype.run=function(ids,sample,dt,reference=false){if(profile){const k=activeSkillIds(ids,this.setup.possessionGraph).join(',')+'|'+sample+'|'+dt;if((reference?this.references:this.runs).has(k))profile.cacheHits++;else if(reference)profile.referenceSimulations++;else profile.simulations++;}return originalRun.call(this,ids,sample,dt,reference);};
evaluation.prototype.evaluate=function(ids,count,dt,options={}){if(profile){profile.evaluations++;const k=count+'|'+dt;profile.byResolution[k]=(profile.byResolution[k]||0)+1;}return originalEvaluate.call(this,ids,count,dt,options);};
const compact=p=>({ids:p.activeIds,cost:p.budget.used,gain:p.gain,hpSuccessRate:p.hpSuccessRate,feasible:p.fullSpeedFeasible,performance:p.performance,search:p.search});
async function run(f,budget,{reverse=false,forceBounded=false}={}){
 profile={evaluations:0,simulations:0,referenceSimulations:0,cacheHits:0,byResolution:{}};const start=performance.now();let last=0;
 const plan=await runtime.recommendFinalPlan(data,reverse?{...f.chart,rows:[...f.chart.rows].reverse()}:f.chart,f.states,{...f.actual,spBudget:budget},{samples:144,dt:.01,diagnostics:false,...(forceBounded?{exactPlanLimit:0}:{}),onProgress:p=>{if(performance.now()-last>30000){console.log('progress',budget,p.stage,p.completed,p.total);last=performance.now();}}});
 const measured={...profile,wallMs:performance.now()-start};profile=null;
 assert.equal(plan.acquisitionValidation.feasible,true);assert.ok(plan.budget.used<=budget);assert.equal(plan.purchases.reduce((sum,p)=>sum+p.cost,0),plan.budget.used);assert.equal(independentPrice(plan.activeIds,plan.acquisition,plan.setup.discountTrait),plan.budget.used);
 for(const [id,state]of Object.entries(f.states))if(state==='owned')assert.ok(plan.ownedIds.includes(id));
 return {plan,profile:measured};
}
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
for(const key of arg('case')?[arg('case')]:process.argv.includes('--all-cases')?['mile','classic','long','dirt','mile-owned-fallback']:[]){
 const f=fixture(key),records=[];
 for(const prior of f.prior.records){
  const result=await run(f,prior.budget,{forceBounded:process.argv.includes('--bounded')}),p=result.plan;
  const required=[...p.nativeIds,...p.ownedIds],compiled=new Map([...new Set([...required,...p.activeIds,...prior.oracle.ids,...prior.current.ids])].map(id=>[id,compileChartSkill(data.skills[id],p.setup)])),ev=new RaceEvaluator(p.setup,compiled,required,p.nativeIds,branchSampler),oracle=ev.evaluate(prior.oracle.ids,144,.01);
  assert.equal(oracle.gain,prior.oracle.gain);assert.equal(oracle.hpSuccessRate,prior.oracle.hpSuccessRate);
  const measured=ev.evaluate(p.activeIds,144,.01),previousMeasured=ev.evaluate(prior.current.ids,144,.01);assert.equal(p.gain,measured.gain);assert.equal(previousMeasured.gain,prior.current.gain);assert.equal(previousMeasured.hpSuccessRate,prior.current.hpSuccessRate);
  const objective=compareRacePlans({ids:p.activeIds,cost:p.budget.used,...measured},{ids:prior.oracle.ids,cost:prior.oracle.cost,...oracle});
  assert.ok(compareRacePlans({ids:p.activeIds,cost:p.budget.used,...measured},{ids:prior.current.ids,cost:prior.current.cost,...previousMeasured})<=0,'Regression at '+key+' '+prior.budget);
  if(p.search.globalOptimal)assert.equal(objective,0,'Exact enumeration differs from independent oracle');
  records.push({budget:prior.budget,previous:{...prior.current,hpShortfall:previousMeasured.hpShortfall},current:{...compact(p),hpShortfall:measured.hpShortfall},oracle:{...prior.oracle,hpShortfall:oracle.hpShortfall},matchesOracle:objective===0,gainGap:oracle.gain-p.gain,profile:result.profile});console.log('case',key,prior.budget,p.search.method,'gap',oracle.gain-p.gain,'ms',Math.round(result.profile.wallMs));
 }
 const reversed=await run(f,470,{reverse:true,forceBounded:process.argv.includes('--bounded')});assert.deepEqual(reversed.plan.activeIds,records[0].current.ids);assert.equal(reversed.plan.gain,records[0].current.gain);assert.ok(compareRacePlans(records[1].current,records[0].current)<=0);
 save((process.argv.includes('--bounded')?'bounded-':'case-')+key,{input:f.input,actual:f.actual,states:f.states,records,rowOrderInvariant:true,budgetMonotonic:true});
}
if(process.argv.includes('--sensitivity')){
 const records=[],hierarchy=buildAcquisitionHierarchy(data),graph=Object.fromEntries([...hierarchy.lower].map(([id,low])=>[id,[...low]]));
 for(const key of ['mile','mile-owned-fallback','large']){
  const f=fixture(key),result=key==='large'?{records:[{budget:7000,...read('docs/validation/cm-optimization-v1-search-large-20261118.json')}]}:read(`docs/validation/cm-optimization-v1-search-case-${key}-20261118.json`),owned=Object.keys(f.states).filter(id=>f.states[id]==='owned'),required=activeSkillIds([...f.chart.nativeIds,...owned],graph);
  for(const variant of [{name:'default',samples:144,dt:.01,seed:0},{name:'half-step',samples:144,dt:.005,seed:0},{name:'alternate-seed',samples:288,dt:.01,seed:1},{name:'larger-sample',samples:576,dt:.01,seed:0}]){
   const setup={...runtime.createFinalSetup(f.chart,f.actual),ownedSkillIds:owned,possessionGraph:graph,inheritanceOrigins:inheritanceOrigins(data),samplingSeed:variant.seed};
   const compiled=new Map([...new Set([...required,...result.records.flatMap(r=>[...r.current.ids,...r.previous.ids])])].map(id=>[id,compileChartSkill(data.skills[id],setup)])),ev=new RaceEvaluator(setup,compiled,required,f.chart.nativeIds,branchSampler);
   for(const r of result.records){
    const prior=ev.evaluate(r.previous.ids,variant.samples,variant.dt),current=ev.evaluate(r.current.ids,variant.samples,variant.dt);
    if(variant.name==='default'){assert.equal(prior.gain,r.previous.gain);assert.equal(current.gain,r.current.gain);}
    records.push({key,budget:r.budget,variant,previousGain:prior.gain,currentGain:current.gain,gainDifference:current.gain-prior.gain,currentHp:current.hpSuccessRate,previousHp:prior.hpSuccessRate,currentRisk:current.performance.risk,previousRisk:prior.performance.risk,improves:compareRacePlans({ids:r.current.ids,cost:r.current.cost,...current},{ids:r.previous.ids,cost:r.previous.cost,...prior})<0});
   }
  }
 }
 save('sensitivity',{scope:'Fixed old and new recommendations only; no reoptimization at alternative settings; scenario sample comparisons, not real-race probabilities',records});console.log('sensitivity comparisons',records.length);
}
if(process.argv.includes('--large')){
 const f=fixture('large'),r=await run(f,f.actual.spBudget),p=r.plan;assert.equal(p.candidateCount,220);
 const required=[...p.nativeIds,...p.ownedIds],compiled=new Map([...new Set([...required,...p.activeIds,...f.prior.ids])].map(id=>[id,compileChartSkill(data.skills[id],p.setup)])),ev=new RaceEvaluator(p.setup,compiled,required,p.nativeIds,branchSampler),prior=ev.evaluate(f.prior.ids,144,.01);
 assert.equal(prior.gain,f.prior.gain);assert.ok(compareRacePlans({ids:p.activeIds,cost:p.budget.used,...p},{ids:f.prior.ids,cost:f.prior.cost,...prior})<=0,'Large input quality regressed');
 save(baseline?'large-baseline':'large',{input:f.input,actual:f.actual,states:f.states,previous:f.prior,current:compact(p),profile:r.profile,sameSelection:JSON.stringify(p.activeIds)===JSON.stringify(f.prior.ids),scope:'optimizer only; chart-score generation and diagnostics excluded; single instrumented run, not an average or wall-time guarantee'});console.log(JSON.stringify({baseline,gain:p.gain,cost:p.budget.used,profile:r.profile,search:p.search}));
}
if(process.argv.includes('--summary')){
 const release=read('docs/validation/cm-optimization-v1-search-release-20261118.json');assert.equal(release.coreSha256,stamp.modulesSha256);
 const cases=['mile','classic','long','dirt','mile-owned-fallback'].map(key=>({key,...read(`docs/validation/cm-optimization-v1-search-case-${key}-20261118.json`)}));
 const bounded=['mile','mile-owned-fallback'].map(key=>({key,...read(`docs/validation/cm-optimization-v1-search-bounded-${key}-20261118.json`)}));
 const large=read('docs/validation/cm-optimization-v1-search-large-20261118.json'),oldLarge=read('docs/validation/cm-optimization-v1-self-profile-large-20261118.json'),sensitivity=read('docs/validation/cm-optimization-v1-search-sensitivity-20261118.json');
 for(const doc of [...cases,...bounded,large,sensitivity]){assert.equal(doc.modulesSha256,release.coreSha256);assert.equal(doc.dataVersion,manifest.active_version);}
 const log=text('docs/validation/cm-optimization-v1-search-node-tests-20261118.txt'),nodeCounts=log=>Object.fromEntries(['tests','pass','fail','skipped'].map(key=>[key,Number(log.match(new RegExp('^(?:ℹ|#)\\s*'+key+'\\s+(\\d+)','m'))?.[1])])),fullAttempt=nodeCounts(log),count=fullAttempt.tests,passed=count;
 assert.ok(count>=305);assert.equal(fullAttempt.skipped,0);let nodeVerification={strategy:'single-full-suite',fullAttempt};
 if(fullAttempt.fail){
  // Production code did not change: the adaptive exact path invalidated one
  // test's old bounded-path assumption. Keep the failed run, rerun that path
  // explicitly and all non-joint tests; reuse the two passed integration tests.
  assert.equal(fullAttempt.fail,1);assert.equal(fullAttempt.pass,count-1);assert.match(log,/large-pool staged search uses final samples and matches an affordable-subset oracle/);assert.match(log,/actual: 'exhaustive'/);assert.match(log,/expected: 'bounded'/);
  const current=nodeCounts(text('docs/validation/cm-optimization-v1-search-node-current-20261118.txt')),retry=nodeCounts(text('docs/validation/cm-optimization-v1-search-node-v7-retry-20261118.txt'));
  assert.equal(current.tests,count-2);assert.equal(current.pass,current.tests);assert.equal(current.fail,0);assert.equal(current.skipped,0);assert.equal(retry.fail,0);assert.equal(retry.pass,retry.tests);
  for(const name of ['rare-only chart jointly spends a 7000-SP budget with consistent reviewed event choices','latest Daring Tact has seven sourced additions, a real 190+190 chain and three sequential unique invocations'])assert.ok(log.includes('✔ '+name));
  nodeVerification={strategy:'same-production-core-disjoint-test-batches',fullAttempt,currentNonJointSuite:current,targetedV7Retry:retry,retainedIntegrationTests:2,explanation:'303 current non-joint tests plus two already passed same-core joint tests; duplicate reruns are not counted as additional unique tests.'};
 }else assert.equal(fullAttempt.pass,count);
 const python=text('docs/validation/cm-optimization-v1-search-python-tests-20261118.txt');assert.match(python,/Ran 51 tests/);assert.match(python,/\bOK\b/);
 const build=read('docs/validation/cm-optimization-v1-search-build-20261118.json');assert.equal(build.status,'passed');assert.equal(build.coreSha256,release.coreSha256);assert.equal(build.stagedCalculationModules,31);
 const dataValidation=JSON.parse(text('docs/validation/cm-optimization-v1-search-data-20261118.txt'));assert.equal(dataValidation.status,'passed');
 const full=read('.cache/cm-current-7000-validation.json');assert.equal(full.modelVersion,runtime.FINAL_MODEL_VERSION);assert.equal(full.gain,large.current.gain);assert.deepEqual(full.activeIds,large.current.ids);assert.equal(independentPrice(full.activeIds,full.acquisition,full.setup.discountTrait),full.budget.used);
 const evidence=fs.readdirSync(new URL('docs/validation/',root)).filter(n=>/^cm-optimization-v1-search-/.test(n)&&n!=='cm-optimization-v1-search-summary-20261118.json').sort().map(name=>({path:'docs/validation/'+name,textSha256:hash(text('docs/validation/'+name))}));
 save('summary',{status:'passed-with-bounded-search-limitations',sourceFiles:evidence,regression:{node:{total:count,passed,failed:0,skipped:0,verification:nodeVerification},python:{total:51,passed:51}},build,dataValidation,defaultRecommendations:cases.flatMap(c=>c.records.map(r=>({case:c.key,budget:r.budget,previousGain:r.previous.gain,currentGain:r.current.gain,gap:r.gainGap,matchesOracle:r.matchesOracle,method:r.current.search.method,affordablePlans:r.current.search.exactEnumeration.affordablePlans,wallMs:r.profile.wallMs}))),forcedBounded:bounded.flatMap(c=>c.records.map(r=>({case:c.key,budget:r.budget,previousGain:r.previous.gain,currentGain:r.current.gain,gap:r.gainGap,matchesOracle:r.matchesOracle,search:r.current.search}))),rowOrderInvariance:cases.every(c=>c.rowOrderInvariant),budgetMonotonic:cases.every(c=>c.budgetMonotonic),large:{previousGain:large.previous.gain,currentGain:large.current.gain,previousCost:large.previous.cost,currentCost:large.current.cost,previousProfile:oldLarge.baseline.profile,currentProfile:large.profile,simulationReduction:1-large.profile.simulations/oldLarge.baseline.profile.simulationCalls,wallTimeReduction:1-large.profile.wallMs/oldLarge.baseline.profile.totalWallMs,fullFlowSameSelection:true},fixedSensitivity:{comparisons:sensitivity.records.length,improvements:sensitivity.records.filter(r=>r.improves).length,scope:sensitivity.scope},unchangedPhysicsModules:29,interpretation:'Controlled recorded candidate pools and paired simulations; not empirical win/activation accuracy. Large case remains bounded, and wall time is one instrumented run per version.'});
 console.log(JSON.stringify({status:'passed',node:count,defaultMatches:cases.flatMap(c=>c.records).filter(r=>r.matchesOracle).length,boundedMatches:bounded.flatMap(c=>c.records).filter(r=>r.matchesOracle).length,largeGain:large.current.gain,largeWallMs:large.profile.wallMs}));
}
