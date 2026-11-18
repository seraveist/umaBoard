import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileSkill,branchReady} from '../assets/activation.mjs';
import {compileChartSkill,createChartSetup} from '../assets/cm-chart.mjs';
import {activationFrame} from '../assets/race-frame.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {selectableCourse} from '../assets/reviewed-course-geometry.mjs';
import {lengthsBetween} from '../assets/physics.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const atom=(field,value,operator='==')=>({field,value,operator});
const flat={id:'analytic-flat',selectable:true,distance:2000,distance_type:3,surface:1,turn:1,track_id:'10006',course_set_status:[],corners:[],straights:[{start:0,end:2000,frontType:1}],slopes:[]};
const setup={course:flat,style:2,mood:0,going:1,bloom:5,uniqueLevel:6,weather:1,season:3,time:2,stats:{speed:1200,stamina:3000,power:1200,guts:1200,wisdom:1200},aptitudes:{distance:'A',surface:'A',style:'A'}};
const raw=(id,condition,kind='acceleration',value=4000,rarity='white')=>({id,name_jp:id,rarity,inherited:false,jp_available:true,parent_ids:[],activation_raw:0,invocations:[{index:1,condition:[condition],precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',effects:[{kind,value_raw:value,unit:'umatools_raw',extras_raw:{}}]}]});
const run=(s,skills=[],options={})=>simulateSolo(s,skills.map(r=>compileChartSkill(r,s)),.5,{dt:.01,keepTrace:false,...options});

test('slope random domains are the slope intersected with race half on every supported course',()=>{
 let checks=0;
 for(const course of Object.values(data.courses).filter(selectableCourse))for(const direction of [1,-1])for(const later of [false,true]){
  const field=`${direction===1?'up':'down'}_slope_random${later?'_later_half':''}`,s={...setup,course},c=compileSkill(raw('domain',[atom(field,1)]),s);
  const points=[course.distance/2,...course.slopes.flatMap(k=>[k.start,k.start+k.length]),0,course.distance-1];
  for(const edge of points)for(const offset of [-.001,0,.001]){
   const x=edge+offset;if(x<0||x>=course.distance)continue;
   const slope=course.slopes.find(k=>k.start<=x&&x<k.start+k.length)?.slope??0;
   const expected=slope*direction>0&&(!later||x>=course.distance/2),actual=c.invocations.some(inv=>inv.condition.some(b=>branchReady(b,{x,prevX:x,t:0},'domain')));
   assert.equal(actual,expected,`${course.id} ${field} ${x}`);checks++;
  }
 }
 assert.ok(checks>Object.values(data.courses).filter(selectableCourse).length);
});

test('a slope crossing the race midpoint retains its entire eligible second-race-half portion',()=>{
 const course={...flat,slopes:[{start:100,length:200,slope:10000},{start:900,length:300,slope:10000},{start:1400,length:200,slope:10000}]};
 const c=compileSkill(raw('race-half',[atom('up_slope_random_later_half',1)]),{...setup,course});
 assert.deepEqual(c.invocations[0].condition[0].drawWindows,[[1000,1200],[1400,1600]]);
 assert.deepEqual(c.invocations[0].condition[0].windows,[[1000,1200],[1400,1600]]);
});

test('phase consumers use movement start while the race-half counter uses its strict end position',()=>{
 assert.deepEqual(activationFrame({prevX:999.9,x:1000},2000),{startX:999.9,endX:1000,phase:1,laterHalf:false});
 assert.equal(activationFrame({prevX:999.9,x:1000.1},2000).laterHalf,true);
 assert.equal(activationFrame({prevX:1333.2,x:1333.5},2000).phase,1);
 assert.equal(activationFrame({x:0},2000).phase,0);
});

for(const [edge,phase,counter]of [[300,0,'activate_count_start'],[1200,1,'activate_count_middle'],[1500,2,'activate_count_end_after']]){
 test(`boundary ${edge}: counting, linked follow-up and wisdom share activation phase without rewinding physics`,()=>{
  const course={...flat,distance:1800,corners:[{start:edge,length:1800-edge-100}],straights:[{start:0,end:edge},{start:1700,end:1800}]},s={...setup,course,style:3,stats:{...setup.stats,wisdom:1500}};
  const skills=[raw('a',[atom('phase',phase),atom('is_finalcorner',1)],'target_speed',3500,'gold'),raw('b',[atom('phase',phase),atom(counter,1,'>=')])];
  const a=run(s,skills,{diagnostics:true}),b=run(s,skills,{diagnostics:true,scheduleConditions:false});
  assert.deepEqual(a.events,b.events);assert.equal(a.finishTime,b.finishTime);assert.equal(a.events.length,2);
  assert.equal(a.events[0].activationPhase,phase);assert.equal(a.events[0].physicsPhase,phase+1);assert.ok(a.events[0].frameStartX<edge&&a.events[0].x>=edge);
  assert.equal(a.triggerCounts.inPhase[phase],2);assert.equal(a.triggerCounts.inPhase[phase+1],0);
  const expected=.35*(1+.44*[.19,.18,.23][phase]);assert.ok(Math.abs(a.events[0].effects[0].value-expected)<1e-12);
  assert.equal(a.events[0].observation.phase,phase+1);
 });
}

test('actual Kanata supplies the third middle trigger for Tail Up at Chukyo 1800',()=>{
 const s={...createChartSetup(data,profiles,{outfitId:'102201',scenarioId:'12',courseId:'10708',style:3,supportIds:[],raceContext:{rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}}}),stats:{speed:1400,stamina:2000,power:2500,guts:1000,wisdom:1500},aptitudes:{distance:'A',surface:'A',style:'A'}};
 const skills=[raw('000-a',[atom('distance_rate',30,'>=')]),raw('000-b',[atom('distance_rate',40,'>=')]),data.skills['100591'],data.skills['201611']],a=run(s,skills),b=run(s,[...skills].reverse(),{scheduleConditions:false});
 assert.deepEqual(a.events,b.events);assert.equal(a.finishTime,b.finishTime);
 assert.deepEqual(a.events.map(e=>e.id),['000-a','000-b','100591','201611']);assert.equal(a.triggerCounts.inPhase[1],4);
});

// Independent continuous-motion oracle. No production physics helpers are
// used to derive the flat-course target or acceleration. Only the observed
// entry state and grid-quantized activation time initialize the experiment.
function segment(v,target,a,time){
 const reach=Math.max(0,(target-v)/a),ramp=Math.min(time,reach);
 return {distance:v*ramp+a*ramp*ramp/2+target*Math.max(0,time-reach),speed:Math.min(target,v+a*time)};
}
function remainingTime(x,v,target,a,distance){
 const remaining=distance-x,reach=Math.max(0,(target-v)/a),toTarget=v*reach+a*reach*reach/2;
 return remaining<=toTarget?2*remaining/(v+Math.sqrt(v*v+2*a*remaining)):reach+(remaining-toTarget)/target;
}
function analyticFinish(entry,target,a,event){
 let x=entry.x,v=entry.speed,elapsed=0;
 for(const [time,bonus]of event?[[event.t-entry.t,0],[event.duration,.4]]:[]){const piece=segment(v,target,a+bonus,time);x+=piece.distance;v=piece.speed;elapsed+=time;}
 return entry.t+elapsed+remainingTime(x,v,target,a,2000);
}
for(const dt of [.02,.01,.005])test(`flat late acceleration agrees with a continuous piecewise oracle at dt=${dt}`,()=>{
 const target=(20*(.975+.01)+Math.sqrt(1200/500))*1.05+Math.sqrt(1200/500)+(450*1200)**.597*.0001,a=.0006*Math.sqrt(500*1200)*.996;
 const before=run(setup,[],{dt,diagnostics:true}),after=run(setup,[raw('analytic',[atom('distance_rate',70,'>=')])],{dt,diagnostics:true});
 assert.ok(Math.abs(before.entry.target-target)<1e-12);assert.ok(Math.abs(before.entry.speed-19.82)<1e-10);
 assert.ok(before.fullSpeedFeasible&&after.fullSpeedFeasible);
 const bound=4*(a+.4)*dt*dt/19.82+1e-8;
 for(const [r,event]of [[before,null],[after,after.events[0]]])assert.ok(Math.abs(r.finishTime-analyticFinish(r.entry,target,a,event))<bound,JSON.stringify({dt,actual:r.finishTime,expected:analyticFinish(r.entry,target,a,event),bound}));
 assert.equal(after.events[0].observation.target,target);assert.equal(after.events[0].observation.legAcceleration,0);
 const ordinary=run(setup,[raw('analytic',[atom('distance_rate',70,'>=')])],{dt});assert.equal(ordinary.finishTime,after.finishTime);assert.deepEqual(ordinary.positions,after.positions);
});

test('delaying equal acceleration cannot increase its value in an isolated constant-target late phase',()=>{
 for(const speed of [900,1800])for(const power of [600,1200]){
  const s={...setup,stats:{...setup.stats,speed,power}},baseline=run(s),values=[68,70,72,80,90].map(percent=>lengthsBetween(run(s,[raw('delayed',[atom('distance_rate',percent,'>=')])]),baseline));
  for(let i=1;i<values.length;i++)assert.ok(values[i]<=values[i-1]+1e-8,JSON.stringify({speed,power,values}));
  assert.ok(Math.abs(values.at(-1))<1e-8);
 }
});
