// A ranking policy, not an estimated game probability. The tail mass is an
// explicit risk preference; it is never fitted to a named skill or course.
export const RACE_OBJECTIVE='mean-gain-baseline-tail-guard-v1';
export const DEFAULT_RISK_POLICY=Object.freeze({tailMass:.25,maxTailDelay:0});
export function normalizeRiskPolicy(value={}){
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('추천의 안정성 설정을 확인하세요.');
 const result={...DEFAULT_RISK_POLICY,...value};
 if(!Number.isFinite(result.tailMass)||result.tailMass<=0||result.tailMass>1||!Number.isFinite(result.maxTailDelay)||result.maxTailDelay<0)throw new Error('추천의 안정성 설정을 확인하세요.');
 return {tailMass:result.tailMass,maxTailDelay:result.maxTailDelay};
}
export function weightedMean(points){
 const scale=Math.max(...points.map(p=>p.weight));
 if(!(scale>0)||points.some(p=>!Number.isFinite(p.value)||!Number.isFinite(p.weight)||p.weight<0))throw new Error('전개별 성능 값을 확인하세요.');
 const weight=points.reduce((sum,p)=>sum+p.weight/scale,0);
 return points.reduce((sum,p)=>sum+p.value*(p.weight/scale),0)/weight;
}
// Upper-tail expected finish time, including a fractional boundary sample.
// Each scenario owns its weight regardless of how many draws visited it.
export function weightedTailMean(points,mass){
 if(!Number.isFinite(mass)||mass<=0||mass>1)throw new Error('하위 성능 구간을 확인하세요.');
 weightedMean(points);
 const scale=Math.max(...points.map(p=>p.weight)),normalized=points.map(p=>({...p,weight:p.weight/scale}));
 const total=normalized.reduce((sum,p)=>sum+p.weight,0),target=total*mass;
 let remaining=target,sum=0;
 for(const point of normalized.filter(p=>p.weight>0).sort((a,b)=>b.value-a.value)){
  const used=Math.min(remaining,point.weight);sum+=used*point.value;remaining-=used;if(remaining<=total*1e-14)break;
 }
 return sum/target;
}
export function performanceSummary(points,reference,policy={}){
 const risk=normalizeRiskPolicy(policy),tailFinishTime=weightedTailMean(points,risk.tailMass),referenceTailFinishTime=weightedTailMean(reference,risk.tailMass);
 const tailDelay=tailFinishTime-referenceTailFinishTime;
 return {meanFinishTime:weightedMean(points),tailFinishTime,referenceTailFinishTime,tailImprovement:-tailDelay,
  risk:{policy:RACE_OBJECTIVE,...risk,tailDelay,withinLimit:tailDelay<=risk.maxTailDelay+1e-9,units:'seconds',basis:'whole-run-finish-times-not-minimum-incremental-gain',interpretation:'scenario-risk-preference-not-empirical-confidence'}};
}
export function compareRacePlans(a,b){
 const feasible=row=>row.feasible??row.fullSpeedFeasible??true;
 const hp=Number(feasible(b))-Number(feasible(a))||(!feasible(a)&&!feasible(b)?(b.hpSuccessRate??0)-(a.hpSuccessRate??0)||(a.hpShortfall??0)-(b.hpShortfall??0):0);
 if(hp)return hp;
 const riskA=a.performance?.risk,riskB=b.performance?.risk;
 return Number(riskB?.withinLimit??true)-Number(riskA?.withinLimit??true)||
  (riskA?.withinLimit===false&&riskB?.withinLimit===false?riskA.tailDelay-riskB.tailDelay:0)||
  b.gain-a.gain||(a.performance?.tailFinishTime??0)-(b.performance?.tailFinishTime??0)||(a.cost??0)-(b.cost??0)||
  [...(a.ids||[a.id])].sort().join(',').localeCompare([...(b.ids||[b.id])].sort().join(','));
}
