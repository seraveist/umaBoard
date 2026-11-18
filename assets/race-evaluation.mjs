import {simulateSolo} from './solo.mjs';
import {lengthsBetween} from './physics.mjs';
import {raceScenario,scenarioCount,encounterPolicy} from './race-scenarios.mjs';
import {performanceSummary} from './race-objective.mjs';
import {activeSkillIds,withoutSkill} from './skill-context.mjs';
const key=ids=>[...new Set(ids)].sort().join(',');
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
// Scenario weights apply to scenario means, not accidental sample counts.
export class RaceEvaluator{
 constructor(setup,compiled,referenceIds,nativeIds,samplerFactory,{sampleCacheLimit=65536}={}){
  this.setup=setup;this.compiled=compiled;this.referenceIds=referenceIds;this.nativeIds=nativeIds;
  this.samplerFactory=samplerFactory;this.references=new Map();this.runs=new Map();
  // Keyed sampling has stable prefixes. Retain compact observations rather
  // than replaying those runs when a complete plan advances to more samples.
  this.sampleCacheLimit=sampleCacheLimit;this.sampleCache=new Map();this.cachedSamples=0;this.sampleCacheHits=0;
 }
 run(ids,sample,dt,reference=false){
 ids=activeSkillIds(ids,this.setup.possessionGraph);
 const cache=reference?this.references:this.runs,k=`${key(ids)}|${sample}|${dt}`;
  if(!cache.has(k)){
   const skills=ids.map(id=>this.compiled.get(id));
   if(skills.some(s=>!s||s.status==='unsupported'))throw new Error('지원하지 않는 스킬은 주행에 포함할 수 없습니다.');
   const possession=new Set([...ids,...(this.setup.ownedSkillIds||[])]),pending=[...possession];
   while(pending.length){const id=pending.pop();for(const low of this.setup.possessionGraph?.[id]||[])if(!possession.has(low)){possession.add(low);pending.push(low);}}
   const scenario=raceScenario(this.setup,sample),setup={...this.setup,raceContext:scenario.context,possessionIds:[...possession]};
   const run=simulateSolo(setup,skills,.5,{dt,keepTrace:false,fullSpurt:setup.fullSpurtMode!=='off',branchSampler:this.samplerFactory(setup,this.nativeIds,sample)});
   cache.set(k,{...run,scenario:{id:scenario.id,weight:scenario.weight,basis:scenario.basis}});
   while(cache.size>(reference?1536:192))cache.delete(cache.keys().next().value);
  }
  return cache.get(k);
 }
 evaluate(ids,count,dt,{stopOnHpFailure=false}={}){
  if(!Number.isInteger(count)||count<1||count>2048||!Number.isFinite(dt)||dt<=0||dt>.1)throw new Error('계산 표본 설정을 확인하세요.');
  const cacheKey=key(activeSkillIds(ids,this.setup.possessionGraph))+'|'+dt;
  let records=this.sampleCache.get(cacheKey);
  if(!records)records=[];
  if(this.sampleCacheLimit){this.sampleCache.delete(cacheKey);this.sampleCache.set(cacheKey,records);}
  const gains=[],groups=new Map();let hp=Infinity;
  for(let sample=0;sample<count;sample++){
   let observation=records[sample];
   if(observation)this.sampleCacheHits++;
   else{
    const before=this.run(this.referenceIds,sample,dt,true),after=this.run(ids,sample,dt);
    observation={gain:lengthsBetween(after,before),scenario:after.scenario,finishTime:after.finishTime,referenceFinishTime:before.finishTime,timeGain:before.finishTime-after.finishTime,hpRemaining:after.hpRemaining,hpGain:after.hpRemaining-before.hpRemaining,fullSpeedFeasible:after.fullSpeedFeasible,activation:[...new Set(after.events.map(e=>e.id))],usefulAcceleration:Object.keys(after.accelerationUseSeconds||{})};
    if(this.sampleCacheLimit){records.push(observation);this.cachedSamples++;
     while(this.cachedSamples>this.sampleCacheLimit&&this.sampleCache.size>1){const oldest=this.sampleCache.keys().next().value;this.cachedSamples-=this.sampleCache.get(oldest).length;this.sampleCache.delete(oldest);}
    }
   }
   const after=observation,gain=after.gain;
   // With an all-sample-feasible incumbent, one failed sample proves this
   // challenger cannot win the declared HP-first objective. No statistical
   // confidence assumption or skill-specific penalty is needed.
   if(stopOnHpFailure&&!after.fullSpeedFeasible)return {hpRejected:true,samplesEvaluated:sample+1};
   gains.push(gain);hp=Math.min(hp,after.hpRemaining);
   const g=groups.get(after.scenario.id)||{id:after.scenario.id,weight:after.scenario.weight,gains:[],finishes:[],references:[],time:0,hp:0,hpGain:0,shortfall:0,successes:0,activation:{},usefulAcceleration:{}};
   g.finishes.push(after.finishTime);g.references.push(after.referenceFinishTime);
   g.gains.push(gain);g.time+=after.timeGain;g.hp+=after.hpRemaining;g.hpGain+=after.hpGain;g.shortfall+=Math.max(0,-after.hpRemaining);g.successes+=Number(after.fullSpeedFeasible);
   for(const id of after.activation)g.activation[id]=(g.activation[id]||0)+1;
   for(const id of after.usefulAcceleration)g.usefulAcceleration[id]=(g.usefulAcceleration[id]||0)+1;
   groups.set(g.id,g);
  }
  const scenarios=[...groups.values()].map(g=>({...g,count:g.gains.length,gain:mean(g.gains)}));
  const weightScale=Math.max(...scenarios.map(g=>g.weight)),totalWeight=scenarios.reduce((s,g)=>s+g.weight/weightScale,0),weighted=f=>scenarios.reduce((s,g)=>s+f(g)*(g.weight/weightScale),0)/totalWeight;
  const gain=weighted(g=>g.gain),half=Math.floor(count/2),successes=scenarios.reduce((s,g)=>s+g.successes,0),rawMean=mean(gains);
  const points=field=>scenarios.flatMap(g=>g[field].map(value=>({value,weight:g.weight/g.count})));
  const performance=performanceSummary(points('finishes'),points('references'),this.setup.riskPolicy);
  const rates=field=>Object.fromEntries(ids.map(id=>[id,weighted(g=>(g[field][id]||0)/g.count)]));
  const minScenarioGain=Math.min(...scenarios.map(g=>g.gain)),maxScenarioGain=Math.max(...scenarios.map(g=>g.gain));
  return {gain,robustGain:minScenarioGain,scenarioSensitivity:{minimum:minScenarioGain,maximum:maxScenarioGain,spread:maxScenarioGain-minScenarioGain,interpretation:'case-mean-range-not-a-probability-or-confidence-interval'},performance,timeGain:weighted(g=>g.time/g.count),hp,
   hpMean:weighted(g=>g.hp/g.count),hpGain:weighted(g=>g.hpGain/g.count),hpShortfall:weighted(g=>g.shortfall/g.count),
   feasible:successes===count,hpSuccessRate:weighted(g=>g.successes/g.count),hpSuccesses:successes,
   sampling:{count,dt,min:Math.min(...gains),max:Math.max(...gains),standardDeviation:count>1?Math.sqrt(gains.reduce((s,v)=>s+(v-rawMean)**2,0)/(count-1)):0,
    halfDifference:half?Math.abs(mean(gains.slice(0,half))-mean(gains.slice(half))):null,interpretation:'scenario-sample-spread-not-a-confidence-bound'},
   scenarios:scenarios.map(g=>({id:g.id,weight:g.weight,count:g.count,gain:g.gain,finishTime:mean(g.finishes),referenceFinishTime:mean(g.references),hpSuccessRate:g.successes/g.count})),
   scenarioCoverage:{expected:scenarioCount(this.setup),observed:scenarios.length,complete:scenarios.length===scenarioCount(this.setup),...encounterPolicy(this.setup)},
   activationRates:rates('activation'),usefulAccelerationRates:rates('usefulAcceleration')};
 }
 marginal(ids,id,count,dt){
  const gains=[],scenarios=new Map(),comparison=withoutSkill(ids,id,[...this.referenceIds,...(this.setup.ownedSkillIds||[])],this.setup.possessionGraph);
  for(let sample=0;sample<count;sample++){
   const withSkill=this.run(ids,sample,dt,true),without=this.run(comparison.ids,sample,dt);
   const gain=lengthsBetween(withSkill,without);gains.push(gain);
   const g=scenarios.get(withSkill.scenario.id)||{id:withSkill.scenario.id,weight:withSkill.scenario.weight,gains:[],helps:0};g.gains.push(gain);g.helps+=Number(gain>.005);scenarios.set(g.id,g);
  }
  const values=[...scenarios.values()],scale=Math.max(...values.map(g=>g.weight)),weight=values.reduce((s,g)=>s+g.weight/scale,0);
  return {gain:values.reduce((s,g)=>s+mean(g.gains)*(g.weight/scale),0)/weight,minScenarioGain:Math.min(...values.map(g=>mean(g.gains))),maxScenarioGain:Math.max(...values.map(g=>mean(g.gains))),
   helpfulSampleRate:values.reduce((s,g)=>s+g.helps/g.gains.length*(g.weight/scale),0)/weight,restoredIds:comparison.restoredIds,samples:count,interpretation:'paired-ablation-with-owned-prerequisite-restoration'};
 }
}
