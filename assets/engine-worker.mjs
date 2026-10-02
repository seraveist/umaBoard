import {PreparationEngine} from './engine.mjs';
let data,engine;
self.onmessage=({data:message})=>{
 const {requestId,type,payload}=message;
 try{
  if(type==='load'){data=payload;self.postMessage({requestId,type:'loaded'});return;}
  if(type==='setup')engine=new PreparationEngine(data,payload);
  else if(type==='toggle')engine.toggle(payload.id,payload.checked,payload.source);
  else if(type==='objective'){engine.objective=payload;engine.auto=true;}
  else if(type==='auto')engine.auto=true;
  self.postMessage({requestId,type:'result',result:engine.analyze()});
 }catch(error){self.postMessage({requestId,type:'error',message:error.message});}
};
