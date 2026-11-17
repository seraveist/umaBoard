import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflow} from '../assets/cm-workflow.mjs';

// Minimal host for navigation ownership; numerical and draft behavior stays in
// the existing chart/state/planner tests and real-browser interaction checks.
function host(narrow=false){
 const nodes=new Map();
 const node=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{id:selector.slice(1),dataset:{},attributes:{},listeners:{},hidden:false,parentElement:null,
   setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},
   addEventListener(type,listener){this.listeners[type]=listener;},focus(){document.activeElement=this;},scrollIntoView(){},
   append(child){child.parentElement=this;},contains(child){for(let current=child;current;current=current.parentElement)if(current===this)return true;return false;}
  });return nodes.get(selector);
 };
 const previous={document:globalThis.document,matchMedia:globalThis.matchMedia};
 globalThis.document={querySelector:node,activeElement:null};
 const media={matches:narrow,addEventListener(type,listener){this.change=listener;}};
 globalThis.matchMedia=()=>media;
 const resize=value=>{media.matches=value;media.change();};
 const key=(selector,value)=>node(selector).listeners.keydown({key:value,preventDefault(){}});
 return {node,resize,key,restore(){for(const [name,value]of Object.entries(previous))if(value===undefined)delete globalThis[name];else globalThis[name]=value;}};
}

test('stage gating and mobile views retain the single checklist and its existing record',()=>{
 const dom=host(true);try{
  const {node}=dom,workflow=createWorkflow();node('#checklist').record={hint:'3'};
  assert.equal(workflow.show('finish'),false);workflow.setChartState('ready');assert.equal(workflow.show('finish'),true);
  assert.equal(node('#checklist').parentElement,node('#finish-checklist-slot'));
  workflow.showPostView('result');assert.equal(node('#finish-checklist-slot').hidden,true);assert.equal(node('#post-result-panel').hidden,false);
  workflow.show('prepare');assert.equal(node('#checklist').parentElement,node('#prepare-checklist-slot'));
  workflow.show('finish');assert.equal(node('#workspace').dataset.postView,'result');assert.deepEqual(node('#checklist').record,{hint:'3'});
  workflow.setChartState('stale');assert.equal(workflow.stage,'prepare');assert.equal(node('#stage-finish').disabled,true);
 }finally{dom.restore();}
});

test('mobile keyboard and responsive focus never leave an active control in a hidden panel',()=>{
 const dom=host(true);try{
  const {node,key,resize}=dom,workflow=createWorkflow();workflow.setChartState('ready');workflow.show('finish');
  node('#post-view-record').parentElement=node('#post-view-tabs');node('#post-view-result').parentElement=node('#post-view-tabs');
  key('#post-view-tabs','ArrowRight');assert.equal(node('#post-view-result').attributes['aria-selected'],'true');assert.equal(document.activeElement,node('#post-view-result'));
  assert.equal(node('#post-result-panel').attributes.role,'tabpanel');key('#post-view-tabs','Home');assert.equal(node('#finish-checklist-slot').hidden,false);
  resize(false);assert.equal(node('#post-view-tabs').hidden,true);assert.equal(node('#post-result-panel').hidden,false);assert.equal(node('#finish-checklist-slot').hidden,false);assert.equal(node('#finish-checklist-slot').attributes.role,undefined);assert.equal(document.activeElement,node('#checklist-title'));
  node('#result-control').parentElement=node('#post-result-panel');node('#result-control').focus();resize(true);assert.equal(node('#post-result-panel').hidden,true);assert.equal(document.activeElement,node('#post-view-record'));
  key('#post-view-tabs','End');assert.equal(node('#post-view-result').tabIndex,0);assert.equal(node('#post-view-record').tabIndex,-1);
 }finally{dom.restore();}
});
