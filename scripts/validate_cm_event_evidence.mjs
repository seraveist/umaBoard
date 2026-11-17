import fs from 'node:fs';
import {compileChartSkill,branchSampler,createChartSetup,CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
if(CM_MODEL_VERSION!=='cm-first-chart-v6')throw new Error('v6 고정 기록입니다. 현재 엔진 검증에는 scripts/validate_cm_v7.mjs를 사용하세요.');
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const stats={speed:2100,stamina:1600,power:1600,guts:1200,wisdom:1700};
const sources={
 kyotoOfficial:'https://umamusume.jp/steam-news/detail?id=3496',
 kyotoLabo:'https://umamusumelabo.com/event/champions-meeting/kyoto2200chanmi-202610',
 kyotoMerci:'https://merci-splatoon.com/2610cla-2/',
 kyotoBasics:'https://merci-splatoon.com/2610cla-1/',
 kyotoGamewith:'https://gamewith.jp/uma-musume/article/show/572401',
 tokyoMerci:'https://merci-splatoon.com/2609mile-1/',
 nakayamaLabo:'https://umamusumelabo.com/event/champions-meeting/chanmilong-202612'
};
const events={
 kyoto:{courseId:'10808',distance:2200,track:'10008',season:3,weather:2,going:1,time:2,event:'2026-10 CLASSIC',status:'completed-exact-official-settings',source:sources.kyotoOfficial},
 tokyo:{courseId:'10603',distance:1800,track:'10006',season:3,weather:1,going:1,time:2,event:'2026-09 MILE',status:'completed-course-only-weather-standardized',source:sources.tokyoMerci},
 longchamp:{courseId:'11203',distance:2400,track:'10201',season:3,weather:1,going:1,time:2,event:'2026-09 CLASSIC',status:'completed-course-only-weather-standardized',source:sources.kyotoMerci},
 nakayama:{courseId:'10506',distance:2500,track:'10005',season:4,weather:1,going:1,time:2,event:'2026-12 LONG',status:'announced-prospective-not-real-outcome',source:sources.nakayamaLabo}
};
const cases=[];
const add=(event,id,style,expect,source,expectedOffset=null)=>cases.push({event,id,style,expect,source,expectedOffset});
for(const [id,style]of [['201342',2],['203322',3],['203902',4],['91101411',2],['91101351',3],['900201',1],['900271',3],['900591',3],['910681',2],['203441',2],['203831',3]])add('kyoto',id,style,'useful',sources.kyotoLabo);
for(const [id,style]of [['202711',2],['202871',4],['203381',3],['202712',2],['203712',2],['204432',3],['200642',4]])add('kyoto',id,style,'guide-avoid',['202711','202871'].includes(id)?sources.kyotoBasics:['203381','200642'].includes(id)?sources.kyotoGamewith:sources.kyotoMerci);
for(const [id,style]of [['900201',1],['900511',2],['900271',3]])add('tokyo',id,style,'useful',sources.tokyoMerci,0);
add('tokyo','202712',2,'guide-avoid',sources.tokyoMerci);
add('tokyo','200642',4,'delayed',sources.tokyoMerci,75);
for(const [id,style]of [['203712',2],['204432',3],['200642',4],['203711',2],['204431',3],['91101411',2],['91101351',3]])add('nakayama',id,style,'useful',sources.nakayamaLabo);
for(const [id,style]of [['900201',1],['900591',3],['910681',2]])add('nakayama',id,style,'delayed',sources.nakayamaLabo,100/3);
for(const [id,style]of [['202712',2],['203712',2],['204432',3]])add('longchamp',id,style,'useful',sources.kyotoMerci);
const setupFor=(event,style,extra={})=>{
 const e=events[event],c=data.courses[e.courseId];
 if(c.distance!==e.distance||c.track_id!==e.track||c.surface!==1)throw new Error('Event/course identity mismatch');
 return {...createChartSetup(data,profiles,{...e,outfitId:'101301',scenarioId:'14',style,supportIds:[],raceContext:extra.raceContext??{},samplingSeed:extra.samplingSeed??0}),stats:extra.stats??stats};
};
function evaluate(event,id,style,{samples=256,...extra}={}){
 const setup=setupFor(event,style,extra),compiled=compileChartSkill(data.skills[id],setup);
 const evaluator=new RaceEvaluator(setup,new Map([[id,compiled]]),[],[],branchSampler);
 const score=evaluator.evaluate([id],samples,.01);
 const accelIndices=new Set(compiled.invocations.filter(i=>i.effects.some(e=>e.kind==='acceleration'&&e.value>0)).map(i=>i.index));
 let timingSample=0,first=evaluator.run([id],0,.01);
 if(accelIndices.size)for(let i=0;i<Math.min(samples,64);i++){
  const run=evaluator.run([id],i,.01);if(run.events.some(e=>accelIndices.has(e.index))){first=run;timingSample=i;break;}
 }
 const accelerations=first.events.filter(e=>accelIndices.has(e.index)),late=2*setup.course.distance/3;
 return {gain:score.gain,activationRate:score.activationRates[id],hpSuccessRate:score.hpSuccessRate,sampling:score.sampling,status:compiled.status,assumptions:compiled.assumed,timingSample,firstEvents:first.events,firstAcceleration:accelerations[0]?.x??null,lateStart:late,offset:accelerations.length?accelerations[0].x-late:null};
}
const result={validatedAt:'2026-11-17 Asia/Seoul',engineCommit:'a81b894373f987cb7d3ac367982f86e959639c4c',modelVersion:CM_MODEL_VERSION,dataVersion:manifest.active_version,stats,aptitudes:{distance:'A',surface:'A',style:'A'},mood:'best',nativeBaseline:'none-isolate-skill-effect',samples:256,dt:.01,events,sources,cases:[],seedSensitivity:[],rankSensitivity:[],combinationMarginals:[],recommendationStability:[]};
for(const item of cases){
 const score=evaluate(item.event,item.id,item.style),n128=evaluate(item.event,item.id,item.style,{samples:128});
 const spatialPass=item.expectedOffset===null?null:score.offset!==null&&Math.abs(score.offset-item.expectedOffset)<1;
 const contributionPass=item.expect==='guide-avoid'?Math.abs(score.gain)<.05:score.gain>.005;
 result.cases.push({...item,name:data.skills[item.id].name_jp,...score,gain128:n128.gain,delta128vs256:n128.gain-score.gain,contributionPass,spatialPass,pass:contributionPass&&spatialPass!==false});
 console.log(JSON.stringify({event:item.event,id:item.id,name:data.skills[item.id].name_jp,gain:score.gain,offset:score.offset,pass:contributionPass&&spatialPass!==false}));
}
for(const [event,id,style]of [['kyoto','201342',2],['kyoto','203441',2],['kyoto','900271',3],['kyoto','91101411',2],['tokyo','900511',2],['nakayama','200642',4]]){
 const values=Array.from({length:8},(_,samplingSeed)=>evaluate(event,id,style,{samplingSeed,samples:128}).gain);
 result.seedSensitivity.push({event,id,name:data.skills[id].name_jp,samples:128,seeds:8,values,min:Math.min(...values),max:Math.max(...values),spread:Math.max(...values)-Math.min(...values)});
}
for(const [id,style]of [['900201',1],['900271',3],['900591',3],['91101411',2]]){
 const values=Array.from({length:9},(_,i)=>({rank:i+1,...evaluate('kyoto',id,style,{samples:128,raceContext:{rankTimeline:[{distance:0,rank:i+1}]}})}));
 result.rankSensitivity.push({id,name:data.skills[id].name_jp,values:values.map(({rank,gain,activationRate})=>({rank,gain,activationRate}))});
}
for(const [event,style,ids]of [['kyoto',2,['201342','203441','91101411']],['nakayama',4,['200642','91101351']]]){
 const setup=setupFor(event,style),compiled=new Map(ids.map(id=>[id,compileChartSkill(data.skills[id],setup)]));
 const evaluator=new RaceEvaluator(setup,compiled,[],[],branchSampler),joint=evaluator.evaluate(ids,256,.01),singles=ids.map(id=>({id,gain:evaluator.evaluate([id],256,.01).gain}));
 const ablated=ids.map(id=>({id,marginal:joint.gain-evaluator.evaluate(ids.filter(other=>other!==id),256,.01).gain}));
 result.combinationMarginals.push({event,style,ids,joint:joint.gain,singles,ablated,sumSingles:singles.reduce((s,v)=>s+v.gain,0)});
}
// A controlled small purchasable pool allows independent per-seed recommendation
// comparison without pretending that a public winner's missing hints were known.
const ids=['201342','201341','203441','203442','202711','202712','203712','91101411'];
for(let samplingSeed=0;samplingSeed<4;samplingSeed++){
 const setup=setupFor('kyoto',2,{samplingSeed}),chart={setup,modelVersion:CM_MODEL_VERSION,nativeIds:[],rows:ids.map(id=>({...data.skills[id],name:data.skills[id].name_jp}))};
 const acquisition=Object.fromEntries(ids.map(id=>[id,'5']));
 const plan=await recommendFinalPlan(data,chart,acquisition,{stats,spBudget:500,aptitudes:{distance:'A',surface:'A',style:'A'}},{samples:128,searchSamples:8});
 result.recommendationStability.push({seed:samplingSeed,activeIds:plan.activeIds,gain:plan.gain,budget:plan.budget,hpSuccessRate:plan.hpSuccessRate,search:plan.search,excluded:plan.excluded});
}
result.summary={cases:result.cases.length,passed:result.cases.filter(r=>r.pass).length,failed:result.cases.filter(r=>!r.pass).map(r=>({event:r.event,id:r.id,expect:r.expect,gain:r.gain,offset:r.offset})),max128vs256:Math.max(...result.cases.map(r=>Math.abs(r.delta128vs256)))};
const output=new URL('docs/validation/cm-event-evidence-20261117.json',root);fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result.summary));

