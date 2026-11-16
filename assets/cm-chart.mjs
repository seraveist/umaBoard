import {buildCandidates,possibleInContext} from './candidates.mjs';
import {compileSkill,fixedContext,sampleBranches} from './activation.mjs';
import {simulateSolo} from './solo.mjs';
import {lengthsBetween,validateSetup,uniqueLevel} from './physics.mjs';
import {characterIdentity} from './acquisition-rules.mjs';
import {withCourseMetadata} from './cm-course-metadata.mjs';
import {INHERITED_UPGRADES,inheritedPerformanceSkill,styleRecommendation,selectInheritedTop} from './cm-recommendation.mjs';

export const CM_MODEL_VERSION='cm-first-chart-v2';
export const CM_SAMPLES=24;
export const CM_DT=.01;
const native=skill=>['unique','unique_low_star','unique_upgraded'].includes(skill?.rarity);
const supported=skill=>['supported','assumed'].includes(skill?.status);
const ASSUME=new Set(['hp_per','is_exist_skill_id','activate_count_all','activate_count_start','activate_count_middle','activate_count_end_after','activate_count_later_half','activate_count_heal','activate_count_param_skill','is_badstart','is_goodstart','temptation_count','is_temptation']);
for(const field of ['running_style_count_same','running_style_count_same_rate','running_style_equal_popularity_one','same_skill_horse_count','behind_near_lane_time_set1','change_order_up_end_after','change_order_up_middle','change_order_up_finalcorner_after','is_other_character_activate_advantage_skill','is_popularity_top_character_activate_advantage_skill','is_activate_any_skill','is_activate_heal_skill','succession_skill_count','random_lot','random_lot_shared','temptation_opponent_count_behind'])ASSUME.add(field);
const randomPrime=[2,3,5,7,11,13,17,19,23,29,31,37];
ASSUME.add('visiblehorse'); // Nearby/visible opponents are fulfilled triggers too.
export function radicalInverse(n,base){let x=0,f=1/base;for(;n>0;n=Math.floor(n/base),f/=base)x+=n%base*f;return x;}
const skillHash=id=>[...String(id)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,0);

export function createChartSetup(data,catalog,input){
 const profile=catalog.profiles[String(input.scenarioId)];
 if(!profile)throw new Error('선택한 시나리오의 상한 데이터를 확인할 수 없습니다.');
 const outfit=data.outfits[String(input.outfitId)];
 if(!outfit)throw new Error('육성 우마무스메를 선택하세요.');
 const supports=(input.supportIds||[]).filter(Boolean).map(String);
 if(supports.length>6||new Set(supports).size!==supports.length)throw new Error('서포트는 중복 없이 최대 6장까지 편성할 수 있습니다.');
 const names=new Set();
 for(const id of supports){
  const card=data.supports[id];if(!card||card.rarity!=='SSR')throw new Error('SSR 서포트 카드를 선택하세요.');
  const name=characterIdentity(card.name_jp);
  if(name===outfit.name_jp)throw new Error('육성 우마무스메와 같은 캐릭터의 서포트는 편성할 수 없습니다.');
  if(names.has(name))throw new Error('같은 캐릭터의 서포트를 중복 편성할 수 없습니다.');names.add(name);
 }
 const bloom=Number(input.bloom??5),level=Number(input.uniqueLevel??uniqueLevel(bloom));
 if(!Number.isInteger(bloom)||bloom<outfit.base_stars||bloom>5||!Number.isInteger(level)||level<1||level>6)throw new Error('보유 육성마의 개화와 고유기 레벨을 확인하세요.');
 const setup={outfitId:outfit.id,bloom,uniqueLevel:level,style:Number(input.style),scenarioId:profile.id,supportIds:supports,
  course:withCourseMetadata(data.courses[String(input.courseId)]),going:Number(input.going??1),weather:Number(input.weather??1),season:Number(input.season??3),time:Number(input.time??2),
  mood:2,stats:{...profile.stats},aptitudes:{distance:'A',surface:'A',style:'A'},chartPolicy:CM_MODEL_VERSION};
 validateSetup(setup);
 if(![1,2,3,4].includes(setup.weather)||![1,2,3,4].includes(setup.season)||![1,2,3].includes(setup.time))throw new Error('CM의 날씨·계절·시간을 확인하세요.');
 return setup;
}

