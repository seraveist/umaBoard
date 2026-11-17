import {generateChart,prepareChart,sortChartRows} from './cm-chart.mjs';
import {recommendTargetAcceleration} from './cm-acceleration-plan.mjs';
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
   const extra=result.accelerationPlan.ids.filter(id=>data.skills[id]?.inherited&&!result.rows.some(row=>row.id===id));
   if(extra.length){
    const task=prepareChart(data,profiles,display,payload);
    result.rows=sortChartRows([...result.rows,...task.rows.filter(row=>extra.includes(row.id)).map(row=>({...task.evaluate(row),targetInheritance:true}))],data,display);
   }
   result.rows=result.rows.map(row=>row.inherited&&result.accelerationPlan.ids.includes(row.id)?{...row,targetInheritance:true}:row);
  }
  if(current===job&&result)self.postMessage({type:'result',requestId,result});
 }catch(error){if(current===job)self.postMessage({type:'error',requestId,message:error.message});}
};
