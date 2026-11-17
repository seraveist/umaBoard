import {sampleBranches} from './activation.mjs';

const randomPrime=[2,3,5,7,11,13,17,19,23,29,31,37];
export function radicalInverse(n,base){let x=0,f=1/base;for(;n>0;n=Math.floor(n/base),f/=base)x+=n%base*f;return x;}
const skillHash=id=>[...String(id)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,0);

export function branchSampler(setup,nativeIds,sample){
 const nSet=new Set(nativeIds);
 const value=(id,index,dimension)=>{
  const shared=typeof index==='string',key=shared?skillHash(index):index;
  const offset=skillHash(id)%19+(shared?key%97:0),base=randomPrime[(dimension+(nSet.has(id)?0:1)+(key%randomPrime.length)*2)%randomPrime.length];
  return radicalInverse(sample+1+offset,base);
 };
 return (branches,id,inv,pre)=>{
  if(pre)return sampleBranches(branches,.5,true);
  if(inv.chartRandomPolicy){
   const areas=inv.chartRandomPolicy==='corners'?setup.course.corners.map(c=>[c.start,c.start+c.length]):setup.course.straights.map(s=>[s.start,s.end]);
   const count=inv.chartRandomPolicy==='corners'?2:1,windows=[];
   for(let k=0;k<count;k++){
    const areaIndex=Math.min(areas.length-1,Math.floor(value(id,inv.chartRandomPolicy,k*2)*areas.length));
    const selected=inv.chartRandomPolicy==='corners'?areas.splice(areaIndex,1)[0]:areas[areaIndex];
    if(!selected)continue;
    const start=inv.chartRandomPolicy==='corners'
     ?selected[0]+value(id,inv.chartRandomPolicy,k*2+1)*Math.max(0,selected[1]-selected[0]-10)
     :Math.min(selected[0]+value(id,inv.chartRandomPolicy,k*2+1)*(selected[1]-selected[0]),selected[1]-2);
    windows.push([start,Math.min(selected[1],start+10)]);
   }
   return branches.flatMap(branch=>{
    const clipped=windows.flatMap(([lo,hi])=>branch.windows.map(([a,b])=>[Math.max(lo,a),Math.min(hi,b)]).filter(([a,b])=>a<b)).sort((a,b)=>a[0]-b[0]);
    return clipped.length?[{...branch,random:false,windows:clipped,at:clipped[0][0]}]:[];
   });
  }
  // The source caches each random condition per skill, across its invocation
  // alternatives. A weaker fallback must not roll ahead of its stronger form.
  return branches.map((branch,index)=>{
   const sampled=sampleBranches([branch],value(id,branch.randomKey||inv.index,branch.randomKey?0:index))[0];
   if(inv.cooldownSeconds&&branch.randomKey){
    const area=branch.windows.find(([lo,hi])=>sampled.at>=lo&&sampled.at<hi);
    if(area){sampled.at=Math.max(area[0],Math.min(sampled.at,area[1]-2));sampled.windows=[[sampled.at,Math.min(area[1],sampled.at+10)]];}
   }
   return {...sampled,fullSpurtQ:value(id,'full_spurt',0),choiceQ:value(id,'effect_value',0)};
  });
 };
}
