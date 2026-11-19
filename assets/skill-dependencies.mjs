// Derive complementary purchase seeds from executable predicates, never IDs.
// Seeds only admit combinations; the shared simulator decides whether and when
// the prerequisite actually succeeds (including failed recovery activations).
const minimum=atom=>atom.operator==='>'?atom.value+1:['>=','=='].includes(atom.operator)?atom.value:0;
function contributes(skill,field,distance){
 if(field==='succession_skill_count')return !!skill.skill.inherited;
 if(field==='is_activate_any_skill')return skill.invocations.length>0;
 if(field==='is_activate_heal_skill')return skill.invocations.some(inv=>inv.effects.some(e=>e.kind==='heal'&&e.value>0));
 const invocations=skill.invocations.filter(inv=>!inv.linked);
 if(field==='activate_count_heal')return invocations.some(inv=>inv.effects.some(e=>e.kind==='heal'&&e.value>0));
 if(field==='activate_count_param_skill')return invocations.some(inv=>inv.effects.some(e=>e.kind.startsWith('passive_')));
 const ranges={activate_count_start:[0,distance/6],activate_count_middle:[distance/6,2*distance/3],activate_count_end_after:[2*distance/3,distance],activate_count_later_half:[distance/2,distance]};
 if(field==='activate_count_all')return invocations.length>0;
 const range=ranges[field];
 return !!range&&invocations.some(inv=>inv.condition.some(branch=>branch.windows.some(([lo,hi])=>lo<range[1]&&hi>range[0])));
}
export function dependencyPacks(compiled,candidates,required,purchase,distance,{limit=160}={}){
 const candidateIds=new Set(candidates.map(row=>row.id)),packs=new Map();
 const add=ids=>{ids=[...new Set(ids)].sort();if(ids.length)packs.set(ids.join(','),ids);};
 for(const dependent of [...required,...candidateIds]){
  const skill=compiled.get(dependent);if(!skill)continue;
  const atoms=skill.invocations.flatMap(inv=>[...inv.condition,...inv.precondition].flatMap(branch=>branch.dynamic));
  for(const atom of atoms){
   if(['is_exist_skill_id','is_used_skill_id','is_used_skill_id_with_detail_one'].includes(atom.field)&&atom.operator==='=='){
    const id=String(atom.value);if(candidateIds.has(id))add([dependent,id]);continue;
   }
   const previousFrame=atom.field==='is_activate_heal_skill'||atom.field==='is_activate_any_skill';
   if(!previousFrame&&!atom.field.startsWith('activate_count_')&&atom.field!=='succession_skill_count')continue;
   const target=minimum(atom);if(!Number.isInteger(target)||target<=0)continue;
   const existing=required.filter(id=>id!==dependent&&contributes(compiled.get(id),atom.field,distance));
   const helpers=[...candidateIds].filter(id=>id!==dependent&&contributes(compiled.get(id),atom.field,distance)).sort((a,b)=>purchase.selection([a]).used-purchase.selection([b]).used||a.localeCompare(b));
   // A required skill may trigger outside the dependent window. Still seed alternatives.
   const needed=previousFrame?1:Math.max(0,target-existing.length);
   if(!needed||helpers.length<needed)continue;
   const selected=helpers.slice(0,12),before=packs.size;
   const choose=(at,ids,count)=>{
    if(packs.size-before>=limit)return;
    if(ids.length===count){add([dependent,...ids]);return;}
    for(let i=at;i<=selected.length-(count-ids.length);i++)choose(i+1,[...ids,selected[i]],count);
   };
   if(needed<=3)choose(0,[],needed);
   // Additional contributors can insure an endogenous count against a miss.
   for(const extra of [0,1,2])for(const ordering of [helpers,[...helpers].reverse()]){
    if(ordering.length>=needed+extra)add([dependent,...ordering.slice(0,needed+extra)]);
   }
  }
 }
 return [...packs.values()];
}
