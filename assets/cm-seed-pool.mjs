// A pool belongs to a single recommendation. Related prefix and full-size
// evaluations of a plan stay on the same lane until the request finishes.
export function createPlanWorkerPool({signal,createWorker=()=>new Worker(new URL('./cm-seed-worker.mjs',import.meta.url),{type:'module'})}){
 const lanes=[null,null],owner=new Map();
 let closed=false,stopPending=null;
 function close(){
  closed=true;stopPending?.();owner.clear();
  for(const lane of lanes)if(lane){
   lane.worker.onmessage=lane.worker.onerror=lane.worker.onmessageerror=null;
   lane.worker.terminate();
  }
  lanes.fill(null);
 }
 async function run({plans,records,setup,baselineIds,nativeIds,...settings},onProgress){
  if(closed||signal.aborted)return null;
  const groups=[[],[]],completed=[0,0];
  for(const ids of plans){
   const key=ids.join(',');
   const index=owner.get(key)??(groups[0].length<=groups[1].length?0:1);
   owner.set(key,index);groups[index].push(ids);
  }
  let abort;
  const stopped=new Promise(resolve=>{abort=()=>resolve(null);});
  stopPending=abort;
  signal.addEventListener('abort',abort,{once:true});
  try{
   const tasks=groups.map((batch,index)=>new Promise((resolve,reject)=>{
    if(!batch.length){resolve({scores:new Map(),drawHits:0});return;}
    const fresh=!lanes[index];
    if(fresh)lanes[index]={worker:createWorker(),knownSkills:new Set()};
    const {worker,knownSkills}=lanes[index];
    worker.onerror=event=>{event.preventDefault?.();reject(new Error('Plan worker failed'));};
    worker.onmessageerror=()=>reject(new Error('Plan worker result could not be read'));
    worker.onmessage=({data})=>{
     if(signal.aborted)return;
     if(data?.type==='progress'){
      completed[index]=data.completed;onProgress(completed[0]+completed[1],plans.length);
     }else if(data?.type==='result'&&data.scores instanceof Map)resolve(data);
     else reject(new Error('Unexpected plan worker response'));
    };
    const skills=[];
    for(const id of new Set([...(baselineIds||[]),...batch.flat()]))if(!knownSkills.has(id)){
     skills.push(records.get(id));knownSkills.add(id);
    }
    worker.postMessage({...settings,...(fresh?{setup,baselineIds,nativeIds}:{}),plans:batch,skills});
   }));
   const results=await Promise.race([Promise.all(tasks),stopped]);
   if(!results){close();return null;}
   const [first,second]=results;
   return {scores:new Map([...first.scores,...second.scores]),drawHits:first.drawHits+second.drawHits,
    ...(settings.mode==='refinement'?{prefixHits:(first.prefixHits??0)+(second.prefixHits??0)}:{})};
  }catch{
   close();return null;
  }finally{
   stopPending=null;signal.removeEventListener('abort',abort);
   for(const lane of lanes)if(lane)lane.worker.onmessage=lane.worker.onerror=lane.worker.onmessageerror=null;
  }
 }
 return {run,close};
}

export async function runSeedWorkers(batch,{onProgress,...options}){
 const pool=createPlanWorkerPool(options);
 try{return await pool.run(batch,onProgress);}finally{pool.close();}
}
