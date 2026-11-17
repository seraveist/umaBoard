import fs from 'node:fs';
import {compileChartSkill,branchSampler,prepareChart,createChartSetup} from '../assets/cm-chart.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {lengthsBetween} from '../assets/physics.mjs';
import {RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),prior=read('docs/validation/cm-event-evidence-20261117.json');
const input={outfitId:'101301',scenarioId:'14',style:2,supportIds:[],courseId:'10808',season:3,weather:2,going:1,time:2};
const setupFor=(style,stats=prior.stats)=>({...createChartSetup(data,profiles,{...input,style}),stats});
function score(style,baseline,candidate,{stats=prior.stats,fullSpurt=true,count=256}={}){
 const setup=setupFor(style,stats),ids=[...baseline,candidate],compiled=new Map(ids.map(id=>[id,compileChartSkill(data.skills[id],setup)]));
 if(fullSpurt){
  const ev=new RaceEvaluator(setup,compiled,baseline,[],branchSampler),s=ev.evaluate(ids,count,.01);
  return {gain:s.gain,hpSuccessRate:s.hpSuccessRate,activationRate:s.activationRates[candidate],sampling:s.sampling,assumptions:compiled.get(candidate).assumed};
 }
 let total=0;
 for(let i=0;i<count;i++){
  const opts={dt:.01,keepTrace:false,fullSpurt:false,branchSampler:branchSampler(setup,[],i)},a=simulateSolo(setup,baseline.map(id=>compiled.get(id)),.5,opts),b=simulateSolo(setup,ids.map(id=>compiled.get(id)),.5,opts);total+=lengthsBetween(b,a);
 }
 return {gain:total/count};
}
const nativeIds=outfitId=>prepareChart(data,profiles,{skills:{}},{...input,outfitId},{samples:1,dt:.05}).nativeIds;
const conditions=[
 {name:'isolated',style:2,baseline:[],ids:['202711','202712']},
 {name:'inherited-only',style:2,baseline:['91101411'],ids:['202711','202712']},
 {name:'downhill-and-inherited',style:2,baseline:['201342','91101411'],ids:['202711','202712']},
 {name:'gold-downhill-and-inherited',style:2,baseline:['201342','203441','91101411'],ids:['202711','202712']},
 {name:'Fine-native-and-evolved-main',style:2,baseline:[...nativeIds('102201'),'102201211','91101411','910681','203442'],ids:['202711','202712']},
 {name:'Almond-native-and-evolved-main',style:2,baseline:[...nativeIds('112901'),'112901211','112901111','201342','91101411'],ids:['202711','202712']},
 {name:'chaser-isolated',style:4,baseline:[],ids:['202871']},
 {name:'chaser-downhill-and-inherited',style:4,baseline:['203902','91101351'],ids:['202871']}
];
const result={engineCommit:prior.engineCommit,stats:prior.stats,samples:256,dt:.01,contextCases:[],fullSpurtSensitivity:[],trace:[],interpretation:'controlled-in-model-marginals-not-replays-of-public-accounts'};
for(const row of conditions)for(const id of row.ids){
 const s=score(row.style,row.baseline,id);
 result.contextCases.push({...row,candidate:id,nameJp:data.skills[id].name_jp,...s});
 console.log(JSON.stringify({context:row.name,id,gain:s.gain}));
}
for(const speed of [1999,2000,2001,2100]){
 const stats={...prior.stats,speed};
 result.fullSpurtSensitivity.push({speed,on:score(2,[],'202711',{stats,fullSpurt:true,count:128}).gain,off:score(2,[],'202711',{stats,fullSpurt:false,count:128}).gain});
}
for(const baseline of [[],['201342','91101411']]){
 const setup=setupFor(2),ids=[...baseline,'202711'],compiled=ids.map(id=>compileChartSkill(data.skills[id],setup));
 for(let sample=0;sample<64;sample++){
  const opts={dt:.01,keepTrace:true,fullSpurt:true,branchSampler:branchSampler(setup,[],sample)},b=simulateSolo(setup,compiled,.5,opts),event=b.events.find(e=>e.id==='202711');if(!event)continue;
  const a=simulateSolo(setup,compiled.filter(s=>s.id!=='202711'),.5,opts),at=a.trace.reduce((best,p)=>Math.abs(p.x-event.x)<Math.abs(best.x-event.x)?p:best,a.trace[0]);
  result.trace.push({baseline,sample,event,baselineAtTrigger:at,targetGap:at.target-at.v,baselineReach:a.reach,baselineEntry:a.entry});break;
 }
}
result.inheritedPriceCoverage=[];
for(const [base,strong]of [['901411','91101411'],['901351','91101351']]){
 const inputs=Array.from({length:6},(_,i)=>String(i)).concat('owned');
 result.inheritedPriceCoverage.push({base,strong,baseStage:data.purchase_stages[base],strongStage:data.purchase_stages[strong]??null,states:inputs.map(state=>({state,base:new RecordedPurchaseModel(data,[data.skills[base]],{[base]:state}).selection([base]),strong:new RecordedPurchaseModel(data,[data.skills[strong]],{[strong]:state}).selection([strong])}))});
}
const out=new URL('docs/validation/cm-event-context-20261117.json',root);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result.fullSpurtSensitivity));

