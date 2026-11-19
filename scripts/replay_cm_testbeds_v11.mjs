// Replay archived race testbeds against the first-completion v11 snapshot.
// Historical fixtures and the completion baseline must never be overwritten.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareChart,generateChart,createChartSetup,compileChartSkill,branchSampler,CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {recommendFinalPlan,RecordedPurchaseModel,createFinalSetup} from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds} from '../assets/cm-state.mjs';
import {activeSkillIds,prerequisiteIds} from '../assets/skill-context.mjs';
import {createAcquisitionConstraints} from '../assets/acquisition-constraints.mjs';
import {compareRacePlans} from '../assets/race-objective.mjs';
import {inheritanceOrigins} from '../assets/skill-transforms.mjs';
import {selectionRules} from '../assets/selection.mjs';
import {scenarioSelectionAllowed} from '../assets/acquisition-rules.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const assetHash=()=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL('assets/',root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
const frozen='cc4c5e607abfac201a87705a3b99c7d461218166a721f0c6788086459df4b46b';assert.equal(assetHash(),frozen);assert.equal(CM_MODEL_VERSION,'cm-first-chart-v11');
const historyHashes=new Map();
function source(name){const path='docs/validation/'+name,body=fs.readFileSync(new URL(path,root),'utf8');historyHashes.set(path,createHash('sha256').update(body).digest('hex'));return JSON.parse(body);}
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
assert.equal(manifest.active_version,'0b105741168200654ef4ef6523e1cb0bc0b7d9852107f3d478ea0fdcd6b7ad26');
const hierarchy=buildAcquisitionHierarchy(data),graph=Object.fromEntries([...hierarchy.lower].map(([id,low])=>[id,[...low]])),closure=ids=>[...new Set(ids.flatMap(id=>[id,...relatedAcquisitionIds(hierarchy,id)]))];
const stamp={date:'2026-11-18 Asia/Seoul',runtimeCommit:'d3b40fddf28fb6eb28b045afd65583b0ae3b11f6',completionCommit:'d4f0928',assetsSha256:frozen,dataVersion:manifest.active_version,modelVersion:CM_MODEL_VERSION,interpretation:'archived-input replay under current v11; same-runtime comparisons are regression checks, historical-model changes are reported separately; not real-race probability calibration'};
function verify(){assert.equal(assetHash(),frozen);for(const [path,hash]of historyHashes)assert.equal(createHash('sha256').update(fs.readFileSync(new URL(path,root),'utf8')).digest('hex'),hash,'Historical fixture changed: '+path);}
function save(mode,out){verify();fs.writeFileSync(new URL(`docs/validation/cm-v11-testbed-${mode}-20261118.json`,root),JSON.stringify({...stamp,sourceFiles:[...historyHashes].map(([path,sha256])=>({path,sha256})),...out},null,2)+'\n');}
const summary=p=>({gain:p.gain,hpSuccessRate:p.hpSuccessRate,hpShortfall:p.hpShortfall,performance:p.performance,activationRates:p.activationRates,usefulAccelerationRates:p.usefulAccelerationRates});
const progress=(mode,out)=>{fs.mkdirSync(new URL('.cache/',root),{recursive:true});fs.writeFileSync(new URL(`.cache/cm-testbed-${mode}-progress.json`,root),JSON.stringify(out,null,2)+'\n');};
const baseInput=(courseId,style,extra={})=>({outfitId:'102201',scenarioId:'12',courseId,style,supportIds:[],going:1,weather:1,season:3,time:2,...extra});
function evaluator(setup,ids,baseline=[],natives=[]){const all=[...new Set([...ids,...baseline])],compiled=new Map(all.map(id=>{assert.ok(data.skills[id],id);return [id,compileChartSkill(data.skills[id],setup)];}));return new RaceEvaluator(setup,compiled,activeSkillIds(baseline,graph),natives,branchSampler);}

const prepared=new Map(),origins=inheritanceOrigins(data),aptsA={distance:'A',surface:'A',style:'A'},aptsS={distance:'S',surface:'A',style:'A'};
function task(input){const key=JSON.stringify(input);if(!prepared.has(key))prepared.set(key,prepareChart(data,profiles,display,input,{samples:1,dt:.05}));return prepared.get(key);}
function currentSetup(input,options={}){return {...createChartSetup(data,profiles,input),possessionGraph:graph,inheritanceOrigins:origins,ownedSkillIds:[],...options};}
const sameScore=(a,b)=>Math.abs(a.gain-b.gain)<1e-10&&Math.abs(a.hpSuccessRate-b.hpSuccessRate)<1e-12;

