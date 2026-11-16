import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFinalSetup,RecordedPurchaseModel,recommendFinalPlan} from '../assets/cm-final-plan.mjs';

const course={id:'c',selectable:true,distance:2200,distance_type:3,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:2200}],slopes:[]};
const stats={speed:1500,stamina:1600,power:1500,guts:1200,wisdom:1200};
const input={stats,spBudget:200,aptitudes:{distance:'A',surface:'A',style:'A'}};
const quick={searchSamples:1,searchDt:.05,samples:2,dt:.02};
function skill(id,value,rarity='white',kind='target_speed'){
 return {id,name_jp:id,rarity,inherited:false,parent_ids:[],categories:[kind==='heal'?'heal':'speed'],invocations:[{index:1,condition:[[{field:'remain_distance',operator:'<=',value:400}]],precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',cooldown_raw:null,effects:[{kind,value_raw:value,unit:'umatools_raw',source_type:kind==='heal'?9:27,extras_raw:{}}]}]};
}
function fixture(){
 const list=[skill('native',1000,'unique'),skill('white',2000),skill('gold',4500,'gold'),skill('a',5500,'evolution'),skill('b',6500,'evolution'),skill('other',3000),skill('unavailable',20000),skill('unknown',20000)];
 const data={skills:Object.fromEntries(list.map(row=>[row.id,row])),purchase_stages:{white:{status:'verified',base_cost:101},gold:{status:'verified',base_cost:150,prerequisite_id:'white'},other:{status:'verified',base_cost:100},unavailable:{status:'verified',base_cost:1}},relations:[],evolution_rules:[{base_id:'gold',evolved_id:'a'},{base_id:'gold',evolved_id:'b'}],scenario_exclusive_groups:[]};
 const chart={modelVersion:'cm-first-chart-v2',nativeIds:['native'],setup:{course,outfitId:'uma',bloom:5,uniqueLevel:6,style:2,mood:2,going:1,scenarioId:'15',stats:{...stats,speed:2200},aptitudes:{distance:'A',surface:'A',style:'A'}},rows:list.filter(row=>row.id!=='native').map(row=>({...row,name:row.name_jp,evolutionBaseId:row.rarity==='evolution'?'gold':null}))};
 return {data,chart};
}

test('recorded Lv0–5 discounts apply to each stage, shared stages once, and paid stages cost no remaining SP',()=>{
 const {data,chart}=fixture();
 for(const [level,expected]of [101,90,80,70,65,60].entries())assert.equal(new RecordedPurchaseModel(data,chart.rows,{white:String(level)}).selection(['white']).used,expected);
 let price=new RecordedPurchaseModel(data,chart.rows,{white:'5',gold:'2',a:'4'}).selection(['white','gold','a']);assert.equal(price.used,60+120);assert.equal(price.stages.length,2);
 price=new RecordedPurchaseModel(data,chart.rows,{white:'owned',gold:'2'}).selection(['gold']);assert.equal(price.used,120);assert.deepEqual(price.stages.map(row=>row.id),['gold']);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{gold:'owned',a:'0'}).selection(['a']).used,0);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{a:'5'}).selection(['a']).used,101+90);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{}).selection(['unknown']).complete,false);
});

test('actual stats, remaining SP and aptitudes override only the post-training setup',()=>{
 const {chart}=fixture(),setup=createFinalSetup(chart,{...input,spBudget:0,aptitudes:{distance:'S',surface:'A',style:'B'}});
 assert.equal(setup.stats.speed,1500);assert.equal(chart.setup.stats.speed,2200);assert.equal(setup.aptitudes.distance,'S');assert.equal(setup.spBudget,0);
 for(const spBudget of [-1,1.5,Infinity,'200'])assert.throws(()=>createFinalSetup(chart,{...input,spBudget}));
 assert.throws(()=>createFinalSetup(chart,{...input,stats:{...stats,power:0}}));assert.throws(()=>createFinalSetup(chart,{...input,aptitudes:{distance:'X'}}));
});

test('an owned lower is retained as paid history, upgraded once, and excluded from additional SP and active effects',async()=>{
 const {data,chart}=fixture(),result=await recommendFinalPlan(data,chart,{white:'owned',gold:'0'},{...input,spBudget:150},quick);
 assert.ok(result.ownedIds.includes('white'));assert.ok(result.activeIds.includes('gold'));assert.ok(!result.activeIds.includes('white'));
 assert.equal(result.budget.used,150);assert.equal(result.budget.remaining,0);assert.deepEqual(result.purchases[0].stages.map(row=>row.id),['gold']);assert.ok(result.gain>0);
});

test('both unpurchased evolution alternatives compete; a purchased base can evolve for zero SP',async()=>{
 const {data,chart}=fixture(),result=await recommendFinalPlan(data,chart,{gold:'owned',a:'0',b:'0'},{...input,spBudget:0},quick);
 assert.ok(result.activeIds.includes('b'));assert.ok(!result.activeIds.includes('a'));assert.ok(!result.activeIds.includes('gold'));assert.equal(result.budget.used,0);assert.equal(result.purchases[0].id,'b');
 const locked=await recommendFinalPlan(data,chart,{a:'owned',b:'0'},input,quick);assert.ok(locked.activeIds.includes('a'));assert.ok(!locked.activeIds.includes('b'));
});

