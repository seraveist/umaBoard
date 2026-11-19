import {buildChartCandidates,compileChartSkill,branchSampler,CM_SAMPLES,CM_DT} from './cm-chart.mjs';
import {RaceEvaluator} from './race-evaluation.mjs';
import {scenarioCount} from './race-scenarios.mjs';
import {positionAt} from './physics.mjs';
import {selectionRules} from './selection.mjs';
import {scenarioSelectionAllowed} from './acquisition-rules.mjs';
import {styleRecommendation} from './cm-recommendation.mjs';
import {RecordedPurchaseModel} from './cm-final-plan.mjs';
import {EventConstraints} from './cm-event-constraints.mjs';
import {strategyGoals,strategySkillIds} from './cm-strategy.mjs';

export const TARGET_ACCELERATION_VERSION='cm-target-acceleration-v5';
const supported=s=>s&&['supported','assumed'].includes(s.status);
const native=s=>['unique','unique_low_star','unique_upgraded'].includes(s.rarity);
const key=ids=>[...new Set(ids)].sort().join(',');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

// A target is a preparation plan, independent of the actual hint/owned records.
export async function recommendTargetAcceleration(data,chart,{cancelled=()=>false,onProgress=()=>{},samples=CM_SAMPLES,dt=CM_DT,searchSamples=3,searchDt=.05,evaluationLimit=360,maxCandidates=24,width=4,refinementLimit=96,minGainPer100Sp=.15}={}){
 if(!Number.isFinite(minGainPer100Sp)||minGainPer100Sp<0)throw new Error('가속 SP 효율 기준을 확인하세요.');
 const setup={...chart.setup,ownedSkillIds:[]},contexts=scenarioCount(setup);
 samples=Math.max(samples,contexts);searchSamples=Math.max(searchSamples,contexts);
 const records=buildChartCandidates(data,setup),rules=selectionRules(data,records),events=new EventConstraints(data,setup);
 const compiled=new Map([...records].map(([id,s])=>[id,compileChartSkill(s,setup)]));
 const strategicGoals=strategyGoals(data,setup).map(goal=>({...goal,skillIds:strategySkillIds(goal,compiled,setup),scenarioFallbacks:events.groups.filter(g=>g.scenario_id).flatMap(g=>g.choices.flatMap(c=>c.rewards.filter(r=>goal.skillIds.includes(r.skill_id)).map(r=>({eventName:g.name_jp,label:c.label,skillId:r.skill_id}))))}));
 const nativeIds=chart.nativeIds;
 for(const id of nativeIds)if(!compiled.has(id)&&data.skills[id])compiled.set(id,compileChartSkill(data.skills[id],setup));
 const states=Object.fromEntries([...records.keys()].map(id=>[id,'5']));
 const planningRows=[...records.values()].map(s=>({...s,evolutionBaseId:data.evolution_rules.find(r=>r.evolved_id===s.id&&(r.owner_id===setup.outfitId||r.owner_id===setup.scenarioId))?.base_id}));
 const prices=new RecordedPurchaseModel(data,planningRows,states),evaluated=new Map(),comparison=new RaceEvaluator(setup,compiled,nativeIds,nativeIds,branchSampler),excludedCandidates=[];
 let checks=0;
 const legal=(ids,pins=null)=>ids.every((id,i)=>ids.slice(0,i).every(other=>rules.compatible(id,other)))&&scenarioSelectionAllowed(data,ids,setup.scenarioId)&&ids.filter(id=>records.get(id)?.inherited).length<=6&&(pins?new EventConstraints(data,{...setup,eventChoices:pins}):events).selection(ids)!==null;
 const evaluate=(ids,count=searchSamples,step=searchDt)=>{
  ids=[...new Set([...nativeIds,...ids])].sort();const k=key(ids)+'|'+count+'|'+step;
  if(evaluated.has(k))return evaluated.get(k);
  if(!legal(ids)||ids.some(id=>compiled.get(id)?.status==='unsupported'||!nativeIds.includes(id)&&!supported(compiled.get(id))))return null;
  const price=prices.selection(ids);if(!price.complete)return null;
  const score=comparison.evaluate(ids,count,step);
  const result={ids:ids.filter(id=>!nativeIds.includes(id)),gain:score.gain,min:score.sampling.min,max:score.sampling.max,step,scenarios:score.scenarios,scenarioCoverage:score.scenarioCoverage,cost:price.used};
  result.score=result.gain-result.cost*minGainPer100Sp/100;
  evaluated.set(k,result);checks++;return result;
 };
 const lateContribution=id=>{
  const c=compiled.get(id),acceleration=i=>i.effects.some(e=>['acceleration','full_spurt_acceleration'].includes(e.kind)&&e.value>0),indices=new Set(c.invocations.filter(acceleration).map(i=>i.index)),connectors=new Set(c.invocations.filter(i=>acceleration(i)&&i.effects.some(e=>['target_speed','current_speed','speed_with_decel'].includes(e.kind)&&e.value>0)).map(i=>i.index));
  for(let sample=0;sample<searchSamples;sample++){
   const before=comparison.run(nativeIds,sample,searchDt,true),after=comparison.run([...nativeIds,id],sample,searchDt);
   if(after.events.some(e=>e.id===id&&indices.has(e.index)&&(e.x>=2*setup.course.distance/3||e.t+(e.duration||0)>=after.entry.t)))return true;
   // Early acceleration can perturb a later native trigger by a frame. That
   // indirect change is not a late accelerator. Only a late-half hybrid's
   // speed connection may qualify without its acceleration overlapping entry.
   if(Math.abs(after.entry.speed-before.entry.speed)>.01&&after.events.some(e=>e.id===id&&connectors.has(e.index)&&e.x>=setup.course.distance/2))return true;
  }
  return false;
 };
 const singles=[];
 for(const [id,s] of records){
  if(cancelled())return null;
  if(native(s)||!supported(compiled.get(id))||!styleRecommendation(s,compiled.get(id),setup).eligible)continue;
  if(!compiled.get(id).invocations.some(i=>i.effects.some(e=>['acceleration','full_spurt_acceleration'].includes(e.kind)&&e.value>0)))continue;
  if(!prices.selection([id]).complete){excludedCandidates.push({id,name:s.name_jp,reason:'구매 비용 확인 필요'});continue;}
  if(!lateContribution(id))continue;
  const row=evaluate([id]);if(row&&row.gain>.005)singles.push(row);
  if(checks%8===0){onProgress({stage:'acceleration',completed:checks,total:checks+1});await pause();}
 }
 const gainOrder=(a,b)=>b.gain-a.gain||a.cost-b.cost||key(a.ids).localeCompare(key(b.ids));
 const order=(a,b)=>b.score-a.score||gainOrder(a,b);
 const ranked=singles.slice().sort(gainOrder),efficient=singles.slice().sort((a,b)=>b.gain/Math.max(1,b.cost)-a.gain/Math.max(1,a.cost)||gainOrder(a,b));
 const pool=[...new Set([...ranked.slice(0,Math.ceil(maxCandidates/2)),...efficient.slice(0,Math.ceil(maxCandidates/2))].flatMap(r=>r.ids))];
 const extend=(ids,id)=>[...ids.filter(other=>rules.compatible(id,other)),id];
 let frontier=[evaluate([])],search='exhaustive';
 if(pool.length<=9&&pool.length===singles.length){
  for(let mask=0;mask<2**pool.length;mask++){
   if(cancelled())return null;
   evaluate(pool.filter((id,i)=>mask&(1<<i)));
   if(mask%16===15)await pause();
  }
 }else{
  search='bounded';
  // Start with useful complete packs, so a six-step beam cannot silently
  // become a six-skill cap. Inherited skills still have their real limit.
  for(const ranking of [ranked,efficient]){
   let seed=evaluate([]);
   for(const row of ranking){
    if(cancelled())return null;
    const next=evaluate(extend(seed.ids,row.ids[0]));if(next&&order(next,seed)<0)seed=next;
    if(checks%8===0)await pause();
   }
   frontier.push(seed);
  }
  for(let depth=0;depth<pool.length&&checks<evaluationLimit;depth++){
   const next=new Map(frontier.map(r=>[key(r.ids),r]));
   for(const current of frontier)for(const id of pool){
    if(cancelled())return null;
    if(current.ids.includes(id)||checks>=evaluationLimit)continue;
    const candidate=evaluate(extend(current.ids,id));if(candidate)next.set(key(candidate.ids),candidate);
   }
   const rows=[...next.values()],best=rows.slice().sort(order).slice(0,width),cheap=rows.slice().sort((a,b)=>a.cost-b.cost||order(a,b)).slice(0,2);
   const updated=[...new Map([...best,...cheap].map(r=>[key(r.ids),r])).values()];
   if(updated.map(r=>key(r.ids)).join('|')===frontier.map(r=>key(r.ids)).join('|'))break;
   frontier=updated;onProgress({stage:'acceleration',completed:checks,total:evaluationLimit});await pause();
  }
 }
 const scoreTolerance=.01,coarse=[...evaluated.values()].sort(order),maximum=coarse[0]||evaluate([]);
 const shortlist=[...coarse.slice(0,4),...coarse.filter(r=>r.score>=maximum.score-scoreTolerance-.03).sort((a,b)=>a.cost-b.cost||order(a,b)).slice(0,5)];
 // Each removal is also a finalist; small marginal gains must not force buying
 // another expensive accelerator. This is bounded search, never a global proof.
 for(const id of maximum.ids){const row=evaluate(maximum.ids.filter(other=>other!==id));if(row)shortlist.push(row);}
 const refined=[];
 for(const row of [...new Map(shortlist.map(r=>[key(r.ids),r])).values()]){
  if(cancelled())return null;
  refined.push(evaluate(row.ids,samples,dt));await pause();
 }
 const fine=new Map(refined.map(r=>[key(r.ids),r]));
 let fineBest=refined.slice().sort(order)[0]||evaluate([],samples,dt),fineMaximum=fineBest,chosen=fineBest,refinementEvaluations=0,refinementLimited=false,closureComplete=false;
 const choose=()=>{
  fineBest=[...fine.values()].sort(order)[0]||fineBest;fineMaximum=[...fine.values()].sort(gainOrder)[0]||fineMaximum;
  chosen=[...fine.values()].filter(r=>r.score>=fineBest.score-scoreTolerance-1e-7).sort((a,b)=>a.cost-b.cost||order(a,b))[0]||fineBest;
 };
 choose();
 const precise=ids=>{
  const k=key(ids);if(fine.has(k))return fine.get(k);
  if(refinementEvaluations>=refinementLimit){refinementLimited=true;return null;}
  const result=evaluate(ids,samples,dt);if(result){fine.set(k,result);refinementEvaluations++;}return result;
 };
 // Revisit all single additions/removals (including candidates outside the
 // beam pool), then screen exchanges. This remains a bounded local search.
 for(let pass=0;pass<4;pass++){
  const before=key(fineBest.ids)+'|'+key(chosen.ids),seeds=[...new Map([fineBest,chosen].map(r=>[key(r.ids),r])).values()],removals=new Map(),additions=new Map(),swaps=new Map();
  for(const seed of seeds){
   const removeRank=[];
   for(const id of seed.ids){const row=evaluate(seed.ids.filter(other=>other!==id));if(row){removals.set(key(row.ids),row);removeRank.push({id,score:row.score});}}
   for(const single of singles){
    if(cancelled())return null;const id=single.ids[0];if(seed.ids.includes(id))continue;
    const row=evaluate(extend(seed.ids,id));if(row)additions.set(key(row.ids),row);
    if(checks%8===0)await pause();
   }
   const incoming=[...new Set([...ranked,...efficient].flatMap(row=>row.ids))].filter(id=>!seed.ids.includes(id)).slice(0,12),outgoing=removeRank.sort((a,b)=>b.score-a.score).slice(0,6);
   for(const id of incoming)for(const removed of outgoing){
    if(cancelled())return null;const row=evaluate(extend(seed.ids.filter(other=>other!==removed.id),id));if(row)swaps.set(key(row.ids),row);
    if(checks%8===0)await pause();
   }
  }
  const exchanged=[...swaps.values()],variants=[...removals.values(),...[...additions.values()].sort(order).slice(0,16),...exchanged.sort(order).slice(0,8),...exchanged.filter(r=>r.score>=fineBest.score-scoreTolerance-.03).sort((a,b)=>a.cost-b.cost||order(a,b)).slice(0,8)];
  for(const row of [...new Map(variants.map(r=>[key(r.ids),r])).values()]){
   if(cancelled())return null;precise(row.ids);await pause();if(refinementLimited)break;
  }
  choose();onProgress({stage:'acceleration',completed:refinementEvaluations,total:refinementLimit});
  if(refinementLimited)break;
  if(before===key(fineBest.ids)+'|'+key(chosen.ids)){closureComplete=true;break;}
 }
 const required=chosen.ids;
 const toRow=id=>{
  const s=records.get(id),baseId=planningRows.find(r=>r.id===id)?.evolutionBaseId||id;
  return {id,name:s.name_jp,rarity:s.rarity,inherited:s.inherited,categories:s.categories,description:s.description_jp,baseId,baseName:data.skills[baseId]?.name_jp,cost:prices.selection([id]).used,routes:s.routes||[],providers:s.inheritance_outfit_ids||[]};
 };
 // Display the loss from removing one skill from this exact target, paired
 // with the same ranks/samples. Overlapping contributions are not additive.
 const contributionStart=checks,skills=[];
 for(const id of required){
  if(cancelled())return null;
  const without=evaluate(required.filter(other=>other!==id),samples,dt);
  skills.push({...toRow(id),marginalGain:without?chosen.gain-without.gain:null});
  await pause();
 }
 skills.sort((a,b)=>(b.marginalGain??-Infinity)-(a.marginalGain??-Infinity)||a.cost-b.cost||a.id.localeCompare(b.id));
 const contributionEvaluations=checks-contributionStart;
 // Compare whole rare bundles with the same target. Hints are possibilities,
 // never purchases or mutations of the training-result checklist.
 const goldGroups=events.groups.map(g=>({...g,choices:g.choices.map(c=>({...c,rewards:c.rewards.filter(r=>data.skills[r.skill_id]?.rarity==='gold')}))})).filter(g=>(g.card_id||g.scenario_id&&g.choices.length>1)&&g.choices.some(c=>c.rewards.length));
 const positionSensitive=setup.style<=2&&[...nativeIds,...required].some(id=>data.skills[id].invocations.some(i=>(i.condition||[]).flat().some(a=>['order','order_rate','distance_diff_top','bashin_diff_infront'].includes(a.field)&&['<','<=','=='].includes(a.operator))));
 const keepsTarget=ids=>required.every(id=>ids.includes(id));
 const rewardPlan=(current,available,pins)=>{
  let ids=[...current];
  for(const id of available){
   if(!supported(compiled.get(id))||!styleRecommendation(records.get(id),compiled.get(id),setup).eligible||!prices.selection([id]).complete)continue;
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
 // Mid-race position only resolves reward ties. Preserve the same paired draws and scenario weights.
 const entryGain=(score,count,step)=>{
  const groups=new Map();
  for(let i=0;i<count;i++){
   const before=comparison.run(nativeIds,i,step,true),after=comparison.run([...nativeIds,...score.ids],i,step);
   const group=groups.get(after.scenario.id)||{sum:0,count:0,weight:after.scenario.weight};
   group.sum+=(positionAt(after,before.entry.t)-positionAt(before,before.entry.t))/2.5;group.count++;groups.set(after.scenario.id,group);
  }
  const values=[...groups.values()],scale=Math.max(...values.map(g=>g.weight));
  return values.reduce((n,g)=>n+g.weight/scale*g.sum/g.count,0)/values.reduce((n,g)=>n+g.weight/scale,0);
 };
 const entry=(score)=>score.entryGain??=(positionSensitive?entryGain(score,score.scenarios.reduce((n,s)=>n+s.count,0),score.step):0);
 const tieOrder=(a,b)=>positionSensitive&&Math.abs(entry(a.score)-entry(b.score))>.005?entry(b.score)-entry(a.score):a.score.cost-b.score.cost||bundleOrder(a,b);
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
  const positionPreferred=positionSensitive&&near.length&&entry(assignment.score)>Math.max(...near.map(a=>entry(a.score)))+.005;
  return {cardId:group.card_id,scenarioId:group.scenario_id,eventName:group.name_jp,selectionLabel:selected.label,groupId:group.id,setId:selected.id,ids:rareIds,targetIds:needed,alternatives,reason:forced?'target':group.choices.length===1?'fixed':near.length?positionPreferred?'position':'cost':'gain',verified:group.choices.length===1||!events.unverified.includes(group.card_id)};
 }).filter(Boolean);
 return {modelVersion:TARGET_ACCELERATION_VERSION,ids:required,skills,skillGainPolicy:'remove-one-from-target',gain:chosen.gain,min:chosen.min,max:chosen.max,cost:chosen.cost,maximumGain:fineMaximum.gain,sacrificedGain:Math.max(0,fineMaximum.gain-chosen.gain),allowedLoss:null,score:chosen.score,efficiencyPolicy:{minGainPer100Sp,scoreTolerance,source:'preparation-policy-not-measured'},scenarioEvolutionCount:required.filter(id=>data.evolution_rules.some(r=>r.evolved_id===id&&r.owner_type==='scenario'&&r.owner_id===setup.scenarioId)).length,
  eventChoices:assignment.pins,rewards:rewards.filter(r=>r.cardId),scenarioRewards:rewards.filter(r=>r.scenarioId),strategyGoals:strategicGoals,samples,dt,scenarioCoverage:chosen.scenarioCoverage,scenarios:chosen.scenarios,excludedCandidates,search:{method:search,rewardMethod:'beam-4',candidateCount:singles.length,shortlisted:pool.length,evaluations:checks,contributionEvaluations,refinementEvaluations,refinementLimit,refinementLimited,closureComplete,exchangeMethod:'coarse-screened-12-in-6-out-8-score-8-cost',globalOptimal:false},pricePolicy:'all-hints-lv5-no-trait',positionPolicy:positionSensitive?'prefer-mid-position-on-tie':'cost-on-tie',baseline:'native-unique-only'};
}
