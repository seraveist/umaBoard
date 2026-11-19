import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareChart} from '../assets/cm-chart.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const m=read('data/manifest.json'),data=read(m.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json'),previous=read('docs/validation/cm-v8-holdout-20261118.json'),results=[];
const fingerprint=()=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL('assets/',root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
assert.equal(fingerprint(),previous.frozenAssetsSha256);
for(const source of previous.plans.filter(p=>p.tailMass===.25&&['niigata1200','hanshin1600'].includes(p.race))){
 const r=previous.races.find(r=>r.key===source.race),task=prepareChart(data,profiles,display,{outfitId:'102201',style:3,courseId:r.courseId,scenarioId:'12',supportIds:[],going:r.going,weather:r.weather,season:r.season,time:2},{samples:1,dt:.05});
 const rows=task.rows.filter(row=>source.availableIds.includes(row.id)),chart={setup:task.setup,nativeIds:task.nativeIds,rows,modelVersion:task.modelVersion,evolutionOptions:[]},states=Object.fromEntries(rows.map(r=>[r.id,'5']));
 for(const rank of [3,6]){
  const raceContext={rankTimeline:[{distance:0,rank}],conditions:{blocked_side_continuetime:2,temptation_count:0},scenarioSource:'explicit synthetic stress: fixed rank plus fulfilled middle-corner contest; NOT an observed population'};
  const plan=await recommendFinalPlan(data,chart,states,{...source.actual,raceContext},{samples:144,dt:.01,diagnostics:false});assert.ok(plan.search.globalOptimal);
  results.push({race:source.race,syntheticRank:rank,contestSeconds:2,defaultActiveIds:source.activeIds,defaultGain:source.gain,activeIds:plan.activeIds,gain:plan.gain,budget:plan.budget,performance:plan.performance,interpretation:'context dependence, not an estimate of the frequency of either world'});console.log(source.race,rank,plan.gain,plan.activeIds);
 }
}
assert.equal(fingerprint(),previous.frozenAssetsSha256);
fs.writeFileSync(new URL('docs/validation/cm-v8-context-plans-20261118.json',root),JSON.stringify({frozenCommit:previous.frozenCommit,results},null,2)+'\n');
