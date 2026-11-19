// Independent keyed Latin-hypercube blocks. Each 64-sample block visits every
// stratum once. A keyed Feistel permutation separates different dimensions;
// jitter is separate again. Prefixes stay stable when evaluation is extended.
import {rankAt,rankChanges,encounterPolicy,encounterField,ENCOUNTER_FIELDS} from './race-scenarios.mjs';
import {intersectWindows} from './condition-windows.mjs';
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
 const evidence=context.scenarioEvidence;
 if(evidence!==undefined&&(evidence===null||typeof evidence!=='object'||Array.isArray(evidence)||!['assumed','observed-counts'].includes(evidence.kind)||typeof evidence.source!=='string'||!evidence.source.trim()))throw new Error('전개 가중치의 근거를 확인하세요.');
 if(context.scenarios!==undefined){
  if(evidence?.kind==='observed-counts'&&Array.isArray(context.scenarios))context.scenarios=context.scenarios.map(s=>s&&({...s,weight:s.weight??s.observations}));
  if(!Array.isArray(context.scenarios)||!context.scenarios.length||context.scenarios.length>32||context.scenarios.some(s=>!s||typeof s.id!=='string'||!s.id||!Number.isFinite(s.weight)||s.weight<0||s.context?.scenarios!==undefined)||new Set(context.scenarios.map(s=>s.id)).size!==context.scenarios.length||!context.scenarios.some(s=>s.weight>0))throw new Error('전개별 이름과 가중치를 확인하세요.');
  context.scenarios=context.scenarios.map(s=>({...s,context:normalizeRaceContext(s.context)}));
 }
 if(evidence?.kind==='observed-counts'){
  const list=context.scenarios,total=list?.reduce((sum,s)=>sum+s.observations,0),scale=list?Math.max(...list.map(s=>s.weight)):1,weight=list?.reduce((sum,s)=>sum+s.weight/scale,0);
  if(!list||list.some(s=>!Number.isSafeInteger(s.observations)||s.observations<0)||!Number.isSafeInteger(evidence.sampleSize)||evidence.sampleSize<=0||total!==evidence.sampleSize||list.some(s=>Math.abs(s.weight/scale/weight-s.observations/total)>1e-10))throw new Error('관측 횟수·전체 경기 수·전개 가중치가 일치하는지 확인하세요.');
 }
 if(evidence)context.scenarioEvidence={...evidence};
 for(const field of ['postNumber','popularity']){
  const n=context[field];
  if(n!==undefined&&n!==null&&(!Number.isInteger(n)||n<1||n>9))throw new Error('게이트와 인기는 1~9 사이로 입력하세요.');
 }
 if(context.conditions!==undefined&&(context.conditions===null||typeof context.conditions!=='object'||Array.isArray(context.conditions)||Object.values(context.conditions).some(v=>!Number.isFinite(v))))throw new Error('외부 발동 조건값을 확인하세요.');
 if(context.rankTimeline!==undefined&&(!Array.isArray(context.rankTimeline)||context.rankTimeline.some((p,i,a)=>!Number.isFinite(p.distance)||p.distance<0||!Number.isInteger(p.rank)||p.rank<1||p.rank>9||i>0&&p.distance<a[i-1].distance)))throw new Error('순위 기록은 거리순으로 입력하세요.');
 if(context.encounterWindows!==undefined){
  const windows=context.encounterWindows;
  if(!windows||typeof windows!=='object'||Array.isArray(windows))throw new Error('전개별 경합·막힘 구간을 확인하세요.');
  for(const [field,list] of Object.entries(windows)){
   const valid=(w,i)=>w&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=0&&w.start<w.end&&
    (!i||list[i-1].end<=w.start)&&Number.isInteger(w.value)&&w.value>=1&&w.value<=(field==='near_count'?8:1);
   if(!ENCOUNTER_FIELDS.has(field)||!Array.isArray(list)||!list.every(valid))throw new Error('전개 구간의 종류·거리·주자 수를 확인하세요.');
  }
 }
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
  const constant=a=>!(encounterField(a.field)==='blocked_front'&&context.conditions?.[a.field]>0)&&!['order','order_rate'].includes(a.field)&&!Object.hasOwn(context.encounterWindows||{},encounterField(a.field))&&Object.hasOwn(context.conditions||{},a.field);
  if((branch.external||[]).some(a=>constant(a)&&!compare(context.conditions[a.field],a.operator,a.value)))return [];
  let windows=branch.windows;
  if(branch.ranks?.length<9&&context.rankTimeline?.length){
   const points=[...new Set([0,...context.rankTimeline.map(p=>p.distance),setup.course.distance].filter(x=>x<=setup.course.distance))].sort((a,b)=>a-b);
   const bands=points.slice(0,-1).flatMap((lo,i)=>{const rank=rankAt(context.rankTimeline,lo);return rank===undefined||branch.ranks.includes(rank)?[[lo,points[i+1]]]:[];});
   windows=intersectWindows(windows,bands);
  }
  return windows.length?[{...branch,windows,external:(branch.external||[]).filter(a=>!constant(a))}]:[];
 });
}
export function externalConditionValue(atom,state){
 const context=state.raceContext||{};
 const intervals=context.encounterWindows?.[encounterField(atom.field)];
 if(intervals){
  if(atom.field==='blocked_front_continuetime')return state.blockedFrontSeconds??0;
  const interval=intervals.find(w=>state.x>=w.start&&state.x<w.end);
  return interval?.value??0;
 }
 const timeline=context.rankTimeline;
 if(context.coherentRanks&&timeline?.length){
  if(['order','order_rate'].includes(atom.field)){
   if(state.externalRank?.x!==state.x)state.externalRank={x:state.x,rank:rankAt(timeline,state.x)};
   return state.externalRank.rank;
  }
  if(encounterField(atom.field)==='blocked_front'&&rankAt(timeline,state.x)===1)return 0;
  if(Object.hasOwn(context.conditions||{},atom.field))return context.conditions[atom.field];
  if(atom.field==='change_order_onetime'){
   const before=rankAt(timeline,state.prevX??state.x),after=rankAt(timeline,state.x);
   return before===undefined||after===undefined?0:after-before;
  }
  if(atom.field==='change_order_up_middle')return rankChanges(timeline,Math.min(state.x,state.distance*2/3),state.distance/6);
  if(atom.field==='change_order_up_end_after')return rankChanges(timeline,state.x,state.distance*2/3);
  if(atom.field==='change_order_up_finalcorner_after')return Number.isFinite(state.finalCornerStart)?rankChanges(timeline,state.x,state.finalCornerStart):0;
  if(atom.field==='is_overtake')return Number(rankChanges(timeline,state.x,state.prevX??state.x)>0);
  const band=state.rankBands?.get(atom.field);
  if(band){
   const history=state.rankHistory;
   if(!history?.known)return 0;
   return Number(band.inside?history.worst<=band.threshold:history.best>band.threshold);
  }
 }
 if(Object.hasOwn(context.conditions||{},atom.field))return context.conditions[atom.field];
 if(timeline?.length&&['order','order_rate'].includes(atom.field)){
  let rank;for(const point of timeline){if(point.distance>state.x)break;rank=point.rank;}
  return rank;
 }
 return undefined;
}
// After the five-second start grace, every recorded rank up to the check
// counts, including changes between two integration frames.
export function advanceRankHistory(state){
 const points=state.raceContext.rankTimeline;
 if(!points?.length||state.t<5)return;
 let history=state.rankHistory;
 if(!history){
  const fraction=Math.min(1,Math.max(0,(state.t-5)/state.dt));
  const start=state.x-(state.x-state.prevX)*fraction;
  const rank=rankAt(points,start);
  let index=0;
  while(index<points.length&&points[index].distance<=start)index++;
  history=state.rankHistory={index,known:rank!==undefined,best:rank??Infinity,worst:rank??0};
 }
 while(history.index<points.length&&points[history.index].distance<=state.x){
  const point=points[history.index++];
  // Multiple observations at one coordinate resolve to the last rank, as in rankAt.
  if(points[history.index]?.distance===point.distance)continue;
  history.best=Math.min(history.best,point.rank);
  history.worst=Math.max(history.worst,point.rank);
 }
}

// Measure time in the same front-block window used for the boolean gate.
export function advanceFrontBlock(state,windows){
 const current=windows.find(w=>state.x>=w.start&&state.x<w.end);
 if(!current){state.frontBlockWindow=null;state.blockedFrontSeconds=0;return;}
 if(current!==state.frontBlockWindow){
  const travel=state.x-state.prevX;
  const elapsed=travel>0?state.dt*Math.min(1,(state.x-current.start)/travel):0;
  state.frontBlockStarted=state.t-elapsed;
  state.frontBlockWindow=current;
 }
 state.blockedFrontSeconds=state.t-state.frontBlockStarted;
}
