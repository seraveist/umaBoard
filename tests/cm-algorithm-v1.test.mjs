import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {CM_ALGORITHM} from '../assets/cm-algorithm-version.mjs';

test('public v1 is the frozen v11 calculation closure, with unchanged data and historical evidence',()=>{
 const report=JSON.parse(execFileSync(process.execPath,['scripts/check_cm_algorithm_v1.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8'}));
 assert.equal(report.status,'passed');assert.equal(report.calculationModules,30);assert.equal(report.verifiedHistoricalEvidence,10);assert.deepEqual(report.algorithm,CM_ALGORITHM);
});

test('public algorithm identity stays immutable and preserves numerical cache/model IDs',()=>{
 assert.equal(CM_ALGORITHM.version,'v1');assert.equal(CM_ALGORITHM.models.chart,'cm-first-chart-v11');assert.equal(CM_ALGORITHM.models.final,'cm-post-training-v11');
 assert.throws(()=>{CM_ALGORITHM.version='v2';},TypeError);assert.throws(()=>{CM_ALGORITHM.models.final='cm-post-training-v1';},TypeError);
 assert.deepEqual(JSON.parse(JSON.stringify(CM_ALGORITHM)),CM_ALGORITHM);
});
