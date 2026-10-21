import {PreparationEngine,SAMPLES} from './engine.mjs';
import {PurchaseModel,nativeUnique} from './purchases.mjs';
import {skillTables,INHERITANCE_TOP,INHERITANCE_LIMIT,positiveGain,scoreOrder} from './result-policy.mjs';
import {previewToggle} from './selection.mjs';

const supported=c=>c&&['supported','assumed'].includes(c.status);
const key=ids=>[...new Set(ids)].sort().join(',');
const dependencyAtoms=skill=>skill.invocations.flatMap(i=>[...(i.condition||[]),...(i.precondition||[])].flat()).filter(a=>a.field.startsWith('activate_count_')||['is_used_skill_id','is_exist_skill_id'].includes(a.field));
export class SkillOptimizer extends PreparationEngine{
 constructor(data,setup){
  if(!Number.isSafeInteger(setup.spBudget)||setup.spBudget<0)throw new Error('예상 총 SP는 0 이상의 정수로 입력하세요.');
  super(data,{...setup,purchase:true});
  this.purchase=new PurchaseModel(data,this.records,this.setup);this.pendingOptimization=true;
  this.optimization=null;this.auto=false;this.lateCache=new Map();
  this.dependencyBasis=this.normalize([...this.nativeIds,...[...this.records.values()].filter(s=>!s.inherited&&s.categories.some(c=>['speed','passive'].includes(c))&&supported(this.compiled.get(s.id))).map(s=>s.id)]).slice(0,30);
 }
 defaultSelection(){
  this.nativeIds=new Set(this.candidates.learned.filter(s=>nativeUnique(s)&&supported(this.compiled.get(s.id))).map(s=>s.id));
  this.fixedIds=new Set(this.nativeIds);this.selected=new Set(this.nativeIds);this.lockedIds=new Set();
 }
 syncSelection(){for(const id of this.nativeIds||[])this.selected.add(id);}
 baselineSelection(){return [...this.fixedIds].sort();}
 protectedSpeed(id){return this.fixedIds.has(id);}
 toggle(id,checked){
  const preview=previewToggle(this.records,this.rules,this.selected,id,checked,this.fixedIds);
  this.notice=preview.notice;if(this.notice)return;
  this.selected=new Set(preview.selected);this.userSelected=new Set([...this.selected].filter(id=>!this.nativeIds.has(id)));
  if(checked)this.userDisabled.delete(id);else this.userDisabled.add(id);
  this.auto=false;this.pendingOptimization=false;
 }
 lock(id,locked){
  if(this.nativeIds.has(id))return;
  if(locked&&!this.selected.has(id))this.toggle(id,true);
  if(locked&&!this.selected.has(id))return;
  if(locked)this.lockedIds.add(id);else this.lockedIds.delete(id);
  this.fixedIds=new Set([...this.nativeIds,...this.lockedIds]);this.pendingOptimization=false;
 }
 selectMany(ids){
  for(const id of ids)if(!this.selected.has(id)&&[...this.selected].every(other=>this.compatible(id,other)))this.toggle(id,true);
 }
 clearSpeedSelection(){
  for(const id of [...this.selected])if(!this.fixedIds.has(id)&&this.record(id).categories.some(c=>['speed','passive'].includes(c)))this.toggle(id,false);
 }
 useAutomatic(){this.pendingOptimization=true;this.auto=false;this.notice='';}
 resetExcluded(){this.userDisabled.clear();this.pendingOptimization=false;this.notice='';}
 simulate(...args){
  const run=super.simulate(...args);
  while(this.runs.size>128)this.runs.delete(this.runs.keys().next().value);
  return run;
 }
 cost(id){return this.purchase?.cheapest(id)??super.cost(id);}
 lateAcceleration(id){
  if(this.lateCache.has(id))return this.lateCache.get(id);
  const skill=this.record(id),compiled=this.compiled.get(id);
  if(!skill.categories.includes('acceleration')||!supported(compiled))return false;
  const baseline=dependencyAtoms(skill).length?this.dependencyBasis.filter(other=>this.compatible(id,other)):[...this.nativeIds],before=this.simulate(baseline),run=this.simulate([...baseline,id]);
  const accIndexes=new Set(compiled.invocations.filter(i=>i.effects.some(e=>e.kind==='acceleration')).map(i=>i.index));
  const late=run.events.some(e=>e.id===id&&accIndexes.has(e.index)&&(e.x>=2*this.setup.course.distance/3||e.t+(e.duration||0)>=run.entry.t-.05))
   ||Math.abs(run.entry.speed-before.entry.speed)>.01&&run.events.some(e=>e.id===id&&accIndexes.has(e.index));
  this.lateCache.set(id,late);return late;
 }
 marginal(id,selection=this.selected,samples){
  if(this.record(id).categories.every(c=>c==='acceleration')&&!this.lateAcceleration(id))return {id,status:'inactive',reasons:['종반 기여가 없는 초반 전용 가속'],gain:null};
  return super.marginal(id,selection,samples);
 }
 settleSelection(){
  const entries=this.scoredSkills(),tables=skillTables(this.records,entries);
  tables.acceleration.ordinary=tables.acceleration.ordinary.filter(id=>this.lateAcceleration(id));
  tables.acceleration.inheritance=tables.acceleration.inheritance.filter(id=>this.lateAcceleration(id));
  return {entries,tables,removed:0};
 }
 optimize({evaluationLimit=this.objective==='safe'?450:1100,width=3,maxCandidates=52}={}){
  const required=[...this.fixedIds].sort(),price=this.purchase.selection(required),baseline=[...this.nativeIds].sort();
  if(!price.complete||!price.feasible){
   this.notice=price.conflict?'고정 스킬의 이벤트 선택지가 충돌합니다.':!price.complete?'고정 스킬의 구매 비용을 확인할 수 없습니다.':'고정 스킬이 SP 예산을 초과합니다.';
   return {status:'infeasible',search:'none',evaluations:0,candidateCount:0};
  }
  const entries=[...this.records.keys()].filter(id=>!this.userDisabled.has(id)&&!this.fixedIds.has(id)&&supported(this.compiled.get(id)))
   .map(id=>({...this.marginal(id,required,[.5]),cost:this.purchase.cheapest(id),hpGain:this.record(id).categories.includes('heal')?this.simulate([...required,id]).hpRemaining-this.simulate(required).hpRemaining:0}));
  // A late speed effect can have zero solo gain before acceleration is added.
  // Use a provisional compatible acceleration set only to admit/rank candidates;
  // final evaluations always simulate and price the real selected combination.
  const accelerationSeed=entries.filter(e=>positiveGain(e)&&this.record(e.id).categories.includes('acceleration')&&this.lateAcceleration(e.id)).sort(scoreOrder).reduce((ids,e)=>ids.length<3&&[...required,...ids].every(id=>this.compatible(e.id,id))?[...ids,e.id]:ids,[]);
  for(const e of entries)if(!positiveGain(e)&&(dependencyAtoms(this.record(e.id)).length||this.record(e.id).categories.includes('acceleration'))){
   const helper=this.dependencyBasis.filter(id=>this.compatible(e.id,id)&&required.every(other=>this.compatible(id,other))),optimistic=this.marginal(e.id,[...required,...helper],[.5]);
   if(positiveGain(optimistic))e.gain=optimistic.gain;
  }
  const helpers=new Set(entries.filter(positiveGain).flatMap(e=>dependencyAtoms(this.record(e.id)).filter(a=>['is_used_skill_id','is_exist_skill_id'].includes(a.field)).map(a=>String(a.value))).filter(id=>this.records.has(id)));
  for(const e of entries)if(this.record(e.id).categories.some(c=>['speed','passive'].includes(c))&&accelerationSeed.every(id=>this.compatible(e.id,id))){
   const optimistic=this.marginal(e.id,[...required,...accelerationSeed],[.5]);
   if((optimistic.gain?.median||0)>(e.gain?.median||0))e.gain=optimistic.gain;
  }
  const inherited=new Set(['speed','acceleration'].flatMap(type=>entries.filter(e=>this.record(e.id).inherited&&this.record(e.id).categories.includes(type)&&positiveGain(e)).sort(scoreOrder).slice(0,INHERITANCE_TOP).map(e=>e.id)));
  const eligible=entries.filter(e=>e.cost!==null&&(positiveGain(e)||e.hpGain>.5||helpers.has(e.id))&&(!this.record(e.id).inherited||inherited.has(e.id))&&required.every(id=>this.compatible(e.id,id)));
  const byGain=eligible.slice().sort(scoreOrder),byEfficiency=eligible.slice().sort((a,b)=>(b.gain?.median||0)/Math.max(1,b.cost)-(a.gain?.median||0)/Math.max(1,a.cost)||scoreOrder(a,b));
  const heal=eligible.filter(e=>e.hpGain>.5).sort((a,b)=>b.hpGain/Math.max(1,b.cost)-a.hpGain/Math.max(1,a.cost)).slice(0,6);
  const pool=[...new Set([...byGain.slice(0,Math.floor(maxCandidates/2)).map(e=>e.id),...byEfficiency.slice(0,Math.floor(maxCandidates/2)).map(e=>e.id),...heal.map(e=>e.id),...eligible.filter(e=>helpers.has(e.id)).map(e=>e.id)])];
  const samples=this.objective==='safe'?SAMPLES:[.5],evaluated=new Map();
  const evaluate=ids=>{
   ids=[...new Set(ids)].sort();const k=key(ids);if(evaluated.has(k))return evaluated.get(k);
   if(ids.some((id,i)=>ids.slice(0,i).some(other=>!this.compatible(id,other)))||ids.filter(id=>this.record(id).inherited).length>INHERITANCE_LIMIT)return null;
   const priced=this.purchase.selection(ids);if(!priced.feasible)return null;
   const gain=this.compare(ids,baseline,samples),runs=samples.map(q=>this.simulate(ids,q));if(!gain)return null;
   const hp=Math.min(...runs.map(r=>r.hpRemaining)),feasible=runs.every(r=>r.fullSpeedFeasible);
   const row={ids,gain,score:this.objective==='safe'?gain.min:gain.median,hp,feasible,cost:priced.used};evaluated.set(k,row);return row;
  };
  const performance=(a,b)=>b.score-a.score||a.cost-b.cost||key(a.ids).localeCompare(key(b.ids));
  const order=(a,b)=>Number(b.feasible)-Number(a.feasible)||(!a.feasible&&!b.feasible?b.hp-a.hp:0)||performance(a,b);
  let frontier=[evaluate(required)],search='exact';
  if(pool.length<=9){
   const walk=(at,ids)=>{if(at===pool.length){evaluate(ids);return;}walk(at+1,ids);if(ids.every(id=>this.compatible(id,pool[at])))walk(at+1,[...ids,pool[at]]);};walk(0,required);
  }else{
   search='beam';
   for(let depth=0;depth<pool.length&&evaluated.size<evaluationLimit;depth++){
    const next=new Map(frontier.map(r=>[key(r.ids),r]));
    for(const row of frontier)for(const id of pool){
     if(row.ids.includes(id)||required.some(other=>!this.compatible(id,other)))continue;
     const candidate=row.ids.filter(other=>this.compatible(id,other)),value=evaluate([...candidate,id]);
     if(value)next.set(key(value.ids),value);
     if(evaluated.size>=evaluationLimit)break;
    }
    const rows=[...next.values()],best=rows.slice().sort(order)[0],fast=rows.slice().sort(performance)[0],cheap=rows.slice().sort((a,b)=>a.cost-b.cost||order(a,b))[0];
    const updated=[...new Map([best,fast,cheap,...rows.sort(order)].filter(Boolean).map(r=>[key(r.ids),r])).values()].slice(0,width);
    if(updated.map(r=>key(r.ids)).join('|')===frontier.map(r=>key(r.ids)).join('|'))break;
    frontier=updated;
   }
  }
  let choice=[...evaluated.values()].sort(order)[0];
  // Drop redundant purchased effects without dropping user locks or HP coverage.
  if(choice)for(const id of choice.ids.filter(id=>!this.fixedIds.has(id)).sort()){
   const lower=evaluate(choice.ids.filter(other=>other!==id));
   if(lower&&lower.feasible===choice.feasible&&lower.score>=choice.score-.005&&(lower.feasible||lower.hp>=choice.hp))choice=lower;
  }
  if(choice){this.selected=new Set(choice.ids);this.automaticIds=new Set(choice.ids.filter(id=>!this.fixedIds.has(id)));this.userSelected.clear();}
  this.notice=choice&&!choice.feasible?'현재 탐색에서 최속 스퍼트 HP 조건을 만족하는 조합을 찾지 못했습니다.':'';
  return {status:choice?.feasible?'ok':'hp_deficit',gain:choice?.gain,search:search==='exact'&&eligible.length===pool.length?'exact':'beam',evaluations:evaluated.size,candidateCount:eligible.length,shortlisted:pool.length,cost:choice?.cost};
 }
 analyze(){
  const optimized=this.pendingOptimization;
  if(optimized){this.optimization=this.optimize();this.pendingOptimization=false;}
  const result=super.analyze(),purchase=this.purchase.selection(result.selected),plan=this.purchase.routeRows(result.selected,purchase);
  const prices=Object.fromEntries([...this.records.keys()].map(id=>[id,this.purchase.cheapest(id)]));
  return {...result,mode:'skill-optimization',costPolicyVersion:this.purchase.policyVersion,eventSearchTruncated:this.purchase.truncated,optimized,totalGain:this.compare(result.selected,[...this.nativeIds]),nativeIds:[...this.nativeIds],lockedIds:[...this.lockedIds],excludedIds:[...this.userDisabled],optimization:this.optimization,prices,
   budget:{total:this.setup.spBudget,used:purchase.used,remaining:purchase.remaining,complete:purchase.complete,feasible:purchase.feasible,unknown:purchase.unknown,conflict:!!purchase.conflict},
   finalPlan:plan,eventGroups:this.purchase.groups,eventChoices:purchase.state?.choices||{}};
 }
}
