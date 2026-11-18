import {compareRacePlans} from './race-objective.mjs';
const key=ids=>[...ids].sort().join(',');
const feasible=row=>row.feasible??row.fullSpeedFeasible??true;

// This is an equivalence key for the objective's priorities BEFORE mean gain.
// No tolerance is applied to HP, HP shortfall or a failed tail guard.
export function priorityKey(row){
 const ok=feasible(row),risk=row.performance?.risk;
 return JSON.stringify([ok,ok?null:row.hpSuccessRate??0,ok?null:row.hpShortfall??0,risk?.withinLimit??true,risk?.withinLimit===false?risk.tailDelay:null]);
}
export function comparePlanPriorities(a,b){
 const mask=row=>({...row,ids:[],cost:0,gain:0,performance:{...row.performance,tailFinishTime:0}});
 return compareRacePlans(mask(a),mask(b));
}

// Anchored selection, never an epsilon comparator: pairwise epsilon ties are
// nontransitive and repeated local losses can exceed the declared tolerance.
export function selectNearBest(rows,tolerance){
 const ranked=rows.filter(Boolean).sort(compareRacePlans),anchor=ranked[0];
 if(!anchor)return null;
 if(!tolerance)return {anchor,selected:anchor,knownMeanLoss:0,eligible:1};
 const eligible=ranked.filter(row=>priorityKey(row)===priorityKey(anchor)&&row.gain>=anchor.gain-tolerance-1e-12);
 const selected=eligible.sort((a,b)=>a.cost-b.cost||compareRacePlans(a,b))[0];
 return {anchor,selected,knownMeanLoss:anchor.gain-selected.gain,eligible:eligible.length};
}

// A cheaper epsilon choice can unlock purchases that did not fit beside the
// exact-mean incumbent. Reopen that complete plan before returning it. Every
// round still uses the same global set of fully measured scores as its anchor.
export async function recoverNearBest({rows,tolerance,refine,canRefine=()=>true,maxPasses=12}){
 const visited=new Set();let selection=selectNearBest(rows(),tolerance),passes=0,reason='no-cheaper-alternative';
 while(tolerance&&selection.selected.cost<selection.anchor.cost){
  const k=key(selection.selected.ids);
  if(visited.has(k)){reason='visited-selection';break;}
  if(passes>=maxPasses){reason='pass-limit';break;}
  if(!canRefine()){reason='precision-work-limit';break;}
  visited.add(k);
  if(await refine(selection.selected)===null)return null;
  passes++;const next=selectNearBest(rows(),tolerance);
  if(key(next.selected.ids)===k){selection=next;reason='stable-selection';break;}
  selection=next;reason='no-cheaper-alternative';
 }
 return {...selection,recovery:{passes,reason}};
}

// Keep a bounded mean ranking and each scenario's strongest alternative.
// Conditional value in one context must not disappear behind a mean tie.
export function selectProfileLeaders(rows,limit,tolerance){
 const ranked=rows.filter(Boolean).sort(compareRacePlans),chosen=new Map(ranked.slice(0,limit).map(row=>[key(row.ids),row])),leaders=new Map();
 for(const row of ranked)for(const scenario of row.scenarios||[]){
  const old=leaders.get(scenario.id);
  if(!old||scenario.gain>old.gain||scenario.gain===old.gain&&compareRacePlans(row,old.row)<0)leaders.set(scenario.id,{row,gain:scenario.gain});
 }
 for(const {row}of leaders.values())chosen.set(key(row.ids),row);
 const near=selectNearBest(ranked,tolerance);if(near)chosen.set(key(near.selected.ids),near.selected);
 return [...chosen.values()].sort(compareRacePlans);
}

