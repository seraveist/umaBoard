import {dependencyPacks} from './skill-dependencies.mjs';
import {RaceEvaluator} from './race-evaluation.mjs';
import {normalizeRaceContext,samplingPolicy} from './race-sampling.mjs';
import {compileChartSkill,branchSampler,CM_DT,CM_SAMPLES} from './cm-chart.mjs';
import {STAT_KEYS,validateSetup} from './physics.mjs';
import {SPURT_POLICY} from './spurt-planning.mjs';
import {discountedCost,nativeUnique} from './purchases.mjs';
import {selectionRules} from './selection.mjs';
import {scenarioSelectionAllowed} from './acquisition-rules.mjs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds} from './cm-state.mjs';
import {DISCOUNT_TRAITS,resolveDiscountTrait} from './cm-discounts.mjs';
import {evolutionOptions,evolutionGroups,finalAcquisitionSnapshot} from './cm-evolution.mjs';
import {skillTransforms,inheritanceOrigins} from './skill-transforms.mjs';
import {inheritedCount} from './cm-state.mjs';
import {ENCOUNTER_POLICY,contextDomains,scenarioCount} from './race-scenarios.mjs';
import {normalizeRiskPolicy,compareRacePlans,RACE_OBJECTIVE} from './race-objective.mjs';
import {createAcquisitionConstraints,assertAcquisitionFeasible} from './acquisition-constraints.mjs';

export const FINAL_MODEL_VERSION='cm-post-training-v8';
const supported=s=>s&&['supported','assumed'].includes(s.status);
const hint=value=>/^[0-5]$/.test(String(value))?Number(value):null;
const idKey=ids=>[...new Set(ids)].sort().join(',');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

export function createFinalSetup(chart,input){
 if(!chart?.setup||!Array.isArray(chart.rows)||!Array.isArray(chart.nativeIds))throw new Error('먼저 1차 마신표를 완성해 주세요.');
 const setup={...chart.setup,spurtPolicy:SPURT_POLICY,encounterPolicy:ENCOUNTER_POLICY,stats:{...input.stats},aptitudes:{...chart.setup.aptitudes,...input.aptitudes},raceContext:normalizeRaceContext(input.raceContext??chart.setup.raceContext),riskPolicy:normalizeRiskPolicy(input.riskPolicy??chart.setup.riskPolicy),acquisitionChoices:input.acquisitionChoices??chart.setup.acquisitionChoices};
 for(const key of STAT_KEYS)if(!Number.isInteger(setup.stats[key])||setup.stats[key]<1||setup.stats[key]>3000)throw new Error('실제 능력치는 1~3000 사이의 정수로 입력하세요.');
 if(!Number.isSafeInteger(input.spBudget)||input.spBudget<0||input.spBudget>100000)throw new Error('보유 SP는 0~100000 사이의 정수로 입력하세요.');
 const discountTrait=resolveDiscountTrait(input);
 if(input.excludedEvolutionIds!==undefined&&(!Array.isArray(input.excludedEvolutionIds)||input.excludedEvolutionIds.some(id=>typeof id!=='string')))throw new Error('진화 후보 제외 설정을 확인하세요.');
 validateSetup(setup);return {...setup,spBudget:input.spBudget,discountTrait,fastLearner:discountTrait==='fast-learner',excludedEvolutionIds:[...new Set(input.excludedEvolutionIds||[])]};
}

