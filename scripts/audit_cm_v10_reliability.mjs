// Audit the frozen v10 engine. Reference variants only exist under .cache.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareChart,compileChartSkill,branchSampler,CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {recommendFinalPlan,createFinalSetup} from '../assets/cm-final-plan.mjs';
import {finalAcquisitionSnapshot} from '../assets/cm-evolution.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {branchReady} from '../assets/activation.mjs';
import {activeSkillIds} from '../assets/skill-context.mjs';
import {compareRacePlans} from '../assets/race-objective.mjs';
import {selectionRules} from '../assets/selection.mjs';
import {createAcquisitionConstraints} from '../assets/acquisition-constraints.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),write=(p,v)=>fs.writeFileSync(new URL(p,root),JSON.stringify(v,null,2)+'\n');
const hash=()=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL('assets/',root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
const frozen='779d0b8477d178c8bded03db8a497462134647002554b3d6cda3d5bab39d8833';assert.equal(hash(),frozen);assert.equal(CM_MODEL_VERSION,'cm-first-chart-v10');
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
assert.equal(manifest.active_version,'0b105741168200654ef4ef6523e1cb0bc0b7d9852107f3d478ea0fdcd6b7ad26');
const stamp={date:'2026-11-18 Asia/Seoul',frozenCommit:'5699d480ec7fb4db09a3c739b5c1212a46314838',assetsSha256:frozen,dataVersion:manifest.active_version,interpretation:'adversarial audit of current implementation; assumed encounter population unchanged; not measured activation or win probabilities'};
const save=(name,out)=>{assert.equal(hash(),frozen);write(`docs/validation/cm-v10-reaudit-${name}-20261118.json`,{...stamp,...out});};
const input=(courseId,extra={})=>({outfitId:'102201',scenarioId:'15',style:2,supportIds:[],courseId,going:1,weather:1,season:3,time:2,...extra});
const compact=r=>({gain:r.gain,feasible:r.feasible??r.fullSpeedFeasible,hpSuccessRate:r.hpSuccessRate,hpShortfall:r.hpShortfall,performance:r.performance,activationRates:r.activationRates,usefulAccelerationRates:r.usefulAccelerationRates});
const atom=(field,value,operator='==')=>({field,value,operator});
fs.mkdirSync(new URL('.cache/v10-reaudit/',root),{recursive:true});

if(process.argv.includes('--candidates')){
 const out={scope:'all ten scenario profiles and three real courses, one representative real stat-gated white; causal final-plan probes preserve original race setup and actual stats',matrix:[],plans:[]};
 const id='204142';
 for(const scenarioId of Object.keys(profiles.profiles))for(const courseId of ['10604','10810','10704']){
  const t=prepareChart(data,profiles,{skills:{}},input(courseId,{scenarioId}),{samples:1,dt:.05}),actual={...t.setup,stats:{...t.setup.stats,stamina:1800}},c=compileChartSkill(data.skills[id],actual);
  out.matrix.push({scenarioId,courseId,id,baseStamina:t.setup.stats.stamina,actualStamina:1800,inChecklist:t.rows.some(r=>r.id===id),actualCompileStatus:c.status,recordedHintSurvives:finalAcquisitionSnapshot(data,{setup:t.setup,nativeIds:t.nativeIds,rows:t.rows},{[id]:'2'})[id]??null});
 }
 const raceInput=input('10810',{scenarioId:'8'}),t=prepareChart(data,profiles,{skills:{}},raceInput,{samples:1,dt:.05}),candidateProfiles=structuredClone(profiles);candidateProfiles.profiles['8'].stats.stamina=1800;
 const enriched=prepareChart(data,candidateProfiles,{skills:{}},raceInput,{samples:1,dt:.05}),row=enriched.rows.find(r=>r.id===id);assert.ok(row);assert.ok(!t.rows.some(r=>r.id===id));
 // Only candidate membership changes. Both planners use the ORIGINAL setup
 // and identical actual stats, cost, acquisition state, context and objective.
 const missing={setup:t.setup,nativeIds:t.nativeIds,rows:[],evolutionOptions:[],modelVersion:t.modelVersion},complete={...missing,rows:[row]},states={[id]:'2'};
 for(const stamina of [1199,1200,1800,2400]){
  const actual={stats:{...t.setup.stats,stamina},aptitudes:t.setup.aptitudes,spBudget:200},a=await recommendFinalPlan(data,missing,states,actual,{samples:144,dt:.01,diagnostics:false}),b=await recommendFinalPlan(data,complete,states,actual,{samples:144,dt:.01,diagnostics:false});
  out.plans.push({input:raceInput,id,name:data.skills[id].name_jp,actual,originalProfile:t.setup.stats,candidateHarvestProfile:candidateProfiles.profiles['8'].stats,priceStage:data.purchase_stages[id],
   missing:{selectedIds:a.activeIds,recordedState:a.acquisition[id]??null,budget:a.budget,...compact(a)},candidateRestored:{selectedIds:b.activeIds,recordedState:b.acquisition[id]??null,budget:b.budget,...compact(b)}});
 }
 save('candidates',out);console.log('candidate matrix',out.matrix.length,'final probes',out.plans.length);
}

if(process.argv.includes('--clock')){
 const assets=new URL('assets/',root).href;
 let activation=fs.readFileSync(new URL('assets/activation.mjs',root),'utf8').replaceAll("from './",`from '${assets}`);
 const needle='state.x>=state.fullSpurtStart+(state.distance-state.fullSpurtStart)*(branch.fullSpurtQ??.5)';assert.ok(activation.includes(needle));activation=activation.replace(needle,'previous>=state.fullSpurtStart+(state.distance-state.fullSpurtStart)*(branch.fullSpurtQ??.5)');
 fs.writeFileSync(new URL('.cache/v10-reaudit/activation-start-reference.mjs',root),activation);
 const activationURL=new URL('.cache/v10-reaudit/activation-start-reference.mjs',root).href;
 let solo=fs.readFileSync(new URL('assets/solo.mjs',root),'utf8').replace("from './activation.mjs'",`from '${activationURL}'`).replaceAll("from './",`from '${assets}`);
 fs.writeFileSync(new URL('.cache/v10-reaudit/solo-start-reference.mjs',root),solo);
 let evaluation=fs.readFileSync(new URL('assets/race-evaluation.mjs',root),'utf8').replace("from './solo.mjs'",`from '${new URL('.cache/v10-reaudit/solo-start-reference.mjs',root).href}'`).replaceAll("from './",`from '${assets}`);
 fs.writeFileSync(new URL('.cache/v10-reaudit/evaluation-start-reference.mjs',root),evaluation);
 const {branchReady:referenceReady}=await import(activationURL),{RaceEvaluator:ReferenceEvaluator}=await import(new URL('.cache/v10-reaudit/evaluation-start-reference.mjs',root));
 const branch={at:0,windows:[[0,2000]],dynamic:[atom('run_at_full_speed_random',1)],fullSpurtQ:.5},state={x:1750.1,prevX:1749.9,distance:2000,fullSpurtStart:1500};
 const out={referenceSource:'https://github.com/mee1080/umasim/blob/e9bb2939ba117ea93e556790c353ed3edec27eab/race/src/commonMain/kotlin/io/github/mee1080/umasim/race/calc2/SkillChecker.kt',referenceScope:'only full-speed-random threshold checks movement start; unchanged physics and sampling, not a full external simulator port',predicate:{branch,state,current:branchReady(branch,state,'clock'),reference:referenceReady(branch,state,'clock')},records:[]};
 assert.equal(out.predicate.current,true);assert.equal(out.predicate.reference,false);
 const skills=Object.values(data.skills).filter(s=>s.invocations.some(i=>[...(i.condition||[]),...(i.precondition||[])].flat().some(a=>a.field==='run_at_full_speed_random')));
 for(const courseId of ['10307','10704','10905'])for(const skill of skills){
  const style=skill.invocations.flatMap(i=>(i.condition||[]).flat()).find(a=>a.field==='running_style'&&a.operator==='==')?.value??2;
  const t=prepareChart(data,profiles,{skills:{}},input(courseId,{style}),{samples:1,dt:.05}),s={...t.setup,stats:{...t.setup.stats,stamina:2200}},compiled=new Map([[skill.id,compileChartSkill(skill,s)]]),status=compiled.get(skill.id).status;
  if(status==='unsupported'){out.records.push({courseId,id:skill.id,name:skill.name_jp,status});continue;}
  const a=new RaceEvaluator(s,compiled,[],[],branchSampler).evaluate([skill.id],144,.01),b=new ReferenceEvaluator(s,compiled,[],[],branchSampler).evaluate([skill.id],144,.01);
  out.records.push({courseId,style,id:skill.id,name:skill.name_jp,status,current:compact(a),reference:compact(b),gainDifference:a.gain-b.gain});
 }
 save('clock',out);console.log('full-speed clock',out.records.length);
}

if(process.argv.includes('--bounded')){
 const ids=['202711','202712','201341','201342','201101','201102','201111','201112','200362','200342'],out={scope:'three additional real courses, ten real recorded candidates, default 144 samples and 0.01s integration; independent subset/cost oracle shares the production physics and declared objective',records:[]};
 for(const courseId of ['10307','10704','10905']){
  const raceInput=input(courseId,{supportIds:['30161']}),t=prepareChart(data,profiles,{skills:{}},raceInput,{samples:1,dt:.05}),rows=t.rows.filter(r=>ids.includes(r.id));
  assert.equal(rows.length,ids.length,`missing actual candidate in ${courseId}: ${ids.filter(id=>!rows.some(r=>r.id===id))}`);
  const c={setup:t.setup,nativeIds:t.nativeIds,rows,evolutionOptions:[],modelVersion:t.modelVersion},states=Object.fromEntries(rows.map(r=>[r.id,'2'])),actual={stats:t.setup.stats,aptitudes:t.setup.aptitudes,spBudget:800},s=createFinalSetup(c,actual);s.ownedSkillIds=[];
  const compiled=new Map([...new Set([...ids,...t.nativeIds])].map(id=>[id,compileChartSkill(data.skills[id],s)])),ev=new RaceEvaluator(s,compiled,t.nativeIds,t.nativeIds,branchSampler),rules=selectionRules(data,new Map([...compiled.keys()].map(id=>[id,data.skills[id]]))),constraints=createAcquisitionConstraints(data,s),memo=new Map();
  for(let mask=0;mask<2**ids.length;mask++){
   const picked=ids.filter((_,i)=>mask&(1<<i)),active=activeSkillIds([...t.nativeIds,...picked],s.possessionGraph),key=active.join(',');if(memo.has(key))continue;
   if(!active.every((id,i)=>active.slice(0,i).every(other=>rules.compatible(id,other)))||!constraints.allowed(active))continue;
   const stages=new Set();for(const id of active.filter(id=>!t.nativeIds.includes(id))){let k=id;while(k){if(stages.has(k))break;stages.add(k);assert.equal(data.purchase_stages[k].status,'verified');k=data.purchase_stages[k].prerequisite_id;}}
   const cost=[...stages].reduce((sum,id)=>sum+Math.floor(data.purchase_stages[id].base_cost*80/100),0);if(cost>800)continue;
   memo.set(key,{ids:active,cost,...ev.evaluate(active,144,.01)});
  }
  for(const budget of [500,800]){
   const expected=[...memo.values()].filter(r=>r.cost<=budget).sort(compareRacePlans)[0],p=await recommendFinalPlan(data,c,states,{...actual,spBudget:budget},{samples:144,dt:.01,diagnostics:false}),measured={ids:p.activeIds,cost:p.budget.used,...ev.evaluate(p.activeIds,144,.01)};
   assert.ok(Math.abs(measured.gain-p.gain)<1e-10);
   out.records.push({input:raceInput,actual:{...actual,spBudget:budget},states,candidateIds:rows.map(r=>r.id),enumeratedMasks:2**ids.length,affordableDistinctPlans:[...memo.values()].filter(r=>r.cost<=budget).length,
    recommendation:{selectedIds:p.activeIds,budget:p.budget,...compact(p),search:p.search},oracle:{selectedIds:expected.ids,cost:expected.cost,...compact(expected)},matchesOracleObjective:compareRacePlans(measured,expected)<=0,gainGap:expected.gain-p.gain});
   console.log('bounded',courseId,budget,p.gain,expected.gain,p.search.method);
  }
 }
 save('bounded',out);
}

if(process.argv.includes('--conditional')){
 const out={scope:'isolated King/Gunrin gold/white on the three additional courses, with real acquisition routes; default versus no extra full-spurt approximation, same 144 samples and 0.01s step; sample rates are NOT measured race probabilities',records:[]};
 for(const courseId of ['10307','10704','10905'])for(const style of [2,4]){
  const raceInput=input(courseId,{style,supportIds:['30161','30250']}),t=prepareChart(data,profiles,{skills:{}},raceInput,{samples:1,dt:.05}),ids=style===2?['202711','202712']:['202871','202872'];
  for(const id of ids)assert.ok(t.rows.some(r=>r.id===id),`missing real acquisition row ${id}`);
  const actual={stats:t.setup.stats,aptitudes:t.setup.aptitudes,spBudget:800},original=createFinalSetup(t,actual);
  for(const policy of ['default','off']){
   const setup=policy==='off'?{...original,fullSpurtMode:'off'}:original,compiled=new Map([...new Set([...ids,...t.nativeIds])].map(id=>[id,compileChartSkill(data.skills[id],setup)])),ev=new RaceEvaluator(setup,compiled,t.nativeIds,t.nativeIds,branchSampler);
   for(const id of ids){
    const selected=activeSkillIds([...t.nativeIds,id],setup.possessionGraph),result=ev.evaluate(selected,144,.01);let firstActivation=null;
    for(let sample=0;sample<144&&!firstActivation;sample++){const run=ev.run(selected,sample,.01),event=run.events.find(e=>e.id===id);if(event)firstActivation={sample,event,usefulSeconds:run.accelerationUseSeconds[id]??0};}
    out.records.push({input:raceInput,actual,id,name:data.skills[id].name_jp,policy,status:compiled.get(id).status,...compact(result),activationRate:result.activationRates[id],usefulRate:result.usefulAccelerationRates[id],firstActivation,scenarioCoverage:result.scenarioCoverage});
   }
  }
 }
 save('conditional',out);console.log('conditional isolated skill-policy cases',out.records.length);
}
