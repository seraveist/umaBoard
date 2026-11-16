import test from 'node:test';
import assert from 'node:assert/strict';
import {checklistPlanKey,restoreChecklistPlan} from '../assets/cm-plan-storage.mjs';

const input={outfitId:'uma',scenarioId:'14',supportIds:['b','a'],style:2};
const manifest={active_version:'current',checklist_data_sha256:'new',checklist_compatible_versions:['old']};
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