// The post-training budget is remaining SP. Paid prerequisites are sunk costs;
// recorded hints replace every pre-training route/event price assumption.
export class RecordedPurchaseModel{
 constructor(data,rows,states,discount={}){
  this.data=data;this.rows=new Map(rows.map(row=>[row.id,row]));this.states=states;this.cache=new Map();
  this.discountTrait=resolveDiscountTrait(discount);this.extraDiscount=DISCOUNT_TRAITS[this.discountTrait].rate;
  this.transforms=new Map(skillTransforms(data).map(r=>[r.evolved_id,r]));
  this.owned=new Set(rows.filter(row=>states[row.id]==='owned').map(row=>row.id));
 }
 chain(id,path=new Set()){
  if(this.cache.has(id))return this.cache.get(id);
  if(path.has(id))return null;
  const skill=this.data.skills[id];if(!skill)return null;
  if(this.owned.has(id)||nativeUnique(skill))return [];
  path=new Set([...path,id]);let chain;
  if(skill.rarity==='evolution'||this.transforms.has(id)){
   const base=this.transforms.get(id)?.base_id||this.rows.get(id)?.evolutionBaseId;
   chain=base?this.chain(base,path):null;
  }else{
   const stage=this.data.purchase_stages?.[id];
   if(stage?.status!=='verified'||!Number.isSafeInteger(stage.base_cost)||stage.base_cost<0)return null;
   const lower=stage.prerequisite_id?this.chain(stage.prerequisite_id,path):[];
   chain=lower===null?null:[...lower,{id,base:stage.base_cost}];
  }
  this.cache.set(id,chain);return chain;
 }
 selection(ids){
  const stages=new Map();
  for(const id of ids){
   const chain=this.chain(id);if(chain===null)return {complete:false,used:null,stages:[],unknown:id};
   for(const stage of chain){
    // Evolution and rare share a purchase stage. An explicit rare hint wins;
    // otherwise the selected evolution's recorded hint supplies that stage.
    const level=hint(this.states[stage.id])??((this.data.skills[id]?.rarity==='evolution'||this.transforms.has(id))&&stage.id===chain.at(-1)?.id?hint(this.states[id]):null)??0;
    const existing=stages.get(stage.id);
    if(!existing||level>existing.hint)stages.set(stage.id,{...stage,hint:level,extraDiscount:this.extraDiscount,cost:discountedCost(stage.base,level,this.extraDiscount)});
   }
  }
  return {complete:true,used:[...stages.values()].reduce((sum,stage)=>sum+stage.cost,0),stages:[...stages.values()]};
 }
}

