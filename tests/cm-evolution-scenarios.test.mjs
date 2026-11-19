import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCandidates} from '../assets/candidates.mjs';
import {activeAcquisitionRoute,requirementsMet,scenarioSelectionAllowed} from '../assets/acquisition-rules.mjs';
import {RecordedPurchaseModel,recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {createChartSetup,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {createSkillSourceResolver} from '../assets/cm-skill-presentation.mjs';
const read=file=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const data=read(read('data/manifest.json').dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const byName=name=>Object.values(data.skills).find(s=>s.name_jp===name&&!s.inherited).id;
const outfitId='101301';
const learned=setup=>new Set(buildCandidates(data,{outfitId,supportIds:[],bloom:5,preserveEvolutionBases:true,...setup}).learned.map(s=>s.id));

test(`all ${data.evolution_rules.length} evolution links have one gold base and a valid owner; unknown purchase costs remain excluded`,()=>{
 const bases=new Map();
 for(const r of data.evolution_rules){
  assert.equal(data.skills[r.base_id].rarity,'gold',r.evolved_id);assert.equal(data.skills[r.evolved_id].rarity,'evolution');
  assert.ok(data[r.owner_type==='outfit'?'outfits':'scenarios'][r.owner_id]);assert.equal(r.conditions_assumed_met,true);
  assert.ok(!bases.has(r.evolved_id)||bases.get(r.evolved_id)===r.base_id);bases.set(r.evolved_id,r.base_id);
  const rows=[r.base_id,r.evolved_id].map(id=>({...data.skills[id],evolutionBaseId:id===r.evolved_id?r.base_id:null}));
  const states={[r.base_id]:'2',[r.evolved_id]:'5'};
  const model=new RecordedPurchaseModel(data,rows,states);
  const evolution=model.selection([r.evolved_id]),rare=model.selection([r.base_id]);
  assert.equal(evolution.complete,rare.complete,r.evolved_id);assert.equal(evolution.used,rare.used,r.evolved_id);assert.deepEqual(evolution.stages,rare.stages,r.evolved_id);
  assert.equal(model.selection([r.evolved_id]).complete,data.purchase_stages[r.base_id]?.status==='verified',r.evolved_id);
  assert.equal(new RecordedPurchaseModel(data,rows,{[r.base_id]:'owned',[r.evolved_id]:'0'}).selection([r.evolved_id]).used,0);
 }
});

test('every outfit and scenario evolution is scoped to its owner and requires an actually reachable rare base',()=>{
 for(const id of Object.keys(data.outfits)){
  const ids=learned({outfitId:id,scenarioId:''});
  for(const r of data.evolution_rules.filter(r=>r.owner_type==='outfit'&&r.owner_id===id))assert.ok(ids.has(r.evolved_id),r.evolved_id);
  for(const evo of [...ids].filter(id=>data.skills[id].rarity==='evolution'))assert.ok(data.evolution_rules.some(r=>r.evolved_id===evo&&r.owner_type==='outfit'&&r.owner_id===id));
 }
 for(const r of data.evolution_rules.filter(r=>r.owner_type==='scenario')){
  const baseRoute=data.acquisition_routes.find(a=>a.skill_id===r.base_id&&a.owner_type==='outfit')||data.acquisition_routes.find(a=>a.skill_id===r.base_id&&a.owner_type==='support')||data.acquisition_routes.find(a=>a.skill_id===r.base_id&&a.owner_type==='scenario'&&a.owner_id===r.owner_id&&!Object.keys(a.requirements||{}).length);
  assert.ok(baseRoute,r.base_id);
  const setup={outfitId:baseRoute.owner_type==='outfit'?baseRoute.owner_id:outfitId,supportIds:baseRoute.owner_type==='support'?[baseRoute.owner_id]:[],scenarioId:r.owner_id};
  const yes=learned(setup),no=learned({...setup,scenarioId:''});
  assert.ok(yes.has(r.base_id)&&yes.has(r.evolved_id),r.evolved_id);assert.ok(!no.has(r.evolved_id),r.evolved_id);
 }
});

test('all nine scenario evolution pools allow two and reject any third, independently of outfit evolution',()=>{
 for(const sc of ['7','8','9','10','11','12','13','14','15']){
  const ids=data.evolution_rules.filter(r=>r.owner_type==='scenario'&&r.owner_id===sc).map(r=>r.evolved_id);
  const own=data.evolution_rules.find(r=>r.owner_type==='outfit').evolved_id;
  const group=data.scenario_exclusive_groups.find(g=>g.scenario_id===sc);assert.equal(group?.max_count,2);assert.deepEqual([...group.skill_ids].sort(),[...ids].sort());
  for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
   assert.ok(scenarioSelectionAllowed(data,[ids[a],ids[b],own],sc));
   for(let c=b+1;c<ids.length;c++)assert.equal(scenarioSelectionAllowed(data,[ids[a],ids[b],ids[c]],sc),false);
  }
 }
});

test('reviewed link rewards switch by actual outfit/deck identity without an unconditional source-tag bypass',()=>{
 const routes=data.acquisition_routes.filter(r=>r.kind==='scenario_curated'&&r.requirements?.character_link);
 assert.ok(routes.length>=70);
 for(const route of routes){
  const link=route.requirements.character_link;
  const no={outfitId:'',supportIds:[],scenarioId:route.owner_id};
  assert.equal(activeAcquisitionRoute(data,no,route),!link.present);
  for(const r of data.acquisition_routes.filter(r=>r.skill_id===route.skill_id&&r.owner_type==='scenario'&&r.owner_id===route.owner_id))assert.ok(r.requirements?.character_link,route.skill_id);
  const outfit=Object.values(data.outfits).find(o=>o.name_jp===link.name_jp);
  if(outfit)assert.equal(activeAcquisitionRoute(data,{...no,outfitId:outfit.id},route),link.present);
  for(const card of Object.values(data.supports).filter(s=>s.name_jp.replace(/\s+\((SSR|SR|R)\)$/,'')===link.name_jp))assert.equal(activeAcquisitionRoute(data,{...no,supportIds:[card.id]},route),link.present);
 }
 assert.equal(requirementsMet(data,{supportIds:[]},{unknown:true}),false);
 for(const value of [null,[],false])assert.equal(requirementsMet(data,{supportIds:[]},{support_link:value}),false);
 const rare=byName('機先の勝負'),white=byName('序盤巧者');
 const routes10=data.acquisition_routes.filter(r=>r.owner_type==='scenario'&&r.owner_id==='10'&&[rare,white].includes(r.skill_id));
 assert.equal(routes10.length,2);
 for(const supportIds of [[],['30241']]){
  const ids=routes10.filter(r=>activeAcquisitionRoute(data,{outfitId,supportIds,scenarioId:'10'},r)).map(r=>r.skill_id);
  assert.deepEqual(ids,[supportIds.length?rare:white]);
 }
});

test('scenario-only rewards and inferred purchase lowers stay in the right scenario and retain source captions',()=>{
 for(const sc of ['7','8','9','10','11','12','13','14']){
  const rewards=data.acquisition_routes.filter(r=>r.owner_type==='scenario'&&r.owner_id===sc&&r.kind==='scenario_curated');assert.ok(rewards.length);
  for(const route of rewards){
   assert.ok(route.source);assert.equal(activeAcquisitionRoute(data,{outfitId,supportIds:[],scenarioId:'15'},route),false);
  }
 }
 for(const [sc,name]of [['7','全身全霊'],['8','時中の妙'],['9','全身全霊'],['10','時中の妙'],['11','全身全霊'],['12','時中の妙'],['13','全身全霊'],['14','時中の妙']]){
  const id=byName(name),ids=learned({scenarioId:sc});assert.ok(ids.has(id),`${sc}: ${name}`);
  assert.ok(createSkillSourceResolver(data,{outfitId,supportIds:[],scenarioId:sc})({id}).includes('시나리오 스킬'));
 }
});

test('Twinkle Legends group reward requires its support card, never a coincidentally named outfit',()=>{
 const req={support_link:{name_jp:'伝説の体現者',present:true}};
 const fake={...data,outfits:{fake:{name_jp:'伝説の体現者'}}};
 assert.equal(requirementsMet(fake,{outfitId:'fake',supportIds:[]},req),false);
 assert.equal(requirementsMet(data,{outfitId,supportIds:['30241']},req),true);
});

test('actual stat thresholds change the ramen evolution effect without becoming an evolution unlock gate',()=>{
 const base=createChartSetup(data,profiles,{outfitId,style:2,courseId:'10811',scenarioId:'14',supportIds:[],bloom:5,uniqueLevel:6});
 // Use a known middle-distance course independently of this scenario's caps.
 base.course=Object.values(data.courses).find(c=>c.selectable&&c.distance===2200&&c.surface===1);
 const skill=data.skills['414041'];
 const low=compileChartSkill(skill,{...base,stats:{speed:999,stamina:1500,power:1500,guts:1500,wisdom:1500}});
 const high=compileChartSkill(skill,{...base,stats:{speed:1000,stamina:1000,power:1000,guts:1000,wisdom:1000}});
 assert.ok(low.invocations.some(i=>i.effects.some(e=>e.kind==='target_speed'&&e.value===.45)));
 assert.ok(!low.invocations.some(i=>i.effects.some(e=>e.kind==='speed_with_decel')));
 assert.ok(high.invocations.some(i=>i.effects.some(e=>e.kind==='speed_with_decel'&&e.value===.55)));
 for(let sample=0;sample<24;sample++)for(const [stats,index]of [[{speed:999,stamina:1500,power:1500,guts:1500,wisdom:1500},2],[{speed:1000,stamina:1000,power:1000,guts:1000,wisdom:1000},1]]){
  const setup={...base,stats},compiled=compileChartSkill(skill,setup);
  const result=simulateSolo(setup,[compiled],.5,{dt:.05,keepTrace:false,branchSampler:branchSampler(setup,[],sample)});
  assert.deepEqual(result.events.filter(e=>e.id===skill.id).map(e=>e.index),result.activation.eligibleIds.includes(skill.id)?[index]:[],`sample ${sample}: source priority when active; wisdom misses remain absent`);
 }
});

test('final recommendation preserves owned scenario evolutions, permits hint records for every alternative, and rejects over-limit owned records',async()=>{
 const setup=createChartSetup(data,profiles,{outfitId,style:2,courseId:'10811',scenarioId:'14',supportIds:['30304'],bloom:5,uniqueLevel:6});
 const ids=['414021','414031','414041'],rows=ids.flatMap(id=>{const r=data.evolution_rules.find(r=>r.evolved_id===id);return [{...data.skills[id],evolutionBaseId:r.base_id},data.skills[r.base_id]];});
 const chart={setup,rows,nativeIds:[]},input={stats:{speed:1600,stamina:1600,power:1400,guts:1300,wisdom:1200},spBudget:10000};
 const options={searchSamples:1,searchDt:.05,samples:1,dt:.05};
 await assert.rejects(()=>recommendFinalPlan(data,chart,Object.fromEntries(ids.map(id=>[id,'owned'])),input,options),/진화 제한/);
 const result=await recommendFinalPlan(data,chart,{[ids[0]]:'owned',[ids[1]]:'owned',[ids[2]]:'5'},input,options);
 assert.ok(result.activeIds.includes(ids[0])&&result.activeIds.includes(ids[1]));assert.ok(!result.activeIds.includes(ids[2]));
 assert.equal(result.scenarioEvolutionCount,2);assert.equal(result.evolutions.scenario.length,0);
 const allHints=await recommendFinalPlan(data,chart,Object.fromEntries(ids.map(id=>[id,'5'])),input,options);
 assert.ok(allHints.activeIds.filter(id=>ids.includes(id)).length<=2);
});