function matrixFixtures(){
 const out=[],legacy=source('cm-7000-20261117.json'),v6=source('cm-v6-20261117.json'),event=source('cm-event-evidence-20261117.json'),ctx=source('cm-event-context-20261117.json'),v7=source('cm-v7-20261118.json'),guide=source('cm-v7-guide-audit-20261118.json'),v8=source('cm-v8-20261118.json'),hold=source('cm-v8-holdout-20261118.json'),v9=source('cm-v9-20261118.json'),m10=source('cm-v10-matrix-20261118.json');
 const add=(group,input,ids,options,expected,sourcePath,kind='historical-model')=>out.push({group,input,ids,options,expected,sourcePath,comparisonKind:kind});
 const oldInput=(courseId,style)=>({...legacy.input,courseId,style,supportIds:[]});
 for(const row of v6.timing)add('v6-timing',baseInput(row.course,row.style,{outfitId:'101301',scenarioId:'15'}),[row.id],{stats:profiles.profiles['15'].stats,aptitudes:aptsA,samples:256},row,'cm-v6-20261117.json#timing','source-default-reconstruction');
 for(const row of v6.convergence)add('v6-convergence',baseInput(row.course,row.style,{outfitId:'101301',scenarioId:'15'}),[row.id],{stats:profiles.profiles['15'].stats,aptitudes:aptsA,samples:256},{gain:row.n256},'cm-v6-20261117.json#convergence','source-default-reconstruction');
 for(const row of v7.eventCases){const race=event.events[row.event];add('public-event', {...oldInput(race.courseId,row.style),season:race.season,weather:race.weather,going:race.going,time:race.time},[row.id],{stats:event.stats,aptitudes:aptsA,samples:288},row,'cm-v7-20261118.json#eventCases');}
 for(const row of v7.contextCases)add('early-context',oldInput('10808',row.style),[...row.baseline,row.id],{stats:ctx.stats,aptitudes:aptsA,baseline:row.baseline,samples:288},row,'cm-v7-20261118.json#contextCases');
 for(const row of v7.accelerationFamily)add('acceleration-family',oldInput(row.courseId,row.style),[row.id],{stats:event.stats,aptitudes:aptsA,samples:row.samples}, {gain:row.gain},'cm-v7-20261118.json#accelerationFamily');
 const inputFor=(race,style,outfit)=>({...guide.matrix.chartCases.find(c=>c.input.style===style).input,...guide.matrix.raceSettings[race],style,outfitId:outfit,...(race==='longchamp'&&style===4?{supportIds:guide.longPlans.plans.find(p=>p.style===4).input.supportIds}:{})});
 for(const row of guide.matrix.courseCases)add('guide-courses',inputFor(row.race,row.style,row.style===4?'100701':'112901'),[row.id],{stats:guide.matrix.stats,aptitudes:aptsS},v8.matrix.courseCases.find(r=>r.race===row.race&&r.style===row.style&&r.id===row.id)??row,'cm-v8-20261118.json#matrix.courseCases');
 for(const row of guide.matrix.chartCases)add('first-chart',row.input,[row.id],{chartRow:true},v8.matrix.chartCases.find(r=>r.context===row.context)??row,'cm-v8-20261118.json#matrix.chartCases');
 for(const row of guide.matrix.contextCases){const original=guide.matrix.chartCases.find(c=>c.context===row.context);add('guide-context',original.input,[...row.baseline,row.id],{stats:row.stats,aptitudes:aptsS,baseline:row.baseline,ownedSkillIds:closure(row.baseline),fullSpurtMode:row.fullSpurtMode},v8.matrix.contextCases.find(r=>r.context===row.context&&r.profile===row.profile&&r.fullSpurtMode===row.fullSpurtMode)??row,'cm-v8-20261118.json#matrix.contextCases');}
 for(const row of guide.matrix.evolutionCases){const input=inputFor('kyoto',4,row.outfit),baseline=[...task(input).nativeIds,'203902','91101351'];for(const [key,id]of [['normalResult',row.normal],['evolvedResult',row.evolved]])add('evolution-context',input,[...baseline,id],{stats:guide.matrix.stats,aptitudes:aptsS,baseline,ownedSkillIds:closure(['203902','91101351'])},v8.matrix.evolutionCases.find(r=>r.outfit===row.outfit)?.[key]??row[key],'cm-v8-20261118.json#matrix.evolutionCases');}
 for(const row of guide.extra.longchampContexts){const input=inputFor('longchamp',row.style,row.outfit),baseline=[...task(input).nativeIds,...row.core];add('longchamp-context',input,[...baseline,row.target],{stats:guide.matrix.stats,aptitudes:aptsS,baseline,ownedSkillIds:closure(row.core)},v8.matrix.longchampContexts.find(r=>r.context===row.id)??row,'cm-v8-20261118.json#matrix.longchampContexts');}
 for(const row of guide.matrix.rankSensitivity){const old=guide.plans.controlled.find(r=>r.context===row.context),baseline=[...task(old.input).nativeIds,...old.core];add('fixed-rank-context',old.input,[...baseline,row.id],{stats:guide.matrix.stats,aptitudes:aptsS,baseline,ownedSkillIds:closure(old.core),raceContext:{rankTimeline:[{distance:0,rank:row.rank}]}},row,'cm-v7-guide-audit-20261118.json#matrix.rankSensitivity');}
 for(const race of hold.races)for(const style of race.styles)for(const id of race.skills){const prev=v9.mechanics.matrix.find(r=>r.race===race.key&&r.style===style&&r.id===id);add('heldout-courses',baseInput(race.courseId,style,{season:race.season,weather:race.weather,going:race.going}),[id],{stats:hold.stats,aptitudes:hold.aptitudes},prev,'cm-v9-20261118.json#mechanics.matrix');}
 for(const row of m10.records){const race=m10.races.find(r=>r.key===row.race);add('v10-race-matrix',baseInput(row.courseId,row.style,{season:race.season}),[row.id],{stats:m10.stats,aptitudes:m10.aptitudes},row.current,'cm-v10-matrix-20261118.json#records');}
 for(const row of m10.additionalCourses)add('additional-course-controls',baseInput(row.courseId,row.style),[row.id],{stats:m10.stats,aptitudes:m10.aptitudes},row.current,'cm-v10-matrix-20261118.json#additionalCourses');
 for(const row of source('cm-v11-conditional-20261118.json').records){const natives=task(row.input).nativeIds;add('v11-conditional',row.input,[...natives,row.id],{...row.actual,baseline:natives,nativeIds:natives,fullSpurtMode:row.policy==='off'?'off':'on'},row.current,'cm-v11-conditional-20261118.json#records','same-runtime');}
 for(const row of source('cm-v11-reaudit-guides-20261118.json').records){const input=baseInput(row.courseId,row.style,{scenarioId:'15'}),natives=task(input).nativeIds;add('v11-guide-controls',input,[...natives,row.id],{stats:{...profiles.profiles['15'].stats,stamina:2200},aptitudes:aptsA,baseline:natives,nativeIds:natives,samplingSeed:row.seed,dt:row.dt,fullSpurtMode:row.variant==='no-extra-spurt'?'off':'on'},row,'cm-v11-reaudit-guides-20261118.json#records','same-runtime');}
 return out;
}

