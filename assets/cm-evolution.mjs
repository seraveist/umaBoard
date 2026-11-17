import {checklistSnapshot,buildAcquisitionHierarchy} from './cm-state.mjs';

export const matchesEvolution=(rule,setup)=>!rule.owner_type||rule.owner_type==='outfit'&&rule.owner_id===setup.outfitId||rule.owner_type==='scenario'&&rule.owner_id===setup.scenarioId;
export function evolutionOptions(data,chart){
 const rows=new Map([...(chart.evolutionOptions||[]),...chart.rows.filter(row=>row.rarity==='evolution')].map(row=>[row.id,row]));
 return [...rows.values()].filter(row=>data.evolution_rules.some(rule=>rule.evolved_id===row.id&&matchesEvolution(rule,chart.setup)));
}
export function finalAcquisitionSnapshot(data,chart,states){
 const options=evolutionOptions(data,chart),history=options.filter(row=>states[row.id]==='owned');
 // Preserve actual purchases from older drafts, discard obsolete evolution hints.
 return checklistSnapshot([...chart.rows.filter(row=>row.rarity!=='evolution'),...history],states,buildAcquisitionHierarchy(data));
}
export function evolutionGroups(data,setup,rows){
 const groups={outfit:[],scenario:[]};
 for(const row of rows){
  const rule=data.evolution_rules.find(r=>r.evolved_id===row.id&&matchesEvolution(r,setup));
  if(rule)groups[rule.owner_type==='scenario'?'scenario':'outfit'].push({...row,baseId:rule.base_id,baseName:data.skills[rule.base_id].name_jp,additionalSp:0});
 }
 return groups;
}
