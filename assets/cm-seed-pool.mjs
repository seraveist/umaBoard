// Each child serves one request. Publish results only after both batches finish.
export async function runSeedWorkers({plans,records,...config},{signal,onProgress,createWorker=()=>new Worker(new URL('./cm-seed-worker.mjs',import.meta.url),{type:'module'})}){
 if(signal.aborted)return null;
 const groups=[[],[]],completed=[0,0],workers=[];
 for(const [index,ids] of plans.entries())groups[index%2].push(ids);
 let abort;
 const stopped=new Promise(resolve=>{abort=()=>resolve(null);});
 signal.addEventListener('abort',abort,{once:true});
 try{
  const tasks=groups.map((batch,index)=>new Promise((resolve,reject)=>{
   const worker=createWorker();
   workers.push(worker);
   worker.onerror=event=>{event.preventDefault?.();reject(new Error('Seed worker failed'));};
   worker.onmessageerror=()=>reject(new Error('Seed worker result could not be read'));
   worker.onmessage=({data})=>{
    if(signal.aborted)return;
    if(data?.type==='progress'){
     completed[index]=data.completed;
     onProgress(completed[0]+completed[1],plans.length);
    }else if(data?.type==='result'&&data.scores instanceof Map){
     resolve(data);
    }else reject(new Error('Unexpected seed worker response'));
   };
   const ids=new Set([...config.baselineIds,...batch.flat()]);
   worker.postMessage({...config,plans:batch,skills:[...ids].map(id=>records.get(id))});
  }));
  const result=await Promise.race([Promise.all(tasks),stopped]);
  if(!result)return null;
  return {scores:new Map([...result[0].scores,...result[1].scores]),drawHits:result[0].drawHits+result[1].drawHits};
 }catch{
  // Worker construction, module loading or cloning can fail on this device.
  return null;
 }finally{
  signal.removeEventListener('abort',abort);
  for(const worker of workers){
   worker.onmessage=worker.onerror=worker.onmessageerror=null;
   worker.terminate();
  }
 }
}
