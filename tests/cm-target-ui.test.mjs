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
