import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {acquisitionPlan} from '../assets/acquisition-plan.mjs';
import {buildCandidates} from '../assets/candidates.mjs';
const manifest=JSON.parse(readFileSync(new URL('../data/manifest.json',import.meta.url)));
const data=JSON.parse(readFileSync(new URL('../'+manifest.dataset_path,import.meta.url)));
const candidates=supportIds=>buildCandidates(data,{outfitId:'114101',bloom:5,supportIds});
const records=c=>new Map([...c.learned,...c.inheritance,...c.factorCandidates].map(s=>[s.id,s]));
test('the same chosen descent changes from factor preparation to its current support path',()=>{
 const missing=acquisitionPlan(data,records(candidates([])),['201342','201342']);
 assert.equal(missing.length,1);assert.equal(missing[0].key,'factor');assert.equal(missing[0].skills.length,1);
 const available=acquisitionPlan(data,records(candidates(['30023'])),['201342']);
 assert.equal(available.length,1);assert.equal(available[0].key,'support-30023');
 assert.equal(available[0].skills[0].name,'直滑降');assert.ok(!available.some(g=>g.key==='factor'));
});
test('inheritance preparation lists actual donor outfits once and native skills use their own route',()=>{
 const c=candidates([]),r=records(c),inherited=c.inheritance.find(s=>s.inheritance_outfit_ids.length),native=c.learned.find(s=>s.routes.some(r=>r.owner_type==='outfit'));
 const groups=acquisitionPlan(data,r,[inherited.id,native.id,inherited.id]);
 assert.equal(groups.reduce((n,g)=>n+g.skills.length,0),2);
 assert.ok(groups.find(g=>g.key==='inheritance').skills[0].detail.includes(' · '));
 assert.ok(groups.some(g=>g.key==='native'));
});
