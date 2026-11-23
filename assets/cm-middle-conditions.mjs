// Only unambiguous middle-count gates receive a prepared comparison.
export function middleCountRequirement(skill){
 const invocations=skill?.invocations?.filter(inv=>!inv.linked);
 if(invocations?.length!==1)return 0;
 const thresholds=invocations[0].condition.map(branch=>{
  const gates=branch.dynamic.filter(atom=>atom.field==='activate_count_middle');
  if(!gates.length||gates.some(atom=>atom.operator!=='>='||!Number.isInteger(atom.value)))return 0;
  return Math.max(...gates.map(atom=>atom.value));
 });
 const count=thresholds[0];
 return count>=1&&count<=3&&thresholds.every(n=>n===count)?count:0;
}

// A provider has a natural, middle-only invocation with no live or opponent
// predicate. Its wisdom roll and sampled activation position still apply.
export function isMiddleProvider(skill,distance){
 if(!skill||!['supported','assumed'].includes(skill.status))return false;
 return skill.invocations.some(inv=>!inv.passive&&!inv.linked&&inv.precondition.some(b=>
  !b.dynamic.length&&!b.external?.length&&b.windows.some(([lo,hi])=>lo===0&&hi>=distance))&&
  inv.condition.length>0&&inv.condition.every(b=>!b.external?.length&&!b.dynamic.length&&b.windows.length&&
   b.windows.every(([lo,hi])=>lo>=distance/6-1e-7&&hi<=2*distance/3+1e-7)));
}
