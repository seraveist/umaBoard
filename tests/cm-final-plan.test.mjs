import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFinalSetup,RecordedPurchaseModel,recommendFinalPlan,FinalRaceSession} from '../assets/cm-final-plan.mjs';
import {CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {DISCOUNT_TRAITS,resolveDiscountTrait} from '../assets/cm-discounts.mjs';

const course={id:'c',selectable:true,distance:2200,distance_type:3,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:2200}],slopes:[]};
const stats={speed:1500,stamina:1600,power:1500,guts:1200,wisdom:1200};
const input={stats,spBudget:200,aptitudes:{distance:'A',surface:'A',style:'A'}};
const quick={searchSamples:1,searchDt:.05,samples:2,dt:.02};
test('secured targets cost actual SP, remain optional and gain is still relative to actual owned skills',async()=>{
 const {data,chart}=fixture();chart.accelerationPlan={ids:['other']};
 const result=await recommendFinalPlan(data,chart,{other:'0'},{...input,spBudget:100},quick);
 assert.ok(result.activeIds.includes('other'));assert.deepEqual(result.ownedIds,[]);assert.deepEqual(result.maintainedTargetIds,['other']);assert.equal(result.budget.used,100);assert.ok(result.gain>0);
 await assert.rejects(recommendFinalPlan(data,chart,{other:'0'},{...input,spBudget:0},quick),/목표 가속 유지/);
 const released=await recommendFinalPlan(data,chart,{other:'0'},{...input,spBudget:0,maintainTargetAcceleration:false},quick);assert.deepEqual(released.maintainedTargetIds,[]);
 const missing=await recommendFinalPlan(data,chart,{},input,quick);assert.deepEqual(missing.unavailableTargetIds,['other']);assert.ok(!missing.activeIds.includes('other'));
});
function skill(id,value,rarity='white',kind='target_speed'){
 return {id,activation_raw:0,name_jp:id,rarity,inherited:false,parent_ids:[],categories:[kind==='heal'?'heal':'speed'],invocations:[{index:1,condition:[[{field:'remain_distance',operator:'<=',value:400}]],precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',cooldown_raw:null,effects:[{kind,value_raw:value,unit:'umatools_raw',source_type:kind==='heal'?9:27,extras_raw:{}}]}]};
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

test('inherited evolution pays its original stage once and uses the displayed acquired hint',async()=>{
 const {data,chart}=fixture();
 const base={...skill('901411',1500,'inherited'),inherited:true,parent_ids:['other-native']},strong={...skill('91101411',3500,'inherited'),inherited:true,parent_ids:['other-native']};
 data.skills[base.id]=base;data.skills[strong.id]=strong;data.purchase_stages[base.id]={status:'verified',base_cost:200};
 chart.rows=[{...strong,name:strong.name_jp}];
 for(const [level,expected]of [200,180,160,140,130,120].entries()){
  const price=new RecordedPurchaseModel(data,chart.rows,{[strong.id]:String(level)}).selection([strong.id]);
  assert.equal(price.complete,true);assert.equal(price.used,expected);assert.equal(price.stages[0].id,base.id);
 }
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{[base.id]:'0',[strong.id]:'5'}).selection([base.id,strong.id]).used,120);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{[strong.id]:'owned'}).selection([strong.id]).used,0);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{[base.id]:'owned'}).selection([strong.id]).used,0);
 const plan=await recommendFinalPlan(data,chart,{[strong.id]:'5'},{...input,spBudget:120},quick);
 assert.ok(plan.activeIds.includes(strong.id));assert.equal(plan.budget.used,120);assert.equal(plan.purchases[0].id,strong.id);assert.equal(plan.purchases[0].stages[0].id,base.id);
 const restored=await recommendFinalPlan(data,chart,{[base.id]:'owned'},{...input,spBudget:0},quick);
 assert.ok(restored.ownedIds.includes(strong.id));assert.equal(restored.budget.used,0);
});

