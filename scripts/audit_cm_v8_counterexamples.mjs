// Diagnostics only: counterfactual models are labelled and never installed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createChartSetup,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {sampleUnit,scheduleContextBranches} from '../assets/race-sampling.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const frozen='a31b903c52d3a850e9ebcb7e6796d491e2fab10916a9668653c4112fe65f44de';
const hash=()=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL('assets/',root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};assert.equal(hash(),frozen);
const stats={speed:2100,stamina:2000,power:1700,guts:1400,wisdom:1500},aptitudes={distance:'S',surface:'A',style:'A'};
const setup=(courseId,style,extra={})=>({...createChartSetup(data,profiles,{outfitId:'102201',style,courseId,scenarioId:'12',supportIds:[],season:1,weather:1,going:1,time:2}),stats,aptitudes,...extra});
const compact=x=>({gain:x.gain,activationRates:x.activationRates,usefulAccelerationRates:x.usefulAccelerationRates,performance:x.performance,hpSuccessRate:x.hpSuccessRate});
function evalIds(s,ids,{count=576,step=.01,sampler=branchSampler,baseline=[]}={}){
 const compiled=new Map([...new Set([...ids,...baseline])].map(id=>[id,compileChartSkill(data.skills[id],s)])),ev=new RaceEvaluator(s,compiled,baseline,[],sampler);
 return {compiledStatus:Object.fromEntries([...compiled].map(([id,v])=>[id,v.status])),...compact(ev.evaluate(ids,count,step))};
}
// This tests the WITH-replacement semantics of the cited upstream simulator.
// The random streams, cooldown and physics stay the same as the frozen engine.
function withReplacement(s,native,sample){
 const base=branchSampler(s,native,sample),q=(id,key,dimension)=>sampleUnit(sample,`${id}|${key}|${dimension}`,s.samplingSeed??0);
 const f=(branches,id,inv,pre)=>{
  if(pre||inv.chartRandomPolicy!=='corners')return base(branches,id,inv,pre);
  const areas=s.course.corners.map(c=>[c.start,c.start+c.length]),windows=[];
  for(let k=0;k<2;k++){
   const area=areas[Math.min(areas.length-1,Math.floor(q(id,'corners',k*2)*areas.length))];if(!area)continue;
   const start=area[0]+q(id,'corners',k*2+1)*Math.max(0,area[1]-area[0]-10);windows.push([start,Math.min(area[1],start+10)]);
  }
  return scheduleContextBranches(branches.flatMap(branch=>{
   const clipped=windows.flatMap(([lo,hi])=>branch.windows.map(([a,b])=>[Math.max(lo,a),Math.min(hi,b)]).filter(([a,b])=>a<b)).sort((a,b)=>a[0]-b[0]);
   return clipped.length?[{...branch,random:false,windows:clipped,at:clipped[0][0],lotQ:q(id,`lot:${inv.index}:condition`,0),sharedLotQ:q(id,'lot-shared',0),fullSpurtQ:q(id,'full-spurt',0),choiceQ:q(id,'effect-value',inv.index)}]:[];
  }),s);
 };f.unit=base.unit;f.policy=base.policy;return f;
}
const out={date:'2026-11-18 Asia/Seoul',frozenAssetsSha256:frozen,stats,aptitudes,interpretation:'labelled diagnostic counterfactuals; not modified production behavior or measured game outcomes',cornerDraws:[],geometryBoundary:[],contextAblation:[],convergence:[]};
for(const courseId of ['10302','10903','10708']){
 const s=setup(courseId,3);out.cornerDraws.push({courseId,id:'200341',currentWithoutReplacement:evalIds(s,['200341']),citedUpstreamWithReplacement:evalIds(s,['200341'],{sampler:withReplacement})});
}
for(const courseId of ['10708','10907'])for(const delta of [-10,-5,0,5,10]){
 const s=setup(courseId,3,{raceContext:{rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}}}),course=structuredClone(s.course),last=course.corners.length-1;
 course.corners[last-1].length+=delta;course.corners[last].start+=delta;course.corners[last].length-=delta;
 out.geometryBoundary.push({courseId,finalCornerShiftMetres:delta,originalCornerStart:s.course.corners[last].start,phaseStart:s.course.distance*2/3,...evalIds({...s,course},['900591'],{count:144})});
}
for(const courseId of ['10302','10708','10811']){
 const s=setup(courseId,3);for(const value of [0,1])out.contextAblation.push({courseId,id:'200491',infrontNearLaneTime:value,...evalIds({...s,raceContext:{conditions:{infront_near_lane_time:value}}},['200491'],{count:144})});
}
for(const id of ['900511','900271'])for(const count of [144,576])for(const seed of [0,20261119]){
 const s=setup('10302',3,{samplingSeed:seed});out.convergence.push({courseId:'10302',id,count,seed,...evalIds(s,[id],{count})});
}
assert.equal(hash(),frozen);fs.writeFileSync(new URL('docs/validation/cm-v8-counterexamples-20261118.json',root),JSON.stringify(out,null,2)+'\n');console.log('counterexamples complete');
