// Reproducible v9/v10 comparison. Historical results and frozen assets stay intact.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as chart from '../assets/cm-chart.mjs';
import * as final from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {buildAcquisitionHierarchy} from '../assets/cm-state.mjs';
import {selectableCourse} from '../assets/reviewed-course-geometry.mjs';
import {activeSkillIds} from '../assets/skill-context.mjs';
import {compareRacePlans} from '../assets/race-objective.mjs';
import {sampleUnit,scheduleContextBranches} from '../assets/race-sampling.mjs';
import {bulkAcquisition} from '../assets/cm-state.mjs';
import {acquisitionEventGroups,createAcquisitionConstraints} from '../assets/acquisition-constraints.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),write=(p,v)=>fs.writeFileSync(new URL(p,root),JSON.stringify(v,null,2)+'\n');
const hashAssets=(dir='assets/')=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL(dir,root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL(dir+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
const baselineCommit='67b72fd71c3952737b94e3ae0e3e82b2b02fcf8b',baselineHash='6522c0e8ad66e6f9305f8c0adae62a45580a7fd42a22c2b752927e3846119703';
const baselineDir='.cache/v10-frozen-v9/';fs.mkdirSync(new URL(baselineDir+'assets/',root),{recursive:true});
for(const path of execFileSync('git',['ls-tree','-r','--name-only',baselineCommit,'assets'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim().split('\n').filter(p=>/\.(mjs|css)$/.test(p))){
 fs.writeFileSync(new URL(baselineDir+path,root),execFileSync('git',['show',`${baselineCommit}:${path}`],{cwd:fileURLToPath(root)}));
}
assert.equal(hashAssets(baselineDir+'assets/'),baselineHash);
const old={...await import(new URL(baselineDir+'assets/cm-chart.mjs',root)),...await import(new URL(baselineDir+'assets/cm-final-plan.mjs',root)),...await import(new URL(baselineDir+'assets/solo.mjs',root)),...await import(new URL(baselineDir+'assets/race-evaluation.mjs',root))};
const current={...chart,...final,RaceEvaluator,simulateSolo};assert.equal(chart.CM_MODEL_VERSION,'cm-first-chart-v10');assert.equal(final.FINAL_MODEL_VERSION,'cm-post-training-v10');
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
assert.equal(manifest.active_version,'0b105741168200654ef4ef6523e1cb0bc0b7d9852107f3d478ea0fdcd6b7ad26');
const graph=Object.fromEntries([...buildAcquisitionHierarchy(data).lower].map(([id,low])=>[id,[...low]]));
const stats={speed:2100,stamina:2000,power:1700,guts:1400,wisdom:1500},aptitudes={distance:'S',surface:'A',style:'A'};
const stamp={date:'2026-11-18 Asia/Seoul',baselineCommit,baselineAssetsSha256:baselineHash,assetsSha256:hashAssets(),engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim(),modelVersion:chart.CM_MODEL_VERSION,finalModelVersion:final.FINAL_MODEL_VERSION,dataVersion:manifest.active_version,interpretation:'mechanical corrections under unchanged assumed contexts, effect approximations and ranking objective; not empirical frequency calibration'};
const input=(courseId,style,extra={})=>({outfitId:'102201',scenarioId:'12',courseId,style,supportIds:[],season:courseId==='11703'?1:courseId==='10507'?2:3,weather:1,going:1,time:2,...extra});
const setup=(engine,courseId,style,extra={})=>({...engine.createChartSetup(data,profiles,input(courseId,style)),stats,aptitudes,possessionGraph:graph,...extra});
const compact=r=>({gain:r.gain,hpSuccessRate:r.hpSuccessRate,feasible:r.feasible,activationRates:r.activationRates,usefulAccelerationRates:r.usefulAccelerationRates,performance:r.performance,scenarioSensitivity:r.scenarioSensitivity});
const atom=(field,value,operator='==')=>({field,value,operator});
const raw=(id,condition)=>({id,name_jp:id,rarity:'white',activation_raw:0,parent_ids:[],invocations:[{index:1,condition:[condition],precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',effects:[{kind:'acceleration',value_raw:1000,unit:'umatools_raw',extras_raw:{}}]}]});
function evaluator(engine,s,ids,baseline=[],options={}){
 const compile=options.compile??engine.compileChartSkill,compiled=new Map([...new Set([...ids,...baseline])].map(id=>[id,compile(data.skills[id],s)]));
 return new engine.RaceEvaluator(s,compiled,baseline,baseline.filter(id=>data.skills[id].rarity==='unique'),options.sampler??engine.branchSampler);
}
function score(engine,s,ids,{baseline=[],count=144,dt=.01,...options}={}){return compact(evaluator(engine,s,ids,baseline,options).evaluate(ids,count,dt));}
const save=(mode,out)=>{assert.equal(hashAssets(),stamp.assetsSha256);write(`docs/validation/cm-v10-${mode}-20261118.json`,{...stamp,...out});};

if(process.argv.includes('--mechanics')){
 const before=read('docs/validation/cm-v9-reliability-followup-20261118.json'),out={rice:[],noSkillPhysics:{checks:0,maxTimeDifference:0},counterBoundary:null};
 for(const row of before.domainOnly){
  const a=setup(old,row.courseId,2,{samplingSeed:row.seed}),b=setup(current,row.courseId,2,{samplingSeed:row.seed});
  const previous=score(old,a,[row.id],{count:576}),now=score(current,b,[row.id],{count:576});assert.ok(Math.abs(previous.gain-row.current.gain)<1e-10);assert.ok(Math.abs(now.gain-row.reference.gain)<1e-10);
  out.rice.push({courseId:row.courseId,id:row.id,seed:row.seed,previous,current:now});console.log('rice',row.courseId,row.seed,previous.gain,now.gain);
 }
 for(const c of Object.values(data.courses).filter(selectableCourse))for(const style of [1,2,3,4]){
  const s={...setup(current,'10807',style),course:c},a=old.simulateSolo(s,[],.5,{dt:.01,keepTrace:false}),b=simulateSolo(s,[],.5,{dt:.01,keepTrace:false});
  assert.equal(a.finishTime,b.finishTime);assert.deepEqual(a.positions,b.positions);out.noSkillPhysics.checks++;
 }
 const s=setup(current,'10708',3,{stats:{...stats,speed:1400,power:2500,guts:1000},aptitudes:{distance:'A',surface:'A',style:'A'},raceContext:{rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}}});
 const records=[raw('000-a',[atom('distance_rate',30,'>=')]),raw('000-b',[atom('distance_rate',40,'>=')]),data.skills['100591'],data.skills['201611']];
 const a=old.simulateSolo(s,records.map(r=>old.compileChartSkill(r,s)),.5,{dt:.01,keepTrace:false}),b=simulateSolo(s,records.map(r=>chart.compileChartSkill(r,s)),.5,{dt:.01,keepTrace:false,diagnostics:true});
 assert.equal(a.events.length,3);assert.equal(b.events.length,4);assert.equal(b.triggerCounts.inPhase[1],4);
 out.counterBoundary={setup:s,currentEvents:b.events,previousEvents:a.events,previousFinishTime:a.finishTime,currentFinishTime:b.finishTime,counts:b.triggerCounts.inPhase};save('mechanics',out);
}

if(process.argv.includes('--matrix')){
 const before=read('docs/validation/cm-v9-reliability-races-20261118.json'),out={races:before.races,stats,aptitudes,records:[],additionalCourses:[]};assert.equal(before.assetsSha256,baselineHash);
 for(const row of before.matrix){const race=before.races.find(r=>r.key===row.race),s=setup(current,race.courseId,row.style,{season:race.season});const now=score(current,s,[row.id]);out.records.push({race:row.race,courseId:race.courseId,style:row.style,id:row.id,previous:compact(row),current:now});}
 // Course controls selected without fitting any skill scores. These are not
 // claimed to be additional observed CM events or measured encounter data.
 for(const courseId of ['10103','10308','10904'])for(const style of [1,2,3,4])for(const id of ['202711','202871','200641','201581','103003111']){
  const a=setup(old,courseId,style),b=setup(current,courseId,style);out.additionalCourses.push({courseId,style,id,previous:score(old,a,[id]),current:score(current,b,[id])});
 }
 save('matrix',out);console.log('matrix',out.records.length,out.additionalCourses.length);
}

if(process.argv.includes('--physics')){
 const out={traces:[],convergence:[],coreControls:[],formulaReference:'Independent flat piecewise oracle in tests/cm-v10-mechanics.test.mjs; source equation and frame-order review documented separately.'};
 for(const [courseId,style,id,stamina]of [['10807',2,'202711',2000],['10507',4,'200641',3000],['10604',4,'200641',2000],['11703',4,'202871',2000]]){
  const context={coherentRanks:true,rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}};
  const s=setup(current,courseId,style,{stats:{...stats,stamina},raceContext:context}),compiled=chart.compileChartSkill(data.skills[id],s);
  let sample=0,run;
  // A diagnostic trace describes a successful activation, so pick the first
  // eligible keyed sample explicitly; never report it as activation frequency.
  for(;sample<64;sample++){run=simulateSolo(s,[compiled],.5,{dt:.005,fullSpurt:true,branchSampler:chart.branchSampler(s,[],sample),keepTrace:false,diagnostics:true});if(run.events.some(e=>e.id===id))break;}
  assert.ok(sample<64,`no diagnostic activation for ${courseId} ${id}`);
  const baseline=simulateSolo(s,[],.5,{dt:.005,fullSpurt:true,branchSampler:chart.branchSampler(s,[],sample),keepTrace:false,diagnostics:true});
  const event=run.events.find(e=>e.id===id),nearest=baseline.diagnostics.frames.reduce((a,b)=>Math.abs(a.x-event.x)<Math.abs(b.x-event.x)?a:b);
  out.traces.push({courseId,style,id,sample,stats:s.stats,context,event,baselineAtActivationPosition:nearest,entry:run.entry,reach:run.reach,baselineEntry:baseline.entry,baselineReach:baseline.reach,fullSpurtStart:run.diagnostics.frames.find(f=>f.fullSpurtAcceleration>0)?.x??null,
   trace:run.diagnostics.frames.filter((f,i)=>f.x>=s.course.distance*2/3-5&&(i%20===0||Math.abs(f.t-event.t)<.006)).map(f=>({...f})),interpretation:'activation-conditioned fixed-rank diagnostic; selected keyed sample recorded, not scenario-weighted activation frequency'});
  for(const mode of ['on','off'])for(const dt of [.05,.02,.01,.005])out.convergence.push({courseId,style,id,mode,dt,...score(current,{...s,fullSpurtMode:mode},[id],{count:144,dt})});
  // Isolate accelerator overlap with a generic equal early acceleration,
  // without inventing ownership or a named character's complete race build.
  const early={...raw('audit-early',[atom('phase',2,'>=')]),invocations:[{...raw('audit-early',[]).invocations[0],condition:[[atom('phase',2,'>=')]],duration_raw:9000,effects:[{kind:'acceleration',value_raw:4000,unit:'umatools_raw',extras_raw:{}}]}]};
  for(const mode of ['on','off']){
   const t={...s,fullSpurtMode:mode},map=new Map([[id,chart.compileChartSkill(data.skills[id],t)],['audit-early',chart.compileChartSkill(early,t)]]),ev=new RaceEvaluator(t,map,['audit-early'],[],chart.branchSampler);
   out.coreControls.push({courseId,style,id,mode,baseline:'synthetic 0.4 acceleration at late-phase start, 0.9 seconds scaled by distance; controlled overlap only',...compact(ev.evaluate(['audit-early',id],144,.01))});
  }
  console.log('physics',courseId,id);
 }
 save('physics',out);
}

async function plan(engine,courseId,style,budget,{outfitId='102201',rice=false,mode='on',gold=false,core=false}={}){
 const supportIds=gold?[style===2?'30161':'30250']:[],targetId=rice?'103003111':style===2?'202711':'202871';
 const t=engine.prepareChart(data,profiles,display,input(courseId,style,{outfitId,supportIds}),{samples:1,dt:.05}),ids=rice?['201582','201581','201172','201182','200362']:style===2?[...(gold?['202711']:[]),'202712','201102','201112','200362',...(core?['201341']:[])]:[...(gold?['202871']:[]),'202872','201452','201462','200362'];
 const rows=t.rows.filter(r=>ids.includes(r.id)),targetStatus=engine.compileChartSkill(data.skills[targetId],t.setup).status;
 for(const id of ids)assert.ok(rows.some(r=>r.id===id)||id===targetId&&targetStatus==='inactive',`missing test candidate ${courseId} ${style} ${id}`);
 const evo=rice?t.rows.filter(r=>r.evolutionBaseId==='201582'):[],states=Object.fromEntries(rows.map(r=>[r.id,rice&&r.id==='201582'||core&&r.id==='201341'?'owned':'2']));if(rice)assert.equal(evo.length,1);
 const c={setup:{...t.setup,fullSpurtMode:mode},nativeIds:t.nativeIds,rows,modelVersion:t.modelVersion,evolutionOptions:evo},actual={stats,aptitudes,spBudget:budget};
 const p=await engine.recommendFinalPlan(data,c,states,actual,{samples:144,dt:.01,diagnostics:false});assert.ok(p.search.globalOptimal);assert.ok(p.budget.used<=budget);assert.ok(p.acquisitionValidation.feasible);
 return {courseId,style,budget,outfitId,mode,gold,core,supportIds,targetId,targetStatus,targetInPool:rows.some(r=>r.id===targetId)||evo.some(r=>r.id===targetId),states,nativeIds:t.nativeIds,selectedIds:p.activeIds,budgetResult:p.budget,...compact(p),search:p.search};
}
if(process.argv.includes('--plans')||process.argv.includes('--oracles')){
 const before=read('docs/validation/cm-v9-reliability-extra-20261118.json'),out=process.argv.includes('--oracles')?read('docs/validation/cm-v10-plans-20261118.json'):{regular:[],gold:[],goldCore:[],rice:[],oracle:[],ricePolicyOracle:[],historicalAuditCorrection:'The historical 12 plans actually had four candidates, without gold Oute/Kunrin. Prior five-candidate/32-subset prose and gold nonselection conclusions are corrected in the v10 report; raw historical records remain intact.'};
 if(!process.argv.includes('--oracles')){
 for(const row of before.plans){
  const now=await plan(current,row.courseId,row.style,row.budget),off=await plan(current,row.courseId,row.style,row.budget,{mode:'off'});
  out.regular.push({previous:{selectedIds:row.selectedIds,gain:row.gain},current:now,withoutExtraSpurt:off});console.log('plan',row.courseId,row.style,row.budget);write('.cache/v10-plans-progress.json',out);
 }
 for(const courseId of ['10604','10807','11703'])for(const style of [2,4])for(const budget of [300,500,700]){
  const options={gold:true};out.gold.push({previous:await plan(old,courseId,style,budget,options),current:await plan(current,courseId,style,budget,options),withoutExtraSpurt:await plan(current,courseId,style,budget,{...options,mode:'off'})});console.log('gold-plan',courseId,style,budget);write('.cache/v10-plans-progress.json',out);
 }
 for(const budget of [300,500,700]){const options={gold:true,core:true};out.goldCore.push({previous:await plan(old,'10807',2,budget,options),current:await plan(current,'10807',2,budget,options),withoutExtraSpurt:await plan(current,'10807',2,budget,{...options,mode:'off'})});console.log('gold-core',budget);}
 for(const courseId of ['10810','10811'])for(const budget of [300,500]){
  const options={outfitId:'103003',rice:true};out.rice.push({previous:await plan(old,courseId,2,budget,options),current:await plan(current,courseId,2,budget,options),withoutExtraSpurt:await plan(current,courseId,2,budget,{...options,mode:'off'})});console.log('rice-plan',courseId,budget);
 }
 }
 out.oracle=[];out.ricePolicyOracle=[];
 // Independent search/cost oracle. Physics and the declared objective are
 // deliberately shared, so this verifies selection rather than game physics.
 for(const group of ['regular','gold','goldCore'])for(const courseId of ['10604','10807','11703'])for(const style of [2,4])for(const mode of ['on','off']){
  const checks=out[group].filter(r=>r.current.courseId===courseId&&r.current.style===style).map(r=>mode==='on'?r.current:r.withoutExtraSpurt);if(!checks.length)continue;
  const owned=Object.keys(checks[0].states).filter(id=>checks[0].states[id]==='owned'),ids=Object.keys(checks[0].states).filter(id=>!owned.includes(id)),required=[...checks[0].nativeIds,...owned],s=setup(current,courseId,style,{fullSpurtMode:mode,ownedSkillIds:owned}),ev=evaluator(current,s,[...ids,...required],required),rows=[];
  for(let mask=0;mask<2**ids.length;mask++){
   const picked=ids.filter((_,i)=>mask&(1<<i)),stages=new Set();for(const id of picked){let key=id;while(key){if(stages.has(key)||owned.includes(key))break;stages.add(key);assert.equal(data.purchase_stages[key].status,'verified');key=data.purchase_stages[key].prerequisite_id;}}
   const cost=[...stages].reduce((sum,id)=>sum+Math.floor(data.purchase_stages[id].base_cost*80/100),0),active=activeSkillIds([...required,...picked],graph).sort();if(cost<=Math.max(...checks.map(p=>p.budget)))rows.push({ids:active,cost,...ev.evaluate(active,144,.01)});
  }
  for(const p of checks){const best=rows.filter(r=>r.cost<=p.budget).sort(compareRacePlans)[0];assert.deepEqual([...p.selectedIds].sort(),best.ids);assert.ok(Math.abs(p.gain-best.gain)<1e-10);out.oracle.push({group,courseId,style,mode,budget:p.budget,enumeratedSubsets:2**ids.length,selectedIds:best.ids,cost:best.cost,gain:best.gain,match:true});}
 }
 // Reoptimize the slope-dependent evolution cases under the alternative
 // source law by complete enumeration, including the owned gold baseline.
 for(const courseId of ['10810','10811'])for(const mode of ['on','off','source']){
  const checks=out.rice.filter(r=>r.current.courseId===courseId).map(r=>mode==='off'?r.withoutExtraSpurt:r.current),owned=['201582'],required=[...checks[0].nativeIds,...owned],ids=[...Object.keys(checks[0].states).filter(id=>!owned.includes(id)),'103003111'];
  const s={...chart.createChartSetup(data,profiles,input(courseId,2,{outfitId:'103003'})),stats,aptitudes,possessionGraph:graph,ownedSkillIds:owned,fullSpurtMode:mode==='off'?'off':'on'},ev=evaluator(current,s,[...ids,...required],required,mode==='source'?{sampler:sourceSampler}:{}),rows=[];
  for(let mask=0;mask<2**ids.length;mask++){
   const picked=ids.filter((_,i)=>mask&(1<<i)),active=activeSkillIds([...required,...picked],graph).sort(),stages=new Set();for(const id of active.filter(id=>!required.includes(id))){let key=data.evolution_rules.find(r=>r.evolved_id===id)?.base_id??id;while(key){if(stages.has(key)||owned.includes(key))break;stages.add(key);assert.equal(data.purchase_stages[key].status,'verified');key=data.purchase_stages[key].prerequisite_id;}}
   const cost=[...stages].reduce((sum,id)=>sum+Math.floor(data.purchase_stages[id].base_cost*80/100),0);if(cost<=500)rows.push({ids:active,cost,...ev.evaluate(active,144,.01)});
  }
  for(const p of checks){const best=rows.filter(r=>r.cost<=p.budget).sort(compareRacePlans)[0];if(mode==='source')out.ricePolicyOracle.push({courseId,budget:p.budget,policy:'umasim-equal-slope-areas',enumeratedSubsets:2**ids.length,selectedIds:best.ids,cost:best.cost,gain:best.gain,defaultSelectedIds:p.selectedIds,sameSelection:JSON.stringify(best.ids)===JSON.stringify([...p.selectedIds].sort()),interpretation:'independent finite-pool reoptimization under an alternative source law, not a measured game probability'});
   else{assert.deepEqual([...p.selectedIds].sort(),best.ids);assert.ok(Math.abs(p.gain-best.gain)<1e-10);out.oracle.push({group:'rice',courseId,style:2,mode,budget:p.budget,enumeratedSubsets:2**ids.length,selectedIds:best.ids,cost:best.cost,gain:best.gain,match:true});}
  }
 }
 save('plans',out);
}

// Alternative policy: pinned umasim equal slope areas and 2m straight-end
// reserve. This is a source-disagreement experiment, not a production fix.
function referenceCompile(skill,s){return chart.compileChartSkill({...skill,invocations:skill.invocations.map(i=>({...i,condition:i.condition?.map(g=>g.filter(a=>!['up_slope_random','down_slope_random','up_slope_random_later_half','down_slope_random_later_half'].includes(a.field)))}))},s);}
function sourceSampler(s,natives,sample){
 const base=chart.branchSampler(s,natives,sample),unit=(id,key,k=0)=>sampleUnit(sample,`${id}|${key}|${k}`,s.samplingSeed??0);
 const fn=(branches,id,inv,pre)=>{
  const a=(data.skills[id]?.invocations.find(i=>i.index===inv.index)?.condition||[]).flat().find(a=>['straight_random','up_slope_random','down_slope_random','up_slope_random_later_half','down_slope_random_later_half'].includes(a.field));if(pre||!a)return base(branches,id,inv,pre);
  let lo,hi,q;
  if(a.field==='straight_random'){const areas=s.course.straights;if(!areas.length)return [];const k=Math.min(areas.length-1,Math.floor(unit(id,'straight',0)*areas.length));({start:lo,end:hi}=areas[k]);q=unit(id,'straight',1);}
  else{const sign=a.field.startsWith('up')?1:-1,later=a.field.endsWith('later_half'),areas=s.course.slopes.filter(k=>k.slope*sign>0&&(!later||k.start+k.length>s.course.distance/2)).map(k=>[later?Math.max(k.start,s.course.distance/2):k.start,k.start+k.length]);if(!areas.length)return [];q=unit(id,`${a.field}:${a.operator}:${a.value}`)*areas.length;const k=Math.min(areas.length-1,Math.floor(q));[lo,hi]=areas[k];q-=k;}
  const at=Math.max(lo,Math.min(lo+q*(hi-lo),hi-2)),end=Math.min(at+10,hi);
  return scheduleContextBranches(branches.flatMap(b=>{const windows=b.windows.map(([l,h])=>[Math.max(l,at),Math.min(h,end)]).filter(([l,h])=>l<h);return windows.length?[{...b,random:false,windows,at,choiceQ:unit(id,'effect-value',inv.index),fullSpurtQ:unit(id,'full-spurt'),lotQ:unit(id,`lot:${inv.index}:condition`),sharedLotQ:unit(id,'lot-shared')}]:[];}),s);
 };fn.unit=base.unit;fn.policy=base.policy;return fn;
}
if(process.argv.includes('--policies')){
 const out={records:[],interpretation:'source-disagreement sensitivity; no fitted blend, penalty or probability claim'};
 for(const courseId of ['10507','10604','10807','10810','10811'])for(const id of ['201581','201342','103003111','200362'])for(const seed of [0,20261119]){
  const s=setup(current,courseId,2,{samplingSeed:seed});out.records.push({courseId,id,seed,current:score(current,s,[id],{count:576}),alternative:score(current,s,[id],{count:576,compile:referenceCompile,sampler:sourceSampler})});
 }
 save('policies',out);console.log('policies',out.records.length);
}

if(process.argv.includes('--large')){
 const on=read('.cache/cm-current-7000-validation.json');assert.equal(on.modelVersion,final.FINAL_MODEL_VERSION);
 const t=chart.prepareChart(data,profiles,display,on.input,{samples:1,dt:.05});t.setup={...t.setup,fullSpurtMode:'off'};
 const off=await final.recommendFinalPlan(data,t,on.acquisition,on.actual,{diagnostics:false,onProgress:p=>{if(p.completed===p.total)console.log('large-off',p.stage);}});
 assert.ok(off.budget.used<=on.actual.spBudget);assert.ok(off.acquisitionValidation.feasible);
 save('large',{input:on.input,actual:on.actual,acquisition:on.acquisition,assumption:on.acquisitionAssumption,candidateRows:on.chartRows,
  current:{selectedIds:on.activeIds,budget:on.budget,...compact(on),search:on.search},withoutExtraSpurt:{selectedIds:off.activeIds,budget:off.budget,...compact(off),search:off.search},
  addedWithoutExtraSpurt:off.activeIds.filter(id=>!on.activeIds.includes(id)),removedWithoutExtraSpurt:on.activeIds.filter(id=>!off.activeIds.includes(id)),interpretation:'same actual-sized recorded candidate universe and objective, independently reoptimized under both physics modes; bounded search, not proof of global optimality'});
}
if(process.argv.includes('--verify-large')){
 const result=read('docs/validation/cm-v10-large-20261118.json'),live=read('.cache/cm-current-7000-validation.json');assert.equal(result.assetsSha256,stamp.assetsSha256);assert.equal(live.modelVersion,final.FINAL_MODEL_VERSION);
 assert.deepEqual(result.current.selectedIds,live.activeIds);assert.deepEqual(result.current.budget,live.budget);assert.ok(Math.abs(result.current.gain-live.gain)<1e-10);
 result.currentFullSuiteReplayVerified=true;write('docs/validation/cm-v10-large-20261118.json',result);console.log('large baseline verified against final full-suite replay');
}
if(process.argv.includes('--gold-wide')||process.argv.includes('--search-gold-wide')){
 const prefix=process.argv.includes('--search-gold-wide')?'search-gold-wide':'gold-wide',mode=process.argv.includes('--without-extra-spurt')?'off':'on',benchmarkInput=input('10807',2,{scenarioId:'15',supportIds:['30275','30311','30161','30322','30289','30323']}),t=chart.prepareChart(data,profiles,display,benchmarkInput,{samples:1,dt:.05});
 const c={...t,setup:{...t.setup,fullSpurtMode:mode},rows:t.rows.filter(r=>r.rarity!=='evolution'),evolutionOptions:t.rows.filter(r=>r.rarity==='evolution')};
 const states=bulkAcquisition(c.rows,{},'5'),choices=Object.fromEntries(acquisitionEventGroups(data,c.setup).map(event=>[event.key,event.choices[0].id])),constraints=createAcquisitionConstraints(data,{...c.setup,acquisitionChoices:choices});
 for(const row of c.rows)if(row.inherited||row.rarity==='gold'&&!constraints.allowed([row.id]))states[row.id]='unavailable';
 assert.ok(c.rows.some(r=>r.id==='202711'));assert.notEqual(states['202711'],'unavailable');assert.ok(c.rows.some(r=>r.id==='201341'));states['201341']='owned';
 const actual={stats:profiles.profiles['15'].stats,aptitudes:{distance:'S',surface:'A',style:'A'},spBudget:7000,discountTrait:'none',acquisitionChoices:choices};
 const p=await final.recommendFinalPlan(data,c,states,actual,{diagnostics:false,onProgress:v=>{if(v.completed===v.total)console.log('gold-wide',mode,v.stage);}});assert.ok(p.acquisitionValidation.feasible);assert.ok(p.budget.used<=7000);
 const withTarget=activeSkillIds([...p.activeIds,'202711'],graph),ev=evaluator(current,p.setup,[...withTarget,...p.nativeIds,...p.ownedIds],[...p.nativeIds,...p.ownedIds]);
 save(`${prefix}-${mode}`,{input:benchmarkInput,actual,mode,candidateRows:c.rows.length,recordedAvailable:Object.values(states).filter(v=>v!=='unavailable').length,states,
  assumption:'hypothetical Lv5 hints, first reviewed event choices, own Fine Motion downhill gold already paid; no inherited hints recorded; not an observed training replay',
  target:{id:'202711',recordedState:states['202711'],selected:p.activeIds.includes('202711'),marginalAtChosenBuild:ev.marginal(withTarget,'202711',144,.01),interpretation:'paired addition/ablation at selected build; extra addition is a diagnostic and is not claimed affordable when unselected'},
  selectedIds:p.activeIds,budget:p.budget,...compact(p),search:p.search});
}
if(process.argv.includes('--probes')){
 const plans=read('docs/validation/cm-v10-plans-20261118.json'),out={records:[],interpretation:'fixed other skills, gold versus lower white upgrade; diagnostic additions need not fit the selected SP budget; refinement difference is not an error bound'};
 for(const row of [...plans.gold,...plans.goldCore]){
  const p=row.current,id=p.targetId,lower=data.purchase_stages[id].prerequisite_id,owned=Object.keys(p.states).filter(id=>p.states[id]==='owned'),required=[...p.nativeIds,...owned],others=p.selectedIds.filter(key=>key!==id&&key!==lower),strong=activeSkillIds([...others,id],graph),weak=activeSkillIds([...others,lower],graph),s=setup(current,p.courseId,p.style,{ownedSkillIds:owned});
  const ev=evaluator(current,s,[...strong,...weak,...required],required),a=ev.evaluate(strong,144,.01),b=ev.evaluate(weak,144,.01),fineA=ev.evaluate(strong,144,.005),fineB=ev.evaluate(weak,144,.005);
  out.records.push({courseId:p.courseId,style:p.style,budget:p.budget,core:p.core,id,lower,selected:p.selectedIds.includes(id),gain:a.gain,lowerGain:b.gain,upgradeGain:a.gain-b.gain,refinedUpgradeGain:fineA.gain-fineB.gain,upgradeRefinementDifference:Math.abs(a.gain-b.gain-fineA.gain+fineB.gain),usefulAccelerationRate:a.usefulAccelerationRates[id]});
 }
 save('probes',out);
}
if(process.argv.includes('--crosscheck-large')||process.argv.includes('--crosscheck-gold-wide')||process.argv.includes('--search-crosscheck-gold-wide')){
 const updated=process.argv.includes('--search-crosscheck-gold-wide'),prefix=updated?'search-gold-wide':'gold-wide',wide=process.argv.includes('--crosscheck-gold-wide')||updated,large=wide?null:read('docs/validation/cm-v10-large-20261118.json'),on=wide?read(`docs/validation/cm-v10-${prefix}-on-20261118.json`):{...large.current,input:large.input,actual:large.actual,states:large.acquisition},off=wide?read(`docs/validation/cm-v10-${prefix}-off-20261118.json`):{...large.withoutExtraSpurt,input:large.input,actual:large.actual,states:large.acquisition};
 const t=chart.prepareChart(data,profiles,display,on.input,{samples:1,dt:.05}),owned=Object.keys(on.states).filter(id=>on.states[id]==='owned'),required=[...t.nativeIds,...owned],ids=[...new Set([...on.selectedIds,...off.selectedIds,...required])],out={records:[],interpretation:'cross-evaluate both complete chosen plans under each physics mode; separate model sensitivity from bounded-search differences'};
 for(const mode of ['on','off']){
  const s={...final.createFinalSetup(t,on.actual),ownedSkillIds:owned,fullSpurtMode:mode},ev=evaluator(current,s,ids,required),a={ids:on.selectedIds,cost:on.budget.used,...ev.evaluate(on.selectedIds,144,.01)},b={ids:off.selectedIds,cost:off.budget.used,...ev.evaluate(off.selectedIds,144,.01)},own=mode==='on'?a:b,other=mode==='on'?b:a;
  assert.ok(Math.abs(own.gain-(mode==='on'?on.gain:off.gain))<1e-10);
  out.records.push({mode,onSelection:compact(a),offSelection:compact(b),otherSelectionBeatsOwnUnderDeclaredObjective:compareRacePlans(other,own)<0});
 }
 save(wide?`${prefix}-crosscheck`:'large-crosscheck',out);
}
if(process.argv.includes('--search-report')){
 const live=read('.cache/cm-current-7000-validation.json'),witness=read('docs/validation/cm-v10-search-witness-20261118.json'),before=read('docs/validation/cm-v10-large-20261118.json');
 assert.deepEqual(live.input,witness.input);assert.deepEqual(live.actual,witness.actual);assert.deepEqual(live.acquisition,before.acquisition);assert.equal(live.search.precisionSeedCount,2);assert.ok(live.search.precisionScreeningComplete);
 const required=[...live.nativeIds,...live.ownedIds],ev=evaluator(current,live.setup,[...new Set([...required,...live.activeIds,...witness.activeIds])],required),own={ids:live.activeIds,cost:live.budget.used,...ev.evaluate(live.activeIds,144,.01)},alternative={ids:witness.activeIds,cost:witness.budget.used,...ev.evaluate(witness.activeIds,144,.01)};
 assert.ok(Math.abs(own.gain-live.gain)<1e-10);assert.ok(compareRacePlans(own,alternative)<=0);
 save('search-final',{input:live.input,actual:live.actual,availableStates:live.acquisition,previousMechanicalCommit:witness.sourceCommit,previousAssetsSha256:witness.sourceAssetsSha256,
  previous:{selectedIds:before.current.selectedIds,budget:before.current.budget,...compact(before.current)},witness:{selectedIds:witness.activeIds,budget:witness.budget,...compact(alternative)},current:{selectedIds:live.activeIds,budget:live.budget,...compact(own),search:live.search},
  noWorseThanIndependentlyFoundWitness:true,interpretation:'same recorded input, cost constraints and declared model/objective; search changed, no gain weights or named-skill rules changed; still bounded rather than globally proven optimal'});
}
if(process.argv.includes('--search-heldout')){
 const selected=read('docs/validation/cm-v10-search-final-20261118.json'),live=read('.cache/cm-current-7000-validation.json'),required=[...live.nativeIds,...live.ownedIds],plans={previous:selected.previous.selectedIds,witness:selected.witness.selectedIds,current:selected.current.selectedIds},out={records:[],interpretation:'fixed selected plans on a different keyed seed or finer integration; unchanged assumed encounter population; no reoptimization, empirical probability or confidence-interval claim'};
 for(const [seed,dt,count]of [[20261120,.01,288],[0,.005,144]]){
  const s={...live.setup,samplingSeed:seed},ev=evaluator(current,s,[...new Set([...required,...Object.values(plans).flat()])],required),scores=Object.fromEntries(Object.entries(plans).map(([key,ids])=>[key,{ids,cost:key==='previous'?selected.previous.budget.used:key==='witness'?selected.witness.budget.used:selected.current.budget.used,...ev.evaluate(ids,count,dt)}]));
  out.records.push({seed,dt,count,results:Object.fromEntries(Object.entries(scores).map(([key,r])=>[key,compact(r)])),currentNoWorseThanPrevious:compareRacePlans(scores.current,scores.previous)<=0,currentNoWorseThanWitness:compareRacePlans(scores.current,scores.witness)<=0});
 }
 save('search-heldout',out);
}
