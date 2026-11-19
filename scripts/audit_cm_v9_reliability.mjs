// Frozen-engine audit. Reference variants live only in .cache; never edit assets.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileSkill,branchReady,sampleBranches} from '../assets/activation.mjs';
import {createChartSetup,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {sampleUnit,scheduleContextBranches} from '../assets/race-sampling.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {buildAcquisitionHierarchy} from '../assets/cm-state.mjs';
import {selectableCourse} from '../assets/reviewed-course-geometry.mjs';
import {recommendFinalPlan} from '../assets/cm-final-plan.mjs';
import {prepareChart} from '../assets/cm-chart.mjs';
import {activeSkillIds} from '../assets/skill-context.mjs';
import {compareRacePlans} from '../assets/race-objective.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const write=(p,v)=>fs.writeFileSync(new URL(p,root),JSON.stringify(v,null,2)+'\n');
const assetHash=()=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL('assets/',root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
const frozen='6522c0e8ad66e6f9305f8c0adae62a45580a7fd42a22c2b752927e3846119703';assert.equal(assetHash(),frozen);
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
const graph=Object.fromEntries([...buildAcquisitionHierarchy(data).lower].map(([id,low])=>[id,[...low]]));
const stats={speed:2100,stamina:2000,power:1700,guts:1400,wisdom:1500},aptitudes={distance:'S',surface:'A',style:'A'};
const input=(courseId,style,extra={})=>({outfitId:'102201',scenarioId:'12',courseId,style,supportIds:[],going:1,weather:1,season:3,time:2,...extra});
const setup=(courseId,style,extra={})=>({...createChartSetup(data,profiles,input(courseId,style)),stats,aptitudes,possessionGraph:graph,...extra});
const atom=(field,value,operator='==')=>({field,value,operator});
const raw=(id,condition,effects=[{kind:'acceleration',value_raw:1000,unit:'umatools_raw',extras_raw:{}}],rarity='white')=>({id,name_jp:id,rarity,activation_raw:0,parent_ids:[],invocations:[{index:1,condition:[condition],precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',effects}]});
const cmp=(a,op,b)=>({'==':()=>a===b,'!=':()=>a!==b,'>':()=>a>b,'>=':()=>a>=b,'<':()=>a<b,'<=':()=>a<=b}[op]());
const phase=(x,d)=>x<d/6?0:x<d*2/3?1:x<d*5/6?2:3;
const inRange=(x,a,b)=>a<=x&&x<b;
const spatial=new Set(['phase','phase_firsthalf','phase_laterhalf','phase_firstquarter','distance_rate','remain_distance','furlong','corner','is_finalcorner','is_finalcorner_laterhalf','is_last_straight','is_last_straight_onetime','straight_front_type','slope']);
// Independent direct predicate evaluation. Exact closed-vs-half-open endpoints
// are counted separately; the interior comparison is not a copy of compilation.
function direct(a,c,previous,current){
 const bounds=[[0,c.distance/6],[c.distance/6,c.distance*2/3],[c.distance*2/3,c.distance*5/6],[c.distance*5/6,c.distance]],p=phase(previous,c.distance),end=c.straights.at(-1)?.start??Infinity;
 let v;
 switch(a.field){
  case 'phase':v=p;break;
  case 'phase_firsthalf':v=previous<(bounds[p][0]+bounds[p][1])/2?p:-1;break;
  case 'phase_laterhalf':v=previous>=(bounds[p][0]+bounds[p][1])/2?p:-1;break;
  case 'phase_firstquarter':{const b=bounds[a.value];v=Number(!!b&&inRange(current,b[0],b[0]+(b[1]-b[0])/4));return cmp(v,a.operator,1);}
  case 'distance_rate':v=Math.floor(current*100/c.distance);break;
  case 'remain_distance':v=Math.trunc(c.distance-previous);break;
  case 'furlong':v=Math.floor(previous/200);break;
  case 'corner':{const k=c.corners.findIndex(s=>inRange(current,s.start,s.start+s.length));v=k<0?0:(16+k-c.corners.length)%4+1;break;}
  case 'is_finalcorner':v=Number(current>=(c.corners.at(-1)?.start??Infinity));break;
  case 'is_finalcorner_laterhalf':{const s=c.corners.at(-1);v=Number(current>=end||!!s&&inRange(current,s.start+s.length/2,s.start+s.length));break;}
  case 'is_last_straight':v=Number(current>=end);break;
  case 'is_last_straight_onetime':v=Number(current>=end&&previous<end);break;
  case 'straight_front_type':{const k=c.straights.findLastIndex(s=>inRange(current,s.start,s.end));v=k<0?0:(c.straights.length-1-k)%2===0?1:2;break;}
  case 'slope':{const slope=c.slopes.find(s=>inRange(current,s.start,s.start+s.length))?.slope??0;v=slope>=1000?1:slope<=-1000?2:0;break;}
 }
 return cmp(v,a.operator,a.value);
}
const stamp={date:'2026-11-18 Asia/Seoul',frozenCommit:'67b72fd71c3952737b94e3ae0e3e82b2b02fcf8b',assetsSha256:frozen,dataVersion:manifest.active_version,interpretation:'implementation and same-assumption sensitivity audit; no empirical encounter calibration'};
fs.mkdirSync(new URL('.cache/v9-reaudit/',root),{recursive:true});
// Isolate the two phase consumers from physics. This is a diagnostic reference,
// not a production correction or a complete port of the external simulator.
const assetsURL=new URL('assets/',root).href;
let solo=fs.readFileSync(new URL('assets/solo.mjs',root),'utf8').replaceAll("from './",`from '${assetsURL}`);
solo=solo.replace('counts[state.phase]++','counts[phaseAt(state.prevX,d)]++').replace('wisdomSpeedMultiplier(state.phase)','wisdomSpeedMultiplier(phaseAt(state.prevX,d))');
fs.writeFileSync(new URL('.cache/v9-reaudit/solo-frame-reference.mjs',root),solo);
let evaluation=fs.readFileSync(new URL('assets/race-evaluation.mjs',root),'utf8').replace("from './solo.mjs'",`from '${new URL('.cache/v9-reaudit/solo-frame-reference.mjs',root).href}'`).replaceAll("from './",`from '${assetsURL}`);
fs.writeFileSync(new URL('.cache/v9-reaudit/evaluation-frame-reference.mjs',root),evaluation);
const {simulateSolo:frameSolo}=await import(new URL('.cache/v9-reaudit/solo-frame-reference.mjs',root));
const {RaceEvaluator:FrameEvaluator}=await import(new URL('.cache/v9-reaudit/evaluation-frame-reference.mjs',root));
// Isolate the race-half domain from the disputed slope-selection distribution.
let activation=fs.readFileSync(new URL('assets/activation.mjs',root),'utf8').replaceAll("from './",`from '${assetsURL}`);
const oldHalf='x>=s.start+s.length/2&&x<s.start+s.length';
assert.ok(activation.includes(oldHalf));
activation=activation.replace(oldHalf,'x>=Math.max(s.start,c.distance/2)&&x<s.start+s.length');
fs.writeFileSync(new URL('.cache/v9-reaudit/activation-domain-reference.mjs',root),activation);
const chart=fs.readFileSync(new URL('assets/cm-chart.mjs',root),'utf8').replace("from './activation.mjs'",`from '${new URL('.cache/v9-reaudit/activation-domain-reference.mjs',root).href}'`).replaceAll("from './",`from '${assetsURL}`);
fs.writeFileSync(new URL('.cache/v9-reaudit/chart-domain-reference.mjs',root),chart);
const {compileChartSkill:domainCompile}=await import(new URL('.cache/v9-reaudit/chart-domain-reference.mjs',root));
// Pinned umasim picks a slope uniformly, then chooses a point in that slope.
// Alpha uses length weighting; this reference is a sensitivity case, not a
// verified replacement for the game's unknown selection law. A single
// uniform quantile is decomposed into area and conditional position to retain
// a deterministic coupling without introducing an observed probability model.
function referenceSampler(s,natives,sample){
 const base=branchSampler(s,natives,sample),unit=(id,key,k=0)=>sampleUnit(sample,`${id}|${key}|${k}`,s.samplingSeed??0);
 const fn=(branches,id,inv,pre)=>{
  const atoms=(data.skills[id]?.invocations.find(i=>i.index===inv.index)?.condition||[]).flat(),a=atoms.find(a=>['straight_random','up_slope_random','down_slope_random','up_slope_random_later_half'].includes(a.field));
  if(pre||!a)return base(branches,id,inv,pre);
  let areas,q,at;
  if(a.field==='straight_random'){
   areas=s.course.straights.map(k=>[k.start,k.end]);const k=Math.floor(unit(id,'straight',0)*areas.length);q=unit(id,'straight',1);const [lo,hi]=areas[k];at=Math.min(lo+q*(hi-lo),hi-2);areas=[[at,Math.min(at+10,hi)]];
  }else{
   const up=a.field.startsWith('up'),later=a.field.endsWith('later_half');
   areas=s.course.slopes.filter(k=>up?k.slope>0:k.slope<0).filter(k=>!later||k.start+k.length>s.course.distance/2).map(k=>[later?Math.max(k.start,s.course.distance/2):k.start,k.start+k.length]);
   if(!areas.length)return [];
   q=unit(id,`${a.field}:${a.operator}:${a.value}`)*areas.length;const k=Math.min(areas.length-1,Math.floor(q)),[lo,hi]=areas[k];at=Math.min(lo+(q-k)*(hi-lo),hi-2);areas=[[at,Math.min(at+10,hi)]];
  }
  return scheduleContextBranches(branches.flatMap(b=>{const windows=b.windows.flatMap(([lo,hi])=>areas.map(([a,z])=>[Math.max(lo,a),Math.min(hi,z)])).filter(([lo,hi])=>lo<hi);return windows.length?[{...b,windows,at:windows[0][0],random:false,lotQ:unit(id,`lot:${inv.index}:condition`),sharedLotQ:unit(id,'lot-shared'),fullSpurtQ:unit(id,'full-spurt'),choiceQ:unit(id,'effect-value',inv.index)}]:[];}),s);
 };
 fn.unit=base.unit;fn.policy=base.policy;return fn;
}
function referenceCompile(skill,s){
 const adjusted={...skill,invocations:skill.invocations.map(inv=>({...inv,condition:inv.condition?.map(g=>g.filter(a=>!['up_slope_random','down_slope_random','up_slope_random_later_half'].includes(a.field)))}))};
 return compileChartSkill(adjusted,s);
}
const compact=v=>({gain:v.gain,activationRates:v.activationRates,usefulAccelerationRates:v.usefulAccelerationRates,hpSuccessRate:v.hpSuccessRate,performance:v.performance});
function score(s,ids,{count=144,reference=false,baseline=[],frame=false,domainOnly=false}={}){
 const comp=new Map([...new Set([...ids,...baseline])].map(id=>[id,(domainOnly?domainCompile:reference?referenceCompile:compileChartSkill)(data.skills[id],s)]));
 const C=frame?FrameEvaluator:RaceEvaluator,ev=new C(s,comp,baseline,[],reference?referenceSampler:branchSampler);return compact(ev.evaluate(ids,count,.01));
}
if(process.argv.includes('--mechanics')){
 const groups=new Map();for(const sk of Object.values(data.skills))for(const inv of sk.invocations)for(const g of [...(inv.condition||[]),...(inv.precondition||[])]){const atoms=g.filter(a=>spatial.has(a.field));if(atoms.length)groups.set(JSON.stringify(atoms),atoms);}
 const out={...stamp,fieldGroups:groups.size,predicateChecks:0,mismatches:[],lotteries:[],counterBoundary:null};
 for(const c of Object.values(data.courses).filter(selectableCourse)){
  const s={...setup('10807',3),course:c},points=[c.distance/6,c.distance*2/3,c.distance*5/6,...c.corners.flatMap(k=>[k.start,k.start+k.length]),...c.straights.flatMap(k=>[k.start,k.end]),...c.slopes.flatMap(k=>[k.start,k.start+k.length]),...Array.from({length:13},(_,i)=>c.distance*(i+.37)/13)];
  for(const atoms of groups.values()){
   const compiled=compileSkill(raw('predicate-oracle',atoms),s);if(compiled.status==='unsupported')continue;
   const bs=sampleBranches(compiled.invocations[0]?.condition??[],.5);
   for(const p of points)for(const delta of [-.013,.017]){const current=p+delta,previous=current-.23;if(previous<0||current>=c.distance)continue;
    const expected=atoms.every(a=>direct(a,c,previous,current)),actual=bs.some(b=>branchReady(b,{x:current,prevX:previous,t:50},'predicate-oracle'));out.predicateChecks++;
    if(expected!==actual&&out.mismatches.length<80)out.mismatches.push({courseId:c.id,atoms,previous,current,expected,actual});
   }
  }
 }
 for(const [courseId,id]of [['10507','201581'],['10507','103003111'],['10604','201581']]){
  const s=setup(courseId,2),compiled=compileChartSkill(data.skills[id],s),c=referenceCompile(data.skills[id],s),counts={},refCounts={};
  for(let sample=0;sample<4096;sample++)for(const [kind,bins]of [['current',branchSampler(s,[],sample)(compiled.invocations[0].condition,id,compiled.invocations[0],false)],['reference',referenceSampler(s,[],sample)(c.invocations[0].condition,id,c.invocations[0],false)]]){
   const at=bins[0]?.at??null,key=at===null?'none':String(s.course.slopes.findIndex(k=>k.slope>0&&inRange(at,k.start,k.start+k.length))),dest=kind==='current'?counts:refCounts;dest[key]=(dest[key]??0)+1;
  }
  out.lotteries.push({courseId,id,counts,referenceCounts:refCounts});
 }
 const s=setup('10708',3,{raceContext:{rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}}});
 const before=[raw('000-before-a',[atom('distance_rate',30,'>=')]),raw('000-before-b',[atom('distance_rate',40,'>=')]),data.skills['100591'],data.skills['201611']].map(r=>compileChartSkill(r,s));
 const a=simulateSolo(s,before,.5,{dt:.01,keepTrace:false}),b=frameSolo(s,before,.5,{dt:.01,keepTrace:false});
 out.counterBoundary={courseId:'10708',current:a.events,reference:b.events,currentFinishTime:a.finishTime,referenceFinishTime:b.finishTime};
 assert.equal(assetHash(),frozen);write('docs/validation/cm-v9-reliability-mechanics-20261118.json',out);console.log('mechanics',out.predicateChecks,out.mismatches.length);
}
if(process.argv.includes('--races')){
 const races=[{key:'tokyo2000',courseId:'10604',season:3},{key:'kyoto2000',courseId:'10807',season:3},{key:'nakayama3600',courseId:'10507',season:2},{key:'delmar2200',courseId:'11703',season:1}],ids=['202711','202871','200641','900591','900041','201341','201342','203902','201581','200341','200511','201032'];
 const out={...stamp,races,stats,aptitudes,matrix:[],randomSensitivity:[]};
 for(const r of races)for(const style of [1,2,3,4]){const s=setup(r.courseId,style,{season:r.season});for(const id of ids)out.matrix.push({race:r.key,style,id,...score(s,[id])});console.log('race',r.key,style);write('.cache/v9-reaudit/races.json',out);}
 for(const courseId of ['10507','10604','10807'])for(const id of ['201581','201342','200511','103003111'])for(const seed of [0,20261119]){
  const s=setup(courseId,2,{samplingSeed:seed});out.randomSensitivity.push({courseId,id,seed,current:score(s,[id],{count:576}),reference:score(s,[id],{count:576,reference:true})});console.log('random',courseId,id,seed);write('.cache/v9-reaudit/races.json',out);
 }
 assert.equal(assetHash(),frozen);write('docs/validation/cm-v9-reliability-races-20261118.json',out);
}
if(process.argv.includes('--extra')){
 const out={...stamp,sensitivity:[],longHpControls:[],plans:[],counterLowStats:null};
 for(const [courseId,id]of [['10810','103003111'],['10811','103003111'],['10507','200372'],['10604','200362'],['10807','200372']])for(const seed of [0,20261119]){
  const s=setup(courseId,2,{samplingSeed:seed});out.sensitivity.push({courseId,id,seed,current:score(s,[id],{count:576}),reference:score(s,[id],{count:576,reference:true})});console.log('extra',courseId,id,seed);
 }
 for(const stamina of [2000,3000]){const s=setup('10507',4,{stats:{...stats,stamina}});for(const baseline of [[],['200351','200561']])out.longHpControls.push({stamina,baseline,...score(s,[...baseline,'200641'],{baseline,count:144})});}
 const s=setup('10708',3,{stats:{...stats,speed:1400,power:2500,guts:1000},aptitudes:{distance:'A',surface:'A',style:'A'},raceContext:{rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}}});
 const comp=[raw('000-before-a',[atom('distance_rate',30,'>=')]),raw('000-before-b',[atom('distance_rate',40,'>=')]),data.skills['100591'],data.skills['201611']].map(r=>compileChartSkill(r,s));
 const current=simulateSolo(s,comp,.5,{dt:.01,keepTrace:false}),reference=frameSolo(s,comp,.5,{dt:.01,keepTrace:false});out.counterLowStats={stats:s.stats,current:current.events,reference:reference.events,currentFinishTime:current.finishTime,referenceFinishTime:reference.finishTime};
 for(const courseId of ['10604','10807','11703'])for(const style of [2,4]){
  const season=courseId==='11703'?1:3,t=prepareChart(data,profiles,{skills:{}},input(courseId,style,{season}),{samples:1,dt:.05}),ids=style===2?['202711','202712','201102','201112','200362']:['202871','202872','201452','201462','200362'];
  const rows=t.rows.filter(r=>ids.includes(r.id)),chart={setup:t.setup,nativeIds:t.nativeIds,rows,modelVersion:t.modelVersion,evolutionOptions:[]};
  for(const budget of [300,500]){const states=Object.fromEntries(rows.map(r=>[r.id,'2'])),actual={stats,aptitudes,spBudget:budget};
   const p=await recommendFinalPlan(data,chart,states,actual,{samples:144,dt:.01,diagnostics:false});assert.ok(p.search.globalOptimal);out.plans.push({courseId,style,season,stats,aptitudes,budget,states,selectedIds:p.activeIds,budgetResult:p.budget,...compact(p),search:p.search});console.log('plan',courseId,style,budget);write('.cache/v9-reaudit/extra.json',out);
  }
 }
 assert.equal(assetHash(),frozen);write('docs/validation/cm-v9-reliability-extra-20261118.json',out);
}
if(process.argv.includes('--followup')){
 const out={...stamp,domainOnly:[],kyotoKingControls:[],wisdomBoundary:null};
 for(const courseId of ['10810','10811'])for(const seed of [0,20261119]){
  const s=setup(courseId,2,{samplingSeed:seed});out.domainOnly.push({courseId,id:'103003111',seed,current:score(s,['103003111'],{count:576}),reference:score(s,['103003111'],{count:576,domainOnly:true})});console.log('domain-only',courseId,seed);
 }
 for(const profile of ['control','guide'])for(const style of [2,3])for(const baseline of [[],['201341']]){
  const s=setup('10807',style,profile==='guide'?{stats:{speed:1850,stamina:1400,power:1700,guts:1400,wisdom:1300}}:{});
  out.kyotoKingControls.push({profile,style,baseline,...score(s,[...baseline,'202711'],{baseline,count:144})});
 }
 const s=setup('10708',3,{raceContext:{rankTimeline:[{distance:0,rank:5}],conditions:{temptation_count:0}}});
 const r=raw('audit-gold-boundary-speed',[atom('phase',1),atom('is_finalcorner',1)],[{kind:'target_speed',value_raw:3500,unit:'umatools_raw',extras_raw:{}}],'gold'),c=compileChartSkill(r,s);
 const a=simulateSolo(s,[c],.5,{dt:.01,keepTrace:false}),b=frameSolo(s,[c],.5,{dt:.01,keepTrace:false});
 out.wisdomBoundary={fixture:'synthetic gold speed effect; no claim about a specific real skill',courseId:'10708',style:3,events:a.events,currentFinishTime:a.finishTime,referenceFinishTime:b.finishTime,currentPhase:2,referencePhase:1};
 assert.equal(a.events.length,1);assert.equal(assetHash(),frozen);write('docs/validation/cm-v9-reliability-followup-20261118.json',out);
}
if(process.argv.includes('--oracle')){
 const plans=read('docs/validation/cm-v9-reliability-extra-20261118.json').plans,out={...stamp,scope:'independent subset enumeration and stage-cost arithmetic; shared production evaluator and declared objective, not an independent physics oracle',results:[]};
 for(const courseId of ['10604','10807','11703'])for(const style of [2,4]){
  const checks=plans.filter(p=>p.courseId===courseId&&p.style===style),ids=Object.keys(checks[0].states),natives=['100221'],s=setup(courseId,style,{season:checks[0].season});
  const compiled=new Map([...ids,...natives].map(id=>[id,compileChartSkill(data.skills[id],s)])),ev=new RaceEvaluator(s,compiled,natives,natives,branchSampler),rows=[];
  for(let mask=0;mask<2**ids.length;mask++){
   const selected=ids.filter((_,i)=>mask&(1<<i)),stages=new Set();
   for(const id of selected){let stage=id;while(stage){if(stages.has(stage))break;stages.add(stage);assert.equal(data.purchase_stages[stage].status,'verified');stage=data.purchase_stages[stage].prerequisite_id;}}
   const cost=[...stages].reduce((sum,id)=>sum+Math.floor(data.purchase_stages[id].base_cost*.8),0),active=activeSkillIds([...natives,...selected],graph).sort();
   if(cost<=500)rows.push({ids:active,cost,...ev.evaluate(active,144,.01)});
  }
  for(const p of checks){const best=rows.filter(r=>r.cost<=p.budget).sort(compareRacePlans)[0];assert.deepEqual([...p.selectedIds].sort(),best.ids);assert.ok(Math.abs(p.gain-best.gain)<1e-10);out.results.push({courseId,style,budget:p.budget,enumeratedSubsets:2**ids.length,affordableSubsets:rows.filter(r=>r.cost<=p.budget).length,selectedIds:best.ids,cost:best.cost,gain:best.gain,match:true});}
  console.log('oracle',courseId,style);write('.cache/v9-reaudit/oracle.json',out);
 }
 assert.equal(assetHash(),frozen);write('docs/validation/cm-v9-reliability-oracle-20261118.json',out);
}