export function compileChartSkill(skill,setup){
 // The chart compares the skill's effect after its acquisition/trigger predicates
 // succeed. Real temporal/spatial constraints and same-skill linked effects remain.
 const assume=dnf=>dnf===null?null:dnf.map(group=>group.filter(a=>!ASSUME.has(a.field)&&!(a.field==='is_used_skill_id'&&String(a.value)!==skill.id)));
 const policies=new Map();
 const adjusted={...skill,invocations:skill.invocations.map(inv=>{
  const atoms=(inv.condition||[]).flat();
  const policy=atoms.some(a=>a.field==='all_corner_random')?'corners':atoms.some(a=>a.field==='straight_random')?'straight':null;
  // Only these two repeat policies have verified source window semantics.
  if(policy)policies.set(inv.index,{policy,cooldown:(inv.cooldown_raw||0)/10000*setup.course.distance/1000});
  return {...inv,condition:assume(inv.condition),precondition:assume(inv.precondition),cooldown_raw:policies.has(inv.index)?null:inv.cooldown_raw};
 })};
 const compiled=compileSkill(adjusted,setup);
 for(const inv of compiled.invocations){
  const p=policies.get(inv.index);if(p){inv.chartRandomPolicy=p.policy;inv.cooldownSeconds=p.cooldown;}
 }
 return compiled;
}

export function buildChartCandidates(data,setup){
 const candidates=buildCandidates(data,{...setup,purchase:true,preserveEvolutionBases:true,context:fixedContext(setup)});
 const records=new Map([...candidates.learned,...candidates.factorCandidates,...candidates.inheritance].map(s=>[s.id,s]));
 const add=(id,route)=>{
  const raw=data.skills[id];if(!raw?.jp_available||!possibleInContext(raw,fixedContext(setup)))return;
  if(!records.has(id))records.set(id,{...raw,routes:[],choice_groups:[]});
  const s=records.get(id),routes=s.routes||[];if(route&&!routes.some(r=>JSON.stringify(r)===JSON.stringify(route)))records.set(id,{...s,routes:[...routes,route]});
 };
 // A comparison/checklist retains the gold AND every evolution alternative.
 // Purchase mutual exclusion belongs to the later training-result optimizer.
 for(const rule of data.evolution_rules)if(records.has(rule.evolved_id))add(rule.base_id,{kind:'evolution_base',owner_type:rule.owner_type,owner_id:rule.owner_id});
 // These verified inherited evolutions replace their weaker version, always.
 for(const [base,strong] of Object.entries(INHERITED_UPGRADES)){
  const original=records.get(base),upgraded=records.get(strong);
  if(original&&!upgraded){add(strong,original.routes?.[0]);if(records.has(strong))records.set(strong,{...records.get(strong),inheritance_outfit_ids:original.inheritance_outfit_ids});}
  if(records.has(strong))records.delete(base);
 }
 for(const skill of [...records.values()]){
  let stage=data.purchase_stages?.[skill.id];const seen=new Set();
  while(stage?.prerequisite_id&&!seen.has(stage.prerequisite_id)){
   const id=stage.prerequisite_id;seen.add(id);add(id,{kind:'prerequisite',owner_type:'skill',owner_id:skill.id});stage=data.purchase_stages?.[id];
  }
 }
 return records;
}