function planFixtures(){
 const out=[],v8=source('cm-v8-20261118.json'),v9=source('cm-v9-20261118.json'),hold=source('cm-v8-holdout-20261118.json'),p10=source('cm-v10-plans-20261118.json');
 const add=row=>out.push(row);
 for(const [i,r]of v8.plans.records.entries())add({group:'legacy32',input:r.input,core:r.core,available:r.available,hint:r.recordedHint,allowEvolution:r.kind==='orfe',target:r.target,actual:{stats:r.setup.stats,aptitudes:r.setup.aptitudes,spBudget:r.budget,raceContext:r.setup.raceContext,riskPolicy:r.setup.riskPolicy},expected:v9.legacy.records.find(x=>x.caseIndex===i),sourcePath:'cm-v9-20261118.json#legacy.records/'+i});
 for(const [i,r]of hold.plans.entries()){const race=hold.races.find(x=>x.key===r.race);add({group:'heldout-risk-plans',input:baseInput(race.courseId,r.style,{season:race.season,weather:race.weather,going:race.going}),available:r.availableIds,hint:5,actual:r.actual,expected:v9.mechanics.holdoutPlans.find(x=>x.race===r.race&&x.tailMass===r.tailMass),sourcePath:'cm-v9-20261118.json#mechanics.holdoutPlans/'+i});}
 for(const tailMass of [.1,.25,.5,1])add({group:'previously-blocked-delmar-recipe',input:baseInput('11709',3,{season:1}),available:['900041','900591','201102','201112','201382','201392'],hint:5,actual:{stats:hold.stats,aptitudes:hold.aptitudes,spBudget:300,riskPolicy:{tailMass,maxTailDelay:0}},expected:null,sourcePath:'scripts/audit_cm_v8_holdout.mjs#recipes-delmar2000'});
 for(const group of ['regular','gold','goldCore','rice'])for(const rec of p10[group])for(const r of [rec.current,rec.withoutExtraSpurt])add({group:'v10-'+group,input:baseInput(r.courseId,r.style,{outfitId:r.outfitId,supportIds:r.supportIds,season:r.courseId==='11703'?1:r.courseId==='10507'?2:3}),states:r.states,available:Object.keys(r.states),allowEvolution:group==='rice',target:r.targetId==='103003111'?'201582':r.targetId,mode:r.mode,actual:{stats:{speed:2100,stamina:2000,power:1700,guts:1400,wisdom:1500},aptitudes:aptsS,spBudget:r.budget},expected:r,sourcePath:'cm-v10-plans-20261118.json#'+group});
 for(const [name,group]of [['cm-v11-bounded-20261118.json','v11-bounded'],['cm-v11-reaudit-plans-20261118.json','v11-reaudit']])for(const r of source(name).records)add({group,input:r.input,available:r.candidateIds,states:r.states,actual:r.actual,expected:r.current??r.recommendation,oracle:r.oracle,sourcePath:name+'#records',comparisonKind:'same-runtime'});
 const browser=source('cm-v9-browser-20261118.json');add({group:'browser-input-replay',input:browser.input,available:Object.keys(browser.states),states:browser.states,actual:browser.actual,expected:browser.currentEngineReplay??browser.expected,sourcePath:'cm-v9-browser-20261118.json'});
 const candidate=source('cm-v11-candidates-20261118.json');for(const r of candidate.plans)add({group:'stat-restoration',input:r.input,available:[r.id],states:{[r.id]:'2'},actual:r.actual,expected:r.current,sourcePath:'cm-v11-candidates-20261118.json#plans',comparisonKind:'same-runtime'});
 return out;
}

