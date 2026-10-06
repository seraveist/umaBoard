import {buildCandidates} from './candidates.mjs';
import {compileSkill,fixedContext} from './activation.mjs';
import {validateSetup,lengthsBetween,MODEL_VERSION} from './physics.mjs';
import {simulateSolo} from './solo.mjs';
import {INHERITANCE_LIMIT,INHERITANCE_TOP,positiveGain,scoreOrder,skillTables,visibleSkillIds} from './result-policy.mjs';
import {selectionRules,previewToggle} from './selection.mjs';

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
  this.runs=new Map();this.scores=new Map();this.recommendations=new Map();this.costs=new Map();
  this.selected=new Set();this.speedDisabled=new Set();this.userDisabled=new Set();this.auto=true;this.objective='maximum';
  this.fixedIds=new Set();this.userSelected=new Set();this.automaticIds=new Set();this.manualIds=new Set();
  this.rules=selectionRules(data,this.records);
  // A pure heal changes HP only unless a supported skill observes HP, skill
  // possession or activation counts. Keep such dependencies conservative.
  this.healDependent=[...this.compiled.values()].filter(supported).some(s=>s.invocations.some(i=>[...i.condition,...i.precondition].some(b=>b.dynamic.some(a=>
   a.field==='hp_per'||a.field.startsWith('activate_count_')||['is_used_skill_id','is_exist_skill_id','is_activate_other_skill_detail'].includes(a.field)))));
  this.defaultSelection();
  this.notice='';
 }
 record(id){return this.records.get(id);}
 compatible(a,b){
  return this.rules.compatible(a,b);
 }
 normalize(ids){
  return this.rules.normalize(ids);
 }
 defaultSelection(){
  const list=this.candidates.learned.filter(s=>supported(this.compiled.get(s.id))&&(s.categories.includes('speed')||s.categories.includes('passive')||nativeUnique(s)));
  // Keep the stronger supported tier and one evolution branch. Prerequisites do not stack.
  list.sort((a,b)=>Number(supported(this.compiled.get(b.id)))-Number(supported(this.compiled.get(a.id)))||
   this.strength(b)-this.strength(a)||a.id.localeCompare(b.id));
  this.fixedIds=new Set(this.normalize(list.map(s=>s.id)));this.syncSelection();
 }
 baselineSelection(){return this.normalize([...this.fixedIds,...[...this.userSelected].sort()]);}
 protectedSpeed(id){return this.fixedIds.has(id)||this.userSelected.has(id)&&this.record(id).categories.some(c=>['speed','passive'].includes(c));}
 clearSpeedSelection(){for(const id of [...this.userSelected])if(this.record(id).categories.some(c=>['speed','passive'].includes(c)))this.toggle(id,false,'speed');}
 syncSelection(){this.selected=new Set(this.normalize([...this.baselineSelection(),...[...(this.auto?this.automaticIds:this.manualIds)].sort()]));}
 useAutomatic(){this.auto=true;this.manualIds.clear();this.notice='';this.syncSelection();}
 strength(skill){return skill.invocations.reduce((sum,i)=>sum+i.effects.reduce((n,e)=>n+Math.max(0,e.value_raw),0),0);}
 toggle(id,checked,source=''){
  if(!this.records.has(id))throw new Error('알 수 없는 스킬입니다.');
  if(this.fixedIds.has(id)){this.notice=checked?'':'확정 경로의 기본 스킬은 고정 선택입니다.';return;}
  const preview=previewToggle(this.records,this.rules,this.selected,id,checked,this.fixedIds);
  this.notice=preview.notice;if(this.notice)return;
  if(checked)this.userDisabled.delete(id);else this.userDisabled.add(id);
  if(this.record(id).categories.includes('speed')){if(checked)this.speedDisabled.delete(id);else this.speedDisabled.add(id);}
  const next=new Set(preview.selected),skill=this.record(id);
  const manual=source==='acceleration'||source==='routes'&&skill.categories.includes('acceleration')||skill.categories.includes('acceleration')&&!skill.categories.includes('speed');
  this.userSelected=new Set([...this.userSelected].filter(other=>next.has(other)));
  if(manual){
   this.auto=false;this.automaticIds.clear();
   this.manualIds=new Set([...next].filter(other=>!this.fixedIds.has(other)&&!this.userSelected.has(other)));
  }else{
   if(checked)this.userSelected.add(id);
   this.automaticIds=new Set([...this.automaticIds].filter(other=>next.has(other)&&!this.userSelected.has(other)));
   this.manualIds=new Set([...this.manualIds].filter(other=>next.has(other)&&!this.userSelected.has(other)));
  }
  this.syncSelection();
 }
 selectMany(ids,source='speed'){
  this.notice='';
  // Ranked additions preserve existing choices and skip incompatible versions.
  for(const id of ids)if(this.records.has(id)&&!this.selected.has(id)&&[...this.selected].every(other=>this.compatible(id,other))&&
   (!this.record(id).inherited||[...this.selected].filter(other=>this.record(other).inherited).length<INHERITANCE_LIMIT))this.toggle(id,true,source);
 }
 comparisonIds(ids){
  return this.normalize(ids).filter(id=>supported(this.compiled.get(id))&&(this.healDependent||!this.record(id).categories.every(c=>c==='heal')));
 }
 simulate(ids,q=.5,failHeals=false,omitAcceleration=false){
  const normalized=this.normalize(ids).sort(),key=keyOf(normalized)+'|'+q+'|'+failHeals+'|'+omitAcceleration;
  if(!this.runs.has(key)){
   let compiled=normalized.map(id=>this.compiled.get(id)).filter(supported);
   if(omitAcceleration)compiled=compiled.map(s=>({...s,invocations:s.invocations.map(i=>({...i,effects:i.effects.filter(e=>e.kind!=='acceleration')}))}));
   this.runs.set(key,simulateSolo(this.setup,compiled,q,{failHeals}));
   if(this.runs.size>1000)this.runs.delete(this.runs.keys().next().value);
  }
  return this.runs.get(key);
 }
 compare(withIds,withoutIds,samples=SAMPLES){
  withIds=this.comparisonIds(withIds);withoutIds=this.comparisonIds(withoutIds);
  const key=keyOf(withIds)+'|'+keyOf(withoutIds)+'|'+samples.join(',');
  if(this.scores.has(key))return this.scores.get(key);
  const values=samples.map(q=>{
   const a=this.simulate(withIds,q),b=this.simulate(withoutIds,q);
   return a.status==='ok'&&b.status==='ok'?lengthsBetween(a,b):null;
  });
  const result=values.some(x=>x===null)?null:{median:values[samples.indexOf(.5)],min:samples.length>1?Math.min(...values):null,max:samples.length>1?Math.max(...values):null,values};
  this.scores.set(key,result);if(this.scores.size>20000)this.scores.delete(this.scores.keys().next().value);
  return result;
 }
 marginal(id,selection=this.selected,samples){
  const compiled=this.compiled.get(id);
  if(!supported(compiled))return {id,status:compiled.status,reasons:compiled.reasons,gain:null};
  if(!this.fixedIds.has(id)&&[...this.fixedIds].some(other=>!this.compatible(id,other)))
   return {id,status:'inactive',reasons:['고정 스킬과 함께 습득 불가'],gain:null};
  const safety=this.objective==='safe'&&this.record(id).categories.includes('acceleration');
  samples??=safety?SAMPLES:[.5];
  const others=[...selection].filter(other=>this.compatible(id,other));
  // At the inheritance limit an unchecked unique is a replacement candidate,
  // not a fictitious seventh inherited skill or a silently ignored addition.
  let gain,safetyGain;
  const evaluate=withIds=>{
   const paired=this.compare(withIds,others,samples);
   let contribution;
   if(safety&&samples.length===SAMPLES.length){
    const baseline=this.baselineSelection(),withBase=this.compare(withIds,baseline,samples),withoutBase=this.compare(others,baseline,samples);
    if(withBase&&withoutBase)contribution=withBase.min-withoutBase.min;
   }
   return {gain:paired,safetyGain:contribution};
  };
  const inherits=others.filter(other=>this.record(other).inherited);
  if(this.record(id).inherited&&inherits.length>=INHERITANCE_LIMIT){
   const best=inherits.map(replaced=>evaluate([...others.filter(other=>other!==replaced),id])).filter(s=>s.gain)
    .sort((a,b)=>(safety?(b.safetyGain??-Infinity)-(a.safetyGain??-Infinity):0)||b.gain.median-a.gain.median)[0];
   gain=best?.gain||null;safetyGain=best?.safetyGain;
  }else ({gain,safetyGain}=evaluate([...others,id]));
  return {id,status:gain?compiled.status:'unsupported',reasons:gain?[]:['주행 비교 실패'],assumed:compiled.assumed,gain,safetyGain};
 }
 cost(id){
  if(this.costs.has(id))return this.costs.get(id);
  const value=this.comparisonCost(id);this.costs.set(id,value);return value;
 }
 comparisonCost(id){
  if(nativeUnique(this.record(id)))return 0; // The native unique is already possessed.
  const direct=this.data.internal_acceleration_comparison_cost[id];if(Number.isFinite(direct)&&direct>0)return direct;
  const bases=this.data.evolution_rules.filter(r=>r.evolved_id===id).map(r=>this.data.internal_acceleration_comparison_cost[r.base_id]).filter(x=>Number.isFinite(x)&&x>0);
  return bases.length?Math.min(...bases):null;
 }
 recommendation(excluded=new Set()){
  if(!['maximum','safe'].includes(this.objective))throw new Error('추천 기준을 확인하세요.');
  const eligible=[...this.records.values()].filter(s=>s.categories.includes('acceleration')&&!excluded.has(s.id)&&!this.speedDisabled.has(s.id)&&supported(this.compiled.get(s.id)));
  // Unavailable ordinary whites compete with inherited and obtainable accelerations.
  const fixed=this.baselineSelection().filter(id=>!excluded.has(id));
  const inheritedRank=eligible.filter(s=>s.inherited).map(s=>this.marginal(s.id,fixed)).filter(s=>this.objective==='safe'?s.gain?.max>.005:positiveGain(s))
   .sort((a,b)=>this.objective==='safe'?(b.safetyGain??0)-(a.safetyGain??0)||(b.gain?.max??0)-(a.gain?.max??0)||scoreOrder(a,b):scoreOrder(a,b));
  const inheritedPool=new Set(inheritedRank.slice(0,INHERITANCE_TOP).map(s=>s.id));
  const poolReduced=inheritedRank.length>INHERITANCE_TOP;
  const candidates=eligible.filter(s=>(!s.inherited||inheritedPool.has(s.id))&&!fixed.includes(s.id)&&fixed.every(other=>this.compatible(s.id,other))).map(s=>s.id);
  const canAdd=(ids,id)=>ids.every(other=>this.compatible(id,other))&&(!this.record(id).inherited||[...fixed,...ids].filter(other=>this.record(other).inherited).length<INHERITANCE_LIMIT);
  const cacheKey=this.objective+'|'+keyOf(this.comparisonIds(fixed))+'|'+keyOf(candidates)+'|'+poolReduced+'|'+fixed.filter(id=>this.record(id).inherited).length;
  if(this.recommendations.has(cacheKey))return {...this.recommendations.get(cacheKey),fixedIds:fixed};
  const samples=this.objective==='safe'?SAMPLES:[.5];
  const evaluated=new Map();
  const evaluate=ids=>{
   const key=keyOf(ids);if(evaluated.has(key))return evaluated.get(key);
   const gain=this.compare([...fixed,...ids],fixed,samples),costs=ids.map(id=>this.cost(id));
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
    // Retain high gains and cheap ties within the same bounded search budget.
    const values=[...next.values()].filter(r=>r.gain),best=values.slice().sort(order).slice(0,4),cheap=values.slice().sort((a,b)=>a.cost-b.cost||order(a,b)).slice(0,4);
    frontier=[...new Map([...best,...cheap].map(r=>[keyOf(r.ids),r])).values()];
   }
  }
  const rows=[...evaluated.values()].filter(r=>r.gain).sort(order);
  let choice=rows[0];
  if(choice){
   // Numerical ties only: use the lowest undiscounted comparison cost.
   choice=rows.filter(r=>r.gain[objective]>=choice.gain[objective]-1e-6).sort((a,b)=>a.cost-b.cost||a.ids.length-b.ids.length||order(a,b))[0];
  }
  const result={ids:choice?.ids||[],gain:choice?.gain||null,search:poolReduced?'beam':search,candidateCount:candidates.length,evaluations:evaluated.size};
  this.recommendations.set(cacheKey,result);if(this.recommendations.size>32)this.recommendations.delete(this.recommendations.keys().next().value);
  return {...result,fixedIds:fixed};
 }
 scoreSkill(id){
  const s=this.record(id),score=this.marginal(id);let hpGain=0;
  if(s.categories.includes('heal')&&supported(this.compiled.get(id))){
   const others=[...this.selected].filter(other=>this.compatible(id,other));
   hpGain=this.simulate([...others,id]).hpRemaining-this.simulate(others).hpRemaining;
  }
  return {...score,hpGain,source:s.inherited?'inheritance':s.routes?.length?'learned':'factor'};
 }
 scoredSkills(){
  return [...this.records.keys()].map(id=>this.scoreSkill(id));
 }
 settleSelection(excluded){
  // Remove one redundant skill at a time: two interchangeable accelerations must
  // not both disappear merely because each currently has zero marginal gain.
  let removed=0;
  for(;;){
   const redundant=[...this.selected].filter(id=>!this.protectedSpeed(id)).sort((a,b)=>(this.cost(b)??Infinity)-(this.cost(a)??Infinity)||a.localeCompare(b))
    .find(id=>{const s=this.scoreSkill(id);return !positiveGain(s)&&!positiveGain(s,'acceleration')&&!(this.record(id).categories.includes('heal')&&s.hpGain>.5);});
   if(redundant){this.removeSelection(redundant);excluded.add(redundant);removed++;continue;}
   const entries=this.scoredSkills(),tables=skillTables(this.records,entries),visible=visibleSkillIds(tables);
   const rejected=[...this.selected].filter(id=>!this.protectedSpeed(id)&&!visible.has(id)).sort((a,b)=>(this.cost(b)??Infinity)-(this.cost(a)??Infinity)||a.localeCompare(b));
   if(!rejected.length)return {entries,tables,removed};
   const id=rejected[0];this.removeSelection(id);excluded.add(id);removed++;
  }
 }
 removeSelection(id){this.userSelected.delete(id);this.automaticIds.delete(id);this.manualIds.delete(id);this.syncSelection();}
 analyze(){
  this.syncSelection();
  const excluded=new Set();let recommendation,settled;
  for(;;){
   recommendation=this.auto?this.recommendation(excluded):{ids:[],fixedIds:[...this.selected],gain:null,search:'manual',candidateCount:0,evaluations:0};
   if(this.auto){this.automaticIds=new Set(recommendation.ids);this.syncSelection();}
   settled=this.settleSelection(excluded);
   if(!this.auto||!settled.removed)break;
   // The exclusion set only grows, so filtered selections cannot cycle back in.
  }
  const selected=[...this.selected],visible=visibleSkillIds(settled.tables);
  const skills=settled.entries.filter(s=>visible.has(s.id));
  const runs=SAMPLES.map(q=>this.simulate(selected,q)),main=runs[2];
  const accelValues=SAMPLES.map((q,k)=>{const reference=this.simulate(selected,q,false,true);return runs[k].status==='ok'&&reference.status==='ok'?lengthsBetween(runs[k],reference):null;});
  const comparison=accelValues.some(x=>x===null)?null:{median:accelValues[2],min:Math.min(...accelValues),max:Math.max(...accelValues),values:accelValues};
  const failed=this.simulate(selected,.5,true),reference=this.simulate(selected,.5,false,true);
  const graphPoints=r=>r.trace.filter(p=>p.t>=r.entry.t-4&&p.t<=r.entry.t+12).map(p=>({...p,t:p.t-r.entry.t}));
  return {modelVersion:MODEL_VERSION,mode:'comparison',blockingReason:main.status==='ok'?null:main.reason,selected,auto:this.auto,objective:this.objective,skills,tables:settled.tables,notice:this.notice,
   fixedIds:[...this.fixedIds],userSelected:[...this.userSelected],automaticIds:[...this.automaticIds],manualIds:[...this.manualIds],visibleSelected:selected.filter(id=>visible.has(id)),
   accelerationGraph:main.entry&&reference.entry?{sample:.5,selected:graphPoints(main),reference:graphPoints(reference)}:null,
   fullSpurtExcluded:runs.some(r=>r.fullSpurtExcluded),
   recommendation:{...recommendation,cost:undefined},comparison,
   acceleration:runs.map((r,index)=>({sample:SAMPLES[index],status:r.status,entry:r.entry,reach:r.reach})),
   stamina:main.status==='ok'?{hpMax:main.hpMax,hpRemaining:main.hpRemaining,fullSpeedFeasible:main.fullSpeedFeasible,depletion:main.minHpDepletion,
    failHealsRemaining:failed.hpRemaining,failHealsFeasible:failed.fullSpeedFeasible}:null,
   unsupportedSelected:selected.filter(id=>!supported(this.compiled.get(id))),
   unsupportedCount:settled.entries.filter(s=>s.status==='unsupported').length};
 }
}