export async function recommendFinalPlan(data,chart,acquisition,input,{onProgress=()=>{},cancelled=()=>false,evaluationLimit=1400,width=6,maxCandidates=240,searchSamples=9,searchDt=.05,samples=CM_SAMPLES,dt=CM_DT,diagnostics=true}={}){
 const setup=createFinalSetup(chart,input),hierarchy=buildAcquisitionHierarchy(data);
 setup.externalDomains=contextDomains(data);
 if(!Number.isInteger(samples)||samples<1||samples>512||!Number.isInteger(searchSamples)||searchSamples<1||searchSamples>512||!Number.isFinite(dt)||dt<=0||dt>.1||!Number.isFinite(searchDt)||searchDt<=0||searchDt>.1||!Number.isInteger(width)||width<2||!Number.isInteger(evaluationLimit)||evaluationLimit<1||!Number.isInteger(maxCandidates)||maxCandidates<1)throw new Error('추천 탐색 설정을 확인하세요.');
 // Even a low-cost preview must visit every declared context before comparing
 // plans; sample counts cannot silently omit a difficult or weighted case.
 samples=Math.max(samples,scenarioCount(setup));searchSamples=Math.max(searchSamples,scenarioCount(setup));
 const options=evolutionOptions(data,chart),origins=inheritanceOrigins(data),planningRows=[...new Map([...chart.rows,...(chart.inheritanceOptions||[]),...options].map(row=>[row.id,row])).values()].map(row=>({...row,inheritanceOriginId:origins[row.id]??null}));
 const states=finalAcquisitionSnapshot(data,chart,acquisition);
 for(const row of options){
  if(states[row.id]==='owned')continue;
  const base=states[row.evolutionBaseId||data.evolution_rules.find(r=>r.evolved_id===row.id)?.base_id];
  states[row.id]=!setup.excludedEvolutionIds.includes(row.id)&&(base==='owned'||hint(base)!==null)?(base==='owned'?'0':base):'unavailable';
 }
 const acquisitionConstraints=createAcquisitionConstraints(data,setup);
 const acquisitionValidation=assertAcquisitionFeasible(acquisitionConstraints,Object.entries(states).filter(([,value])=>value!=='unavailable').map(([id])=>id));
 const records=new Map(planningRows.map(row=>[row.id,data.skills[row.id]]));
 if([...records.values()].some(skill=>!skill))throw new Error('체크리스트의 스킬 데이터를 확인할 수 없습니다. 1차 마신표를 다시 만들어 주세요.');
 if(inheritedCount(planningRows,states)>6)throw new Error('계승 스킬 확보는 최대 6개입니다. 체크리스트를 확인하세요.');
 for(const id of chart.nativeIds){if(!nativeUnique(data.skills[id]))throw new Error('본체 고유기 정보를 확인하세요.');records.set(id,data.skills[id]);}
 const rules=selectionRules(data,records),purchase=new RecordedPurchaseModel(data,planningRows,states,setup);
 const lower=new Map([...records.keys()].map(id=>[id,new Set(relatedAcquisitionIds(hierarchy,id))]));
 const active=ids=>[...new Set(ids)].filter(id=>!ids.some(high=>high!==id&&lower.get(high)?.has(id))).sort();
 const owned=[...purchase.owned],required=active([...chart.nativeIds,...owned]);
 setup.ownedSkillIds=owned;setup.possessionGraph=Object.fromEntries([...hierarchy.lower].map(([id,low])=>[id,[...low]]));setup.inheritanceOrigins=inheritanceOrigins(data);
 const compiled=new Map([...records].map(([id,skill])=>[id,compileChartSkill(skill,setup)]));
 if(required.some(id=>compiled.get(id).status==='unsupported'))throw new Error('이미 습득한 스킬의 실제 스탯 계산을 지원하지 않습니다. 체크리스트를 확인해 주세요.');
 const legal=ids=>ids.every((id,index)=>ids.slice(0,index).every(other=>rules.compatible(id,other)))&&scenarioSelectionAllowed(data,ids,setup.scenarioId)&&ids.filter(id=>data.skills[id].inherited).length<=6&&acquisitionConstraints.allowed([...owned,...ids]);
 if(!legal(required))throw new Error('이미 습득한 스킬의 진화 제한 또는 중복 관계가 충돌합니다. 체크리스트를 확인해 주세요.');
 const retained=ids=>required.every(id=>ids.includes(id)||ids.some(high=>lower.get(high)?.has(id)));
 const excluded=[];
 const candidates=planningRows.filter(row=>hint(states[row.id])!==null&&!owned.includes(row.id)).filter(row=>{
  if(!supported(compiled.get(row.id))&&compiled.get(row.id).status!=='inactive'){excluded.push({id:row.id,reason:'현재 능력치·조건에서 계산할 수 없음'});return false;}
  if(!purchase.selection([row.id]).complete){excluded.push({id:row.id,reason:'구매 비용 확인 필요'});return false;}
  const ids=active([...required,row.id]);return retained(ids)&&legal(ids)&&!required.includes(row.id);
 });
 const evaluator=new RaceEvaluator(setup,compiled,required,chart.nativeIds,branchSampler);let evaluations=0,hpPrunedPlans=0;
 const evaluate=(ids,count,step,stopOnHpFailure=false)=>{
  ids=active(ids);if(!retained(ids)||!legal(ids))return null;
  const priced=purchase.selection(ids);if(!priced.complete||priced.used>setup.spBudget)return null;
  const result=evaluator.evaluate(ids,count,step,{stopOnHpFailure});evaluations++;
  if(result.hpRejected){hpPrunedPlans++;return null;}
  return {ids,cost:priced.used,...result};
 };
 const order=compareRacePlans;
 const evaluated=new Map();
 const quick=ids=>{const key=idKey(active(ids));if(!evaluated.has(key))evaluated.set(key,evaluate(ids,searchSamples,searchDt));return evaluated.get(key);};
 const baseline=quick(required),singles=[];
 onProgress({stage:'candidates',completed:0,total:candidates.length});await pause();
 for(let i=0;i<candidates.length;i++){
  if(cancelled())return null;
  const row=candidates[i],score=quick([...required,row.id]);if(score)singles.push({...score,id:row.id});
  if(i%5===4||i===candidates.length-1){onProgress({stage:'candidates',completed:i+1,total:candidates.length});await pause();}
 }
 const gainOrder=(a,b)=>b.gain-a.gain||a.cost-b.cost||a.id.localeCompare(b.id);
 const byGain=[...singles].sort(gainOrder),byEfficiency=[...singles].sort((a,b)=>b.gain/Math.max(1,b.cost)-a.gain/Math.max(1,a.cost)||gainOrder(a,b));
 const heals=[...singles].filter(row=>row.hp>baseline.hp+.1).sort((a,b)=>(b.hp-baseline.hp)/Math.max(1,b.cost)-(a.hp-baseline.hp)/Math.max(1,a.cost)).slice(0,8);
 const limit=Math.max(maxCandidates,Math.ceil(setup.spBudget/35));
 const pool=[...new Set([...byGain.slice(0,Math.ceil(limit/2)),...byEfficiency.slice(0,Math.ceil(limit/2)),...heals,...singles.filter(row=>data.skills[row.id].inherited),...singles.filter(row=>data.skills[row.id].rarity==='evolution')].map(row=>row.id))];
 const extend=(ids,id)=>[...ids.filter(other=>required.includes(other)||rules.compatible(id,other)||lower.get(id)?.has(other)),id];
 const scenarioIds=candidates.filter(row=>data.evolution_rules.some(r=>r.evolved_id===row.id&&r.owner_type==='scenario'&&r.owner_id===setup.scenarioId)).map(row=>row.id);
 const scenarioPacks=[[],...scenarioIds.map(id=>[id])];
 for(let a=0;a<scenarioIds.length;a++)for(let b=a+1;b<scenarioIds.length;b++)if(rules.compatible(scenarioIds[a],scenarioIds[b])&&scenarioSelectionAllowed(data,[scenarioIds[a],scenarioIds[b]],setup.scenarioId))scenarioPacks.push([scenarioIds[a],scenarioIds[b]]);
 const replaceScenario=(ids,pack)=>{
  const base=ids.flatMap(id=>scenarioIds.includes(id)&&!owned.includes(id)?[planningRows.find(row=>row.id===id)?.evolutionBaseId||data.evolution_rules.find(r=>r.evolved_id===id)?.base_id]:[id]);
  return pack.reduce(extend,base);
 };
 let method='bounded';
 if(pool.length<=9&&pool.length===singles.length){
  method='exhaustive';const total=2**pool.length;
  for(let mask=0;mask<total;mask++){
   if(cancelled())return null;
   quick([...required,...pool.filter((id,index)=>mask&(1<<index))]);
   if(mask%16===15){onProgress({stage:'search',completed:mask+1,total});await pause();}
  }
 }else{
  // Start from complete affordable packs as well as the empty baseline. A
  // shortlist with many singletons must not exhaust the search budget before
  // it can form a realistically sized purchase plan.
  const seeds=[baseline];
  for(const pack of dependencyPacks(compiled,candidates,required,purchase,setup.course.distance)){
   if(cancelled())return null;
   const value=quick(pack.reduce(extend,required));if(value)seeds.push(value);
   if(evaluated.size%16===0)await pause();
  }
  for(const ranking of [byEfficiency,byGain]){
   let seed=baseline;
   for(const row of ranking){
    if(cancelled())return null;
    const replace=seed.ids.filter(other=>required.includes(other)||rules.compatible(row.id,other)||lower.get(row.id)?.has(other));
    const next=quick([...replace,row.id]);if(next&&order(next,seed)<0)seed=next;
    if(evaluated.size%8===0){await pause();}
   }
   seeds.push(seed);
  }
  // Every valid scenario pair is considered, independently of shortlist rank.
  // This can buy the pair's rare parents as part of the same remaining-SP plan.
  for(const seed of seeds.slice())for(const pack of scenarioPacks){
   if(cancelled())return null;
   const value=quick(replaceScenario(seed.ids,pack));if(value)seeds.push(value);
   if(evaluated.size%16===0)await pause();
  }
  let frontier=[...new Map(seeds.map(row=>[idKey(row.ids),row])).values()].sort(order),searchStart=evaluated.size;
  frontier=frontier.slice(0,width);
  for(let depth=0;depth<pool.length;depth++){
   if(cancelled())return null;
   const next=new Map(frontier.map(row=>[idKey(row.ids),row]));
   expansion:for(const row of frontier)for(const id of pool){
    if(row.ids.includes(id))continue;
    const replace=row.ids.filter(other=>required.includes(other)||rules.compatible(id,other)||lower.get(id)?.has(other));
    const value=quick([...replace,id]);if(value)next.set(idKey(value.ids),value);
    if(evaluated.size-searchStart>=evaluationLimit)break expansion;
   }
   const ranked=[...next.values()].sort(order),cheap=[...ranked].sort((a,b)=>a.cost-b.cost||order(a,b))[0];
   const updated=[...new Map([...ranked.slice(0,width-1),cheap].filter(Boolean).map(row=>[idKey(row.ids),row])).values()];
   onProgress({stage:'search',completed:Math.min(evaluated.size-searchStart,evaluationLimit),total:evaluationLimit});await pause();
   if(evaluated.size-searchStart>=evaluationLimit||updated.map(row=>idKey(row.ids)).join('|')===frontier.map(row=>idKey(row.ids)).join('|'))break;
   frontier=updated;
  }
  // Reconsider a paid choice when a different affordable skill fits better.
  let seed=[...evaluated.values()].filter(Boolean).sort(order)[0],attempts=0;
  for(let pass=0;pass<3;pass++){
   let next=seed;
   const removable=seed.ids.filter(id=>!required.includes(id));
   for(const id of pool)for(const remove of removable){
    if(cancelled())return null;
    if(seed.ids.includes(id)||attempts++>=evaluationLimit)break;
    const value=quick(extend(seed.ids.filter(other=>other!==remove),id));if(value&&order(value,next)<0)next=value;
    if(attempts%32===0)await pause();
   }
   if(idKey(next.ids)===idKey(seed.ids))break;seed=next;
  }
 }
 // Explore broadly with few draws, then hold the final sample matrix fixed
 // before refining the integration step. One lucky draw per context must not
 // decide which complete packages reach the expensive final comparison.
 const variantsFor=ids=>[...ids.filter(id=>!required.includes(id)).map(id=>ids.filter(other=>other!==id)),...candidates.filter(row=>!ids.includes(row.id)).map(row=>extend(ids,row.id)),...scenarioPacks.map(pack=>replaceScenario(ids,pack))];
 const refineNeighborhood=async(seed,step,seeds,stage)=>{
  let best=seed,complete=false,checks=0,passes=0,batchChecks=0;
  const memo=new Map(seeds.filter(Boolean).map(row=>[idKey(row.ids),row]));
  const precise=ids=>{const key=idKey(active(ids));if(!memo.has(key)){memo.set(key,evaluate(ids,samples,step,best.feasible));checks++;}return memo.get(key);};
  for(let pass=0;pass<12;pass++){
   passes++;let next=best;const improvements=new Map(),variants=variantsFor(best.ids);
   for(let i=0;i<variants.length;i++){
    if(cancelled())return null;
    const value=precise(variants[i]);if(value&&order(value,best)<0)improvements.set(idKey(value.ids),value);if(value&&order(value,next)<0)next=value;
    if(i%2===1||i===variants.length-1){onProgress({stage,completed:i+1,total:variants.length});await pause();}
   }
   // Compose improving edits, then simulate the WHOLE proposed package. The
   // edits' standalone gains are never added and interacting edits can fail.
   let batch=best.ids;
   for(const value of [...improvements.values()].sort((a,b)=>a.cost-b.cost||order(a,b))){
    const removed=new Set(best.ids.filter(id=>!value.ids.includes(id))),added=value.ids.filter(id=>!best.ids.includes(id));
    const ids=active([...batch.filter(id=>!removed.has(id)),...added]),priced=purchase.selection(ids);
    if(retained(ids)&&legal(ids)&&priced.complete&&priced.used<=setup.spBudget)batch=ids;
   }
   if(improvements.size>1&&idKey(batch)!==idKey(best.ids)){
    batchChecks++;const value=precise(batch);if(value&&order(value,next)<0)next=value;
   }
   if(idKey(next.ids)===idKey(best.ids)){complete=true;break;}best=next;
  }
  return {best,complete,checks,passes,batchChecks,visited:[...memo.values()].filter(Boolean).sort(order)};
 };
 const ranked=[...evaluated.values()].filter(Boolean).sort(order);let finalists=ranked,screenedFinalists=0,stabilized=null;
 if(method!=='exhaustive'){
  const retainedPlans=new Map(ranked.slice(0,Math.max(24,width*8)).map(row=>[idKey(row.ids),row])),patterns=new Set();
  for(const row of ranked){
   const keys=[`inherit:${idKey(row.ids.filter(id=>data.skills[id].inherited))}`,`scenario:${idKey(row.ids.filter(id=>scenarioIds.includes(id)))}`,`cost:${Math.floor(8*row.cost/Math.max(1,setup.spBudget))}`];
   if(keys.some(key=>!patterns.has(key)))retainedPlans.set(idKey(row.ids),row);keys.forEach(key=>patterns.add(key));
  }
  retainedPlans.set(idKey(required),baseline);const screening=[...retainedPlans.values()],scores=[];
  for(let i=0;i<screening.length;i++){
   if(cancelled())return null;
   scores.push(evaluate(screening[i].ids,samples,searchDt));onProgress({stage:'screening',completed:i+1,total:screening.length});await pause();
  }
  screenedFinalists=scores.length;scores.sort(order);
  stabilized=await refineNeighborhood(scores[0],searchDt,scores,'stabilization');if(!stabilized)return null;
  finalists=stabilized.visited.slice(0,6);
 }
 const refined=[];
 if(!finalists.some(row=>idKey(row.ids)===idKey(required)))finalists.push(baseline);
 for(let i=0;i<finalists.length;i++){
  if(cancelled())return null;
  refined.push(evaluate(finalists[i].ids,samples,dt));onProgress({stage:'final',completed:i+1,total:finalists.length});await pause();
 }
 const closed=await refineNeighborhood(refined.sort(order)[0],dt,refined,'closure');if(!closed)return null;
 const best=closed.best,closureComplete=closed.complete,closureChecks=closed.checks;
 const priced=purchase.selection(best.ids),allocated=new Set();
 const groups=evolutionGroups(data,setup,planningRows.filter(row=>best.ids.includes(row.id)&&!owned.includes(row.id)&&row.rarity==='evolution'));
 const purchaseIds=new Set(best.ids.filter(id=>!chart.nativeIds.includes(id)&&!owned.includes(id)).map(id=>data.skills[id].rarity==='evolution'?(planningRows.find(row=>row.id===id)?.evolutionBaseId||data.evolution_rules.find(r=>r.evolved_id===id)?.base_id):id).filter(id=>!owned.includes(id)));
 const purchases=planningRows.filter(row=>purchaseIds.has(row.id)&&row.rarity!=='evolution').map(row=>{
  const stageIds=new Set((purchase.chain(row.id)||[]).map(stage=>stage.id));
  const stages=priced.stages.filter(stage=>stageIds.has(stage.id)&&!allocated.has(stage.id));stages.forEach(stage=>allocated.add(stage.id));
  return {...row,transformation:purchase.transforms.get(row.id)||null,cost:stages.reduce((sum,stage)=>sum+stage.cost,0),stages:stages.map(stage=>({...stage,name:data.skills[stage.id].name_jp})),hintLevel:hint(states[row.id])};
 });
 const finalSkills=best.ids.map(id=>{const row=planningRows.find(row=>row.id===id)||{...data.skills[id],name:data.skills[id].name_jp,description:data.skills[id].description_jp};return {...row,origin:chart.nativeIds.includes(id)?'native':owned.includes(id)?'owned':data.skills[id].rarity==='evolution'?'evolution':'purchase'};});
 const scenarioEvolutionCount=best.ids.filter(id=>data.evolution_rules.some(r=>r.evolved_id===id&&r.owner_type==='scenario'&&r.owner_id===setup.scenarioId)).length;
 const marginalContributions={};
 if(diagnostics)for(let i=0;i<best.ids.length;i++){
  if(cancelled())return null;
  const id=best.ids[i];marginalContributions[id]=evaluator.marginal(best.ids,id,samples,dt);
  if(i%2===1){onProgress({stage:'marginals',completed:i+1,total:best.ids.length});await pause();}
 }
 let physicsSensitivity=null;
 if(diagnostics){
  const alternate=new RaceEvaluator({...setup,fullSpurtMode:'off'},compiled,required,chart.nativeIds,branchSampler).evaluate(best.ids,samples,dt);
  physicsSensitivity={publicApproximationGain:best.gain,withoutExtraSpurtGain:alternate.gain,difference:best.gain-alternate.gain,interpretation:'model-sensitivity-not-an-error-bound'};
 }
 return {modelVersion:FINAL_MODEL_VERSION,chartModelVersion:chart.modelVersion,setup,acquisition:finalAcquisitionSnapshot(data,chart,states),nativeIds:[...chart.nativeIds],ownedIds:owned,activeIds:best.ids,purchases,evolutions:groups,scenarioEvolutionCount,finalSkills,
  budget:{total:setup.spBudget,used:priced.used,remaining:setup.spBudget-priced.used},gain:best.gain,robustGain:best.robustGain,performance:best.performance,scenarioSensitivity:best.scenarioSensitivity,objectivePolicy:RACE_OBJECTIVE,acquisitionValidation,scenarios:best.scenarios,scenarioCoverage:best.scenarioCoverage,marginalContributions,physicsSensitivity,usefulAccelerationRates:best.usefulAccelerationRates,timeGain:best.timeGain,hpRemaining:best.hp,fullSpeedFeasible:best.feasible,hpSuccessRate:best.hpSuccessRate,hpSuccesses:best.hpSuccesses,hpMean:best.hpMean,activationRates:best.activationRates,sampling:best.sampling,samplingPolicy:samplingPolicy(setup),
  candidateCount:candidates.length,excluded,calculationNotes:[...new Set(best.ids.flatMap(id=>compiled.get(id)?.calculationNotes||[]))],effectPolicy:'self-performance-only',search:{method,evaluations,hpPrunedPlans,shortlisted:pool.length,scenarioPacks:scenarioPacks.length,closureComplete,closureChecks,closurePasses:closed.passes,batchChecks:closed.batchChecks,screenedFinalists,screeningSamples:samples,stabilizationPasses:stabilized?.passes??0,stabilizationChecks:stabilized?.checks??0,stabilizationBatchChecks:stabilized?.batchChecks??0,stabilizationComplete:stabilized?.complete??true,globalOptimal:method==='exhaustive',optimalityScope:method==='exhaustive'?'affordable-recorded-candidates-at-declared-sampling-resolution':'bounded-search',searchSamples,searchDt,samples,dt},fullSpurtPolicy:chart.fullSpurtPolicy};
}