test('five owned speed inherits and a new accelerator consume the same six final slots',async()=>{
 const {data,chart}=fixture(),list=Array.from({length:6},(_,i)=>({...skill('inherited'+i,i===5?4000:1500,'inherited',i===5?'acceleration':'target_speed'),inherited:true,parent_ids:['parent'+i]}));
 for(const s of list){data.skills[s.id]=s;data.purchase_stages[s.id]={status:'verified',base_cost:100};}
 chart.rows=list.map(s=>({...s,name:s.name_jp}));chart.accelerationPlan={ids:['inherited5']};
 const states=Object.fromEntries(list.map((s,i)=>[s.id,i<5?'owned':'0'])),plan=await recommendFinalPlan(data,chart,states,{...input,spBudget:100},quick);
 assert.equal(plan.activeIds.filter(id=>data.skills[id].inherited).length,6);assert.ok(plan.activeIds.includes('inherited5'));
 const seventh={...list[0],id:'seventh'};data.skills.seventh=seventh;chart.rows.push({...seventh,name:seventh.name_jp});data.purchase_stages.seventh={status:'verified',base_cost:1};
 await assert.rejects(recommendFinalPlan(data,chart,{...states,seventh:'owned'},input,quick),/계승.*6개/);
});

test('actual stats, remaining SP and aptitudes override only the post-training setup',()=>{
 const {chart}=fixture(),setup=createFinalSetup(chart,{...input,spBudget:0,aptitudes:{distance:'S',surface:'A',style:'B'}});
 assert.equal(setup.stats.speed,1500);assert.equal(chart.setup.stats.speed,2200);assert.equal(setup.aptitudes.distance,'S');assert.equal(setup.spBudget,0);
 for(const spBudget of [-1,1.5,Infinity,'200'])assert.throws(()=>createFinalSetup(chart,{...input,spBudget}));
 assert.throws(()=>createFinalSetup(chart,{...input,stats:{...stats,power:0}}));assert.throws(()=>createFinalSetup(chart,{...input,aptitudes:{distance:'X'}}));
});

test('an owned lower is retained as paid history, upgraded once, and excluded from additional SP and active effects',async()=>{
 const {data,chart}=fixture(),result=await recommendFinalPlan(data,chart,{white:'owned',gold:'0'},{...input,spBudget:150},quick);
 assert.ok(result.ownedIds.includes('white'));assert.ok(result.activeIds.includes('b'));assert.ok(!result.activeIds.includes('white'));assert.equal(result.purchases[0].id,'gold');
 assert.equal(result.budget.used,150);assert.equal(result.budget.remaining,0);assert.deepEqual(result.purchases[0].stages.map(row=>row.id),['gold']);assert.ok(result.gain>0);
});

test('both unpurchased evolution alternatives compete; a purchased base can evolve for zero SP',async()=>{
 const {data,chart}=fixture(),result=await recommendFinalPlan(data,chart,{gold:'owned',a:'0',b:'0'},{...input,spBudget:0},quick);
 assert.ok(result.activeIds.includes('b'));assert.ok(!result.activeIds.includes('a'));assert.ok(!result.activeIds.includes('gold'));assert.equal(result.budget.used,0);assert.deepEqual(result.purchases,[]);assert.equal(result.evolutions.outfit[0].id,'b');
 const locked=await recommendFinalPlan(data,chart,{a:'owned',b:'0'},input,quick);assert.ok(locked.activeIds.includes('a'));assert.ok(!locked.activeIds.includes('b'));
});

test('hidden evolutions follow rare-only hints and participate before the purchase choice is fixed',async()=>{
 const {data,chart}=fixture();chart.evolutionOptions=chart.rows.filter(row=>row.rarity==='evolution');chart.rows=chart.rows.filter(row=>row.rarity!=='evolution');
 data.skills.gold.invocations[0].effects[0].value_raw=500;data.skills.b.invocations[0].effects[0].value_raw=9000;
 const plan=await recommendFinalPlan(data,chart,{white:'owned',gold:'0',other:'0'},{...input,spBudget:150},quick);
 assert.equal(plan.purchases[0].id,'gold');assert.ok(plan.activeIds.includes('b'));assert.ok(!plan.activeIds.includes('other'));
 const free=await recommendFinalPlan(data,chart,{gold:'owned'},{...input,spBudget:0},quick);
 assert.equal(free.evolutions.outfit[0].id,'b');assert.deepEqual(free.purchases,[]);assert.equal(free.acquisition.b,undefined);
 const blocked=await recommendFinalPlan(data,chart,{gold:'owned'},{...input,spBudget:0,excludedEvolutionIds:['a','b']},quick);
 assert.ok(blocked.activeIds.includes('gold'));assert.deepEqual(blocked.evolutions.outfit,[]);
});

