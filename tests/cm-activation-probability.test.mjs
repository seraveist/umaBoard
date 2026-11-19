import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileChartSkill,branchSampler,prepareChart,generateChart} from '../assets/cm-chart.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {sampleUnit,activationProbability,normalizeRaceContext} from '../assets/race-sampling.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {buildPhysics} from '../assets/physics.mjs';
import {planSpurt,SPURT_POLICY} from '../assets/spurt-planning.mjs';

const course={id:'c',selectable:true,distance:1200,distance_type:1,surface:1,turn:1,track_id:'10008',course_set_status:[],corners:[],straights:[{start:0,end:1200}],slopes:[]};
const setup={course,stats:{speed:1600,stamina:2000,power:1500,guts:1200,wisdom:1800},style:2,going:1,mood:2,bloom:5,uniqueLevel:6,aptitudes:{distance:'A',surface:'A',style:'A'},raceContext:{postNumber:7,popularity:4}};
const atom=(field,value,operator='>=')=>({field,value,operator});
function skill(id,kind='target_speed',value=1500,condition=[[atom('remain_distance',400,'<=')]],extras={}){
 return {id,name_jp:id,jp_available:true,rarity:'white',inherited:false,activation_raw:0,categories:[kind==='heal'?'heal':'speed'],parent_ids:[],invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',effects:[{kind,source_type:kind,value_raw:value,unit:'umatools_raw',extras_raw:{}}]}],...extras};
}
const simulate=(skills,sample=0,s=setup)=>simulateSolo(s,skills.map(raw=>compileChartSkill(raw,s)),.5,{dt:.05,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(s,[],sample)});
const event=(run,id)=>run.events.filter(e=>e.id===id);

test('full dimension keys stratify every Latin block without correlating the old ID collisions',()=>{
 const n=1024,keys=['200361|straight|0','201101|straight|0','204322|phase_random:==:1|0','204701|phase_random:==:1|0'];
 const values=keys.map(key=>Array.from({length:n},(_,i)=>sampleUnit(i,key)));
 for(const v of values){for(let start=0;start<n;start+=64)assert.equal(new Set(v.slice(start,start+64).map(q=>Math.floor(q*64))).size,64);assert.ok(v.every(q=>q>=0&&q<1));}
 for(let i=1;i<values.length;i++){
  assert.notDeepEqual(values[0],values[i]);
  const covariance=values[0].reduce((sum,q,k)=>sum+(q-.5)*(values[i][k]-.5),0)/n;
  assert.ok(Math.abs(covariance)<.01,covariance);
 }
 assert.equal(sampleUnit(7,keys[0]),sampleUnit(7,keys[0]));assert.notEqual(sampleUnit(7,keys[0]),sampleUnit(7,keys[0],1));
});

test('common random numbers are selection/order independent and alternative invocations retain one spatial draw',()=>{
 const raw=skill('alternative','target_speed',2000,[[atom('phase_random',1,'==')]]);
 raw.invocations.push({...raw.invocations[0],index:2});
 const c=compileChartSkill(raw,setup),a=branchSampler(setup,[],3),b=branchSampler(setup,['unrelated'],3);
 const first=a(c.invocations[0].condition,c.id,c.invocations[0],false)[0],second=a(c.invocations[1].condition,c.id,c.invocations[1],false)[0];
 assert.equal(first.at,second.at);assert.equal(first.sharedLotQ,second.sharedLotQ);
 assert.deepEqual(first,b(c.invocations[0].condition,c.id,c.invocations[0],false)[0]);
});

test('unrelated skill addition cannot change gate, popularity or start delay of the paired race',()=>{
 const s={...setup,raceContext:{}},a=simulate([],7,s),b=simulate([skill('neutral','model_neutral',0)],7,s);
 assert.equal(a.finishTime,b.finishTime);assert.deepEqual({...a.activation,eligibleIds:[]},{...b.activation,eligibleIds:[]});
});

test('native recovery-count triggers require the actual third recovery for arbitrary IDs and acquisition order',()=>{
 for(const nativeId of ['000-native','999-native']){
  const native=skill(nativeId,'acceleration',3000,[[atom('distance_rate',50),atom('activate_count_heal',3)]],{rarity:'unique'});
  const heals=[100,300,800].map((x,i)=>skill(`heal-${i}`,'heal',150,[[atom('remain_distance',1200-x,'<=')]]));
  for(let n=0;n<3;n++)assert.equal(event(simulate([native,...heals.slice(0,n)]),nativeId).length,0);
  const r=simulate([...heals].reverse().concat(native));assert.equal(event(r,nativeId).length,1);assert.ok(event(r,nativeId)[0].x>=800);assert.ok(event(r,nativeId)[0].x<803);
 }
});

test('owned-skill and inheritance-count predicates stay executable even if another owned skill is inactive',()=>{
 const target=skill('999','target_speed',2000,[[atom('is_exist_skill_id',111,'==')]]),owned=skill('111','target_speed',0,[[atom('running_style',4,'==')]]);
 assert.equal(event(simulate([target]),target.id).length,0);assert.equal(event(simulate([target,owned]),target.id).length,1);
 const upgraded=skill('conditional','target_speed',2000,[[atom('phase_random',1,'=='),atom('succession_skill_count',3)]]);
 upgraded.invocations.push({...upgraded.invocations[0],index:2,condition:[[atom('phase_random',1,'==')]],effects:[{...upgraded.invocations[0].effects[0],value_raw:1500}]});
 for(const count of [0,1,2,3,4]){
  const inherited=Array.from({length:count},(_,i)=>skill(`inherit-${i}`,'model_neutral',0,[],{rarity:'inherited',inherited:true}));
  assert.equal(event(simulate([upgraded,...inherited]),upgraded.id)[0].index,count<3?2:1);
 }
});

test('HP thresholds are checked against the actual depletion instead of fulfilled before compilation',()=>{
 const raw=skill('requires-hp','acceleration',4000,[[atom('remain_distance',100,'<='),atom('hp_per',50)]]);
 const low={...setup,stats:{...setup.stats,stamina:1}},high={...setup,stats:{...setup.stats,stamina:3000}};
 assert.equal(event(simulate([raw],0,low),raw.id).length,0);assert.equal(event(simulate([raw],0,high),raw.id).length,1);
});

test('source lotteries are exact probability predicates, with no skill-ID exception',()=>{
 for(const probability of [0,15,30,50,60,100]){
  const raw=skill(`lot-${probability}`,'passive_speed',600000,[[atom('random_lot',probability,'==')]]);let count=0;
  for(let sample=0;sample<256;sample++)count+=Number(event(simulate([raw],sample),raw.id).length>0);
  assert.ok(Math.abs(count/256-probability/100)<=1/64,`${probability}: ${count}`);
 }
});

test('shared lottery preserves popularity branches and one common draw within the same skill',()=>{
 const raw=skill('shared','passive_speed',800000,[[atom('random_lot_shared',60,'=='),atom('popularity',4)]]);
 raw.invocations.push({...raw.invocations[0],index:2,condition:[[atom('random_lot_shared',30,'=='),atom('popularity',3,'<=')]]});
 for(const [popularity,expected]of [[1,.3],[4,.6]]){
  let count=0;for(let i=0;i<256;i++)count+=Number(event(simulate([raw],i,{...setup,raceContext:{popularity,postNumber:7}}),raw.id).length>0);
  assert.ok(Math.abs(count/256-expected)<=1/64);
 }
});

test('wisdom activation and source activation exemptions are separate from the skill lottery',()=>{
 const regular=skill('regular','target_speed',2000,undefined,{activation_raw:1});
 const immune={...regular,id:'immune',activation_raw:0};let count=0;
 for(let i=0;i<256;i++){const r=simulate([regular,immune],i);count+=Number(event(r,regular.id).length>0);assert.equal(event(r,immune.id).length,1);}
 assert.ok(Math.abs(count/256-.95)<=1/64);assert.equal(activationProbability(regular,setup),.95);
 const native={...regular,rarity:'unique',activation_raw:null};assert.equal(activationProbability(native,setup),1);
});

test('known race context overrides population priors and recorded ranks are actual trigger gates',()=>{
 const raw=skill('rank-gated','target_speed',2000,[[atom('order',1,'==')]]),s={...setup,raceContext:{postNumber:9,popularity:2,rankTimeline:[{distance:0,rank:6},{distance:700,rank:1}]}};
 const r=simulate([raw],0,s);assert.equal(r.activation.postNumber,9);assert.equal(r.activation.popularity,2);
 assert.ok(event(r,raw.id)[0].x>=700);assert.equal(compileChartSkill(raw,s).assumed.length,0);
 const unknown=compileChartSkill(raw,setup);assert.ok(unknown.assumed.includes('order'));assert.equal(unknown.status,'assumed');
});

test('recorded external counts are executable and invalid context or lottery syntax is rejected',()=>{
 const raw=skill('recorded','target_speed',2000,[[atom('running_style_count_same',2),atom('temptation_count',1)]]);
 const absent={...setup,raceContext:{conditions:{running_style_count_same:0,temptation_count:0}}};
 const present={...setup,raceContext:{conditions:{running_style_count_same:2,temptation_count:1}}};
 assert.equal(event(simulate([raw],0,absent),raw.id).length,0);
 assert.equal(event(simulate([raw],0,present),raw.id).length,1);
 assert.equal(compileChartSkill(raw,present).assumed.length,0);
 assert.ok(compileChartSkill(raw,setup).assumed.includes('running_style_count_same'));
 const overtake=skill('known-overtake','target_speed',2000,[[atom('distance_rate',50),atom('is_overtake',1,'==')]]);
 const known=simulate([overtake],0,{...setup,raceContext:{conditions:{is_overtake:1}}});
 assert.ok(event(known,overtake.id)[0].x>=600&&event(known,overtake.id)[0].x<602);
 for(const context of [{postNumber:0},{popularity:10},{conditions:{order:NaN}},{rankTimeline:[{distance:400,rank:1},{distance:0,rank:2}]}])assert.throws(()=>normalizeRaceContext(context));
 assert.equal(compileChartSkill(skill('invalid-lot','target_speed',2000,[[atom('random_lot',50)]]),setup).status,'unsupported');
});

test('the final plan admits recorded inheritance outside Top10 including inactive helpers for ownership counts',async()=>{
 const native=skill('native','target_speed',20000,[[atom('distance_rate',50),atom('succession_skill_count',3)]],{rarity:'unique'});
 const inherits=Array.from({length:3},(_,i)=>skill(`outside-${i}`,'target_speed',2000,[[atom('running_style',4,'==')]],{rarity:'inherited',inherited:true}));
 const data={skills:Object.fromEntries([native,...inherits].map(s=>[s.id,s])),relations:[],evolution_rules:[],scenario_exclusive_groups:[],purchase_stages:Object.fromEntries(inherits.map(s=>[s.id,{status:'verified',base_cost:10}]))};
 const chart={setup:{...setup,scenarioId:'15'},nativeIds:[native.id],rows:[],inheritedTopIds:[],inheritanceOptions:inherits.map(s=>({...s,name:s.id}))};
 const states=Object.fromEntries(inherits.map(s=>[s.id,'0']));
 const result=await recommendFinalPlan(data,chart,states,{stats:setup.stats,spBudget:30},{searchSamples:2,samples:8,searchDt:.05,dt:.05});
 assert.deepEqual(result.purchases.map(s=>s.id).sort(),inherits.map(s=>s.id));
 assert.equal(result.activationRates.native,1);assert.ok(result.gain>1);
 for(const raw of inherits)assert.equal(result.activationRates[raw.id],0);
});

test('the bounded optimizer seeds endogenous dependencies instead of eliminating zero-gain helpers',async()=>{
 const native=skill('native','target_speed',20000,[[atom('distance_rate',50),atom('activate_count_heal',3)]],{rarity:'unique'});
 const heals=[100,300,500].map((x,i)=>skill(`heal-${i}`,'heal',100,[[atom('remain_distance',1200-x,'<=')]]));
 const fillers=Array.from({length:10},(_,i)=>skill(`filler-${i}`,'target_speed',1000));
 const all=[native,...heals,...fillers],data={skills:Object.fromEntries(all.map(s=>[s.id,s])),relations:[],evolution_rules:[],scenario_exclusive_groups:[],purchase_stages:Object.fromEntries([...heals,...fillers].map(s=>[s.id,{status:'verified',base_cost:100}]))};
 const chart={setup:{...setup,scenarioId:'15'},nativeIds:[native.id],rows:all.slice(1).map(s=>({...s,name:s.id}))};
 const result=await recommendFinalPlan(data,chart,Object.fromEntries(chart.rows.map(s=>[s.id,'0'])),{stats:setup.stats,spBudget:300},{maxCandidates:2,evaluationLimit:30,searchSamples:4,samples:16,searchDt:.05,dt:.05});
 assert.deepEqual(result.purchases.map(s=>s.id).sort(),heals.map(s=>s.id));assert.ok(result.gain>1);
});

test('the real JP counter skills retain their source predicates in the shared chart/final compiler',()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),d=read(read('data/manifest.json').dataset_path);
 const fields=new Set(['hp_per','activate_count_all','activate_count_middle','activate_count_heal','activate_count_later_half','activate_count_start','activate_count_end_after','activate_count_param_skill','is_exist_skill_id','succession_skill_count','random_lot','random_lot_shared']);
 let checked=0;
 for(const raw of Object.values(d.skills)){
  const own=raw.invocations.flatMap(inv=>[...(inv.condition||[]),...(inv.precondition||[])].flat()).filter(a=>fields.has(a.field));
  if(!own.length)continue;checked++;
  const c=compileChartSkill(raw,setup);if(c.status==='inactive')continue;
  const retained=c.invocations.flatMap(inv=>[...inv.condition,...inv.precondition].flatMap(b=>b.dynamic)).map(a=>a.field);
  for(const a of own)if(c.invocations.some(i=>raw.invocations.find(j=>j.index===i.index)?.condition?.flat().some(b=>b.field===a.field)))assert.ok(retained.includes(a.field),`${raw.id}: ${a.field}`);
 }
 assert.equal(checked,58);
});

