// Shared counterfactual race contexts. Default cases are a coverage design,
// NOT measured frequencies. Supplied weighted observed contexts are supported.
import {RACE_OBJECTIVE} from './race-objective.mjs';
export const ENCOUNTER_POLICY='coherent-coverage-v1';
export const CONTEXT_FIELDS=new Set(['order','order_rate','is_overtake','change_order_onetime','blocked_side_continuetime','blocked_front_continuetime','blocked_front','distance_diff_top','bashin_diff_behind','bashin_diff_infront','overtake_target_time','infront_near_lane_time','behind_near_lane_time','near_count','near_infront_count','is_move_lane','is_behind_in','is_surrounded','lane_type','distance_diff_top_float','distance_diff_rate','order_rate_out40_continue','order_rate_in20_continue','order_rate_out50_continue','order_rate_in50_continue','order_rate_out20_continue','order_rate_in40_continue','order_rate_out70_continue','order_rate_in80_continue','overtake_target_no_order_up_time','compete_fight_count','temptation_count','is_temptation','running_style_count_same','running_style_count_same_rate','running_style_equal_popularity_one','same_skill_horse_count','behind_near_lane_time_set1','change_order_up_end_after','change_order_up_middle','change_order_up_finalcorner_after','is_other_character_activate_advantage_skill','is_popularity_top_character_activate_advantage_skill','is_activate_any_skill','is_activate_heal_skill','temptation_opponent_count_behind','visiblehorse']);
const domainCache=new WeakMap();
export const RANK_FIELDS=new Set(['order','order_rate','change_order_onetime','change_order_up_middle','change_order_up_end_after','change_order_up_finalcorner_after','is_overtake']);
export function contextDomains(data){
 if(domainCache.has(data))return domainCache.get(data);
 const values={};
 for(const skill of Object.values(data.skills||{}))for(const inv of skill.invocations||[])for(const atom of [...(inv.condition||[]),...(inv.precondition||[])].flat()){
  if(!CONTEXT_FIELDS.has(atom.field)||!Number.isFinite(atom.value))continue;
  const set=values[atom.field]??=new Set([0]);for(const value of [atom.value-1,atom.value,atom.value+1])if(value>=0)set.add(value);
 }
 const domains=Object.fromEntries(Object.entries(values).map(([f,v])=>[f,f.startsWith('is_')||f==='blocked_front'?[0,1]:[...v].sort((a,b)=>a-b)]));domainCache.set(data,domains);return domains;
}
export function scenarioCount(setup){
 if(setup.encounterPolicy!==ENCOUNTER_POLICY)return 1;
 return setup.raceContext?.scenarios?.filter(s=>s.weight>0).length||(setup.raceContext?.rankTimeline?.length?1:9);
}
const offset=field=>[...field].reduce((s,c)=>s+c.charCodeAt(0),0)%9;
function timeline(distance,index){
 const phases=[0,1/6,1/2,2/3,5/6,1],points=[];
 for(let i=0;i<phases.length;i++){
  const rank=(index+i*2)%9+1,x=distance*phases[i],previous=points.at(-1);
  if(previous)for(let step=1;step<Math.abs(rank-previous.rank);step++)points.push({distance:previous.distance+(x-previous.distance)*step/Math.abs(rank-previous.rank),rank:previous.rank+Math.sign(rank-previous.rank)*step});
  points.push({distance:x,rank});
 }
 return points;
}
export function raceScenario(setup,sample){
 const base=setup.raceContext||{},count=scenarioCount(setup);
 if(setup.encounterPolicy!==ENCOUNTER_POLICY)return {id:'conditional',weight:1,context:base,basis:'conditional'};
 const supplied=base.scenarios?.filter(s=>s.weight>0),index=sample%count;
 const entry=supplied?.[index],context={...base,...entry?.context};delete context.scenarios;delete context.scenarioEvidence;delete context.scenarioSource;
 const domains=setup.externalDomains||{},conditions={...context.conditions};
 // Unobserved numeric gates receive shared threshold stress values. These
 // values are never interpreted as empirical event probabilities.
 for(const [field,domain]of Object.entries(domains))if(!Object.hasOwn(conditions,field)&&!RANK_FIELDS.has(field)&&!/^order_rate_(in|out)\d+_continue$/.test(field)){
  const q=(index+offset(field))%count;
  conditions[field]=domain[Math.round(q/Math.max(1,count-1)*(domain.length-1))];
 }
 const explicitRank=context.conditions?.order??context.conditions?.order_rate;
 const rankTimeline=context.rankTimeline?.length?context.rankTimeline:Number.isInteger(explicitRank)&&explicitRank>=1&&explicitRank<=9?[{distance:0,rank:explicitRank}]:timeline(setup.course.distance,index);
 return {id:entry?.id??(base.rankTimeline?.length?'recorded':`coverage-${index+1}`),weight:entry?.weight??1,
  basis:supplied?'provided-weighted-contexts':base.rankTimeline?.length?'recorded-ranks':'coverage-not-observed-frequency',
  context:{...context,conditions,rankTimeline,coherentRanks:true}};
}
export function rankAt(points,x){let lo=0,hi=points?.length??0;while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid].distance<=x)lo=mid+1;else hi=mid;}return points?.[lo-1]?.rank;}
export function rankChanges(points,x,from=0){
 let previous=rankAt(points,from),up=0;
 for(const p of points||[])if(p.distance>from&&p.distance<=x){if(previous!==undefined)up+=Math.max(0,previous-p.rank);previous=p.rank;}
 return up;
}
export function encounterPolicy(setup){
 const supplied=setup.raceContext?.scenarios,evidence=setup.raceContext?.scenarioEvidence;
 return {version:setup.encounterPolicy??'conditional-v6',cases:scenarioCount(setup),
  aggregation:RACE_OBJECTIVE,
  probabilityBasis:supplied?.length?(evidence?.kind==='observed-counts'?'recorded-count-weights':'user-provided-weights'):setup.raceContext?.rankTimeline?.length?'recorded-ranks-other-gates-stressed':'coverage-not-measured-probabilities',
  role:supplied?.length?(evidence?.kind==='observed-counts'?'declared-observations':'assumed-weighted-contexts'):'stress-comparison',
  observationCount:evidence?.kind==='observed-counts'?evidence.sampleSize:null,independentlyValidated:false,
  source:evidence?.source??setup.raceContext?.scenarioSource??null};
}
