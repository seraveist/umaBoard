import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileSkill,branchReady,sampleBranches} from '../assets/activation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {compileChartSkill,branchSampler,prepareChart,createChartSetup} from '../assets/cm-chart.mjs';
import {styleRecommendation,selectInheritedTop} from '../assets/cm-recommendation.mjs';
import {intersectWindows,randomWindow} from '../assets/condition-windows.mjs';
import {selectableCourse,withReviewedGeometry} from '../assets/reviewed-course-geometry.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const atom=(field,value,operator='==')=>({field,value,operator});
const raw=(id,condition,extra={})=>({id,name_jp:id,rarity:'white',inherited:false,jp_available:true,activation_raw:0,parent_ids:[],categories:['acceleration'],invocations:[{index:1,condition:[condition],precondition:[],duration_raw:24000,duration_unit:'umatools_base_time',effects:[{kind:'acceleration',value_raw:2000,source_type:31,unit:'umatools_raw',extras_raw:{}}]}],...extra});
const course={id:'arbitrary-boundary',selectable:true,distance:1200,distance_type:1,track_id:'10008',surface:1,turn:1,course_set_status:[],corners:[{start:500,length:300},{start:800,length:200}],straights:[{start:0,end:500},{start:1000,end:1200}],slopes:[]};
const setup={course,stats:{speed:1400,stamina:2200,power:1500,guts:1000,wisdom:1200},style:3,going:1,mood:2,bloom:5,uniqueLevel:6,raceContext:{},aptitudes:{distance:'A',surface:'A',style:'A'}};
const crossing=[atom('phase',1),atom('is_finalcorner',1),atom('corner',0,'!=')];

