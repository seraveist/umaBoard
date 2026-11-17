import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventConstraints} from '../assets/cm-event-constraints.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read(read('data/manifest.json').dataset_path);
const setup={outfitId:'101301',scenarioId:'15',supportIds:['30311','30322']};
test('real Epiphaneia and Mayano common reward coexists with exactly one branch',()=>{
 const e=new EventConstraints(data,setup);
 assert.ok(e.selection(['204701','204531']));assert.equal(e.selection(['204531','204571']),null);
 assert.ok(e.selection(['203501','204731']));assert.equal(e.selection(['204731','204751']),null);
 assert.equal(e.selection(['415021','204731','204751']),null);
});
test('independent routes allow otherwise exclusive golds and pins remain binding',()=>{
 const extra={...data,acquisition_routes:[...data.acquisition_routes,{skill_id:'204751',owner_type:'outfit',owner_id:'101301',kind:'self'}]};
 assert.ok(new EventConstraints(extra,setup).selection(['204731','204751']));
 assert.equal(new EventConstraints(data,{...setup,eventChoices:{'30322-chain-final':'1'}}).selection(['204751']),null);
});
test('unreviewed multi-gold card is conservative and declares missing evidence',()=>{
 const support='30152',ids=data.acquisition_routes.filter(r=>r.owner_id===support&&r.kind==='support_event'&&data.skills[r.skill_id].rarity==='gold').map(r=>r.skill_id);
 const unreviewed={...data,support_events:{...data.support_events}};delete unreviewed.support_events[support];
 const e=new EventConstraints(unreviewed,{...setup,scenarioId:'',outfitId:'',supportIds:[support]});assert.ok(e.unverified.includes(support));assert.ok(e.selection([ids[0]]));assert.equal(e.selection(ids),null);
});
test('all multi-gold SSR cards have reviewed rare sets and fixed pairs coexist',()=>{
 const byCard=new Map();for(const r of data.acquisition_routes)if(r.kind==='support_event'&&data.supports[r.owner_id]?.rarity==='SSR'&&data.skills[r.skill_id]?.rarity==='gold'){if(!byCard.has(r.owner_id))byCard.set(r.owner_id,new Set());byCard.get(r.owner_id).add(r.skill_id);}
 for(const [id,ids]of byCard)if(ids.size>1){assert.ok(data.support_events[id],id);const covered=new Set(data.support_events[id].events.flatMap(e=>e.choices.flatMap(c=>c.rewards.map(r=>r.skill_id))));for(const skill of ids)assert.ok(covered.has(skill),id+':'+skill);}
 assert.ok(new EventConstraints(data,{...setup,supportIds:['30300']}).selection(['203121','204331']));
 assert.equal(new EventConstraints(data,{...setup,scenarioId:'',supportIds:['30173']}).selection(['200361','200381']),null);
 assert.ok(new EventConstraints(data,{...setup,supportIds:['30253']}).selection(['201051','202671']));
});