function recorded(recipe){
 const t=task(recipe.input),known=new Map(t.rows.map(r=>[r.id,r])),evolutions=recipe.allowEvolution?t.rows.filter(r=>r.rarity==='evolution'&&r.evolutionBaseId===recipe.target):[],ids=closure([...(recipe.core??[]),...(recipe.available??Object.keys(recipe.states)),...evolutions.map(r=>r.id)]),fallback=[];
 const rows=ids.map(id=>{if(known.has(id))return known.get(id);assert.ok(!(recipe.available??[]).includes(id),'Recorded purchasable candidate disappeared: '+id);assert.ok(data.skills[id]);fallback.push(id);return {...data.skills[id],name:data.skills[id].name_jp,evolutionBaseId:data.evolution_rules.find(r=>r.evolved_id===id)?.base_id};});
 // These archived constructors filtered the chart in chart order. Preserve it
 // because bounded searches can use enumeration order to break equal scores.
 if(recipe.group.startsWith('v10-')||recipe.group.startsWith('v11-')){const order=new Map(t.rows.map((r,i)=>[r.id,i]));rows.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));}
 const states=Object.fromEntries(rows.map(r=>[r.id,'unavailable']));if(recipe.states)Object.assign(states,recipe.states);else for(const id of closure(recipe.available??[]))states[id]=String(recipe.hint);for(const id of recipe.core??[])states[id]='owned';
 return {chart:{setup:{...t.setup,...(recipe.mode?{fullSpurtMode:recipe.mode}:{})},nativeIds:t.nativeIds,rows,evolutionOptions:evolutions,modelVersion:t.modelVersion},states,fallback};
}

function selectionValidity(plan,chart,ids,actual){
 const price=new RecordedPurchaseModel(data,chart.rows,plan.acquisition,actual).selection(ids),constraints=createAcquisitionConstraints(data,plan.setup),rules=selectionRules(data,new Map(Object.entries(data.skills))),required=activeSkillIds([...plan.nativeIds,...plan.ownedIds],graph),reasons=[];
 if(!price.complete)reasons.push('unverified-price');if(price.used>actual.spBudget)reasons.push('over-budget');
 if(required.some(id=>!ids.includes(id)&&!ids.some(high=>prerequisiteIds(graph,high).includes(id))))reasons.push('required-effect-missing');
 const recorded=id=>plan.acquisition[id]!==undefined&&plan.acquisition[id]!=='unavailable';
 // The saved checklist contains the paid base. Eligible evolution options are
 // derived by the planner and need not have their own saved acquisition cell.
 const available=id=>plan.nativeIds.includes(id)||recorded(id)||(!plan.setup.excludedEvolutionIds.includes(id)&&chart.evolutionOptions.some(row=>row.id===id&&recorded(row.evolutionBaseId)));
 if(ids.some(id=>!available(id)))reasons.push('unrecorded-acquisition');
 if(ids.some((id,i)=>ids.slice(0,i).some(other=>!rules.compatible(id,other))))reasons.push('incompatible-skills');
 if(!scenarioSelectionAllowed(data,ids,plan.setup.scenarioId))reasons.push('scenario-limit');if(ids.filter(id=>data.skills[id]?.inherited).length>6)reasons.push('inheritance-limit');
 if(!constraints.allowed([...ids,...plan.ownedIds]))reasons.push('event-conflict');
 if(ids.some(id=>compileChartSkill(data.skills[id],plan.setup).status==='unsupported'))reasons.push('unsupported-effect');
 return {eligible:reasons.length===0,reasons,cost:price.used};
}