test('mixed frame-start phase and frame-end geometry preserve an exact boundary without a coordinate shift',()=>{
 const skill=raw('arbitrary-crossing',crossing),c=compileSkill(skill,setup);assert.notEqual(c.status,'inactive');
 assert.deepEqual(c.invocations[0].condition.map(b=>b.windows),[[[800,800]]]);
 for(const dt of [.005,.01,.05]){
  const a=simulateSolo(setup,[c],.5,{dt,keepTrace:false}),b=simulateSolo(setup,[c],.5,{dt,keepTrace:false,scheduleConditions:false});
  assert.equal(a.events.length,1);const e=a.events[0];assert.ok(e.frameStartX<800&&e.x>=800&&e.x<800+30*dt);
  assert.equal(a.finishTime,b.finishTime);assert.deepEqual(a.events,b.events);
 }
});
test('a boundary is a one-crossing event, not a permanent or widened opportunity',()=>{
 const branch=sampleBranches(compileSkill(raw('once',crossing),setup).invocations[0].condition,.5)[0];
 assert.equal(branchReady(branch,{x:800.1,prevX:799.9},'once'),true);
 assert.equal(branchReady(branch,{x:799.9,prevX:799.7},'once'),false);
 assert.equal(branchReady(branch,{x:800.3,prevX:800.1},'once'),false);
 assert.deepEqual(intersectWindows([[800,800]],[[800,801]]),[[800,800]]);
 assert.deepEqual(intersectWindows([[800,800]],[[799,800]]),[]);
});
test('separate mixed-position gates require an actual frame crossing rather than a fitted distance tolerance',()=>{
 for(const start of [800.1,802,820]){
  const s={...setup,course:{...course,corners:[course.corners[0],{start,length:1000-start}]}};
  const branch=sampleBranches(compileSkill(raw('separate-gates',crossing),s).invocations[0].condition,.5)[0];
  assert.deepEqual(branch.windows,[[start,start]]);
  assert.equal(branchReady(branch,{prevX:799.9,x:start+.01},'separate-gates'),true);
  assert.equal(branchReady(branch,{prevX:800.01,x:start+.01},'separate-gates'),false);
  assert.equal(branchReady(branch,{prevX:799.8,x:799.99},'separate-gates'),false);
 }
});
test('contradictory predicates at the same evaluation position remain inactive',()=>{
 for(const atoms of [[atom('phase',1),atom('phase',2)],[atom('is_finalcorner',0),atom('is_finalcorner',1)]])assert.equal(compileSkill(raw('impossible',atoms),setup).status,'inactive');
});
test('distance-rate uses the updated position while furlong uses the frame-start position',()=>{
 const rate=sampleBranches(compileSkill(raw('rate',[atom('distance_rate',50,'>=')]),setup).invocations[0].condition,.5)[0];
 assert.equal(rate.frameStartWindows,undefined);assert.deepEqual(rate.frameEndWindows,[[600,1200]]);
 assert.equal(branchReady(rate,{prevX:599.9,x:600.1},'rate'),true);
 const furlong=sampleBranches(compileSkill(raw('furlong',[atom('furlong',4)]),setup).invocations[0].condition,.5)[0];
 assert.deepEqual(furlong.frameStartWindows,[[800,1000]]);assert.equal(furlong.frameEndWindows,undefined);
 assert.equal(branchReady(furlong,{prevX:799.9,x:800.1},'furlong'),false);
 assert.equal(branchReady(furlong,{prevX:800.1,x:800.3},'furlong'),true);
});
test('generic random spatial draws retain the cited two-metre end guard',()=>{
 assert.deepEqual(randomWindow([[200,800]],1),{at:798,window:[798,800]});
 assert.deepEqual(randomWindow([[200,800]],.5),{at:500,window:[500,510]});
});
test('final-straight entry is one crossing and cannot wait for a later rank change',()=>{
 const r=raw('entry',[atom('is_last_straight_onetime',1),atom('order',5)]),c=compileSkill(r,setup);
 assert.deepEqual(c.invocations[0].condition.map(b=>b.windows),[[[1000,1000]]]);
 for(const [timeline,expected]of [[[{distance:0,rank:5}],1],[[{distance:0,rank:2},{distance:1001,rank:5}],0]]){
  const s={...setup,raceContext:{rankTimeline:timeline}};
  assert.equal(simulateSolo(s,[c],.5,{dt:.01,keepTrace:false,branchSampler:branchSampler(s,[],0)}).events.length,expected);
 }
});
test('specific random corner numbers select the last four corners and retain missing-number gaps',()=>{
 const s={...setup,course:{...course,corners:Array.from({length:6},(_,i)=>({start:100*(i+1),length:50}))}};
 const c=compileSkill(raw('specific-corner',[atom('corner_random',1)]),s);
 assert.deepEqual(c.invocations[0].condition[0].drawWindows,[[300,350]]);
 assert.equal(compileSkill(raw('missing-corner',[atom('corner_random',1)]),setup).status,'inactive');
 assert.deepEqual(compileSkill(raw('third-corner',[atom('corner_random',3)]),setup).invocations[0].condition[0].drawWindows,[[500,800]]);
});
test('a boundary still obeys rank, possession and other dynamic gates',()=>{
 const r=raw('gated',[...crossing,atom('order',5),atom('is_exist_skill_id',123)]),s={...setup,raceContext:{rankTimeline:[{distance:0,rank:5}]}};
 const c=compileChartSkill(r,s);
 for(const [rank,owned,expected]of [[5,true,1],[5,false,0],[2,true,0]]){
  const context={...s,raceContext:{rankTimeline:[{distance:0,rank}]},possessionIds:owned?['123']:[]};
  const value=simulateSolo(context,[c],.5,{dt:.01,keepTrace:false,branchSampler:branchSampler(context,[],0)});
  assert.equal(value.events.length,expected);
 }
});
test('random spatial draws use their own domain before deterministic gates and cannot wait past the cached chance',()=>{
 const r=raw('unconditioned-draw',[atom('phase_random',1),atom('remain_distance',500,'<=')]),b=compileSkill(r,setup).invocations[0].condition[0];
 assert.deepEqual(b.drawWindows,[[200,800]]);assert.deepEqual(b.windows,[[699,800]]);
 const early=sampleBranches([b],.1)[0],late=sampleBranches([b],.9)[0];
 assert.equal(early.at,260);assert.deepEqual(early.windows,[]);assert.deepEqual(late.windows,[[740,750]]);
 assert.equal(simulateSolo(setup,[compileSkill(r,setup)],.1,{dt:.01,keepTrace:false}).events.length,0);
});
test('unmeasured encounter timing retains its assumed window and does not erase a boundary event',()=>{
 const regular=compileSkill(raw('assumed-time',[atom('phase',1),atom('is_overtake',1)]),setup).invocations[0].condition[0];
 const sampled=sampleBranches([regular],.5)[0];assert.equal(sampled.at,500);assert.deepEqual(sampled.windows,regular.windows);
 const boundary=compileSkill(raw('assumed-boundary',[...crossing,atom('is_overtake',1)]),setup).invocations[0].condition[0];
 const point=sampleBranches([boundary],.5)[0];assert.equal(point.at,800);assert.deepEqual(point.windows,[[800,800]]);
 assert.equal(branchReady(point,{x:800.1,prevX:799.9},'assumed-boundary'),true);
});
test('two-corner draws follow the replacement distribution rather than forcing both corners',()=>{
 const r=raw('distribution',[atom('all_corner_random',1)]),c=compileChartSkill(r,setup),counts=[0,0,0];
 for(let sample=0;sample<4096;sample++){
  const w=branchSampler(setup,[],sample)(c.invocations[0].condition,r.id,c.invocations[0],false)[0].windows;
  assert.equal(w.length,2);const first=w[0][0]<800,second=w[1][0]<800;
  counts[first&&second?0:!first&&!second?1:2]++;
 }
 for(const [i,p]of [[0,.25],[1,.25],[2,.5]])assert.ok(Math.abs(counts[i]/4096-p)<.04,JSON.stringify(counts));
});
test('style admission depends on source conditions and survives arbitrary skill-ID changes',()=>{
 const rankOnly=raw('900511',[atom('phase',2),atom('order',6)]),renamed={...rankOnly,id:'unknown-independent-id'};
 for(const skill of [rankOnly,renamed])assert.deepEqual(styleRecommendation(skill,compileSkill(skill,setup),setup).allowedStyles,[1,2,3,4]);
 const restricted=raw('restricted',[atom('phase',2),atom('running_style',2)]),result=styleRecommendation(restricted,compileSkill(restricted,setup),setup);
 assert.deepEqual(result.allowedStyles,[2]);assert.equal(result.eligible,false);
});
test('actual rear-style Tsubomi survives default candidate admission in both newly audited short/mile courses',()=>{
 for(const courseId of ['10302','10903'])for(const style of [3,4]){
  const t=prepareChart(data,profiles,{skills:{}},{outfitId:'102201',style,courseId,scenarioId:'12',supportIds:[]},{samples:18,dt:.05});
  const row=t.evaluate(t.rows.find(r=>r.id==='900511'));assert.ok(row.gain>0);assert.equal(row.recommendation.eligible,true);assert.equal(selectInheritedTop([row])[0].id,'900511');
 }
});
test('actual Kanata survives the unchanged Chukyo1800/Hanshin2400 boundary geometry',()=>{
 for(const courseId of ['10708','10907']){
  const s=createChartSetup(data,profiles,{outfitId:'102201',style:3,courseId,scenarioId:'12',supportIds:[],raceContext:{rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}}});
  const c=compileChartSkill(data.skills['900591'],s),run=simulateSolo(s,[c],.5,{dt:.01,keepTrace:false,branchSampler:branchSampler(s,[],0)});
  assert.notEqual(c.status,'inactive');assert.equal(run.events.length,1);
  const edge=s.course.distance*2/3;assert.ok(run.events[0].frameStartX<edge&&run.events[0].x>=edge);
 }
});
test('verified zero-runup US geometry is admitted while positive, unknown or changed geometry stays blocked',()=>{
 const usa=Object.values(data.courses).filter(c=>Number(c.track_id)>=10202),allowed=usa.filter(selectableCourse);
 assert.equal(allowed.length,14);assert.ok(allowed.some(c=>c.id==='11709'));
 for(const c of allowed){const reviewed=withReviewedGeometry(c);assert.equal(reviewed.run_up_m,0);assert.equal(reviewed.geometryReview.status,'verified-zero-runup');}
 for(const id of ['11619','11707'])assert.equal(selectableCourse(data.courses[id]),false);
 const changed=structuredClone(withReviewedGeometry(data.courses['11709']));changed.corners[0].start+=1;assert.equal(selectableCourse(changed),false);
 assert.equal(selectableCourse({...data.courses['11709'],id:'unknown-us-course'}),false);
 assert.equal(createChartSetup(data,profiles,{outfitId:'102201',style:3,courseId:'11709',scenarioId:'12',supportIds:[]}).course.run_up_m,0);
});
