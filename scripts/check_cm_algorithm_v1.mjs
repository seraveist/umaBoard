// Verify the authorized search revision, preserving the original release,
// its common physics, source data and historical evidence byte-for-byte.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CM_ALGORITHM} from '../assets/cm-algorithm-version.mjs';
import {CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {FINAL_MODEL_VERSION} from '../assets/cm-final-plan.mjs';
import {MODEL_VERSION} from '../assets/physics.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n'),json=p=>JSON.parse(read(p)),hash=t=>createHash('sha256').update(t).digest('hex');
const release=json('docs/validation/cm-optimization-v1-tolerance-release-20261118.json'),models={chart:CM_MODEL_VERSION,final:FINAL_MODEL_VERSION,solo:MODEL_VERSION};
assert.deepEqual(CM_ALGORITHM,{id:release.id,version:release.version,revision:release.revision,name:release.name,models:release.models});assert.deepEqual(models,release.models);
assert.equal(hash(read(release.parentRelease.path)),release.parentRelease.textSha256,'Original release changed.');
const parent=json(release.parentRelease.path);
assert.deepEqual(release.authorizedChanges,['assets/cm-final-plan.mjs','assets/cm-plan-compression.mjs']);
const changed=new Set(release.authorizedChanges);
for(const file of parent.modules)if(!changed.has(file.path))assert.equal(hash(read(file.path)),file.textSha256,'Common physics changed: '+file.path);
assert.equal(hash(read(release.priorAudit.path)),release.priorAudit.textSha256,'Original self-audit changed.');
for(const file of json(release.priorAudit.path).sourceFiles)assert.equal(hash(read(file.path)),file.textSha256,'Original self-audit evidence changed: '+file.path);
const seen=new Set();
function visit(path){if(seen.has(path))return;seen.add(path);for(const m of read(path).matchAll(/(?:from\s*|import\s*)['"]\.\/([^'"]+\.mjs)['"]/g))visit('assets/'+m[1]);}
release.entrypoints.forEach(visit);assert.deepEqual([...seen].sort(),release.modules.map(x=>x.path).sort(),'Calculation dependency closure changed.');
for(const file of release.modules)assert.equal(hash(read(file.path)),file.textSha256,'Frozen calculation changed: '+file.path);
assert.equal(hash(release.modules.map(x=>x.path+'\n'+x.textSha256+'\n').join('')),release.coreSha256);
assert.equal(hash(read(release.parentBaseline.path)),release.parentBaseline.textSha256,'Historical completion baseline changed.');
const baseline=json(release.parentBaseline.path),manifest=json('data/manifest.json');
for(const file of [...baseline.inputs,...baseline.evidence])assert.equal(hash(read(file.path)),file.textSha256,'Frozen data/evidence changed: '+file.path);
assert.equal(manifest.active_version,baseline.data.activeVersion);assert.equal(manifest.calculation_status,baseline.data.calculationStatus);assert.equal(manifest.curation_status,baseline.data.curationStatus);assert.deepEqual(manifest.counts,baseline.data.counts);
let stagedCalculationModules=0;
if(process.argv.includes('--build'))for(const file of release.modules){const staged=read('.cache/pages/'+file.path).replace(/(\.mjs)\?v=[0-9a-f]+(?=['"])/g,'$1');assert.equal(hash(staged),file.textSha256,'Published calculation differs beyond module cache version: '+file.path);stagedCalculationModules++;}
console.log(JSON.stringify({status:'passed',algorithm:CM_ALGORITHM,baseCommit:release.baseCommit,coreSha256:release.coreSha256,calculationModules:release.modules.length,unchangedParentModules:parent.modules.length-1,unchangedPhysicsModules:29,stagedCalculationModules,lockedInputs:baseline.inputs.length,verifiedHistoricalEvidence:baseline.evidence.length,scope:'authorized tolerance/compression revision; common physics, source data and historical evidence unchanged'}));