if(process.argv.includes('--inventory')){const matrix=matrixFixtures(),plans=planFixtures(),all=[...matrix,...plans],conditions=[...new Map(all.map(r=>{const i=r.input,c=data.courses[i.courseId],key=JSON.stringify([i.courseId,i.going??1,i.weather??1,i.season??3,i.time??2]);return [key,{courseId:i.courseId,distance:c.distance,surface:c.surface,trackId:c.track_id,going:i.going??1,weather:i.weather??1,season:i.season??3,time:i.time??2}];})).values()];save('inventory',{matrixRecords:matrix.length,planRecords:plans.length,uniqueCourseIds:[...new Set(all.map(r=>r.input.courseId))].sort(),raceConditions:conditions,groups:[...new Set(all.map(r=>r.group))],notes:'Real course settings from archived event/guide/control records. Artificial shifted-geometry probes and synthetic skills are excluded from the race matrix; large/wide7000 are rerun separately.'});console.log('inventory',matrix.length,plans.length,conditions.length,'conditions');}

if(process.argv.includes('--matrix')){
 const fixtures=matrixFixtures(),records=[],memo=new Map();
 for(const [index,r]of fixtures.entries()){
  const {samples=144,dt=.01,baseline=[],nativeIds=[],chartRow=false,...options}=r.options;let score,status;
  if(chartRow){const t=task(r.input),row=t.rows.find(x=>x.id===r.ids[0]);assert.ok(row);score=prepareChart(data,profiles,display,r.input,{samples,dt}).evaluate(row);status={ [row.id]:row.calculationState };}
  else{const s=currentSetup(r.input,options),ids=activeSkillIds(r.ids,graph),key=JSON.stringify({input:r.input,options,ids,baseline,nativeIds,samples,dt});if(!memo.has(key)){const ev=evaluator(s,ids,baseline,nativeIds),compiled=ids.map(id=>compileChartSkill(data.skills[id],s));if(compiled.some(c=>c.status==='unsupported'))memo.set(key,{score:null,status:Object.fromEntries(compiled.map(c=>[c.id,c.status]))});else memo.set(key,{score:ev.evaluate(ids,samples,dt),status:Object.fromEntries(compiled.map(c=>[c.id,c.status]))});}({score,status}=memo.get(key));}
  if(score){assert.ok(Number.isFinite(score.gain)&&score.hpSuccessRate>=0&&score.hpSuccessRate<=1);if(!baseline.length&&Object.values(status).every(x=>x==='inactive'))assert.equal(score.gain,0);}
  const expected=r.expected&&Number.isFinite(r.expected.gain)?r.expected:null,match=score&&expected?Math.abs(score.gain-expected.gain)<1e-10&&(!Number.isFinite(expected.hpSuccessRate)||Math.abs(score.hpSuccessRate-expected.hpSuccessRate)<1e-12):null;
  if(r.comparisonKind==='same-runtime')assert.equal(match,true,`Same-runtime matrix mismatch ${r.group} ${r.input.courseId} ${r.ids}`);
  records.push({...r,options:{...r.options,samples,dt},expected:expected?{gain:expected.gain,hpSuccessRate:expected.hpSuccessRate}:null,status,current:score?summary(score):null,comparison:{kind:r.comparisonKind,match,gainDifference:score&&expected?score.gain-expected.gain:null}});
  if((index+1)%50===0){progress('matrix',{completed:index+1,total:fixtures.length});console.log('matrix',index+1,'/',fixtures.length);}
 }
 save('matrix',{scope:'archived real-race isolated/chart/context inputs rerun; original sample counts retained',records,uniqueSimulationKeys:memo.size});console.log('matrix complete',records.length);
}

