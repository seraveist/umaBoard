import {INHERITANCE_LIMIT} from './result-policy.mjs';

// Shared by the worker and the immediate checkbox preview.
export function selectionRules(data,records){
 const ids=new Set([...Object.keys(data.skills||{}),...records.keys(),...data.evolution_rules.flatMap(r=>[r.base_id,r.evolved_id])]);
 const families=new Map([...ids].map(id=>[id,new Set([id])]));
 for(const r of data.relations.filter(r=>r.kind==='version_family')){
  const a=families.get(r.from_id),b=families.get(r.to_id);if(!a||!b)continue;
  const union=new Set([...a,...b]);for(const id of union)families.set(id,union);
 }
 for(const r of data.evolution_rules){
  const union=new Set([...(families.get(r.base_id)||[]),...(families.get(r.evolved_id)||[])]);
  for(const id of union)families.set(id,union);
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

export function previewToggle(records,rules,selected,id,checked,locked=new Set()){
 if(!records.has(id))return {selected:[...selected],notice:''};
 if(locked.has(id))return {selected:[...selected],notice:checked?'':'고정한 스킬입니다. 고정을 해제한 뒤 선택을 변경하세요.'};
 if(checked&&[...locked].some(other=>!rules.compatible(id,other)))
  return {selected:[...selected],notice:'고정 스킬과 함께 배울 수 없는 스킬입니다.'};
 const others=[...selected].filter(other=>rules.compatible(id,other));
 if(checked&&records.get(id).inherited&&others.filter(other=>records.get(other).inherited).length>=INHERITANCE_LIMIT)
  return {selected:[...selected],notice:'계승 고유기는 속도·가속 합계 최대 6개까지 선택할 수 있습니다.'};
 return {selected:checked?[...others,id]:[...selected].filter(other=>other!==id),notice:''};
}
