import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCandidates} from '../assets/candidates.mjs';
import {fixedContext,compileSkill} from '../assets/activation.mjs';
import {PurchaseModel} from '../assets/purchases.mjs';
import {SkillOptimizer} from '../assets/skill-optimizer.mjs';
import {selectionRules,previewToggle} from '../assets/selection.mjs';
import {recommendDecks} from '../assets/deck-optimizer.mjs';
import {requirementsMet,characterIdentity} from '../assets/acquisition-rules.mjs';
import {eventOwnerName} from '../assets/display.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),planning=read('curated/planning.json');
const setup={course:data.courses['10808'],outfitId:'114101',bloom:3,style:2,going:1,mood:2,weather:1,season:3,time:2,
 supportIds:['30322','30323','30264'],scenarioId:'15',spBudget:2000,
 stats:{speed:2200,stamina:1500,power:1700,guts:1200,wisdom:1700},aptitudes:{distance:'S',surface:'A',style:'A'}};
function build(overrides={},d=data){
 const s={...setup,...overrides},c=buildCandidates(d,{...s,purchase:true,context:fixedContext(s)});
 const records=new Map([...c.learned,...c.inheritance,...c.factorCandidates].map(r=>[r.id,r]));
 return {s,c,records,m:new PurchaseModel(d,records,s),rules:selectionRules(d,records)};
}
const golds=['200531','204071','204051','203741','201592'],whites=['200532','204072','204052','203742','201591'];
const names=['ダイワスカーレット','マヤノトップガン','ユキノビジン','ノーリーズン','ブラストワンピース'];

test('active scenario planning retains provenance, all 16 reward routes and the six evolution slots',()=>{
 assert.equal(data.scenarios['15'].name_jp,'朋、史解き ―午式駿大祭―');
 assert.deepEqual(data.scenario_events,planning.scenario_events);
 const routes=data.acquisition_routes.filter(r=>r.owner_type==='scenario'&&r.owner_id==='15');
 assert.equal(routes.length,16);
 const limit=data.scenario_exclusive_groups.find(g=>g.scenario_id==='15');assert.equal(limit.max_count,2);assert.equal(limit.skill_ids.length,6);
 for(const e of data.scenario_events['15'].events)for(const choice of e.choices)for(const reward of choice.rewards){
  assert.ok(routes.some(r=>r.event_id===e.id&&r.event_choice_id===choice.id&&r.skill_id===reward.skill_id));
 }
});

test('each link switches gold versus white by character identity, including non-SSR supports',()=>{
 for(let i=0;i<names.length;i++){
  const card=Object.values(data.supports).find(c=>characterIdentity(c.name_jp)===names[i]&&c.rarity!=='SSR');assert.ok(card,names[i]);
  for(const linked of [false,true]){
   const {m}=build({supportIds:linked?[card.id]:[],eventChoices:{'15-link-skill':String(i+1)}});
   const selected=m.groups.find(g=>g.id==='15-link-skill').choices.find(c=>c.id===String(i+1));
   assert.deepEqual(selected.rewards.map(r=>[r.skill_id,r.hint_level]),[[linked?golds[i]:whites[i],2]]);
   const scenarioGoldRoutes=(m.routes.get(golds[i])||[]).filter(r=>r.owner_type==='scenario');
   assert.equal(scenarioGoldRoutes.length,linked?1:0);
  }
 }
});

test('all Mayano outfits activate her gold link while unrelated outfits do not',()=>{
 const outfits=Object.values(data.outfits).filter(o=>o.name_jp==='マヤノトップガン');assert.ok(outfits.length>1);
 for(const outfit of outfits){
  const {m}=build({outfitId:outfit.id,supportIds:[],eventChoices:{'15-link-skill':'2'}});
  assert.equal(m.selection(['204071']).state.hints['204071'],2);
 }
 assert.equal(build({supportIds:[],eventChoices:{'15-link-skill':'2'}}).m.selection(['204071']).conflict,true);
});

test('Azuma link choice is gold without her card and does not require outing unlock',()=>{
 const {m}=build({supportIds:[],eventChoices:{'15-link-skill':'6'}}),p=m.selection(['204811']);
 assert.equal(p.complete,true);assert.equal(p.used,224);assert.equal(p.state.hints['204811'],2);
 assert.equal(m.routeRows(['204811']).events[0].scenario_id,'15');
});

test('six link choices are exclusive, but an independent support event can provide another gold',()=>{
 const {m}=build({supportIds:['30322'],eventChoices:{'15-link-skill':'2'}});
 assert.equal(m.selection(['204071','204811']).conflict,true);
 assert.equal(m.selection(['203501','204731','204071']).complete,true);
 const other=build({supportIds:['30283'],eventChoices:{'15-link-skill':'6'}}).m;
 const p=other.selection(['204071','204811']);assert.equal(p.complete,true);
 assert.ok(other.routeRows(['204071'],p).rows[0].routes.every(r=>r.owner_type!=='scenario'));
});

test('an independent gold source cannot borrow an inactive link hint discount',()=>{
 const {m}=build({supportIds:['30283'],eventChoices:{'15-link-skill':'2'}}),p=m.selection(['204071']);
 assert.equal(p.complete,true);assert.equal(p.state.hints['204071']??0,0);assert.equal(p.used,288);
 assert.ok(m.routeRows(['204071'],p).rows[0].routes.every(r=>r.owner_type==='support'));
});

