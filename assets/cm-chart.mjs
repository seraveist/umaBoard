import {buildCandidates,possibleInContext} from './candidates.mjs';
import {compileSkill,fixedContext,sampleBranches} from './activation.mjs';
import {validateSetup,uniqueLevel} from './physics.mjs';
import {characterIdentity,activeAcquisitionRoute} from './acquisition-rules.mjs';
import {withCourseMetadata} from './cm-course-metadata.mjs';
import {INHERITED_UPGRADES,styleRecommendation,selectInheritedTop} from './cm-recommendation.mjs';
import {skillIconId} from './cm-icons.mjs';
import {SPURT_POLICY} from './spurt-planning.mjs';
import {RaceEvaluator} from './race-evaluation.mjs';
import {sampleUnit,samplingPolicy,normalizeRaceContext,scheduleContextBranches} from './race-sampling.mjs';
import {selfEffectSkill} from './cm-effect-policy.mjs';
import {ENCOUNTER_POLICY,contextDomains} from './race-scenarios.mjs';
import {inheritanceOrigins} from './skill-transforms.mjs';
import {buildAcquisitionHierarchy} from './cm-state.mjs';

export const CM_MODEL_VERSION='cm-first-chart-v7';
export const CM_SAMPLES=144;
export const CM_DT=.01;
const native=skill=>['unique','unique_low_star','unique_upgraded'].includes(skill?.rarity);
const supported=skill=>['supported','assumed'].includes(skill?.status);
const ASSUME=new Set(['temptation_count','is_temptation','running_style_count_same','running_style_count_same_rate','running_style_equal_popularity_one','same_skill_horse_count','behind_near_lane_time_set1','change_order_up_end_after','change_order_up_middle','change_order_up_finalcorner_after','is_other_character_activate_advantage_skill','is_popularity_top_character_activate_advantage_skill','is_activate_any_skill','is_activate_heal_skill','temptation_opponent_count_behind','visiblehorse']);
export function radicalInverse(n,base){let x=0,f=1/base;for(;n>0;n=Math.floor(n/base),f/=base)x+=n%base*f;return x;}

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
  raceContext:normalizeRaceContext(input.raceContext),samplingSeed:input.samplingSeed??0,spurtPolicy:SPURT_POLICY,encounterPolicy:ENCOUNTER_POLICY,externalDomains:contextDomains(data),mood:2,stats:{...profile.stats},aptitudes:{distance:'A',surface:'A',style:'A'},chartPolicy:CM_MODEL_VERSION};
 validateSetup(setup);
 if(![1,2,3,4].includes(setup.weather)||![1,2,3,4].includes(setup.season)||![1,2,3].includes(setup.time))throw new Error('CM의 날씨·계절·시간을 확인하세요.');
 return setup;
}

export function compileChartSkill(skill,setup){
 skill=selfEffectSkill(skill);
 const omitted=new Set();
 // Only unobserved opponent/temptation state is conditional. Endogenous
 // counters, ownership, HP, start and lottery predicates stay executable.
 const assume=dnf=>dnf===null?null:dnf.map(group=>group.filter(a=>{if(ASSUME.has(a.field)&&!Object.hasOwn(setup.raceContext?.conditions||{},a.field)&&!Object.hasOwn(setup.externalDomains||{},a.field)){omitted.add(a.field);return false;}return true;}));
 const policies=new Map();
 const adjusted={...skill,invocations:skill.invocations.map(inv=>{
  const atoms=(inv.condition||[]).flat();
  const policy=atoms.some(a=>a.field==='all_corner_random')?'corners':atoms.some(a=>a.field==='straight_random')?'straight':null;
  // Corner/straight areas need their own draw; other random repeats use one
  // cached ten-metre window. Self predicates remain executable in that window.
  if(policy||inv.cooldown_raw>0)policies.set(inv.index,{policy,cooldown:(inv.cooldown_raw||0)/10000*setup.course.distance/1000});
  return {...inv,condition:assume(inv.condition),precondition:assume(inv.precondition),cooldown_raw:policies.has(inv.index)?null:inv.cooldown_raw};
 })};
 const compiled=compileSkill(adjusted,setup);
 compiled.probabilistic=true;
 compiled.assumed=[...new Set([...compiled.assumed,...omitted])];
 compiled.calculationNotes=[...skill.calculationNotes,...(compiled.assumed.length?[setup.encounterPolicy?'상대 조건은 공통 전개별 비교':'미입력 상대·걸림 조건 충족 가정']:[])];
 compiled.stochastic=compiled.activationProbability<1||compiled.invocations.some(i=>i.effects.some(e=>[8,9].includes(e.scale)||['invoke_rare','invoke_unique'].includes(e.kind))||[...i.condition,...i.precondition].some(b=>b.dynamic.some(a=>['run_at_full_speed_random','random_lot','random_lot_shared','post_number','popularity','is_goodstart','is_badstart'].includes(a.field))));
 if(adjusted.invocations.length){
  const first=adjusted.invocations[0],forced=compileSkill({...adjusted,invocations:[{...first,condition:[],precondition:[],cooldown_raw:null}]},setup);
  if(forced.status!=='unsupported')compiled.forcedInvocation={...forced.invocations[0],cooldownSeconds:policies.get(first.index)?.cooldown||0};
 }
 if(compiled.status==='supported'&&compiled.calculationNotes.length)compiled.status='assumed';
 for(const inv of compiled.invocations){
  const p=policies.get(inv.index);if(p){inv.chartRandomPolicy=p.policy;inv.cooldownSeconds=p.cooldown;}
 }
 return compiled;
}

