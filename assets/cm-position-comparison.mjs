import {branchSampler} from './cm-chart.mjs';
import {simulateSolo} from './solo.mjs';
import {lengthsBetween,positionAt} from './physics.mjs';

export const POSITION_COMPARISON_VERSION='cm9-fixed-rank-sensitivity-v1';
// These are comparison positions, not measured placement probabilities. Reuse
// the late-race style bands of cm-recommendation instead of predicting opponents.
export const comparisonRanks=style=>({1:[1,2,3],2:[2,3,4,5],3:[3,4,5,6,7,8,9],4:[3,4,5,6,7,8,9]})[style]||[];

export function createPositionComparison(setup,compiled,nativeIds,{ranks=comparisonRanks(setup.style)}={}){
 const masks=new Map([...compiled].map(([id,s])=>[id,new Map(ranks.map(rank=>[rank,s.invocations.map(i=>[i.precondition,i.condition].map(branches=>branches.map(b=>Number(!b.ranks||b.ranks.includes(rank))).join('')).join('/')).join(';')]))]));
 const randomized=new Map([...compiled].map(([id,s])=>[id,new Map(ranks.map(rank=>[rank,s.stochastic||s.invocations.some(i=>i.condition.some(b=>(!b.ranks||b.ranks.includes(rank))&&(b.random||i.chartRandomPolicy)))]))]));
 const runs=new Map(),baselines=new Map(),nativeKey=[...new Set(nativeIds)].sort().join(',');
 const run=(ids,sample,dt,rank)=>{
  ids=[...new Set([...nativeIds,...ids])].sort();
  if(!ids.some(id=>randomized.get(id)?.get(rank)))sample=0;
  const key=ids.map(id=>id+':'+masks.get(id)?.get(rank)).join(',')+'|'+sample+'|'+dt;
  const cache=ids.join(',')===nativeKey?baselines:runs;
  if(!cache.has(key)){
   const sampler=branchSampler(setup,nativeIds,sample);
   // Filter AFTER sampling: removing a branch must not shift the other
   // branches' random dimensions or break paired comparisons across ranks.
   const sampleRank=(branches,...args)=>sampler(branches,...args).filter(b=>!b.ranks||b.ranks.includes(rank));
   cache.set(key,simulateSolo(setup,ids.map(id=>compiled.get(id)).filter(s=>s&&['supported','assumed'].includes(s.status)),.5,{dt,keepTrace:false,fullSpurt:true,branchSampler:sampleRank}));
   if(cache===runs)while(cache.size>80)cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
 };
 const compare=(ids,samples,dt)=>{
  let gain=0,entryGain=0,min=Infinity,max=-Infinity;const byRank=[];
  for(const rank of ranks){
   let sum=0,entry=0,lo=Infinity,hi=-Infinity;
   for(let sample=0;sample<samples;sample++){
    const before=run([],sample,dt,rank),after=run(ids,sample,dt,rank),value=lengthsBetween(after,before);
    sum+=value;lo=Math.min(lo,value);hi=Math.max(hi,value);
    entry+=(positionAt(after,before.entry.t)-positionAt(before,before.entry.t))/2.5;
   }
   byRank.push({rank,gain:sum/samples,entryGain:entry/samples,min:lo,max:hi});
   gain+=sum/samples;entryGain+=entry/samples;min=Math.min(min,lo);max=Math.max(max,hi);
  }
  return {gain:gain/ranks.length,entryGain:entryGain/ranks.length,min,max,byRank};
 };
 return {ranks,run,compare,policy:{version:POSITION_COMPARISON_VERSION,ranks,aggregation:'equal-weight-sensitivity-mean',probabilities:false,rankChanges:false}};
}
