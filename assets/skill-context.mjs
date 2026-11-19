// Verified prerequisite ownership and active effects have different jobs.
export function prerequisiteIds(graph,id){
 const seen=new Set([id]),result=[],pending=[id];
 while(pending.length){const current=pending.pop();for(const low of graph?.[current]||[])if(!seen.has(low)){seen.add(low);result.push(low);pending.push(low);}}
 return result;
}
export function activeSkillIds(ids,graph){
 const unique=[...new Set(ids)],superseded=new Set(unique.flatMap(id=>prerequisiteIds(graph,id)));
 return unique.filter(id=>!superseded.has(id)).sort();
}
export function withoutSkill(ids,id,reference,graph){
 const lower=new Set(prerequisiteIds(graph,id)),restored=[...new Set(reference.filter(other=>other!==id&&lower.has(other)))];
 return {ids:activeSkillIds([...ids.filter(other=>other!==id),...restored],graph),restoredIds:restored};
}