test('five scenario choices survive shortlisting, select two and leave outfit evolution outside that limit',async()=>{
 const {data,chart}=fixture(),states={};chart.rows=[];chart.evolutionOptions=[];
 for(let i=0;i<6;i++){
  const base='base'+i,evo='evo'+i;data.skills[base]=skill(base,300,'gold');data.skills[evo]=skill(evo,1000+i*1000,'evolution');
  data.purchase_stages[base]={status:'verified',base_cost:100};data.evolution_rules.push({base_id:base,evolved_id:evo,owner_type:i===5?'outfit':'scenario',owner_id:i===5?'uma':'15'});
  chart.rows.push({...data.skills[base],name:base});chart.evolutionOptions.push({...data.skills[evo],name:evo,evolutionBaseId:base});states[base]='owned';
 }
 data.scenario_exclusive_groups=[{scenario_id:'15',skill_ids:['evo0','evo1','evo2','evo3','evo4'],max_count:2}];
 const plan=await recommendFinalPlan(data,chart,states,{...input,spBudget:0},{...quick,maxCandidates:1,evaluationLimit:10});
 assert.deepEqual(plan.evolutions.scenario.map(row=>row.id).sort(),['evo3','evo4']);assert.equal(plan.evolutions.outfit[0].id,'evo5');
 assert.deepEqual(plan.purchases,[]);assert.equal(plan.search.scenarioPacks,16);assert.equal(plan.budget.used,0);
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
 const result=await recommendFinalPlan(data,chart,states,{...input,spBudget:160},{...quick,evaluationLimit:1,gainTolerance:0});
 assert.equal(result.purchases.length,16);assert.equal(result.budget.used,160);assert.equal(result.search.method,'bounded');
});

test('compression retains the combined benefit of many edits individually smaller than the gain tolerance',async()=>{
 const {data,chart}=fixture(),states={};
 for(let i=0;i<16;i++){const id='micro'+i;data.skills[id]=skill(id,200);data.purchase_stages[id]={status:'verified',base_cost:10};chart.rows.push({...data.skills[id],name:id});states[id]='0';}
 const actual={...input,spBudget:160},exact=await recommendFinalPlan(data,chart,states,actual,{...quick,evaluationLimit:1,gainTolerance:0,diagnostics:false});
 const single=await recommendFinalPlan(data,chart,{micro0:'0'},{...input,spBudget:10},{...quick,gainTolerance:0,diagnostics:false});
 assert.ok(single.gain>0&&single.gain<.1,`single gain=${single.gain}`);
 const compressed=await recommendFinalPlan(data,chart,states,actual,{...quick,evaluationLimit:1,diagnostics:false});
 assert.ok(exact.gain>.1);assert.ok(compressed.purchases.length>0);
 assert.ok(exact.gain-compressed.gain<=.1+1e-10);assert.ok(compressed.budget.used<=160);
 assert.equal(compressed.search.precisionSeedCandidates,16);assert.equal(compressed.search.precisionSeedCount,2);
});

test('Fast Learner adds ten percentage points to every recorded hint discount before one integer floor',()=>{
 const {data,chart}=fixture();data.purchase_stages.white.base_cost=200;
 for(const [level,expected]of [180,160,140,120,110,100].entries())assert.equal(new RecordedPurchaseModel(data,chart.rows,{white:String(level)},{fastLearner:true}).selection(['white']).used,expected);
 data.purchase_stages.white.base_cost=101;
 const stages=new RecordedPurchaseModel(data,chart.rows,{white:'4',gold:'2'},{fastLearner:true}).selection(['gold']).stages;
 assert.deepEqual(stages.map(stage=>[stage.id,stage.cost,stage.extraDiscount]),[['white',55,10],['gold',105,10]]);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{white:'owned',gold:'2'},{fastLearner:true}).selection(['gold']).used,105);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{gold:'owned',b:'5'},{fastLearner:true}).selection(['b']).used,0);
 data.skills.inherit={...skill('inherit',3000,'inherited'),inherited:true};data.purchase_stages.inherit={status:'verified',base_cost:200};chart.rows.push(data.skills.inherit);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{inherit:'5'},{fastLearner:true}).selection(['inherit']).used,100);
});