export function buildChartCandidates(data,setup){
 const candidates=buildCandidates(data,{...setup,purchase:true,preserveEvolutionBases:true,context:fixedContext(setup)});
 const possessionCandidates=buildCandidates(data,{...setup,purchase:true,preserveEvolutionBases:true,context:{}}).inheritance;
 const records=new Map([...candidates.learned,...candidates.factorCandidates,...candidates.inheritance,...possessionCandidates].map(s=>[s.id,s]));
 const add=(id,route,allowInactive=false)=>{
  const raw=data.skills[id];if(!raw?.jp_available||!allowInactive&&!possibleInContext(raw,fixedContext(setup)))return;
  if(!records.has(id))records.set(id,{...raw,routes:[],choice_groups:[]});
  const s=records.get(id),routes=s.routes||[];if(route&&!routes.some(r=>JSON.stringify(r)===JSON.stringify(route)))records.set(id,{...s,routes:[...routes,route]});
 };
 // Actual stats may exceed the first chart's base scenario caps. Retain
 // evolution metadata behind stat gates; still apply fixed course/style gates.
 const evolutionContext={...fixedContext(setup)};
 for(const key of ['base_speed','base_stamina','base_power','base_guts','base_wiz'])delete evolutionContext[key];
 for(const rule of data.evolution_rules){
  const matches=rule.owner_type==='outfit'&&rule.owner_id===setup.outfitId||rule.owner_type==='scenario'&&rule.owner_id===setup.scenarioId;
  const raw=data.skills[rule.evolved_id];
  if(!matches||!raw?.jp_available||!possibleInContext(raw,evolutionContext))continue;
  const routes=data.acquisition_routes.filter(route=>route.skill_id===rule.base_id&&activeAcquisitionRoute(data,setup,route));
  if(!routes.length&&!records.has(rule.base_id))continue;
  for(const route of routes)add(rule.base_id,route,true);
  add(rule.evolved_id,{kind:'evolution',owner_type:rule.owner_type,owner_id:rule.owner_id,base_id:rule.base_id},true);
 }
 // A comparison/checklist retains the gold AND every evolution alternative.
 // Purchase mutual exclusion belongs to the later training-result optimizer.
 for(const rule of data.evolution_rules)if(records.has(rule.evolved_id))add(rule.base_id,{kind:'evolution_base',owner_type:rule.owner_type,owner_id:rule.owner_id},true);
 // Keep both the paid original and its conditional strengthened effect. Only
 // the default Top10 deduplicates origins; actual acquisition can record either.
 for(const [base,strong] of Object.entries(INHERITED_UPGRADES)){
  const original=records.get(base),upgraded=records.get(strong);
  if(original&&!upgraded){add(strong,original.routes?.[0]);if(records.has(strong))records.set(strong,{...records.get(strong),inheritance_outfit_ids:original.inheritance_outfit_ids});}
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
  const iconId=skillIconId(data.skills?.[row.id]||row,display),group=groups.get(groupId);
  group.rows.push({...row,groupId,iconId,orderVerified:!!meta[row.id]});
  if(m)group.order=Math.min(group.order,m.order);
  if(iconId)group.icon=Math.min(group.icon,Number(iconId.slice(0,-1)));
 }
 const byGroup=[...groups.values()].sort((a,b)=>a.icon-b.icon||a.order-b.order||a.id.localeCompare(b.id));
 const tier=row=>row.inherited?0:row.rarity==='evolution'?2:row.rarity==='gold'?1:0;
 return byGroup.flatMap(group=>{
  const tiers=[...new Set(group.rows.map(tier))].sort((a,b)=>b-a);
  return group.rows.sort((a,b)=>tier(b)-tier(a)||(meta[a.id]?.order??Infinity)-(meta[b.id]?.order??Infinity)||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id))
   .map(row=>({...row,indentLevel:row.inherited?0:tiers.indexOf(tier(row))}));
 });
}

