// Execute the browser module-worker entrypoints in Node for headless regression checks.
import {Worker,parentPort,workerData} from 'node:worker_threads';

export class WebModuleWorker{
 constructor(entry){
  this.thread=new Worker(new URL(import.meta.url),{workerData:{entry:String(entry)}});
  this.thread.on('message',data=>this.onmessage?.({data}));
  this.thread.on('messageerror',error=>this.onmessageerror?.(error));
  this.thread.on('error',error=>this.onerror?.(error));
 }
 postMessage(data){this.thread.postMessage(data);}
 terminate(){return this.thread.terminate();}
}

if(parentPort&&workerData?.entry){
 globalThis.Worker=WebModuleWorker;
 globalThis.self={postMessage:data=>parentPort.postMessage(data)};
 await import(workerData.entry);
 parentPort.on('message',data=>self.onmessage({data}));
}