test('distance scheduling agrees with frame-by-frame condition checks over spatial, causal and recovery triggers',()=>{
 const list=[skill('a','target_speed',2000,[[atom('phase_random',1,'==')]]),skill('b','heal',150,[[atom('distance_rate',45)]]),skill('c','target_speed',2500,[[atom('activate_count_heal',1),atom('distance_rate',50)]]),skill('d','acceleration',2000,[[atom('is_used_skill_id','c','=='),atom('phase',2,'==')]])];
 for(let sample=0;sample<32;sample++){
  const compiled=list.map(s=>compileChartSkill(s,setup)),options={dt:.02,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(setup,[],sample)};
  const fast=simulateSolo(setup,compiled,.5,options),reference=simulateSolo(setup,compiled,.5,{...options,scheduleConditions:false});
  assert.equal(fast.finishTime,reference.finishTime);assert.equal(fast.hpRemaining,reference.hpRemaining);assert.deepEqual(fast.events,reference.events);
 }
});

test('spurt planning solves a distance/HP budget and never presumes a future recovery',()=>{
 const physics=buildPhysics(setup),x=800,remaining=400,baseCost=physics.consumption(physics.lateCruise,2)/physics.lateCruise,maxCost=physics.consumption(physics.spurt,2)/physics.spurt;
 const rich=planSpurt(1200,x,(remaining-60)*maxCost+1,physics);assert.equal(rich.maximum,true);assert.equal(rich.start,x);
 const hp=(remaining-60)*(baseCost+maxCost)/2,limited=planSpurt(1200,x,hp,physics);
 const projected=(limited.start-x)*baseCost+Math.max(0,1200-limited.start-60)*physics.consumption(limited.speed,2)/limited.speed;
 assert.equal(limited.maximum,false);assert.ok(projected<=hp+1e-6);assert.ok(limited.start>=x&&limited.start<=1200);
});