export function createPlanSignature(compiled,lower,distance,{scope='identity'}={}){
 const explicit=new Set(),fields=new Set();
 for(const skill of compiled.values())for(const inv of skill.invocations)for(const branch of [...inv.condition,...inv.precondition])for(const atom of branch.dynamic){
  if(['is_exist_skill_id','is_used_skill_id','is_used_skill_id_with_detail_one'].includes(atom.field))explicit.add(String(atom.value));
  if(atom.field.startsWith('activate_count_')||atom.field==='succession_skill_count')fields.add(atom.field);
 }
 const roles=new Map();
 for(const [id,skill]of compiled){
  const invocations=skill.invocations.filter(inv=>!inv.linked),effects=invocations.flatMap(inv=>inv.effects),dependent=skill.invocations.some(inv=>[...inv.condition,...inv.precondition].some(branch=>branch.dynamic.some(a=>fields.has(a.field))));
  const uses=[...new Set(skill.invocations.flatMap(inv=>[...inv.condition,...inv.precondition].flatMap(branch=>branch.dynamic.filter(a=>fields.has(a.field)).map(a=>a.field))))];
  const referenced=skill.invocations.some(inv=>[...inv.condition,...inv.precondition].some(branch=>branch.dynamic.some(a=>['is_exist_skill_id','is_used_skill_id','is_used_skill_id_with_detail_one','is_activate_other_skill_detail'].includes(a.field))));
  const critical=dependent||referenced||skill.invocations.flatMap(inv=>inv.effects).some(e=>e.kind==='heal'||e.kind.startsWith('passive_'))||scope==='identity'&&(skill.skill.inherited||skill.skill.rarity==='evolution'||effects.some(e=>['acceleration','full_spurt_acceleration'].includes(e.kind)));
  const counts=[...fields].sort().map(field=>{
   if(field==='succession_skill_count')return Number(!!skill.skill.inherited);
   if(field==='activate_count_heal')return Number(effects.some(e=>e.kind==='heal'&&e.value>0));
   if(field==='activate_count_param_skill')return Number(effects.some(e=>e.kind.startsWith('passive_')));
   if(field==='activate_count_all')return Number(invocations.length>0);
   const ranges={activate_count_start:[0,distance/6],activate_count_middle:[distance/6,2*distance/3],activate_count_end_after:[2*distance/3,distance],activate_count_later_half:[distance/2,distance]},range=ranges[field];
   // Keep the potential contributor counts in each source-defined phase.
   // Unrecognized count predicates conservatively retain contributor IDs.
   return range?Number(invocations.some(inv=>inv.condition.some(branch=>branch.windows.some(([lo,hi])=>lo<range[1]&&hi>range[0])))):invocations.length?id:0;
  });
  roles.set(id,{critical,counts,uses});
 }
 return ids=>{
  const used=new Set(ids.flatMap(id=>roles.get(id)?.uses||[]));
  const possession=new Set(ids.flatMap(id=>[id,...(lower.get(id)||[])])),critical=ids.filter(id=>roles.get(id)?.critical).sort(),references=[...explicit].filter(id=>possession.has(id)).sort(),counts=[...fields].sort().flatMap((field,index)=>{
   if(scope!=='identity'&&!used.has(field))return [];
   const values=ids.map(id=>roles.get(id)?.counts[index]??0);
   return [[field,values.every(value=>typeof value==='number')?values.reduce((sum,n)=>sum+n,0):values.filter(Boolean).sort()]];
  });
  return JSON.stringify([critical,references,counts]);
 };
}

function closeScenarios(a,b,tolerance){
 const other=new Map((b.scenarios||[]).map(s=>[s.id,s]));
 return (a.scenarios||[]).length===other.size&&(a.scenarios||[]).every(s=>other.has(s.id)&&s.hpSuccessRate===other.get(s.id).hpSuccessRate&&Math.abs(s.gain-other.get(s.id).gain)<=tolerance+1e-12);
}
export function compressPlans(rows,tolerance,signature=()=>'' ){
 const groups=new Map();let merged=0;
 for(const row of rows.filter(Boolean).sort(compareRacePlans)){
  const groupKey=priorityKey(row)+'|'+signature(row.ids),bands=groups.get(groupKey)||[];
  let band=bands.find(b=>Math.abs(b.anchor.gain-row.gain)<=tolerance+1e-12&&closeScenarios(b.anchor,row,tolerance));
  if(!band){band={anchor:row,cheap:row};bands.push(band);groups.set(groupKey,bands);}else{merged++;if(row.cost<band.cheap.cost||row.cost===band.cheap.cost&&compareRacePlans(row,band.cheap)<0)band.cheap=row;}
 }
 const representatives=[...new Map([...groups.values()].flatMap(bands=>bands.flatMap(b=>[b.anchor,b.cheap])).map(row=>[key(row.ids),row])).values()].sort(compareRacePlans);
 return {representatives,merged,groups:groups.size,inputCount:rows.filter(Boolean).length};
}

// Preserve each structural class plus a global ranking window. A candidate
// skill is never deleted: this only chooses complete plans for the next stage.
export function selectRepresentatives(rows,{tolerance,signature,limit,requiredIds=[],protectedIds=[]}){
 const compressed=compressPlans(rows,tolerance,signature),ranked=compressed.representatives,chosen=new Map(),seen=new Set();
 for(const row of ranked.slice(0,limit))chosen.set(key(row.ids),row);
 for(const row of ranked){const group=priorityKey(row)+'|'+signature(row.ids);if(!seen.has(group)){chosen.set(key(row.ids),row);seen.add(group);}}
 const protectedKeys=new Set([key(requiredIds),...protectedIds.map(key)]);
 for(const row of rows)if(row&&protectedKeys.has(key(row.ids)))chosen.set(key(row.ids),row);
 const near=selectNearBest(ranked,tolerance);if(near)chosen.set(key(near.selected.ids),near.selected);
 return {...compressed,selected:[...chosen.values()].sort(compareRacePlans)};
}
