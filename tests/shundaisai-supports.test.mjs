import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCandidates} from '../assets/candidates.mjs';
import {fixedContext} from '../assets/activation.mjs';
import {PurchaseModel} from '../assets/purchases.mjs';
import {SkillOptimizer} from '../assets/skill-optimizer.mjs';
import {recommendDecks,validateDeck} from '../assets/deck-optimizer.mjs';
import {cardName,selectableSupports} from '../assets/display.mjs';
import {searchKey} from '../assets/search-select.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path);
const setup={course:data.courses['10808'],outfitId:'114101',bloom:3,style:2,going:1,mood:2,weather:1,season:3,time:2,
 supportIds:['30322','30323'],scenarioId:'',spBudget:1000,
 stats:{speed:2200,stamina:1500,power:1700,guts:1200,wisdom:1700},aptitudes:{distance:'S',surface:'A',style:'A'}};
function model(overrides={},d=data){
 const s={...setup,...overrides},c=buildCandidates(d,{...s,purchase:true,context:fixedContext(s)});
 return new PurchaseModel(d,new Map([...c.learned,...c.inheritance,...c.factorCandidates].map(r=>[r.id,r])),s);
}
const routeIds=(card,kind)=>data.acquisition_routes.filter(r=>r.owner_type==='support'&&r.owner_id===card&&r.kind===kind).map(r=>r.skill_id).sort();

test('new SSR route catalogs match the reviewed JP event and training hint lists',()=>{
 assert.deepEqual(routeIds('30322','support_event'),['200362','203501','204731','204741','204751','210052']);
 assert.deepEqual(routeIds('30322','support_hint'),['200062','200362','201601','203242','203502','203652','203852','204072','204182','204512','204732','204742','204752','204762']);
 assert.deepEqual(routeIds('30323','support_event'),['200512','202551','202552','204812']);
 assert.deepEqual(routeIds('30323','support_hint'),[]);
 for(const id of ['30322','30323'])assert.ok(data.support_events[id]);
 // Link-event golds are scenario rewards, not unconditional rewards of these cards.
 assert.ok(!routeIds('30322','support_event').includes('204071'));
 assert.ok(!routeIds('30323','support_event').includes('204811'));
});

test('Mayano grants the common gold and exactly one alternative at great-success hint Lv2',()=>{
 for(const [choice,optional]of [['1','204731'],['2','204741'],['3','204751']]){
  const m=model({supportIds:['30322'],eventChoices:{'30322-chain-final':choice}});
  const priced=m.selection(['203501',optional]);
  assert.equal(priced.complete,true);assert.equal(priced.feasible,true);assert.equal(priced.used,532);
  assert.equal(priced.state.hints['203501'],2);assert.equal(priced.state.hints[optional],2);
  assert.equal(priced.prices['203501'],280);assert.equal(priced.prices[optional],252);
  assert.deepEqual(m.routeRows(['203501',optional],priced).events.map(e=>[e.id,e.choice,e.verified]),[['30322-chain-final',choice,true]]);
  assert.deepEqual(m.warnings,[]);
 }
});

test('Mayano alternative golds cannot stack and event pins cannot buy another branch',()=>{
 const m=model({supportIds:['30322']});
 for(const pair of [['204731','204741'],['204731','204751'],['204741','204751']])assert.equal(m.selection(pair).conflict,true);
 assert.equal(m.selection(['203501','204731','204741','204751']).conflict,true);
 assert.equal(model({eventChoices:{'30322-chain-final':'1'}}).selection(['204741']).conflict,true);
 assert.equal(m.selection(['204731']).complete,true); // Buying both rewards is optional.
});

test('Mayano second-event hint choice preserves final rewards and training hints survive random-event choice',()=>{
 for(const choice of ['1','2']){
  const m=model({supportIds:['30322'],eventChoices:{'30322-chain-second':choice,'30322-random-fashion':'2'}});
  const p=m.selection(['203501','204731']);assert.equal(p.complete,true);
  assert.equal(p.state.hints['210052']??0,choice==='2'?1:0);
  const plan=m.routeRows(['210052','200362']);
  assert.equal(plan.rows.find(r=>r.id==='210052').factor,choice==='1');
  assert.equal(plan.rows.find(r=>r.id==='200362').factor,false);
  assert.ok(plan.rows.find(r=>r.id==='200362').routes.some(r=>r.kind==='support_hint'));
 }
});

