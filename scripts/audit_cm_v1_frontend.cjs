// Real Chrome + production Pages build. Uses an isolated profile and real workers.
// Install Playwright in .cache/browser-check, or set PLAYWRIGHT_MODULE explicitly.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(root,'.cache/browser-check/node_modules/playwright'));
const base=process.env.CM_BROWSER_URL||'http://127.0.0.1:8177/';
const output='docs/validation/cm-optimization-v1-frontend-20261118.json',checks=[],errors=[];
const record={date:'2026-11-18 Asia/Seoul',status:'running',base,checks,errors,
 scope:'Production Pages modules, real chart/final workers at 144 samples and 0.01s; isolated legacy draft; read-only worker-message observation, no mocked calculation or changed search options'};
async function check(name,fn){await fn();checks.push({name,status:'passed'});console.log(name);}
async function downloadJson(page,selector,name){const event=page.waitForEvent('download');await page.locator(selector).click();const item=await event,file=path.join(root,'.cache',name);await item.saveAs(file);return JSON.parse(fs.readFileSync(file,'utf8'));}
async function ready(page){await page.waitForFunction(()=>!document.querySelector('#stage-finish').disabled,null,{timeout:300000});}
async function run(){
 const source=read('docs/validation/cm-v11-candidates-20261118.json'),fixture=source.plans.find(r=>r.actual.stats.stamina===1800),manifest=read('data/manifest.json'),release=read('docs/validation/cm-optimization-v1-release-20261118.json');
 const {checklistPlanKey}=await import(pathToFileURL(path.join(root,'assets/cm-plan-storage.mjs'))),i=fixture.input;
 const setup={raceContext:{postNumber:null,popularity:null},outfitId:i.outfitId,bloom:5,uniqueLevel:6,style:i.style,courseId:i.courseId,going:i.going,weather:i.weather,season:i.season,time:i.time,scenarioId:i.scenarioId,supportIds:i.supportIds};
 const key=checklistPlanKey(setup,manifest.checklist_data_sha256||manifest.active_version),draft={setup,roster:{[i.outfitId]:{bloom:5,uniqueLevel:6}},plans:{[key]:{states:{[fixture.id]:'2'},postTraining:{values:fixture.actual},savedAt:'2026-11-18T00:00:00.000Z'}}};
 const browser=await chromium.launch({channel:'chrome',headless:true});record.browser=browser.version();record.algorithm={id:release.id,version:release.version,coreSha256:release.coreSha256};
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(value=>{
  if(!localStorage.getItem('umaboard-cm-workspace-v1'))localStorage.setItem('umaboard-cm-workspace-v1',JSON.stringify(value));
  const NativeWorker=Worker;window.__auditResults=[];window.__auditRequests=[];
  window.Worker=class extends NativeWorker{
   constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.type==='result')window.__auditResults.push({url:String(args[0]),requestId:data.requestId,result:data.result});});}
   postMessage(...args){if(['generate','recommend'].includes(args[0]?.type))window.__auditRequests.push({type:args[0].type,requestId:args[0].requestId});return super.postMessage(...args);}
  };
 },draft);
 try{
  await page.goto(base,{waitUntil:'networkidle'});
  await check('initial release label, legacy setup, empty and locked post-training',async()=>{
   assert.equal(await page.locator('#algorithm-version').textContent(),'최적화 알고리즘 v1');assert.equal(await page.locator('#stage-finish').isDisabled(),true);assert.equal(await page.locator('#scenario').inputValue(),i.scenarioId);assert.equal(await page.locator('#course').inputValue(),i.courseId);assert.equal(await page.locator('#export-checklist').isDisabled(),true);
   await page.screenshot({path:path.join(root,'docs/images/cm-v1-ui-desktop.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(root,'docs/images/cm-v1-ui-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});
  });
  await check('chart cancel and setup edits reject obsolete requests',async()=>{
   await page.evaluate(()=>{document.querySelector('#generate').click();document.querySelector('#cancel-calculation').click();});
   await page.waitForTimeout(250);assert.equal(await page.locator('#stage-finish').isDisabled(),true);assert.equal(await page.locator('#export-checklist').isDisabled(),true);assert.equal(await page.locator('#generate').isEnabled(),true);
  });
  await page.locator('#generate').click();console.log('real production chart running');await ready(page);
  // JSON downloads canonically serialize -0 as 0 and omit undefined fields.
  const chart=await downloadJson(page,'#export-checklist','cm-v1-chart-export.json'),workerChart=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__auditResults.findLast(x=>x.url.includes('cm-worker.mjs')).result)));
  await check('chart download preserves real worker scores, states, HP and probability metadata',async()=>{
   assert.equal(chart.algorithm.version,'v1');assert.deepEqual(chart.algorithm.models,release.models);assert.equal(chart.modelVersion,release.models.chart);assert.equal(chart.dataVersion,manifest.active_version);
   const originals=new Map([...workerChart.rows,...workerChart.inheritanceOptions].map(row=>[row.id,row]));assert.equal(chart.skills.length,originals.size);
   for(const row of chart.skills){const source=originals.get(row.id);for(const field of ['gain','robustGain','calculationState','hpSuccessRate','hpShortfall','activationRate','usefulAccelerationRate','sampling','performance','scenarioCoverage'])assert.deepEqual(row[field],source[field],row.id+' '+field);}
   assert.equal(chart.skills.find(row=>row.id===fixture.id).calculationState,'inactive');assert.equal(chart.acquisition[fixture.id],'2');record.chart={model:chart.modelVersion,rows:workerChart.rows.length,exportedRows:chart.skills.length,recordedStatSkill:fixture.id,chartState:chart.skills.find(row=>row.id===fixture.id).calculationState};
  });
  await page.locator('#stage-finish').click();
  await check('restored actual stats, hints and accessible validation',async()=>{
   assert.equal(await page.locator('#actual-stamina').inputValue(),'1800');assert.equal(await page.locator(`select[data-skill-id="${fixture.id}"]`).inputValue(),'2');
   await page.locator('#actual-speed').fill('');await page.locator('#final-submit').click();assert.equal(await page.locator('#actual-speed').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#actual-speed').getAttribute('aria-describedby'),'final-error');assert.equal(await page.locator('#actual-speed').evaluate(el=>el===document.activeElement),true);assert.match(await page.locator('#final-error').textContent(),/1~3000/);
   await page.locator('#actual-speed').fill(String(fixture.actual.stats.speed));assert.equal(await page.locator('#actual-speed').getAttribute('aria-invalid'),null);
  });
  await check('recommendation cancellation keeps records and rejects late completion',async()=>{
   await page.evaluate(()=>{document.querySelector('#final-submit').click();document.querySelector('#final-cancel').click();});await page.waitForTimeout(250);assert.equal(await page.locator('#final-export').isDisabled(),true);assert.equal(await page.locator('#final-form').getAttribute('aria-busy'),'false');assert.equal(await page.locator(`select[data-skill-id="${fixture.id}"]`).inputValue(),'2');
  });
  await page.locator('#final-submit').dblclick();await page.waitForFunction(()=>!document.querySelector('#final-export').disabled,null,{timeout:120000});
  const plan=await downloadJson(page,'#final-export','cm-v1-plan-export.json'),workerPlan=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__auditResults.findLast(x=>x.url.includes('cm-final-worker.mjs')).result)));
  await check('unchanged archived recommendation, complete export and no duplicate submit',async()=>{
   const {schemaVersion,dataVersion,createdAt,algorithm,...numeric}=plan;assert.deepEqual(numeric,workerPlan);assert.equal(algorithm.version,'v1');assert.deepEqual(algorithm.models,release.models);assert.equal(dataVersion,manifest.active_version);assert.ok(Math.abs(plan.gain-fixture.current.gain)<1e-10);assert.deepEqual(plan.activeIds,fixture.current.selectedIds);assert.equal(plan.budget.used,fixture.current.budget.used);assert.equal(plan.hpSuccessRate,fixture.current.hpSuccessRate);
   assert.equal(await page.locator('#final-used').textContent(),'144');assert.equal(await page.locator('#final-gain').textContent(),'+0.15');assert.match(await page.locator('#final-hp-note').textContent(),new RegExp(`${plan.hpSuccesses} / ${plan.sampling.count}`));assert.equal(await page.locator('#final-inputs').getAttribute('open'),null);assert.equal(await page.evaluate(()=>window.__auditRequests.filter(r=>r.type==='recommend').length),2);
   record.recommendation={gain:plan.gain,budget:plan.budget,selectedIds:plan.activeIds,hpSuccessRate:plan.hpSuccessRate,activationRates:plan.activationRates,usefulAccelerationRates:plan.usefulAccelerationRates,exactArchivedGain:plan.gain===fixture.current.gain,workerExportEqual:true};
   await page.screenshot({path:path.join(root,'docs/images/cm-v1-ui-result-desktop.png'),fullPage:true});
  });
  await check('mobile panels, keyboard navigation and one shared checklist',async()=>{
   await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#post-view-result').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#post-result-panel').isVisible(),true);assert.equal(await page.locator('#finish-checklist-slot').isVisible(),false);assert.equal(await page.locator('#checklist').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(root,'docs/images/cm-v1-ui-result-mobile.png'),fullPage:true});
   await page.locator('#post-view-result').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#post-view-record').getAttribute('aria-selected'),'true');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#post-view-result').getAttribute('aria-selected'),'true');
  });
  await check('search, view changes and popup dismissal do not recalculate or lose hints',async()=>{
   await page.locator('#post-view-record').click();const before=await page.evaluate(()=>window.__auditRequests.length);await page.locator('#skill-search').fill('no-such-skill-87531');assert.equal(await page.locator('#no-results').isVisible(),true);await page.locator('#clear-skill-search').click();assert.equal(await page.locator(`select[data-skill-id="${fixture.id}"]`).inputValue(),'2');assert.equal(await page.evaluate(()=>window.__auditRequests.length),before);
   await page.locator('#final-inputs>summary').click();await page.locator('#discount-trait').focus();await page.keyboard.press('Space');await page.keyboard.press('Escape');assert.equal(await page.locator('#discount-trait').inputValue(),'none');
  });
  await check('actual input edits invalidate export and never trigger automatic recommendation',async()=>{
   const before=await page.evaluate(()=>window.__auditRequests.length);await page.locator('#actual-sp').fill('201');assert.equal(await page.locator('#final-export').isDisabled(),true);assert.equal(await page.locator('#final-result-state').textContent(),'재추천 필요');assert.equal(await page.locator('#final-submit').textContent(),'다시 추천');assert.equal(await page.evaluate(()=>window.__auditRequests.length),before);await page.locator('#actual-sp').fill('200');
  });
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#stage-finish').isDisabled(),true);await page.locator('#generate').click();console.log('reload regeneration running');await ready(page);await page.locator('#stage-finish').click();
  await check('reload and explicit regeneration restore inputs and acquisition without restoring old recommendations',async()=>{
   assert.equal(await page.locator('#actual-stamina').inputValue(),'1800');assert.equal(await page.locator('#actual-sp').inputValue(),'200');assert.equal(await page.locator(`select[data-skill-id="${fixture.id}"]`).inputValue(),'2');assert.equal(await page.locator('#final-export').isDisabled(),true);assert.equal(await page.evaluate(()=>window.__auditRequests.filter(r=>r.type==='recommend').length),0);
   await page.locator(`select[data-skill-id="${fixture.id}"]`).selectOption('3');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('umaboard-cm-workspace-v1')));assert.equal(saved.plans[key].states[fixture.id],'3');assert.equal(Number(saved.plans[key].postTraining.values.stats.stamina),1800);
  });
  await check('changed race setup blocks first-chart download and post-training',async()=>{
   await page.locator('#stage-prepare').click();await page.locator('#weather').selectOption('2');assert.equal(await page.locator('#export-checklist').isDisabled(),true);assert.equal(await page.locator('#stage-finish').isDisabled(),true);assert.equal(await page.locator('#workspace').getAttribute('data-chart-state'),'stale');
  });
  const failure=await browser.newContext(),failedPage=await failure.newPage();await failedPage.route('**/data/manifest.json',route=>route.abort());
  await check('data loading failure keeps calculations unavailable and explains recovery',async()=>{
   await failedPage.goto(base,{waitUntil:'networkidle'});assert.equal(await failedPage.locator('#generate').isDisabled(),true);assert.match(await failedPage.locator('#cm-notice').textContent(),/데이터를 불러오지 못/);
  });await failure.close();
  const storage=await browser.newContext(),storagePage=await storage.newPage();await storage.addInitScript(value=>{localStorage.setItem('umaboard-cm-workspace-v1',JSON.stringify(value));Storage.prototype.setItem=function(){throw new DOMException('test quota','QuotaExceededError');};},draft);
  await check('storage failure is visible and preserves ability to calculate',async()=>{
   await storagePage.goto(base,{waitUntil:'networkidle'});await storagePage.locator('#weather').selectOption('2');assert.match(await storagePage.locator('#cm-notice').textContent(),/저장하지 못/);assert.equal(await storagePage.locator('#generate').isEnabled(),true);
  });await storage.close();assert.deepEqual(errors,[]);record.status='passed';
 }catch(error){record.status='failed';record.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(root,output),JSON.stringify(record,null,2)+'\n');await browser.close();}
 console.log(JSON.stringify({status:record.status,checks:checks.length,errors,output}));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
