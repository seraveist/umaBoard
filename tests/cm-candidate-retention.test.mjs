import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildChartCandidates,createChartSetup,prepareChart,generateChart,compileChartSkill} from '../assets/cm-chart.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {finalAcquisitionSnapshot} from '../assets/cm-evolution.mjs';
import {branchReady} from '../assets/activation.mjs';

const atom=(field,value,operator='>=')=>({field,value,operator});
const course={id:'flat',selectable:true,track_id:'10008',surface:1,turn:1,distance:2000,distance_type:3,course_set_status:[],corners:[],slopes:[],straights:[{start:0,end:2000,frontType:1}]};
const stats={speed:1600,stamina:1800,power:1500,guts:1300,wisdom:1200};
const profiles={profiles:{fixture:{id:'fixture',stats}}},input={outfitId:'outfit',scenarioId:'fixture',style:2,courseId:'flat',supportIds:[]},quick={samples:9,dt:.02,searchSamples:9,searchDt:.05,diagnostics:false};
function skill(id,condition,rarity='white',precondition=[]){return {id,name_jp:id,description_jp:id,activation_raw:0,jp_available:true,rarity,inherited:false,parent_ids:[],categories:['speed'],invocations:[{index:1,condition,precondition,duration_raw:30000,duration_unit:'umatools_base_time',effects:[{kind:'target_speed',source_type:27,value_raw:4000,unit:'umatools_raw',extras_raw:{}}]}]};}
function fixture(raw){return {skills:{[raw.id]:raw},outfits:{outfit:{id:'outfit',base_stars:3,name_jp:'fixture'}},supports:{},courses:{flat:course},acquisition_routes:[{skill_id:raw.id,kind:'self',owner_type:'outfit',owner_id:'outfit'}],evolution_rules:[],relations:[],internal_acceleration_comparison_cost:{[raw.id]:100},purchase_stages:{[raw.id]:{status:'verified',base_cost:100}},scenario_exclusive_groups:[]};}

test('all five stat gates, six comparisons, both invocation sections and white/gold acquisition preserve candidates',()=>{
 const fields=[['base_speed','speed'],['base_stamina','stamina'],['base_power','power'],['base_guts','guts'],['base_wiz','wisdom']];
 let checks=0;
 for(const [field,key]of fields)for(const [op,threshold,actual]of [['>=',2300,2300],['>',2300,2301],['<=',1000,1000],['<',1000,999],['==',2300,2300],['!=',stats[key],stats[key]+1]])for(const pre of [false,true])for(const rarity of ['white','gold']){
  const raw=skill(`arbitrary-${checks}`,pre?[]:[[atom(field,threshold,op)]],rarity,pre?[[atom(field,threshold,op)]]:[]),d=fixture(raw),t=prepareChart(d,profiles,{},input,{samples:1,dt:.05});
  assert.equal(compileChartSkill(raw,t.setup).status,'inactive');
  const row=t.rows.find(r=>r.id===raw.id);assert.ok(row,`${field} ${op} ${rarity} pre=${pre}`);assert.equal(t.evaluate(row).gain,0);
  assert.notEqual(compileChartSkill(raw,{...t.setup,stats:{...stats,[key]:actual}}).status,'inactive');
  assert.equal(finalAcquisitionSnapshot(d,t,{[raw.id]:'2'})[raw.id],'2');
  assert.equal(finalAcquisitionSnapshot(d,t,{[raw.id]:'owned'})[raw.id],'owned');checks++;
 }
 assert.equal(checks,120);
});

test('stat deferral preserves factor-only whites while immutable race gates and rare acquisition routes remain enforced',()=>{
 const raw=skill('factor',[[atom('base_speed',2300)]]),d=fixture(raw);d.acquisition_routes=[];
 const s=createChartSetup(d,profiles,input);assert.ok(buildChartCandidates(d,s).has(raw.id));
 for(const gate of [atom('running_style',4,'=='),atom('ground_type',2,'=='),atom('distance_type',4,'==')]){
  const blocked={...d,skills:{factor:skill('factor',[[atom('base_speed',2300),gate]])}};
  assert.ok(!buildChartCandidates(blocked,s).has('factor'));
 }
 const gold={...d,skills:{factor:{...raw,rarity:'gold'}}};assert.ok(!buildChartCandidates(gold,s).has('factor'));
});

