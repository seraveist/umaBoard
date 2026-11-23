import {evaluateSeedBatch} from './cm-seed-evaluation.mjs';

self.onmessage=({data})=>{
 const result=evaluateSeedBatch(data,completed=>self.postMessage({type:'progress',completed}));
 self.postMessage({type:'result',...result});
};
