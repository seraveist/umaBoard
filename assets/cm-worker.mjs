import {generateChart} from './cm-chart.mjs';
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
  if(current===job&&result)self.postMessage({type:'result',requestId,result});
 }catch(error){if(current===job)self.postMessage({type:'error',requestId,message:error.message});}
};
