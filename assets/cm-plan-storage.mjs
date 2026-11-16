// Recalculate the chart after reviewed route changes; retain recorded inputs
// only for data versions that the publisher proved have the same mechanics.
export function checklistPlanKey(input,dataVersion){
 return JSON.stringify({...input,supportIds:input.supportIds.slice().sort(),dataVersion});
}
export function restoreChecklistPlan(plans,input,manifest){
 const key=checklistPlanKey(input,manifest.checklist_data_sha256||manifest.active_version);
 if(Object.hasOwn(plans,key))return {key,plan:plans[key]};
 for(const version of new Set([...(manifest.checklist_compatible_versions||[]),...(manifest.checklist_record_versions||[])])){
  const previous=checklistPlanKey(input,version);
  if(Object.hasOwn(plans,previous))return {key,plan:structuredClone(plans[previous])};
 }
 return {key,plan:null};
}
export function trimChecklistPlans(plans,limit=12){
 const identity=key=>{try{const {dataVersion,...input}=JSON.parse(key);return JSON.stringify(Object.keys(input).sort().map(k=>[k,input[k]]));}catch{return key;}};
 const entries=Object.entries(plans).sort((a,b)=>(b[1].savedAt||'').localeCompare(a[1].savedAt||'')),keep=new Set();
 for(const [key]of entries){const group=identity(key);if(keep.has(group))continue;if(keep.size<limit)keep.add(group);}
 return Object.fromEntries(entries.filter(([key])=>keep.has(identity(key))));
}
