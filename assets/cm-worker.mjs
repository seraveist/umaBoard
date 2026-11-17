import {generateChart,prepareChart,sortChartRows} from './cm-chart.mjs';
import {recommendTargetAcceleration} from './cm-acceleration-plan.mjs';
import {retainedInheritanceCandidates} from './cm-state.mjs';
let data,profiles,display,job=0;
const cache=new Map();
self.onmessage=async({data:message})=>{
 const {type,requestId,payload}=message;
 if(type==='load'){({data,profiles,display}=payload);cache.clear();self.postMessage({type:'loaded',requestId});return;}
 if(type==='cancel'){job++;return;}
 if(type!=='generate')return;
 const current=++job;
 try{
  const result=await generateChart(data,profiles,display,payload,{cache,cancelled:()=>current!==job,
   onProgress:progress=>{if(current===job)self.postMessage({type:'progress',requestId,progress});}});
  if(current===job&&result){
   result.accelerationPlan=await recommendTargetAcceleration(data,result,{cancelled:()=>current!==job,
    onProgress:progress=>{if(current===job)self.postMessage({type:'progress',requestId,progress:{...progress,rows:result.rows}});}});
   if(current!==job||!result.accelerationPlan)return;
   const task=prepareChart(data,profiles,display,payload),extra=result.accelerationPlan.ids.filter(id=>data.skills[id]?.inherited&&!result.rows.some(row=>row.id===id));
   const recorded=retainedInheritanceCandidates(task.rows,result.rows,payload.acquisition),additions=new Map([...task.rows.filter(row=>extra.includes(row.id)),...recorded].map(row=>[row.id,row]));
   if(additions.size)result.rows=sortChartRows([...result.rows,...[...additions.values()].map(row=>({...task.evaluate(row),recordedInheritance:recorded.some(r=>r.id===row.id)}))],data,display);
   result.rows=result.rows.map(row=>row.inherited&&result.accelerationPlan.ids.includes(row.id)?{...row,targetInheritance:true}:row);
  }
  if(current===job&&result)self.postMessage({type:'result',requestId,result});
 }catch(error){if(current===job)self.postMessage({type:'error',requestId,message:error.message});}
};
