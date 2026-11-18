import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNearBest,compressPlans,selectRepresentatives,createPlanSignature,comparePlanPriorities} from '../assets/cm-plan-compression.mjs';
const row=(id,gain,cost,extra={})=>({ids:[id],gain,cost,feasible:true,hpSuccessRate:1,hpShortfall:0,performance:{tailFinishTime:100,risk:{withinLimit:true,tailDelay:-1}},scenarios:[{id:'a',gain,hpSuccessRate:1}],...extra});

test('a fixed best-measured anchor prevents chained tolerance loss and order-dependent epsilon ties',()=>{
 const a=row('a',1.020,100),b=row('b',1.011,50),c=row('c',1.002,1);
 for(const rows of [[a,b,c],[c,b,a],[b,a,c]]){const p=selectNearBest(rows,.01);assert.equal(p.anchor,a);assert.equal(p.selected,b);assert.ok(p.knownMeanLoss<=.01);}
 assert.equal(selectNearBest([a,b,c],0).selected,a);
});

test('HP, shortfall and failed tail guards cannot be traded for cheaper SP or epsilon mean gain',()=>{
 const safe=row('safe',1,100),hp=row('hp',20,1,{feasible:false,hpSuccessRate:.99}),tail=row('tail',20,1,{performance:{tailFinishTime:99,risk:{withinLimit:false,tailDelay:.001}}});
 assert.equal(selectNearBest([hp,tail,safe],.01).selected,safe);
 const lower=row('lower',1.009,1,{feasible:false,hpSuccessRate:.9,hpShortfall:2}),higher=row('higher',1,100,{feasible:false,hpSuccessRate:.9,hpShortfall:1});
 assert.equal(selectNearBest([lower,higher],.01).selected,higher);assert.ok(comparePlanPriorities(higher,lower)<0);
});

test('near bands retain the strongest and cheapest representatives without transitive merging',()=>{
 const rows=[row('a',1.02,100),row('b',1.017,80),row('c',1.014,70),row('d',1.011,50),row('e',1.002,1)],c=compressPlans(rows,.01);
 assert.deepEqual(c.representatives.map(r=>r.ids[0]),['a','d','e']);assert.equal(c.merged,3);
 const reversed=compressPlans([...rows].reverse(),.01);assert.deepEqual(reversed.representatives,c.representatives);
});

test('opposite scenario profiles and different linkage classes are not merged by equal overall means',()=>{
 const a=row('a',1,100,{scenarios:[{id:'a',gain:0,hpSuccessRate:1},{id:'b',gain:2,hpSuccessRate:1}]}),b=row('b',1,50,{scenarios:[{id:'a',gain:1,hpSuccessRate:1},{id:'b',gain:1,hpSuccessRate:1}]});
 assert.equal(compressPlans([a,b],.01).representatives.length,2);
 assert.equal(compressPlans([row('a',1,100),row('b',1,50)],.01,ids=>ids[0]).groups,2);
});

test('explicit prerequisite possession, recovery identities and count contributors survive structural grouping',()=>{
 const invocation=(effects,dynamic=[])=>({linked:false,effects,condition:[{dynamic,windows:[[0,2000]]}],precondition:[{dynamic:[],windows:[[0,2000]]}]}),skill=(id,invocations)=>({id,skill:{rarity:'white',inherited:false},invocations});
 const compiled=new Map([['dependent',skill('dependent',[invocation([{kind:'target_speed',value:.1}],[{field:'activate_count_heal',operator:'>=',value:1},{field:'is_exist_skill_id',operator:'==',value:'paid'}])])],['heal',skill('heal',[invocation([{kind:'heal',value:.01}])])],['speed',skill('speed',[invocation([{kind:'target_speed',value:.1}])])],['upper',skill('upper',[invocation([{kind:'target_speed',value:.2}])])]]);
 const signature=createPlanSignature(compiled,new Map([['upper',new Set(['paid'])]]),2000);
 assert.notEqual(signature(['dependent','heal']),signature(['dependent','speed']));assert.notEqual(signature(['speed']),signature(['upper']));
 assert.notEqual(signature(['dependent']),signature(['dependent','upper']));
});

test('protected complete construction seeds and baseline are retained even below the global shortlist',()=>{
 const rows=Array.from({length:40},(_,i)=>row(String(i),40-i,100+i));
 const result=selectRepresentatives(rows,{tolerance:.01,signature:()=>'',limit:2,requiredIds:['39'],protectedIds:[['38']]});
 assert.ok(result.selected.some(r=>r.ids[0]==='39'));assert.ok(result.selected.some(r=>r.ids[0]==='38'));
});
