import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCandidates} from '../assets/candidates.mjs';
import {fixedContext} from '../assets/activation.mjs';
import {PurchaseModel} from '../assets/purchases.mjs';
import {SkillOptimizer} from '../assets/skill-optimizer.mjs';
import {recommendDecks,validateDeck} from '../assets/deck-optimizer.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),planning=read('curated/planning.json');
const setup={course:data.courses['10808'],outfitId:'110802',bloom:3,style:4,going:1,mood:2,weather:1,season:3,time:2,
 supportIds:[],scenarioId:'',spBudget:3000,stats:{speed:2200,stamina:1500,power:1700,guts:1200,wisdom:1700},
 aptitudes:{distance:'S',surface:'A',style:'A'}};
function model(s=setup){
 const c=buildCandidates(data,{...s,purchase:true,context:fixedContext(s)});
 return new PurchaseModel(data,new Map([...c.learned,...c.inheritance,...c.factorCandidates].map(r=>[r.id,r])),s);
}

test('active JP bundle retains curated prices, event branches and explicit unverified purchase order',()=>{
 for(const field of ['cost_policy','support_events','purchase_order'])assert.deepEqual(data[field],planning[field]);
 assert.ok(Object.keys(data.purchase_stages).length>0);
 for(const [id,cost]of Object.entries(data.internal_acceleration_comparison_cost))if(cost>0){
  assert.ok(data.purchase_stages[id],`missing purchase stage ${id}`);
  assert.equal(data.purchase_stages[id].base_cost,cost);
 }
 // A source refresh must not silently detach manually verified rewards from their card.
 for(const [card,entry]of Object.entries(data.support_events))for(const event of entry.events)for(const choice of event.choices)for(const reward of choice.rewards){
  assert.ok(data.acquisition_routes.some(r=>r.owner_type==='support'&&r.owner_id===card&&r.kind==='support_event'&&r.skill_id===reward.skill_id),`${card}: missing reward route ${reward.skill_id}`);
 }
 assert.equal(data.purchase_order.status,'unverified');
});

test('October JP outfit exposes both evolutions, new event hints and inherited unique owner',()=>{
 const c=buildCandidates(data,{...setup,purchase:true,context:fixedContext(setup)}),ids=new Set(c.learned.map(r=>r.id));
 for(const id of ['111081','110802111','110802211','204802','203152','203362'])assert.ok(ids.has(id),`missing new candidate ${id}`);
 assert.ok(!ids.has('204801')); // Its evolution replaces the displayed gold, preserving its purchase chain.
 const inherited=buildCandidates(data,{...setup,outfitId:'114101',purchase:true,context:fixedContext(setup)}).inheritance.find(r=>r.id==='911081');
 assert.deepEqual(inherited.inheritance_outfit_ids,['110802']);
 assert.equal(model({...setup,outfitId:'114101'}).cheapest('911081'),200);
});

test('new gold and evolution charge the verified lower stage exactly once',()=>{
 const m=model();
 assert.equal(m.cheapest('204802'),114); // 190 * 60%, white Lv5.
 assert.equal(m.cheapest('204801'),304); // Lower 114 + gold 190, Lv0.
 assert.equal(m.cheapest('110802211'),304);
 assert.equal(m.cheapest('111081'),0);
 const priced=m.selection(['111081','110802211']),plan=m.routeRows(['111081','110802211'],priced);
 assert.equal(priced.used,304);assert.equal(plan.rows.length,1);
 assert.equal(plan.rows[0].purchase_id,'204801');
 assert.deepEqual(plan.rows[0].stages.map(s=>[s.id,s.cost]),[['204802',114],['204801',190]]);
 assert.equal(plan.sortVerified,false);
});

test('new JP outfit optimization stays within budget and preserves manual locks and exclusions',()=>{
 const engine=new SkillOptimizer(data,setup),first=engine.analyze();
 assert.equal(first.optimization.status,'ok');assert.equal(first.budget.feasible,true);
 assert.ok(first.budget.used>0&&first.budget.used<=setup.spBudget);
 assert.equal(first.finalPlan.rows.reduce((sum,row)=>sum+row.price,0),first.budget.used);
 assert.ok(first.finalPlan.rows.some(row=>row.id==='110802211'&&row.price===304));
 engine.useAutomatic();const repeat=engine.analyze();
 assert.deepEqual(repeat.selected,first.selected);assert.deepEqual(repeat.budget,first.budget);
 engine.lock('110802211',true);engine.toggle('110802111',false);engine.useAutomatic();
 const manual=engine.analyze();assert.ok(manual.selected.includes('110802211'));
 assert.ok(manual.lockedIds.includes('110802211'));assert.ok(manual.excludedIds.includes('110802111'));
 assert.ok(!manual.selected.includes('110802111'));assert.equal(manual.budget.feasible,true);
});

test('latest JP card catalog recommendation preserves owned cards, rental, types, event pins and skill intent',()=>{
 const s={...setup,course:data.courses['10913'],outfitId:'114101',style:2,eventChoices:{'30289-chain-final':'1'}};
 const constraints={ownedIds:['30282','30289','30275','30311','30312','30304','30023'],
  lockedIds:['30282','30289'],typeCounts:{Speed:3,Stamina:1,Power:1,Wit:1},rentalAllowed:true,
  lockedSkillIds:['202831'],excludedSkillIds:['204181']};
 const result=recommendDecks(data,s,constraints);
 assert.ok(result.plans.length>0);assert.equal(result.search,'bounded');
 for(const plan of result.plans){
  assert.equal(plan.supportIds.length,6);assert.ok(plan.selected.includes('202831'));assert.ok(!plan.selected.includes('204181'));
  assert.equal(plan.budget.feasible,true);assert.ok(plan.budget.used<=s.spBudget);
  const checked=validateDeck(data,s,plan.supportIds,constraints);assert.equal(checked.rentals,1);
  const purchase=model({...s,supportIds:plan.supportIds}).selection(plan.selected);
  assert.equal(purchase.complete,true);assert.equal(purchase.used,plan.budget.used);
  assert.equal(purchase.state.choices['30289-chain-final'],'1');
 }
});
