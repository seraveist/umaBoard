import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileChartSkill,branchSampler,prepareChart} from '../assets/cm-chart.mjs';
import {RecordedPurchaseModel,recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {ENCOUNTER_POLICY,contextDomains,raceScenario} from '../assets/race-scenarios.mjs';
import {normalizeRaceContext,advanceRankHistory,advanceFrontBlock,externalConditionValue,scheduleContextBranches} from '../assets/race-sampling.mjs';
import {buildAcquisitionHierarchy,updateAcquisition,inheritedCount,canRecordAcquisition} from '../assets/cm-state.mjs';
import {selectionRules} from '../assets/selection.mjs';
import {selectInheritedTop} from '../assets/cm-recommendation.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read(read('data/manifest.json').dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const course={id:'c',selectable:true,distance:1200,distance_type:1,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:1200}],slopes:[]};
const stats={speed:1600,stamina:3000,power:1500,guts:1200,wisdom:1000};
const setup={course,stats,style:2,going:1,mood:2,bloom:5,uniqueLevel:6,aptitudes:{distance:'A',surface:'A',style:'A'},encounterPolicy:ENCOUNTER_POLICY,raceContext:{},externalDomains:{}};
const a=(field,value,operator='==')=>({field,value,operator});
function skill(id,kind='target_speed',value=1500,condition=[[a('remain_distance',400,'<=')]],extra={}){
 return {id,name_jp:id,jp_available:true,rarity:'white',inherited:false,activation_raw:0,categories:[kind==='heal'?'heal':'speed'],parent_ids:[],invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',effects:[{kind,source_type:kind,value_raw:value,unit:'umatools_raw',extras_raw:{}}]}],...extra};
}
const ev=(list,s=setup,reference=[])=>new RaceEvaluator(s,new Map(list.map(raw=>[raw.id,compileChartSkill(raw,s)])),reference,[],branchSampler);
const smallData=list=>({skills:Object.fromEntries(list.map(s=>[s.id,s])),purchase_stages:Object.fromEntries(list.map(s=>[s.id,{status:'verified',base_cost:100}])),relations:[],evolution_rules:[],scenario_exclusive_groups:[]});
test('both strengthened inherited effects share their verified paid stage at all hints and discounts',()=>{
 for(const [base,strong]of [['901411','91101411'],['901351','91101351']])for(const discountTrait of ['none','studious','fast-learner'])for(let h=0;h<=5;h++){
  const rows=[data.skills[base],data.skills[strong]],discount={discountTrait};
  const ordinary=new RecordedPurchaseModel(data,rows,{[base]:String(h)},discount).selection([base]);
  const upgraded=new RecordedPurchaseModel(data,rows,{[strong]:String(h)},discount).selection([strong]);
  assert.equal(upgraded.complete,true);assert.equal(upgraded.used,ordinary.used);assert.deepEqual(upgraded.stages.map(s=>s.id),[base]);
  const paid=new RecordedPurchaseModel(data,rows,{[base]:'owned',[strong]:String(h)},discount).selection([strong]);assert.equal(paid.used,0);
 }
});
test('generic inherited transforms work with arbitrary IDs and preserve prerequisite ownership without double effects',()=>{
 const base=skill('original','target_speed',1000,undefined,{inherited:true,rarity:'inherited'}),high=skill('upgraded','target_speed',3000,undefined,{inherited:true,rarity:'inherited'});
 const d=smallData([base,high]);delete d.purchase_stages.upgraded;d.evolution_rules=[{base_id:base.id,evolved_id:high.id,kind:'inherited_evolution',owner_type:'inheritance'}];
 const price=new RecordedPurchaseModel(d,[base,high],{upgraded:'5'}).selection(['upgraded']);assert.equal(price.used,60);assert.equal(price.stages[0].id,'original');
 const hierarchy=buildAcquisitionHierarchy(d),states=updateAcquisition([base,high],{},'upgraded','owned',hierarchy);assert.equal(states.original,'owned');
 assert.equal(selectionRules(d,new Map([[base.id,base],[high.id,high]])).compatible(base.id,high.id),false);
 const shortlist=selectInheritedTop([base,high].map((row,i)=>({...row,inheritanceOriginId:base.id,recommendation:{eligible:true},gain:i+1})));assert.deepEqual(shortlist.map(r=>r.id),[high.id]);
 const gate=skill('needs-original','target_speed',1000,[[a('is_exist_skill_id','original')]]);
 const result=ev([high,gate],{...setup,possessionGraph:{upgraded:['original']}}).evaluate(['upgraded','needs-original'],9,.05);assert.equal(result.activationRates['needs-original'],1);
});
test('normal/strengthened acquisition uses one inheritance origin and paid history can be cleared coherently',()=>{
 const rows=[data.skills['901411'],data.skills['91101411'],...Array.from({length:5},(_,i)=>({id:'other'+i,inherited:true}))],hierarchy=buildAcquisitionHierarchy(data);
 const states=Object.fromEntries(rows.filter(r=>r.id!=='91101411').map(r=>[r.id,'owned']));
 assert.equal(inheritedCount(rows,states),6);assert.equal(canRecordAcquisition(rows,states,'91101411','0'),true);
 const acquired=updateAcquisition(rows,states,'91101411','owned',hierarchy);assert.equal(inheritedCount(rows,acquired),6);
 assert.equal(updateAcquisition(rows,acquired,'901411','unavailable',hierarchy)['91101411'],'unavailable');
});
test('actual strengthened inheritance is purchasable at Lv5 and upgrades an already paid original for zero SP',async()=>{
 const task=prepareChart(data,profiles,{skills:{}},{outfitId:'101301',scenarioId:'15',style:2,courseId:'10808',supportIds:[]},{samples:1,dt:.05});
 const ids=['901411','91101411'],chart={setup:task.setup,nativeIds:[],rows:task.rows.filter(r=>ids.includes(r.id)),modelVersion:task.modelVersion};
 const input={stats:{speed:2100,stamina:2000,power:1600,guts:1200,wisdom:1700},spBudget:120},options={samples:18,searchSamples:9,dt:.05,diagnostics:false};
 const plan=await recommendFinalPlan(data,chart,{'91101411':'5'},input,options);assert.ok(plan.activeIds.includes('91101411'));assert.equal(plan.budget.used,120);
 const free=await recommendFinalPlan(data,chart,{'901411':'owned','91101411':'0'},{...input,spBudget:0},options);assert.deepEqual(free.activeIds,['91101411']);assert.equal(free.budget.used,0);
 assert.ok(free.ownedIds.includes('901411'));assert.equal(free.acquisition['901411'],'owned');
});
test('all skills in a sample share one rank and contradictory instantaneous rank gates cannot both fire',()=>{
 const window=[a('remain_distance',390,'<='),a('remain_distance',389,'>')];
 const first=skill('first','target_speed',2000,[[...window,a('order',1)]]),sixth=skill('sixth','target_speed',2000,[[...window,a('order',6)]]);
 const evaluator=ev([first,sixth]);let seenFirst=0,seenSixth=0;
 for(let i=0;i<18;i++){const run=evaluator.run(['first','sixth'],i,.01);const ids=new Set(run.events.map(e=>e.id));assert.ok(!(ids.has('first')&&ids.has('sixth')));seenFirst+=Number(ids.has('first'));seenSixth+=Number(ids.has('sixth'));}
 assert.ok(seenFirst>0&&seenSixth>0);const result=evaluator.evaluate(['first','sixth'],18,.01);assert.equal(result.scenarioCoverage.complete,true);assert.equal(result.scenarios.length,9);
});
test('context scheduling retains the original random draw and excludes impossible constant/rank windows',()=>{
 const s={...setup,raceContext:{coherentRanks:true,rankTimeline:[{distance:0,rank:1},{distance:600,rank:6},{distance:2000,rank:2}],conditions:{blocked_front:0}}};
 const branch={windows:[[0,1200]],at:700,random:true,ranks:[1],external:[a('order',1)]};
 const clipped=scheduleContextBranches([branch],s);assert.deepEqual(clipped[0].windows,[[0,600]]);assert.equal(clipped[0].at,700);
 assert.deepEqual(scheduleContextBranches([{...branch,ranks:[6],external:[a('order',6)]}],s)[0].windows,[[600,1200]]);
 assert.deepEqual(scheduleContextBranches([{...branch,external:[a('blocked_front',1)]}],s),[]);
 const raws=[skill('position','target_speed',2000,[[a('remain_distance',400,'<='),a('order',4,'<=')]]),skill('blocked','acceleration',2000,[[a('blocked_front',1)]])];
 const full={...setup,externalDomains:{blocked_front:[0,1]}},optimized=ev(raws,full).evaluate(raws.map(r=>r.id),18,.02),scan=ev(raws,{...full,contextScheduling:false}).evaluate(raws.map(r=>r.id),18,.02);
 assert.equal(optimized.gain,scan.gain);assert.deepEqual(optimized.activationRates,scan.activationRates);
});
test('explicit weighted contexts aggregate scenario means and override default coverage',()=>{
 const raceContext=normalizeRaceContext({scenarioSource:'test-observations',scenarios:[{id:'lead',weight:9,context:{rankTimeline:[{distance:0,rank:1}]}},{id:'rear',weight:1,context:{rankTimeline:[{distance:0,rank:8}]}}]});
 // Keep the original speed-cap case; add a case with positive contribution
 // so the weighted usefulness assertion cannot pass vacuously at zero gain.
 for(const [kind,value,statInput]of [['target_speed',2000,stats],['acceleration',4000,{...stats,speed:1000,guts:600}]]){
 const raw=skill('leader',kind,value,[[a('remain_distance',400,'<='),a('order',1)]]),s={...setup,stats:statInput,raceContext};
 const result=ev([raw],s).evaluate([raw.id],18,.05);assert.ok(Math.abs(result.activationRates.leader-.9)<1e-12);
 assert.ok(Math.abs(result.gain-result.scenarios.find(r=>r.id==='lead').gain*.9)<1e-9);assert.equal(result.scenarioCoverage.probabilityBasis,'user-provided-weights');
 if(kind==='acceleration'){assert.ok(result.gain>0);assert.ok(Math.abs(ev([raw],s).marginal([raw.id],raw.id,18,.05).helpfulSampleRate-.9)<1e-12);}
 }
 assert.throws(()=>normalizeRaceContext({scenarios:[{id:'bad',weight:-1,context:{}}]}));
});
test('shared threshold cases evaluate unseen numeric gates consistently rather than satisfying both opposites',()=>{
 const d=smallData([skill('zero','target_speed',1000,[[a('is_surrounded',0)]]),skill('one','target_speed',1000,[[a('is_surrounded',1)]])]);
 const s={...setup,externalDomains:contextDomains(d)},evaluator=ev(Object.values(d.skills),s);
 for(let i=0;i<9;i++){const ids=new Set(evaluator.run(['zero','one'],i,.05).events.map(e=>e.id));assert.ok(!(ids.has('zero')&&ids.has('one')));}
 const values=Array.from({length:9},(_,i)=>raceScenario(s,i).context.conditions.is_surrounded);assert.ok(values.includes(0)&&values.includes(1));
});
test('rank changes last one frame and continuous bands remember departures after the start grace',()=>{
 const field='order_rate_in20_continue',outside='order_rate_out20_continue';
 const state={prevX:0,x:20,t:4,dt:1,distance:1200,finalCornerStart:200,
  rankBands:new Map([[field,{inside:true,threshold:2}],[outside,{inside:false,threshold:2}]]),
  raceContext:{coherentRanks:true,rankTimeline:[{distance:0,rank:6},{distance:25,rank:2},{distance:100,rank:6},{distance:101,rank:2},{distance:300,rank:1}]}};
 const at=(x,t)=>{state.prevX=state.x;state.x=x;state.t=t;advanceRankHistory(state);};
 const value=f=>externalConditionValue(a(f,1),state);
 at(30,5);assert.equal(value(field),1);assert.equal(value(outside),0);
 assert.equal(value('change_order_onetime'),-4);
 at(99,6);assert.equal(value('change_order_onetime'),0);
 const crossed={...state,rankHistory:{...state.rankHistory},prevX:99,x:102,t:7};
 advanceRankHistory(crossed);assert.equal(externalConditionValue(a(field,1),crossed),0);
 at(100,7);assert.equal(value('change_order_onetime'),4);assert.equal(value(field),0);
 at(101,8);assert.equal(value(field),0);
 at(301,9);assert.equal(value('change_order_up_finalcorner_after'),1);
});
test('full-spurt acceleration contributes only after the enabled extra-spurt state starts',()=>{
 const raw=skill('extra','full_spurt_acceleration',1000,[[a('remain_distance',200,'<=')]]),s={...setup,stats:{...stats,speed:2100}};
 assert.equal(ev([raw],s).evaluate([raw.id],9,.02).usefulAccelerationRates.extra,1);
 assert.equal(ev([raw],{...s,fullSpurtMode:'off'}).evaluate([raw.id],9,.02).usefulAccelerationRates.extra,0);
});
test('usefulness spans the whole duration: prelaid acceleration helps after the boundary, expired and late acceleration do not',()=>{
 const placed=skill('placed','acceleration',3000,[[a('remain_distance',420,'<=')]]),expired=skill('expired','acceleration',3000,[[a('remain_distance',650,'<=')]]),late=skill('late','acceleration',3000,[[a('remain_distance',50,'<=')]]);
 assert.equal(ev([placed]).evaluate(['placed'],9,.02).usefulAccelerationRates.placed,1);
 assert.equal(ev([expired]).evaluate(['expired'],9,.02).usefulAccelerationRates.expired,0);
 assert.equal(ev([late]).evaluate(['late'],9,.02).usefulAccelerationRates.late,0);
});
test('backup acceleration value and usefulness naturally fall when the primary acceleration succeeds',()=>{
 const main=skill('arbitrary-main','acceleration',20000,[[a('remain_distance',400,'<=')]]),backup=skill('arbitrary-backup','acceleration',3000,[[a('remain_distance',300,'<=')]]);
 const sure=ev([main,backup]).evaluate([main.id,backup.id],144,.02);assert.equal(sure.activationRates[backup.id],1);assert.equal(sure.usefulAccelerationRates[backup.id],0);
 const uncertain=ev([{...main,activation_raw:1},backup]).evaluate([main.id,backup.id],144,.02);
 assert.ok(uncertain.usefulAccelerationRates[backup.id]>0);assert.ok(uncertain.usefulAccelerationRates[backup.id]<.2);
 assert.ok(ev([main,backup]).marginal([main.id,backup.id],backup.id,18,.02).gain<.005);
});
test('optimizer ranks model mean with whole-run tail protection and reports actual ablation gains',async()=>{
 const safe=skill('safe','target_speed',1000),fragile=skill('fragile','target_speed',15000,[[a('remain_distance',400,'<='),a('order',1)]]),d=smallData([safe,fragile]);
 // Pin the late lead after the acceleration phase, independently of the default coverage paths.
 const scenarios=[{id:'late-lead',weight:1,context:{rankTimeline:[{distance:0,rank:6},{distance:course.distance-200,rank:1}]}},
  {id:'midpack',weight:1,context:{rankTimeline:[{distance:0,rank:6}]}}];
 const chart={setup:{...setup,scenarioId:'15',raceContext:{scenarios}},nativeIds:[],rows:[safe,fragile]};
 const plan=await recommendFinalPlan(d,chart,{safe:'0',fragile:'0'},{stats,spBudget:100},{gainTolerance:0,searchSamples:9,samples:18,dt:.05});
 assert.deepEqual(plan.activeIds,['fragile']);assert.equal(plan.scenarioCoverage.complete,true);assert.equal(plan.search.globalOptimal,true);
 assert.equal(plan.performance.risk.withinLimit,true);assert.ok(Math.abs(plan.marginalContributions.fragile.gain-plan.gain)<1e-8);assert.ok(plan.physicsSensitivity);
});
test('HP-first pruning rejects only a proven infeasible challenger and preserves complete feasible scores',()=>{
 const low={...setup,course:{...course,distance:5000,straights:[{start:0,end:5000}]},stats:{...stats,speed:3000,stamina:1,guts:1}};
 const complete=ev([],low).evaluate([],9,.05),pruned=ev([],low).evaluate([],9,.05,{stopOnHpFailure:true});
 assert.equal(complete.feasible,false);assert.equal(pruned.hpRejected,true);assert.equal(pruned.samplesEvaluated,1);
 assert.deepEqual(ev([]).evaluate([],9,.05,{stopOnHpFailure:true}),ev([]).evaluate([],9,.05));
});
test('large-pool staged search uses final samples and matches an affordable-subset oracle',async()=>{
 const raws=[skill('big','target_speed',2200),skill('left','target_speed',1500),skill('right','target_speed',1500),...Array.from({length:7},(_,i)=>skill('weak'+i,'target_speed',100))],d=smallData(raws);
 d.purchase_stages.left.base_cost=50;d.purchase_stages.right.base_cost=50;
 const chart={setup:{...setup,scenarioId:'15'},nativeIds:[],rows:raws},plan=await recommendFinalPlan(d,chart,Object.fromEntries(raws.map(r=>[r.id,'0'])),{stats,spBudget:100},{gainTolerance:0,exactPlanLimit:0,samples:18,searchSamples:9,dt:.02,searchDt:.05,width:2,evaluationLimit:24,diagnostics:false});
 const oracle=[],evaluator=ev(raws,plan.setup);
 for(let mask=0;mask<2**raws.length;mask++){
  const ids=raws.filter((_,i)=>mask&(1<<i)).map(r=>r.id).sort(),cost=ids.reduce((sum,id)=>sum+d.purchase_stages[id].base_cost,0);if(cost>100)continue;
  const score=evaluator.evaluate(ids,18,.02);assert.equal(score.feasible,true);oracle.push({ids,cost,...score});
 }
 oracle.sort((a,b)=>Number(b.performance.risk.withinLimit)-Number(a.performance.risk.withinLimit)||b.gain-a.gain||a.performance.tailFinishTime-b.performance.tailFinishTime||a.cost-b.cost||a.ids.join(',').localeCompare(b.ids.join(',')));
 assert.equal(plan.search.method,'bounded');assert.deepEqual(plan.activeIds,oracle[0].ids);assert.equal(plan.gain,oracle[0].gain);assert.equal(plan.search.screeningSamples,plan.sampling.count);assert.equal(plan.search.closureComplete,true);
});

test('duel, nearby runners and front-block time use half-open shared windows in the paired race',()=>{
 const windows={compete_fight_count:[{start:900,end:1000,value:1}],blocked_front:[{start:100,end:150,value:1}],near_count:[{start:100,end:150,value:3}]};
 const context=normalizeRaceContext({encounterWindows:windows,rankTimeline:[{distance:0,rank:3}]});
 const raceContext=raceScenario({...setup,raceContext:context},0).context;
 const state={x:100,prevX:99,t:10,dt:.1,raceContext};
 const value=f=>externalConditionValue(a(f,1),state);
 advanceFrontBlock(state,windows.blocked_front);assert.equal(value('blocked_front_continuetime'),0);assert.equal(value('near_count'),3);
 state.x=120;state.prevX=119;state.t=12;advanceFrontBlock(state,windows.blocked_front);assert.equal(value('blocked_front_continuetime'),2);
 state.x=150;advanceFrontBlock(state,windows.blocked_front);assert.equal(value('blocked_front_continuetime'),0);assert.equal(value('near_count'),0);
 for(const [x,expected] of [[899,0],[900,1],[1000,0]]){state.x=x;assert.equal(value('compete_fight_count'),expected);}
 const duel=skill('duel','target_speed',1000,[[a('compete_fight_count',0,'>')]]),s={...setup,raceContext:context,externalDomains:contextDomains(smallData([duel]))};
 const event=ev([duel],s).run(['duel'],0,.05).events.find(e=>e.id==='duel');
 assert.ok(event&&event.x>=900&&event.x<1000);
 assert.throws(()=>normalizeRaceContext({encounterWindows:{blocked_front:[{start:7,end:6,value:1}]}}));
});
