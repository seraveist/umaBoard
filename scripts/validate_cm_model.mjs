import fs from 'node:fs';
import assert from 'node:assert/strict';
import {compileChartSkill,branchSampler,createChartSetup,generateChart,CM_MODEL_VERSION,CM_SAMPLES} from '../assets/cm-chart.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {bulkAcquisition} from '../assets/cm-state.mjs';
import {activationProbability} from '../assets/race-sampling.mjs';

const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const old=read('docs/validation/cm-7000-20261117.json');
const baseStats=profiles.profiles['15'].stats;
const setupFor=(courseId,style,stats=baseStats,raceContext={})=>({...createChartSetup(data,profiles,{outfitId:'101301',courseId,style,scenarioId:'15',bloom:5,uniqueLevel:6,supportIds:[],raceContext}),stats});
function evaluate(setup,skills,count=256,nativeIds=[]){
 const compiled=new Map(skills.map(s=>[s.id,compileChartSkill(s,setup)]));
 return new RaceEvaluator(setup,compiled,nativeIds,nativeIds,branchSampler).evaluate(skills.map(s=>s.id),count,.01);
}
const result={validatedAt:'2026-11-17 Asia/Seoul',baselineCommit:'3cc94e1ff6b4527ae55cb0cb099d3aea07f02848',modelVersion:CM_MODEL_VERSION,dataVersion:manifest.active_version,samples:CM_SAMPLES,lotteries:[],selfConditions:[],timing:[],convergence:[],collisions:[]};
for(const [id,popularity,postNumber,lotteryProbability]of [['201561',4,7,.5],['202441',4,7,.6],['202441',2,7,.3],['202442',4,7,.3]]){
 const setup=setupFor('10604',2,baseStats,{popularity,postNumber}),skill=data.skills[id];
 const score=evaluate(setup,[skill]),expectedRate=lotteryProbability*activationProbability(skill,setup);
 assert.ok(Math.abs(score.activationRates[id]-expectedRate)<.03,`${id}: lottery rate`);
 result.lotteries.push({id,name:skill.name_jp,popularity,postNumber,lotteryProbability,wisdomProbability:activationProbability(skill,setup),expectedRate,mean:score.gain,activationRate:score.activationRates[id],samples:score.sampling.count});
}
for(const id of ['110061','910061']){
 const setup=setupFor('10604',2,baseStats,{popularity:4,postNumber:7}),skill=compileChartSkill(data.skills[id],setup);
 const run=simulateSolo(setup,[skill],.5,{dt:.01,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(setup,[],0)});
 assert.equal(run.events.filter(e=>e.id===id).length,0);
 result.selfConditions.push({id,healingSkills:0,activationEvents:run.events.filter(e=>e.id===id),gain:evaluate(setup,[data.skills[id]],256).gain});
}
for(const [course,style,id]of [['10602',1,'900201'],['10604',1,'900201'],['10907',1,'900201'],['10811',4,'200642'],['10606',4,'200642'],['10701',2,'900511'],['10606',2,'900511'],['10506',3,'900591']]){
 const setup=setupFor(course,style),c=compileChartSkill(data.skills[id],setup),run=simulateSolo(setup,[c],.5,{dt:.01,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(setup,[],0)});
 const score=evaluate(setup,[data.skills[id]],256);result.timing.push({course,style,id,name:data.skills[id].name_jp,gain:score.gain,activationRate:score.activationRates[id],events:run.events,assumptions:c.assumed});
}
console.log('Counter, lottery and timing checks complete');
for(const course of ['10701','10602','10808'])for(const id of ['200601','200491','900591','900511','202441','200642']){
 const style=id==='200642'?4:['200601','900591'].includes(id)?3:2,setup=setupFor(course,style),raw=data.skills[id];
 const scores=[24,128,256].map(n=>evaluate(setup,[raw],n).gain);result.convergence.push({course,style,id,name:raw.name_jp,n24:scores[0],n128:scores[1],n256:scores[2],difference128vs256:scores[1]-scores[2]});
 assert.ok(Math.abs(scores[1]-scores[2])<.05,`${id}/${course}: sample convergence`);
}
for(const [a,b]of [['200361','201101'],['203052','210091'],['204322','204701'],['204531','204622']]){
 const setup=setupFor('10808',2),positions=id=>{
  const c=compileChartSkill(data.skills[id],setup),inv=c.invocations.find(i=>i.condition.some(b=>b.randomKey));
  return Array.from({length:128},(_,n)=>branchSampler(setup,[],n)(inv.condition,id,inv,false)[0]?.at??null);
 };
 const first=positions(a),second=positions(b);result.collisions.push({ids:[a,b],identicalPositions:first.filter((x,i)=>x===second[i]).length,checked:128,firstPositions:first.slice(0,8),secondPositions:second.slice(0,8)});
 assert.equal(first.filter((x,i)=>x===second[i]).length,0,`${a}/${b}: shared ID stream`);
}
const sameSetup={...setupFor('10808',2,old.actual.stats),...old.actual,stats:old.actual.stats};
const oldSkills=old.activeIds.map(id=>data.skills[id]);
// Resolve the actual native ID from the old selection; do not assume outfit IDs
// and skill IDs share an encoding (the chart below supplies the authoritative IDs).
const nativeIds=old.activeIds.filter(id=>['unique','unique_low_star','unique_upgraded'].includes(data.skills[id].rarity));
result.sameV5Selection={activeIds:old.activeIds,oldGain:old.gain,...evaluate(sameSetup,oldSkills,256,nativeIds)};
console.log('Convergence and old-plan reevaluation complete');
const chart=await generateChart(data,profiles,display,old.input,{onProgress:p=>{if(p.completed===p.total)console.log('Chart complete');}});
const states=bulkAcquisition(chart.rows,{},'5'),plan=await recommendFinalPlan(data,chart,states,old.actual,{onProgress:p=>{if(p.completed===p.total)console.log('Plan stage complete:',p.stage);}});
result.recommendedPlan={modelVersion:plan.modelVersion,input:old.input,actual:old.actual,chartRows:chart.rows.length,inheritanceOptions:chart.inheritanceOptions.length,inheritedTopIds:chart.inheritedTopIds,budget:plan.budget,gain:plan.gain,hpRemaining:plan.hpRemaining,hpSuccessRate:plan.hpSuccessRate,fullSpeedFeasible:plan.fullSpeedFeasible,search:plan.search,sampling:plan.sampling,samplingPolicy:plan.samplingPolicy,activeIds:plan.activeIds,activationRates:plan.activationRates,purchases:plan.purchases.map(row=>({id:row.id,name:row.name,cost:row.cost,stages:row.stages})),evolutions:plan.evolutions};
result.recommendedPlan.validation256=evaluate({...chart.setup,...old.actual},plan.activeIds.map(id=>data.skills[id]),256,chart.nativeIds);
assert.ok(plan.budget.used<=old.actual.spBudget);assert.equal(plan.search.closureComplete,true);
assert.ok(Math.abs(result.recommendedPlan.validation256.gain-plan.gain)<.15,'Final selection sample convergence');
const output=new URL('docs/validation/cm-v6-20261117.json',root);fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({output:output.pathname,gain:plan.gain,budget:plan.budget,hpSuccessRate:plan.hpSuccessRate,search:plan.search}));
