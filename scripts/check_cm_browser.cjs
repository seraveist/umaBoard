// Run against the staged Pages site. Real module workers and normal UI submission
// are used throughout. The only seeded state is a player's saved input.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
const read = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const out = '.cache/cm-browser';
const storageKey = 'umaboard-cm-workspace-v1';

async function main() {
  fs.mkdirSync(out, {recursive:true});
  const manifest = read('data/manifest.json');
  const data = read(manifest.dataset_path);
  const profiles = read('curated/cm-scenario-profiles.json');
  const {prepareChart} = await import('../assets/cm-chart.mjs');
  const {checklistPlanKey} = await import('../assets/cm-plan-storage.mjs');
  const {createAcquisitionConstraints} = await import('../assets/acquisition-constraints.mjs');
  const input = {outfitId:'101301', bloom:5, uniqueLevel:6, style:2, courseId:'10808',
    going:1, weather:2, season:3, time:2, scenarioId:'15', supportIds:['30275','30311','30300','30322','30289','30323']};
  const task = prepareChart(data, profiles, {}, input);
  const constraints = createAcquisitionConstraints(data, task.setup);
  const states = {'201312':'owned','201311':'5'};
  const gold = [];
  const small = process.env.CM_SMALL_BROWSER_CHECK === '1';
  for (const row of task.rows) {
    if (row.id in states || row.inherited || row.rarity === 'evolution') continue;
    if (small && Object.keys(states).length >= 6) break;
    if (row.rarity === 'gold') {
      if (!constraints.allowed([...gold,row.id])) continue;
      gold.push(row.id);
    }
    states[row.id] = '5';
  }
  const stats = profiles.profiles['15'].stats;
  const values = {stats, aptitudes:{distance:'A',surface:'A',style:'S'}, spBudget:7000,discountTrait:'none'};
  const launch = read('docs/validation/cm-launch-manifest-20261119.json');
  const key = checklistPlanKey(input,small ? manifest.checklist_data_sha256 : launch.checklist_data_sha256);
  const draft = {setup:input,roster:{[input.outfitId]:{bloom:5,uniqueLevel:6}},plans:{[key]:{states,postTraining:{values},savedAt:'2026-11-19T00:00:00Z'}}};
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.addInitScript(({key,draft}) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(draft));
  }, {key:storageKey,draft});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  const metrics = {browser:browser.version(),viewport:[390,844],dataVersion:manifest.active_version,recorded:Object.keys(states).length,small};
  async function waitResult(selector,errorSelector,timeout) {
    await page.waitForFunction(([selector,err])=>{
      const error=document.querySelector(err);
      if (error && !error.hidden && error.textContent.trim() && error.classList.contains('is-error')) throw Error(error.textContent);
      return !document.querySelector(selector).disabled;
    },[selector,errorSelector],{timeout});
  }
  try {
    await page.goto(process.env.CM_BROWSER_URL || 'http://127.0.0.1:8177/');
    await page.locator('#generate').waitFor();
    let start=Date.now();
    await page.locator('#generate').click();
    await waitResult('#stage-finish','#cm-notice',18*60*1000);
    metrics.chartSeconds=(Date.now()-start)/1000;
    assert.equal(await page.locator('#target-acceleration').isVisible(),true);
    await page.screenshot({path:path.join(out,'chart.png')});
    await page.locator('#stage-finish').click();
    assert.equal(await page.locator('#actual-sp').inputValue(),'7000');
    assert.equal(await page.locator('#actual-speed').inputValue(),String(stats.speed));
    assert.equal(await page.locator('select[data-skill-id="201312"]').inputValue(),'owned');
    assert.equal(await page.locator('#maintain-target').isChecked(),true);
    assert.equal(await page.locator('#maintain-strategy').isChecked(),true);
    await page.evaluate(()=>{document.querySelector('#final-submit').click();document.querySelector('#final-cancel').click();});
    assert.equal(await page.locator('#final-form').getAttribute('aria-busy'),'false');
    assert.equal(await page.locator('#final-export').isDisabled(),true);
    start=Date.now();
    await page.locator('#final-submit').click();
    await page.waitForFunction(()=>{
      const err=document.querySelector('#final-error');
      if (!err.hidden && err.textContent.trim()) throw Error(err.textContent);
      return !document.querySelector('#final-export').disabled;
    },null,{timeout:38*60*1000});
    metrics.recommendSeconds=(Date.now()-start)/1000;
    const download=page.waitForEvent('download');
    await page.locator('#final-export').click();
    const file=await (await download).path(),plan=read(file);
    assert.equal(plan.dataVersion,manifest.active_version);
    assert.ok(plan.acquisitionValidation.feasible && plan.scenarioCoverage.complete);
    assert.ok(plan.ownedIds.includes('201312'));
    assert.ok(plan.budget.used<=7000 && plan.budget.used>0);
    assert.ok(plan.search.approximation.knownMeanLoss<=.1+1e-10);
    assert.equal(plan.purchases.reduce((total,row)=>total+row.cost,0),plan.budget.used);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(out,'recommendation.png')});
    Object.assign(metrics,{model:plan.modelVersion,samples:plan.sampling.count,usedSP:plan.budget.used,gain:plan.gain,hpSuccesses:plan.hpSuccesses,observedCompressionLoss:plan.search.approximation.knownMeanLoss,status:'passed'});
  } catch (error) {
    await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
    metrics.error=String(error); metrics.pageErrors=errors;
    console.error(await page.locator('#cm-notice,#final-error,#progress-label,#progress-count').allTextContents());
    throw error;
  } finally {
    fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2)+'\n');
    console.log(JSON.stringify(metrics));
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
