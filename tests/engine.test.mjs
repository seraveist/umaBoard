import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileSkill,fixedContext} from '../assets/activation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {PreparationEngine} from '../assets/engine.mjs';
import {buildPhysics,lengthsBetween,positionAt,uniqueLevel,uniqueMultiplier,validateSetup} from '../assets/physics.mjs';
const manifest=JSON.parse(readFileSync(new URL('../data/manifest.json',import.meta.url)));
const data=JSON.parse(readFileSync(new URL('../'+manifest.dataset_path,import.meta.url)));
const flat={id:'test',selectable:true,distance:2400,distance_type:3,surface:1,turn:2,track_id:'10006',course_set_status:[],corners:[],straights:[{start:0,end:2400,frontType:1}],slopes:[]};
const setup={course:flat,outfitId:'uma',bloom:3,style:2,going:1,mood:0,weather:1,season:3,time:2,
 stats:{speed:1200,stamina:1200,power:1200,guts:1200,wisdom:1200},aptitudes:{distance:'A',surface:'A',style:'A'}};
const atom=(field,operator,value)=>({field,operator,value});
function skill(id,kind='acceleration',value=4000,condition=[[atom('phase','>=',2)]],extra={}){
 return {id,name_jp:id,rarity:'white',inherited:false,parent_ids:[],jp_available:true,
  categories:[kind==='acceleration'?'acceleration':kind==='heal'?'heal':kind.startsWith('passive_')?'passive':'speed'],
  invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',time_scale_raw:null,cooldown_raw:null,
   effects:[{kind,value_raw:value,source_type:31,unit:'umatools_raw',extras_raw:{}}],...extra}]};
}
const run=(list,s=setup,q=.5,options={})=>simulateSolo(s,list.map(x=>compileSkill(x,s)),q,options);
function fixture(list,costs={},relations=[]){
 return {outfits:{uma:{id:'uma',base_stars:3}},supports:{},skills:Object.fromEntries(list.map(s=>[s.id,s])),
  acquisition_routes:list.map(s=>({skill_id:s.id,owner_type:'outfit',owner_id:'uma',kind:'self'})),
  evolution_rules:[],relations,internal_acceleration_comparison_cost:costs};
}
test('reference stat/HP numbers and unique bloom levels',()=>{
 const p=buildPhysics(setup);
 assert.equal(p.hpMax,3254.4);assert.equal(p.modified.speed,1200);
 assert.ok(Math.abs(p.spurt-23.711532721532606)<1e-9);
 assert.deepEqual([1,2,3,4,5].map(uniqueLevel),[4,5,4,5,6]);
 assert.equal(uniqueMultiplier('target_speed',6),1.13);
 assert.equal(uniqueMultiplier('acceleration',6),1.1);
});
test('a partial final integration step is interpolated in its real time span',()=>{
 assert.equal(positionAt({dt:1,positions:[0,10,15],finishTime:1.5,distance:15},1.25),12.5);
});
test('extra acceleration is zero once the runner has already reached its target',()=>{
 const late=skill('late','acceleration',4000,[[atom('remain_distance','<=',200)]]);
 assert.ok(Math.abs(lengthsBetween(run([late]),run([])))<1e-8);
});
test('overlapping accelerations have diminishing marginal gains instead of summed gains',()=>{
 const a=skill('a'),b=skill('b'),baseline=run([]),one=run([a]),two=run([a,b]);
 const single=lengthsBetween(one,baseline),combined=lengthsBetween(two,baseline);
 assert.ok(single>0);assert.ok(combined>single);assert.ok(combined<single*2);
});
test('an early speed skill that expires without connection leaves late entry speed unchanged',()=>{
 const early=skill('early','target_speed',3500,[[atom('phase_random','==',0)]]);
 assert.equal(run([early]).entry.speed,run([]).entry.speed);
});
test('current speed with natural deceleration can connect and reduce the late entry gap',()=>{
 const connect=skill('connect','speed_with_decel',6000,[[atom('remain_distance','<=',880)]],{duration_raw:15000});
 const a=run([connect]),b=run([]);
 assert.ok(a.entry.speed>b.entry.speed+.05);assert.ok(a.entry.targetGap<b.entry.targetGap);
});
test('changing a late target-speed skill raises the required speed, independently of course windows',()=>{
 const speed=skill('speed','target_speed',3500);
 const a=run([speed]),b=run([]);
 assert.ok(a.entry.targetGap>b.entry.targetGap+.3);
 assert.deepEqual(compileSkill(speed,setup).invocations[0].condition[0].windows,[[1600,2400]]);
});
test('unknown effect, scale and repeated activation are unsupported, never zero benefit',()=>{
 const unknown=skill('unknown','lane_change_speed');assert.equal(compileSkill(unknown,setup).status,'unsupported');
 const scaled=skill('scaled');scaled.invocations[0].effects[0].extras_raw.value_scale=19;
 assert.equal(compileSkill(scaled,setup).status,'unsupported');
 const repeated=skill('repeat','target_speed');repeated.invocations[0].cooldown_raw=300000;
 const e=new PreparationEngine(fixture([repeated]),setup);
 assert.equal(e.marginal('repeat').gain,null);assert.ok(e.marginal('repeat').reasons.includes('반복 발동'));
});
test('a precondition is remembered and need not coincide with the later effect',()=>{
 const later=skill('later','target_speed',3500,[[atom('phase','>=',2)]],{precondition:[[atom('phase','==',1)]]});
 assert.equal(run([later]).events.length,1);
 assert.ok(run([later]).events[0].x>=1600);
});
test('linked invocations require the first invocation and cannot turn an impossible first trigger into a gain',()=>{
 const s=skill('linked','target_speed',1500,[[atom('running_style','==',1)]]);
 s.invocations.push({...s.invocations[0],index:2,condition:[[atom('is_activate_other_skill_detail','==',1)]],effects:[{kind:'acceleration',value_raw:4000,unit:'umatools_raw',extras_raw:{}}]});
 assert.equal(run([s]).events.length,0);
});
test('activation-count prerequisites respond to selected skills rather than assumed constant counts',()=>{
 const gated=skill('gated','acceleration',4000,[[atom('activate_count_all','>=',1),atom('phase','>=',2)]]);
 const speed=skill('speed','target_speed',1500,[[atom('phase','==',1)]]);
 assert.equal(run([gated]).events.length,0);
 assert.ok(run([speed,gated]).events.some(e=>e.id==='gated'));
});
test('white/gold alternatives and duplicate IDs never stack',()=>{
 const a=skill('a'),b=skill('b');
 const e=new PreparationEngine(fixture([a,b],{a:100,b:200},[{kind:'version_family',from_id:'a',to_id:'b'}]),setup);
 assert.deepEqual(e.normalize(['a','a','b']),['a']);
 e.toggle('a',true);e.toggle('b',true);assert.deepEqual([...e.selected],['b']);
 assert.equal(e.simulate(['a','a']).finishTime,e.simulate(['a']).finishTime);
});
test('maximum tie chooses the cheaper identical alternative and efficiency uses no displayed SP',()=>{
 const a=skill('a'),b=skill('b');const e=new PreparationEngine(fixture([a,b],{a:200,b:100},[{kind:'version_family',from_id:'a',to_id:'b'}]),setup);
 e.objective='maximum';assert.deepEqual(e.recommendation().ids,['b']);
 e.objective='efficient';assert.deepEqual(e.recommendation().ids,['b']);
});
test('an unknown comparison cost is not treated as free',()=>{
 const a=skill('unknown-cost'),b=skill('known-cost');const e=new PreparationEngine(fixture([a,b],{'known-cost':100},[{kind:'version_family',from_id:a.id,to_id:b.id}]),setup);
 assert.equal(e.cost(a.id),null);assert.deepEqual(e.recommendation().ids,[b.id]);
});
test('safe recommendation maximizes the lowest paired sample over all small-set combinations',()=>{
 const a=skill('random','acceleration',4000,[[atom('phase_firsthalf_random','==',2)]]),b=skill('fixed');
 const e=new PreparationEngine(fixture([a,b],{random:100,fixed:200}),setup);e.objective='safe';
 const rows=[[],[a.id],[b.id],[a.id,b.id]].map(ids=>e.compare(ids,[]));
 assert.ok(Math.abs(e.recommendation().gain.min-Math.max(...rows.map(r=>r.min)))<1e-8);
 assert.equal(e.recommendation().search,'exact');
});
test('heals are capped, heal failure is paired, and faster running changes HP consumption',()=>{
 const heal=skill('heal','heal',550,[[atom('phase','==',1)]],{duration_raw:0}),speed=skill('speed','target_speed',3500,[[atom('remain_distance','<=',300)]]);
 const baseline=run([]),healed=run([heal]),failed=run([heal],setup,.5,{failHeals:true});
 assert.ok(healed.hpRemaining>baseline.hpRemaining);assert.equal(failed.hpRemaining,baseline.hpRemaining);
 assert.ok(run([speed]).hpRemaining<baseline.hpRemaining);
 const atStart=skill('start-heal','heal',550,[[atom('always','==',1)]],{duration_raw:0});
 assert.equal(run([atStart]).hpRemaining,baseline.hpRemaining);
});
test('real skills use source-specific units, inherited variants and native unique scaling',()=>{
 const s={...setup,course:data.courses['10606'],outfitId:'100701',bloom:5};
 const native=compileSkill(data.skills['100071'],s),inherited=compileSkill(data.skills['900071'],s);
 assert.equal(native.invocations[0].duration,14.4);assert.equal(inherited.invocations[0].duration,8.64);
 assert.ok(native.invocations[0].effects[0].value>inherited.invocations[0].effects[0].value);
 assert.equal(compileSkill(data.skills['901351'],{...s,style:3}).invocations[0].duration,8.64);
 assert.equal(compileSkill(data.skills['901351'],s).invocations[0].duration,2.88);
});
test('unsupported high-speed mechanics and unresolved US coordinates block misleading results',()=>{
 assert.throws(()=>validateSetup({...setup,stats:{...setup.stats,speed:2100}}),/전개스퍼트/);
 assert.throws(()=>validateSetup({...setup,course:data.courses['11619']}),/출발 좌표/);
});
test('reference step refinement keeps a paired late-acceleration benefit within 0.06 lengths',()=>{
 const a=skill('a');
 const rough=lengthsBetween(run([a],setup,.5,{dt:.1}),run([],setup,.5,{dt:.1}));
 const fine=lengthsBetween(run([a],setup,.5,{dt:.025}),run([],setup,.5,{dt:.025}));
 assert.ok(Math.abs(rough-fine)<.06,`${rough} vs ${fine}`);
});
test('real candidate inheritance excludes the outfit native unique itself',()=>{
 const e=new PreparationEngine(data,{...setup,course:data.courses['10606'],outfitId:'100701'});
 assert.ok(!e.candidates.inheritance.some(s=>s.parent_ids.includes('100071')));
 assert.equal(fixedContext(setup).season,3);
});
test('normal and enhanced inheritance versions of the same unique cannot stack',()=>{
 const e=new PreparationEngine(data,{...setup,course:data.courses['10606'],outfitId:'100701'});
 assert.equal(e.compatible('901411','91101411'),false);
});
test('turning off a compound speed skill cannot let automatic acceleration turn it back on',()=>{
 const hybrid=skill('hybrid','target_speed',3500);hybrid.categories.push('acceleration');
 hybrid.invocations[0].effects.push({kind:'acceleration',value_raw:4000,unit:'umatools_raw',extras_raw:{}});
 const e=new PreparationEngine(fixture([hybrid],{hybrid:100}),setup);
 assert.ok(e.selected.has('hybrid'));e.toggle('hybrid',false);
 assert.equal(e.auto,true);assert.ok(!e.analyze().selected.includes('hybrid'));
 e.toggle('hybrid',true,'acceleration');assert.equal(e.auto,false);
});
test('native acceleration-only uniques start selected and have no purchase cost',()=>{
 const unique=skill('unique');unique.rarity='unique';
 const e=new PreparationEngine(fixture([unique]),setup);
 assert.ok(e.selected.has('unique'));assert.equal(e.cost('unique'),0);
 assert.ok(e.analyze().selected.includes('unique'));
});