test('adaptive HP feeds back into spurt predicates and actual travel time while the legacy projection is explicit',()=>{
 const long={...setup,course:{...course,distance:3200,distance_type:4,straights:[{start:0,end:3200}]},stats:{...setup.stats,stamina:1},spurtPolicy:SPURT_POLICY};
 const acceleration=skill('max-spurt-only','acceleration',4000,[[atom('lastspurt',2,'==')]]),compiled=compileChartSkill(acceleration,long);
 const options={dt:.02,keepTrace:false,fullSpurt:true,branchSampler:branchSampler(long,[],0)};
 const actual=simulateSolo(long,[compiled],.5,options),forced=simulateSolo({...long,spurtPolicy:undefined},[compiled],.5,options);
 assert.equal(event(actual,acceleration.id).length,0);assert.equal(actual.maxSpurtAtEntry,false);assert.ok(actual.finishTime>forced.finishTime);
 const recovered={...long,stats:{...long.stats,stamina:3000}},rich=simulate([acceleration],0,recovered);
 assert.equal(rich.maxSpurtAtEntry,true);assert.equal(event(rich,acceleration.id).length,1);
});

test('late recovery can refill the finish gauge but cannot erase a missed maximum spurt at entry',()=>{
 const s={...setup,course:{...course,distance:2400,distance_type:3,straights:[{start:0,end:2400}]},stats:{...setup.stats,stamina:450},spurtPolicy:SPURT_POLICY};
 const heal=skill('late-heal','heal',3500,[[atom('remain_distance',300,'<=')]]);
 const before=simulate([],0,s),after=simulate([heal],0,s);
 assert.equal(after.maxSpurtAtEntry,false);assert.equal(after.fullSpeedFeasible,false);
 assert.ok(after.hpRemaining>0&&after.entryHpShortfall>0);
 assert.equal(after.entryHpShortfall,before.entryHpShortfall);
 assert.equal(after.hpShortfall,Math.max(after.entryHpShortfall,after.peakHpDebt));
});

