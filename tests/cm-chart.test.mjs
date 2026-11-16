import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChartSetup,prepareChart,generateChart,compileChartSkill,buildChartCandidates,sortChartRows} from '../assets/cm-chart.mjs';
import {compileSkill} from '../assets/activation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {lengthsBetween} from '../assets/physics.mjs';
import {ACQUISITION_OPTIONS,checklistSnapshot,checklistCounts} from '../assets/cm-state.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const manifest=read('data/manifest.json'),actual=read(manifest.dataset_path),actualProfiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const input={outfitId:'1',style:2,courseId:'c',scenarioId:'15',supportIds:[],bloom:5,uniqueLevel:6};
const profiles={profiles:{'15':{id:'15',stats:{speed:1800,stamina:1800,power:1800,guts:1600,wisdom:1800}}}};
function skill(id,condition,effect='target_speed',value=1500,rarity='white'){
 return {id,name_jp:id,description_jp:id,rarity,inherited:false,jp_available:true,parent_ids:[],categories:[effect==='heal'?'heal':effect==='acceleration'?'acceleration':'speed'],
 invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',cooldown_raw:null,time_scale_raw:null,effects:[{kind:effect,source_type:effect==='heal'?9:effect==='acceleration'?31:27,value_raw:value,unit:'umatools_raw',extras_raw:{}}]}]};
}
function fixture(){
 const native=skill('100',[[{field:'phase',operator:'==',value:2}]],'target_speed',2000,'unique');
 const random=skill('201',[[{field:'phase_random',operator:'==',value:2}]],'target_speed',3500);
 const heal=skill('202',[[{field:'phase',operator:'==',value:1}]],'heal',550);
 return {skills:{100:native,201:random,202:heal},outfits:{'1':{id:'1',name_jp:'fixture',base_stars:3}},supports:{},courses:{c:{id:'c',selectable:true,track_id:'10008',surface:1,turn:1,distance:2200,distance_type:3,course_set_status:[],corners:[],slopes:[],straights:[{start:0,end:2200,frontType:1}]}},acquisition_routes:[{skill_id:'100',owner_type:'outfit',owner_id:'1',kind:'self'}],evolution_rules:[],relations:[],internal_acceleration_comparison_cost:{201:100,202:100},purchase_stages:{},scenario_exclusive_groups:[]};
}

test('initial inputs resolve verified caps, best mood, A aptitudes and owned unique level without SP',()=>{
 const d=fixture(),s=createChartSetup(d,profiles,{...input,stats:{speed:999},spBudget:9999,mood:-2});
 assert.deepEqual(s.stats,profiles.profiles['15'].stats);assert.equal(s.mood,2);assert.deepEqual(s.aptitudes,{distance:'A',surface:'A',style:'A'});assert.equal(s.uniqueLevel,6);assert.equal(s.spBudget,undefined);
 assert.throws(()=>createChartSetup(d,profiles,{...input,scenarioId:'missing'}),/상한/);
});

test('gold originals and both evolution branches stay in the comparison pool',()=>{
 const d=fixture();d.skills['300']=skill('300',[],'target_speed',3500,'gold');d.skills['301']=skill('301',[],'target_speed',4500,'evolution');d.skills['302']=skill('302',[],'target_speed',5500,'evolution');
 d.acquisition_routes.push({skill_id:'300',owner_type:'outfit',owner_id:'1',kind:'self'});
 d.evolution_rules=[301,302].map(id=>({base_id:'300',evolved_id:String(id),owner_type:'outfit',owner_id:'1',choice_group:'same-gold'}));
 const pool=buildChartCandidates(d,createChartSetup(d,profiles,input));
 assert.ok(['300','301','302'].every(id=>pool.has(id)));
 d.skills['400']=skill('400',[],'target_speed',9000,'gold');assert.ok(!buildChartCandidates(d,createChartSetup(d,profiles,input)).has('400'));
});

test('the chart uses an arithmetic mean, remains SP independent, and retains a zero-length pure heal',async()=>{
 const d=fixture(),task=prepareChart(d,profiles,{skills:{}},input,{samples:24,dt:.02});
 const random=task.evaluate(task.rows.find(r=>r.id==='201')),heal=task.evaluate(task.rows.find(r=>r.id==='202'));
 const compiled=[compileChartSkill(d.skills['100'],task.setup),compileChartSkill(d.skills['201'],task.setup)];
 const central=lengthsBetween(simulateSolo(task.setup,compiled,.5,{dt:.02}),simulateSolo(task.setup,compiled.slice(0,1),.5,{dt:.02}));
 assert.ok(Number.isFinite(random.gain));assert.ok(Math.abs(random.gain-central)>.02);
 assert.equal(heal.gain,0);assert.ok(heal.hpGain>0);
 const a=await generateChart(d,profiles,{skills:{}},{...input,spBudget:0},{samples:4,dt:.02});
 const b=await generateChart(d,profiles,{skills:{}},{...input,spBudget:10000},{samples:4,dt:.02});
 assert.deepEqual(a.rows,b.rows);assert.equal(a.rows.length,2);
});

test('start/count predicates are fulfilled only in chart compilation; spatial impossibility remains excluded',()=>{
 const d=fixture(),setup=createChartSetup(d,profiles,input),s=skill('start',[[{field:'is_badstart',operator:'==',value:0},{field:'phase',operator:'==',value:1}]],'heal',550);
 const ordinary=simulateSolo(setup,[compileSkill(s,setup)]),chart=simulateSolo(setup,[compileChartSkill(s,setup)]);
 assert.equal(ordinary.events.length,0);assert.equal(chart.events.length,1);assert.ok(chart.hpRemaining>ordinary.hpRemaining);
 const corner=skill('corner',[[{field:'is_finalcorner',operator:'==',value:1}]]);
 assert.equal(compileChartSkill(corner,setup).status,'inactive');
});

test('unsupported native uniques stop the chart; unknown candidate effects do not become zero rows',()=>{
 const d=fixture();d.skills['201'].invocations[0].effects[0].kind='unknown';
 assert.deepEqual(prepareChart(d,profiles,{skills:{}},input).rows.map(r=>r.id),['202']);
 d.skills['100'].invocations[0].effects[0].kind='unknown';
 assert.throws(()=>prepareChart(d,profiles,{skills:{}},input),/고유기/);
});

test('owned unique level changes the native coefficient without modifying the data or inherited versions',()=>{
 const d=fixture(),one=createChartSetup(d,profiles,{...input,uniqueLevel:1}),six=createChartSetup(d,profiles,input);
 assert.ok(compileChartSkill(d.skills['100'],six).invocations[0].effects[0].value>compileChartSkill(d.skills['100'],one).invocations[0].effects[0].value);
 const inherited={...d.skills['100'],rarity:'inherited',inherited:true};
 assert.equal(compileChartSkill(inherited,one).invocations[0].effects[0].value,compileChartSkill(inherited,six).invocations[0].effects[0].value);
 assert.equal(d.skills['100'].invocations[0].effects[0].value_raw,2000);
});

test('known repeat policies preserve distance-scaled cooldown; unknown repeat policies remain excluded',()=>{
 const d=fixture(),setup=createChartSetup(d,profiles,input);
 setup.course={...setup.course,corners:[{start:100,length:400},{start:1500,length:400}]};
 const corner=skill('corner',[[{field:'all_corner_random',operator:'==',value:1}]]);corner.invocations[0].cooldown_raw=300000;
 const c=compileChartSkill(corner,setup);assert.equal(c.status,'supported');assert.equal(c.invocations[0].cooldownSeconds,66);assert.equal(c.invocations[0].chartRandomPolicy,'corners');
 const arbitrary=skill('arbitrary',[[{field:'phase',operator:'==',value:1}]]);arbitrary.invocations[0].cooldown_raw=300000;
 assert.equal(compileChartSkill(arbitrary,setup).status,'unsupported');
});

test('repeat activations reuse cached windows and wait until strictly after cooldown',()=>{
 const d=fixture(),setup=createChartSetup(d,profiles,input);
 const repeat=skill('repeat',[[{field:'straight_random',operator:'==',value:1}]]);repeat.invocations[0].cooldown_raw=100000;
 const compiled=compileChartSkill(repeat,setup),sampler=(branches,id,inv,pre)=>pre?branches:branches.map(b=>({...b,random:false,windows:[[100,110],[1100,1110]],at:100}));
 const run=simulateSolo(setup,[compiled],.5,{dt:.01,branchSampler:sampler});
 assert.equal(run.events.length,2);assert.ok(run.events[0].x>=100&&run.events[0].x<110);assert.ok(run.events[1].x>=1100&&run.events[1].x<1110);
 assert.ok(run.events[1].t-run.events[0].t>22);
 const single=simulateSolo(setup,[compiled],.5,{dt:.01,branchSampler:(branches,id,inv,pre)=>pre?branches:branches.map(b=>({...b,random:false,windows:[[100,110]],at:100}))});
 assert.equal(single.events.length,1);
});

test('explicit full-spurt approximation is opt-in and leaves the legacy solver default unchanged',()=>{
 const d=fixture(),setup=createChartSetup(d,profiles,input);setup.stats={...setup.stats,speed:2200};
 const legacy=simulateSolo(setup,[],.5,{dt:.02}),chart=simulateSolo(setup,[],.5,{dt:.02,fullSpurt:true});
 assert.equal(legacy.fullSpurtExcluded,true);assert.equal(chart.fullSpurtExcluded,false);assert.equal(chart.fullSpurtApproximation,true);assert.ok(chart.finishTime<legacy.finishTime);
});

test('batches preserve all candidates and cancellation suppresses a stale final result',async()=>{
 const d=fixture();for(let i=0;i<35;i++){const id=String(300+i);d.skills[id]=skill(id,[]);d.internal_acceleration_comparison_cost[id]=100;}
 const messages=[],cache=new Map();const result=await generateChart(d,profiles,{skills:{}},input,{samples:1,dt:.05,cache,onProgress:p=>messages.push(p.completed)});
 assert.equal(result.rows.length,37);assert.deepEqual(messages,[30,37]);assert.ok(cache.size===37);
 let cancel=false;const stopped=await generateChart(d,profiles,{skills:{}},input,{samples:1,dt:.05,cache,onProgress:()=>cancel=true,cancelled:()=>cancel});assert.equal(stopped,null);
});

test('acquisition records have eight states and evolution branch ownership remains distinct',()=>{
 assert.equal(ACQUISITION_OPTIONS.length,8);
 const rows=[{id:'gold'},{id:'evoA',evolutionBaseId:'gold'},{id:'evoB',evolutionBaseId:'gold'},{id:'heal'}],states={gold:'3',evoA:'owned',heal:'0'};
 assert.deepEqual(checklistSnapshot(rows,states),{gold:'3',evoA:'owned',evoB:'unavailable',heal:'0'});
 assert.deepEqual(checklistCounts(rows,states),{total:4,available:3,owned:1});
});

test('real JP candidates have no Top10 cutoff and supported recovery rows remain in the pool',()=>{
 const setup=createChartSetup(actual,actualProfiles,{outfitId:'101301',scenarioId:'15',style:2,courseId:'10808',supportIds:[]});
 const task=prepareChart(actual,actualProfiles,display,{outfitId:'101301',scenarioId:'15',style:2,courseId:'10808',supportIds:[]},{samples:1,dt:.05});
 assert.ok(task.rows.filter(r=>r.inherited).length>10);assert.ok(task.rows.some(r=>r.categories.includes('heal')));
 assert.ok(task.rows.some(r=>r.id==='200561'));assert.ok(task.rows.some(r=>r.id==='101301211'));
 assert.ok(['200331','200332','200361','200362'].every(id=>compileChartSkill(actual.skills[id],setup).status!=='unsupported'));
});
