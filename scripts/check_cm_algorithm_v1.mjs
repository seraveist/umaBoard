import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CM_ALGORITHM} from '../assets/cm-algorithm-version.mjs';
import {CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {FINAL_MODEL_VERSION} from '../assets/cm-final-plan.mjs';
import {MODEL_VERSION} from '../assets/physics.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n'),json=p=>JSON.parse(read(p)),hash=t=>createHash('sha256').update(t).digest('hex');
const release=json('docs/validation/cm-optimization-v1-trigger-release-20261119.json'),models={chart:CM_MODEL_VERSION,final:FINAL_MODEL_VERSION,solo:MODEL_VERSION};
assert.deepEqual(CM_ALGORITHM,{id:release.id,version:release.version,revision:release.revision,name:release.name,models:release.models});assert.deepEqual(models,release.models);
assert.equal(hash(read(release.parentRelease.path)),release.parentRelease.textSha256,'Original release changed.');
const parent=json(release.parentRelease.path);
const parentHashes=new Map(parent.modules.map(file=>[file.path,file.textSha256]));
const changed=release.modules.filter(file=>parentHashes.get(file.path)!==file.textSha256).map(file=>file.path);
assert.deepEqual(changed,release.authorizedChanges);
for(const audit of [parent.priorAudit,release.priorAudit]){
 assert.equal(hash(read(audit.path)),audit.textSha256,'Historical audit changed: '+audit.path);
 for(const file of json(audit.path).sourceFiles)assert.equal(hash(read(file.path)),file.textSha256,'Historical audit evidence changed: '+file.path);
}
const seen=new Set();
function visit(path){if(seen.has(path))return;seen.add(path);for(const m of read(path).matchAll(/(?:from\s*|import\s*)['"]\.\/([^'"]+\.mjs)['"]/g))visit('assets/'+m[1]);}
release.entrypoints.forEach(visit);assert.deepEqual([...seen].sort(),release.modules.map(x=>x.path).sort(),'Calculation dependency closure changed.');
for(const file of release.modules)assert.equal(hash(read(file.path)),file.textSha256,'Frozen calculation changed: '+file.path);
assert.equal(hash(release.modules.map(x=>x.path+'\n'+x.textSha256+'\n').join('')),release.coreSha256);
assert.equal(hash(read(release.parentBaseline.path)),release.parentBaseline.textSha256,'Historical completion baseline changed.');
const baseline=json(release.parentBaseline.path),manifest=json('data/manifest.json');
const historicalInputs=baseline.inputs.filter(file=>file.path!=='data/manifest.json');
for(const file of [...historicalInputs,...baseline.evidence,...release.inputs])assert.equal(hash(read(file.path)),file.textSha256,'Frozen data/evidence changed: '+file.path);
assert.ok(release.inputs.some(file=>file.path===manifest.dataset_path&&file.textSha256===manifest.active_version));
assert.equal(manifest.calculation_status,baseline.data.calculationStatus);assert.equal(manifest.curation_status,baseline.data.curationStatus);assert.deepEqual(manifest.counts,baseline.data.counts);
// Only the reviewed event catalog changed. Keep old cards, skill prices and all other game inputs intact.
const {support_events:previousEvents,...previousData}=json('data/bundles/'+baseline.data.activeVersion+'/dataset.json');
const {support_events:currentEvents,...currentData}=json(manifest.dataset_path);
assert.deepEqual(currentData,previousData);
for(const [id,entry]of Object.entries(previousEvents))assert.deepEqual(currentEvents[id],entry);
assert.equal(Object.keys(currentEvents).length,74);
let stagedCalculationModules=0;
if(process.argv.includes('--build'))for(const file of release.modules){const staged=read('.cache/pages/'+file.path).replace(/(\.mjs)\?v=[0-9a-f]+(?=['"])/g,'$1');assert.equal(hash(staged),file.textSha256,'Published calculation differs beyond module cache version: '+file.path);stagedCalculationModules++;}
console.log(JSON.stringify({status:'passed',algorithm:CM_ALGORITHM,baseCommit:release.baseCommit,coreSha256:release.coreSha256,calculationModules:release.modules.length,unchangedParentModules:parent.modules.length-changed.length,stagedCalculationModules,lockedInputs:release.inputs.length+historicalInputs.length,verifiedHistoricalEvidence:baseline.evidence.length,scope:release.scope}));
