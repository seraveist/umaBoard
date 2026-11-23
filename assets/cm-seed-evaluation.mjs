import {RaceEvaluator} from './race-evaluation.mjs';
import {compileChartSkill,createFinalBranchSampler} from './cm-chart.mjs';

// The serial planner and each worker promote the same stable sample prefixes.
export function scoreSeed({pilot,middle,full,tolerance},score){
 if(!tolerance)return score(full);
 let value=score(pilot);
 if(value?.sampling.halfDifference>tolerance&&middle>pilot)value=score(middle);
 if(value?.sampling.halfDifference>tolerance&&full>value.sampling.count)value=score(full);
 return value;
}

export function evaluateSeedBatch({setup,baselineIds,nativeIds,skills,plans,sampling,dt},onProgress){
 const compiled=new Map(skills.map(skill=>[skill.id,compileChartSkill(skill,setup)]));
 // Each plan completes all of its prefixes before moving to the next.
 const evaluator=new RaceEvaluator(setup,compiled,baselineIds,nativeIds,createFinalBranchSampler(),{
  compactComparisons:true,sampleCacheLimit:sampling.full
 });
 evaluator.beginSeedComparisons();
 const scores=new Map();
 for(const [index,ids] of plans.entries()){
  const key=ids.join(',');
  scoreSeed(sampling,count=>{
   const value=evaluator.evaluate(ids,count,dt,{scenarioPriorities:count===sampling.full});
   scores.set(key+'|'+count+'|'+dt,value);
   return value;
  });
  if((index+1)%4===0||index+1===plans.length)onProgress(index+1);
 }
 return {scores,drawHits:evaluator.endSeedComparisons()};
}

// Refinement jobs at different resolutions can share only the stable draws of
// the same plan. Finish each score with the normal race evaluator and HP policy.
export function createRefinementEvaluator({setup,baselineIds,nativeIds}){
 return new RaceEvaluator(setup,new Map(),baselineIds,nativeIds,createFinalBranchSampler(),{
  compactComparisons:true,sampleCacheLimit:16384
 });
}

export function evaluateRefinements(evaluator,{skills,plans,sampling,count,dt,stopOnHpFailure},onProgress){
 const previousHits=evaluator.sampleCacheHits;
 for(const skill of skills)evaluator.compiled.set(skill.id,compileChartSkill(skill,evaluator.setup));
 const scores=new Map();
 for(const [index,ids] of plans.entries()){
  const value=evaluator.evaluate(ids,count,dt,{stopOnHpFailure,scenarioPriorities:count===sampling.full});
  scores.set(ids.join(',')+'|'+count+'|'+dt,value);
  if((index+1)%4===0||index+1===plans.length)onProgress(index+1);
 }
 return {scores,drawHits:0,prefixHits:evaluator.sampleCacheHits-previousHits};
}
