import {evaluateSeedBatch,createRefinementEvaluator,evaluateRefinements} from './cm-seed-evaluation.mjs';

let refinementEvaluator;
self.onmessage=({data})=>{
 const progress=completed=>self.postMessage({type:'progress',completed});
 let result;
 if(data.mode==='refinement'){
  refinementEvaluator??=createRefinementEvaluator(data);
  result=evaluateRefinements(refinementEvaluator,data,progress);
 }else result=evaluateSeedBatch(data,progress);
 self.postMessage({type:'result',...result});
};
