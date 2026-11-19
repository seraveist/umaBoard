// External-guide audit of the frozen v7 engine. This script does not tune it.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {prepareChart,createChartSetup,compileChartSkill,branchSampler,CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds} from '../assets/cm-state.mjs';
import {lengthsBetween} from '../assets/physics.mjs';
import {activeAcquisitionRoute} from '../assets/acquisition-rules.mjs';
import {ENCOUNTER_POLICY,raceScenario,contextDomains} from '../assets/race-scenarios.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const ENGINE='af941ca14f0ddce37e0dec870a375c2b1b79a51a';
assert.equal(execFileSync('git',['diff',ENGINE,'--','assets','curated/cm-scenario-profiles.json','curated/cm-skill-display.json'],{cwd:root,encoding:'utf8'}).trim(),'','Audit requires the frozen v7 engine and chart settings');
assert.equal(CM_MODEL_VERSION,'cm-first-chart-v7');
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
assert.equal(manifest.active_version,'0b105741168200654ef4ef6523e1cb0bc0b7d9852107f3d478ea0fdcd6b7ad26','Audit requires the reviewed data bundle');
const hierarchy=buildAcquisitionHierarchy(data),dt=.01,samples=144;
const ADV={speed:2100,stamina:1600,power:1600,guts:1200,wisdom:1700};
const AUTHOR={speed:2150,stamina:1600,power:1700,guts:1200,wisdom:1600};
const RACES={kyoto:{courseId:'10808',season:3,weather:2,going:1,time:2},tokyo1800:{courseId:'10603',season:3,weather:1,going:1,time:2},tokyo2400:{courseId:'10606',season:3,weather:1,going:1,time:2},longchamp:{courseId:'11203',season:3,weather:1,going:4,time:2},nakayama:{courseId:'10506',season:4,weather:1,going:1,time:2}};
const FRONT_DECK=['30311','30282','30275','30304','30289','30305'],CHASE_DECK=['30311','30282','30312','30304','30289','30305'];
// Longchamp chaser control swaps the wisdom slot to Taishin30201, so Shadow
// is genuinely obtainable independently of CB30312's Gun reward branch.
const inputFor=(race,style,outfitId='112901')=>({...RACES[race],outfitId,style,bloom:5,uniqueLevel:6,scenarioId:'14',supportIds:style===4?(race==='longchamp'?CHASE_DECK.map(id=>id==='30289'?'30201':id):CHASE_DECK):FRONT_DECK});
const taskFor=(race,style,outfitId)=>prepareChart(data,profiles,display,inputFor(race,style,outfitId),{samples,dt});
const setupFor=(race,style,stats=ADV,extra={})=>({...taskFor(race,style,style===4?'100701':'112901').setup,stats,aptitudes:{distance:'S',surface:'A',style:'A'},...extra});
const closure=ids=>[...new Set(ids.flatMap(id=>[id,...relatedAcquisitionIds(hierarchy,id)]))];
const compiledFor=(setup,ids)=>new Map([...new Set(ids)].map(id=>{assert.ok(data.skills[id],id);return [id,compileChartSkill(data.skills[id],setup)];}));
const brief=s=>({gain:s.gain,minimumContext:s.robustGain,activationRates:s.activationRates,usefulAccelerationRates:s.usefulAccelerationRates,hpSuccessRate:s.hpSuccessRate,scenarios:s.scenarios,sampling:s.sampling,coverage:s.scenarioCoverage});
function score(setup,ids,baseline=[],count=samples){const compiled=compiledFor(setup,[...ids,...baseline]),ev=new RaceEvaluator(setup,compiled,baseline,[],branchSampler);return brief(ev.evaluate(ids,count,dt));}
function diagnostic(setup,baseline,target,count=samples){
 const ids=[...baseline,target],ev=new RaceEvaluator(setup,compiledFor(setup,ids),baseline,baseline.filter(id=>data.skills[id].rarity.startsWith('unique')),branchSampler);
 const value=brief(ev.evaluate(ids,count,dt)),gains=[],uses=[],traces=[];
 for(let sample=0;sample<count;sample++){
  const withSkill=ev.run(ids,sample,dt),without=ev.run(baseline,sample,dt,true),event=withSkill.events.find(e=>e.id===target),gain=lengthsBetween(withSkill,without);
  gains.push(gain);uses.push(withSkill.accelerationUseSeconds?.[target]??0);
  if(event&&traces.length<3)traces.push({sample,event,baselineEntry:without.entry,baselineReach:without.reach,additionalAccelerationSeconds:uses.at(-1),gain});
 }
 const sorted=[...gains].sort((a,b)=>a-b);
 return {...value,contribution:ev.marginal(ids,target,count,dt),sampleGainDistribution:{belowOrEqual005:gains.filter(g=>g<=.005).length,between005And01:gains.filter(g=>g>.005&&g<.1).length,atLeast01:gains.filter(g=>g>=.1).length,p90:sorted[Math.floor((count-1)*.9)],max:sorted.at(-1),count,interpretation:'coverage-samples-not-real-event-frequency'},meanAdditionalAccelerationSeconds:uses.reduce((a,b)=>a+b,0)/count,traces};
}
const stamp={date:'2026-11-18 Asia/Seoul',engineCommit:ENGINE,modelVersion:CM_MODEL_VERSION,dataVersion:manifest.active_version,samples,dt,interpretation:'external-guide-consistency-audit; not real-race replay or measured win-rate calibration'};
function priorCoverage(){
 const prior=read('docs/validation/cm-v7-20261118.json').same7000;
 const available=new Set(prepareChart(data,profiles,display,prior.input,{samples:1,dt:.05}).rows.map(r=>r.id));
 return {input:prior.input,stats:prior.actual.stats,targetRecords:['202711','202871'].map(id=>({id,state:available.has(id)?'candidate':'not-a-candidate',selected:prior.recommended.activeIds.includes(id)})),interpretation:'prior7000 success is not evidence against overvaluation of unavailable targets'};
}
const targets={2:['202711','202712','900041','900101','201342','91101411','203441','203442','200372'],4:['202871','202872','203902','91101351','200641','200642']};
const contexts=[
 {id:'almond-guide',outfit:'112901',style:2,core:['112901211','112901111','201342','91101411','203442','200492'],target:'202711'},
 {id:'fine-guide',outfit:'102201',style:2,core:['102201211','102201111','91101411','203442'],target:'202711'},
 {id:'goldship-minimal',outfit:'100701',style:4,core:['203902','91101351','202021'],target:'202871'},
 {id:'goldship-early',outfit:'100701',style:4,core:['203902','91101351','202021','203522'],target:'202871'}
];
fs.mkdirSync(new URL('.cache/',root),{recursive:true});
const rankOnly=process.argv.includes('--rank-plans-only');
let matrix,plans,extra,longPlans,rankPlans;
if(!rankOnly&&!process.argv.includes('--plans-only')&&!process.argv.includes('--extra-only')&&!process.argv.includes('--long-plans-only')&&!process.argv.includes('--collect')){
 matrix={...stamp,stats:ADV,raceSettings:RACES,courseCases:[],chartCases:[],contextCases:[],evolutionCases:[],rankSensitivity:[]};
 for(const race of Object.keys(RACES))for(const style of [2,4]){
  const setup=setupFor(race,style),ids=targets[style],compiled=compiledFor(setup,ids),ev=new RaceEvaluator(setup,compiled,[],[],branchSampler);
  for(const id of ids){const raw=compiled.get(id);matrix.courseCases.push({race,style,id,name:data.skills[id].name_jp,status:raw.status,earliestSpatialOffset:Math.min(...raw.invocations.flatMap(i=>i.condition.flatMap(b=>b.windows.map(w=>w[0]))))-setup.course.distance*2/3,...brief(ev.evaluate([id],samples,dt))});}
  console.log('Course checks:',race,style);
 }
 for(const ctx of contexts){
  const task=taskFor('kyoto',ctx.style,ctx.outfit),row=task.rows.find(r=>r.id===ctx.target);assert.ok(row,'Target must actually be available in the chart');
  matrix.chartCases.push({context:ctx.id,outfit:ctx.outfit,input:inputFor('kyoto',ctx.style,ctx.outfit),basis:'actual-first-chart-caps; native-only baseline; aptitude A',stats:task.setup.stats,id:ctx.target,...task.evaluate(row)});
  for(const [profile,stats]of [['gamewith-advanced',ADV],['player-target',AUTHOR]]){
   const setup={...task.setup,stats,aptitudes:{distance:'S',surface:'A',style:'A'},ownedSkillIds:closure(ctx.core)},baseline=[...task.nativeIds,...ctx.core];
   for(const fullSpurtMode of ['public','off'])matrix.contextCases.push({context:ctx.id,profile,stats,fullSpurtMode,baseline,id:ctx.target,...diagnostic({...setup,fullSpurtMode},baseline,ctx.target)});
  }
 }
 for(const [outfit,evolved,core]of [['111501','111501111',['203902','91101351']],['111401','111401211',['203902','91101351']]]){
  const task=taskFor('kyoto',4,outfit),setup={...task.setup,stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},ownedSkillIds:closure(core)},baseline=[...task.nativeIds,...core];
  matrix.evolutionCases.push({outfit,normal:'202871',evolved,normalResult:score(setup,[...baseline,'202871'],baseline),evolvedResult:score(setup,[...baseline,evolved],baseline),normalConditions:data.skills['202871'].invocations.map(i=>i.condition_raw),evolvedConditions:data.skills[evolved].invocations.map(i=>i.condition_raw)});
 }
 for(const rank of [1,3,5,7,9]){
  const ctx=contexts[2],task=taskFor('kyoto',4,ctx.outfit),setup={...task.setup,stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},ownedSkillIds:closure(ctx.core),raceContext:{rankTimeline:[{distance:0,rank}]}};
  matrix.rankSensitivity.push({rank,context:ctx.id,id:ctx.target,...diagnostic(setup,[...task.nativeIds,...ctx.core],ctx.target)});
 }
 fs.writeFileSync(new URL('.cache/cm-v7-guide-matrix.json',root),JSON.stringify(matrix,null,2));
 if(process.argv.includes('--matrix-only'))process.exit(0);
}
function controlledChart(ctx,available,allowEvolution=false,race='kyoto'){
 const task=taskFor(race,ctx.style,ctx.outfit),allIds=closure([...ctx.core,...available]),known=new Map(task.rows.map(r=>[r.id,r])),rows=[];
 const permitted=task.rows.filter(r=>r.rarity==='evolution'&&allowEvolution&&data.evolution_rules.some(rule=>rule.evolved_id===r.id&&rule.base_id===ctx.target));
 for(const id of [...new Set([...allIds,...permitted.map(r=>r.id)])]){
  const raw=data.skills[id],row=known.get(id);assert.ok(row||!available.includes(id),'Purchasable target must be present in source-matched chart: '+id);
  rows.push(row??{...raw,name:raw.name_jp,description:raw.description_jp,evolutionBaseId:data.evolution_rules.find(r=>r.evolved_id===id)?.base_id,inheritanceOriginId:task.setup.inheritanceOrigins[id]??null});
 }
 return {setup:task.setup,modelVersion:task.modelVersion,nativeIds:task.nativeIds,rows,evolutionOptions:[...rows.filter(r=>r.rarity==='evolution')],fullSpurtPolicy:'umasim-public-unbounded-approximation'};
}
if(!rankOnly&&!process.argv.includes('--matrix-only')&&!process.argv.includes('--extra-only')&&!process.argv.includes('--long-plans-only')&&!process.argv.includes('--collect')){
 plans={...stamp,controlled:[],evolution:[],priorBenchmark:null};
 const speed=style=>style===2?['201312','201322','201102','201112','200512']:['201452','201462','201102','201112','200512'];
 for(const ctx of contexts){
  const available=[ctx.target,ctx.style===2?'202712':'202872',...speed(ctx.style),...(ctx.style===4?['203522']:[])],chart=controlledChart(ctx,available);
  for(const hint of ['2','5'])for(const budget of [300,500,800]){
   const states=Object.fromEntries(chart.rows.map(r=>[r.id,'unavailable']));
   for(const id of closure(available))states[id]=hint;for(const id of ctx.core)states[id]='owned';
   const start=Date.now(),plan=await recommendFinalPlan(data,chart,states,{stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},spBudget:budget,discountTrait:'none'},{samples,dt,searchSamples:9,searchDt:.05,diagnostics:true});
   plans.controlled.push({context:ctx.id,outfit:ctx.outfit,style:ctx.style,core:ctx.core,available,recordedHint:Number(hint),budget,elapsedMs:Date.now()-start,target:ctx.target,targetApplied:plan.activeIds.includes(ctx.target),targetPurchased:plan.purchases.some(p=>p.id===ctx.target),activeIds:plan.activeIds,purchases:plan.purchases.map(p=>({id:p.id,name:p.name,cost:p.cost})),budgetResult:plan.budget,gain:plan.gain,minimumContext:plan.robustGain,hpSuccessRate:plan.hpSuccessRate,contributions:plan.marginalContributions,search:plan.search});
   console.log('Plan:',ctx.id,hint,budget,plan.activeIds.includes(ctx.target),plan.gain);
   fs.writeFileSync(new URL('.cache/cm-v7-guide-plans.json',root),JSON.stringify(plans,null,2));
  }
 }
 const ctx={id:'orfe-evolution',outfit:'111501',style:4,core:['111501211','203902','91101351'],target:'202871'},available=['202871','202872',...speed(4)],chart=controlledChart(ctx,available,true);
 for(const budget of [300,500]){
  const states=Object.fromEntries(chart.rows.map(r=>[r.id,'unavailable']));for(const id of closure(available))states[id]='2';for(const id of ctx.core)states[id]='owned';
  const plan=await recommendFinalPlan(data,chart,states,{stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},spBudget:budget},{samples,dt,diagnostics:true});
  plans.evolution.push({context:ctx.id,budget,activeIds:plan.activeIds,purchases:plan.purchases.map(p=>({id:p.id,name:p.name,cost:p.cost})),budgetResult:plan.budget,normalApplied:plan.activeIds.includes('202871'),evolvedApplied:plan.activeIds.includes('111501111'),gain:plan.gain,minimumContext:plan.robustGain,search:plan.search});
 }
 plans.priorBenchmark=priorCoverage();
 fs.writeFileSync(new URL('.cache/cm-v7-guide-plans.json',root),JSON.stringify(plans,null,2));
 if(process.argv.includes('--plans-only'))process.exit(0);
}
// Only constrain event rewards when every active recorded route requires a
// support event. Other active routes remain possible, rather than inventing a
// conflict for a skill which can be acquired independently.
function supportChoiceAudit(input,ids){
 const gold=ids.filter(id=>data.skills[id]?.rarity==='gold'),required=[],unresolved=[];
 const events=(input.supportIds||[]).flatMap(support=>(data.support_events[support]?.events||[]).map(event=>({...event,support})));
 for(const id of gold){
  const routes=data.acquisition_routes.filter(r=>r.skill_id===id&&activeAcquisitionRoute(data,input,r));
  if(!routes.length||routes.some(r=>r.kind!=='support_event'))continue;
  if(events.some(e=>e.choices.some(c=>c.rewards.some(r=>r.skill_id===id))))required.push(id);else unresolved.push(id);
 }
 let assignments=0,best=[];const chosen=[];
 function walk(index,covered){
  if(index===events.length){assignments++;const missing=required.filter(id=>!covered.has(id));if(!best.length||missing.length<best[0].missing.length)best=[{missing,choices:[...chosen]}];return;}
  const event=events[index];for(const choice of event.choices){chosen.push({support:event.support,event:event.id,choice:choice.id,rewards:choice.rewards.map(r=>r.skill_id)});walk(index+1,new Set([...covered,...choice.rewards.map(r=>r.skill_id)]));chosen.pop();}
 }
 walk(0,new Set());return {requiredGoldIds:required,unresolved,assignments,feasible:best[0].missing.length===0,bestAssignment:best[0],basis:'recorded-active-routes-and-reviewed-support-event-reward-choices'};
}
if(!rankOnly&&!process.argv.includes('--matrix-only')&&!process.argv.includes('--plans-only')&&!process.argv.includes('--long-plans-only')&&!process.argv.includes('--collect')){
 extra={...stamp,longchampContexts:[],nativeOnlyComparisons:[],contextConvergence:[],spatialWitnesses:[],supportRewardChoices:{}};
 for(const ctx of contexts){
  const task=taskFor('kyoto',ctx.style,ctx.outfit),setup={...task.setup,stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},ownedSkillIds:closure(ctx.core)},baseline=[...task.nativeIds,...ctx.core];
  extra.nativeOnlyComparisons.push({context:ctx.id,id:ctx.target,stats:ADV,...score({...setup,ownedSkillIds:[]},[...task.nativeIds,ctx.target],task.nativeIds)});
  extra.contextConvergence.push({context:ctx.id,id:ctx.target,samples:576,...score(setup,[...baseline,ctx.target],baseline,576)});
 }
 for(const [race,style,id,expectedDelay]of [['kyoto',2,'202711',83.3333333333333],['tokyo1800',4,'200641',75],['tokyo2400',2,'202711',25],['longchamp',2,'202711',0],['longchamp',4,'200641',17]]){
  const setup={...setupFor(race,style),raceContext:{rankTimeline:[{distance:0,rank:5}]}},ev=new RaceEvaluator(setup,compiledFor(setup,[id]),[],[],branchSampler);let witness;
  for(let sample=0;sample<samples&&!witness;sample++){const result=ev.run([id],sample,dt),event=result.events.find(e=>e.id===id);if(event)witness={sample,event,delay:event.x-setup.course.distance*2/3};}
  assert.ok(witness,'A controlled qualifying-rank witness must activate');assert.ok(Math.abs(witness.delay-expectedDelay)<.3);
  extra.spatialWitnesses.push({race,style,id,expectedDelay,...witness,basis:'qualifying-rank witness, not activation probability'});
 }
 for(const [id,outfit,style,core,target]of [
  ['almond-king','112901',2,['112901211','112901111','91101411','203442','200492'],'202711'],
  ['almond-downhill-after-main','112901',2,['112901211','112901111','91101411','203442','200492','202711'],'201342'],
  ['goldship-gun','100701',4,['91101351','200641','203522','202021'],'202871'],
  ['goldship-downhill-after-main','100701',4,['91101351','200641','203522','202021','202871'],'203902']
 ]){
  const task=taskFor('longchamp',style,outfit),setup={...task.setup,stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},ownedSkillIds:closure(core)};
  extra.longchampContexts.push({id,outfit,style,core,target,...diagnostic(setup,[...task.nativeIds,...core],target)});
 }
 const prior=read('docs/validation/cm-v7-20261118.json').same7000;
 extra.supportRewardChoices.prior7000=supportChoiceAudit(prior.input,prior.recommended.activeIds);
 extra.supportRewardChoices.cb30312=data.support_events['30312'];
 extra.supportRewardChoices.ff30311=data.support_events['30311'];
 fs.writeFileSync(new URL('.cache/cm-v7-guide-extra.json',root),JSON.stringify(extra,null,2));
 if(process.argv.includes('--extra-only'))process.exit(0);
}
if(!rankOnly&&!process.argv.includes('--matrix-only')&&!process.argv.includes('--plans-only')&&!process.argv.includes('--extra-only')&&!process.argv.includes('--collect')){
 longPlans={...stamp,race:'longchamp',interpretation:'course positive controls with explicitly recorded skills; not a historical player replay',plans:[]};
 for(const ctx of [
  {id:'almond-longchamp',outfit:'112901',style:2,core:['112901211','112901111','91101411','203442','200492'],target:'202711',available:['202711','202712','201342','201312','201322','201102','201112','200512']},
  {id:'goldship-longchamp',outfit:'100701',style:4,core:['91101351','203522','202021'],target:'202871',available:['202871','202872','200641','200642','203902','201452','201462','201112']}
 ]){
  const chart=controlledChart(ctx,ctx.available,false,'longchamp');
  for(const budget of [300,500]){
   const states=Object.fromEntries(chart.rows.map(r=>[r.id,'unavailable']));for(const id of closure(ctx.available))states[id]='5';for(const id of ctx.core)states[id]='owned';
   const plan=await recommendFinalPlan(data,chart,states,{stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},spBudget:budget},{samples,dt,searchSamples:9,searchDt:.05,diagnostics:true});
   longPlans.plans.push({context:ctx.id,style:ctx.style,outfit:ctx.outfit,core:ctx.core,available:ctx.available,budget,recordedHint:5,target:ctx.target,targetApplied:plan.activeIds.includes(ctx.target),activeIds:plan.activeIds,purchases:plan.purchases.map(p=>({id:p.id,name:p.name,cost:p.cost})),budgetResult:plan.budget,gain:plan.gain,minimumContext:plan.robustGain,contributions:plan.marginalContributions,search:plan.search});
   console.log('Longchamp plan:',ctx.id,budget,plan.activeIds.includes(ctx.target),plan.gain);fs.writeFileSync(new URL('.cache/cm-v7-guide-long-plans.json',root),JSON.stringify(longPlans,null,2));
  }
 }
 if(process.argv.includes('--long-plans-only'))process.exit(0);
}
if(rankOnly||!process.argv.some(arg=>['--matrix-only','--plans-only','--extra-only','--long-plans-only','--collect'].includes(arg))){
 rankPlans={...stamp,interpretation:'aggregation sensitivity with the same nine artificial contexts; neither weighting is measured race frequency',plans:[],sameCostComparisons:[]};
 const ctx={id:'fine-no-main-longchamp',outfit:'102201',style:2,core:[],target:'202711'},available=['202711','202712','201312','201322','201102','201112'],chart=controlledChart(ctx,available,false,'longchamp');
 const base={...chart.setup,stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},encounterPolicy:ENCOUNTER_POLICY,externalDomains:contextDomains(data)};
 const equalContexts={scenarios:Array.from({length:9},(_,i)=>{const s=raceScenario(base,i);return {id:s.id,weight:1,context:s.context};}),scenarioSource:'unmeasured-equal-weights-objective-sensitivity-control'};
 for(const [id,ids]of [['king-plus-corner',['202711','201112']],['four-speed-whites',['201312','201322','201102','201112']]])rankPlans.sameCostComparisons.push({id,ids,costAtHint5:276,...score(base,[...chart.nativeIds,...ids],chart.nativeIds)});
 for(const [mode,raceContext]of [['default-worst-context',{}],['same-contexts-equal-weighted-mean',equalContexts]]){
  const states=Object.fromEntries(chart.rows.map(r=>[r.id,'5'])),plan=await recommendFinalPlan(data,chart,states,{stats:ADV,aptitudes:{distance:'S',surface:'A',style:'A'},spBudget:300,raceContext},{samples,dt,searchSamples:9,searchDt:.05,diagnostics:true});
  rankPlans.plans.push({context:ctx.id,mode,input:inputFor('longchamp',2,ctx.outfit),raceContext,available,budget:300,recordedHint:5,targetApplied:plan.activeIds.includes(ctx.target),activeIds:plan.activeIds,purchases:plan.purchases.map(p=>({id:p.id,name:p.name,cost:p.cost})),budgetResult:plan.budget,gain:plan.gain,minimumContext:plan.robustGain,search:plan.search});
  console.log('Aggregation control:',mode,plan.activeIds.includes(ctx.target),plan.gain);
 }
 fs.writeFileSync(new URL('.cache/cm-v7-guide-rank-plans.json',root),JSON.stringify(rankPlans,null,2));if(rankOnly)process.exit(0);
}
if(process.argv.includes('--collect')){matrix=read('.cache/cm-v7-guide-matrix.json');plans=read('.cache/cm-v7-guide-plans.json');extra=read('.cache/cm-v7-guide-extra.json');longPlans=read('.cache/cm-v7-guide-long-plans.json');rankPlans=read('.cache/cm-v7-guide-rank-plans.json');plans.priorBenchmark=priorCoverage();}
assert.equal(matrix.engineCommit,ENGINE);assert.equal(plans.engineCommit,ENGINE);assert.equal(matrix.courseCases.length,75);assert.equal(plans.controlled.length,24);assert.equal(plans.evolution.length,2);
assert.equal(extra.engineCommit,ENGINE);assert.equal(extra.longchampContexts.length,4);
assert.equal(longPlans.engineCommit,ENGINE);assert.equal(longPlans.plans.length,4);
plans.stats=ADV;plans.raceSettings=RACES.kyoto;longPlans.stats=ADV;longPlans.raceSettings=RACES.longchamp;
for(const plan of plans.controlled)plan.input=inputFor('kyoto',plan.style,plan.outfit);
for(const plan of plans.evolution)plan.input=inputFor('kyoto',4,'111501');
for(const plan of longPlans.plans)plan.input=inputFor('longchamp',plan.style,plan.outfit);
assert.equal(rankPlans.engineCommit,ENGINE);assert.equal(rankPlans.plans.length,2);
for(const block of [matrix,plans,extra,longPlans,rankPlans])assert.equal(block.dataVersion,manifest.active_version);
for(const plan of [...plans.controlled,...plans.evolution,...longPlans.plans,...rankPlans.plans]){
 assert.equal(plan.search.globalOptimal,true,'Small-pool recommendations must finish exhaustive search');
 assert.ok(plan.budgetResult.used<=plan.budget);assert.equal(plan.purchases.reduce((sum,p)=>sum+p.cost,0),plan.budgetResult.used);
}
const sourceManifest=read('docs/validation/cm-v7-guide-sources-20261118.json');assert.equal(sourceManifest.sourceCount,14);
const result={...stamp,sourceManifest:'cm-v7-guide-sources-20261118.json',sourceCount:sourceManifest.sourceCount,matrix,plans,extra,longPlans,rankPlans};fs.writeFileSync(new URL('docs/validation/cm-v7-guide-audit-20261118.json',root),JSON.stringify(result,null,2));
console.log('Guide audit collected');
