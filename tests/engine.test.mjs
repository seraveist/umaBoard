import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileSkill,fixedContext} from '../assets/activation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {PreparationEngine} from '../assets/engine.mjs';
import {applyEngineAction} from '../assets/engine-actions.mjs';
import {buildPhysics,lengthsBetween,positionAt,uniqueLevel,uniqueMultiplier,validateSetup,wisdomSkillBase} from '../assets/physics.mjs';
import {acquisitionPlan} from '../assets/acquisition-plan.mjs';
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
test('maximum and safe ties choose the cheaper identical alternative without displayed SP',()=>{
 const a=skill('a'),b=skill('b');const e=new PreparationEngine(fixture([a,b],{a:200,b:100},[{kind:'version_family',from_id:'a',to_id:'b'}]),setup);
 e.objective='maximum';assert.deepEqual(e.recommendation().ids,['b']);
 e.objective='safe';assert.deepEqual(e.recommendation().ids,['b']);
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
test('high-speed inputs retain their real ordinary speed and label excluded full spurt',()=>{
 const speeds=[1200,2000,2100,2500,3000].map(speed=>({...setup,stats:{...setup.stats,speed}}));
 for(const s of speeds)assert.doesNotThrow(()=>validateSetup(s));
 const physics=speeds.map(s=>buildPhysics(s));
 assert.ok(physics.every((p,i)=>i===0||p.spurt>physics[i-1].spurt));
 assert.equal(physics[1].fullSpurtExcluded,false);assert.equal(physics[2].fullSpurtExcluded,true);
 assert.equal(run([],speeds[2]).status,'ok');assert.equal(run([],speeds[2]).fullSpurtExcluded,true);
 assert.equal(physics[2].modified.speed,1650);
 assert.doesNotThrow(()=>validateSetup({...setup,mood:2,stats:{...setup.stats,speed:1950}}));
 assert.throws(()=>validateSetup({...setup,stats:{...setup.stats,speed:2000.5}}),/정수/);
 assert.throws(()=>validateSetup({...setup,stats:{...setup.stats,speed:3001}}),/1~3000/);
});
test('unresolved US coordinates still block unsupported course geometry',()=>{
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
 const f=fixture([hybrid],{hybrid:100});f.acquisition_routes=[];
 const e=new PreparationEngine(f,setup);e.toggle('hybrid',true,'speed');
 assert.ok(e.selected.has('hybrid'));e.toggle('hybrid',false,'speed');
 assert.equal(e.auto,true);assert.ok(!e.analyze().selected.includes('hybrid'));
 e.toggle('hybrid',true,'acceleration');assert.equal(e.auto,false);
});
test('native acceleration-only uniques start selected and have no purchase cost',()=>{
 const unique=skill('unique');unique.rarity='unique';
 const e=new PreparationEngine(fixture([unique]),setup);
 assert.ok(e.selected.has('unique'));assert.equal(e.cost('unique'),0);
 assert.ok(e.analyze().selected.includes('unique'));
});
test('wisdom thresholds, mood and activation phase buff gold/native speeds but not white/inherited skills',()=>{
 assert.deepEqual([1220,1221,1401,1420,1421,1601,1620,1621,2001,2100,2101].map(x=>Number(wisdomSkillBase(x).toFixed(2))),[0,.02,.2,.2,.26,.8,.8,.81,1,1,1.01]);
 const low={...setup,stats:{...setup.stats,wisdom:1200}},high={...setup,stats:{...setup.stats,wisdom:1601}};
 const gold=skill('gold','target_speed',3500,[[atom('remain_distance','<=',300)]]);gold.rarity='gold';
 assert.ok(run([gold],high).finishTime<run([gold],low).finishTime);
 const white=skill('white','target_speed',3500);
 assert.equal(run([white],high).finishTime,run([white],low).finishTime);
 const inherited={...white,id:'inherited',rarity:'inherited',inherited:true};
 assert.equal(run([inherited],high).finishTime,run([inherited],low).finishTime);
 const p=buildPhysics({...high,style:1});
 assert.ok(p.wisdomSpeedMultiplier(0)>p.wisdomSpeedMultiplier(3));
 assert.ok(buildPhysics({...high,mood:2}).wisdomSpeedMultiplier(1)>buildPhysics(high).wisdomSpeedMultiplier(1));
 const passive=skill('wisdom','passive_wisdom',4010000,[[atom('always','==',1)]]);
 assert.ok(run([gold,passive],low).finishTime<run([gold],low).finishTime);
});
test('zero-benefit pruning preserves one of two individually sufficient accelerations',()=>{
 const a=skill('a','acceleration',1000000),b=skill('b','acceleration',1000000);
 const e=new PreparationEngine(fixture([a,b],{a:100,b:200}),setup);
 e.toggle('a',true,'acceleration');e.toggle('b',true,'acceleration');
 assert.ok(Math.abs(e.marginal('a').gain.median)<1e-8);
 const result=e.analyze();
 assert.deepEqual(result.selected,['a']);assert.ok(result.skills.every(x=>x.gain.median>.005));
 assert.ok(result.comparison.median>0);
});
test('inheritance is capped at six across kinds and each table contains only its positive top ten',()=>{
 const inherits=Array.from({length:12},(_,i)=>({...skill(String(i).padStart(2,'0'),'target_speed',1000+i*100,[[atom('remain_distance','<=',300)]]),rarity:'inherited',inherited:true,parent_ids:['parent-'+i]}));
 const f=fixture(inherits);f.acquisition_routes=[];
 const e=new PreparationEngine(f,setup);e.auto=false;
 assert.equal(e.analyze().tables.speed.inheritance.length,10);
 for(const s of inherits.slice(6))e.toggle(s.id,true,'speed');
 e.toggle(inherits[0].id,true,'speed');assert.equal(e.selected.size,6);assert.match(e.notice,/최대 6/);
 const result=e.analyze();assert.ok(result.tables.speed.inheritance.length<=10);
 assert.ok(result.selected.length<=6);assert.ok(result.selected.every(id=>result.tables.speed.inheritance.includes(id)));
 assert.ok(!result.skills.some(s=>s.pinned));
});
test('unavailable ordinary white acceleration enters the main table, optimizer and factor acquisition plan',()=>{
 const a=skill('factor-acceleration'),speed=skill('native-speed','target_speed',1500);
 const f=fixture([a,speed],{[a.id]:100});f.acquisition_routes=f.acquisition_routes.filter(r=>r.skill_id===speed.id);
 const e=new PreparationEngine(f,setup),r=e.analyze();
 assert.ok(r.tables.acceleration.ordinary.includes(a.id));assert.ok(r.selected.includes(a.id));
 assert.equal(r.skills.find(s=>s.id===a.id).source,'factor');assert.ok(!('factors' in r));
 const plan=acquisitionPlan(f,e.records,r.selected);assert.ok(plan[0].skills.some(s=>s.id===a.id&&s.detail==='인자'));
});
test('a supported heal remains selectable by HP gain even though its forced-spurt length gain is zero',()=>{
 const heal=skill('heal','heal',550,[[atom('phase','==',1)]],{duration_raw:0});
 const e=new PreparationEngine(fixture([heal]),setup);e.toggle(heal.id,true,'heal');
 const r=e.analyze();assert.ok(r.tables.heal.includes(heal.id));assert.ok(r.selected.includes(heal.id));
 assert.equal(r.skills[0].gain.median,0);assert.ok(r.skills[0].hpGain>0);
});
test('Kyoto 2200 white descent overlaps late entry and is available as a factor or support skill',()=>{
 const s={...setup,course:data.courses['10808'],outfitId:'114101',bloom:5,supportIds:[],stats:{speed:1900,stamina:1500,power:1700,guts:1200,wisdom:1700}};
 const c=compileSkill(data.skills['201342'],s);assert.equal(c.status,'supported');
 assert.deepEqual(c.invocations[0].condition[0].windows,[[1375,1525]]);assert.equal(c.invocations[0].duration,6.6);
 assert.ok(lengthsBetween(simulateSolo(s,[c]),simulateSolo(s,[]))>0);
 const missing=new PreparationEngine(data,s);assert.ok(missing.candidates.factorCandidates.some(s=>s.id==='201342'));
 const available=new PreparationEngine(data,{...s,supportIds:['30023']});assert.ok(available.candidates.learned.some(s=>s.id==='201342'));
});
test('central-only individual scoring matches the previous five-sample center',()=>{
 const random=skill('random','target_speed',3500,[[atom('phase_random','==',1)]]);
 const e=new PreparationEngine(fixture([random]),setup);
 const central=e.marginal(random.id),full=e.marginal(random.id,e.selected,[0,.25,.5,.75,1]);
 assert.equal(central.gain.median,full.gain.median);assert.equal(central.gain.values.length,1);assert.equal(central.gain.min,null);
 assert.equal(full.gain.values.length,5);assert.ok(full.gain.min<=full.gain.max);
});
test('manual acceleration analysis skips optimization but retains five final comparison samples',()=>{
 const a=skill('a');const e=new PreparationEngine(fixture([a],{a:100}),setup);
 e.toggle(a.id,true,'acceleration');e.recommendation=()=>{throw new Error('manual selection must not optimize');};
 const r=e.analyze();assert.equal(r.auto,false);assert.equal(r.recommendation.evaluations,0);
 assert.equal(r.comparison.values.length,5);assert.equal(r.acceleration.length,5);
});
test('a pure heal reuses motion and recommendation scores while still updating HP',()=>{
 const a=skill('a'),heal=skill('heal','heal',550,[[atom('phase','==',1)]],{duration_raw:0});
 const e=new PreparationEngine(fixture([a,heal],{a:100}),setup);assert.equal(e.healDependent,false);
 const before=e.analyze(),count=e.recommendations.size,scoreCount=e.scores.size;
 e.toggle(heal.id,true,'heal');const after=e.analyze();
 assert.equal(e.recommendations.size,count);assert.equal(e.scores.size,scoreCount);
 assert.deepEqual(after.recommendation.ids,before.recommendation.ids);assert.equal(after.comparison.median,before.comparison.median);
 assert.ok(after.stamina.hpRemaining>before.stamina.hpRemaining);
});
test('heal-count dependencies remain active during optimization and scoring',()=>{
 const a=skill('a','acceleration',4000,[[atom('activate_count_heal','>=',1),atom('phase','>=',2)]]);
 const heal=skill('heal','heal',550,[[atom('phase','==',1)]],{duration_raw:0});
 const e=new PreparationEngine(fixture([a,heal],{a:100}),setup);assert.equal(e.healDependent,true);
 assert.ok(!e.analyze().selected.includes(a.id));e.toggle(heal.id,true,'heal');
 assert.ok(e.analyze().selected.includes(a.id));
});
test('ranked bulk selection preserves existing inherits, skips alternatives and fills only remaining slots',()=>{
 const inherits=Array.from({length:10},(_,i)=>({...skill('i'+i,'target_speed',1500,[[atom('remain_distance','<=',300)]]),rarity:'inherited',inherited:true,parent_ids:['p'+i]}));
 const f=fixture(inherits);f.acquisition_routes=[];const e=new PreparationEngine(f,setup);
 e.toggle('i9',true,'speed');applyEngineAction(e,{type:'selectMany',ids:inherits.map(s=>s.id),source:'speed'});
 assert.equal(e.selected.size,6);assert.ok(e.selected.has('i9'));assert.ok(!e.selected.has('i5'));
 const a=skill('a','target_speed',1500),b=skill('b','target_speed',3000);
 const options=fixture([a,b],{a:100,b:200},[{kind:'version_family',from_id:'a',to_id:'b'}]);options.acquisition_routes=[];
 const alternatives=new PreparationEngine(options,setup);
 alternatives.selectMany(['b','a']);assert.deepEqual([...alternatives.selected],['b']);
});
test('selection batches apply the latest intent before one analysis and reject removed efficiency mode',()=>{
 const a=skill('a','target_speed',3500);const e=new PreparationEngine(fixture([a]),setup);
 for(const action of [{type:'toggle',id:'a',checked:false,source:'speed'},{type:'toggle',id:'a',checked:true,source:'speed'}])applyEngineAction(e,action);
 assert.ok(e.selected.has('a'));assert.equal(e.objective,'maximum');
 assert.throws(()=>applyEngineAction(e,{type:'objective',value:'efficient'}),/추천 기준/);
});
test('unknown costs cannot empty a stronger maximum or safe recommendation',()=>{
 const strong=skill('unknown','acceleration',8000),weak=skill('known','acceleration',4000);
 const e=new PreparationEngine(fixture([strong,weak],{known:100},[{kind:'version_family',from_id:'unknown',to_id:'known'}]),setup);
 for(const objective of ['maximum','safe']){e.objective=objective;assert.deepEqual(e.recommendation().ids,['unknown']);}
});
test('recommendation cache accounts for inherited heals consuming an inheritance slot',()=>{
 const accelerations=Array.from({length:6},(_,i)=>({...skill('i'+i),rarity:'inherited',inherited:true,parent_ids:['p'+i]}));
 const heal={...skill('h','heal',550,[[atom('phase','==',1)]],{duration_raw:0}),rarity:'inherited',inherited:true,parent_ids:['p-heal']};
 const f=fixture([...accelerations,heal],Object.fromEntries(accelerations.map(s=>[s.id,100])));f.acquisition_routes=[];
 const e=new PreparationEngine(f,setup);assert.equal(e.healDependent,false);assert.equal(e.recommendation().ids.length,6);
 e.toggle('h',true,'heal');assert.equal(e.recommendation().ids.length,5);
});
test('obtainable speed remains fixed at zero gain and can become useful with acceleration',()=>{
 const speed=skill('speed','target_speed',3500),accel=skill('accel');
 const e=new PreparationEngine(fixture([speed]),setup),r=e.analyze();
 assert.ok(r.fixedIds.includes(speed.id));assert.ok(r.selected.includes(speed.id));assert.equal(e.marginal(speed.id).gain.median,0);
 assert.ok(!r.visibleSelected.includes(speed.id));assert.ok(!r.tables.speed.ordinary.includes(speed.id));
 e.toggle(speed.id,false,'speed');assert.match(e.notice,/고정/);assert.ok(e.selected.has(speed.id));
 assert.ok(lengthsBetween(run([speed,accel]),run([accel]))>.3);
});
test('fixed upper tiers cannot be unchecked or replaced with an incompatible optional tier',()=>{
 const lower=skill('lower','target_speed',1500),upper=skill('upper','target_speed',3500);
 const e=new PreparationEngine(fixture([lower,upper],{},[{kind:'version_family',from_id:lower.id,to_id:upper.id}]),setup);
 assert.deepEqual([...e.fixedIds],[upper.id]);e.toggle(lower.id,true,'speed');assert.match(e.notice,/고정/);
 assert.deepEqual([...e.selected],[upper.id]);assert.equal(e.marginal(lower.id).status,'inactive');
});
test('a user speed choice survives zero gain after a manual acceleration change until explicitly cleared',()=>{
 const speed=skill('speed','target_speed',3500),accel=skill('accel');
 const f=fixture([speed,accel],{speed:100,accel:100});f.acquisition_routes=[];const e=new PreparationEngine(f,setup);
 assert.ok(e.analyze().tables.speed.ordinary.includes(speed.id));e.toggle(speed.id,true,'speed');e.analyze();
 e.toggle(accel.id,false,'acceleration');const result=e.analyze();
 assert.equal(e.marginal(speed.id).gain.median,0);assert.ok(result.userSelected.includes(speed.id));assert.ok(result.selected.includes(speed.id));assert.ok(!result.visibleSelected.includes(speed.id));
 e.clearSpeedSelection();assert.ok(!e.selected.has(speed.id));assert.deepEqual(e.userSelected,new Set());
});
test('automatically chosen hybrids never become the next automatic speed baseline',()=>{
 const hybrid=skill('hybrid','target_speed',3500);hybrid.categories.push('acceleration');
 hybrid.invocations[0].effects.push({kind:'acceleration',value_raw:4000,unit:'umatools_raw',extras_raw:{}});
 const f=fixture([hybrid],{hybrid:100});f.acquisition_routes=[];const e=new PreparationEngine(f,setup);
 const first=e.analyze();assert.ok(first.automaticIds.includes(hybrid.id));assert.deepEqual(e.baselineSelection(),[]);
 for(let i=0;i<2;i++){e.useAutomatic();const again=e.analyze();assert.deepEqual(again.selected,first.selected);assert.deepEqual(again.comparison,first.comparison);assert.deepEqual(again.userSelected,[]);}
 e.toggle(hybrid.id,false,'speed');assert.ok(!e.analyze().selected.includes(hybrid.id));
 e.toggle(hybrid.id,true,'speed');assert.ok(e.baselineSelection().includes(hybrid.id));assert.ok(!e.analyze().automaticIds.includes(hybrid.id));
});
test('safe insurance with zero central gain survives pruning by worst-sample contribution',()=>{
 const early=skill('early','acceleration',4000,[[atom('phase_random','==',1),atom('remain_distance','<=',920)]]);
 const cover=skill('cover','acceleration',2000,[[atom('remain_distance','<=',670)]]);
 const e=new PreparationEngine(fixture([early,cover],{early:100,cover:100}),setup);e.objective='safe';
 const expected=e.recommendation().gain.min,result=e.analyze(),entry=result.skills.find(s=>s.id===cover.id);
 assert.ok(result.selected.includes(cover.id));assert.ok(result.tables.acceleration.ordinary.includes(cover.id));
 assert.equal(entry.gain.median,0);assert.ok(entry.safetyGain>.14);assert.ok(Math.abs(result.recommendation.gain.min-expected)<1e-8);
});
test('bulk speed selection explicitly pins an already automatically selected hybrid',()=>{
 const hybrid=skill('hybrid','target_speed',3500);hybrid.categories.push('acceleration');
 hybrid.invocations[0].effects.push({kind:'acceleration',value_raw:4000,unit:'umatools_raw',extras_raw:{}});
 const f=fixture([hybrid],{hybrid:100});f.acquisition_routes=[];const e=new PreparationEngine(f,setup);
 assert.ok(e.analyze().automaticIds.includes(hybrid.id));e.selectMany([hybrid.id],'speed');
 assert.ok(e.userSelected.has(hybrid.id));assert.ok(!e.automaticIds.has(hybrid.id));
 assert.deepEqual(e.analyze().recommendation.fixedIds,[hybrid.id]);e.clearSpeedSelection();assert.ok(!e.analyze().selected.includes(hybrid.id));
});
test('linked activation and uncached traces are identical for the same unordered skill set',()=>{
 const helper=skill('101','target_speed',1000),gated=skill('102','acceleration',4000,[[atom('phase','>=',2),atom('is_used_skill_id','==',101)]]);
 const e=new PreparationEngine(fixture([helper,gated]),setup),first=e.simulate([helper.id,gated.id]);
 e.runs.clear();const second=e.simulate([gated.id,helper.id]);
 assert.equal(second.finishTime,first.finishTime);assert.deepEqual(second.events,first.events);assert.deepEqual(second.trace,first.trace);
 assert.deepEqual(run([helper,gated]).events,run([gated,helper]).events);
});
test('actual Kyoto recommendation repeats exactly with fixed support speeds and a graph from the final pair',()=>{
 const s={...setup,course:data.courses['10808'],outfitId:'114101',supportIds:['30023'],mood:2,weather:2,
  stats:{speed:2200,stamina:1500,power:1700,guts:1200,wisdom:1700},aptitudes:{distance:'S',surface:'A',style:'A'}};
 const e=new PreparationEngine(data,s),first=e.analyze();
 assert.ok(first.fixedIds.length>0);assert.ok(first.accelerationGraph.selected.length>20);assert.ok(first.accelerationGraph.reference.length>20);
 const main=e.simulate(first.selected),reference=e.simulate(first.selected,.5,false,true);
 for(const [rows,source]of [[first.accelerationGraph.selected,main],[first.accelerationGraph.reference,reference]])for(const p of rows){
  assert.ok(p.t>=-4&&p.t<=12);assert.ok(source.trace.some(t=>Math.abs(t.t-source.entry.t-p.t)<1e-8&&t.v===p.v&&t.target===p.target));
 }
 for(let i=0;i<2;i++){e.useAutomatic();const again=e.analyze();assert.deepEqual(again.selected,first.selected);assert.deepEqual(again.tables,first.tables);assert.deepEqual(again.comparison,first.comparison);assert.deepEqual(again.fixedIds,first.fixedIds);assert.deepEqual(again.accelerationGraph,first.accelerationGraph);}
});
