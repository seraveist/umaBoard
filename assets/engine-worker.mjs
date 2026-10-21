import {SkillOptimizer} from './skill-optimizer.mjs';
import {applyEngineAction} from './engine-actions.mjs';
import {recommendDecks} from './deck-optimizer.mjs';
let data,engine;
const baseKey=setup=>JSON.stringify({...setup,supportIds:undefined,scenarioId:undefined,spBudget:undefined,eventChoices:undefined,purchase:undefined});
self.onmessage=({data:message})=>{
 const {requestId,type,payload}=message;
 try{
  if(type==='load'){data=payload;self.postMessage({requestId,type:'loaded'});return;}
  if(type==='decks'){
   const plans=recommendDecks(data,payload.setup,payload.constraints);
   self.postMessage({requestId,type:'decks',plans});return;
  }
  if(type==='setup'){
   const previous=engine;engine=new SkillOptimizer(data,payload);
   if(previous&&baseKey(previous.setup)===baseKey(engine.setup)){
    engine.userDisabled=new Set([...previous.userDisabled].filter(id=>engine.records.has(id)));
    engine.objective=previous.objective;
    for(const id of previous.lockedIds)if(engine.records.has(id))engine.lock(id,true);
    engine.pendingOptimization=true;
   }
  }else if(type==='batch')for(const action of payload)applyEngineAction(engine,action);
  else applyEngineAction(engine,{type,...(type==='objective'?{value:payload}:payload)});
  self.postMessage({requestId,type:'result',result:engine.analyze()});
 }catch(error){self.postMessage({requestId,type:'error',message:error.message});}
};