export function sortChartRows(rows,data,display){
 const meta=display.skills||{},parents=new Map(Object.entries(INHERITED_UPGRADES).map(([base,strong])=>[strong,base]));
 for(const [id,stage]of Object.entries(data.purchase_stages||{}))if(stage.status==='verified'&&stage.prerequisite_id)parents.set(id,stage.prerequisite_id);
 for(const rule of data.evolution_rules)parents.set(rule.evolved_id,rule.base_id);
 const resolve=(id,seen=new Set())=>{
  if(meta[id])return meta[id];if(seen.has(id))return null;seen.add(id);
  return parents.has(id)?resolve(parents.get(id),seen):null;
 };
 const familyRoot=id=>{const seen=new Set();while(parents.has(id)&&!seen.has(id)){seen.add(id);id=parents.get(id);}return id;};
 const entries=rows.map(row=>({row,m:resolve(row.id),root:familyRoot(row.id)})),familyMetadata=new Map();
 for(const {m,root}of entries)if(m&&(!familyMetadata.has(root)||m.order<familyMetadata.get(root).order))familyMetadata.set(root,m);
 const groups=new Map();
 for(const {row,m,root}of entries){
  const groupId=familyMetadata.get(root)?.groupId||`missing-${root}`;
  if(!groups.has(groupId))groups.set(groupId,{id:groupId,rows:[],order:Infinity,icon:Infinity});
  const group=groups.get(groupId);group.rows.push({...row,groupId,iconId:m?.iconId||null,orderVerified:!!meta[row.id]});
  if(m){group.order=Math.min(group.order,m.order);group.icon=Math.min(group.icon,Number(String(m.iconId).slice(0,-1)));}
 }
 const byGroup=[...groups.values()].sort((a,b)=>a.icon-b.icon||a.order-b.order||a.id.localeCompare(b.id));
 const tier=row=>row.inherited?0:row.rarity==='evolution'?2:row.rarity==='gold'?1:0;
 return byGroup.flatMap(group=>{
  const tiers=[...new Set(group.rows.map(tier))].sort((a,b)=>b-a);
  return group.rows.sort((a,b)=>tier(b)-tier(a)||(meta[a.id]?.order??Infinity)-(meta[b.id]?.order??Infinity)||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id))
   .map(row=>({...row,indentLevel:row.inherited?0:tiers.indexOf(tier(row))}));
 });
}

function branchSampler(setup,nativeIds,sample){
 const nSet=new Set(nativeIds);
 const value=(id,index,dimension)=>{
  const offset=skillHash(id)%19,base=randomPrime[(dimension+(nSet.has(id)?0:1)+index*2)%randomPrime.length];
  return radicalInverse(sample+1+offset,base);
 };
 return (branches,id,inv,pre)=>{
  if(pre)return sampleBranches(branches,.5,true);
  if(inv.chartRandomPolicy){
   const areas=inv.chartRandomPolicy==='corners'?setup.course.corners.map(c=>[c.start,c.start+c.length]):setup.course.straights.map(s=>[s.start,s.end]);
   const count=inv.chartRandomPolicy==='corners'?2:1,windows=[];
   for(let k=0;k<count;k++){
    const selected=areas[Math.min(areas.length-1,Math.floor(value(id,inv.index,k*2)*areas.length))];
    if(!selected)continue;
    const start=inv.chartRandomPolicy==='corners'
     ?selected[0]+value(id,inv.index,k*2+1)*Math.max(0,selected[1]-selected[0]-10)
     :Math.min(selected[0]+value(id,inv.index,k*2+1)*(selected[1]-selected[0]),selected[1]-2);
    windows.push([start,Math.min(selected[1],start+10)]);
   }
   return branches.flatMap(branch=>{
    const clipped=windows.flatMap(([lo,hi])=>branch.windows.map(([a,b])=>[Math.max(lo,a),Math.min(hi,b)]).filter(([a,b])=>a<b)).sort((a,b)=>a[0]-b[0]);
    return clipped.length?[{...branch,random:false,windows:clipped,at:clipped[0][0]}]:[];
   });
  }
  return branches.map((branch,index)=>sampleBranches([branch],value(id,inv.index,index))[0]);
 };
}

