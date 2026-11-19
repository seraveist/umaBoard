import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {weightedTailMean,performanceSummary,compareRacePlans,normalizeRiskPolicy} from '../assets/race-objective.mjs';
import {createAcquisitionConstraints,assertAcquisitionFeasible} from '../assets/acquisition-constraints.mjs';
import {prepareChart,generateChart,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {ENCOUNTER_POLICY,raceScenario,encounterPolicy} from '../assets/race-scenarios.mjs';
import {normalizeRaceContext} from '../assets/race-sampling.mjs';
import {activeSkillIds,withoutSkill} from '../assets/skill-context.mjs';

const a=(field,value,operator='==')=>({field,value,operator});
const raw=(id,value=1500,condition=[[a('remain_distance',400,'<=')]],extra={})=>({id,name_jp:id,jp_available:true,rarity:'white',inherited:false,activation_raw:0,categories:['speed'],parent_ids:[],invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',effects:[{kind:'target_speed',source_type:1,value_raw:value,unit:'umatools_raw',extras_raw:{}}]}],...extra});
const smallData=list=>({skills:Object.fromEntries(list.map(s=>[s.id,s])),purchase_stages:Object.fromEntries(list.map(s=>[s.id,{status:'verified',base_cost:100}])),relations:[],evolution_rules:[],scenario_exclusive_groups:[]});
const stats={speed:1600,stamina:3000,power:1500,guts:1200,wisdom:1000};
const setup={course:{id:'c',selectable:true,distance:1200,distance_type:1,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:1200}],slopes:[]},stats,style:2,going:1,mood:2,bloom:5,uniqueLevel:6,scenarioId:'s',outfitId:'o',supportIds:[],aptitudes:{distance:'A',surface:'A',style:'A'},encounterPolicy:ENCOUNTER_POLICY,raceContext:{},externalDomains:{}};
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read(read('data/manifest.json').dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const points=values=>values.map(value=>({value,weight:1}));

test('tail finish time uses weighted boundary mass and ignores zero-weight outliers',()=>{
 assert.equal(weightedTailMean([{value:100,weight:3},{value:120,weight:1},{value:9999,weight:0}],.5),110);
 assert.equal(weightedTailMean([{value:100,weight:.75},{value:120,weight:.25}],.5),110);
 assert.equal(weightedTailMean(points([100,110,120]),1),110);
 assert.equal(weightedTailMean([{value:100,weight:1e308},{value:120,weight:1e308}],.5),120);
 assert.throws(()=>weightedTailMean([{value:100,weight:-1}],.25));assert.throws(()=>normalizeRiskPolicy({tailMass:0}));
});
test('risk guard examines whole-run bad outcomes instead of the minimum incremental benefit',()=>{
 const reference=points([100,100,120,120]),target=performanceSummary(points([100,100,115,115]),reference),uniform=performanceSummary(points([99,99,119,119]),reference);
 assert.equal(target.risk.withinLimit,true);assert.equal(target.tailImprovement,5);
 assert.ok(compareRacePlans({id:'conditional',gain:3,robustGain:0,performance:target},{id:'uniform',gain:1,robustGain:1,performance:uniform})<0);
});
test('large average gains cannot hide deterioration of baseline tail performance',()=>{
 const reference=points([100,100,100,120]),bad=performanceSummary(points([90,90,90,125]),reference),safe=performanceSummary(points([99,99,99,119]),reference);
 assert.equal(bad.risk.withinLimit,false);assert.equal(bad.risk.tailDelay,5);
 assert.ok(compareRacePlans({id:'fragile',gain:10,performance:bad},{id:'safe',gain:1,performance:safe})>0);
 assert.equal(performanceSummary(points([90,90,90,125]),reference,{maxTailDelay:5}).risk.withinLimit,true);
});
test('HP feasibility precedes risk/mean and zero-cost ties remain deterministic',()=>{
 assert.ok(compareRacePlans({id:'hp',feasible:true,gain:0},{id:'no-hp',feasible:false,hpSuccessRate:.99,gain:100})<0);
 assert.ok(compareRacePlans({id:'cheap',gain:1,cost:50},{id:'costly',gain:1,cost:100})<0);
});

function routeFixture(){
 const d=smallData(['a','b','c'].map(id=>raw(id,1500,undefined,{rarity:'gold'})));
 d.acquisition_routes=['a','b','c'].flatMap(skill_id=>['left','right'].map(owner_id=>({skill_id,kind:'support_event',owner_type:'support',owner_id})));
 d.support_events=Object.fromEntries(['left','right'].map(id=>[id,{source:'reviewed:'+id,events:[{id:'same-local-event-id',choices:['a','b','c'].map(skill_id=>({id:skill_id,rewards:[{skill_id}]}))}]}]));
 return {d,s:{...setup,supportIds:['left','right']}};
}
test('route feasibility finds global three-way conflicts even when every pair is possible',()=>{
 const {d,s}=routeFixture(),model=createAcquisitionConstraints(d,s);
 for(const pair of [['a','b'],['a','c'],['b','c']])assert.equal(model.allowed(pair),true);
 const result=model.check(['a','b','c'],{explain:true});assert.equal(result.feasible,false);assert.deepEqual(result.conflict.skillIds,['a','b','c']);
 assert.equal(new Set(result.conflict.eventKeys).size,2);assert.throws(()=>assertAcquisitionFeasible(model,['a','b','c']),error=>error.code==='ACQUISITION_CONFLICT');
});
test('an independent outfit route or a third provider restores a valid assignment',()=>{
 const {d,s}=routeFixture();d.acquisition_routes.push({skill_id:'c',kind:'self',owner_type:'outfit',owner_id:'o'});
 assert.equal(createAcquisitionConstraints(d,s).allowed(['a','b','c']),true);
 assert.equal(createAcquisitionConstraints(d,{...s,outfitId:'different'}).allowed(['a','b','c']),false);
 const f=routeFixture();f.s.supportIds.push('third');f.d.acquisition_routes.push({skill_id:'c',kind:'support_event',owner_type:'support',owner_id:'third'});f.d.support_events.third={events:[{id:'e',choices:[{id:'x',rewards:[{skill_id:'c'}]}]}]};
 assert.equal(createAcquisitionConstraints(f.d,f.s).allowed(['a','b','c']),true);
});
test('a common reward may coexist with its branch reward, but alternate branches may not',()=>{
 const {d,s}=routeFixture();s.supportIds=['left'];d.support_events.left.events[0].choices=[{id:'one',rewards:[{skill_id:'a'},{skill_id:'b'}]},{id:'two',rewards:[{skill_id:'a'},{skill_id:'c'}]}];
 const model=createAcquisitionConstraints(d,s);assert.equal(model.allowed(['a','b']),true);assert.equal(model.allowed(['a','c']),true);assert.equal(model.allowed(['b','c']),false);
 const pinned=createAcquisitionConstraints(d,{...s,acquisitionChoices:{'support:left:same-local-event-id':'one'}});assert.equal(pinned.allowed(['c']),false);
 assert.throws(()=>createAcquisitionConstraints(d,{...s,acquisitionChoices:{missing:'x'}}));
});
test('unreviewed alternate event data remains an explicit gap rather than a false prohibition',()=>{
 const {d,s}=routeFixture();delete d.support_events.right;
 const result=createAcquisitionConstraints(d,s).check(['a','b','c']);assert.equal(result.feasible,true);assert.equal(result.coverage,'partial');assert.deepEqual(result.unmodeledGoldIds,['a','b','c']);
});
test('evolution ownership requires its original gold reward route',()=>{
 const {d,s}=routeFixture();d.skills.evo=raw('evo',3000,undefined,{rarity:'evolution'});d.evolution_rules=[{base_id:'c',evolved_id:'evo',owner_type:'outfit',owner_id:'o'}];
 assert.equal(createAcquisitionConstraints(d,s).allowed(['a','b','evo']),false);
});
test('scenario choices filter link requirements and still allow a genuine support alternative',()=>{
 const d=smallData(['a','b'].map(id=>raw(id,1000,undefined,{rarity:'gold'})));d.outfits={o:{name_jp:'O'}};d.supports={};d.acquisition_routes=['a','b'].map(skill_id=>({skill_id,kind:'scenario_curated',owner_type:'scenario',owner_id:'s'}));
 d.scenario_events={s:{events:[{id:'link',choices:[{id:'a',rewards:[{skill_id:'a',requirements:{character_link:{name_jp:'O',present:true}}}]},{id:'b',rewards:[{skill_id:'b'}]}]}]}};
 assert.equal(createAcquisitionConstraints(d,setup).allowed(['a','b']),false);
 d.acquisition_routes.push({skill_id:'b',kind:'support_hint',owner_type:'support',owner_id:'p'});
 assert.equal(createAcquisitionConstraints(d,{...setup,supportIds:['p']}).allowed(['a','b']),true);
});
test('actual FF and CB branch conflicts reject recorded hints before simulation',async()=>{
 const input={outfitId:'112901',style:2,courseId:'10808',scenarioId:'14',supportIds:['30311','30282']},task=prepareChart(data,profiles,{skills:{}},input,{samples:1,dt:.05});
 const ids=['204531','204571'],chart={setup:task.setup,nativeIds:task.nativeIds,rows:task.rows.filter(r=>ids.includes(r.id))};let progressed=false;
 await assert.rejects(()=>recommendFinalPlan(data,chart,{'204531':'5','204571':'5'},{stats,spBudget:1000},{samples:9,dt:.05,onProgress:()=>{progressed=true}}),error=>error.code==='ACQUISITION_CONFLICT');assert.equal(progressed,false);
 const cb=createAcquisitionConstraints(data,{outfitId:'100701',scenarioId:'14',supportIds:['30312']});assert.equal(cb.allowed(['202021','202871']),true);assert.equal(cb.allowed(['204521','202871']),false);
});

test('wrapping identical default cases as equal-weight scenarios cannot change the recommendation',async()=>{
 const safe=raw('safe',1000),conditional=raw('conditional',15000,[[a('remain_distance',400,'<='),a('order',1)]]),d=smallData([safe,conditional]),chart={setup,nativeIds:[],rows:[safe,conditional]};
 const context={scenarios:Array.from({length:9},(_,i)=>{const s=raceScenario(setup,i);return {id:s.id,weight:1,context:s.context};})};
 const options={samples:18,searchSamples:9,dt:.05,diagnostics:false},states={safe:'0',conditional:'0'},input={stats,spBudget:100};
 const first=await recommendFinalPlan(d,chart,states,input,options),second=await recommendFinalPlan(d,chart,states,{...input,raceContext:context},options);
 assert.deepEqual(first.activeIds,second.activeIds);assert.equal(first.gain,second.gain);assert.deepEqual(first.performance,second.performance);
});
test('recorded observation counts supply weights with provenance and reject inconsistent counts',()=>{
 const observed={scenarioEvidence:{kind:'observed-counts',sampleSize:10,source:'fixture-log'},scenarios:[{id:'lead',observations:8,context:{rankTimeline:[{distance:0,rank:1}]}},{id:'rear',observations:2,context:{rankTimeline:[{distance:0,rank:9}]}}]};
 const normalized=normalizeRaceContext(observed);assert.deepEqual(normalized.scenarios.map(s=>s.weight),[8,2]);
 const meta=encounterPolicy({...setup,raceContext:normalized});assert.equal(meta.probabilityBasis,'recorded-count-weights');assert.equal(meta.observationCount,10);assert.equal(meta.independentlyValidated,false);
 assert.throws(()=>normalizeRaceContext({...observed,scenarioEvidence:{...observed.scenarioEvidence,sampleSize:11}}));
 assert.throws(()=>normalizeRaceContext({...observed,scenarios:observed.scenarios.map(s=>({...s,weight:1}))}));
 assert.equal(encounterPolicy(setup).probabilityBasis,'coverage-not-measured-probabilities');
});
test('changing the common weight scale preserves simulated means, tails and ablation',()=>{
 const skill=raw('weighted',1000,[[a('remain_distance',400,'<='),a('order',1)]]),contexts=[1,9].map((rank,i)=>({id:String(i),context:{rankTimeline:[{distance:0,rank}]}}));
 const calculate=weight=>{const s={...setup,raceContext:normalizeRaceContext({scenarios:contexts.map(c=>({...c,weight}))})},ev=new RaceEvaluator(s,new Map([[skill.id,compileChartSkill(skill,s)]]),[],[],branchSampler);return [ev.evaluate([skill.id],18,.05),ev.marginal([skill.id],skill.id,18,.05)];};
 const ordinary=calculate(1),huge=calculate(1e308);assert.equal(ordinary[0].gain,huge[0].gain);assert.deepEqual(ordinary[0].performance,huge[0].performance);assert.deepEqual(ordinary[1],huge[1]);
});
test('effect selection and ablation restore only owned prerequisites with arbitrary IDs',()=>{
 assert.deepEqual(activeSkillIds(['no-graph','other']),['no-graph','other']);
 const graph={evolved:['gold'],gold:['white']};assert.deepEqual(activeSkillIds(['gold','white','other'],graph),['gold','other']);
 assert.deepEqual(withoutSkill(['evolved','other'],'evolved',['white','other'],graph),{ids:['other','white'],restoredIds:['white']});
 assert.deepEqual(withoutSkill(['gold','other'],'gold',['other'],graph),{ids:['other'],restoredIds:[]});
});
test('upgrade contribution restores the actually owned lower effect instead of removing the whole family',()=>{
 const lower=raw('lower',1000),upper=raw('upper',3000),s={...setup,possessionGraph:{upper:['lower']},ownedSkillIds:['lower']};
 const compiled=new Map([lower,upper].map(r=>[r.id,compileChartSkill(r,s)])),ev=new RaceEvaluator(s,compiled,['lower'],[],branchSampler);
 const result=ev.evaluate(['upper'],18,.05),contribution=ev.marginal(['upper'],'upper',18,.05);
 assert.ok(Math.abs(result.gain-contribution.gain)<1e-9);assert.deepEqual(contribution.restoredIds,['lower']);
 assert.equal(ev.evaluate(['lower','upper'],18,.05).gain,result.gain);
 const ownedUpper=new RaceEvaluator({...s,ownedSkillIds:['lower','upper']},compiled,['upper'],[],branchSampler);
 const ownedContribution=ownedUpper.marginal(['upper'],'upper',18,.05);
 assert.deepEqual(ownedContribution.restoredIds,['lower']);assert.ok(Math.abs(ownedContribution.gain-contribution.gain)<1e-9);
});
test('the chart evaluates conditional acceleration against a declared feasible secured-skill context',()=>{
 const input={outfitId:'112901',style:2,courseId:'10808',scenarioId:'14',supportIds:['30282']},options={samples:18,dt:.05};
 const plain=prepareChart(data,profiles,{skills:{}},input,options),context=prepareChart(data,profiles,{skills:{}},{...input,comparisonSkillIds:['112901211','112901111','201342','91101411','203442','200492']},options);
 const one=plain.evaluate(plain.rows.find(r=>r.id==='202711')),two=context.evaluate(context.rows.find(r=>r.id==='202711'));
 assert.ok(one.gain>.5);assert.ok(two.gain<.1);assert.equal(two.comparisonBasis.kind,'secured-skill-context');assert.equal(context.evaluate(context.rows.find(r=>r.id==='201342')).gain,0);
 assert.throws(()=>prepareChart(data,profiles,{skills:{}},{...input,comparisonSkillIds:['does-not-exist']},options),/비교 기준/);
});
test('a secured gold branch makes a mutually exclusive chart candidate inapplicable',()=>{
 const task=prepareChart(data,profiles,{skills:{}},{outfitId:'112901',style:2,courseId:'10808',scenarioId:'14',supportIds:['30311'],comparisonSkillIds:['204531']},{samples:9,dt:.05});
 const result=task.evaluate(task.rows.find(r=>r.id==='204571'));assert.equal(result.gain,null);assert.equal(result.calculationState,'incompatible-reference');assert.equal(result.samples,0);
});
test('a shared chart cache respects the active deck when an alternative reward route becomes available',async()=>{
 const d={...data,acquisition_routes:[...data.acquisition_routes,{skill_id:'204571',kind:'support_hint',owner_type:'support',owner_id:'30282'}]},cache=new Map();
 const input={outfitId:'112901',style:2,courseId:'10808',scenarioId:'14',supportIds:['30311'],comparisonSkillIds:['204531']},options={cache,samples:1,dt:.05};
 const blocked=await generateChart(d,profiles,{skills:{}},input,options),allowed=await generateChart(d,profiles,{skills:{}},{...input,supportIds:['30311','30282']},options);
 assert.equal(blocked.rows.find(r=>r.id==='204571').calculationState,'incompatible-reference');
 assert.ok(Number.isFinite(allowed.rows.find(r=>r.id==='204571').gain));
});
