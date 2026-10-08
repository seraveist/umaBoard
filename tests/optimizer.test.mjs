import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PurchaseModel,discountedCost} from '../assets/purchases.mjs';
import {SkillOptimizer} from '../assets/skill-optimizer.mjs';
import {selectionRules} from '../assets/selection.mjs';
import {buildCandidates} from '../assets/candidates.mjs';
import {fixedContext} from '../assets/activation.mjs';
import {validateDeck,recommendDecks} from '../assets/deck-optimizer.mjs';
const manifest=JSON.parse(readFileSync(new URL('../data/manifest.json',import.meta.url)));
const live=JSON.parse(readFileSync(new URL('../'+manifest.dataset_path,import.meta.url)));
const flat={id:'test',selectable:true,distance:2400,distance_type:3,surface:1,turn:2,track_id:'10006',course_set_status:[],corners:[],straights:[{start:0,end:2400,frontType:1}],slopes:[]};
const setup={course:flat,outfitId:'uma',bloom:3,style:2,going:1,mood:0,weather:1,season:3,time:2,supportIds:[],scenarioId:'',spBudget:200,
 stats:{speed:1200,stamina:1200,power:1200,guts:1200,wisdom:1200},aptitudes:{distance:'A',surface:'A',style:'A'}};
function skill(id,kind='target_speed',condition=[[{field:'remain_distance',operator:'<=',value:300}]],extra={}){
 return {id,name_jp:id,rarity:'white',inherited:false,parent_ids:[],jp_available:true,categories:[kind==='acceleration'?'acceleration':kind==='heal'?'heal':'speed'],
 invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',time_scale_raw:null,cooldown_raw:null,effects:[{kind,value_raw:kind==='heal'?550:4000,source_type:31,unit:'umatools_raw',extras_raw:{}}]}],...extra};
}
function fixture(skills){return {outfits:{uma:{id:'uma',name_jp:'育成',base_stars:3}},supports:{},scenarios:{},skills:Object.fromEntries(skills.map(s=>[s.id,s])),acquisition_routes:skills.map(s=>({skill_id:s.id,owner_type:'outfit',owner_id:'uma',kind:'self'})),evolution_rules:[],relations:[],internal_acceleration_comparison_cost:Object.fromEntries(skills.map(s=>[s.id,100])),purchase_stages:Object.fromEntries(skills.map(s=>[s.id,{base_cost:100,status:'verified',prerequisite_id:null}]))};}
const liveSetup={...setup,course:live.courses['10808'],outfitId:'114101',supportIds:['30282','30289'],spBudget:3000,mood:2,stats:{speed:2200,stamina:1500,power:1700,guts:1200,wisdom:1700},aptitudes:{distance:'S',surface:'A',style:'A'}};
function model(data,s){const c=buildCandidates(data,{...s,purchase:true,context:fixedContext(s)});return new PurchaseModel(data,new Map([...c.learned,...c.inheritance,...c.factorCandidates].map(r=>[r.id,r])),s);}
test('stage discounts are integer floors, circle/gold prices contain each lower stage once',()=>{
 assert.equal(discountedCost(101,4),65);assert.equal(discountedCost(110,5),66);
 const m=model(live,liveSetup);
 assert.equal(m.cheapest('201112'),60);assert.equal(m.cheapest('201111'),126);
 // Gold circle family: 100 + 110 (Lv5 white), 150 (standard Lv0 gold).
 const d=structuredClone(live);d.acquisition_routes.push({skill_id:'201113',owner_type:'outfit',owner_id:'114101',kind:'self'});
 assert.equal(model(d,liveSetup).cheapest('201113'),276);
});
test('Forever Young great-success route prices both golds and rejects alternative branch stacking',()=>{
 const m=model(live,liveSetup),p=m.selection(['202831','204191']);
 assert.equal(p.used,532);assert.equal(p.state.choices['30289-chain-final'],'1');
 assert.equal(m.selection(['202831','204181']).conflict,true);
 const d=structuredClone(live);d.acquisition_routes.push({skill_id:'204181',owner_type:'outfit',owner_id:'114101',kind:'self'});
 const alternative=model(d,liveSetup).selection(['202831','204181']);assert.equal(alternative.complete,true);assert.equal(alternative.conflict,undefined);
 const rows=model(d,liveSetup).routeRows(['202831','204181'],alternative).rows;
 assert.ok(rows.find(r=>r.id==='204181').routes.some(r=>r.owner_type==='outfit'));
 assert.ok(!rows.find(r=>r.id==='204181').routes.some(r=>r.owner_id==='30289'));
});
test('event pins affect acquisition and hint cost without requiring all rewards to be bought',()=>{
 const m=model(live,{...liveSetup,eventChoices:{'30282-chain-final':'2'}});
 assert.equal(m.selection(['202711']).conflict,true);
 const p=m.selection(['204031']);assert.equal(p.complete,true);assert.equal(p.prices['204031'],252);
 assert.deepEqual(m.routeRows(['204031']).rows.map(r=>r.id),['204031']);
});
test('evolution prices its original purchase chain and remains incompatible through a hidden gold node',()=>{
 const d=fixture([skill('lower'),skill('gold','target_speed',undefined,{rarity:'gold'}),skill('pink','target_speed',undefined,{rarity:'evolution'})]);
 d.relations=[{kind:'version_family',from_id:'lower',to_id:'gold'}];d.evolution_rules=[{base_id:'gold',evolved_id:'pink',owner_type:'outfit',owner_id:'uma',choice_group:'gold'}];
 d.purchase_stages.gold.prerequisite_id='lower';delete d.purchase_stages.pink;
 const c=buildCandidates(d,{...setup,purchase:true}),records=new Map(c.learned.map(s=>[s.id,s])),rules=selectionRules(d,records),m=new PurchaseModel(d,records,setup);
 assert.ok(!records.has('gold'));assert.equal(rules.compatible('lower','pink'),false);assert.equal(m.cheapest('pink'),160);
 assert.equal(m.routeRows(['pink']).rows[0].purchase_name,'gold');
});
test('missing purchase stages remain unknown and cannot enter automatic recommendations',()=>{
 const d=fixture([skill('unknown')]);delete d.purchase_stages.unknown;const e=new SkillOptimizer(d,setup),r=e.analyze();
 assert.ok(!r.selected.includes('unknown'));e.toggle('unknown',true);assert.equal(e.analyze().budget.complete,false);e.lock('unknown',true);e.useAutomatic();assert.equal(e.analyze().optimization.status,'infeasible');
});
test('budgeted joint search includes late speed that only becomes beneficial with acceleration',()=>{
 const phase=[[{field:'phase',operator:'>=',value:2}]],d=fixture([skill('speed','target_speed',phase),skill('accel','acceleration',phase)]);
 const e=new SkillOptimizer(d,{...setup,spBudget:120}),r=e.analyze();assert.deepEqual(r.selected.sort(),['accel','speed']);assert.equal(r.budget.used,120);assert.equal(r.budget.feasible,true);
 e.useAutomatic();const again=e.analyze();assert.deepEqual(again.selected.sort(),r.selected.sort());assert.deepEqual(again.comparison,r.comparison);
});
test('manual evaluation keeps choices, optimization honors locks/exclusions and reports budget conflicts',()=>{
 const d=fixture([skill('a'),skill('b')]),e=new SkillOptimizer(d,{...setup,spBudget:60});e.analyze();
 e.toggle('a',true);e.lock('a',true);e.toggle('b',false);e.useAutomatic();let r=e.analyze();assert.deepEqual(r.selected,['a']);assert.deepEqual(r.lockedIds,['a']);assert.ok(r.excludedIds.includes('b'));
 e.toggle('b',true);r=e.analyze();assert.equal(r.budget.feasible,false);assert.ok(r.selected.includes('b'));assert.equal(r.optimized,false);
 e.lock('b',true);e.useAutomatic();r=e.analyze();assert.equal(r.optimization.status,'infeasible');assert.deepEqual(r.lockedIds.sort(),['a','b']);
});
test('zero budget buys no skills and invalid budgets fail before evaluation',()=>{
 const d=fixture([skill('a')]);assert.equal(new SkillOptimizer(d,{...setup,spBudget:0}).analyze().budget.used,0);
 for(const value of [-1,1.5,NaN,Infinity])assert.throws(()=>new SkillOptimizer(d,{...setup,spBudget:value}),/SP/);
});
test('early acceleration does not enter late-acceleration tables or automatic purchase recommendations',()=>{
 const early=skill('early','acceleration',[[{field:'phase',operator:'==',value:0}]]),e=new SkillOptimizer(fixture([early]),setup),r=e.analyze();
 assert.equal(e.lateAcceleration('early'),false);assert.ok(!r.selected.includes('early'));assert.ok(!r.tables.acceleration.ordinary.includes('early'));
});
test('SSR deck constraints enforce ownership, one rental, character identity and target exclusion',()=>{
 const d=fixture([]);d.supports=Object.fromEntries(['a','b','c','d','e','f','g'].map((id,i)=>[id,{id,name_jp:'card'+i+' (SSR)',rarity:'SSR',type:'Speed'}]));
 assert.equal(validateDeck(d,setup,['a','b','c','d','e','f'],{ownedIds:['a','b','c','d','e']}).rentals,1);
 assert.throws(()=>validateDeck(d,setup,['a','b','c','d','f','g'],{ownedIds:['a','b','c','d','e']}),/렌탈/);
 d.supports.b.name_jp=d.supports.a.name_jp;assert.throws(()=>validateDeck(d,setup,['a','b']),/같은/);
 d.supports.a.name_jp='育成 (SSR)';assert.throws(()=>validateDeck(d,setup,['a']),/육성마/);
});
test('owned-deck recommendation returns six cards and keeps card locks/type counts',()=>{
 const d=fixture([skill('a')]);d.supports=Object.fromEntries(Array.from({length:7},(_,i)=>['c'+i,{id:'c'+i,name_jp:'card'+i+' (SSR)',rarity:'SSR',type:'Speed'}]));
 const result=recommendDecks(d,setup,{ownedIds:['c0','c1','c2','c3','c4','c5'],lockedIds:['c0'],typeCounts:{Speed:6},rentalAllowed:true});
 assert.ok(result.plans.length>0);for(const p of result.plans){assert.equal(p.supportIds.length,6);assert.ok(p.supportIds.includes('c0'));assert.ok(p.budget.feasible);validateDeck(d,setup,p.supportIds,{ownedIds:['c0','c1','c2','c3','c4','c5'],lockedIds:['c0'],typeCounts:{Speed:6}});}
});
test('actual JP Kyoto 2200m result has coherent costs, no early-only acceleration and stays reproducible',()=>{
 assert.equal(liveSetup.course.distance,2200);const e=new SkillOptimizer(live,liveSetup),first=e.analyze();
 assert.equal(first.budget.feasible,true);assert.equal(first.finalPlan.rows.reduce((sum,r)=>sum+r.price,0),first.budget.used);
 assert.equal(first.finalPlan.sortVerified,false);assert.ok(!first.tables.acceleration.ordinary.includes('202041'));
 for(const id of first.tables.acceleration.ordinary)assert.equal(e.lateAcceleration(id),true);
 e.useAutomatic();const again=e.analyze();assert.deepEqual(again.selected,first.selected);assert.deepEqual(again.budget,first.budget);
});
test('a zero-margin named activation helper is retained and priced when needed by a late skill',()=>{
 const helper=skill('101','target_speed',[[{field:'phase',operator:'==',value:0}]]);helper.invocations[0].effects[0].value_raw=0;
 const gated=skill('102','acceleration',[[{field:'phase',operator:'>=',value:2},{field:'is_used_skill_id',operator:'==',value:101}]]);
 const e=new SkillOptimizer(fixture([helper,gated]),{...setup,spBudget:120}),r=e.analyze();
 assert.deepEqual(r.selected.sort(),['101','102']);assert.equal(r.budget.used,120);assert.equal(e.marginal('101',[]).gain.median,0);assert.ok(r.skills.find(s=>s.id==='101').gain.median>0);assert.ok(r.finalPlan.rows.some(row=>row.id==='101'&&row.price===60));
});
test('a lower white alternative is available from its selected gold event without factor preparation',()=>{
 const lower=skill('lower'),gold=skill('gold','target_speed',undefined,{rarity:'gold'}),d=fixture([lower,gold]);
 d.supports.c={id:'c',name_jp:'card (SSR)',rarity:'SSR',type:'Speed'};d.acquisition_routes=[{skill_id:'gold',owner_type:'support',owner_id:'c',kind:'support_event'}];
 d.relations=[{kind:'version_family',from_id:'lower',to_id:'gold'}];d.purchase_stages.gold.prerequisite_id='lower';d.support_events={c:{source:'https://example.com',events:[{id:'event',choices:[{id:'1',label:'1번',rewards:[{skill_id:'gold',hint_level:2}]},{id:'2',label:'2번',rewards:[]}]}]}};
 const m=model(d,{...setup,supportIds:['c'],eventChoices:{event:'1'}});assert.equal(m.routeRows(['lower']).rows[0].factor,false);assert.equal(m.routeRows(['lower']).rows[0].routes[0].owner_id,'c');
 assert.equal(model(d,{...setup,supportIds:['c'],eventChoices:{event:'2'}}).routeRows(['lower']).rows[0].factor,true);
});