test('Fast Learner changes affordability, persists in the result basis, and defaults off for old input',async()=>{
 const {data,chart}=fixture(),budget={...input,spBudget:50};
 const before=await recommendFinalPlan(data,chart,{other:'5'},budget,quick),after=await recommendFinalPlan(data,chart,{other:'5'},{...budget,fastLearner:true},quick);
 assert.deepEqual(before.purchases,[]);assert.equal(before.setup.fastLearner,false);assert.equal(after.purchases[0].id,'other');assert.equal(after.budget.used,50);assert.equal(after.setup.fastLearner,true);assert.equal(chart.setup.fastLearner,undefined);
 assert.throws(()=>createFinalSetup(chart,{...input,fastLearner:'true'}),/수완가/);
});

test('exclusive discount traits resolve old saved flags and give explicit new selections precedence',()=>{
 const {chart}=fixture();
 assert.deepEqual(Object.values(DISCOUNT_TRAITS).map(row=>row.rate),[0,4,10]);
 for(const [legacy,expected]of [[{},'none'],[{fastLearner:false},'none'],[{fastLearner:true},'fast-learner']])assert.equal(resolveDiscountTrait(legacy),expected);
 for(const discountTrait of Object.keys(DISCOUNT_TRAITS)){
  const setup=createFinalSetup(chart,{...input,discountTrait,fastLearner:true});
  assert.equal(setup.discountTrait,discountTrait);assert.equal(setup.fastLearner,discountTrait==='fast-learner');
 }
 for(const discountTrait of ['',null,0,'constructor','both'])assert.throws(()=>createFinalSetup(chart,{...input,discountTrait}),/할인 특성/);
});

test('Studious adds four points at every hint, floors each unpaid stage and never charges paid or duplicate stages',()=>{
 const {data,chart}=fixture();data.purchase_stages.white.base_cost=200;
 for(const [level,expected]of [192,172,152,132,122,112].entries())assert.equal(new RecordedPurchaseModel(data,chart.rows,{white:String(level)},{discountTrait:'studious'}).selection(['white']).used,expected);
 data.purchase_stages.white.base_cost=101;
 const price=new RecordedPurchaseModel(data,chart.rows,{white:'4',gold:'2'},{discountTrait:'studious',fastLearner:true}).selection(['white','gold','a']);
 assert.deepEqual(price.stages.map(row=>[row.id,row.cost,row.extraDiscount]),[['white',61,4],['gold',114,4]]);assert.equal(price.used,175);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{white:'owned',gold:'2'},{discountTrait:'studious'}).selection(['a']).used,114);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{gold:'owned',a:'5'},{discountTrait:'studious'}).selection(['a']).used,0);
 data.skills.inherit={...skill('inherit',3000,'inherited'),inherited:true};data.purchase_stages.inherit={status:'verified',base_cost:200};chart.rows.push(data.skills.inherit);
 assert.equal(new RecordedPurchaseModel(data,chart.rows,{inherit:'5'},{discountTrait:'studious'}).selection(['inherit']).used,112);
});

test('Studious changes affordable combinations and records the selected trait without stacking Fast Learner',async()=>{
 const {data,chart}=fixture(),budget={...input,spBudget:56};
 const none=await recommendFinalPlan(data,chart,{other:'5'},{...budget,discountTrait:'none'},quick);
 const study=await recommendFinalPlan(data,chart,{other:'5'},{...budget,discountTrait:'studious',fastLearner:true},quick);
 const fast=await recommendFinalPlan(data,chart,{other:'5'},{...budget,discountTrait:'fast-learner'},quick);
 assert.deepEqual(none.purchases,[]);assert.equal(study.purchases[0].id,'other');assert.equal(study.budget.used,56);assert.equal(study.setup.discountTrait,'studious');assert.equal(study.setup.fastLearner,false);
 assert.equal(fast.budget.used,50);assert.equal(study.purchases[0].stages[0].extraDiscount,4);
 assert.equal(chart.setup.discountTrait,undefined);assert.equal(input.discountTrait,undefined);
});

