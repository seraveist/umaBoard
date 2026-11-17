import {recommendFinalPlan} from './cm-final-plan.mjs';
let data,job=0;
self.onmessage=async({data:message})=>{
 const {type,requestId,payload}=message;
 if(type==='load'){data=payload;return;}
 if(type==='cancel'){job++;return;}
 if(type!=='recommend')return;
 const current=++job;
 try{
  const result=await recommendFinalPlan(data,payload.chart,payload.states,payload.input,{cancelled:()=>current!==job,onProgress:progress=>{if(current===job)self.postMessage({type:'progress',requestId,progress});}});
  if(current===job&&result)self.postMessage({type:'result',requestId,result});
 }catch(error){if(current===job)self.postMessage({type:'error',requestId,message:error.message});}
};
