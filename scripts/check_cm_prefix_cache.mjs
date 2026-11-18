// Compare every returned evaluation field with the archived v13 evaluator,
// independently of the new evaluator's cache-disabled implementation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {prepareChart,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {createFinalSetup} from '../assets/cm-final-plan.mjs';
import {buildAcquisitionHierarchy} from '../assets/cm-state.mjs';
import {activeSkillIds} from '../assets/skill-context.mjs';
import {inheritanceOrigins} from '../assets/skill-transforms.mjs';
import {contextDomains} from '../assets/race-scenarios.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),hash=s=>createHash('sha256').update(s).digest('hex');
const referencePath='assets/race-evaluation.mjs',referenceRelease=read('docs/validation/cm-optimization-v1-tolerance-release-20261118.json');
let source=execFileSync('git',['show','baa9d98:'+referencePath],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
const oldPlan=execFileSync('git',['show','baa9d98:assets/cm-final-plan.mjs'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'),newPlan=fs.readFileSync(new URL('assets/cm-final-plan.mjs',root),'utf8').replace(/\r\n/g,'\n'),contracts=text=>text.slice(text.indexOf('export function createFinalSetup'),text.indexOf('export async function recommendFinalPlan'));
assert.equal(contracts(newPlan),contracts(oldPlan));const setupPricingSha256=hash(contracts(newPlan));
const referenceSha256=hash(source);assert.equal(referenceSha256,referenceRelease.modules.find(f=>f.path===referencePath).textSha256);
source=source.replace(/from '\.\/([^']+)'/g,(_,path)=>`from '${new URL('assets/'+path,root).href}'`);
const Reference=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).RaceEvaluator;
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),hierarchy=buildAcquisitionHierarchy(data),graph=Object.fromEntries([...hierarchy.lower].map(([id,low])=>[id,[...low]]));
const records=[];
for(const key of ['mile','classic','long','dirt','mile-owned-fallback','large']){
 const recorded=read(`docs/validation/cm-optimization-v1-tolerance-${key==='large'?'large':'case-'+key}-20261118.json`),t=prepareChart(data,profiles,{},recorded.input,{samples:1,dt:.05});
 const owned=Object.keys(recorded.states).filter(id=>recorded.states[id]==='owned'),setup={...createFinalSetup({setup:t.setup,rows:t.rows,nativeIds:t.nativeIds},recorded.actual),ownedSkillIds:owned,possessionGraph:graph,inheritanceOrigins:inheritanceOrigins(data),externalDomains:contextDomains(data)};
 const required=activeSkillIds([...t.nativeIds,...owned],graph),plans=key==='large'?[recorded.current,read('docs/validation/cm-optimization-v1-fast-prototype-bounded-full-prefix-large-20261118.json').current,read('docs/validation/cm-optimization-v1-fast-large-20261118.json').current]:recorded.records.map(r=>r.current);
 const compiled=new Map([...new Set([...required,...plans.flatMap(p=>p.ids)])].map(id=>[id,compileChartSkill(data.skills[id],setup)]));
 const current=new RaceEvaluator(setup,compiled,required,t.nativeIds,branchSampler),reference=new Reference(setup,compiled,required,t.nativeIds,branchSampler);
 for(const plan of plans)for(const count of [9,36,72,144,36]){
  // Force loss of heavyweight raw run objects between stages. The compact
  // prefix cache must still reproduce the independently archived evaluator.
  current.runs.clear();reference.runs.clear();
  const actual=current.evaluate(plan.ids,count,.01),expected=reference.evaluate(plan.ids,count,.01);assert.deepEqual(actual,expected,key+' '+count);
  if(count===144)assert.equal(actual.gain,plan.gain);
  records.push({key,count,ids:plan.ids,gain:actual.gain,hpSuccessRate:actual.hpSuccessRate,hpShortfall:actual.hpShortfall,allFieldsIdentical:true});
 }
 if(key==='long')assert.deepEqual(current.evaluate(plans[0].ids,144,.01,{stopOnHpFailure:true}),reference.evaluate(plans[0].ids,144,.01,{stopOnHpFailure:true}));
}
const release=read('docs/validation/cm-optimization-v1-fast-release-20261118.json');
for(const file of release.modules)assert.equal(hash(fs.readFileSync(new URL(file.path,root),'utf8').replace(/\r\n/g,'\n')),file.textSha256);
const out={status:'passed',dataVersion:manifest.active_version,modulesSha256:release.coreSha256,referenceCommit:'baa9d98',referencePath,referenceSha256,setupAndPricingUnchanged:true,setupPricingSha256,comparisons:records.length,hpEarlyRejectionIdentical:true,records,scope:'Exact equality of every returned field against archived v13 aggregation; no simulation model or probability change'};
fs.writeFileSync(new URL('docs/validation/cm-optimization-v1-fast-cache-equivalence-20261118.json',root),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,comparisons:out.comparisons}));