export function branchSampler(setup,nativeIds,sample){
 const value=(id,index,dimension)=>sampleUnit(sample,`${id}|${index}|${dimension}`,setup.samplingSeed??0);
 const sampler=(branches,id,inv,pre)=>{
  const decorate=(branch,index)=>({...branch,lotQ:value(id,`lot:${inv.index}:${pre?'pre':'condition'}`,index),sharedLotQ:value(id,'lot-shared',0),fullSpurtQ:value(id,'full-spurt',0),choiceQ:value(id,'effect-value',inv.index)});
  if(pre)return scheduleContextBranches(branches.map((branch,index)=>decorate(sampleBranches([branch],value(id,branch.randomKey||`pre:${inv.index}`,branch.randomKey?0:index),!branch.random)[0],index)),setup);
  if(inv.chartRandomPolicy){
   const areas=inv.chartRandomPolicy==='corners'?setup.course.corners.map(c=>[c.start,c.start+c.length]):setup.course.straights.map(s=>[s.start,s.end]);
   const count=inv.chartRandomPolicy==='corners'?2:1,windows=[];
   for(let k=0;k<count;k++){
    const areaIndex=Math.min(areas.length-1,Math.floor(value(id,inv.chartRandomPolicy,k*2)*areas.length));
    const selected=inv.chartRandomPolicy==='corners'?areas.splice(areaIndex,1)[0]:areas[areaIndex];
    if(!selected)continue;
    const start=inv.chartRandomPolicy==='corners'
     ?selected[0]+value(id,inv.chartRandomPolicy,k*2+1)*Math.max(0,selected[1]-selected[0]-10)
     :Math.min(selected[0]+value(id,inv.chartRandomPolicy,k*2+1)*(selected[1]-selected[0]),selected[1]-2);
    windows.push([start,Math.min(selected[1],start+10)]);
   }
   return scheduleContextBranches(branches.flatMap(branch=>{
    const clipped=windows.flatMap(([lo,hi])=>branch.windows.map(([a,b])=>[Math.max(lo,a),Math.min(hi,b)]).filter(([a,b])=>a<b)).sort((a,b)=>a[0]-b[0]);
    return clipped.length?[decorate({...branch,random:false,windows:clipped,at:clipped[0][0]},0)]:[];
   }),setup);
  }
  // The source caches each random condition per skill, across its invocation
  // alternatives. A weaker fallback must not roll ahead of its stronger form.
  return scheduleContextBranches(branches.map((branch,index)=>{
   const sampled=sampleBranches([branch],value(id,branch.randomKey||inv.index,branch.randomKey?0:index))[0];
   if(inv.cooldownSeconds&&branch.randomKey){
    const area=branch.windows.find(([lo,hi])=>sampled.at>=lo&&sampled.at<hi);
    if(area){sampled.at=Math.max(area[0],Math.min(sampled.at,area[1]-2));sampled.windows=[[sampled.at,Math.min(area[1],sampled.at+10)]];}
   }
   return decorate(sampled,index);
  }),setup);
 };
 sampler.unit=(id,channel)=>value(id,channel,0);
 sampler.policy=samplingPolicy(setup);
 return sampler;
}

