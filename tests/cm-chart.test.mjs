import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChartSetup,prepareChart,generateChart,compileChartSkill,buildChartCandidates,sortChartRows} from '../assets/cm-chart.mjs';
import {compileSkill} from '../assets/activation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {lengthsBetween} from '../assets/physics.mjs';
import {ACQUISITION_OPTIONS,checklistSnapshot,checklistCounts,inheritedCount,canRecordAcquisition} from '../assets/cm-state.mjs';
import {cmRanks} from '../assets/cm-ranks.mjs';
import {selectInheritedTop,styleRecommendation} from '../assets/cm-recommendation.mjs';
import {categoryRows,skillCategory} from '../assets/cm-categories.mjs';
import {courseSegments,elevationProfile,courseSvg} from '../assets/cm-course.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const manifest=read('data/manifest.json'),actual=read(manifest.dataset_path),actualProfiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const input={outfitId:'1',style:2,courseId:'c',scenarioId:'15',supportIds:[],bloom:5,uniqueLevel:6};
const profiles={profiles:{'15':{id:'15',stats:{speed:1800,stamina:1800,power:1800,guts:1600,wisdom:1800}}}};
function skill(id,condition,effect='target_speed',value=1500,rarity='white'){
 return {id,activation_raw:0,name_jp:id,description_jp:id,rarity,inherited:false,jp_available:true,parent_ids:[],categories:[effect==='heal'?'heal':effect==='acceleration'?'acceleration':'speed'],
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

test('a first-chart cap cannot remove an evolution that becomes active at actual post-training stats',async()=>{
 const d=fixture(),condition=[[{field:'base_speed',operator:'>=',value:2300}]];
 d.skills['300']=skill('300',condition,'target_speed',1000,'gold');d.skills['301']=skill('301',condition,'target_speed',4500,'evolution');
 d.acquisition_routes.push({skill_id:'300',owner_type:'outfit',owner_id:'1',kind:'self'});
 d.evolution_rules.push({base_id:'300',evolved_id:'301',owner_type:'outfit',owner_id:'1'});d.purchase_stages['300']={status:'verified',base_cost:100};
 const chart=await generateChart(d,profiles,{},input,{samples:1,dt:.05});
 assert.ok(chart.rows.some(row=>row.id==='300'));assert.ok(chart.evolutionOptions.some(row=>row.id==='301'));
 assert.ok(chart.rows.every(row=>row.rarity!=='evolution'));
 const plan=await recommendFinalPlan(d,chart,{'300':'0'},{stats:{...chart.setup.stats,speed:2300},spBudget:100},{searchSamples:1,searchDt:.05,samples:1,dt:.05});
 assert.ok(plan.activeIds.includes('301'));assert.equal(plan.purchases[0].id,'300');assert.equal(plan.budget.used,100);
});

test('each skill family lists evolution alternatives before its indented rare and ordinary tiers',()=>{
 const rows=[{id:'white',rarity:'white',name:'white'},{id:'rare',rarity:'gold',name:'rare'},{id:'evoB',rarity:'evolution',name:'B'},{id:'evoA',rarity:'evolution',name:'A'},{id:'standalone',rarity:'white',name:'standalone'}];
 const display={skills:{white:{groupId:'chain',iconId:'20011',order:1},rare:{groupId:'chain',iconId:'20012',order:2},evoA:{groupId:'chain',iconId:'20016',order:3},evoB:{groupId:'chain',iconId:'20016',order:4},standalone:{groupId:'separate',iconId:'20011',order:5}}};
 const data={evolution_rules:[]},sorted=sortChartRows(rows,data,display);
 assert.deepEqual(sorted.map(row=>[row.id,row.indentLevel]),[['evoA',0],['evoB',0],['rare',1],['white',2],['standalone',0]]);
 const withoutEvolution=sortChartRows(rows.filter(row=>!row.id.startsWith('evo')),data,display);
 assert.deepEqual(withoutEvolution.map(row=>[row.id,row.indentLevel]),[['rare',0],['white',1],['standalone',0]]);
});

test('verified purchase chains stay together when newer skills lack display metadata',()=>{
 const rows=[{id:'ordinary',name:'ordinary',rarity:'white'},{id:'rare',name:'rare',rarity:'gold'}];
 const data={purchase_stages:{rare:{status:'verified',prerequisite_id:'ordinary'}},evolution_rules:[]};
 for(const display of [{skills:{}},{skills:{rare:{groupId:'family',iconId:'20012',order:1}}},{skills:{ordinary:{groupId:'family',iconId:'20011',order:2}}}]){
  const sorted=sortChartRows(rows,data,display);
  assert.deepEqual(sorted.map(row=>[row.id,row.indentLevel]),[['rare',0],['ordinary',1]]);
  assert.equal(sorted[0].groupId,sorted[1].groupId);
 }
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

test('start predicates remain executable in chart compilation and spatial impossibility stays excluded',()=>{
 const d=fixture(),setup=createChartSetup(d,profiles,input),s=skill('start',[[{field:'is_badstart',operator:'==',value:0},{field:'phase',operator:'==',value:1}]],'heal',550);
 const ordinary=simulateSolo(setup,[compileSkill(s,setup)]),chart=simulateSolo(setup,[compileChartSkill(s,setup)]);
 assert.equal(ordinary.events.length,0);assert.equal(chart.events.length,0);assert.equal(chart.hpRemaining,ordinary.hpRemaining);
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

test('spatial and fulfilled-trigger repeats preserve distance-scaled cooldown',()=>{
 const d=fixture(),setup=createChartSetup(d,profiles,input);
 setup.course={...setup.course,corners:[{start:100,length:400},{start:1500,length:400}]};
 const corner=skill('corner',[[{field:'all_corner_random',operator:'==',value:1}]]);corner.invocations[0].cooldown_raw=300000;
 const c=compileChartSkill(corner,setup);assert.equal(c.status,'supported');assert.equal(c.invocations[0].cooldownSeconds,66);assert.equal(c.invocations[0].chartRandomPolicy,'corners');
 const arbitrary=skill('arbitrary',[[{field:'phase',operator:'==',value:1}]]);arbitrary.invocations[0].cooldown_raw=300000;
 const a=compileChartSkill(arbitrary,setup);assert.equal(a.status,'supported');assert.equal(a.invocations[0].cooldownSeconds,66);
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

test('internal JP comparison pool retains ordinary recovery and scores more than ten inheritance candidates',()=>{
 const setup=createChartSetup(actual,actualProfiles,{outfitId:'101301',scenarioId:'15',style:2,courseId:'10808',supportIds:[]});
 const task=prepareChart(actual,actualProfiles,display,{outfitId:'101301',scenarioId:'15',style:2,courseId:'10808',supportIds:[]},{samples:1,dt:.05});
 assert.ok(task.rows.filter(r=>r.inherited).length>10);assert.ok(task.rows.some(r=>r.categories.includes('heal')));
 assert.ok(task.rows.some(r=>r.id==='200561'));assert.ok(task.rows.some(r=>r.id==='101301211'));
 assert.ok(['200331','200332','200361','200362'].every(id=>compileChartSkill(actual.skills[id],setup).status!=='unsupported'));
});

test('a fixed-inapplicable evolution never hides the obtainable original gold',()=>{
 for(const [outfitId,courseId,style,id] of [['107701','10611',2,'200154'],['102503','10811',4,'200751']]){
  const setup=createChartSetup(actual,actualProfiles,{outfitId,courseId,style,scenarioId:'15',supportIds:[]});
  assert.ok(buildChartCandidates(actual,setup).has(id));
 }
});

test('CM rank percentages round the field-size threshold and preserve exact-sixth and wide middle ranges',()=>{
 const a=(field,operator,value)=>({field,operator,value});
 assert.deepEqual(cmRanks([a('order_rate','<=',40)]),[1,2,3,4]);
 assert.deepEqual(cmRanks([a('order_rate','>',50)]),[6,7,8,9]);
 assert.deepEqual(cmRanks([a('order_rate','>=',65),a('order_rate','<=',70)]),[6]);
 const setup=createChartSetup(actual,actualProfiles,{outfitId:'101301',scenarioId:'15',style:2,courseId:'10808'});
 const ana=actual.skills['900271'];assert.equal(styleRecommendation(ana,compileChartSkill(ana,setup),setup).eligible,true);
 const native=actual.skills['100511'];assert.deepEqual(styleRecommendation(native,compileChartSkill(native,setup),setup).allowedStyles,[1,2,3,4]);
 assert.equal(styleRecommendation(ana,compileChartSkill(ana,setup),{...setup,style:3}).eligible,true);
 const middle=actual.skills['202661'];assert.equal(styleRecommendation(middle,compileChartSkill(middle,setup),setup).eligible,true);
 const heal=actual.skills['200352'];assert.equal(styleRecommendation(heal,compileChartSkill(heal,setup),setup).source,'not-applicable');
});

test('chart-only external triggers restore passive/counter skills while unknown effects stay excluded',()=>{
 const setup=createChartSetup(actual,actualProfiles,{outfitId:'101301',scenarioId:'15',style:2,courseId:'10808'});
 for(const id of ['200271','200281','200291','900171','900551'])assert.ok(['supported','assumed'].includes(compileChartSkill(actual.skills[id],setup).status),id);
 const tight=createChartSetup(actual,actualProfiles,{outfitId:'101301',scenarioId:'15',style:2,courseId:'10401'});
 assert.equal(compileChartSkill(actual.skills['202241'],tight).status,'supported');
});

test('final-corner latter-half includes the final straight, furlong stays spatial and orphan links disappear',()=>{
 const d=fixture(),setup=createChartSetup(d,profiles,input),a=(field,value)=>({field,operator:'==',value});
 const half=compileChartSkill(skill('half',[[a('is_finalcorner_laterhalf',1)]]),setup);
 assert.equal(half.status,'supported');assert.deepEqual(half.invocations[0].condition[0].windows,[[0,2200]]);
 const furlong=compileChartSkill(skill('furlong',[[a('furlong',3)]]),setup);
 assert.deepEqual(furlong.invocations[0].condition[0].windows,[[600,800]]);
 const orphan=skill('orphan',[[a('corner',1)]]);orphan.invocations.push({...orphan.invocations[0],index:2,condition:[[a('is_activate_other_skill_detail',1)]]});
 assert.equal(compileChartSkill(orphan,setup).status,'inactive');
});

test('strengthened inheritance retains the paid normal option and respects real style gates for effects',()=>{
 for(const style of [2,3]){
  const t=prepareChart(actual,actualProfiles,display,{outfitId:'101301',scenarioId:'15',style,courseId:'10808',supportIds:[]},{samples:1,dt:.05});
  const strong=style===2?'91101411':'91101351',wrong=style===2?'91101351':'91101411';
  assert.ok(t.rows.some(r=>r.id===strong));assert.ok(t.rows.some(r=>r.id==='901411'));assert.ok(t.rows.some(r=>r.id==='901351'));assert.equal(t.rows.find(r=>r.id===wrong)?.calculationState,'inactive');
  assert.ok(t.rows.some(r=>r.inherited&&r.categories.includes('heal')));
 }
});

test('inheritance Top10 uses unrounded positive mean, skips unsuitable and duplicate origins, and publishes only a locked shortlist',async()=>{
 const ranked=Array.from({length:12},(_,i)=>({id:String(i),inherited:true,gain:1+i/10000,recommendation:{eligible:true}}));
 ranked.push({id:'bad',inherited:true,gain:99,recommendation:{eligible:false}},{id:'zero',inherited:true,gain:.0001,recommendation:{eligible:true}});
 assert.deepEqual(selectInheritedTop(ranked).map(r=>r.id),['11','10','9','8','7','6','5','4','3','2']);
 const d=fixture();for(let i=0;i<12;i++){const id=String(900000+i);d.skills[id]={...skill(id,[[{field:'phase',operator:'==',value:1}]],'target_speed',6000+i*100,'inherited'),inherited:true,parent_ids:['other']};}
 const progress=[],r=await generateChart(d,profiles,{skills:{}},input,{samples:1,dt:.05,batchSize:3,onProgress:p=>progress.push(p)});
 assert.equal(r.rows.filter(r=>r.inherited).length,10);assert.equal(r.inheritedTopIds.length,10);
 for(const p of progress)assert.ok(p.rows.filter(row=>row.inherited).every(row=>r.inheritedTopIds.includes(row.id)));
 assert.equal(r.rows.find(r=>r.id==='202').gain,0);
});

test('six inheritance selections count all hint/purchased states across filters, and can be released',()=>{
 const rows=Array.from({length:10},(_,i)=>({id:String(i),inherited:true})),states={0:'owned',1:'0',2:'1',3:'3',4:'4',5:'5',outside:'owned'};
 assert.equal(inheritedCount(rows,states),6);assert.equal(canRecordAcquisition(rows,states,'6','0'),false);
 assert.equal(canRecordAcquisition(rows,states,'0','4'),true);assert.equal(canRecordAcquisition(rows,states,'0','unavailable'),true);
 states[0]='unavailable';assert.equal(canRecordAcquisition(rows,states,'6','owned'),true);
});

test('icon categories are disjoint, keep source order and place mixed skills by game icon',()=>{
 const rows=[{id:'a',iconId:'10011',categories:['passive']},{id:'b',iconId:'20013',categories:['speed','heal']},{id:'c',iconId:'20021',categories:['heal']},{id:'d',iconId:'20041',categories:['acceleration']},{id:'e',iconId:'20141',categories:['speed','heal']},{id:'f',iconId:null,categories:['speed']}];
 assert.deepEqual(rows.map(skillCategory),['passive','speed','heal','acceleration','other','speed']);
 assert.deepEqual(categoryRows(rows,'speed').map(r=>r.id),['b','f']);assert.deepEqual(categoryRows(rows,'all'),rows);
});

test('course diagram retains Nakayama2500 boundaries, unknown initial section and integrated relative elevation',()=>{
 const c=Object.values(actual.courses).find(c=>c.track_id==='10005'&&c.distance===2500&&c.surface===1),segments=courseSegments(c);
 assert.equal(segments[0].kind,'unknown');assert.deepEqual(segments.filter(s=>s.kind==='corner').map(s=>s.label),['3코너','4코너','1코너','2코너','3코너','최종 코너']);
 assert.ok(segments.some(s=>s.start===2190&&s.label==='최종 직선'));assert.match(courseSvg(c),/>1666<\/text>/);
 assert.deepEqual(elevationProfile({distance:1000,slopes:[{start:100,length:200,slope:100}]}),[[0,0],[100,0],[300,2],[1000,2]]);
});
