import {phaseAt} from './physics.mjs';
import {INHERITED_EVOLUTIONS} from './skill-transforms.mjs';
import {compareRacePlans} from './race-objective.mjs';

export const INHERITED_LIMIT=6;
export const INHERITED_TOP=10;
export const INHERITED_UPGRADES=Object.freeze(Object.fromEntries(INHERITED_EVOLUTIONS.map(r=>[r.base_id,r.evolved_id])));
const originals=Object.fromEntries(Object.entries(INHERITED_UPGRADES).map(([a,b])=>[b,a]));
export const inheritedOrigin=id=>originals[id]||id;
// Recommendation policy, not game eligibility or a measured activation rate.
// Broad overlaps are deliberate. Unknown overtaking/position conditions stay in.
const early={1:[1,3],2:[2,6],3:[4,9],4:[5,9]};
const late={1:[1,3],2:[2,5],3:[3,9],4:[3,9]};
const curated=Object.freeze({
 '900271':[3,4], // Anabolic: exact sixth in a CM9 late corner.
 '900201':[1],   // Angling: late corner in first place.
 '900511':[2],   // Tsubomi: third/fourth after a middle-corner contest.
 '900591':[3,4], // Kanata: rear-group late acceleration.
 '900171':[2,3,4] // Emperor: three late overtakes; conservative front exclusion.
});
const nativeAliases={'100271':'900271','10271':'900271','100201':'900201','100511':'900511','100591':'900591','100171':'900171','10171':'900171'};
function branchFits(branch,style,distance){
 const ranks=branch.ranks||[1,2,3,4,5,6,7,8,9];
 return branch.windows.some(([lo,hi])=>{
  const phases=new Set([phaseAt(lo,distance),phaseAt(Math.max(lo,hi-1e-5),distance)]);
  return [...phases].some(phase=>{const [a,b]=(phase<2?early:late)[style];return ranks.some(rank=>rank>=a&&rank<=b);});
 });
}
export function styleRecommendation(skill,compiled,setup){
 const key=inheritedOrigin(skill.id),override=curated[key]||curated[nativeAliases[key]];
 const relevant=compiled.invocations.filter(i=>i.effects.some(e=>['target_speed','current_speed','speed_with_decel','acceleration'].includes(e.kind)&&e.value>0));
 if(!relevant.length)return {policy:'cm9-phase-rank-v1',source:'not-applicable',allowedStyles:[1,2,3,4],eligible:true};
 const allowedStyles=override||[1,2,3,4].filter(style=>relevant.some(i=>i.condition.some(b=>branchFits(b,style,setup.course.distance))&&i.precondition.some(b=>branchFits(b,style,setup.course.distance))));
 return {policy:'cm9-phase-rank-v1',source:override?'curated':'phase-rank',allowedStyles,eligible:allowedStyles.includes(setup.style)};
}
export function inheritedPerformanceSkill(compiled){
 return compiled.invocations.some(i=>i.effects.some(e=>['target_speed','current_speed','speed_with_decel','acceleration'].includes(e.kind)&&e.value>0));
}
export function selectInheritedTop(rows){
 const seen=new Set();
 return rows.filter(row=>row.inherited&&row.recommendation?.eligible&&Number.isFinite(row.gain)&&row.gain>=.005)
  .sort(compareRacePlans).filter(row=>{const key=row.inheritanceOriginId??inheritedOrigin(row.id);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,INHERITED_TOP);
}
