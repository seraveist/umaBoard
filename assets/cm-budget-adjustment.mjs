import {selectNearBest} from './cm-plan-compression.mjs';
import {isMiddleProvider} from './cm-middle-conditions.mjs';

const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const safe=row=>row?.feasible&&row.performance.risk.withinLimit;

// Rank a small neighbourhood of a completed full search. Projected gains
// decide evaluation order only. Every returned score uses the final matrix.
export async function adjustBudget({anchor,previousIds,budget,candidates,compiled,distance,normalize,legal,retained,price,
 evaluate,pilot,samples,tolerance,cancelled,onProgress}){
 const held=new Set(anchor.ids),rows=new Map(candidates.map(row=>[row.id,row]));
 const middle=anchor.ids.filter(id=>isMiddleProvider(compiled.get(id),distance)).length;
 const growing=budget>=anchor.cost;
 const proposals=new Map();
 function proposal(ids){
  const active=normalize(ids);
  if(!retained(active)||!legal(active))return null;
  const cost=price(active);
  return cost===null?null:{ids:active,cost};
 }
 function offer(ids,predicted,risky=false){
  const row=proposal(ids);
  if(!row||row.cost>budget)return;
  const key=row.ids.join(',');
  if(!proposals.has(key)||predicted>proposals.get(key).predicted)proposals.set(key,{...row,predicted,risky});
 }
 const sort=(a,b)=>b.delta-a.delta||a.id.localeCompare(b.id);
 let pilotChecks=0;
 if(growing){
  const additions=[];
  for(const row of candidates){
   if(held.has(row.id))continue;
   const added=proposal([...anchor.ids,row.id]);
   if(!added||added.cost>budget||!added.ids.includes(row.id)||!anchor.ids.every(id=>added.ids.includes(id)))continue;
   const prepared=row.preparedComparison;
   const gain=prepared?.condition==='activate_count_middle'&&middle>=prepared.count?prepared.gain:row.gain;
   if(Number.isFinite(gain))additions.push({id:row.id,delta:gain,cost:Math.max(1,added.cost-anchor.cost)});
  }
  const byGain=additions.slice().sort(sort),byEfficiency=additions.sort((a,b)=>b.delta/b.cost-a.delta/a.cost||sort(a,b));
  const ranked=[...new Set([...byGain.slice(0,12),...byEfficiency.slice(0,12)])];
  for(const [i,a] of ranked.entries()){
   offer([...anchor.ids,a.id],a.delta);
   for(const b of ranked.slice(i+1))offer([...anchor.ids,a.id,b.id],a.delta+b.delta);
  }
 }else{
  const baseline=pilot(anchor.ids);
  const drops=[];
  for(const id of anchor.ids){
   if(!rows.has(id))continue;
   const remaining=proposal(anchor.ids.filter(other=>other!==id));
   if(!remaining||remaining.ids.includes(id)||remaining.cost>=anchor.cost)continue;
   // An over-budget intermediate is useful for ranking a second removal.
   // It never enters the set of affordable final plans.
   const score=pilot(remaining.ids);pilotChecks++;
   drops.push({id,delta:score.gain-baseline.gain,safe:safe(score)});
   if(pilotChecks%8===0){await pause();if(cancelled())return null;}
  }
  for(const [i,a] of drops.entries()){
   const remaining=anchor.ids.filter(other=>other!==a.id);
   offer(remaining,a.delta,!a.safe);
   for(const b of drops.slice(i+1))offer(remaining.filter(other=>other!==b.id),a.delta+b.delta,!a.safe||!b.safe);
  }
 }
 const compare=(a,b)=>Number(a.risky)-Number(b.risky)||b.predicted-a.predicted||a.cost-b.cost||a.ids.join(',').localeCompare(b.ids.join(','));
 const ranked=[...proposals.values()].sort(compare);
 if(!ranked.length)return null;
 const finalists=new Map();
 for(const ids of [anchor.ids,previousIds]){
  if(!Array.isArray(ids)||!ids.length)continue;
  const row=proposal(ids);
  if(row&&row.cost<=budget)finalists.set(row.ids.join(','),row);
 }
 for(const row of ranked){
  if(finalists.size>=8)break;
  finalists.set(row.ids.join(','),row);
 }
 const scores=[];
 async function measure(list){
  for(const row of list){
   if(cancelled())return false;
   const score=evaluate(row.ids,samples);
   if(score)scores.push(score);
   onProgress({stage:'adjustment',completed:scores.length,total:finalists.size});
   await pause();
  }
  return !cancelled();
 }
 if(!await measure(finalists.values()))return null;
 const first=selectNearBest(scores,tolerance)?.selected;
 if(!safe(first))return null;
 const refill=[];
 // Check affordable additions even when the chart scored them zero or
 // has no standalone value (e.g. evolutions). Broaden if the pool is large.
 for(const row of candidates){
  if(first.ids.includes(row.id))continue;
  const next=proposal([...first.ids,row.id]);
  if(!next||next.cost>budget||!next.ids.includes(row.id)||!first.ids.every(id=>next.ids.includes(id)))continue;
  const key=next.ids.join(',');
  if(finalists.has(key))continue;
  if(refill.length===8)return null;
  finalists.set(key,next);refill.push(next);
 }
 if(!await measure(refill))return null;
 const choice=selectNearBest(scores,tolerance);
 if(!safe(choice.selected))return null;
 // Without an improvement, a different existing purchase may need to fund an upgrade.
 if(budget>anchor.budget&&choice.selected.ids.join(',')===anchor.ids.join(','))return null;
 return {choice,pilotChecks,fullChecks:scores.length,refillChecks:refill.length,previousPlanCompared:
  Array.isArray(previousIds)&&finalists.has(previousIds.join(','))};
}