export function prepareChart(data,profiles,display,input,{samples=CM_SAMPLES,dt=CM_DT}={}){
 if(!Number.isInteger(samples)||samples<1||samples>256||!(dt>0&&dt<=.1))throw new Error('계산 표본 설정이 올바르지 않습니다.');
 const setup=createChartSetup(data,profiles,input),records=buildChartCandidates(data,setup),compiled=new Map([...records].map(([id,s])=>[id,compileChartSkill(s,setup)]));
 const nativeRecords=[...records.values()].filter(native),nativeSkills=nativeRecords.map(s=>compiled.get(s.id));
 if(nativeSkills.some(s=>s.status==='unsupported'))throw new Error('이 육성마의 고유기는 아직 계산을 지원하지 않습니다. 다른 육성마를 선택하세요.');
 const baseline=nativeSkills.filter(supported),nativeIds=nativeRecords.map(s=>s.id);
 const rows=sortChartRows([...records.values()].filter(s=>!native(s)&&supported(compiled.get(s.id))&&(!s.inherited||inheritedPerformanceSkill(compiled.get(s.id))&&styleRecommendation(s,compiled.get(s.id),setup).eligible)).map(s=>({id:s.id,name:s.name_jp,description:s.description_jp,
  rarity:s.rarity,inherited:s.inherited,categories:s.categories,routes:s.routes||[],providers:s.inheritance_outfit_ids||[],recommendation:styleRecommendation(s,compiled.get(s.id),setup),
  evolutionBaseId:data.evolution_rules.find(r=>r.evolved_id===s.id&&((r.owner_type==='outfit'&&r.owner_id===setup.outfitId)||(r.owner_type==='scenario'&&r.owner_id===setup.scenarioId)))?.base_id||null})),data,display);
 const baselines=new Map(),optionsFor=sample=>({dt,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(setup,nativeIds,sample)});
 const runBaseline=sample=>{if(!baselines.has(sample))baselines.set(sample,simulateSolo(setup,baseline,.5,optionsFor(sample)));return baselines.get(sample);};
 const baselineRandom=baseline.some(s=>s.invocations.some(i=>i.chartRandomPolicy||i.condition.some(b=>b.random)));
 return {setup,rows,nativeIds,modelVersion:CM_MODEL_VERSION,samples,dt,
  excluded:[...compiled.values()].filter(s=>!native(s.skill)&&!supported(s)).map(s=>({id:s.id,status:s.status,reasons:s.reasons})),
  evaluate(row){
   const skill=compiled.get(row.id),random=baselineRandom||skill.invocations.some(i=>i.chartRandomPolicy||i.condition.some(b=>b.random)),count=random?samples:1;
   let gain=0,timeGain=0,hpGain=0;
   for(let sample=0;sample<count;sample++){
    const before=runBaseline(sample),after=simulateSolo(setup,[...baseline,skill],.5,optionsFor(sample));
    gain+=lengthsBetween(after,before);timeGain+=before.finishTime-after.finishTime;hpGain+=after.hpRemaining-before.hpRemaining;
   }
   return {...row,gain:gain/count,timeGain:timeGain/count,hpGain:hpGain/count,samples:count};
  }};
}

export async function generateChart(data,profiles,display,input,{onProgress=()=>{},cancelled=()=>false,batchSize=30,cache=new Map(),...options}={}){
 const task=prepareChart(data,profiles,display,input,options),setupKey=JSON.stringify({model:CM_MODEL_VERSION,setup:{...task.setup,supportIds:undefined,scenarioId:undefined},samples:task.samples,dt:task.dt});
 const evaluate=row=>{
  const key=setupKey+'|'+row.id;
  if(!cache.has(key)){const value=task.evaluate(row);cache.set(key,{gain:value.gain,timeGain:value.timeGain,hpGain:value.hpGain,samples:value.samples});}
  return {...row,...cache.get(key)};
 };
 const inherited=task.rows.filter(row=>row.inherited),scored=[];
 for(let index=0;index<inherited.length;index++){
  if(cancelled())return null;
  scored.push(evaluate(inherited[index]));
  if((index+1)%batchSize===0||index+1===inherited.length){onProgress({rows:[],completed:index+1,total:task.rows.length,stage:'inheritance',setup:task.setup,modelVersion:CM_MODEL_VERSION});await new Promise(resolve=>setTimeout(resolve,0));}
 }
 const top=selectInheritedTop(scored),chosen=new Set(top.map(row=>row.id)),ordered=task.rows.filter(row=>!row.inherited||chosen.has(row.id)),rows=[];
 let completed=inherited.length;
 for(let index=0;index<ordered.length;index++){
  if(cancelled())return null;
  const row=ordered[index];rows.push(evaluate(row));if(!row.inherited)completed++;
  if((index+1)%batchSize===0||index+1===ordered.length){
   onProgress({rows:rows.slice(),completed,total:task.rows.length,stage:'checklist',setup:task.setup,modelVersion:CM_MODEL_VERSION});
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 while(cache.size>3000)cache.delete(cache.keys().next().value);
 return {modelVersion:CM_MODEL_VERSION,setup:task.setup,rows,nativeIds:task.nativeIds,samples:task.samples,dt:task.dt,excluded:task.excluded,
  inheritedTopIds:top.map(row=>row.id),ordering:'skill-icon-family-upper-first',orderingVerified:rows.every(row=>row.orderVerified),fullSpurtPolicy:'umasim-public-unbounded-approximation'};
}
