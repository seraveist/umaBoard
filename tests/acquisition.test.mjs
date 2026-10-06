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
 assert.deepEqual(missing.map(g=>g.key),['ordinary','inheritance']);assert.equal(missing[0].skills.length,1);
 assert.equal(missing[0].skills[0].pathKind,'factor');assert.equal(missing[0].skills[0].detail,'인자');
 const available=acquisitionPlan(data,records(candidates(['30023'])),['201342']);
 assert.equal(available[0].skills[0].pathKind,'available');assert.equal(available[0].skills[0].detail,'라이스 샤워 · 스태미나');
 assert.equal(available[0].skills[0].name,'直滑降');assert.equal(available[0].skills[0].category,'acceleration');
});
test('inheritance preparation lists actual donor outfits once and native skills use their own route',()=>{
 const c=candidates([]),r=records(c),inherited=c.inheritance.find(s=>s.inheritance_outfit_ids.length),native=c.learned.find(s=>s.routes.some(r=>r.owner_type==='outfit'));
 const groups=acquisitionPlan(data,r,[inherited.id,native.id,inherited.id]);
 assert.equal(groups.reduce((n,g)=>n+g.skills.length,0),2);
 assert.ok(groups.find(g=>g.key==='inheritance').skills[0].detail.includes(' · '));
 assert.equal(groups[0].skills.find(s=>s.id===native.id).detail,'본체');
});
test('all support alternatives share one row and mixed skills belong to acceleration once',()=>{
 const supports={a:{name_ko:'토카이 테이오',type:'Speed'},b:{name_ko:'에프포리아',type:'Speed'}};
 const records=new Map([['s',{id:'s',name_jp:'先行直線○',rarity:'white',categories:['speed'],routes:[{owner_type:'support',owner_id:'a'},{owner_type:'support',owner_id:'b'},{owner_type:'support',owner_id:'a'}]}],
  ['mixed',{id:'mixed',name_jp:'복합',rarity:'evolution',categories:['speed','acceleration'],routes:[{owner_type:'outfit',owner_id:'uma'}]}]]);
 const groups=acquisitionPlan({supports},records,['mixed','s','mixed']);
 assert.equal(groups[0].skills.length,2);assert.equal(groups[0].skills[0].detail,'토카이 테이오 · 스피드, 에프포리아 · 스피드');
 assert.equal(groups[0].skills[1].category,'acceleration');assert.equal(groups[0].skills[1].compound,true);assert.equal(groups[0].skills[1].rarity,'evolution');
});
