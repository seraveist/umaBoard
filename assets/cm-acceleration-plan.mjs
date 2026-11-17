import {buildChartCandidates,compileChartSkill,branchSampler,CM_SAMPLES,CM_DT} from './cm-chart.mjs';
import {simulateSolo} from './solo.mjs';
import {lengthsBetween,positionAt} from './physics.mjs';
import {selectionRules} from './selection.mjs';
import {scenarioSelectionAllowed} from './acquisition-rules.mjs';
import {styleRecommendation} from './cm-recommendation.mjs';
import {RecordedPurchaseModel} from './cm-final-plan.mjs';
import {EventConstraints} from './cm-event-constraints.mjs';

export const TARGET_ACCELERATION_VERSION='cm-target-acceleration-v1';
const supported=s=>s&&['supported','assumed'].includes(s.status);
const native=s=>['unique','unique_low_star','unique_upgraded'].includes(s.rarity);
const key=ids=>[...new Set(ids)].sort().join(',');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

// A target is a preparation plan, independent of the actual hint/owned records.
export async function recommendTargetAcceleration(data,chart,{cancelled=()=>false,onProgress=()=>{},samples=CM_SAMPLES,dt=CM_DT,searchSamples=3,searchDt=.05,evaluationLimit=360,maxCandidates=24,width=4}={}){
 const setup=chart.setup,records=buildChartCandidates(data,setup),rules=selectionRules(data,records),events=new EventConstraints(data,setup);
 const compiled=new Map([...records].map(([id,s])=>[id,compileChartSkill(s,setup)]));
 const nativeIds=chart.nativeIds,states=Object.fromEntries([...records.keys()].map(id=>[id,'5']));
 const planningRows=[...records.values()].map(s=>({...s,evolutionBaseId:data.evolution_rules.find(r=>r.evolved_id===s.id&&(r.owner_id===setup.outfitId||r.owner_id===setup.scenarioId))?.base_id}));
 const prices=new RecordedPurchaseModel(data,planningRows,states),runs=new Map(),evaluated=new Map();
 let checks=0;
 const legal=(ids,pins=null)=>ids.every((id,i)=>ids.slice(0,i).every(other=>rules.compatible(id,other)))&&scenarioSelectionAllowed(data,ids,setup.scenarioId)&&ids.filter(id=>records.get(id)?.inherited).length<=6&&(pins?new EventConstraints(data,{...setup,eventChoices:pins}):events).selection(ids)!==null;
 const run=(ids,sample,count,step)=>{
  const k=key(ids)+'|'+sample+'|'+count+'|'+step;
  if(!runs.has(k)){
   const r=simulateSolo(setup,ids.map(id=>compiled.get(id)).filter(supported),.5,{dt:step,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(setup,nativeIds,sample)});
   runs.set(k,r);while(runs.size>80)runs.delete(runs.keys().next().value);
  }
  return runs.get(k);
 };
 const evaluate=(ids,count=searchSamples,step=searchDt)=>{
  ids=[...new Set([...nativeIds,...ids])].sort();const k=key(ids)+'|'+count+'|'+step;
  if(evaluated.has(k))return evaluated.get(k);
  if(!legal(ids)||ids.some(id=>compiled.get(id)?.status==='unsupported'||!nativeIds.includes(id)&&!supported(compiled.get(id))))return null;
  const price=prices.selection(ids);if(!price.complete)return null;
  let gain=0,entryGain=0,min=Infinity,max=-Infinity;
  for(let sample=0;sample<count;sample++){
   const before=run(nativeIds,sample,count,step),after=run(ids,sample,count,step),value=lengthsBetween(after,before);
   gain+=value;min=Math.min(min,value);max=Math.max(max,value);
   entryGain+=(positionAt(after,before.entry.t)-positionAt(before,before.entry.t))/2.5;
  }
  const result={ids:ids.filter(id=>!nativeIds.includes(id)),gain:gain/count,entryGain:entryGain/count,min,max,cost:price.used};
  evaluated.set(k,result);checks++;return result;
 };
 const lateContribution=id=>{
  const c=compiled.get(id),indices=new Set(c.invocations.filter(i=>i.effects.some(e=>['acceleration','full_spurt_acceleration'].includes(e.kind)&&e.value>0)).map(i=>i.index));
  for(let sample=0;sample<searchSamples;sample++){
   const before=run(nativeIds,sample,searchSamples,searchDt),after=run([...nativeIds,id],sample,searchSamples,searchDt);
   if(after.events.some(e=>e.id===id&&indices.has(e.index)&&(e.x>=2*setup.course.distance/3||e.t+(e.duration||0)>=after.entry.t)))return true;
   if(Math.abs(after.entry.speed-before.entry.speed)>.01&&after.events.some(e=>e.id===id&&indices.has(e.index)))return true;
  }
  return false;
 };
 const singles=[];
 for(const [id,s] of records){
  if(cancelled())return null;
  if(native(s)||!supported(compiled.get(id))||!styleRecommendation(s,compiled.get(id),setup).eligible)continue;
  if(!compiled.get(id).invocations.some(i=>i.effects.some(e=>['acceleration','full_spurt_acceleration'].includes(e.kind)&&e.value>0)))continue;
  if(!lateContribution(id))continue;
  const row=evaluate([id]);if(row&&row.gain>.005)singles.push(row);
  if(checks%8===0){onProgress({stage:'acceleration',completed:checks,total:checks+1});await pause();}
 }
 const order=(a,b)=>b.gain-a.gain||a.cost-b.cost||key(a.ids).localeCompare(key(b.ids));
 const ranked=singles.slice().sort(order),efficient=singles.slice().sort((a,b)=>b.gain/Math.max(1,b.cost)-a.gain/Math.max(1,a.cost)||order(a,b));
 const pool=[...new Set([...ranked.slice(0,Math.ceil(maxCandidates/2)),...efficient.slice(0,Math.ceil(maxCandidates/2))].flatMap(r=>r.ids))];
 let frontier=[evaluate([])],search='exhaustive';
 if(pool.length<=9&&pool.length===singles.length){
  for(let mask=0;mask<2**pool.length;mask++){
   if(cancelled())return null;
   evaluate(pool.filter((id,i)=>mask&(1<<i)));
   if(mask%16===15)await pause();
  }
 }else{
  search='bounded';
  for(let depth=0;depth<Math.min(pool.length,6)&&checks<evaluationLimit;depth++){
   const next=new Map(frontier.map(r=>[key(r.ids),r]));
   for(const current of frontier)for(const id of pool){
    if(cancelled())return null;
    if(current.ids.includes(id)||checks>=evaluationLimit)continue;
    const candidate=evaluate([...current.ids.filter(other=>rules.compatible(id,other)),id]);if(candidate)next.set(key(candidate.ids),candidate);
   }
   const rows=[...next.values()],best=rows.slice().sort(order).slice(0,width),cheap=rows.slice().sort((a,b)=>a.cost-b.cost||order(a,b)).slice(0,2);
   const updated=[...new Map([...best,...cheap].map(r=>[key(r.ids),r])).values()];
   if(updated.map(r=>key(r.ids)).join('|')===frontier.map(r=>key(r.ids)).join('|'))break;
   frontier=updated;onProgress({stage:'acceleration',completed:checks,total:evaluationLimit});await pause();
  }
 }
 const coarse=[...evaluated.values()].sort(order),maximum=coarse[0]||evaluate([]),tolerance=Math.min(.10,Math.max(0,maximum.gain)*.03);
 const shortlist=[...coarse.slice(0,4),...coarse.filter(r=>r.gain>=maximum.gain-tolerance-.05).sort((a,b)=>a.cost-b.cost||order(a,b)).slice(0,5)];
 // Each removal is also a finalist; small marginal gains must not force buying
 // another expensive accelerator. This is bounded search, never a global proof.
 for(const id of maximum.ids){const row=evaluate(maximum.ids.filter(other=>other!==id));if(row)shortlist.push(row);}
 const refined=[];
 for(const row of [...new Map(shortlist.map(r=>[key(r.ids),r])).values()]){
  if(cancelled())return null;
  refined.push(evaluate(row.ids,samples,dt));await pause();
 }
 const fineMaximum=refined.slice().sort(order)[0]||evaluate([],samples,dt),allowedLoss=Math.min(.10,Math.max(0,fineMaximum.gain)*.03);
 const chosen=refined.filter(r=>r.gain>=fineMaximum.gain-allowedLoss-1e-7).sort((a,b)=>a.cost-b.cost||order(a,b))[0]||fineMaximum;
 const required=chosen.ids;
 const toRow=id=>{
  const s=records.get(id),baseId=planningRows.find(r=>r.id===id)?.evolutionBaseId||id;
  return {id,name:s.name_jp,rarity:s.rarity,inherited:s.inherited,categories:s.categories,description:s.description_jp,baseId,baseName:data.skills[baseId]?.name_jp,cost:prices.selection([id]).used,routes:s.routes||[],providers:s.inheritance_outfit_ids||[]};
 };
 // Compare whole rare bundles with the same target. Hints are possibilities,
 // never purchases or mutations of the training-result checklist.
 const goldGroups=events.groups.map(g=>({...g,choices:g.choices.map(c=>({...c,rewards:c.rewards.filter(r=>data.skills[r.skill_id]?.rarity==='gold')}))})).filter(g=>g.card_id&&g.choices.some(c=>c.rewards.length));
 const positionSensitive=setup.style<=2&&[...nativeIds,...required].some(id=>data.skills[id].invocations.some(i=>(i.condition||[]).flat().some(a=>['order','order_rate','distance_diff_top','bashin_diff_infront'].includes(a.field)&&['<','<=','=='].includes(a.operator))));
 const extend=(ids,id)=>[...ids.filter(other=>rules.compatible(id,other)),id];
 const keepsTarget=ids=>required.every(id=>ids.includes(id));
 const rewardPlan=(current,available,pins)=>{
  let ids=[...current];
  for(const id of available){
   if(!supported(compiled.get(id))||!styleRecommendation(records.get(id),compiled.get(id),setup).eligible)continue;
   if(required.some(target=>!rules.compatible(id,target)))continue;
   const next=extend(ids,id);if(keepsTarget(next)&&legal([...nativeIds,...next],pins))ids=next;
  }
  // Preserve the target's evolution slots and compare remaining matching
  // evolutions of the actually available rares. No hint implies a purchase.
  for(const row of chart.evolutionOptions||[]){
   if(!available.includes(row.evolutionBaseId)||required.some(target=>!rules.compatible(row.id,target)))continue;
   const next=extend(ids,row.id);
   if(!keepsTarget(next)||!legal([...nativeIds,...next],pins))continue;
   const a=evaluate(next),b=evaluate(ids);if(a&&b&&a.gain>b.gain+1e-7)ids=next;
  }
  return evaluate(ids);
 };
 const bundleOrder=(a,b)=>b.score.gain-a.score.gain||a.score.cost-b.score.cost||JSON.stringify(a.pins).localeCompare(JSON.stringify(b.pins));
 const tieOrder=(a,b)=>positionSensitive&&Math.abs(a.score.entryGain-b.score.entryGain)>.005?b.score.entryGain-a.score.entryGain:a.score.cost-b.score.cost||bundleOrder(a,b);
 let assignments=[{pins:{},available:[],score:evaluate(required)}];
 for(const group of goldGroups){
  const next=[];
  for(const current of assignments)for(const choice of group.choices){
   if(cancelled())return null;
   const pins={...current.pins,[group.id]:choice.id};
   if(!legal([...nativeIds,...required],pins))continue;
   const available=[...new Set([...current.available,...choice.rewards.map(r=>r.skill_id)])],score=rewardPlan(required,available,pins);
   if(score)next.push({pins,available,score});
  }
  assignments=next.sort(bundleOrder).slice(0,4);if(!assignments.length)break;
  onProgress({stage:'rewards',completed:goldGroups.indexOf(group)+1,total:goldGroups.length});await pause();
 }
 // Fine paired comparisons decide the published bundle assignment, too.
 for(const row of assignments){if(cancelled())return null;row.score=evaluate(row.score.ids,samples,dt);await pause();}
 const maxRewardGain=Math.max(...assignments.map(r=>r.score.gain));
 const assignment=assignments.filter(r=>r.score.gain>=maxRewardGain-.01).sort(tieOrder)[0]||{pins:events.selection([...nativeIds,...required])||{},score:chosen};
 const rewards=goldGroups.map(group=>{
  const selected=group.choices.find(c=>c.id===assignment.pins[group.id]);if(!selected)return null;
  const rareIds=selected.rewards.map(r=>r.skill_id),needed=required.map(id=>planningRows.find(r=>r.id===id)?.evolutionBaseId||id).filter(id=>rareIds.includes(id));
  const alternatives=group.choices.filter(c=>c.id!==selected.id).map(c=>({ids:c.rewards.map(r=>r.skill_id)}));
  // Only call a set required if every feasible alternative loses the target.
  const forced=needed.length>0&&group.choices.filter(c=>legal([...nativeIds,...required],{...assignment.pins,[group.id]:c.id})).length===1;
  const near=assignments.filter(a=>a!==assignment&&a.pins[group.id]!==selected.id&&Math.abs(a.score.gain-assignment.score.gain)<=.01);
  const positionPreferred=positionSensitive&&near.length&&assignment.score.entryGain>Math.max(...near.map(a=>a.score.entryGain))+.005;
  return {cardId:group.card_id,groupId:group.id,setId:selected.id,ids:rareIds,targetIds:needed,alternatives,reason:forced?'target':group.choices.length===1?'fixed':near.length?positionPreferred?'position':'cost':'gain',verified:group.choices.length===1||!events.unverified.includes(group.card_id)};
 }).filter(Boolean);
 return {modelVersion:TARGET_ACCELERATION_VERSION,ids:required,skills:required.map(toRow),gain:chosen.gain,min:chosen.min,max:chosen.max,cost:chosen.cost,maximumGain:fineMaximum.gain,sacrificedGain:Math.max(0,fineMaximum.gain-chosen.gain),allowedLoss,scenarioEvolutionCount:required.filter(id=>data.evolution_rules.some(r=>r.evolved_id===id&&r.owner_type==='scenario'&&r.owner_id===setup.scenarioId)).length,
  eventChoices:assignment.pins,rewards,samples,dt,search:{method:search,rewardMethod:'beam-4',candidateCount:singles.length,shortlisted:pool.length,evaluations:checks,globalOptimal:false},pricePolicy:'all-hints-lv5-no-trait',positionPolicy:positionSensitive?'prefer-mid-position-on-tie':'cost-on-tie',baseline:'native-unique-only'};
}
