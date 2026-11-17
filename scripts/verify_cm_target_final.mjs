// Run the external audit first so this end-to-end check uses the same source.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {generateChart,prepareChart,sortChartRows} from '../assets/cm-chart.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {bulkAcquisition} from '../assets/cm-state.mjs';
import {TARGET_ACCELERATION_VERSION} from '../assets/cm-acceleration-plan.mjs';
import {EventConstraints} from '../assets/cm-event-constraints.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const targetVersion=TARGET_ACCELERATION_VERSION.replace('cm-target-acceleration-','');
const audit=read(`docs/validation/cm-acceleration-${targetVersion}-20261117/kyoto2200-leader.json`);
if(audit.dataVersion!==manifest.active_version)throw new Error('Run the external audit for the active dataset first');
for(const [path,hash] of Object.entries(audit.sourceHashes))if(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')!==hash)throw new Error('Run the external audit for the current source first: '+path);
const chart=await generateChart(data,profiles,display,audit.input),target=audit.plan;
chart.accelerationPlan=target;
const extra=target.ids.filter(id=>data.skills[id].inherited&&!chart.rows.some(row=>row.id===id));
if(extra.length){
 const task=prepareChart(data,profiles,display,audit.input);
 chart.rows=sortChartRows([...chart.rows,...task.rows.filter(row=>extra.includes(row.id)).map(row=>({...task.evaluate(row),targetInheritance:true}))],data,display);
}
chart.rows=chart.rows.map(row=>row.inherited&&target.ids.includes(row.id)?{...row,targetInheritance:true}:row);
const states=bulkAcquisition(chart.rows,{},'5'),actual={stats:{...chart.setup.stats},spBudget:7000,discountTrait:'none',aptitudes:{distance:'A',surface:'A',style:'S'},maintainTargetAcceleration:true};
// Model one actual event path, rather than recording all mutually exclusive
// rare hints as if the player had obtained every branch during training.
const acquiredRoutes=new EventConstraints(data,{...chart.setup,eventChoices:target.eventChoices});
for(const row of chart.rows)if(!acquiredRoutes.selection([row.id]))states[row.id]='unavailable';
const result=await recommendFinalPlan(data,chart,states,actual),inheritedIds=result.activeIds.filter(id=>data.skills[id].inherited);
if(inheritedIds.length>6||result.budget.used>7000||result.unavailableTargetIds.length||target.ids.some(id=>!result.activeIds.includes(id)))throw new Error('Target/final allocation verification failed');
const output={checkedAt:'2026-11-17',dataVersion:manifest.active_version,sourceHashes:audit.sourceHashes,input:audit.input,actual,recordedEventChoices:target.eventChoices,chartRowCount:chart.rows.length,target,acquisition:states,inheritedCount:inheritedIds.length,inheritedIds,...result};
writeFileSync(resolve(root,`docs/validation/cm-acceleration-${targetVersion}-7000-20261117.json`),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({budget:result.budget,inheritedCount:inheritedIds.length,targetCount:target.ids.length,maintainedTargetCount:result.maintainedTargetIds.length,gain:result.gain,hp:result.fullSpeedFeasible}));