test('guts affects maximum sprint speed while late cruising is independent; both speed gates apply to extra sprint',()=>{
 const physics=(speed,mood,guts,passive={})=>buildPhysics({...setup,mood,stats:{...setup.stats,speed,guts}},passive);
 const low=physics(2100,0,600),high=physics(2100,0,1800);
 assert.equal(low.lateCruise,high.lateCruise);assert.ok(high.spurt>low.spurt);
 assert.equal(physics(1990,2,1000,{speed:60}).fullSpurtEligible,false);
 assert.equal(physics(2010,-2,1000).fullSpurtEligible,false);
 assert.equal(physics(2010,-2,1000,{speed:100}).fullSpurtEligible,true);
});

test('scheduled rank crossings and spurt gates retain exact frames, overrides and OR alternatives',()=>{
 const list=[
  skill('rank-change','target_speed',3000,[[atom('change_order_onetime',0,'!=')]]),
  skill('overtake','acceleration',2500,[[atom('is_overtake',1,'==')]]),
  skill('early-or-late','target_speed',1200,[[atom('is_lastspurt',1,'==')],[atom('distance_rate',15)]]),
  skill('full','target_speed',1400,[[atom('run_at_full_speed_random',1,'==')]]),
  skill('before-full','heal',100,[[atom('run_at_full_speed_random',0,'==')]]),
  skill('late','target_speed',1600,[[atom('lastspurt',2,'==')]])
 ];
 const rankTimeline=[{distance:0,rank:4},{distance:400,rank:5},{distance:400,rank:3},{distance:400.01,rank:2},{distance:940,rank:6}];
 for(const fullSpurt of [false,true])for(const fixed of [false,true]){
  const raceContext={coherentRanks:true,rankTimeline,...(fixed?{conditions:{change_order_onetime:1},encounterWindows:{is_overtake:[{start:80,end:120,value:1}]}}:{})};
  const s={...setup,spurtPolicy:SPURT_POLICY,stats:{...setup.stats,speed:2200},raceContext,externalDomains:{change_order_onetime:[0,1],is_overtake:[0,1]}};
  const compiled=list.map(raw=>compileChartSkill(raw,s)),options={dt:.05,keepTrace:false,fullSpurt,branchSampler:branchSampler(s,[],0)};
  const fast=simulateSolo(s,compiled,.5,options),oracle=simulateSolo(s,compiled,.5,{...options,scheduleConditions:false});
  assert.deepEqual(fast,oracle);
  const first=id=>fast.events.find(e=>e.id===id)?.x;
  assert.ok(fixed?first('rank-change')<1:first('rank-change')>=400);
  assert.ok(fixed?first('overtake')>=80&&first('overtake')<120:first('overtake')>=400);
  assert.ok(first('early-or-late')<800);assert.ok(first('before-full')<1);
  assert.equal(Number.isFinite(first('full')),fullSpurt);
 }
});
