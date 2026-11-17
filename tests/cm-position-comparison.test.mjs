import test from 'node:test';
import assert from 'node:assert/strict';
import {compileChartSkill} from '../assets/cm-chart.mjs';
import {createPositionComparison,comparisonRanks} from '../assets/cm-position-comparison.mjs';

const setup={outfitId:'uma',bloom:5,uniqueLevel:6,style:3,mood:2,going:1,weather:1,season:3,time:2,stats:{speed:1800,stamina:1800,power:1500,guts:1500,wisdom:1500},aptitudes:{distance:'A',surface:'A',style:'A'},course:{distance:2200,distance_type:3,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:2200}],slopes:[]}};
const skill=(id,rank,op)=>({id,name_jp:id,rarity:'white',inherited:false,parent_ids:[],invocations:[{index:1,condition:[[{field:'phase',operator:'>=',value:2},{field:'order',operator:op,value:rank}]],precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',effects:[{kind:'acceleration',value_raw:5000,unit:'umatools_raw',extras_raw:{}}]}]});

test('mutually exclusive ranks cannot both fire at the same late entry, but remain useful insurance across positions',()=>{
 const list=[skill('front',3,'<='),skill('rear',5,'>=')],compiled=new Map(list.map(s=>[s.id,compileChartSkill(s,setup)])),comparison=createPositionComparison(setup,compiled,[],{ranks:[3,6]});
 const opts=[4,.02],front=comparison.compare(['front'],...opts),rear=comparison.compare(['rear'],...opts),both=comparison.compare(['front','rear'],...opts);
 assert.ok(front.gain>0&&rear.gain>0);assert.ok(Math.abs(both.gain-front.gain-rear.gain)<1e-8);
 for(const rank of comparison.ranks){
  const events=comparison.run(['front','rear'],0,.02,rank).events;
  assert.deepEqual(events.map(e=>e.id),[rank===3?'front':'rear']);
 }
 assert.equal(comparison.policy.probabilities,false);assert.equal(comparison.policy.rankChanges,false);
});

test('a linked acceleration cannot survive an unfired rank-gated first invocation',()=>{
 const s=skill('linked',3,'<=');s.invocations[0].condition=[[{field:'phase',operator:'==',value:1},{field:'order',operator:'<=',value:3}]];
 s.invocations.push({...s.invocations[0],index:2,condition:[[{field:'is_activate_other_skill_detail',operator:'==',value:1},{field:'phase',operator:'>=',value:2}]]});
 const comparison=createPositionComparison(setup,new Map([[s.id,compileChartSkill(s,setup)]]),[],{ranks:[3,6]});
 assert.deepEqual(comparison.run(['linked'],0,.02,6).events,[]);
 assert.deepEqual(comparison.run(['linked'],0,.02,3).events.map(e=>e.index),[1,2]);
 assert.deepEqual(comparisonRanks(1),[1,2,3]);assert.ok(comparisonRanks(3).includes(6));
});

test('position comparison retains random trigger variation instead of collapsing stochastic skills',()=>{
 const s=skill('random',6,'==');s.invocations[0].condition=[[{field:'phase_random',operator:'==',value:2},{field:'order',operator:'==',value:6}]];
 const comparison=createPositionComparison(setup,new Map([[s.id,compileChartSkill(s,setup)]]),[],{ranks:[6]});
 const score=comparison.compare(['random'],8,.02);assert.ok(score.max>score.min+.005);
 assert.notEqual(comparison.run(['random'],0,.02,6).events[0].x,comparison.run(['random'],1,.02,6).events[0].x);
});
