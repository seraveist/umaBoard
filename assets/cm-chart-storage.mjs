// Only the most recently completed chart is retained on this device.
export async function openChartStorage(){
 const db=await new Promise(resolve=>{
  const request=indexedDB.open('umaboard-cm-chart',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('charts');
  request.onerror=request.onblocked=()=>resolve(null);
  request.onsuccess=()=>resolve(request.result);
 }).catch(()=>null);
 if(!db)return null;
 db.onversionchange=()=>db.close();
 return {
  async read(key){
   return new Promise(resolve=>{
    const request=db.transaction('charts').objectStore('charts').get('latest');
    request.onsuccess=()=>resolve(request.result?.key===key?request.result.chart:null);
    request.onerror=()=>resolve(null);
   }).catch(()=>null);
  },
  async write(key,chart){
   return new Promise(resolve=>{
    const tx=db.transaction('charts','readwrite');
    tx.oncomplete=()=>resolve(true);
    tx.onerror=tx.onabort=()=>resolve(false);
    tx.objectStore('charts').put({key,chart},'latest');
   }).catch(()=>false);
  }
 };
}

export async function chartCatalogVersion(dataVersion,profiles,display,moduleUrl){
 const build=new URL(moduleUrl).searchParams.get('v');
 if(!build||!dataVersion)return null;
 const contents=new TextEncoder().encode(JSON.stringify([profiles,display]));
 const digest=await crypto.subtle.digest('SHA-256',contents);
 return [build,dataVersion,...new Uint8Array(digest)].join(':');
}