test('late recovery after depletion cannot outrank an earlier useful recovery',async()=>{
 const {data,chart}=fixture();chart.nativeIds=[];chart.rows=[];
 for(const [id,value,condition,cost]of [['early',550,[[{field:'phase',operator:'==',value:1}]],20],['late',5500,[[{field:'distance_rate',operator:'>=',value:99}]],100]]){
  data.skills[id]=skill(id,value,'white','heal');data.skills[id].invocations[0].condition=condition;data.purchase_stages[id]={status:'verified',base_cost:cost};chart.rows.push({...data.skills[id],name:id});
 }
 const plan=await recommendFinalPlan(data,chart,{early:'0',late:'0'},{...input,stats:{...stats,stamina:1},spBudget:100},quick);
 assert.deepEqual(plan.activeIds,['early']);assert.equal(plan.budget.used,20);assert.equal(plan.fullSpeedFeasible,false);
});

test('actual CM recommendation enforces event routes including owned records',async()=>{
 const {data,chart}=fixture();chart.nativeIds=[];chart.rows=['x','y'].map(id=>{data.skills[id]=skill(id,3000,'gold');data.purchase_stages[id]={status:'verified',base_cost:50};return {...data.skills[id],name:id};});
 chart.setup.supportIds=['card'];data.acquisition_routes=['x','y'].map(id=>({skill_id:id,owner_type:'support',owner_id:'card',kind:'support_event'}));
 data.support_events={card:{events:[{id:'choice',choices:['x','y'].map(id=>({id,rewards:[{skill_id:id}]}))}]}};
 const plan=await recommendFinalPlan(data,chart,{x:'0',y:'unavailable'},input,quick);assert.equal(plan.purchases.length,1);
 await assert.rejects(()=>recommendFinalPlan(data,chart,{x:'0',y:'0'},input,quick),{code:'ACQUISITION_CONFLICT'});
 await assert.rejects(()=>recommendFinalPlan(data,chart,{x:'owned',y:'owned'},input,quick),{code:'ACQUISITION_CONFLICT'});
});

test('redundant saturated accelerations do not consume extra SP',async()=>{
 const {data,chart}=fixture();chart.nativeIds=[];chart.rows=[];
 for(const [id,cost]of [['cheap',50],['expensive',100]]){
  data.skills[id]=skill(id,1000000000,'white','acceleration');data.skills[id].invocations[0].condition=[[{field:'phase',operator:'==',value:2}]];
  data.purchase_stages[id]={status:'verified',base_cost:cost};chart.rows.push({...data.skills[id],name:id});
 }
 const plan=await recommendFinalPlan(data,chart,{cheap:'0',expensive:'0'},{...input,spBudget:200},quick);
 assert.deepEqual(plan.activeIds,['cheap']);assert.equal(plan.budget.used,50);
});

test('an earlier plan is rescored with current hints, ownership and budget; stale plans never unlock a purchase',async()=>{
 const {data,chart}=fixture(),previousPlanIds=['native','other'];
 const check=(states,budget,prior=previousPlanIds)=>recommendFinalPlan(data,chart,states,{...input,spBudget:budget,previousPlanIds:prior},quick);
 const valid=await check({other:'5'},60);
 assert.equal(valid.search.previousPlanCompared,true);assert.equal(valid.budget.used,60);
 const paid=await check({other:'owned'},0);assert.equal(paid.search.previousPlanCompared,true);assert.equal(paid.budget.used,0);
 for(const [states,budget,ids] of [[{},200,previousPlanIds],[{other:'0'},60,previousPlanIds],[{other:'5'},100,['removed-skill']]]){
  const plan=await check(states,budget,ids);assert.equal(plan.search.previousPlanCompared,false);assert.ok(plan.budget.used<=budget);
 }
});

