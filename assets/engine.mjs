import {buildCandidates} from './candidates.mjs';
import {compileSkill,fixedContext} from './activation.mjs';
import {validateSetup,lengthsBetween,MODEL_VERSION} from './physics.mjs';
import {simulateSolo} from './solo.mjs';

export const SAMPLES=[0,.25,.5,.75,1];
const supported=s=>['supported','assumed'].includes(s.status);
const nativeUnique=s=>['unique','unique_low_star','unique_upgraded'].includes(s?.rarity);
const keyOf=ids=>[...ids].sort().join(',');
export class PreparationEngine{
 constructor(data,setup){
  validateSetup(setup);this.data=data;this.setup=setup;
  this.candidates=buildCandidates(data,{...setup,context:fixedContext(setup)});
  this.records=new Map([...this.candidates.learned,...this.candidates.inheritance,...this.candidates.factorCandidates].map(s=>[s.id,s]));
  this.compiled=new Map([...this.records].map(([id,s])=>[id,compileSkill(s,setup)]));
  this.runs=new Map();this.scores=new Map();this.selected=new Set();this.speedDisabled=new Set();this.auto=true;this.objective='efficient';
  this.families=new Map([...this.records.keys()].map(id=>[id,new Set([id])]));
  for(const r of data.relations.filter(r=>r.kind==='version_family')){
   const a=this.families.get(r.from_id),b=this.families.get(r.to_id);if(!a||!b)continue;
   const union=new Set([...a,...b]);for(const id of union)this.families.set(id,union);
  }
  // A pink replaces its raw gold/white prerequisite for skill selection and comparisons.
  for(const r of data.evolution_rules){
   if(!this.records.has(r.evolved_id))continue;
   const base=this.families.get(r.base_id)||new Set([r.base_id]);
   for(const id of base){this.families.get(r.evolved_id)?.add(id);this.families.get(id)?.add(r.evolved_id);}
  }
  this.defaultSelection();
 }
 record(id){return this.records.get(id);}
 compatible(a,b){
  if(a===b||this.families.get(a)?.has(b))return false;
  const sa=this.record(a),sb=this.record(b);
  if(sa?.inherited&&sb?.inherited&&sa.parent_ids.some(id=>sb.parent_ids.includes(id)))return false;
  const groups=this.record(a)?.choice_groups||[],other=this.record(b)?.choice_groups||[];
  return !groups.some(g=>other.includes(g));
 }
 normalize(ids){
  const result=[];
  for(const id of [...new Set(ids)])if(this.records.has(id)&&result.every(other=>this.compatible(id,other)))result.push(id);
  return result;
 }
 defaultSelection(){
  const list=this.candidates.learned.filter(s=>s.categories.includes('speed')||s.categories.includes('passive')||nativeUnique(s));
  // Keep the stronger supported tier and one evolution branch. Prerequisites do not stack.
  list.sort((a,b)=>Number(supported(this.compiled.get(b.id)))-Number(supported(this.compiled.get(a.id)))||
   this.strength(b)-this.strength(a)||a.id.localeCompare(b.id));
  this.selected=new Set(this.normalize(list.map(s=>s.id)));
 }
 strength(skill){return skill.invocations.reduce((sum,i)=>sum+i.effects.reduce((n,e)=>n+Math.max(0,e.value_raw),0),0);}
 toggle(id,checked,source=''){
  if(!this.records.has(id))throw new Error('알 수 없는 스킬입니다.');
  if(this.record(id).categories.includes('speed')){if(checked)this.speedDisabled.delete(id);else this.speedDisabled.add(id);}
  if(checked){for(const other of this.selected)if(!this.compatible(id,other))this.selected.delete(other);this.selected.add(id);}else this.selected.delete(id);
  if(source==='acceleration'||this.record(id).categories.includes('acceleration')&&!this.record(id).categories.includes('speed')&&!this.candidates.factorCandidates.some(s=>s.id===id))this.auto=false;
 }
 simulate(ids,q=.5,failHeals=false,omitAcceleration=false){
  const normalized=this.normalize(ids),key=keyOf(normalized)+'|'+q+'|'+failHeals+'|'+omitAcceleration;
  if(!this.runs.has(key)){
   let compiled=normalized.map(id=>this.compiled.get(id)).filter(supported);
   if(omitAcceleration)compiled=compiled.map(s=>({...s,invocations:s.invocations.map(i=>({...i,effects:i.effects.filter(e=>e.kind!=='acceleration')}))}));
   this.runs.set(key,simulateSolo(this.setup,compiled,q,{failHeals}));
   if(this.runs.size>300)this.runs.delete(this.runs.keys().next().value);
  }
  return this.runs.get(key);
 }
 compare(withIds,withoutIds){
  const key=keyOf(this.normalize(withIds))+'|'+keyOf(this.normalize(withoutIds));
  if(this.scores.has(key))return this.scores.get(key);
  const values=SAMPLES.map(q=>{
   const a=this.simulate(withIds,q),b=this.simulate(withoutIds,q);
   return a.status==='ok'&&b.status==='ok'?lengthsBetween(a,b):null;
  });
  const result=values.some(x=>x===null)?null:{median:values[2],min:Math.min(...values),max:Math.max(...values),values};
  this.scores.set(key,result);if(this.scores.size>20000)this.scores.delete(this.scores.keys().next().value);
  return result;
 }
 marginal(id,selection=this.selected){
  const compiled=this.compiled.get(id);
  if(!supported(compiled))return {id,status:compiled.status,reasons:compiled.reasons,gain:null};
  const others=[...selection].filter(other=>this.compatible(id,other));
  const gain=this.compare([...others,id],others);
  return {id,status:gain?compiled.status:'unsupported',reasons:gain?[]:['전개스퍼트 범위 초과'],assumed:compiled.assumed,gain};
 }
 cost(id){
  if(nativeUnique(this.record(id)))return 0; // The native unique is already possessed.
  const direct=this.data.internal_acceleration_comparison_cost[id];if(Number.isFinite(direct)&&direct>0)return direct;
  const bases=this.data.evolution_rules.filter(r=>r.evolved_id===id).map(r=>this.data.internal_acceleration_comparison_cost[r.base_id]).filter(x=>Number.isFinite(x)&&x>0);
  return bases.length?Math.min(...bases):null;
 }
 recommendation(){
  const learnedIds=new Set(this.candidates.learned.map(s=>s.id));
  const eligible=[...this.candidates.learned,...this.candidates.inheritance].filter(s=>s.categories.includes('acceleration')&&!this.speedDisabled.has(s.id)&&supported(this.compiled.get(s.id)));
  // Speed/compound and factor picks are fixed while acceleration-only picks are optimized.
  const fixed=[...this.selected].filter(id=>!this.record(id).categories.includes('acceleration')||this.record(id).categories.includes('speed')||nativeUnique(this.record(id))||!learnedIds.has(id)&&!this.record(id).inherited);
  const candidates=eligible.filter(s=>!fixed.includes(s.id)&&fixed.every(other=>this.compatible(s.id,other))).map(s=>s.id);
  const evaluated=new Map();
  const evaluate=ids=>{
   const key=keyOf(ids);if(evaluated.has(key))return evaluated.get(key);
   const gain=this.compare([...fixed,...ids],fixed),costs=ids.map(id=>this.cost(id));
   const row={ids,gain,cost:costs.every(x=>x!==null)?costs.reduce((a,b)=>a+b,0):Infinity};evaluated.set(key,row);return row;
  };
  const objective=this.objective==='safe'?'min':'median';
  const order=(a,b)=>(b.gain?.[objective]??-Infinity)-(a.gain?.[objective]??-Infinity)||a.cost-b.cost||a.ids.length-b.ids.length||keyOf(a.ids).localeCompare(keyOf(b.ids));
  let search='exact';
  if(candidates.length<=10){
   const walk=(at,ids)=>{if(at===candidates.length){evaluate(ids);return;}walk(at+1,ids);if(ids.every(id=>this.compatible(id,candidates[at])))walk(at+1,[...ids,candidates[at]]);};walk(0,[]);
  }else{
   search='beam';let frontier=[evaluate([])];
   // All eligible skills enter the search. The bounded search is explicitly reported,
   // never presented as an exhaustive global optimum.
   for(let depth=0;depth<Math.min(candidates.length,6);depth++){
    const next=new Map();
    for(const row of frontier)for(const id of candidates){
     if(row.ids.includes(id)||!row.ids.every(other=>this.compatible(id,other)))continue;
     const value=evaluate([...row.ids,id]);next.set(keyOf(value.ids),value);
    }
    if(!next.size)break;
    // Retain cheap combinations as well as high gains so efficiency survives pruning.
    const values=[...next.values()].filter(r=>r.gain),best=values.slice().sort(order).slice(0,4),cheap=values.slice().sort((a,b)=>a.cost-b.cost||order(a,b)).slice(0,4);
    frontier=[...new Map([...best,...cheap].map(r=>[keyOf(r.ids),r])).values()];
   }
  }
  const rows=[...evaluated.values()].filter(r=>r.gain).sort(order);
  let choice=rows[0];
  if(this.objective==='efficient'){
   const maximum=Math.max(0,...rows.map(r=>r.gain.median));
   choice=rows.filter(r=>Number.isFinite(r.cost)&&r.gain.median>=maximum*.9-1e-6).sort((a,b)=>a.cost-b.cost||b.gain.median-a.gain.median||a.ids.length-b.ids.length)[0];
  }else if(choice){
   // Numerical ties only: use the lowest undiscounted comparison cost.
   choice=rows.filter(r=>r.gain[objective]>=choice.gain[objective]-1e-6).sort((a,b)=>a.cost-b.cost||a.ids.length-b.ids.length||order(a,b))[0];
  }
  return {ids:choice?.ids||[],fixedIds:fixed,gain:choice?.gain||null,search,candidateCount:candidates.length,evaluations:evaluated.size,
   costIncomplete:candidates.some(id=>this.cost(id)===null),efficiencyFallback:this.objective==='efficient'&&(!choice||!Number.isFinite(choice.cost))};
 }
 analyze(){
  const recommendation=this.recommendation();
  if(this.auto)this.selected=new Set([...recommendation.fixedIds,...recommendation.ids]);
  const selected=[...this.selected],selectionScores=new Map();
  const score=id=>{if(!selectionScores.has(id))selectionScores.set(id,this.marginal(id));return selectionScores.get(id);};
  const skills=[...this.candidates.learned,...this.candidates.inheritance].map(s=>({...score(s.id),source:s.inherited?'inheritance':'learned'}));
  const factorScores=this.candidates.factorCandidates.map(s=>score(s.id));
  const rankedFactors=factorScores.filter(s=>s.gain&&s.gain.median>.005).sort((a,b)=>b.gain.median-a.gain.median||a.id.localeCompare(b.id));
  const familySeen=new Set(),factors=[];
  for(const s of rankedFactors){
   if([...this.families.get(s.id)||[s.id]].some(id=>familySeen.has(id)))continue;
   factors.push(s);for(const id of this.families.get(s.id)||[s.id])familySeen.add(id);if(factors.length===10)break;
  }
  for(const s of factorScores)if(this.selected.has(s.id)&&!factors.some(f=>f.id===s.id))factors.push({...s,pinned:true});
  const runs=SAMPLES.map(q=>this.simulate(selected,q)),main=runs[2];
  const accelValues=SAMPLES.map((q,k)=>{const reference=this.simulate(selected,q,false,true);return runs[k].status==='ok'&&reference.status==='ok'?lengthsBetween(runs[k],reference):null;});
  const comparison=accelValues.some(x=>x===null)?null:{median:accelValues[2],min:Math.min(...accelValues),max:Math.max(...accelValues),values:accelValues};
  const failed=this.simulate(selected,.5,true);
  return {modelVersion:MODEL_VERSION,mode:'comparison',blockingReason:main.status==='ok'?null:main.reason,selected,auto:this.auto,objective:this.objective,skills,factors,
   recommendation:{...recommendation,cost:undefined},comparison,
   acceleration:runs.map((r,index)=>({sample:SAMPLES[index],status:r.status,entry:r.entry,reach:r.reach})),
   stamina:main.status==='ok'?{hpMax:main.hpMax,hpRemaining:main.hpRemaining,fullSpeedFeasible:main.fullSpeedFeasible,depletion:main.minHpDepletion,
    failHealsRemaining:failed.hpRemaining,failHealsFeasible:failed.fullSpeedFeasible}:null,
   unsupportedSelected:selected.filter(id=>!supported(this.compiled.get(id))),
   unsupportedCount:skills.filter(s=>s.status==='unsupported').length,
   factorUnsupportedCount:factorScores.filter(s=>s.status==='unsupported').length};
 }
}
