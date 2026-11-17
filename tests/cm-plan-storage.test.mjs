import test from 'node:test';
import assert from 'node:assert/strict';
import {checklistPlanKey,restoreChecklistPlan,trimChecklistPlans} from '../assets/cm-plan-storage.mjs';

const input={outfitId:'uma',scenarioId:'14',supportIds:['b','a'],style:2};
const manifest={active_version:'current',checklist_data_sha256:'new',checklist_compatible_versions:['old']};

test('known race probabilities and sampling changes preserve acquisition history while using the new calculation inputs',()=>{
 const key=checklistPlanKey(input,'new'),record={states:{inherit:'owned',gold:'3'},postTraining:{values:{spBudget:300}}};
 const changed={...input,raceContext:{postNumber:7,popularity:4},samplingSeed:11};
 assert.equal(checklistPlanKey(changed,'new'),key);
 assert.deepEqual(restoreChecklistPlan({[key]:record},changed,manifest).plan,record);
 assert.equal(changed.raceContext.postNumber,7);
});

test('the newest compatible saved record wins across multiple old data versions',()=>{
 const a=checklistPlanKey(input,'a'),b=checklistPlanKey(input,'b');
 const plans={[a]:{savedAt:'2026-11-16T00:00:00Z',value:1},[b]:{savedAt:'2026-11-17T00:00:00Z',value:2}};
 assert.equal(restoreChecklistPlan(plans,input,{active_version:'c',checklist_record_versions:['a','b']}).plan.value,2);
});
test('reviewed route corrections reuse records and actual inputs without changing the previous saved plan',()=>{
 const old=checklistPlanKey(input,'old'),plans={[old]:{states:{evo:'owned',rare:'2'},postTraining:{values:{spBudget:325,discountTrait:'studious'}},savedAt:'yesterday'}};
 const restored=restoreChecklistPlan(plans,{...input,supportIds:['a','b']},manifest);
 assert.equal(restored.key,checklistPlanKey(input,'new'));assert.deepEqual(restored.plan,plans[old]);
 restored.plan.states.evo='0';assert.equal(plans[old].states.evo,'owned');
 assert.deepEqual(input.supportIds,['b','a']);
});
test('current saved input wins; unreviewed data, a different scenario or a different deck never migrate',()=>{
 const current=checklistPlanKey(input,'new'),old=checklistPlanKey(input,'old');
 assert.equal(restoreChecklistPlan({[current]:{value:2},[old]:{value:1}},input,manifest).plan.value,2);
 for(const other of [{...input,scenarioId:'15'},{...input,supportIds:['a']}])assert.equal(restoreChecklistPlan({[old]:{}},other,manifest).plan,null);
 assert.equal(restoreChecklistPlan({[old]:{}},input,{active_version:'unreviewed'}).plan,null);
});
test('a corrected effect/price version may restore only records and inputs through the explicit identity-compatible list',()=>{
 const old=checklistPlanKey(input,'old'),plan={states:{gold:'owned',evo:'3'},postTraining:{values:{spBudget:'400'}}};
 assert.deepEqual(restoreChecklistPlan({[old]:plan},input,{active_version:'corrected',checklist_record_versions:['old']}).plan,plan);
});
test('migrated versions share one saved-plan slot and do not evict a different recorded setup',()=>{
 const entries=Array.from({length:12},(_,i)=>[checklistPlanKey({...input,scenarioId:String(i)},'old'),{savedAt:String(i).padStart(3,'0')}]);
 const plans=Object.fromEntries(entries),newKey=checklistPlanKey({...input,scenarioId:'0'},'new');plans[newKey]={savedAt:'999'};
 const result=trimChecklistPlans(plans);assert.equal(Object.keys(result).length,13);for(const [key]of entries)assert.ok(Object.hasOwn(result,key));
 const extra=checklistPlanKey({...input,scenarioId:'outside'},'new');plans[extra]={savedAt:'998'};assert.equal(Object.keys(trimChecklistPlans(plans)).length,13);
});
