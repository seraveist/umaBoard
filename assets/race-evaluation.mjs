import {simulateSolo} from './solo.mjs';
import {lengthsBetween} from './physics.mjs';
import {raceScenario,scenarioCount,encounterPolicy} from './race-scenarios.mjs';
const key=ids=>[...new Set(ids)].sort().join(',');
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
// Scenario weights apply to scenario means, not accidental sample counts.
export class RaceEvaluator{
 constructor(setup,compiled,referenceIds,nativeIds,samplerFactory){
  this.setup=setup;this.compiled=compiled;this.referenceIds=referenceIds;this.nativeIds=nativeIds;
  this.samplerFactory=samplerFactory;this.references=new Map();this.runs=new Map();
 }
 run(ids,sample,dt,reference=false){
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
  const gains=[],groups=new Map();let hp=Infinity;
  for(let sample=0;sample<count;sample++){
   const before=this.run(this.referenceIds,sample,dt,true),after=this.run(ids,sample,dt),gain=lengthsBetween(after,before);
   // With an all-sample-feasible incumbent, one failed sample proves this
   // challenger cannot win the declared HP-first objective. No statistical
   // confidence assumption or skill-specific penalty is needed.
   if(stopOnHpFailure&&!after.fullSpeedFeasible)return {hpRejected:true,samplesEvaluated:sample+1};
   gains.push(gain);hp=Math.min(hp,after.hpRemaining);
   const g=groups.get(after.scenario.id)||{id:after.scenario.id,weight:after.scenario.weight,gains:[],time:0,hp:0,hpGain:0,shortfall:0,successes:0,activation:{},usefulAcceleration:{}};
   g.gains.push(gain);g.time+=before.finishTime-after.finishTime;g.hp+=after.hpRemaining;g.hpGain+=after.hpRemaining-before.hpRemaining;g.shortfall+=Math.max(0,-after.hpRemaining);g.successes+=Number(after.fullSpeedFeasible);
   for(const id of new Set(after.events.map(e=>e.id)))g.activation[id]=(g.activation[id]||0)+1;
   for(const id of Object.keys(after.accelerationUseSeconds||{}))g.usefulAcceleration[id]=(g.usefulAcceleration[id]||0)+1;
   groups.set(g.id,g);
  }
  const scenarios=[...groups.values()].map(g=>({...g,count:g.gains.length,gain:mean(g.gains)}));
  const totalWeight=scenarios.reduce((s,g)=>s+g.weight,0),weighted=f=>scenarios.reduce((s,g)=>s+f(g)*g.weight,0)/totalWeight;
  const gain=weighted(g=>g.gain),half=Math.floor(count/2),successes=scenarios.reduce((s,g)=>s+g.successes,0),rawMean=mean(gains);
  const rates=field=>Object.fromEntries(ids.map(id=>[id,weighted(g=>(g[field][id]||0)/g.count)]));
  return {gain,robustGain:Math.min(...scenarios.map(g=>g.gain)),timeGain:weighted(g=>g.time/g.count),hp,
   hpMean:weighted(g=>g.hp/g.count),hpGain:weighted(g=>g.hpGain/g.count),hpShortfall:weighted(g=>g.shortfall/g.count),
   feasible:successes===count,hpSuccessRate:weighted(g=>g.successes/g.count),hpSuccesses:successes,
   sampling:{count,dt,min:Math.min(...gains),max:Math.max(...gains),standardDeviation:count>1?Math.sqrt(gains.reduce((s,v)=>s+(v-rawMean)**2,0)/(count-1)):0,
    halfDifference:half?Math.abs(mean(gains.slice(0,half))-mean(gains.slice(half))):null,interpretation:'scenario-sample-spread-not-a-confidence-bound'},
   scenarios:scenarios.map(g=>({id:g.id,weight:g.weight,count:g.count,gain:g.gain,hpSuccessRate:g.successes/g.count})),
   scenarioCoverage:{expected:scenarioCount(this.setup),observed:scenarios.length,complete:scenarios.length===scenarioCount(this.setup),...encounterPolicy(this.setup)},
   activationRates:rates('activation'),usefulAccelerationRates:rates('usefulAcceleration')};
 }
 marginal(ids,id,count,dt){
  const gains=[],scenarios=new Map();
  for(let sample=0;sample<count;sample++){
   const withSkill=this.run(ids,sample,dt,true),without=this.run(ids.filter(other=>other!==id),sample,dt);
   const gain=lengthsBetween(withSkill,without);gains.push(gain);
   const g=scenarios.get(withSkill.scenario.id)||{id:withSkill.scenario.id,weight:withSkill.scenario.weight,gains:[],helps:0};g.gains.push(gain);g.helps+=Number(gain>.005);scenarios.set(g.id,g);
  }
  const values=[...scenarios.values()],weight=values.reduce((s,g)=>s+g.weight,0);
  return {gain:values.reduce((s,g)=>s+mean(g.gains)*g.weight,0)/weight,minScenarioGain:Math.min(...values.map(g=>mean(g.gains))),maxScenarioGain:Math.max(...values.map(g=>mean(g.gains))),
   helpfulSampleRate:values.reduce((s,g)=>s+g.helps/g.gains.length*g.weight,0)/weight,samples:count,interpretation:'whole-skill-ablation-conditional-on-comparison-contexts'};
 }
}