export function prepareChart(data,profiles,display,input,{samples=CM_SAMPLES,dt=CM_DT}={}){
 if(!Number.isInteger(samples)||samples<1||samples>512||!(dt>0&&dt<=.1))throw new Error('계산 표본 설정이 올바르지 않습니다.');
 const setup=createChartSetup(data,profiles,input),records=buildChartCandidates(data,setup),compiled=new Map([...records].map(([id,s])=>[id,compileChartSkill(s,setup)]));
 const nativeRecords=[...records.values()].filter(native),nativeSkills=nativeRecords.map(s=>compiled.get(s.id));
 if(nativeSkills.some(s=>s.status==='unsupported'))throw new Error('이 육성마의 고유기는 아직 계산을 지원하지 않습니다. 다른 육성마를 선택하세요.');
 const nativeIds=nativeRecords.map(s=>s.id);
 const hierarchy=buildAcquisitionHierarchy(data);setup.possessionGraph=Object.fromEntries([...hierarchy.lower].map(([id,low])=>[id,[...low]]));setup.inheritanceOrigins=inheritanceOrigins(data);
 const evolutionBases=new Set([...records.values()].filter(s=>s.rarity==='evolution').flatMap(s=>data.evolution_rules.filter(r=>r.evolved_id===s.id).map(r=>r.base_id)));
 const rows=sortChartRows([...records.values()].filter(s=>!native(s)&&(supported(compiled.get(s.id))||s.inherited||s.rarity==='evolution'||evolutionBases.has(s.id))).map(s=>({id:s.id,name:s.name_jp,description:s.description_jp,
  rarity:s.rarity,inherited:s.inherited,inheritanceOriginId:setup.inheritanceOrigins[s.id]||null,categories:s.categories,routes:s.routes||[],providers:s.inheritance_outfit_ids||[],calculationNotes:compiled.get(s.id).calculationNotes,recommendation:styleRecommendation(s,compiled.get(s.id),setup),
  calculationState:compiled.get(s.id).status,assumptions:compiled.get(s.id).assumed,activationProbability:compiled.get(s.id).activationProbability,
  evolutionBaseId:data.evolution_rules.find(r=>r.evolved_id===s.id&&((r.owner_type==='outfit'&&r.owner_id===setup.outfitId)||(r.owner_type==='scenario'&&r.owner_id===setup.scenarioId)))?.base_id||null})),data,display);
 const evaluator=new RaceEvaluator(setup,compiled,nativeIds,nativeIds,branchSampler);
 return {setup,rows,nativeIds,modelVersion:CM_MODEL_VERSION,samples,dt,
  excluded:[...compiled.values()].filter(s=>!native(s.skill)&&!supported(s)).map(s=>({id:s.id,status:s.status,reasons:s.reasons})),
  evaluate(row){
   if(compiled.get(row.id).status==='unsupported')return {...row,gain:null,timeGain:null,hpGain:null,samples:0};
   // Even fixed triggers can change the HP-based spurt decision. Use the same
   // race samples for every row instead of presuming a deterministic outcome.
   const count=samples;
   const stats=evaluator.evaluate([...nativeIds,row.id],count,dt);
   return {...row,gain:stats.gain,robustGain:stats.robustGain,scenarios:stats.scenarios,scenarioCoverage:stats.scenarioCoverage,usefulAccelerationRate:stats.usefulAccelerationRates[row.id],timeGain:stats.timeGain,hpGain:stats.hpGain,samples:count,sampling:stats.sampling,activationRate:stats.activationRates[row.id]};
  }};
}

export async function generateChart(data,profiles,display,input,{onProgress=()=>{},cancelled=()=>false,batchSize=30,cache=new Map(),...options}={}){
 const task=prepareChart(data,profiles,display,input,options),setupKey=JSON.stringify({model:CM_MODEL_VERSION,setup:{...task.setup,supportIds:undefined,scenarioId:undefined},samples:task.samples,dt:task.dt});
 const evaluate=row=>{
  const key=setupKey+'|'+row.id;
  if(!cache.has(key)){const value=task.evaluate(row);cache.set(key,{gain:value.gain,robustGain:value.robustGain,scenarios:value.scenarios,scenarioCoverage:value.scenarioCoverage,usefulAccelerationRate:value.usefulAccelerationRate,timeGain:value.timeGain,hpGain:value.hpGain,samples:value.samples,sampling:value.sampling,activationRate:value.activationRate});}
  return {...row,...cache.get(key)};
 };
 const inherited=task.rows.filter(row=>row.inherited),scored=[];
 for(let index=0;index<inherited.length;index++){
  if(cancelled())return null;
  scored.push(evaluate(inherited[index]));
  if((index+1)%batchSize===0||index+1===inherited.length){onProgress({rows:[],completed:index+1,total:task.rows.length,stage:'inheritance',setup:task.setup,modelVersion:CM_MODEL_VERSION});await new Promise(resolve=>setTimeout(resolve,0));}
 }
 const top=selectInheritedTop(scored.filter(row=>row.categories.some(c=>['speed','acceleration'].includes(c)))),chosen=new Set(top.map(row=>row.id)),ordered=sortChartRows(task.rows.filter(row=>row.rarity!=='evolution'&&(!row.inherited||chosen.has(row.id))),data,display),rows=[];
 // Hidden options keep their metadata and parent links, never a separate hint.
 const evolutionOptions=task.rows.filter(row=>row.rarity==='evolution');
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
 return {modelVersion:CM_MODEL_VERSION,setup:task.setup,rows,evolutionOptions,inheritanceOptions:scored,nativeIds:task.nativeIds,samples:task.samples,dt:task.dt,excluded:task.excluded,
  samplingPolicy:samplingPolicy(task.setup),inheritedTopIds:top.map(row=>row.id),ordering:'skill-icon-family-upper-first',orderingVerified:rows.every(row=>row.orderVerified),fullSpurtPolicy:'umasim-public-unbounded-approximation'};
}
