import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rarityBadge,createSkillSourceResolver} from '../assets/cm-skill-presentation.mjs';

test('only rare and evolution have name-line badges',()=>{
 assert.deepEqual(rarityBadge({rarity:'gold'}),{label:'레어',kind:'rare'});assert.deepEqual(rarityBadge({rarity:'evolution'}),{label:'진화',kind:'evolution'});
 for(const rarity of ['white','inherited','unique'])assert.equal(rarityBadge({rarity}),null);
});

test('route labels use selected owners, distinguish verified paths, and mark derived or factor paths',()=>{
 const skills=Object.fromEntries(['self','event','scenario','hint','support','other','lower','factor','unknown','evo','inherit'].map(id=>[id,{id,rarity:'white'}]));skills.self.rarity='gold';skills.evo.rarity='evolution';skills.inherit.inherited=true;
 const route=(skill_id,owner_type,owner_id,kind)=>({skill_id,owner_type,owner_id,kind});
 const data={skills,acquisition_routes:[route('self','outfit','u','self'),route('event','outfit','u','outfit_event'),route('scenario','scenario','s','scenario_event'),route('hint','support','c','support_hint'),route('support','support','c','support_event'),route('other','support','unselected','support_event')],purchase_stages:{support:{status:'verified',prerequisite_id:'lower'}},evolution_rules:[{base_id:'self',evolved_id:'evo',owner_type:'outfit',owner_id:'u'}],internal_acceleration_comparison_cost:{factor:100}};
 const source=createSkillSourceResolver(data,{outfitId:'u',scenarioId:'s',supportIds:['c']});
 for(const [id,text]of [['self','각성 스킬'],['event','육성마 이벤트'],['scenario','시나리오 스킬'],['hint','서포트 힌트'],['support','서포트 이벤트'],['evo','각성 스킬'],['inherit','계승 스킬'],['lower','서포트 이벤트 (추정)'],['factor','인자 후보 (추정)'],['other','획득 경로 미확인']])assert.equal(source({id}),text,id);
});

test('current JP setup resolves native evolution, selected support event and inheritance without borrowed owners',()=>{
 const read=file=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8')),data=read(read('data/manifest.json').dataset_path);
 const source=createSkillSourceResolver(data,{outfitId:'101301',scenarioId:'15',supportIds:['30322']});
 assert.match(source({id:'101301211'}),/각성/);assert.match(source({id:'204731'}),/서포트 이벤트/);assert.equal(source({id:'900271'}),'계승 스킬');assert.equal(source({id:'204732'}),'서포트 힌트');
});
