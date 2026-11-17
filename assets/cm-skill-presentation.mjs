import {activeAcquisitionRoute} from './acquisition-rules.mjs';
import {el} from './cm-dom.mjs';

export const rarityBadge=row=>row.inherited?null:row.rarity==='gold'?{label:'레어',kind:'rare'}:row.rarity==='evolution'?{label:'진화',kind:'evolution'}:null;
export function skillNameLine(row){
 const line=el('div','skill-name-line'),name=el('span','skill-name',row.name);name.lang='ja';line.append(name);
 const badge=rarityBadge(row);if(badge)line.append(el('span',`skill-badge ${badge.kind}`,badge.label));return line;
}

// These are possible routes for this setup, not a claim about the event the
// player actually saw. Missing direct evidence is visibly marked as inferred.
export function createSkillSourceResolver(data,setup){
 const direct=new Map(),upper=new Map(),memo=new Map();
 const add=(id,route)=>{if(!direct.has(id))direct.set(id,[]);direct.get(id).push(route);};
 for(const route of data.acquisition_routes||[])if(activeAcquisitionRoute(data,setup,route))add(route.skill_id,route);
 for(const rule of data.evolution_rules||[])if(direct.has(rule.base_id)&&((rule.owner_type==='outfit'&&rule.owner_id===setup.outfitId)||(rule.owner_type==='scenario'&&rule.owner_id===setup.scenarioId)))add(rule.evolved_id,{...rule,kind:'evolution'});
 for(const [id,stage]of Object.entries(data.purchase_stages||{}))if(stage.status==='verified'&&stage.prerequisite_id){if(!upper.has(stage.prerequisite_id))upper.set(stage.prerequisite_id,[]);upper.get(stage.prerequisite_id).push(id);}
 const label=(route,skill)=>route.owner_type==='scenario'?'시나리오 스킬':route.owner_type==='support'?(route.kind==='support_hint'?'서포트 힌트':'서포트 이벤트'):route.owner_type==='outfit'?(route.kind==='outfit_event'?'육성마 이벤트':skill.rarity==='white'?'육성마 스킬':'각성 스킬'):null;
 const resolve=(id,seen=new Set())=>{
  if(memo.has(id))return memo.get(id);if(seen.has(id))return null;
  const skill=data.skills[id];if(!skill)return null;
  if(skill.inherited)return {labels:['계승 스킬'],inferred:false};
  const labels=[...new Set((direct.get(id)||[]).map(route=>label(route,skill)).filter(Boolean))];
  if(labels.length){const result={labels,inferred:false};memo.set(id,result);return result;}
  seen=new Set([...seen,id]);
  const stage=data.purchase_stages?.[id],related=[...(upper.get(id)||[]),...(stage?.status==='verified'&&stage.prerequisite_id?[stage.prerequisite_id]:[])];
  const inferred=[...new Set(related.flatMap(other=>resolve(other,seen)?.labels||[]))];
  if(inferred.length)return {labels:inferred,inferred:true};
  return null;
 };
 return row=>{
  const source=resolve(row.id);
  if(source)return source.labels.slice(0,3).join(' · ')+(source.labels.length>3?` 외 ${source.labels.length-3}개`:'')+(source.inferred?' (추정)':'');
  return data.skills[row.id]?.rarity==='white'&&data.internal_acceleration_comparison_cost?.[row.id]>0?'인자 후보 (추정)':'획득 경로 미확인';
 };
}
