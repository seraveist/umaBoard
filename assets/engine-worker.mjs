import {PreparationEngine} from './engine.mjs';
let data,engine;
const baseKey=setup=>JSON.stringify({...setup,supportIds:undefined,scenarioId:undefined});
self.onmessage=({data:message})=>{
 const {requestId,type,payload}=message;
 try{
  if(type==='load'){data=payload;self.postMessage({requestId,type:'loaded'});return;}
  if(type==='setup'){
   const previous=engine;engine=new PreparationEngine(data,payload);
   // Deck/scenario edits change acquisition routes, not the user's skill goals.
   if(previous&&baseKey(previous.setup)===baseKey(payload)){
    engine.userDisabled=new Set([...previous.userDisabled].filter(id=>engine.records.has(id)));
    engine.speedDisabled=new Set([...previous.speedDisabled].filter(id=>engine.records.has(id)));
    engine.selected=new Set(engine.normalize([...previous.selected,...engine.selected].filter(id=>engine.records.has(id)&&!engine.userDisabled.has(id))));
    engine.auto=previous.auto;engine.objective=previous.objective;
   }
  }
  else if(type==='toggle')engine.toggle(payload.id,payload.checked,payload.source);
  else if(type==='objective'){engine.objective=payload;engine.auto=true;engine.notice='';}
  else if(type==='auto'){engine.auto=true;engine.notice='';}
  self.postMessage({requestId,type:'result',result:engine.analyze()});
 }catch(error){self.postMessage({requestId,type:'error',message:error.message});}
};
