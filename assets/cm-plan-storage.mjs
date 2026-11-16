// Recalculate the chart after reviewed route changes; retain recorded inputs
// only for data versions that the publisher proved have the same mechanics.
export function checklistPlanKey(input,dataVersion){
 return JSON.stringify({...input,supportIds:input.supportIds.slice().sort(),dataVersion});
}
export function restoreChecklistPlan(plans,input,manifest){
 const key=checklistPlanKey(input,manifest.checklist_data_sha256||manifest.active_version);
 if(Object.hasOwn(plans,key))return {key,plan:plans[key]};
 for(const version of manifest.checklist_compatible_versions||[]){
  const previous=checklistPlanKey(input,version);
  if(Object.hasOwn(plans,previous))return {key,plan:structuredClone(plans[previous])};
 }
 return {key,plan:null};
}