test('a stat-dependent unsupported branch stays unscored until actual stats select a supported alternative',async()=>{
 const raw=skill('branch',[[atom('base_speed',2300,'<')]]),low=raw.invocations[0];low.effects[0].kind='unknown';
 raw.invocations.push({...low,index:2,condition:[[atom('base_speed',2300)]],effects:[{...low.effects[0],kind:'target_speed'}]});
 const d=fixture(raw),chart=await generateChart(d,profiles,{},input,{samples:1,dt:.05}),row=chart.rows.find(r=>r.id===raw.id);
 assert.ok(row);assert.equal(row.calculationState,'unsupported');assert.equal(row.gain,null);
 const lowPlan=await recommendFinalPlan(d,chart,{branch:'2'},{stats,spBudget:100},quick);
 assert.ok(!lowPlan.activeIds.includes('branch'));assert.ok(lowPlan.excluded.some(r=>r.id==='branch'));assert.equal(lowPlan.acquisition.branch,'2');
 const high=await recommendFinalPlan(d,chart,{branch:'2'},{stats:{...stats,speed:2300},spBudget:100},quick);
 assert.ok(high.activeIds.includes('branch'));assert.equal(high.budget.used,80);assert.ok(high.gain>0);
});

test('an inactive prerequisite remains owned and only the recorded upgrade is charged after actual stats change',async()=>{
 const low=skill('101',[[atom('base_speed',2300)]]),high=skill('102',[[atom('base_speed',2300)]],'gold'),d=fixture(high);
 d.skills[low.id]=low;d.purchase_stages[low.id]={status:'verified',base_cost:100};d.purchase_stages[high.id].prerequisite_id=low.id;
 const chart=await generateChart(d,profiles,{},input,{samples:1,dt:.05});assert.ok(chart.rows.some(r=>r.id===low.id));
 const actual={stats:{...stats,speed:2300},spBudget:80},p=await recommendFinalPlan(d,chart,{101:'owned',102:'2'},actual,{...quick,gainTolerance:0});
 assert.equal(p.acquisition['101'],'owned');assert.equal(p.budget.used,80);assert.ok(p.activeIds.includes('102'));assert.ok(!p.activeIds.includes('101'));
 // This fixture gives the two tiers identical effects. The exact price
 // contract above remains useful, while epsilon selection should keep the
 // already-paid tier when the upgrade adds less than the declared tolerance.
 const compressed=await recommendFinalPlan(d,chart,{101:'owned',102:'2'},actual,quick);
 assert.equal(compressed.acquisition['101'],'owned');assert.equal(compressed.acquisition['102'],'2');
 assert.equal(compressed.budget.used,0);assert.ok(compressed.activeIds.includes('101'));assert.ok(!compressed.activeIds.includes('102'));
 assert.ok(p.gain-compressed.gain<=.01+1e-10);
});

test('real scenario-8 chart retains the white stamina gate and actual stats control buying without manual row restoration',async()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),d=read(read('data/manifest.json').dataset_path),p=read('curated/cm-scenario-profiles.json');
 const chart=await generateChart(d,p,{}, {outfitId:'102201',scenarioId:'8',courseId:'10810',style:2,supportIds:[]},{samples:1,dt:.05}),id='204142',row=chart.rows.find(r=>r.id===id);
 assert.ok(row);assert.equal(chart.setup.stats.stamina,1000);assert.equal(row.calculationState,'inactive');assert.equal(row.gain,0);
 for(const [stamina,expected]of [[1199,false],[1800,true]]){
  const actual={stats:{...chart.setup.stats,stamina},spBudget:200},plan=await recommendFinalPlan(d,chart,{[id]:'2'},actual,{...quick,samples:144,dt:.01});
  assert.equal(plan.acquisition[id],'2');assert.equal(plan.activeIds.includes(id),expected);assert.equal(plan.budget.used,expected?144:0);
  if(expected){assert.ok(plan.gain>0);assert.equal(plan.hpSuccessRate,1);}
 }
 const owned=await recommendFinalPlan(d,chart,{[id]:'owned'},{stats:{...chart.setup.stats,stamina:1199},spBudget:0},quick);
 assert.equal(owned.acquisition[id],'owned');assert.ok(owned.activeIds.includes(id));assert.equal(owned.budget.used,0);
 assert.equal(chart.setup.stats.stamina,1000);
});

test('full-speed random thresholds use movement-start position with safe initial-state fallback',()=>{
 const branch={at:0,windows:[[0,2000]],dynamic:[atom('run_at_full_speed_random',1,'==')],fullSpurtQ:.5},s={distance:2000,fullSpurtStart:1500,x:1750.1,prevX:1749.9};
 assert.equal(branchReady(branch,s,'arbitrary'),false);
 assert.equal(branchReady(branch,{...s,prevX:1750},'arbitrary'),true);
 assert.equal(branchReady(branch,{...s,prevX:undefined},'arbitrary'),true);
 for(const fullSpurtStart of [null,undefined])assert.equal(branchReady(branch,{...s,fullSpurtStart},'arbitrary'),false);
});
