import {compileChartSkill,branchSampler,CM_DT,CM_SAMPLES} from './cm-chart.mjs';
import {STAT_KEYS,validateSetup,lengthsBetween} from './physics.mjs';
import {simulateSolo} from './solo.mjs';
import {discountedCost,nativeUnique} from './purchases.mjs';
import {selectionRules} from './selection.mjs';
import {scenarioSelectionAllowed} from './acquisition-rules.mjs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds,checklistSnapshot} from './cm-state.mjs';

export const FINAL_MODEL_VERSION='cm-post-training-v2';
const supported=s=>s&&['supported','assumed'].includes(s.status);
const hint=value=>/^[0-5]$/.test(String(value))?Number(value):null;
const idKey=ids=>[...new Set(ids)].sort().join(',');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

export function createFinalSetup(chart,input){
 if(!chart?.setup||!Array.isArray(chart.rows)||!Array.isArray(chart.nativeIds))throw new Error('먼저 1차 마신표를 완성해 주세요.');
 const setup={...chart.setup,stats:{...input.stats},aptitudes:{...chart.setup.aptitudes,...input.aptitudes}};
 for(const key of STAT_KEYS)if(!Number.isInteger(setup.stats[key])||setup.stats[key]<1||setup.stats[key]>3000)throw new Error('실제 능력치는 1~3000 사이의 정수로 입력하세요.');
 if(!Number.isSafeInteger(input.spBudget)||input.spBudget<0||input.spBudget>100000)throw new Error('보유 SP는 0~100000 사이의 정수로 입력하세요.');
 if(input.fastLearner!==undefined&&typeof input.fastLearner!=='boolean')throw new Error('수완가 선택을 확인하세요.');
 validateSetup(setup);return {...setup,spBudget:input.spBudget,fastLearner:input.fastLearner??false};
}

// The post-training budget is remaining SP. Paid prerequisites are sunk costs;
// recorded hints replace every pre-training route/event price assumption.
export class RecordedPurchaseModel{
 constructor(data,rows,states,{fastLearner=false}={}){
  this.data=data;this.rows=new Map(rows.map(row=>[row.id,row]));this.states=states;this.cache=new Map();
  this.extraDiscount=fastLearner?10:0;
  this.owned=new Set(rows.filter(row=>states[row.id]==='owned').map(row=>row.id));
 }
 chain(id,path=new Set()){
  if(this.cache.has(id))return this.cache.get(id);
  if(path.has(id))return null;
  const skill=this.data.skills[id];if(!skill)return null;
  if(this.owned.has(id)||nativeUnique(skill))return [];
  path=new Set([...path,id]);let chain;
  if(skill.rarity==='evolution'){
   const base=this.rows.get(id)?.evolutionBaseId||this.data.evolution_rules.find(rule=>rule.evolved_id===id)?.base_id;
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
    const level=hint(this.states[stage.id])??(this.data.skills[id]?.rarity==='evolution'&&stage.id===chain.at(-1)?.id?hint(this.states[id]):null)??0;
    const existing=stages.get(stage.id);
    if(!existing||level>existing.hint)stages.set(stage.id,{...stage,hint:level,extraDiscount:this.extraDiscount,cost:discountedCost(stage.base,level,this.extraDiscount)});
   }
  }
  return {complete:true,used:[...stages.values()].reduce((sum,stage)=>sum+stage.cost,0),stages:[...stages.values()]};
 }
}