test('festival golds are simultaneous Lv2 hints and the ending keeps its own hint group',()=>{
 const {m}=build({supportIds:[]}),p=m.selection(['200361','202801','210401']);
 assert.equal(p.complete,true);assert.equal(p.state.hints['200511'],1);
 assert.equal(p.state.hints['200361'],2);assert.equal(p.state.hints['202801'],2);assert.equal(p.state.hints['210402'],3);assert.equal(p.state.hints['210401'],2);
 assert.equal(p.prices['200361'],238);assert.equal(p.prices['202801'],224);assert.equal(p.prices['210401'],280);
 const plan=m.routeRows(['200361','202801','210401'],p);
 assert.deepEqual(plan.events.map(e=>e.id),['15-festival','15-ending']);
 assert.ok(plan.events.every(e=>eventOwnerName(data,e)===data.scenarios['15'].name_jp));
});

test('scenario rewards and their hints do not leak to other scenarios',()=>{
 const {c,m}=build({supportIds:[],scenarioId:'14'});
 assert.ok(!c.learned.some(s=>['204811','210401','415041'].includes(s.id)));
 assert.ok(!m.groups.some(g=>g.scenario_id==='15'));assert.equal(m.selection(['204811']).conflict,true);
});

test('unknown conditional route kinds remain unavailable instead of being guessed',()=>{
 assert.equal(requirementsMet(data,setup,{unknown_condition:true}),false);
 assert.equal(requirementsMet(data,setup,{character_link:{name_jp:'マヤノトップガン',present:true,unknown:true}}),false);
 const d=structuredClone(data);d.acquisition_routes.push({skill_id:'204811',owner_type:'scenario',owner_id:'14',kind:'scenario_curated',requirements:{unknown_condition:true}});
 assert.ok(!build({supportIds:[],scenarioId:'14'},d).c.learned.some(s=>s.id==='204811'));
});

test('native outfit evolutions do not consume the two scenario evolution slots',()=>{
 const {records,rules,m}=build({outfitId:'110802',style:4}),native=[...records.values()].find(s=>s.routes?.some(r=>r.kind==='evolution'&&r.owner_type==='outfit'));
 assert.ok(native);const ids=['415011','415021',native.id];
 assert.equal(rules.normalize(ids).length,3);assert.equal(m.selection(ids).complete,true);
});

test('two scenario evolutions retain original gold alternatives and reject a third evolution',()=>{
 const {records,rules,m}=build(),ids=['415011','415021','415031'];
 for(const id of [...ids,'202551','203501','202721'])assert.ok(records.has(id),id);
 assert.equal(rules.normalize(ids).length,2);assert.equal(m.selection(ids).conflict,true);
 const legal=['415011','415021','202721'];assert.equal(rules.normalize(legal).length,3);assert.equal(m.selection(legal).complete,true);
 assert.equal(rules.compatible('415011','202551'),false);
});

test('manual preview, bulk selection and locks preserve the two-evolution cap',()=>{
 const {records,rules}=build(),selected=['415011','415021'];
 const preview=previewToggle(records,rules,selected,'415031',true,new Set(selected));
 assert.deepEqual(preview.selected,selected);assert.match(preview.notice,/최대 2개/);
 const engine=new SkillOptimizer(data,setup);engine.selectMany(['415011','415021','415031']);
 assert.equal([...engine.selected].filter(id=>id.startsWith('415')).length,2);
 engine.lock('415011',true);engine.lock('415021',true);engine.lock('415031',true);
 assert.ok(!engine.lockedIds.has('415031'));assert.ok(engine.lockedIds.has('415011')&&engine.lockedIds.has('415021'));
});

test('automatic search keeps two locked scenario evolutions and can still buy the unevolved gold',()=>{
 const s={...setup,eventChoices:{'15-link-skill':'2','30322-chain-final':'1'}};
 const engine=new SkillOptimizer(data,s);for(const id of ['415011','415021','202721'])engine.lock(id,true);
 engine.useAutomatic();const result=engine.analyze();
 assert.equal(result.optimization.status,'ok');assert.equal(result.budget.feasible,true);
 assert.equal(result.selected.filter(id=>id.startsWith('415')).length,2);
 for(const id of ['415011','415021','202721'])assert.ok(result.selected.includes(id));
 assert.equal(result.eventChoices['15-link-skill'],'2');
 assert.equal(result.finalPlan.rows.reduce((sum,r)=>sum+r.price,0),result.budget.used);
});

test('scenario outcome assumptions do not fabricate support for variable ending effects',()=>{
 const skill=data.skills['210401'],compiled=compileSkill(skill,setup);
 assert.equal(compiled.status,'unsupported');assert.ok(compiled.reasons.includes('가변 효과량'));
 assert.ok(data.scenario_events['15'].assumption.includes('조건 충족 가정'));
 assert.ok(data.scenario_events['15'].evolution_conditions['415051'].includes('2개'));
});

test('deck recommendation accounts for the new cards, link pin and scenario evolution cap',()=>{
 const ids=['30282','30289','30275','30311','30322','30323'],s={...setup,eventChoices:{'15-link-skill':'2','30322-chain-final':'1'}};
 const result=recommendDecks(data,s,{ownedIds:ids,lockedIds:ids,rentalAllowed:false,lockedSkillIds:['415011','415021']});
 assert.ok(result.plans.length>0);
 for(const plan of result.plans){
  assert.equal(plan.budget.feasible,true);assert.equal(plan.selected.filter(id=>id.startsWith('415')).length,2);
  const {m}=build({...s,supportIds:plan.supportIds});const p=m.selection(plan.selected);
  assert.equal(p.used,plan.budget.used);assert.equal(p.state.choices['15-link-skill'],'2');
 }
});
