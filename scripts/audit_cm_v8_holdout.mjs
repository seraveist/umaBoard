// Audit only: production assets and the frozen dataset must not change.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareChart,createChartSetup,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {styleRecommendation,selectInheritedTop} from '../assets/cm-recommendation.mjs';
import {raceScenario,contextDomains} from '../assets/race-scenarios.mjs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds} from '../assets/cm-state.mjs';
import {activeSkillIds} from '../assets/skill-context.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const write=(p,x)=>fs.writeFileSync(new URL(p,root),JSON.stringify(x,null,2)+'\n');
const assetHash=()=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL('assets/',root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
const frozenHash='a31b903c52d3a850e9ebcb7e6796d491e2fab10916a9668653c4112fe65f44de';assert.equal(assetHash(),frozenHash);
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const previous=read('docs/validation/cm-v7-guide-audit-20261118.json');
const priorCourses=new Set(Object.values(previous.matrix.raceSettings).map(r=>r.courseId));
const hierarchy=buildAcquisitionHierarchy(data),graph=Object.fromEntries([...hierarchy.lower].map(([id,lower])=>[id,[...lower]]));
const stats={speed:2100,stamina:2000,power:1700,guts:1400,wisdom:1500},aptitudes={distance:'S',surface:'A',style:'A'},samples=144,dt=.01;
// Race settings and qualitative questions were selected from new sources
// BEFORE running the frozen engine. No coefficient fitting or pass-rate target.
const races=[
 {key:'niigata1200',courseId:'10302',name:'2025-10 Niigata turf1200',season:3,weather:2,going:1,guide:'https://merci-splatoon.com/2510sprint-1/',conditionsSource:'https://x.com/uma_musu/status/1972134376717828119',styles:[2,3,4],skills:['900511','900271','200651','200341','200671','200641','200491','201581','201412','202172'],questions:['No slope skill can activate','Tsubomi is a viable rear-style inheritance, not restricted to front style','Random acceleration guides disagree; do not label the preference a measured truth']},
 {key:'chukyo-dirt1800',courseId:'10708',name:'2024-08 Chukyo dirt1800',season:2,weather:1,going:1,guide:'https://merci-splatoon.com/2408-dir-1/',conditionsSource:'https://gamewith.jp/uma-musume/article/show/455879',styles:[1,2,3,4],skills:['900041','900201','900591','900271','202671','201681','200601','202401','200491','200641'],questions:['Corner accelerations are viable','Front/rear rank gates depend on team composition; a single unconditional rank prior is inadequate']},
 {key:'kyoto3200',courseId:'10811',name:'2025-04 Kyoto turf3200',season:1,weather:1,going:1,guide:'https://merci-splatoon.com/2504long-1/',conditionsSource:'https://gamewith.jp/uma-musume/article/show/488825',styles:[2,3,4],skills:['202481','202421','200641','202871','111501111','202771','201581','200491'],questions:['Original Gunrin inactive, Orfe evolution active','Straight acceleration and long-distance specialist accelerations remain viable']},
 {key:'hanshin1600',courseId:'10903',name:'2025-03 Hanshin turf1600',season:1,weather:1,going:1,guide:'https://merci-splatoon.com/2503mile-1/',conditionsSource:'https://gamewith.jp/uma-musume/article/show/484085',styles:[2,3,4],skills:['900511','900271','202671','200641','201341','200341','200601','202401'],questions:['Tsubomi works for rear styles','Straight acceleration is late and has limited additional contribution','Sommelier is a low-priority gamble rather than a guaranteed acceleration']},
 {key:'hanshin2400',courseId:'10907',name:'2025-01 Hanshin turf2400',season:4,weather:3,going:3,guide:'https://merci-splatoon.com/2501-cla-1/',conditionsSource:'https://gamewith.jp/uma-musume/article/show/477855',styles:[2,3,4],skills:['202711','202871','200641','900041','900701','900591','200491'],questions:['King and Gunrin can be useful outside Tokyo/Longchamp','Straight acceleration is too late']},
 {key:'delmar2000',courseId:'11709',name:'2026-04 Del Mar dirt2000',season:1,weather:1,going:1,guide:'https://merci-splatoon.com/2604dirt-1/',conditionsSource:'https://gamewith.jp/uma-musume/article/show/550627',styles:[2,3,4],skills:['202711','202871','200641','900591','900041','200491','201581','202172'],questions:['Straight acceleration is too late','No slope skills can activate','King cannot satisfy the remaining-distance gate at the final corner']}
];
for(const r of races){assert.ok(!priorCourses.has(r.courseId));assert.ok(data.courses[r.courseId].selectable);}
const preregistration={date:'2026-11-18 Asia/Seoul',frozenCommit:'a21a0cc52624de95682b2f7be3755104949366ad',frozenAssetsSha256:frozenHash,dataVersion:manifest.active_version,races,stats,aptitudes,samples,dt,interpretation:'new-course guide checks and sensitivity analysis; not measured game race outcomes'};
fs.mkdirSync(new URL('.cache/',root),{recursive:true});write('.cache/cm-v8-holdout-preregistered.json',preregistration);
const input=(r,style)=>({outfitId:'102201',style,courseId:r.courseId,scenarioId:'12',supportIds:[],season:r.season,weather:r.weather,going:r.going,time:2});
const setup=(r,style,extra={})=>({...createChartSetup(data,profiles,input(r,style)),stats,aptitudes,possessionGraph:graph,...extra});
function evaluate(s,ids,baseline=[],count=samples,step=dt){
 const all=[...new Set([...ids,...baseline,...(s.ownedSkillIds||[])])],compiled=new Map(all.map(id=>[id,compileChartSkill(data.skills[id],s)]));
 const ev=new RaceEvaluator(s,compiled,activeSkillIds(baseline,graph),[],branchSampler),value=ev.evaluate(ids,count,step);
 return {gain:value.gain,activationRates:value.activationRates,usefulAccelerationRates:value.usefulAccelerationRates,performance:value.performance,hpSuccessRate:value.hpSuccessRate,scenarioSensitivity:value.scenarioSensitivity,scenarioCoverage:value.scenarioCoverage,calculation:all.map(id=>({id,status:compiled.get(id).status,notes:compiled.get(id).calculationNotes})),scenarios:value.scenarios};
}
const out={...preregistration,matrix:[],unsupportedRaces:[],inheritancePolicy:[],plans:[],contextSensitivity:[],domainSensitivity:[]};
if(!process.argv.includes('--plans-only')){
 for(const r of races){
  try{setup(r,r.styles[0]);}catch(error){out.unsupportedRaces.push({race:r.key,courseId:r.courseId,message:error.message,interpretation:'kept in audit denominator; production safety gate not bypassed'});console.log('unsupported',r.key,error.message);continue;}
  for(const style of r.styles){const s=setup(r,style);for(const id of r.skills)out.matrix.push({race:r.key,style,id,name:data.skills[id].name_jp,...evaluate(s,[id])});}console.log('matrix',r.key);
 }
 for(const r of races.filter(r=>['niigata1200','hanshin1600'].includes(r.key)))for(const style of [2,3,4]){
  const task=prepareChart(data,profiles,display,input(r,style),{samples,dt}),row=task.rows.find(row=>row.id==='900511');assert.ok(row);
  const scored=task.evaluate(row),renamed={...data.skills[row.id],id:'audit-identical-effect'},renamedPolicy=styleRecommendation(renamed,compileChartSkill(renamed,task.setup),task.setup);
  out.inheritancePolicy.push({race:r.key,style,firstChartGain:scored.gain,recommendation:row.recommendation,admittedWhenOnlyCandidate:selectInheritedTop([scored]).length===1,identicalRenamedPolicy:renamedPolicy,comparisonBasis:scored.comparisonBasis});
 }
 // Same marginal stress values, shifted relative to the unchanged rank paths.
 for(const key of ['niigata1200','chukyo-dirt1800','kyoto3200']){
  const r=races.find(r=>r.key===key),style=key==='kyoto3200'?2:3,s=setup(r,style),ids=key==='kyoto3200'?['202481','200491']:['900511','200491'].filter(id=>key==='niigata1200'||id!=='900511');
  const cases=Array.from({length:9},(_,i)=>raceScenario(s,i));
  for(const shift of [0,1,3,5,7]){
   const raceContext={scenarioSource:'synthetic correlation stress, same per-field marginal values; not measured',scenarios:cases.map((c,i)=>({id:c.id,weight:1,context:{...c.context,conditions:cases[(i+shift)%9].context.conditions}}))};
   out.contextSensitivity.push({race:key,style,ids,shift,...evaluate({...s,raceContext},ids)});
  }
 }
 const long=races.find(r=>r.key==='kyoto3200'),s=setup(long,2),unused={id:'audit-unused-domain-record',invocations:[{condition:[[{field:'distance_diff_top',operator:'<=',value:1000000}]],precondition:[]}]};
 const altered=contextDomains({skills:{...data.skills,[unused.id]:unused}});
 out.domainSensitivity.push({race:long.key,id:'202481',ordinary:evaluate(s,['202481']),withUnusedThresholdRecord:evaluate({...s,externalDomains:altered},['202481']),ordinaryDomain:s.externalDomains.distance_diff_top,alteredDomain:altered.distance_diff_top,interpretation:'diagnostic counterfactual only; unused record is not a real released skill'});
 write('.cache/cm-v8-holdout-matrix.json',out);if(process.argv.includes('--matrix-only'))process.exit(0);
}
if(process.argv.includes('--plans-only'))Object.assign(out,read('.cache/cm-v8-holdout-matrix.json'));
// Deliberately small diagnostic pools. White skills are explicit supplied
// factor hints, inheritance is explicitly secured; no gold event fabrication.
const recipes=[
 {race:'niigata1200',style:3,ids:['900511','900271','200652','200962','200972','201382','201392'],actualStats:{speed:1850,stamina:700,power:1700,guts:1400,wisdom:1200},statsSource:'https://umamusumelabo.com/ikusei/chanmi-sasiikusei-202510'},
 {race:'hanshin1600',style:3,ids:['900511','900271','201032','201042','201382','201392']},
 {race:'hanshin2400',style:3,ids:['900041','900591','900701','201102','201112','201382','201392']},
 {race:'delmar2000',style:3,ids:['900041','900591','201102','201112','201382','201392']}
];
for(const recipe of recipes){
 if(out.unsupportedRaces.some(r=>r.race===recipe.race)){console.log('plan unsupported',recipe.race);continue;}
 const r=races.find(r=>r.key===recipe.race),t=prepareChart(data,profiles,display,input(r,recipe.style),{samples:1,dt:.05});
 const available=new Map(t.rows.map(r=>[r.id,r])),ids=[...new Set(recipe.ids.flatMap(id=>[id,...relatedAcquisitionIds(hierarchy,id)]))];
 for(const id of ids)assert.ok(available.has(id),`Unavailable diagnostic candidate ${r.key} ${id}`);
 const rows=ids.map(id=>available.get(id)),chart={setup:t.setup,nativeIds:t.nativeIds,rows,modelVersion:t.modelVersion,evolutionOptions:[]},states=Object.fromEntries(ids.map(id=>[id,'5']));
 for(const tailMass of [.1,.25,.5,1]){
  const actual={stats:recipe.actualStats??stats,aptitudes,spBudget:300,riskPolicy:{tailMass,maxTailDelay:0}};
  const p=await recommendFinalPlan(data,chart,states,actual,{samples,dt,diagnostics:false});assert.ok(p.search.globalOptimal);
  out.plans.push({race:recipe.race,style:recipe.style,tailMass,actual,statsSource:recipe.statsSource??'controlled common stats, not a historical training replay',availableIds:ids,activeIds:p.activeIds,gain:p.gain,budget:p.budget,performance:p.performance,search:p.search,acquisitionValidation:p.acquisitionValidation,notes:'Explicitly secured factor/inheritance diagnostic pool, not an optimal real deck or a tournament win-rate test'});
  console.log('plan',recipe.race,tailMass,p.gain,p.activeIds.join(','));write('.cache/cm-v8-holdout-plans.json',out.plans);
 }
}
assert.equal(assetHash(),frozenHash);write('docs/validation/cm-v8-holdout-20261118.json',out);console.log('holdout audit complete');