export async function recommendFinalPlan(data,chart,acquisition,input,{onProgress=()=>{},cancelled=()=>false,evaluationLimit=480,width=4,maxCandidates=40,searchSamples=2,searchDt=.05,samples=CM_SAMPLES,dt=CM_DT}={}){
 const setup=createFinalSetup(chart,input),hierarchy=buildAcquisitionHierarchy(data);
 const states=checklistSnapshot(chart.rows,acquisition,hierarchy),records=new Map(chart.rows.map(row=>[row.id,data.skills[row.id]]));
 if([...records.values()].some(skill=>!skill))throw new Error('체크리스트의 스킬 데이터를 확인할 수 없습니다. 1차 마신표를 다시 만들어 주세요.');
 if(chart.rows.filter(row=>row.inherited&&states[row.id]!=='unavailable').length>6)throw new Error('계승 스킬 확보는 최대 6개입니다. 체크리스트를 확인하세요.');
 for(const id of chart.nativeIds){if(!nativeUnique(data.skills[id]))throw new Error('본체 고유기 정보를 확인하세요.');records.set(id,data.skills[id]);}
 const rules=selectionRules(data,records),purchase=new RecordedPurchaseModel(data,chart.rows,states,setup);
 const lower=new Map([...records.keys()].map(id=>[id,new Set(relatedAcquisitionIds(hierarchy,id))]));
 const active=ids=>[...new Set(ids)].filter(id=>!ids.some(high=>high!==id&&lower.get(high)?.has(id))).sort();
 const owned=[...purchase.owned],required=active([...chart.nativeIds,...owned]);
 const compiled=new Map([...records].map(([id,skill])=>[id,compileChartSkill(skill,setup)]));
 if(required.some(id=>compiled.get(id).status==='unsupported'))throw new Error('이미 습득한 스킬의 실제 스탯 계산을 지원하지 않습니다. 체크리스트를 확인해 주세요.');
 const legal=ids=>ids.every((id,index)=>ids.slice(0,index).every(other=>rules.compatible(id,other)))&&scenarioSelectionAllowed(data,ids,setup.scenarioId)&&ids.filter(id=>data.skills[id].inherited).length<=6;
 if(!legal(required))throw new Error('이미 습득한 스킬의 진화 제한 또는 중복 관계가 충돌합니다. 체크리스트를 확인해 주세요.');
 const retained=ids=>required.every(id=>ids.includes(id)||ids.some(high=>lower.get(high)?.has(id)));
 const excluded=[];
 const candidates=chart.rows.filter(row=>hint(states[row.id])!==null&&!owned.includes(row.id)).filter(row=>{
  if(!supported(compiled.get(row.id))){excluded.push({id:row.id,reason:'현재 능력치·조건에서 계산할 수 없음'});return false;}
  if(!purchase.selection([row.id]).complete){excluded.push({id:row.id,reason:'구매 비용 확인 필요'});return false;}
  const ids=active([...required,row.id]);return retained(ids)&&legal(ids)&&!required.includes(row.id);
 });
 const runs=new Map();let evaluations=0;
 const simulate=(ids,sample,step)=>{
  const key=idKey(ids)+'|'+sample+'|'+step;
  if(!runs.has(key)){
   const run=simulateSolo(setup,ids.map(id=>compiled.get(id)).filter(supported),.5,{dt:step,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(setup,chart.nativeIds,sample)});
   runs.set(key,{finishTime:run.finishTime,hp:run.hpRemaining,feasible:run.fullSpeedFeasible,run});
   // Keep only compact summaries after comparison; traces never accumulate.
   while(runs.size>100)runs.delete(runs.keys().next().value);
  }
  return runs.get(key);
 };
 const evaluate=(ids,count,step)=>{
  ids=active(ids);if(!retained(ids)||!legal(ids))return null;
  const priced=purchase.selection(ids);if(!priced.complete||priced.used>setup.spBudget)return null;
  let gain=0,timeGain=0,hp=Infinity,feasible=true;
  for(let sample=0;sample<count;sample++){
   const before=simulate(required,sample,step),after=simulate(ids,sample,step);
   gain+=lengthsBetween(after.run,before.run);timeGain+=before.finishTime-after.finishTime;hp=Math.min(hp,after.hp);feasible&&=after.feasible;
  }
  evaluations++;return {ids,cost:priced.used,gain:gain/count,timeGain:timeGain/count,hp,feasible};
 };
 const order=(a,b)=>Number(b.feasible)-Number(a.feasible)||(!a.feasible&&!b.feasible?b.hp-a.hp:0)||b.gain-a.gain||a.cost-b.cost||idKey(a.ids).localeCompare(idKey(b.ids));
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
 const pool=[...new Set([...byGain.slice(0,maxCandidates/2),...byEfficiency.slice(0,maxCandidates/2),...heals].map(row=>row.id))];
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
  const seeds=[baseline],poolSet=new Set(pool);
  for(const ranking of [byEfficiency,byGain]){
   let seed=baseline;
   for(const row of ranking.filter(row=>poolSet.has(row.id))){
    if(cancelled())return null;
    const replace=seed.ids.filter(other=>required.includes(other)||rules.compatible(row.id,other)||lower.get(row.id)?.has(other));
    const next=quick([...replace,row.id]);if(next&&order(next,seed)<0)seed=next;
    if(evaluated.size%8===0){await pause();}
   }
   seeds.push(seed);
  }
  let frontier=[...new Map(seeds.map(row=>[idKey(row.ids),row])).values()].sort(order),searchStart=evaluated.size;
  for(let depth=0;depth<pool.length;depth++){
   if(cancelled())return null;
   const next=new Map(frontier.map(row=>[idKey(row.ids),row]));
   for(const row of frontier)for(const id of pool){
    if(row.ids.includes(id))continue;
    const replace=row.ids.filter(other=>required.includes(other)||rules.compatible(id,other)||lower.get(id)?.has(other));
    const value=quick([...replace,id]);if(value)next.set(idKey(value.ids),value);
    if(evaluated.size-searchStart>=evaluationLimit)break;
   }
   const ranked=[...next.values()].sort(order),cheap=[...ranked].sort((a,b)=>a.cost-b.cost||order(a,b))[0];
   const updated=[...new Map([...ranked.slice(0,width-1),cheap].filter(Boolean).map(row=>[idKey(row.ids),row])).values()];
   onProgress({stage:'search',completed:Math.min(evaluated.size-searchStart,evaluationLimit),total:evaluationLimit});await pause();
   if(evaluated.size-searchStart>=evaluationLimit||updated.map(row=>idKey(row.ids)).join('|')===frontier.map(row=>idKey(row.ids)).join('|'))break;
   frontier=updated;
  }
 }
 // Actual combinations, rather than sums of individual chart gains, determine
 // the recommendation. Re-evaluate finalists with the chart's full 24/.01 policy.
 const finalists=[...evaluated.values()].filter(Boolean).sort(order).slice(0,method==='exhaustive'?8:6),refined=[];
 if(!finalists.some(row=>idKey(row.ids)===idKey(required)))finalists.push(baseline);
 for(let i=0;i<finalists.length;i++){
  if(cancelled())return null;
  refined.push(evaluate(finalists[i].ids,samples,dt));onProgress({stage:'final',completed:i+1,total:finalists.length});await pause();
 }
 const best=refined.sort(order)[0],priced=purchase.selection(best.ids),allocated=new Set();
 const newIds=best.ids.filter(id=>!chart.nativeIds.includes(id)&&!owned.includes(id));
 const purchases=chart.rows.filter(row=>newIds.includes(row.id)).map(row=>{
  const stageIds=new Set((purchase.chain(row.id)||[]).map(stage=>stage.id));
  const stages=priced.stages.filter(stage=>stageIds.has(stage.id)&&!allocated.has(stage.id));stages.forEach(stage=>allocated.add(stage.id));
  return {...row,cost:stages.reduce((sum,stage)=>sum+stage.cost,0),stages:stages.map(stage=>({...stage,name:data.skills[stage.id].name_jp})),hintLevel:hint(states[row.id])};
 });
 return {modelVersion:FINAL_MODEL_VERSION,chartModelVersion:chart.modelVersion,setup,acquisition:states,nativeIds:[...chart.nativeIds],ownedIds:owned,activeIds:best.ids,purchases,
  budget:{total:setup.spBudget,used:priced.used,remaining:setup.spBudget-priced.used},gain:best.gain,timeGain:best.timeGain,hpRemaining:best.hp,fullSpeedFeasible:best.feasible,
  candidateCount:candidates.length,excluded,search:{method,evaluations,shortlisted:pool.length,searchSamples,searchDt,samples,dt},fullSpurtPolicy:chart.fullSpurtPolicy};
}
