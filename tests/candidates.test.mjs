import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCandidates,evaluateCondition,possibleInContext,raceContext} from '../assets/candidates.mjs';
const manifest=JSON.parse(readFileSync(new URL('../data/manifest.json',import.meta.url)));
const data=JSON.parse(readFileSync(new URL('../'+manifest.dataset_path,import.meta.url)));

test('static course conditions reject impossible branches while dynamic conditions remain unknown',()=>{
 const condition=[[{field:'course_distance',operator:'>=',value:2000},{field:'order',operator:'<=',value:3}]];
 assert.equal(evaluateCondition(condition,{course_distance:1600}),false);
 assert.equal(evaluateCondition(condition,{course_distance:2400}),null);
 assert.equal(evaluateCondition(condition,{course_distance:2400,order:2}),true);
});
test('OR branches and preconditions are preserved',()=>{
 const dnf=[[{field:'running_style',operator:'==',value:1}],[{field:'running_style',operator:'==',value:2}]];
 assert.equal(evaluateCondition(dnf,{running_style:2}),true);
 assert.equal(evaluateCondition(dnf,{running_style:3}),false);
 assert.equal(evaluateCondition(null,{}),null);
});
test('three supplemental inherits are usable and do not inherit full native effects',()=>{
 for(const id of ['901351','901411','911091']){
  assert.equal(data.skills[id].inherited,true);assert.equal(data.skills[id].origin,'umasim');
  assert.ok(data.skills[id].parent_ids.length);assert.equal(data.skills[id].calculation_status,'unvalidated');
 }
 const course=data.courses['10606'];
 assert.equal(possibleInContext(data.skills['901411'],raceContext(course,2)),true);
 assert.equal(possibleInContext(data.skills['901411'],raceContext(course,3)),false);
});
test('a linked second effect cannot bypass an impossible first activation',()=>{
 const skill={invocations:[
  {condition:[[{field:'running_style',operator:'==',value:2}]],precondition:[]},
  {condition:[[{field:'is_activate_other_skill_detail',operator:'==',value:1}]],precondition:[]}
 ]};
 assert.equal(possibleInContext(skill,{running_style:3}),false);
 assert.equal(possibleInContext(skill,{running_style:2}),true);
});
test('support event candidates require neither event completion nor card level',()=>{
 const event=data.acquisition_routes.find(r=>r.kind==='support_event'&&data.skills[r.skill_id].categories.includes('speed')&&data.skills[r.skill_id].jp_available);
 assert.ok(event);
 const base=buildCandidates(data,{outfitId:'114101',supportIds:[event.owner_id]});
 // The raw gold may be replaced by its evolution, so inspect both endpoints.
 const ids=new Set(base.learned.map(s=>s.id));
 assert.ok(ids.has(event.skill_id)||data.evolution_rules.some(e=>e.base_id===event.skill_id&&ids.has(e.evolved_id)));
 assert.equal(event.event_conditions_affect_candidates,false);
});
test('obtainable white family is excluded from factor preparation',()=>{
 const hint=data.acquisition_routes.find(r=>r.kind==='support_hint'&&data.skills[r.skill_id].rarity==='white'&&data.skills[r.skill_id].categories.includes('speed'));
 const result=buildCandidates(data,{outfitId:'114101',supportIds:[hint.owner_id]});
 assert.ok(!result.factorCandidates.some(s=>s.id===hint.skill_id));
 assert.ok(result.factorCandidates.every(s=>s.rarity==='white'&&!s.inherited));
 assert.equal(result.factorTop10,null);assert.equal(result.recommendationStatus,'not_calculated');
});
test('pink evolves only in matching outfit or scenario and native base is not duplicated',()=>{
 const result=buildCandidates(data,{outfitId:'114101',scenarioId:'14'});
 const ids=new Set(result.learned.map(s=>s.id));
 for(const rule of data.evolution_rules){
  if(rule.owner_type==='outfit'&&rule.owner_id==='114101'&&ids.has(rule.evolved_id))assert.ok(!ids.has(rule.base_id));
 }
 assert.ok(result.learned.some(s=>s.rarity==='evolution'));
});
test('an unknown roster or support ID cannot silently produce a misleading list',()=>{
 assert.throws(()=>buildCandidates(data,{outfitId:'bad'}),/Unknown outfit/);
 assert.throws(()=>buildCandidates(data,{outfitId:'114101',supportIds:['bad']}),/Unknown support/);
});
test('ordinary factor unit is the skill ID and never a factor master ID',()=>{
 const result=buildCandidates(data,{outfitId:'114101'});
 assert.ok(result.factorCandidates.length>10);
 assert.ok(result.factorCandidates.every(s=>data.skills[s.id]&&!('factor_id' in s)));
});
test('special-event rarity-one buffs and innate traits are not ordinary factor suggestions',()=>{
 const result=buildCandidates(data,{outfitId:'114101'});
 assert.ok(!result.factorCandidates.some(s=>['1300051','1300041','1300071','1000011'].includes(s.id)));
 assert.ok(result.factorCandidates.every(s=>data.internal_acceleration_comparison_cost[s.id]>0));
});
test('a native two-star outfit uses the upgraded unique from three-star bloom onward',()=>{
 const low=buildCandidates(data,{outfitId:'100701',bloom:2});
 const high=buildCandidates(data,{outfitId:'100701',bloom:5});
 assert.ok(low.learned.some(s=>s.id==='10071'));
 assert.ok(!low.learned.some(s=>s.id==='100071'));
 assert.ok(high.learned.some(s=>s.id==='100071'));
 assert.ok(!high.learned.some(s=>s.id==='10071'));
});
