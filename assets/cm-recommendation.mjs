import {compileSkill} from './activation.mjs';
import {INHERITED_EVOLUTIONS} from './skill-transforms.mjs';
import {compareRacePlans} from './race-objective.mjs';

export const INHERITED_LIMIT=6;
export const INHERITED_TOP=10;
export const INHERITED_UPGRADES=Object.freeze(Object.fromEntries(INHERITED_EVOLUTIONS.map(r=>[r.base_id,r.evolved_id])));
const originals=Object.fromEntries(Object.entries(INHERITED_UPGRADES).map(([a,b])=>[b,a]));
export const inheritedOrigin=id=>originals[id]||id;
const performance=new Set(['target_speed','current_speed','speed_with_decel','acceleration']);
export function styleRecommendation(skill,compiled,setup){
 const raw=compiled.skill??skill;
 if(!raw.invocations.some(i=>i.effects.some(e=>performance.has(e.kind)&&e.value_raw>0)))return {policy:'condition-feasibility-v1',source:'not-applicable',allowedStyles:[1,2,3,4],eligible:true};
 // Only actual source conditions and calculation support may exclude a style.
 // Rank distributions remain in the shared evaluation, never in an ID table.
 const allowedStyles=[1,2,3,4].filter(style=>{
  const candidate=compileSkill(raw,{...setup,style});
  return candidate.status!=='unsupported'&&candidate.invocations.some(i=>i.effects.some(e=>performance.has(e.kind)&&e.value>0));
 });
 return {policy:'condition-feasibility-v1',source:'fixed-conditions',allowedStyles,eligible:allowedStyles.includes(setup.style)};
}
export function inheritedPerformanceSkill(compiled){
 return compiled.invocations.some(i=>i.effects.some(e=>['target_speed','current_speed','speed_with_decel','acceleration'].includes(e.kind)&&e.value>0));
}
export function selectInheritedTop(rows){
 const seen=new Set();
 return rows.filter(row=>row.inherited&&row.recommendation?.eligible&&Number.isFinite(row.gain)&&row.gain>=.005)
  .sort(compareRacePlans).filter(row=>{const key=row.inheritanceOriginId??inheritedOrigin(row.id);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,INHERITED_TOP);
}