test('unavailable skills never become candidates, and unknown prices are disclosed instead of treated as free',async()=>{
 const {data,chart}=fixture(),result=await recommendFinalPlan(data,chart,{other:'5',unknown:'0'},input,quick);
 assert.deepEqual(result.purchases.map(row=>row.id),['other']);assert.equal(result.budget.used,60);assert.ok(!result.activeIds.includes('unavailable'));assert.ok(result.excluded.some(row=>row.id==='unknown'));
});

test('combination search beats an individual gain greedy choice and reports an actually simulated joint gain',async()=>{
 const {data,chart}=fixture();data.skills.big=skill('big',5000);data.skills.left=skill('left',3000);data.skills.right=skill('right',3000);
 for(const [id,cost]of [['big',200],['left',100],['right',100]]){data.purchase_stages[id]={status:'verified',base_cost:cost};chart.rows.push({...data.skills[id],name:id});}
 const result=await recommendFinalPlan(data,chart,{big:'0',left:'0',right:'0'},input,quick);
 assert.deepEqual(result.purchases.map(row=>row.id).sort(),['left','right']);assert.equal(result.budget.used,200);assert.equal(result.purchases.reduce((sum,row)=>sum+row.cost,0),result.budget.used);
});

test('no available skills and zero SP retain the existing baseline; cancellation never publishes a plan',async()=>{
 const {data,chart}=fixture(),result=await recommendFinalPlan(data,chart,{}, {...input,spBudget:0},quick);
 assert.deepEqual(result.purchases,[]);assert.equal(result.gain,0);assert.equal(result.budget.used,0);
 assert.equal(await recommendFinalPlan(data,chart,{other:'0'},input,{...quick,cancelled:()=>true}),null);
 await assert.rejects(()=>recommendFinalPlan(data,chart,{}, {...input,spBudget:-1},quick),/SP/);
});

test('recorded hint changes alter affordability without silently using the cheapest assumed hint',async()=>{
 const {data,chart}=fixture();
 const full=await recommendFinalPlan(data,chart,{other:'0'},{...input,spBudget:60},quick);
 const discounted=await recommendFinalPlan(data,chart,{other:'5'},{...input,spBudget:60},quick);
 assert.deepEqual(full.purchases,[]);assert.equal(discounted.purchases[0].id,'other');assert.equal(discounted.budget.used,60);
});

test('recovery competes on full-spurt HP rather than being discarded for zero isolated distance gain',async()=>{
 const {data,chart}=fixture();data.skills.heal=skill('heal',5500,'white','heal');data.skills.heal.invocations[0].condition=[[{field:'remain_distance',operator:'<=',value:1600}]];
 data.purchase_stages.heal={status:'verified',base_cost:100};chart.rows.push({...data.skills.heal,name:'heal'});
 const low={...input,stats:{...stats,stamina:1},spBudget:100};
 const baseline=await recommendFinalPlan(data,chart,{},low,quick),result=await recommendFinalPlan(data,chart,{heal:'0',other:'0'},low,quick);
 assert.ok(result.purchases.some(row=>row.id==='heal'));assert.ok(result.hpRemaining>baseline.hpRemaining);
});

test('scenario evolution and inherited limits are checked against the entire recorded selection',async()=>{
 const {data,chart}=fixture();
 data.scenario_exclusive_groups=[{scenario_id:'15',skill_ids:['white','other'],max_count:1}];
 await assert.rejects(()=>recommendFinalPlan(data,chart,{white:'owned',other:'owned'},input,quick),/충돌/);
 for(let i=0;i<7;i++){const id='inherit'+i;data.skills[id]={...skill(id,2000,'inherited'),inherited:true};chart.rows.push({...data.skills[id],name:id});}
 await assert.rejects(()=>recommendFinalPlan(data,chart,Object.fromEntries(Array.from({length:7},(_,i)=>['inherit'+i,'0'])),input,quick),/최대 6/);
});

test('current JP rare prices use entered hints instead of the old automatic white Lv5 policy',()=>{
 const read=file=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8')),data=read(read('data/manifest.json').dataset_path);
 const ids=['204731','204732'],rows=ids.map(id=>({...data.skills[id],name:data.skills[id].name_jp}));
 const costs=ids.map(id=>data.purchase_stages[id].base_cost);
 assert.equal(new RecordedPurchaseModel(data,rows,{'204731':'0','204732':'0'}).selection(['204731']).used,costs[0]+costs[1]);
 assert.equal(new RecordedPurchaseModel(data,rows,{'204731':'5','204732':'owned'}).selection(['204731']).used,Math.floor(costs[0]*.6));
});

test('a bounded search starts with complete affordable packs even when singletons consume its evaluation allowance',async()=>{
 const {data,chart}=fixture(),states={};
 for(let i=0;i<16;i++){const id='pack'+i;data.skills[id]=skill(id,400);data.purchase_stages[id]={status:'verified',base_cost:10};chart.rows.push({...data.skills[id],name:id});states[id]='0';}
 const result=await recommendFinalPlan(data,chart,states,{...input,spBudget:160},{...quick,evaluationLimit:1});
 assert.equal(result.purchases.length,16);assert.equal(result.budget.used,160);assert.equal(result.search.method,'bounded');
});
