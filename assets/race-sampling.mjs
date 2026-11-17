// Independent keyed Latin-hypercube blocks. Each 64-sample block visits every
// stratum once. A keyed Feistel permutation separates different dimensions;
// jitter is separate again. Prefixes stay stable when evaluation is extended.
import {rankAt,rankChanges,encounterPolicy} from './race-scenarios.mjs';
export const SAMPLING_VERSION='keyed-latin64-v1';
const mix=n=>{n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return (n^(n>>>15))>>>0;};
const hash=text=>{let n=2166136261;for(const c of String(text))n=Math.imul(n^c.charCodeAt(0),16777619);return mix(n);};
export function sampleUnit(sample,key,seed=0){
 if(!Number.isSafeInteger(sample)||sample<0)throw new Error('발동 표본 번호를 확인하세요.');
 const dimension=hash(`${seed}|${key}`),block=mix(dimension^mix(Math.floor(sample/64)));
 let left=(sample%64)>>>3,right=sample&7;
 for(let round=0;round<8;round++)[left,right]=[right,left^(mix(block^Math.imul(round+1,0x9e3779b9)^right)&7)];
 const stratum=(left<<3)|right,jitter=mix(dimension^mix(sample)^0xa511e9b3)/4294967296;
 return (stratum+jitter)/64;
}
export function normalizeRaceContext(value={}){
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('레이스 조건을 확인하세요.');
 const context={...value};
 if(context.scenarios!==undefined){
  if(!Array.isArray(context.scenarios)||!context.scenarios.length||context.scenarios.length>32||context.scenarios.some(s=>!s||typeof s.id!=='string'||!s.id||!Number.isFinite(s.weight)||s.weight<0||s.context?.scenarios!==undefined)||new Set(context.scenarios.map(s=>s.id)).size!==context.scenarios.length||!context.scenarios.some(s=>s.weight>0))throw new Error('전개별 이름과 가중치를 확인하세요.');
  context.scenarios=context.scenarios.map(s=>({...s,context:normalizeRaceContext(s.context)}));
 }
 for(const field of ['postNumber','popularity']){
  const n=context[field];
  if(n!==undefined&&n!==null&&(!Number.isInteger(n)||n<1||n>9))throw new Error('게이트와 인기는 1~9 사이로 입력하세요.');
 }
 if(context.conditions!==undefined&&(context.conditions===null||typeof context.conditions!=='object'||Array.isArray(context.conditions)||Object.values(context.conditions).some(v=>!Number.isFinite(v))))throw new Error('외부 발동 조건값을 확인하세요.');
 if(context.rankTimeline!==undefined&&(!Array.isArray(context.rankTimeline)||context.rankTimeline.some((p,i,a)=>!Number.isFinite(p.distance)||p.distance<0||!Number.isInteger(p.rank)||p.rank<1||p.rank>9||i>0&&p.distance<a[i-1].distance)))throw new Error('순위 기록은 거리순으로 입력하세요.');
 return context;
}
export function activationProbability(skill,setup){
 const native=['unique','unique_low_star','unique_upgraded'].includes(skill.rarity);
 // Reviewed supplements without this metadata follow their source rarity.
 return skill.activation_raw===0||skill.activation_raw==null&&native?1:Math.max(.2,1-90/setup.stats.wisdom);
}
export function samplingPolicy(setup){
 return {version:SAMPLING_VERSION,seed:setup.samplingSeed??0,wisdomActivation:'raw-wisdom-per-skill',spurt:setup.spurtPolicy??'forced-projection',
  gate:setup.raceContext?.postNumber==null?'uniform-cm9':'recorded',
  popularity:setup.raceContext?.popularity==null?'uniform-prior-cm9':'recorded',
  opponentConditions:encounterPolicy(setup),
  interpretation:setup.encounterPolicy?'coherent-scenario-comparison-not-win-probability':'sampled-self-activation-conditional-on-unobserved-opponents'};
}
const compare=(a,op,b)=>op==='=='?a===b:op==='!='?a!==b:op==='>'?a>b:op==='>='?a>=b:op==='<'?a<b:op==='<='?a<=b:false;
// Schedule the same predicates at their next possible distance rather than
// checking a known-false constant/rank band on every integration frame. Random
// positions have already been drawn; clipping must never reroll them.
export function scheduleContextBranches(branches,setup){
 const context=setup.raceContext;
 if(!context?.coherentRanks||setup.contextScheduling===false)return branches;
 return branches.flatMap(branch=>{
  const constant=a=>!['order','order_rate'].includes(a.field)&&Object.hasOwn(context.conditions||{},a.field);
  if((branch.external||[]).some(a=>constant(a)&&!compare(context.conditions[a.field],a.operator,a.value)))return [];
  let windows=branch.windows;
  if(branch.ranks?.length<9&&context.rankTimeline?.length){
   const points=[...new Set([0,...context.rankTimeline.map(p=>p.distance),setup.course.distance].filter(x=>x<=setup.course.distance))].sort((a,b)=>a-b);
   const bands=points.slice(0,-1).flatMap((lo,i)=>{const rank=rankAt(context.rankTimeline,lo);return rank===undefined||branch.ranks.includes(rank)?[[lo,points[i+1]]]:[];});
   windows=windows.flatMap(([lo,hi])=>bands.map(([a,b])=>[Math.max(lo,a),Math.min(hi,b)]).filter(([a,b])=>a<b));
  }
  return windows.length?[{...branch,windows,external:(branch.external||[]).filter(a=>!constant(a))}]:[];
 });
}
export function externalConditionValue(atom,state){
 const context=state.raceContext||{};
 const timeline=context.rankTimeline;
 if(context.coherentRanks&&timeline?.length){
  if(['order','order_rate'].includes(atom.field)){
   if(state.externalRank?.x!==state.x)state.externalRank={x:state.x,rank:rankAt(timeline,state.x)};
   return state.externalRank.rank;
  }
  if(Object.hasOwn(context.conditions||{},atom.field))return context.conditions[atom.field];
  if(atom.field==='change_order_onetime')return rankChanges(timeline,state.x);
  if(atom.field==='change_order_up_middle')return rankChanges(timeline,Math.min(state.x,state.distance*2/3),state.distance/6);
  if(atom.field==='change_order_up_end_after')return rankChanges(timeline,state.x,state.distance*2/3);
  if(atom.field==='change_order_up_finalcorner_after')return Number.isFinite(state.finalCornerStart)?rankChanges(timeline,state.x,state.finalCornerStart):0;
  if(atom.field==='is_overtake')return Number(rankChanges(timeline,state.x,state.prevX??state.x)>0);
  if(/^order_rate_(in|out)\d+_continue$/.test(atom.field))return state.rankDurations?.[atom.field]??0;
 }
 if(Object.hasOwn(context.conditions||{},atom.field))return context.conditions[atom.field];
 if(timeline?.length&&['order','order_rate'].includes(atom.field)){
  let rank;for(const point of timeline){if(point.distance>state.x)break;rank=point.rank;}
  return rank;
 }
 return undefined;
}
// Continuous-rank conditions use time actually spent in the supplied rank
// trajectory; they are not independent constant threshold draws.
export function advanceRankDurations(state){
 if(!state.raceContext?.coherentRanks||!state.rankDurationRules?.length)return;
 const rank=rankAt(state.raceContext.rankTimeline,state.x),previous=state.rankDurationState;
 state.rankDurations??={};
 for(const {field,inside,threshold}of state.rankDurationRules){
  const holds=value=>inside?value<=threshold:value>threshold;
  state.rankDurations[field]=holds(rank)?state.rankDurations[field]+(previous&&holds(previous.rank)?state.t-previous.t:0):0;
 }
 state.rankDurationState={rank,t:state.t};
}
