// Independent keyed Latin-hypercube blocks. Each 64-sample block visits every
// stratum once. A keyed Feistel permutation separates different dimensions;
// jitter is separate again. Prefixes stay stable when evaluation is extended.
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
  opponentConditions:setup.raceContext?.rankTimeline?'recorded-rank-other-conditions-assumed':'unobserved-conditions-assumed',
  interpretation:'sampled-self-activation-conditional-on-unobserved-opponents'};
}
export function externalConditionValue(atom,state){
 const context=state.raceContext||{};
 if(Object.hasOwn(context.conditions||{},atom.field))return context.conditions[atom.field];
 const timeline=context.rankTimeline;
 if(timeline?.length&&['order','order_rate'].includes(atom.field)){
  let rank;for(const point of timeline){if(point.distance>state.x)break;rank=point.rank;}
  return rank;
 }
 return undefined;
}