test('Mayano normal-success rewards remain evidence without accumulating into assumed great-success hints',()=>{
 const event=data.support_events['30322'].events.find(e=>e.id==='30322-chain-final');
 assert.equal(event.assumed_outcome,'great_success');
 for(const choice of event.choices){
  assert.deepEqual(choice.outcomes.great_success,choice.rewards);
  assert.deepEqual(choice.outcomes.success,choice.rewards.map(r=>({...r,hint_level:1})));
 }
 assert.equal(model({supportIds:['30322']}).selection(['203501']).state.hints['203501'],2);
});

test('Azuma outing rewards coexist with either invitation choice and price Divine Speed at Lv3',()=>{
 for(const choice of ['1','2']){
  const m=model({supportIds:['30323'],eventChoices:{'30323-outing-unlock':choice}}),p=m.selection(['202551']);
  assert.equal(p.complete,true);assert.equal(p.used,260);assert.equal(p.state.hints['202551'],3);
  assert.equal(p.state.hints['202552'],2);assert.equal(p.state.hints['200512'],3);
  assert.equal(p.state.hints['204812']??0,choice==='2'?5:0);
  assert.equal(m.routeRows(['204812']).rows[0].factor,choice==='1');
  assert.equal(m.routeRows(['202552']).rows[0].factor,false);
  assert.equal(m.routeRows(['202551']).events.find(e=>e.id==='30323-outing-5').verified,true);
  assert.deepEqual(m.warnings,[]);
 }
 const newYear=data.support_events['30323'].events.find(e=>e.id==='30323-new-year');
 assert.ok(newYear.condition_note.includes('외출 해금'));
});

test('Korean Azuma name is searchable while JP skills and raw card identity stay unchanged',()=>{
 const card=selectableSupports(data).find(c=>c.id==='30323');
 assert.equal(cardName(card),'아즈마');assert.equal(searchKey(cardName(card)),searchKey('아즈마'));
 assert.equal(card.name_jp,'吾妻 (SSR)');assert.equal(card.type,'Friend');
 assert.equal(data.supports['10149'].name_ko,'아즈마');assert.equal(data.support_events['10149'],undefined);
 assert.equal(data.skills['202551'].name_jp,'神速');
 assert.ok(!data.diagnostics.missing_korean_character_names.includes('吾妻'));
});

test('other unverified cards retain conservative single-gold routes and Lv0 prices',()=>{
 const card=Object.keys(data.supports).find(cid=>!data.support_events[cid]&&routeIds(cid,'support_event').filter(id=>data.skills[id].rarity==='gold').length>1);
 assert.ok(card);const m=model({supportIds:[card]}),group=m.groups.find(g=>!g.verified);
 assert.ok(group);assert.ok(m.warnings.includes(card));
 assert.ok(group.choices.every(c=>c.rewards.length===1&&c.rewards[0].hint_level===0));
 assert.equal(m.selection(group.choices.slice(0,2).map(c=>c.rewards[0].skill_id)).conflict,true);
});

test('new-card optimization retains locked legal gold pairs, budget and event pins',()=>{
 const s={...setup,eventChoices:{'30322-chain-final':'1'}},engine=new SkillOptimizer(data,s);
 for(const id of ['203501','204731','202551'])engine.lock(id,true);
 engine.useAutomatic();const result=engine.analyze();
 assert.equal(result.optimization.status,'ok');assert.equal(result.budget.feasible,true);
 for(const id of ['203501','204731','202551'])assert.ok(result.selected.includes(id));
 assert.ok(!result.selected.includes('204741'));assert.ok(!result.selected.includes('204751'));
 assert.equal(result.eventChoices['30322-chain-final'],'1');
 assert.equal(result.finalPlan.rows.reduce((sum,r)=>sum+r.price,0),result.budget.used);
});

test('owned-deck recommendation uses both new cards with the verified event pair and no rental',()=>{
 const ids=['30282','30289','30275','30311','30322','30323'];
 const constraints={ownedIds:ids,lockedIds:ids,rentalAllowed:false,lockedSkillIds:['203501','204731','202551']};
 const s={...setup,eventChoices:{'30322-chain-final':'1'}},result=recommendDecks(data,s,constraints);
 assert.ok(result.plans.length>0);
 for(const plan of result.plans){
  assert.equal(validateDeck(data,s,plan.supportIds,constraints).rentals,0);
  for(const id of constraints.lockedSkillIds)assert.ok(plan.selected.includes(id));
  const p=model({...s,supportIds:plan.supportIds}).selection(plan.selected);
  assert.equal(p.complete,true);assert.equal(p.used,plan.budget.used);assert.equal(plan.budget.feasible,true);
  assert.equal(p.state.choices['30322-chain-final'],'1');
 }
});
