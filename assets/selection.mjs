import {INHERITANCE_LIMIT} from './result-policy.mjs';

// Shared by the worker and the immediate checkbox preview.
export function selectionRules(data,records){
 const families=new Map([...records.keys()].map(id=>[id,new Set([id])]));
 for(const r of data.relations.filter(r=>r.kind==='version_family')){
  const a=families.get(r.from_id),b=families.get(r.to_id);if(!a||!b)continue;
  const union=new Set([...a,...b]);for(const id of union)families.set(id,union);
 }
 for(const r of data.evolution_rules){
  if(!records.has(r.evolved_id))continue;
  const base=families.get(r.base_id)||new Set([r.base_id]);
  for(const id of base){families.get(r.evolved_id)?.add(id);families.get(id)?.add(r.evolved_id);}
 }
 const compatible=(a,b)=>{
  if(a===b||families.get(a)?.has(b))return false;
  const sa=records.get(a),sb=records.get(b);
  if(sa?.inherited&&sb?.inherited&&sa.parent_ids.some(id=>sb.parent_ids.includes(id)))return false;
  return !(sa?.choice_groups||[]).some(g=>(sb?.choice_groups||[]).includes(g));
 };
 const normalize=ids=>{
  const result=[];let inherits=0;
  for(const id of new Set(ids))if(records.has(id)&&result.every(other=>compatible(id,other))&&(!records.get(id).inherited||inherits<INHERITANCE_LIMIT)){
   result.push(id);if(records.get(id).inherited)inherits++;
  }
  return result;
 };
 return {compatible,normalize};
}

export function previewToggle(records,rules,selected,id,checked){
 if(!records.has(id))return {selected:[...selected],notice:''};
 const others=[...selected].filter(other=>rules.compatible(id,other));
 if(checked&&records.get(id).inherited&&others.filter(other=>records.get(other).inherited).length>=INHERITANCE_LIMIT)
  return {selected:[...selected],notice:'계승 고유기는 속도·가속 합계 최대 6개까지 선택할 수 있습니다.'};
 return {selected:checked?[...others,id]:[...selected].filter(other=>other!==id),notice:''};
}