if(process.argv.includes('--plans')){
 const fixtures=planFixtures(),records=[],range=(process.argv.find(x=>x.startsWith('--plan-range='))?.split('=')[1]??`0:${fixtures.length}`).split(':').map(Number),[start,end]=range;
 assert.ok(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end<=fixtures.length&&end>start);const mode=start===0&&end===fixtures.length?'plans':`plans-${start}-${end}`;
 for(const [index,r]of fixtures.entries()){
  if(index<start||index>=end)continue;
  const {chart,states,fallback}=recorded(r),p=await recommendFinalPlan(data,chart,states,r.actual,{samples:144,dt:.01,diagnostics:false}),price=new RecordedPurchaseModel(data,chart.rows,p.acquisition,r.actual).selection(p.activeIds);
  assert.ok(p.budget.used<=r.actual.spBudget&&price.complete);assert.equal(price.used,p.budget.used);assert.equal(p.purchases.reduce((n,x)=>n+x.cost,0),p.budget.used);assert.ok(p.acquisitionValidation.feasible);
  const previousIds=r.expected?.selectedIds??r.expected?.activeIds,previousCost=r.expected?.budgetResult?.used??r.expected?.budget?.used,selectionSame=previousIds?JSON.stringify([...p.activeIds].sort())===JSON.stringify([...previousIds].sort()):null,gainDifference=Number.isFinite(r.expected?.gain)?p.gain-r.expected.gain:null;
  if(r.comparisonKind==='same-runtime'){assert.equal(selectionSame,true,'Same-runtime selection mismatch '+r.group);assert.ok(Math.abs(gainDifference)<1e-10,'Same-runtime gain mismatch '+r.group);if(previousCost!==undefined)assert.equal(p.budget.used,previousCost);}
  const fixed=[],reference=[...p.nativeIds,...p.ownedIds];
  for(const [kind,ids]of [['historical',previousIds],['archived-oracle',r.oracle?.selectedIds]])if(ids){const validity=selectionValidity(p,chart,ids,r.actual);if(validity.eligible){const ev=evaluator(p.setup,[...ids,...p.activeIds],reference,p.nativeIds),score=ev.evaluate(ids,144,.01);fixed.push({kind,ids,...validity,...summary(score),beatsReoptimized:compareRacePlans({ids,cost:validity.cost,...score},{ids:p.activeIds,cost:p.budget.used,...p})<0});}else fixed.push({kind,ids,...validity,beatsReoptimized:null});}
  records.push({...r,expected:r.expected?{gain:r.expected.gain,selectedIds:previousIds,cost:previousCost}:null,chartRows:chart.rows.length,ownedMetadataFallback:fallback,current:{selectedIds:p.activeIds,budget:p.budget,candidateCount:p.candidateCount,...summary(p),search:p.search},comparison:{kind:r.comparisonKind??'historical-model',selectionSame,gainDifference},fixedSelectionComparisons:fixed});
  progress(mode,{range,completed:index+1,total:fixtures.length,records});console.log('plan',index+1,'/',fixtures.length,r.group,r.input.courseId,r.actual.spBudget,p.gain);
 }
 save(mode,{scope:'archived recorded pools reoptimized at144 samples/0.01s; historical selections and previously enumerated oracle selections re-scored, not a fresh independent subset enumeration',range,totalFixtures:fixtures.length,records});console.log(mode,'complete',records.length);
}

if(process.argv.includes('--merge-plans')){
 const fixtures=planFixtures(),files=fs.readdirSync(new URL('docs/validation/',root)).filter(n=>/^cm-v11-testbed-plans-\d+-\d+-20261118\.json$/.test(n)),parts=files.map(n=>read('docs/validation/'+n)).sort((a,b)=>a.range[0]-b.range[0]);let cursor=0;const records=[];
 for(const p of parts){assert.equal(p.assetsSha256,frozen);assert.equal(p.range[0],cursor);assert.equal(p.records.length,p.range[1]-p.range[0]);for(const r of p.records){const fixture=fixtures[cursor++];for(const k of ['group','input','actual','states','available'])assert.deepEqual(r[k],fixture[k]);records.push(r);}for(const s of p.sourceFiles)assert.equal(historyHashes.get(s.path),s.sha256);}
 assert.equal(cursor,fixtures.length);save('plans',{scope:parts[0].scope,range:[0,cursor],totalFixtures:cursor,records});console.log('plans merged',cursor);
}

if(process.argv.includes('--validate-fixed')){
 const fixtures=planFixtures(),out=read('docs/validation/cm-v11-testbed-plans-20261118.json');assert.equal(out.assetsSha256,frozen);assert.equal(out.records.length,fixtures.length);
 for(const s of out.sourceFiles)assert.equal(historyHashes.get(s.path),s.sha256);let refreshed=0;
 for(const [index,r]of out.records.entries()){
  assert.deepEqual(r.input,fixtures[index].input);const {chart,states}=recorded(r),ownedIds=Object.keys(states).filter(id=>states[id]==='owned'),setup={...createFinalSetup(chart,r.actual),ownedSkillIds:ownedIds,possessionGraph:graph,inheritanceOrigins:origins},p={...r.current,setup,acquisition:states,nativeIds:chart.nativeIds,ownedIds},validity=selectionValidity(p,chart,r.current.selectedIds,r.actual);assert.equal(validity.eligible,true,'Current replay selection legality '+index+' '+validity.reasons);assert.equal(validity.cost,r.current.budget.used);
  const expected=fixtures[index].expected;if(Number.isFinite(expected?.hpSuccessRate)){r.expected.hpSuccessRate=expected.hpSuccessRate;r.comparison.hpSuccessRateDifference=r.current.hpSuccessRate-expected.hpSuccessRate;}
  if(r.comparison.kind==='same-runtime'){if(Number.isFinite(expected?.hpSuccessRate))assert.ok(Math.abs(r.comparison.hpSuccessRateDifference)<1e-12);for(const k of ['activationRates','usefulAccelerationRates'])if(expected?.[k]){assert.deepEqual(r.current[k],expected[k]);r.comparison[k+'Match']=true;}}
  for(const f of r.fixedSelectionComparisons){const v=selectionValidity(p,chart,f.ids,r.actual);if(v.eligible&&!f.eligible){const ev=evaluator(setup,[...f.ids,...r.current.selectedIds],[...chart.nativeIds,...ownedIds],chart.nativeIds),score=ev.evaluate(f.ids,144,.01);Object.assign(f,summary(score),{beatsReoptimized:compareRacePlans({ids:f.ids,cost:v.cost,...score},{ids:r.current.selectedIds,cost:r.current.budget.used,...r.current})<0});refreshed++;}else if(!v.eligible)f.beatsReoptimized=null;Object.assign(f,v);}
 }
 delete out.sourceFiles;out.fixedSelectionValidation={currentSelectionsChecked:out.records.length,refreshedDerivedEvolutionComparisons:refreshed};save('plans',out);console.log('selection validation complete',out.records.length,'derived evolution comparisons',refreshed);
}

