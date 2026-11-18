import {activeAcquisitionRoute,requirementsMet} from './acquisition-rules.mjs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds} from './cm-state.mjs';

// This is a disjunction of routes, not a list of forbidden skill pairs. A skill
// can be granted by several cards/events or independently by its own outfit.
export function acquisitionEventGroups(data,setup){
 const groups=[];
 const add=(entry,type,owner)=>{
  for(const event of entry?.events||[])groups.push({...event,key:`${type}:${owner}:${event.id}`,ownerType:type,ownerId:owner,source:entry.source,
   choices:event.choices.map(choice=>({...choice,rewards:choice.rewards.filter(reward=>requirementsMet(data,setup,reward.requirements))}))});
 };
 for(const support of setup.supportIds||[])add(data.support_events?.[support],'support',support);
 add(data.scenario_events?.[setup.scenarioId],'scenario',setup.scenarioId);
 return groups;
}
export function createAcquisitionConstraints(data,setup){
 const groups=acquisitionEventGroups(data,setup),events=new Map(groups.map(group=>[group.key,group])),hierarchy=buildAcquisitionHierarchy(data),memo=new Map(),routeMemo=new Map();
 const pinned=setup.acquisitionChoices??{};
 if(pinned===null||typeof pinned!=='object'||Array.isArray(pinned)||Object.entries(pinned).some(([key,id])=>!events.get(key)?.choices.some(choice=>choice.id===id)))throw new Error('선택한 이벤트 보상을 확인하세요.');
 const eventKinds=new Set(['support_event','scenario_event','scenario_curated']);
 const routesFor=id=>{
  if(routeMemo.has(id))return routeMemo.get(id);
  const routes=(data.acquisition_routes||[]).filter(route=>route.skill_id===id&&activeAcquisitionRoute(data,setup,route));
  const cells=[];let independent=false,unknown=routes.length===0;
  for(const route of routes){
   if(!eventKinds.has(route.kind)){independent=true;continue;}
   const matching=groups.filter(group=>group.ownerType===route.owner_type&&group.ownerId===route.owner_id);
   const options=matching.flatMap(group=>group.choices.filter(choice=>choice.rewards.some(reward=>reward.skill_id===id)).map(choice=>({event:group.key,choice:choice.id})));
   if(!options.length)unknown=true;else cells.push(...options);
  }
  // An unreviewed alternate source cannot prove an impossibility. Keep that
  // gap explicit rather than incorrectly banning an obtainable combination.
  const result={independent,unknown,cells:[...new Map(cells.map(cell=>[`${cell.event}|${cell.choice}`,cell])).values()]};routeMemo.set(id,result);return result;
 };
 const goldIds=ids=>[...new Set(ids.flatMap(id=>[id,...relatedAcquisitionIds(hierarchy,id)]).filter(id=>data.skills?.[id]?.rarity==='gold'))].sort();
 function solve(ids){
  const key=ids.join(',');if(memo.has(key))return memo.get(key);
  const clauses=ids.flatMap(id=>{const routes=routesFor(id);return routes.independent||routes.unknown?[]:[{id,options:routes.cells}];});
  const search=assignment=>{
   let next=null,remaining=null;
   for(const clause of clauses){
    if(clause.options.some(cell=>assignment[cell.event]===cell.choice))continue;
    const options=clause.options.filter(cell=>assignment[cell.event]===undefined);
    if(!options.length)return null;
    if(!remaining||options.length<remaining.length){next=clause;remaining=options;}
   }
   if(!next)return assignment;
   for(const option of remaining){const value=search({...assignment,[option.event]:option.choice});if(value)return value;}
   return null;
  };
  const assignment=search({...pinned}),result={feasible:assignment!==null,assignment};memo.set(key,result);return result;
 }
 function check(selected,{explain=false}={}){
  const requiredGoldIds=goldIds(selected),result=solve(requiredGoldIds),unmodeledGoldIds=requiredGoldIds.filter(id=>routesFor(id).unknown&&!routesFor(id).independent);
  const summary={feasible:result.feasible,requiredGoldIds,unmodeledGoldIds,scope:'reviewed-active-gold-reward-routes',coverage:unmodeledGoldIds.length?'partial':'reviewed-routes-covered',
   choices:result.assignment?Object.entries(result.assignment).sort(([a],[b])=>a.localeCompare(b)).map(([event,choice])=>({event,choice,ownerType:events.get(event).ownerType,ownerId:events.get(event).ownerId})):[]};
  if(!result.feasible&&explain){
   let core=[...requiredGoldIds];for(const id of requiredGoldIds){const smaller=core.filter(other=>other!==id);if(!solve(smaller).feasible)core=smaller;}
   summary.conflict={skillIds:core,eventKeys:[...new Set(core.flatMap(id=>routesFor(id).cells.map(cell=>cell.event)))],names:core.map(id=>data.skills[id].name_jp||id)};
  }
  return summary;
 }
 return {groups,check,allowed:ids=>check(ids).feasible};
}
export function assertAcquisitionFeasible(constraints,ids){
 const result=constraints.check(ids,{explain:true});
 if(!result.feasible){const error=new Error(`획득 기록 충돌: ${result.conflict.names.join(' · ')}은(는) 현재 편성의 이벤트 선택으로 함께 얻을 수 없습니다. 실제 받은 스킬만 기록해 주세요.`);error.code='ACQUISITION_CONFLICT';error.details=result;throw error;}
 return result;
}
