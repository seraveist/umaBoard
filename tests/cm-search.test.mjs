import test from 'node:test';
import assert from 'node:assert/strict';
import {enumerateAffordablePlans,fundingEdits,budgetExchangeProposals} from '../assets/cm-search.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
const normalize=ids=>[...new Set(ids)].sort();
const keys=plans=>plans.map(p=>p.ids.join(',')).sort();

test('exact preflight preserves legal pairs across nontransitive conflicts',()=>{
 const conflict=(a,b)=>[a,b].includes('b')&&a!==b;
 const legal=ids=>ids.every((a,i)=>ids.slice(0,i).every(b=>!conflict(a,b)));
 const options={required:[],normalize,conflict,legal,price:ids=>ids.length,budget:2};
 const forward=enumerateAffordablePlans(['a','b','c'],options),reverse=enumerateAffordablePlans(['c','b','a'],options);
 assert.equal(forward.complete,true);assert.deepEqual(keys(forward.plans),['','a','a,c','b','c']);assert.deepEqual(reverse,forward);
});

test('clique enumeration agrees with independent subsets for all four-node conflict graphs',()=>{
 const ids=['a','b','c','d'],edges=ids.flatMap((id,i)=>ids.slice(i+1).map(other=>[id,other])),costs={a:2,b:3,c:5,d:7};
 for(let graph=0;graph<2**edges.length;graph++){
  const conflict=(a,b)=>edges.some(([x,y],i)=>(graph&(1<<i))&&((a===x&&b===y)||(a===y&&b===x))),legal=selected=>selected.every((id,i)=>selected.slice(0,i).every(other=>!conflict(id,other))),price=selected=>selected.reduce((sum,id)=>sum+costs[id],0),expected=[];
  for(let mask=0;mask<2**ids.length;mask++){const selected=ids.filter((id,i)=>mask&(1<<i));if(legal(selected)&&price(selected)<=7)expected.push(selected.join(','));}
  const result=enumerateAffordablePlans(ids,{required:[],normalize,conflict,legal,price,budget:7});assert.equal(result.complete,true);assert.deepEqual(keys(result.plans),expected.sort());
 }
});

test('large Cartesian products fall back before invoking expensive route checks',()=>{
 const result=enumerateAffordablePlans(Array.from({length:500},(_,i)=>String(i)),{required:[],normalize,conflict:()=>false,legal:()=>assert.fail('large preflight must not walk route leaves'),price:()=>assert.fail('large preflight must not price leaves'),budget:7000});
 assert.equal(result.complete,false);assert.equal(result.reason,'enumeration-work-limit');assert.equal(result.nodes,0);assert.deepEqual(result.plans,[]);
});

test('exact preflight never prunes a partial price or legality that a later transformation can repair',()=>{
 const result=enumerateAffordablePlans(['a','b'],{required:[],normalize,conflict:()=>false,legal:ids=>!ids.includes('a')||ids.includes('b'),price:ids=>ids.includes('b')?1:10,budget:1});
 assert.equal(result.complete,true);assert.deepEqual(keys(result.plans),['a,b','b']);
});

test('preflight limits discard partial results and never declare global optimality',()=>{
 const opts={required:[],normalize,conflict:()=>false,legal:()=>true,price:ids=>ids.length,budget:5};
 for(const extra of [{planLimit:2},{nodeLimit:3},{planLimit:0}]){
  const result=enumerateAffordablePlans(['a','b','c','d'],{...opts,...extra});assert.equal(result.complete,false);assert.deepEqual(result.plans,[]);assert.ok(result.reason);
 }
});

test('funding restores paid lower effects before checking legality',()=>{
 const required=['paid'],normalize=ids=>ids.includes('upper')?['upper']:['paid'];
 const edits=fundingEdits(['upper'],{required,candidateIds:['upper'],lower:new Map([['upper',new Set(['paid'])]]),normalize,price:ids=>ids.includes('upper')?70:0,legal:ids=>ids.includes('paid')||ids.includes('upper')});
 assert.equal(edits.length,1);assert.deepEqual(edits[0].ids,['paid']);assert.deepEqual(edits[0].added,['paid']);assert.equal(edits[0].cost,0);
});

test('funding across two families admits a purchase that no single refund can fund',()=>{
 const price=ids=>ids.reduce((sum,id)=>sum+({a:40,b:40,new:100}[id]),0),ids=['a','b'];
 const edits=fundingEdits(ids,{required:[],candidateIds:[],lower:new Map(),normalize,price,legal:()=>true}).map(e=>({...e,gain:1}));
 const proposals=[...budgetExchangeProposals(ids,edits,['new'],{normalize,extend:(ids,id)=>[...ids,id],price,legal:()=>true,budget:100,order:(a,b)=>b.gain-a.gain||a.cost-b.cost,baselineGain:2})];
 assert.deepEqual(proposals,[['new']]);
 assert.deepEqual([...budgetExchangeProposals(ids,edits,['a','b'],{normalize,extend:(ids,id)=>[...ids,id],price,legal:()=>true,budget:100,order:(a,b)=>b.gain-a.gain,baselineGain:2})],[]);
});

test('bounded whole-plan closure can cross a worsening downgrade to fund a better package',async()=>{
 const skill=(id,value)=>({id,name_jp:id,activation_raw:0,rarity:'white',inherited:false,parent_ids:[],categories:['speed'],invocations:[{index:1,condition:[[{field:'remain_distance',operator:'<=',value:400}]],precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',cooldown_raw:null,effects:[{kind:'target_speed',value_raw:value,unit:'umatools_raw',source_type:27,extras_raw:{}}]}]});
 const skills=[skill('tier-low',2000),skill('tier-high',3500),skill('independent',2100)];
 const data={skills:Object.fromEntries(skills.map(s=>[s.id,s])),purchase_stages:{'tier-low':{status:'verified',base_cost:70},'tier-high':{status:'verified',base_cost:90,prerequisite_id:'tier-low'},independent:{status:'verified',base_cost:100}},relations:[],evolution_rules:[],scenario_exclusive_groups:[]};
 const stats={speed:1500,stamina:1600,power:1500,guts:1200,wisdom:1200},aptitudes={distance:'A',surface:'A',style:'A'};
 const chart={modelVersion:'fixture',nativeIds:[],setup:{course:{id:'c',selectable:true,distance:2200,distance_type:3,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:2200}],slopes:[]},stats,aptitudes,scenarioId:'15',style:2,mood:2,going:1},rows:skills};
 const result=await recommendFinalPlan(data,chart,Object.fromEntries(skills.map(s=>[s.id,'0'])),{stats,aptitudes,spBudget:200},{exactPlanLimit:0,searchSamples:9,samples:9,dt:.02,searchDt:.05,evaluationLimit:40,diagnostics:false});
 assert.equal(result.search.method,'compressed-bounded');assert.deepEqual(result.activeIds,['independent','tier-low']);assert.equal(result.budget.used,170);
 assert.ok(result.search.exchangeProposalChecks>0);assert.ok(result.search.exchangePrecisionChecks>0);
 assert.ok(result.search.initialCoarseEvaluations<=result.search.initialCoarseEvaluationLimit);
 assert.ok(result.search.exchangeEvaluations<=result.search.exchangeEvaluationLimit);assert.equal(result.search.stabilizationChecks,0);
 assert.equal(result.search.initialDirectSweeps,1);assert.ok(result.search.initialDirectEvaluations<=result.candidateCount+result.search.scenarioPacks);
 assert.ok(result.search.refinementEvaluations<=result.search.refinementEvaluationLimit);
});
