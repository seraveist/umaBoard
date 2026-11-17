import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAccelerationPanel} from '../assets/cm-acceleration-ui.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

// A small DOM port tests the renderer's output contract; this is deliberately
// not reported as a browser layout or screenshot test.
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.hidden=false;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
}
test('target frame renders complete rare sets, preserves records and invalidates an old result',()=>{
 const ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>['#'+m[1],new Element('div')]));
 globalThis.document={querySelector:selector=>ids.get(selector),createElement:tag=>new Element(tag)};
 try{
  const data={skills:{g:{id:'g',name_jp:'目標レア',rarity:'gold',categories:['acceleration']},c:{id:'c',name_jp:'共通レア',rarity:'gold',categories:['speed']}},supports:{card:{id:'card',name_jp:'テスト (SSR)',name_ko:'테스트'}}};
  const panel=createAccelerationPanel({data,display:{icons:{}},skillDetails:{attach(){}}});
  const records={g:'unavailable',c:'owned'};
  panel.render({skills:[{id:'g',rarity:'gold',routes:[]}],gain:1.25,cost:120,scenarioEvolutionCount:0,sacrificedGain:0,search:{method:'bounded'},rewards:[{cardId:'card',ids:['c','g'],targetIds:['g'],reason:'target',alternatives:[{ids:['c']}]}]});
  assert.equal(ids.get('#target-acceleration').hidden,false);assert.equal(ids.get('#target-skill-list').children.length,1);
  assert.equal(ids.get('#target-reward-list').children.length,1);assert.equal(ids.get('#target-cost').textContent,'120');
  assert.deepEqual(records,{g:'unavailable',c:'owned'});panel.stale();assert.ok(ids.get('#target-acceleration').classes.has('is-stale'));panel.clear();assert.equal(ids.get('#target-acceleration').hidden,true);
 }finally{delete globalThis.document;}
});
test('the target frame belongs to preparation and its optional lock reaches the final worker input',()=>{
 assert.ok(html.indexOf('id="target-acceleration"')>html.indexOf('id="checklist"'));
 assert.ok(html.indexOf('id="target-acceleration"')<html.indexOf('id="finish-stage"'));
 const ui=readFileSync(new URL('../assets/cm-final-ui.mjs',import.meta.url),'utf8');
 assert.ok(ui.includes('maintainTargetAcceleration:raw.maintainTargetAcceleration'));
 assert.ok(ui.includes('value?.maintainTargetAcceleration!==false'));
});

test('target rows show signed contribution values in descending order without mutating the plan',()=>{
 const ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>['#'+m[1],new Element('div')]));
 globalThis.document={querySelector:selector=>ids.get(selector),createElement:tag=>new Element(tag)};
 try{
  const data={skills:Object.fromEntries(['low','high'].map(id=>[id,{id,name_jp:id,rarity:'white'}]))};
  const panel=createAccelerationPanel({data,display:{icons:{}},skillDetails:{attach(){}}});
  const plan={skills:[{id:'low',routes:[],marginalGain:.123},{id:'high',routes:[],marginalGain:1.236}],skillGainPolicy:'remove-one-from-target',gain:1.5,cost:120,scenarioEvolutionCount:0,sacrificedGain:0,search:{method:'bounded'},rewards:[]};
  const before=JSON.stringify(plan);panel.render(plan);
  const rows=ids.get('#target-skill-list').children;
  assert.equal(rows[0].children[2].children[1].textContent,'+1.24마신');
  assert.equal(rows[1].children[2].children[1].textContent,'+0.12마신');
  assert.match(rows[0].children[2].title,/제외했을 때/);
  assert.match(ids.get('#target-search-note').textContent,/내림차순/);
  assert.match(ids.get('#target-inheritance-note').textContent,/최대 6개/);
  assert.equal(JSON.stringify(plan),before);
 }finally{delete globalThis.document;}
});

test('inherited target rows show their exact provider outfit portrait and Korean identity',()=>{
 const ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>['#'+m[1],new Element('div')]));
 globalThis.document={querySelector:selector=>ids.get(selector),createElement:tag=>new Element(tag)};
 try{
  const path='assets/portraits/outfits/114101-'+ 'a'.repeat(40)+'.webp';
  const data={skills:{inherit:{id:'inherit',name_jp:'光れ',rarity:'inherited',inherited:true,parent_ids:['unique']}},outfits:{114101:{id:'114101',name_ko:'에피파네이아',name_jp:'エピファネイア',outfit_name_jp:"Fate’s Chosen Star"}},acquisition_routes:[{skill_id:'unique',owner_type:'outfit',owner_id:'114101'}]};
  const panel=createAccelerationPanel({data,display:{icons:{}},portraits:{outfits:{114101:{path}}},skillDetails:{attach(){}}});
  panel.render({skills:[{id:'inherit',inherited:true,rarity:'inherited',routes:[],providers:['114101']}],gain:2,cost:120,scenarioEvolutionCount:0,sacrificedGain:0,search:{method:'bounded'},rankComparison:{},rewards:[]});
  const row=ids.get('#target-skill-list').children[0],copy=row.children[1],badge=copy.children.find(n=>n.className==='target-providers').children[0];
  assert.match(badge.title,/에피파네이아.*Fate/);assert.equal(badge.children[0].children[0].src,path);
  assert.match(badge.children[1].textContent,/에피파네이아/);assert.match(ids.get('#target-policy').textContent,/순위 조건별/);
  assert.equal(ids.get('#target-inherited-count').textContent,'1 / 6');
  const speedRows=Array.from({length:6},(_,i)=>({id:'speed'+i,inherited:true}));
  panel.updateAcquisition(speedRows,Object.fromEntries(speedRows.map(r=>[r.id,'owned'])));
  assert.match(ids.get('#target-inheritance-note').textContent,/모두 유지하면 7개/);assert.match(ids.get('#target-inheritance-note').textContent,/1개를 교체/);
  panel.render({skills:[{id:'inherit',inherited:true,rarity:'inherited',routes:[]}],gain:2,cost:120,scenarioEvolutionCount:0,sacrificedGain:0,search:{method:'bounded'},rewards:[]});
  assert.equal(ids.get('#target-skill-list').children[0].children[1].children.find(n=>n.className==='target-providers').children[0].children[0].children[0].src,path);
 }finally{delete globalThis.document;}
});
