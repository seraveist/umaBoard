import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendTargetAcceleration} from '../assets/cm-acceleration-plan.mjs';
import {compileChartSkill} from '../assets/cm-chart.mjs';
import {createPositionComparison} from '../assets/cm-position-comparison.mjs';

const atom=(field,operator,value)=>({field,operator,value});
function skill(id,value=4000,{kind='acceleration',rarity='white',condition=[[atom('phase','>=',2)]],inherited=false}={}){
 return {id,name_jp:id,description_jp:id,rarity,inherited,parent_ids:inherited?['other-native']:[],jp_available:true,categories:[kind==='acceleration'?'acceleration':'speed'],invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',cooldown_raw:null,effects:[{kind,value_raw:value,unit:'umatools_raw',extras_raw:{}}]}]};
}
function fixture(list,costs={}){
 const native=skill('native',0,{kind:'target_speed',rarity:'unique',condition:[]});
 const data={skills:Object.fromEntries([native,...list].map(s=>[s.id,s])),outfits:{uma:{id:'uma',name_jp:'uma',base_stars:3}},supports:{},relations:[],evolution_rules:[],scenario_exclusive_groups:[],support_events:{},acquisition_routes:[native,...list.filter(s=>!s.inherited)].map(s=>({skill_id:s.id,owner_type:'outfit',owner_id:'uma',kind:'self'})),purchase_stages:Object.fromEntries(list.filter(s=>s.rarity!=='evolution').map(s=>[s.id,{status:'verified',base_cost:costs[s.id]??100}])),internal_acceleration_comparison_cost:Object.fromEntries(list.map(s=>[s.id,costs[s.id]??100]))};
 const chart={setup:{course:{id:'c',selectable:true,distance:2200,distance_type:3,surface:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:2200}],slopes:[]},outfitId:'uma',scenarioId:'15',supportIds:[],bloom:5,uniqueLevel:6,style:2,mood:2,going:1,weather:1,season:3,time:2,stats:{speed:1800,stamina:1800,power:1800,guts:1700,wisdom:1800},aptitudes:{distance:'A',surface:'A',style:'A'}},nativeIds:['native'],rows:list.map(s=>({...s,name:s.name_jp})),evolutionOptions:[]};
 return {data,chart};
}
const quick={samples:4,dt:.02,searchSamples:2,searchDt:.05};
test('a preparation target discards expensive tiny marginal gains without buying or mutating hint records',async()=>{
 const {data,chart}=fixture([skill('core',10000),skill('tiny',100)],{core:100,tiny:10000}),before=JSON.stringify({data,chart});
 const result=await recommendTargetAcceleration(data,chart,quick);
 assert.deepEqual(result.ids,['core']);assert.equal(result.cost,60);assert.ok(result.maximumGain>=result.gain);assert.equal(JSON.stringify({data,chart}),before);
});
test('an early-only acceleration cannot become the late acceleration target',async()=>{
 const {data,chart}=fixture([skill('early',4000,{condition:[[atom('phase','==',0)]]})]);
 const result=await recommendTargetAcceleration(data,chart,quick);assert.deepEqual(result.ids,[]);assert.equal(result.gain,0);
});
test('the target chooses a compatible rare bundle and common rewards are availability, not forced purchases',async()=>{
 const {data,chart}=fixture([skill('accel',8000,{rarity:'gold'}),skill('common',1000,{kind:'target_speed',rarity:'gold'}),skill('speed',9000,{kind:'target_speed',rarity:'gold'})]);
 data.supports.card={id:'card',name_jp:'card',rarity:'SSR'};chart.setup.supportIds=['card'];
 data.acquisition_routes=data.acquisition_routes.map(r=>r.skill_id==='native'?r:{...r,owner_type:'support',owner_id:'card',kind:'support_event'});
 data.support_events.card={events:[{id:'bundle',choices:[{id:'a',rewards:[{skill_id:'common'},{skill_id:'accel'}]},{id:'b',rewards:[{skill_id:'common'},{skill_id:'speed'}]}]}]};
 const result=await recommendTargetAcceleration(data,chart,quick);
 assert.ok(result.ids.includes('accel'));assert.ok(!result.ids.includes('common'));assert.equal(result.eventChoices.bundle,'a');assert.equal(result.rewards[0].reason,'target');assert.deepEqual(result.rewards[0].ids,['common','accel']);
});
test('inapplicable companion rares do not erase a valid set recommendation',async()=>{
 const {data,chart}=fixture([skill('core'),skill('wrong-style',3000,{kind:'target_speed',rarity:'gold',condition:[[atom('running_style','==',4)]]})]);
 data.supports.card={id:'card',rarity:'SSR'};chart.setup.supportIds=['card'];
 data.acquisition_routes=data.acquisition_routes.map(r=>r.skill_id==='wrong-style'?{...r,owner_type:'support',owner_id:'card',kind:'support_event'}:r);
 data.support_events.card={events:[{id:'fixed',choices:[{id:'1',rewards:[{skill_id:'wrong-style'}]}]}]};
 const result=await recommendTargetAcceleration(data,chart,quick);assert.equal(result.rewards.length,1);assert.equal(result.rewards[0].reason,'fixed');
});
test('the target can discover a useful inherited accelerator outside the display shortlist',async()=>{
 const {data,chart}=fixture([skill('inherit',8000,{inherited:true,rarity:'inherited'})]);chart.rows=[];
 const result=await recommendTargetAcceleration(data,chart,quick);assert.deepEqual(result.ids,['inherit']);
});
test('an inactive native unique remains a valid zero baseline',async()=>{
 const {data,chart}=fixture([skill('core')]);data.skills.native.invocations[0].condition=[[atom('running_style','==',4)]];
 const result=await recommendTargetAcceleration(data,chart,quick);assert.ok(result.ids.includes('core'));
});
test('cancellation suppresses the target rather than publishing a partial plan',async()=>{
 const {data,chart}=fixture([skill('core')]);assert.equal(await recommendTargetAcceleration(data,chart,{...quick,cancelled:()=>true}),null);
});

