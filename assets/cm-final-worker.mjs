import {recommendFinalPlan,FinalRaceSession} from './cm-final-plan.mjs';
import {runSeedWorkers,createPlanWorkerPool} from './cm-seed-pool.mjs';
let data,chart,session,job=0,controller;
self.onmessage=async({data:message})=>{
 const {type,requestId,payload}=message;
 if(!['load','cancel','recommend'].includes(type))return;
 controller?.abort();
 if(type==='load'){job++;({data,chart}=payload);session=new FinalRaceSession();return;}
 if(type==='cancel'){job++;return;}
 const current=++job;
 controller=new AbortController();
 const {signal}=controller;
 const enabled=typeof Worker==='function'&&globalThis.navigator?.hardwareConcurrency>=2;
 const refinements=enabled?createPlanWorkerPool({signal}):null;
 try{
  const timings={};let phase,started;
  const onPhase=next=>{
   if(next==='diagnostics')refinements?.close();
   const now=performance.now();
   if(phase)timings[phase]=(timings[phase]||0)+(now-started);
   phase=next;started=now;
  };
  const runBatch=enabled?
   (batch,onProgress)=>runSeedWorkers(batch,{signal,onProgress}):null;
  const result=await recommendFinalPlan(data,chart,payload.states,payload.input,{session,onPhase,runSeeds:runBatch,runRefinements:refinements?.run,
   onPurchaseList:(stage,summary)=>{if(current===job)self.postMessage({type:'purchases',requestId,stage,summary});},
   cancelled:()=>current!==job,onProgress:progress=>{if(current===job)self.postMessage({type:'progress',requestId,progress});}});
  onPhase(null);
  if(current===job&&result)self.postMessage({type:'result',requestId,result,timings,cache:session.metrics});
 }catch(error){if(current===job)self.postMessage({type:'error',requestId,message:error.message,code:error.code??null,details:error.details??null});}
 finally{refinements?.close();}
};
