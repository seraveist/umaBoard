import {generateChart,sortChartRows} from './cm-chart.mjs';
import {recommendTargetAcceleration} from './cm-acceleration-plan.mjs';
import {retainedInheritanceCandidates} from './cm-state.mjs';
import {openChartStorage,chartCatalogVersion} from './cm-chart-storage.mjs';
let data,profiles,display,storage,catalogVersion,lastChart,job=0;
const cache=new Map();

function withRecordedInheritance(chart,acquisition){
 const visible=new Set(chart.rows.map(row=>row.id)),targets=new Set(chart.accelerationPlan.ids);
 const recorded=new Set(retainedInheritanceCandidates(chart.inheritanceOptions,chart.rows,acquisition).map(row=>row.id));
 const additions=chart.inheritanceOptions.filter(row=>!visible.has(row.id)&&(targets.has(row.id)||recorded.has(row.id)))
  .map(row=>({...row,recordedInheritance:recorded.has(row.id)}));
 const rows=additions.length?sortChartRows([...chart.rows,...additions],data,display):chart.rows;
 return {...chart,rows:rows.map(row=>row.inherited&&targets.has(row.id)?{...row,targetInheritance:true}:row)};
}

self.onmessage=async({data:message})=>{
 const {type,requestId,payload}=message;
 if(type==='load'){
  job++;({data,profiles,display}=payload);cache.clear();lastChart=null;
  catalogVersion=chartCatalogVersion(payload.dataVersion,profiles,display,import.meta.url).catch(()=>null);
  storage=openChartStorage();self.postMessage({type:'loaded',requestId});return;
 }
 if(type==='cancel'){job++;return;}
 if(type!=='generate')return;
 const current=++job,cancelled=()=>current!==job;
 try{
  const {acquisition,...input}=payload,version=await catalogVersion,db=await storage;
  const key=JSON.stringify([version,input]);
  let chart=lastChart?.key===key?lastChart.chart:version&&await db?.read(key);
  const restored=!!chart;
  if(cancelled())return;
  if(!chart){
   const onProgress=progress=>{if(!cancelled())self.postMessage({type:'progress',requestId,progress});};
   chart=await generateChart(data,profiles,display,input,{cache,cancelled,onProgress});
   if(cancelled()||!chart)return;
   chart.accelerationPlan=await recommendTargetAcceleration(data,chart,{cancelled,onProgress:progress=>onProgress({...progress,rows:chart.rows})});
   if(cancelled()||!chart.accelerationPlan)return;
   if(version)void db?.write(key,chart);
  }
  lastChart={key,chart};
  self.postMessage({type:'result',requestId,result:withRecordedInheritance(chart,acquisition),restored});
 }catch(error){if(!cancelled())self.postMessage({type:'error',requestId,message:error.message});}
};