if(process.argv.includes('--large')||process.argv.includes('--wide')){
 const wide=process.argv.includes('--wide'),record=wide?source('cm-v10-search-gold-wide-on-20261118.json'):source('cm-v11-checks-20261118.json').largeCase;
 const off=wide?source('cm-v10-search-gold-wide-off-20261118.json'):null,states=record.states??record.acquisition,mode=wide?'wide':'large';
 const chart=await generateChart(data,profiles,display,record.input,{samples:144,dt:.01}),actual=record.actual;
 const p=await recommendFinalPlan(data,chart,states,actual,{samples:144,dt:.01,diagnostics:false,onProgress:r=>{if(r.completed===r.total)console.log(mode,r.stage);}});
 assert.ok(p.budget.used<=actual.spBudget);assert.ok(p.acquisitionValidation.feasible);assert.equal(p.purchases.reduce((n,r)=>n+r.cost,0),p.budget.used);
 const price=new RecordedPurchaseModel(data,[...chart.rows,...chart.evolutionOptions,...chart.inheritanceOptions],p.acquisition,actual);assert.equal(price.selection(p.activeIds).used,p.budget.used);
 if(!wide){assert.equal(p.gain,record.gain);assert.deepEqual(p.activeIds,record.selectedIds);assert.deepEqual(p.budget,record.budget);assert.equal(p.hpSuccessRate,record.hpSuccessRate);}
 const reference=[...p.nativeIds,...p.ownedIds],oldSelections={archived:record.selectedIds,...(off?{archivedOffModel:off.selectedIds}:{})},cross=[];
 for(const [name,ids]of Object.entries(oldSelections)){
  const ev=evaluator(p.setup,[...p.activeIds,...ids],reference,p.nativeIds),score=ev.evaluate(ids,144,.01),cost=price.selection(ids),constraints=createAcquisitionConstraints(data,p.setup);assert.ok(cost.complete&&cost.used<=actual.spBudget&&constraints.allowed([...ids,...p.ownedIds]));
  cross.push({name,selectedIds:ids,cost:cost.used,...summary(score),beatsReoptimized:compareRacePlans({ids,cost:cost.used,...score},{ids:p.activeIds,cost:p.budget.used,...p})<0});
 }
 save(mode,{scope:'normal full first-chart generation and complete recorded-input reoptimization, not fixed-selection-only replay',input:record.input,actual,states,chartRows:chart.rows.length,referenceModel:wide?'v10':'same-v11',historical:{gain:record.gain,selectedIds:record.selectedIds,budget:record.budget},current:{selectedIds:p.activeIds,budget:p.budget,candidateCount:p.candidateCount,...summary(p),search:p.search},fixedSelectionCrossChecks:cross});
 console.log(mode,'completed',p.gain,p.budget.used,p.candidateCount);
}