test('an edited budget and hint reuse measurements while repricing and searching the current record',async()=>{
 const {data,chart}=fixture(),session=new FinalRaceSession();
 const before=await recommendFinalPlan(data,chart,{white:'0',other:'0'},input,{...quick,session});
 const record={white:'5',other:'2',unavailable:'0'},edited={...input,spBudget:170,previousPlanIds:before.activeIds};
 const warm=await recommendFinalPlan(data,chart,record,edited,{...quick,session});
 const cold=await recommendFinalPlan(data,chart,record,edited,quick);
 assert.ok(session.metrics.scoreHits>0);
 delete warm.search.sampleReuse;delete cold.search.sampleReuse;assert.deepEqual(warm,cold);
 assert.ok(warm.budget.used<=170);assert.ok(warm.activeIds.includes('unavailable'));
 for(const [states,settings] of [[{...record,white:'owned'},edited],[{...record,white:'owned'},{...edited,stats:{...stats,speed:1700}}]]){
  const run=await recommendFinalPlan(data,chart,states,settings,{...quick,session});
  assert.equal(session.metrics.scoreHits,0);assert.equal(session.metrics.diagnosticHits,0);
  const fresh=await recommendFinalPlan(data,chart,states,settings,quick);assert.deepEqual(run,fresh);
 }
});

test('publishing the early purchase list leaves headless decisions and search counters identical',async()=>{
 const {data,chart}=fixture(),states={white:'4',gold:'3',other:'4',unavailable:'1'};
 const options={...quick,exactPlanLimit:0,evaluationLimit:32},updates=[];
 const session=new FinalRaceSession();
 const shown=await recommendFinalPlan(data,chart,states,input,{...options,session,onPurchaseList:(stage,summary)=>updates.push({stage,summary})});
 const headless=await recommendFinalPlan(data,chart,states,input,options);
 assert.deepEqual(shown,headless);assert.equal(session.metrics.scoreHits,0);
 assert.deepEqual(updates.map(x=>x.stage),['preview','confirmed']);
 for(const {summary} of updates){
  assert.equal(summary.samples,shown.sampling.count);
  assert.equal(summary.purchases.reduce((sum,p)=>sum+p.cost,0),summary.used);
  assert.ok(summary.used<=input.spBudget);
 }
 assert.deepEqual(updates[1].summary.purchases,shown.purchases.map(({id,cost})=>({id,cost})));
 assert.equal(updates[1].summary.gain,shown.gain);
});

test('only an SP-only edit near a safe full-search anchor uses the adjustment path',async()=>{
 const {data,chart}=fixture(),record={other:'0',white:'0'};
 chart.modelVersion=CM_MODEL_VERSION;
 data.purchase_stages.other.base_cost=100;data.purchase_stages.white.base_cost=4;
 data.skills.other.invocations[0].effects[0].value_raw=7000;
 for(const r of chart.rows)r.gain=r.id==='other'?2:1;
 const session=new FinalRaceSession(),options={...quick,exactPlanLimit:0,diagnostics:false,session};
 const settings={...input,stats:{...input.stats,stamina:3000}};
 async function run(budget,ids,states=record,changes={}){
  return recommendFinalPlan(data,chart,states,{...settings,spBudget:budget,previousPlanIds:ids,...changes},options);
 }
 let cancelled=false;
 const stopped=await recommendFinalPlan(data,chart,record,{...settings,spBudget:100},{
  ...options,diagnostics:true,cancelled:()=>cancelled,onPurchaseList:stage=>{if(stage==='confirmed')cancelled=true;}
 });
 assert.equal(stopped,null);
 assert.equal((await run(104,[])).search.method,'budget-adjustment');
 const anchor=await run(100,[]);assert.notEqual(anchor.search.method,'budget-adjustment');
 assert.ok(anchor.activeIds.includes('other'));
 const up=await run(104,anchor.activeIds);
 assert.equal(up.search.method,'budget-adjustment');assert.ok(up.activeIds.includes('white'));
 assert.equal(up.hpSuccesses,up.sampling.count);assert.equal(up.budget.used,104);assert.equal(up.search.globalOptimal,false);
 const next=await run(106,up.activeIds);assert.notEqual(next.search.method,'budget-adjustment');
 const edited=await run(107,next.activeIds,{...record,white:'2'});
 assert.notEqual(edited.search.method,'budget-adjustment');
 const newStats=await run(108,edited.activeIds,{...record,white:'2'},{stats:{...settings.stats,stamina:100}});
 assert.notEqual(newStats.search.method,'budget-adjustment');
});
