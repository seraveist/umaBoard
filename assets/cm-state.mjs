// Acquisition is deliberately independent from the simulation's selected skills.
import {INHERITED_LIMIT} from './cm-recommendation.mjs';
export const ACQUISITION_OPTIONS=Object.freeze([
 {value:'owned',label:'습득'}, {value:'unavailable',label:'미획득'},
 {value:'0',label:'획득'},...Array.from({length:5},(_,index)=>({value:String(index+1),label:`할인 Lv${index+1}`}))
]);
export const validAcquisition=value=>ACQUISITION_OPTIONS.some(option=>option.value===String(value));
export const acquisitionValue=value=>validAcquisition(value)?String(value):'unavailable';
// IDs remain row-specific even when acquisition changes propagate along verified
// purchase/evolution edges. Display groups and version families are not edges.
export const acquisitionId=row=>row.id;
export function buildAcquisitionHierarchy(data){
 const lower=new Map(),upper=new Map(),evolutionBase=new Map(),alternatives=new Map();
 const link=(high,low)=>{
  if(!high||!low||high===low||!data.skills?.[high]||!data.skills?.[low]||data.skills[high].inherited||data.skills[low].inherited)return;
  if(!lower.has(high))lower.set(high,new Set());lower.get(high).add(low);
  if(!upper.has(low))upper.set(low,new Set());upper.get(low).add(high);
 };
 for(const [id,stage]of Object.entries(data.purchase_stages||{}))if(stage.status==='verified')link(id,stage.prerequisite_id);
 for(const rule of data.evolution_rules||[]){
  if(data.skills?.[rule.evolved_id]?.rarity!=='evolution')continue;
  link(rule.evolved_id,rule.base_id);evolutionBase.set(rule.evolved_id,rule.base_id);
  if(!alternatives.has(rule.base_id))alternatives.set(rule.base_id,new Set());alternatives.get(rule.base_id).add(rule.evolved_id);
 }
 return {lower,upper,evolutionBase,alternatives};
}
export function relatedAcquisitionIds(hierarchy,id,direction='lower'){
 const seen=new Set([id]),result=[],pending=[id],edges=hierarchy?.[direction];
 while(pending.length)for(const next of edges?.get(pending.pop())||[]){
  if(seen.has(next))continue;seen.add(next);result.push(next);pending.push(next);
 }
 return result;
}
export function updateAcquisition(rows,states,id,value,hierarchy){
 if(!rows.some(row=>row.id===id)||!canRecordAcquisition(rows,states,id,value))return states;
 const next={...states},ids=new Set([...rows.map(row=>row.id),...Object.keys(states)]),set=(key,v)=>{if(ids.has(key))next[key]=v;};
 value=acquisitionValue(value);set(id,value);
 if(value==='owned'){
  const chain=[id,...relatedAcquisitionIds(hierarchy,id)];
  // Clear only competing branches, never their common purchased prerequisites.
  for(const chosen of chain){
   const base=hierarchy?.evolutionBase.get(chosen);
   for(const sibling of hierarchy?.alternatives.get(base)||[])if(sibling!==chosen){
    set(sibling,'unavailable');for(const high of relatedAcquisitionIds(hierarchy,sibling,'upper'))set(high,'unavailable');
   }
  }
  for(const low of chain)set(low,'owned');
 }else{
  // A hint is not a purchase: changing a purchased prerequisite to Lv0–5
  // also invalidates purchased uppers, while retaining unrelated hint records.
  for(const high of relatedAcquisitionIds(hierarchy,id,'upper'))if(value==='unavailable'||next[high]==='owned')set(high,'unavailable');
 }
 return next;
}
export function checklistSnapshot(rows,states={},hierarchy){
 let result=Object.fromEntries(rows.map(row=>[row.id,acquisitionValue(states[acquisitionId(row)])]));
 if(hierarchy){
  // Migrate old independent drafts deterministically. The first acquired
  // alternative in table order wins; no hidden/stale ID enters the snapshot.
  for(const row of rows)if(result[row.id]==='owned')result=updateAcquisition(rows,result,row.id,'owned',hierarchy);
 }
 return result;
}
export function checklistCounts(rows,states={}){
 const values=rows.map(row=>acquisitionValue(states[acquisitionId(row)]));
 return {total:rows.length,available:values.filter(v=>v!=='unavailable').length,owned:values.filter(v=>v==='owned').length};
}
export const inheritedCount=(rows,states={})=>rows.filter(row=>row.inherited&&acquisitionValue(states[row.id])!=='unavailable').length;
export function canRecordAcquisition(rows,states,id,value){
 const row=rows.find(row=>row.id===id);
 if(!row)return false;
 return !row.inherited||acquisitionValue(value)==='unavailable'||acquisitionValue(states[id])!=='unavailable'||inheritedCount(rows,states)<INHERITED_LIMIT;
}

// One atomic whole-checklist change, independent of the current search/tab.
// Keep previously secured inherited choices first, then fill unused slots in
// chart order. Hints do not buy either side of an evolution branch.
export function bulkAcquisition(rows,states,value){
 if(!['unavailable','5'].includes(value))throw new Error('지원하지 않는 일괄 설정입니다.');
 const inherits=rows.filter(row=>row.inherited),selected=new Set([
  ...inherits.filter(row=>acquisitionValue(states[row.id])!=='unavailable'),
  ...inherits.filter(row=>acquisitionValue(states[row.id])==='unavailable')
 ].slice(0,INHERITED_LIMIT).map(row=>row.id));
 return Object.fromEntries(rows.map(row=>[row.id,value==='5'&&row.inherited&&!selected.has(row.id)?'unavailable':value]));
}
