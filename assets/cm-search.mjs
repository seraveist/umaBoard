// Search structure only. Every admitted proposal is still priced, checked and
// simulated as a whole plan by the caller; no independent gains are added.
const key=ids=>ids.join(',');

export function enumerateAffordablePlans(candidateIds,{required,normalize,conflict,legal,price,budget,planLimit=512,nodeLimit=8192}){
 if(!planLimit)return {complete:false,reason:'disabled',plans:[],nodes:0,groups:0};
 // A partition into cliques is safe even when incompatibility is not
 // transitive: a legal active selection takes at most one member per group.
 const groups=[];
 for(const id of [...candidateIds].sort()){
  const group=groups.find(group=>group.every(other=>conflict(id,other)));
  if(group)group.push(id);else groups.push([id]);
 }
 // Avoid even a bounded leaf census when a large Cartesian product clearly
 // exceeds its work allowance. No expensive route checks are needed here.
 let leaves=1;
 for(const group of groups){
  if(leaves>nodeLimit/(group.length+1))return {complete:false,reason:'enumeration-work-limit',plans:[],nodes:0,groups:groups.length};
  leaves*=group.length+1;
 }
 const plans=new Map();let nodes=0,reason=null;
 const visit=(index,selected)=>{
  if(++nodes>nodeLimit){reason='enumeration-work-limit';return false;}
  if(index===groups.length){
   const ids=normalize([...required,...selected]),k=key(ids);
   if(!plans.has(k)&&legal(ids)){
    const cost=price(ids);
    if(cost!==null&&cost<=budget)plans.set(k,{ids,cost});
    if(plans.size>planLimit){reason='affordable-plan-limit';return false;}
   }
   return true;
  }
  // Do not prune partial prices or legality. A later transformation may
  // replace a required effect or change a shared stage's recorded hint.
  if(!visit(index+1,selected))return false;
  for(const id of groups[index])if(!visit(index+1,[...selected,id]))return false;
  return true;
 };
 const complete=visit(0,[]);
 return {complete,reason,plans:complete?[...plans.values()]:[],nodes,groups:groups.length};
}

export function fundingEdits(ids,{required,candidateIds,lower,normalize,price,legal}){
 const original=price(ids),edits=new Map();
 for(const high of ids.filter(id=>!required.includes(id))){
  for(const replacement of [null,...new Set([...required,...candidateIds].filter(id=>lower.get(high)?.has(id)))]){
   const next=normalize([...ids.filter(id=>id!==high),...(replacement?[replacement]:[])]),cost=price(next);
   if(cost===null||cost>=original||!legal(next))continue;
   const k=key(next);edits.set(k,{ids:next,cost,removed:ids.filter(id=>!next.includes(id)),added:next.filter(id=>!ids.includes(id))});
  }
 }
 return [...edits.values()];
}

export function* budgetExchangeProposals(ids,edits,additions,{normalize,extend,price,legal,budget,order,baselineGain}){
 const seen=new Set([key(ids)]),original=price(ids);
 const rankings=[
  [...edits].sort(order),
  [...edits].sort((a,b)=>(baselineGain-a.gain)/(original-a.cost)-(baselineGain-b.gain)/(original-b.cost)||order(a,b)),
  [...edits].sort((a,b)=>a.cost-b.cost||order(a,b))
 ];
 const admit=proposal=>{
  const next=normalize(proposal),cost=price(next),k=key(next);
  if(seen.has(k)||cost===null||cost>budget||!legal(next))return null;
  seen.add(k);return next;
 };
 for(const addition of additions.filter(id=>!ids.includes(id))){
  // Include one-for-one and downgrade-plus-add exchanges regardless of
  // whether their funding edit is itself an improvement.
  for(const edit of edits){const next=admit(extend(edit.ids,addition));if(next)yield next;}
  // Compose funding across families until the purchase becomes affordable.
  // Loss/refund only orders proposals; the combined result is never inferred.
  for(const ranking of rankings){
   let funded=ids;
   for(const edit of ranking){
    if(!edit.removed.every(id=>funded.includes(id)))continue;
    const next=normalize([...funded.filter(id=>!edit.removed.includes(id)),...edit.added]),cost=price(next);
    if(cost===null||cost>=price(funded)||!legal(next))continue;
    funded=next;const proposal=admit(extend(funded,addition));
    if(proposal){yield proposal;break;}
   }
  }
 }
}
