import {simulateSolo} from './solo.mjs';
import {lengthsBetween} from './physics.mjs';

const key=ids=>[...new Set(ids)].sort().join(',');
// Shared evaluator for chart rows and whole purchase plans. References have a
// separate cache so candidate churn cannot change or evict paired baselines.
export class RaceEvaluator{
 constructor(setup,compiled,referenceIds,nativeIds,samplerFactory){
  this.setup=setup;this.compiled=compiled;this.referenceIds=referenceIds;
  this.nativeIds=nativeIds;this.samplerFactory=samplerFactory;this.references=new Map();this.runs=new Map();
 }
 run(ids,sample,dt,reference=false){
  const cache=reference?this.references:this.runs,k=`${key(ids)}|${sample}|${dt}`;
  if(!cache.has(k)){
   const skills=ids.map(id=>this.compiled.get(id));
   if(skills.some(s=>!s||s.status==='unsupported'))throw new Error('지원하지 않는 스킬은 주행에 포함할 수 없습니다.');
   cache.set(k,simulateSolo(this.setup,skills,.5,{dt,keepTrace:false,fullSpurt:true,branchSampler:this.samplerFactory(this.setup,this.nativeIds,sample)}));
   while(cache.size>(reference?768:96))cache.delete(cache.keys().next().value);
  }
  return cache.get(k);
 }
 evaluate(ids,count,dt){
  const gains=[],times=[],activationCounts={};let hp=Infinity,hpMean=0,hpShortfall=0,hpGain=0,successes=0;
  for(let sample=0;sample<count;sample++){
   const before=this.run(this.referenceIds,sample,dt,true),after=this.run(ids,sample,dt);
   gains.push(lengthsBetween(after,before));times.push(before.finishTime-after.finishTime);
   hp=Math.min(hp,after.hpRemaining);hpMean+=after.hpRemaining;hpGain+=after.hpRemaining-before.hpRemaining;
   hpShortfall+=Math.max(0,-after.hpRemaining);successes+=Number(after.fullSpeedFeasible);
   for(const id of new Set(after.events.map(event=>event.id)))activationCounts[id]=(activationCounts[id]||0)+1;
  }
  const mean=values=>values.reduce((a,b)=>a+b,0)/values.length,gain=mean(gains),half=Math.floor(count/2);
  return {gain,timeGain:mean(times),hp,hpMean:hpMean/count,hpGain:hpGain/count,hpShortfall:hpShortfall/count,
   feasible:successes===count,hpSuccessRate:successes/count,hpSuccesses:successes,
   sampling:{count,dt,min:Math.min(...gains),max:Math.max(...gains),standardDeviation:count>1?Math.sqrt(gains.reduce((s,v)=>s+(v-gain)**2,0)/(count-1)):0,
    halfDifference:half?Math.abs(mean(gains.slice(0,half))-mean(gains.slice(half))):null,interpretation:'sample-spread-not-a-confidence-bound'},
   activationRates:Object.fromEntries(ids.map(id=>[id,(activationCounts[id]||0)/count]))};
 }
}