test('seven useful ordinary accelerators survive bounded search without turning its depth into a skill cap',async()=>{
 const cores=Array.from({length:7},(_,i)=>skill('core'+i,1000)),extras=Array.from({length:3},(_,i)=>skill('expensive'+i,100)),costs=Object.fromEntries([...cores.map(s=>[s.id,10]),...extras.map(s=>[s.id,10000])]);
 const {data,chart}=fixture([...cores,...extras],costs),result=await recommendTargetAcceleration(data,chart,quick);
 assert.equal(result.search.method,'bounded');assert.equal(result.ids.filter(id=>id.startsWith('core')).length,7);assert.equal(result.ids.length,7);
});

test('inherited acceleration and speed hybrids share one six-skill total limit',async()=>{
 const list=Array.from({length:7},(_,i)=>{
  const s=skill('inherit'+i,1000,{inherited:true,rarity:'inherited'});s.parent_ids=['parent'+i];s.categories=['speed','acceleration'];
  s.invocations[0].effects.push({kind:'target_speed',value_raw:3000,unit:'umatools_raw',extras_raw:{}});return s;
 });
 const {data,chart}=fixture(list,Object.fromEntries(list.map(s=>[s.id,10]))),result=await recommendTargetAcceleration(data,chart,quick);
 assert.equal(result.ids.length,6);assert.equal(result.skills.filter(s=>s.inherited).length,6);
});

test('positive but inefficient insurance is left out according to its additional SP instead of absolute maximum gain',async()=>{
 const {data,chart}=fixture([skill('core',4000),skill('insurance',500)],{core:100,insurance:1500}),result=await recommendTargetAcceleration(data,chart,quick);
 const compiled=new Map(Object.values(data.skills).map(s=>[s.id,compileChartSkill(s,chart.setup)])),comparison=createPositionComparison(chart.setup,compiled,chart.nativeIds),a=comparison.compare(['core'],quick.samples,quick.dt),b=comparison.compare(['core','insurance'],quick.samples,quick.dt);
 assert.ok(b.gain>a.gain+.005);assert.deepEqual(result.ids,['core']);assert.ok(result.maximumGain>result.gain);
 assert.equal(result.efficiencyPolicy.minGainPer100Sp,.15);assert.equal(result.rankComparison.probabilities,false);
});

test('unverified acceleration prices are disclosed without entering a target as a free skill',async()=>{
 const {data,chart}=fixture([skill('unknown'),skill('known')]);delete data.purchase_stages.unknown;
 const result=await recommendTargetAcceleration(data,chart,quick);
 assert.ok(!result.ids.includes('unknown'));assert.deepEqual(result.excludedCandidates,[{id:'unknown',name:'unknown',reason:'구매 비용 확인 필요'}]);
});
