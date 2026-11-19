import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CM_ALGORITHM} from '../assets/cm-algorithm-version.mjs';
import {CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {FINAL_MODEL_VERSION} from '../assets/cm-final-plan.mjs';
import {MODEL_VERSION} from '../assets/physics.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n'),json=p=>JSON.parse(read(p)),hash=t=>createHash('sha256').update(t).digest('hex');
const release=json('docs/validation/cm-optimization-v1-6-4-release-20261119.json'),models={chart:CM_MODEL_VERSION,final:FINAL_MODEL_VERSION,solo:MODEL_VERSION};
assert.deepEqual(CM_ALGORITHM,{id:release.id,version:release.version,revision:release.revision,patch:release.patch,name:release.name,models:release.models});assert.deepEqual(models,release.models);
assert.equal(hash(read(release.parentRelease.path)),release.parentRelease.textSha256,'Original release changed.');
const parent=json(release.parentRelease.path);
const parentHashes=new Map(parent.modules.map(file=>[file.path,file.textSha256]));
const changed=release.modules.filter(file=>parentHashes.get(file.path)!==file.textSha256).map(file=>file.path);
assert.deepEqual(changed,release.authorizedChanges);
let history=release;
const verifiedAudits=new Set();
while(history.priorAudit){
 const audit=history.priorAudit;
 if(!verifiedAudits.has(audit.path)){
  assert.equal(hash(read(audit.path)),audit.textSha256,'Historical audit changed: '+audit.path);
  for(const file of json(audit.path).sourceFiles)assert.equal(hash(read(file.path)),file.textSha256,'Historical audit evidence changed: '+file.path);
  verifiedAudits.add(audit.path);
 }
 if(!history.parentRelease)break;
 const previous=history.parentRelease;
 assert.equal(hash(read(previous.path)),previous.textSha256,'Historical release changed: '+previous.path);
 history=json(previous.path);
}
for(const file of release.reviewEvidence)assert.equal(hash(read(file.path)),file.textSha256,'Release review evidence changed: '+file.path);
const seen=new Set();
function visit(path){if(seen.has(path))return;seen.add(path);for(const m of read(path).matchAll(/(?:from\s*|import\s*)['"]\.\/([^'"]+\.mjs)['"]/g))visit('assets/'+m[1]);}
release.entrypoints.forEach(visit);assert.deepEqual([...seen].sort(),release.modules.map(x=>x.path).sort(),'Calculation dependency closure changed.');
for(const file of release.modules)assert.equal(hash(read(file.path)),file.textSha256,'Frozen calculation changed: '+file.path);
assert.equal(hash(release.modules.map(x=>x.path+'\n'+x.textSha256+'\n').join('')),release.coreSha256);
assert.equal(hash(read(release.parentBaseline.path)),release.parentBaseline.textSha256,'Historical completion baseline changed.');
const baseline=json(release.parentBaseline.path),manifest=json('data/manifest.json');
const historicalInputs=baseline.inputs.filter(file=>file.path!=='data/manifest.json');
for(const file of [...historicalInputs,...baseline.evidence,...release.inputs])assert.equal(hash(read(file.path)),file.textSha256,'Frozen data/evidence changed: '+file.path);
// The launch reference and audit evidence are immutable. Daily JP data has its own content address.
const launch=json(release.inputs[0].path);
assert.ok(release.inputs.some(file=>file.path===launch.dataset_path&&file.textSha256===launch.active_version));
assert.match(manifest.active_version,/^[0-9a-f]{64}$/);
assert.equal(manifest.dataset_path,'data/bundles/'+manifest.active_version+'/dataset.json');
assert.equal(hash(read(manifest.dataset_path)),manifest.active_version,'Active JP content differs from the pointer.');
const live=json(manifest.dataset_path);
for(const [category,count] of Object.entries(manifest.counts))assert.equal(Object.keys(live[category]).length,count,category);
let stagedCalculationModules=0;
if(process.argv.includes('--build'))for(const file of release.modules){const staged=read('.cache/pages/'+file.path).replace(/(\.mjs)\?v=[0-9a-f]+(?=['"])/g,'$1');assert.equal(hash(staged),file.textSha256,'Published calculation differs beyond module cache version: '+file.path);stagedCalculationModules++;}
console.log(JSON.stringify({status:'passed',algorithm:CM_ALGORITHM,baseCommit:release.baseCommit,coreSha256:release.coreSha256,calculationModules:release.modules.length,unchangedParentModules:release.modules.filter(f=>parentHashes.get(f.path)===f.textSha256).length,stagedCalculationModules,lockedInputs:release.inputs.length+historicalInputs.length,verifiedHistoricalEvidence:baseline.evidence.length,scope:release.scope}));
