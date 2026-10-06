import {buildCandidates} from './candidates.mjs';
import {compileSkill,fixedContext} from './activation.mjs';
import {validateSetup,lengthsBetween,MODEL_VERSION} from './physics.mjs';
import {simulateSolo} from './solo.mjs';
import {INHERITANCE_LIMIT,INHERITANCE_TOP,positiveGain,scoreOrder,skillTables,visibleSkillIds} from './result-policy.mjs';

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
  this.runs=new Map();this.scores=new Map();this.selected=new Set();this.speedDisabled=new Set();this.userDisabled=new Set();this.auto=true;this.objective='efficient';
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
  this.notice='';
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
  const result=[];let inherits=0;
  for(const id of [...new Set(ids)])if(this.records.has(id)&&result.every(other=>this.compatible(id,other))&&(!this.record(id).inherited||inherits<INHERITANCE_LIMIT)){
   result.push(id);if(this.record(id).inherited)inherits++;
  }
  return result;
 }
 defaultSelection(){
  const list=this.candidates.learned.filter(s=>supported(this.compiled.get(s.id))&&(s.categories.includes('speed')||s.categories.includes('passive')||nativeUnique(s)));
  // Keep the stronger supported tier and one evolution branch. Prerequisites do not stack.
  list.sort((a,b)=>Number(supported(this.compiled.get(b.id)))-Number(supported(this.compiled.get(a.id)))||
   this.strength(b)-this.strength(a)||a.id.localeCompare(b.id));
  this.selected=new Set(this.normalize(list.map(s=>s.id)));
 }
 strength(skill){return skill.invocations.reduce((sum,i)=>sum+i.effects.reduce((n,e)=>n+Math.max(0,e.value_raw),0),0);}
 toggle(id,checked,source=''){
  if(!this.records.has(id))throw new Error('알 수 없는 스킬입니다.');
  this.notice='';
  if(checked&&this.record(id).inherited&&[...this.selected].filter(other=>this.record(other).inherited&&this.compatible(id,other)).length>=INHERITANCE_LIMIT){
   this.notice='계승 고유기는 속도·가속 합계 최대 6개까지 선택할 수 있습니다.';return;
  }
  if(checked)this.userDisabled.delete(id);else this.userDisabled.add(id);
  if(this.record(id).categories.includes('speed')){if(checked)this.speedDisabled.delete(id);else this.speedDisabled.add(id);}
  if(checked){for(const other of this.selected)if(!this.compatible(id,other))this.selected.delete(other);this.selected.add(id);}else this.selected.delete(id);
  if(source==='acceleration'||this.record(id).categories.includes('acceleration')&&!this.record(id).categories.includes('speed'))this.auto=false;
 }
 simulate(ids,q=.5,failHeals=false,omitAcceleration=false){
  const normalized=this.normalize(ids),key=keyOf(normalized)+'|'+q+'|'+failHeals+'|'+omitAcceleration;
  if(!this.runs.has(key)){
   let compiled=normalized.map(id=>this.compiled.get(id)).filter(supported);
   if(omitAcceleration)compiled=compiled.map(s=>({...s,invocations:s.invocations.map(i=>({...i,effects:i.effects.filter(e=>e.kind!=='acceleration')}))}));
   this.runs.set(key,simulateSolo(this.setup,compiled,q,{failHeals}));
   if(this.runs.size>1000)this.runs.delete(this.runs.keys().next().value);
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
  // At the inheritance limit an unchecked unique is a replacement candidate,
  // not a fictitious seventh inherited skill or a silently ignored addition.
  let gain;
  const inherits=others.filter(other=>this.record(other).inherited);
  if(this.record(id).inherited&&inherits.length>=INHERITANCE_LIMIT){
   gain=inherits.map(replaced=>this.compare([...others.filter(other=>other!==replaced),id],others)).filter(Boolean)
    .sort((a,b)=>b.median-a.median)[0]||null;
  }else gain=this.compare([...others,id],others);
  return {id,status:gain?compiled.status:'unsupported',reasons:gain?[]:['주행 비교 실패'],assumed:compiled.assumed,gain};
 }
 cost(id){
  if(nativeUnique(this.record(id)))return 0; // The native unique is already possessed.
  const direct=this.data.internal_acceleration_comparison_cost[id];if(Number.isFinite(direct)&&direct>0)return direct;
  const bases=this.data.evolution_rules.filter(r=>r.evolved_id===id).map(r=>this.data.internal_acceleration_comparison_cost[r.base_id]).filter(x=>Number.isFinite(x)&&x>0);
  return bases.length?Math.min(...bases):null;
 }
 recommendation(excluded=new Set()){
  const eligible=[...this.records.values()].filter(s=>s.categories.includes('acceleration')&&!excluded.has(s.id)&&!this.speedDisabled.has(s.id)&&supported(this.compiled.get(s.id)));
  // Unavailable ordinary whites compete with inherited and obtainable accelerations.
  const fixed=[...this.selected].filter(id=>!excluded.has(id)&&(!this.record(id).categories.includes('acceleration')||this.record(id).categories.includes('speed')||nativeUnique(this.record(id))));
  const inheritedRank=eligible.filter(s=>s.inherited).map(s=>this.marginal(s.id,fixed)).filter(positiveGain).sort(scoreOrder);
  const inheritedPool=new Set(inheritedRank.slice(0,INHERITANCE_TOP).map(s=>s.id));
  const poolReduced=inheritedRank.length>INHERITANCE_TOP;
  const candidates=eligible.filter(s=>(!s.inherited||inheritedPool.has(s.id))&&!fixed.includes(s.id)&&fixed.every(other=>this.compatible(s.id,other))).map(s=>s.id);
  const canAdd=(ids,id)=>ids.every(other=>this.compatible(id,other))&&(!this.record(id).inherited||[...fixed,...ids].filter(other=>this.record(other).inherited).length<INHERITANCE_LIMIT);
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
   const walk=(at,ids)=>{if(at===candidates.length){evaluate(ids);return;}walk(at+1,ids);if(canAdd(ids,candidates[at]))walk(at+1,[...ids,candidates[at]]);};walk(0,[]);
  }else{
   search='beam';let frontier=[evaluate([])];
   // All shortlisted skills enter the search. The bounded search is explicitly reported,
   // never presented as an exhaustive global optimum.
   for(let depth=0;depth<Math.min(candidates.length,6);depth++){
    const next=new Map();
    for(const row of frontier)for(const id of candidates){
     if(row.ids.includes(id)||!canAdd(row.ids,id))continue;
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
  return {ids:choice?.ids||[],fixedIds:fixed,gain:choice?.gain||null,search:poolReduced?'beam':search,candidateCount:candidates.length,evaluations:evaluated.size,
   costIncomplete:candidates.some(id=>this.cost(id)===null),efficiencyFallback:this.objective==='efficient'&&(!choice||!Number.isFinite(choice.cost))};
 }
 scoredSkills(){
  const learned=new Set(this.candidates.learned.map(s=>s.id));
  return [...this.records.values()].map(s=>{
   const score=this.marginal(s.id);let hpGain=0;
   if(s.categories.includes('heal')&&supported(this.compiled.get(s.id))){
    const others=[...this.selected].filter(id=>this.compatible(s.id,id));
    hpGain=this.simulate([...others,s.id]).hpRemaining-this.simulate(others).hpRemaining;
   }
   return {...score,hpGain,source:s.inherited?'inheritance':learned.has(s.id)?'learned':'factor'};
  });
 }
 settleSelection(excluded){
  // Remove one redundant skill at a time: two interchangeable accelerations must
  // not both disappear merely because each currently has zero marginal gain.
  let removed=0;
  for(;;){
   const entries=this.scoredSkills(),tables=skillTables(this.records,entries),visible=visibleSkillIds(tables);
   const rejected=[...this.selected].filter(id=>!visible.has(id)).sort((a,b)=>(this.cost(b)??Infinity)-(this.cost(a)??Infinity)||a.localeCompare(b));
   if(!rejected.length)return {entries,tables,removed};
   const id=rejected[0];this.selected.delete(id);excluded.add(id);removed++;
  }
 }
 analyze(){
  const excluded=new Set();let recommendation,settled;
  for(;;){
   recommendation=this.recommendation(excluded);
   if(this.auto)this.selected=new Set(this.normalize([...recommendation.fixedIds,...recommendation.ids]));
   settled=this.settleSelection(excluded);
   if(!this.auto||!settled.removed)break;
   // The exclusion set only grows, so filtered selections cannot cycle back in.
  }
  const selected=[...this.selected],visible=visibleSkillIds(settled.tables);
  const skills=settled.entries.filter(s=>visible.has(s.id));
  const runs=SAMPLES.map(q=>this.simulate(selected,q)),main=runs[2];
  const accelValues=SAMPLES.map((q,k)=>{const reference=this.simulate(selected,q,false,true);return runs[k].status==='ok'&&reference.status==='ok'?lengthsBetween(runs[k],reference):null;});
  const comparison=accelValues.some(x=>x===null)?null:{median:accelValues[2],min:Math.min(...accelValues),max:Math.max(...accelValues),values:accelValues};
  const failed=this.simulate(selected,.5,true);
  return {modelVersion:MODEL_VERSION,mode:'comparison',blockingReason:main.status==='ok'?null:main.reason,selected,auto:this.auto,objective:this.objective,skills,tables:settled.tables,notice:this.notice,
   fullSpurtExcluded:runs.some(r=>r.fullSpurtExcluded),
   recommendation:{...recommendation,cost:undefined},comparison,
   acceleration:runs.map((r,index)=>({sample:SAMPLES[index],status:r.status,entry:r.entry,reach:r.reach})),
   stamina:main.status==='ok'?{hpMax:main.hpMax,hpRemaining:main.hpRemaining,fullSpeedFeasible:main.fullSpeedFeasible,depletion:main.minHpDepletion,
    failHealsRemaining:failed.hpRemaining,failHealsFeasible:failed.fullSpeedFeasible}:null,
   unsupportedSelected:selected.filter(id=>!supported(this.compiled.get(id))),
   unsupportedCount:settled.entries.filter(s=>s.status==='unsupported').length};
 }
}
