import {recommendFinalPlan} from './cm-final-plan.mjs';
let data,job=0;
self.onmessage=async({data:message})=>{
 const {type,requestId,payload}=message;
 if(type==='load'){data=payload;return;}
 if(type==='cancel'){job++;return;}
 if(type!=='recommend')return;
 const current=++job;
 try{
  const timings={};let phase,started;
  const onPhase=next=>{
   const now=performance.now();
   if(phase)timings[phase]=(timings[phase]||0)+(now-started);
   phase=next;started=now;
  };
  const result=await recommendFinalPlan(data,payload.chart,payload.states,payload.input,{onPhase,cancelled:()=>current!==job,onProgress:progress=>{if(current===job)self.postMessage({type:'progress',requestId,progress});}});
  onPhase(null);
  if(current===job&&result)self.postMessage({type:'result',requestId,result,timings});
 }catch(error){if(current===job)self.postMessage({type:'error',requestId,message:error.message,code:error.code??null,details:error.details??null});}
};
