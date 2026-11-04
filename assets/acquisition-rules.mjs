// Only reviewed requirement kinds can turn conditional routes into candidates.
export const characterIdentity=name=>(name||'').replace(/\s+\((SSR|SR|R)\)$/,'');
export function requirementsMet(data,setup,requirements){
 if(!requirements||Object.keys(requirements).length===0)return true;
 if(Object.keys(requirements).length!==1||!requirements.character_link)return false;
 const link=requirements.character_link;
 if(Object.keys(link).length!==2||!link.name_jp||typeof link.present!=='boolean')return false;
 const names=[data.outfits[setup.outfitId]?.name_jp,...(setup.supportIds||[]).map(id=>characterIdentity(data.supports[id]?.name_jp))];
 return names.includes(link.name_jp)===link.present;
}
export function activeAcquisitionRoute(data,setup,route){
 return requirementsMet(data,setup,route.requirements)&&(
  route.owner_type==='outfit'&&route.owner_id===setup.outfitId||
  route.owner_type==='support'&&(setup.supportIds||[]).includes(route.owner_id)||
  route.owner_type==='scenario'&&route.owner_id===setup.scenarioId);
}
export function scenarioEventGroups(data,setup){
 const entry=data.scenario_events?.[setup.scenarioId];
 return (entry?.events||[]).map(event=>({...event,scenario_id:setup.scenarioId,verified:true,source:entry.source,
  choices:event.choices.map(choice=>({...choice,rewards:choice.rewards.filter(r=>requirementsMet(data,setup,r.requirements))}))}));
}
export function scenarioSelectionAllowed(data,ids,scenarioId){
 const selected=new Set(ids);
 return (data.scenario_exclusive_groups||[]).filter(g=>scenarioId===undefined||g.scenario_id===scenarioId)
  .every(g=>g.skill_ids.filter(id=>selected.has(id)).length<=(g.max_count??1));
}