if(process.argv.includes('--summary')){
 const [inventory,matrix,plans,large,wide]=['inventory','matrix','plans','large','wide'].map(mode=>source(`cm-v11-testbed-${mode}-20261118.json`));
 for(const p of [inventory,matrix,plans,large,wide]){assert.equal(p.assetsSha256,frozen);assert.equal(p.dataVersion,manifest.active_version);for(const s of p.sourceFiles)assert.equal(createHash('sha256').update(fs.readFileSync(new URL(s.path,root),'utf8')).digest('hex'),s.sha256);}
 for(const r of [large,wide]){const t=task(r.input),chart={...t,evolutionOptions:t.rows.filter(row=>row.rarity==='evolution')},ownedIds=Object.keys(r.states).filter(id=>r.states[id]==='owned'),setup={...createFinalSetup(chart,r.actual),ownedSkillIds:ownedIds,possessionGraph:graph,inheritanceOrigins:origins},p={...r.current,setup,acquisition:r.states,nativeIds:t.nativeIds,ownedIds};for(const selected of [{ids:r.current.selectedIds,cost:r.current.budget.used},...r.fixedSelectionCrossChecks.map(x=>({ids:x.selectedIds,cost:x.cost}))]){const validity=selectionValidity(p,chart,selected.ids,r.actual);assert.equal(validity.eligible,true);assert.equal(validity.cost,selected.cost);}}
 assert.equal(matrix.records.length,inventory.matrixRecords);assert.equal(plans.records.length,inventory.planRecords);
 const matrixSame=matrix.records.filter(r=>r.comparison.kind==='same-runtime'),planSame=plans.records.filter(r=>r.comparison.kind==='same-runtime');
 assert.ok(matrixSame.every(r=>r.comparison.match));assert.ok(planSame.every(r=>r.comparison.selectionSame&&Math.abs(r.comparison.gainDifference)<1e-10));
 const originalMatrix=matrixFixtures(),rateComparisons={activationRates:0,usefulAccelerationRates:0};assert.equal(originalMatrix.length,matrix.records.length);
 for(const [i,r]of matrix.records.entries())if(r.comparison.kind==='same-runtime')for(const k of Object.keys(rateComparisons))if(originalMatrix[i].expected?.[k]){assert.deepEqual(r.current[k],originalMatrix[i].expected[k]);rateComparisons[k]++;}
 const groups=Object.fromEntries([...new Set(matrix.records.map(r=>r.group))].map(group=>{const rows=matrix.records.filter(r=>r.group===group);return [group,{records:rows.length,matching:rows.filter(r=>r.comparison.match).length,changed:rows.filter(r=>r.comparison.match===false).length,maxAbsoluteGainChange:Math.max(...rows.map(r=>Math.abs(r.comparison.gainDifference??0)))}];}));
 const witnesses=plans.records.flatMap((r,index)=>r.fixedSelectionComparisons.filter(x=>x.eligible&&x.beatsReoptimized).map(x=>({index,group:r.group,courseId:r.input.courseId,budget:r.actual.spBudget,kind:x.kind,gainGap:x.gain-r.current.gain,cost:x.cost,recommendedCost:r.current.budget.used})));
 const out={courseCount:inventory.uniqueCourseIds.length,conditionCount:inventory.raceConditions.length,matrixRecords:matrix.records.length,matrixSameRuntime:{records:matrixSame.length,matching:matrixSame.length},matrixGroups:groups,unsupportedMatrixRecords:matrix.records.filter(r=>!r.current).length,planRecords:plans.records.length,planSameRuntime:{records:planSame.length,matching:planSame.length},planGroups:Object.fromEntries([...new Set(plans.records.map(r=>r.group))].map(g=>[g,plans.records.filter(r=>r.group===g).length])),planHpIncomplete:plans.records.flatMap((r,index)=>r.current.hpSuccessRate<1?[{index,group:r.group,courseId:r.input.courseId,budget:r.actual.spBudget,stamina:r.actual.stats.stamina,hpSuccessRate:r.current.hpSuccessRate}]:[]),fixedSelectionWitnesses:witnesses,ineligibleFixedSelections:plans.records.flatMap((r,index)=>r.fixedSelectionComparisons.filter(x=>!x.eligible).map(x=>({index,kind:x.kind,reasons:x.reasons}))),large:{gain:large.current.gain,cost:large.current.budget.used,candidates:large.current.candidateCount,exactSameSelection:JSON.stringify(large.current.selectedIds)===JSON.stringify(large.historical.selectedIds),exactSameGain:large.current.gain===large.historical.gain},wide:{gain:wide.current.gain,cost:wide.current.budget.used,candidates:wide.current.candidateCount,sameHistoricalSelection:JSON.stringify(wide.current.selectedIds)===JSON.stringify(wide.historical.selectedIds),knownWitnesses:wide.fixedSelectionCrossChecks.filter(x=>x.beatsReoptimized).map(x=>({name:x.name,gainGap:x.gain-wide.current.gain,cost:x.cost}))}};
 out.matrixSameRuntime.rateComparisons=rateComparisons;out.planSameRuntime.rateComparisons=Object.fromEntries(['activationRates','usefulAccelerationRates'].map(k=>[k,planSame.filter(r=>r.comparison[k+'Match']).length]));assert.ok(out.large.exactSameSelection&&out.large.exactSameGain);save('summary',out);console.log(JSON.stringify(out,null,2));
}
