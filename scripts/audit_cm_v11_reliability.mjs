// Frozen v11 audit; production code and historical results are not changed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createChartSetup,prepareChart,buildChartCandidates,compileChartSkill,branchSampler,CM_MODEL_VERSION} from '../assets/cm-chart.mjs';
import {createFinalSetup,recommendFinalPlan,RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';
import {RaceEvaluator} from '../assets/race-evaluation.mjs';
import {activeSkillIds} from '../assets/skill-context.mjs';
import {selectionRules} from '../assets/selection.mjs';
import {createAcquisitionConstraints} from '../assets/acquisition-constraints.mjs';
import {compareRacePlans} from '../assets/race-objective.mjs';
import {finalAcquisitionSnapshot} from '../assets/cm-evolution.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const hash=()=>{const h=createHash('sha256');for(const n of fs.readdirSync(new URL('assets/',root)).filter(n=>/\.(mjs|css)$/.test(n)).sort())h.update(n+'\n'+fs.readFileSync(new URL('assets/'+n,root),'utf8').replace(/\r\n/g,'\n')+'\n');return h.digest('hex');};
const frozen='cc4c5e607abfac201a87705a3b99c7d461218166a721f0c6788086459df4b46b';assert.equal(hash(),frozen);assert.equal(CM_MODEL_VERSION,'cm-first-chart-v11');
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json');
assert.equal(manifest.active_version,'0b105741168200654ef4ef6523e1cb0bc0b7d9852107f3d478ea0fdcd6b7ad26');
const stamp={date:'2026-11-18 Asia/Seoul',frozenCommit:'d3b40fddf28fb6eb28b045afd65583b0ae3b11f6',assetsSha256:frozen,dataVersion:manifest.active_version,interpretation:'frozen implementation audit; finite-pool selection oracle shares physics/objective; assumed encounters are not calibrated probabilities'};
const save=(name,value)=>{assert.equal(hash(),frozen);fs.writeFileSync(new URL(`docs/validation/cm-v11-reaudit-${name}-20261118.json`,root),JSON.stringify({...stamp,...value},null,2)+'\n');};
const input=(courseId,extra={})=>({outfitId:'102201',scenarioId:'15',style:2,courseId,supportIds:[],going:1,weather:1,season:3,time:2,...extra});
const compact=r=>({gain:r.gain,feasible:r.feasible,hpSuccessRate:r.hpSuccessRate,hpShortfall:r.hpShortfall,performance:r.performance,activationRates:r.activationRates,usefulAccelerationRates:r.usefulAccelerationRates});
const statFields={base_speed:'speed',base_stamina:'stamina',base_power:'power',base_guts:'guts',base_wiz:'wisdom'};
const atoms=s=>s.invocations.flatMap(i=>[...(i.condition||[]),...(i.precondition||[])].flat());
const byName=name=>Object.values(data.skills).find(s=>s.jp_available&&s.name_jp===name&&!s.inherited)?.id;
const courses=[...new Set(['10903','10906','10506','11709',...Object.values(data.courses).filter(c=>c.selectable).map(c=>c.id)])];

if(process.argv.includes('--stats')){
 const skills=Object.values(data.skills).filter(s=>s.jp_available&&atoms(s).some(a=>Object.hasOwn(statFields,a.field))),out={scope:'all current JP stat-gated skill definitions; independent AST stat projection versus normal compiler, plus legal candidate retention under low/high chart caps',records:[]};
 // Evaluate source stat atoms outside the production compiler. A false DNF
 // becomes always==0, because [] means an unconditional invocation in the data.
 const cmp=(a,op,b)=>op==='=='?a===b:op==='!='?a!==b:op==='>'?a>b:op==='>='?a>=b:op==='<'?a<b:op==='<='?a<=b:assert.fail('unknown stat comparator');
 const project=(dnf,stats)=>{if(!dnf?.length)return dnf;const groups=dnf.filter(g=>g.every(a=>!statFields[a.field]||cmp(stats[statFields[a.field]],a.operator,a.value))).map(g=>g.filter(a=>!statFields[a.field]));return groups.length?groups:[[{field:'always',operator:'==',value:0}]];};
 const signature=c=>({status:c.status,invocations:c.invocations.map(i=>({index:i.index,effects:i.effects,duration:i.duration,passive:i.passive,durationScale:i.durationScale}))});
 const values=[999,1000,1001,1199,1200,1201,2300],vectors=[...values.map(v=>Object.fromEntries(Object.values(statFields).map(k=>[k,v]))),...Object.values(statFields).flatMap(k=>values.map(v=>({...profiles.profiles['15'].stats,[k]:v})))];
 for(const raw of skills){
  let extra={},rule=data.evolution_rules.find(r=>r.evolved_id===raw.id),route=data.acquisition_routes.find(r=>r.skill_id===(rule?.base_id??raw.id)&&r.owner_type==='outfit');
  if(rule?.owner_type==='outfit')extra.outfitId=rule.owner_id;
  else if(route)extra.outfitId=route.owner_id;
  else if(!raw.inherited){const support=data.acquisition_routes.find(r=>r.skill_id===(rule?.base_id??raw.id)&&r.owner_type==='support'&&data.supports[r.owner_id]?.rarity==='SSR');if(support)extra.supportIds=[support.owner_id];}
  if(rule?.owner_type==='scenario')extra.scenarioId=rule.owner_id;
  let found=null;
  outer:for(const courseId of courses)for(const style of [2,3,4,1]){
   const raceInput=input(courseId,{...extra,style});let s;try{s=createChartSetup(data,profiles,raceInput);}catch{continue;}
   const active=compileChartSkill(raw,{...s,stats:Object.fromEntries(Object.values(statFields).map(k=>[k,1300]))});
   if(active.status!=='inactive'){found={raceInput,setup:s,activeStatus:active.status};break outer;}
  }
  if(!found){out.records.push({id:raw.id,name:raw.name_jp,rarity:raw.rarity,status:'no-active-compatible-context-found'});continue;}
  const low={...found.setup,stats:Object.fromEntries(Object.values(statFields).map(k=>[k,999]))},high={...found.setup,stats:Object.fromEntries(Object.values(statFields).map(k=>[k,1300]))},a=buildChartCandidates(data,low),b=buildChartCandidates(data,high);
  assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());
  let checks=0;for(const stats of vectors){const normal=compileChartSkill(raw,{...found.setup,stats}),projected=compileChartSkill({...raw,invocations:raw.invocations.map(i=>({...i,condition:project(i.condition,stats),precondition:project(i.precondition,stats)}))},{...found.setup,stats});assert.deepEqual(signature(normal),signature(projected),`${raw.id} ${JSON.stringify(stats)}`);checks++;}
  let chartStatus=null,recordedHint=null,recordedOwned=null,flow='not-in-legal-pool';
  if(a.has(raw.id))try{const catalog=structuredClone(profiles);catalog.profiles[found.setup.scenarioId].stats=low.stats;const t=prepareChart(data,catalog,{},found.raceInput,{samples:1,dt:.05});chartStatus=t.rows.find(r=>r.id===raw.id)?.calculationState??(t.nativeIds.includes(raw.id)?'native':null);assert.ok(chartStatus);flow='chart-retained';if(!['unique','evolution'].includes(raw.rarity)){recordedHint=finalAcquisitionSnapshot(data,t,{[raw.id]:'3'})[raw.id];recordedOwned=finalAcquisitionSnapshot(data,t,{[raw.id]:'owned'})[raw.id];assert.equal(recordedHint,'3');assert.equal(recordedOwned,'owned');}}catch(error){if(!/고유기/.test(error.message))throw error;flow='owner-native-unsupported';}
  out.records.push({id:raw.id,name:raw.name_jp,rarity:raw.rarity,input:found.raceInput,activeStatus:found.activeStatus,inLowCandidates:a.has(raw.id),inHighCandidates:b.has(raw.id),candidateSetIdentical:true,chartStatus,flow,recordedHint,recordedOwned,projectionChecks:checks,purchaseStage:data.purchase_stages[raw.id]?.status??null,factorAdmissionCost:data.internal_acceleration_comparison_cost?.[raw.id]??null});
 }
 save('stats',out);console.log('real stat-gated skills',out.records.length,'projection checks',out.records.reduce((n,r)=>n+(r.projectionChecks||0),0));
}

const cases=[
 {key:'mile',input:input('10903',{supportIds:['30153','30093'],season:4}),names:['ハイボルテージ','心弾んで','鍔迫り合い','真っ向勝負','決意の直滑降','直滑降','マイル直線◎','マイル直線○','マイルコーナー◎','マイルコーナー○','直線巧者'],owned:'マイル直線○',stamina:1700},
 {key:'classic',input:input('10906',{supportIds:['30161','30093'],season:2,going:2}),names:['王手','会心の一歩','鍔迫り合い','真っ向勝負','決意の直滑降','直滑降','中距離直線◎','中距離直線○','中距離コーナー◎','中距離コーナー○','直線巧者'],owned:'中距離直線○',stamina:1800},
 {key:'long',input:input('10506',{supportIds:['30152','30161','30016'],season:4,weather:2,going:2}),names:['怪物','本領発揮','王手','会心の一歩','円弧のマエストロ','コーナー回復○','長距離直線◎','長距離直線○','長距離コーナー◎','長距離コーナー○','直線巧者'],owned:'コーナー回復○',stamina:1000},
 {key:'dirt',input:input('11709',{supportIds:['30250','30164','30016'],style:4,season:1}),names:['君臨','渾身の足取り','迫る影','直線一気','円弧のマエストロ','コーナー回復○','中距離直線◎','中距離直線○','中距離コーナー◎','中距離コーナー○','直線巧者'],owned:'中距離コーナー○',stamina:1700}
];

if(process.argv.includes('--plans')){
 const out={scope:'four further race inputs, eleven actual recorded rows including one owned lower; ten purchasable candidates, heterogeneous hints and two budgets; independent stage-cost/subset oracle shares production physics and objective',records:[]};
 for(const item of cases){
  const ids=item.names.map(byName);assert.ok(ids.every(Boolean));const t=prepareChart(data,profiles,{},item.input,{samples:1,dt:.05}),rows=t.rows.filter(r=>ids.includes(r.id));assert.equal(rows.length,11,`${item.key} missing ${ids.filter(id=>!rows.some(r=>r.id===id))}`);
  const c={setup:t.setup,nativeIds:t.nativeIds,rows,evolutionOptions:[],modelVersion:t.modelVersion},owned=byName(item.owned),states=Object.fromEntries(ids.map((id,i)=>[id,['0','2','5','1','3','4'][i%6]]));states[owned]='owned';
  const actual={stats:{...t.setup.stats,stamina:item.stamina},aptitudes:t.setup.aptitudes,spBudget:900},s=createFinalSetup(c,actual);s.ownedSkillIds=[owned];
  const required=activeSkillIds([...t.nativeIds,owned],s.possessionGraph),available=ids.filter(id=>id!==owned),compiled=new Map([...new Set([...ids,...t.nativeIds])].map(id=>[id,compileChartSkill(data.skills[id],s)])),ev=new RaceEvaluator(s,compiled,required,t.nativeIds,branchSampler),rules=selectionRules(data,new Map([...compiled.keys()].map(id=>[id,data.skills[id]]))),constraints=createAcquisitionConstraints(data,s),memo=new Map();
  for(let mask=0;mask<2**available.length;mask++){
   const active=activeSkillIds([...required,...available.filter((_,i)=>mask&(1<<i))],s.possessionGraph),key=active.join(',');if(memo.has(key))continue;
   if(!active.every((id,i)=>active.slice(0,i).every(other=>rules.compatible(id,other)))||!constraints.allowed([...active,owned]))continue;
   const stages=new Set();for(const id of active.filter(id=>!t.nativeIds.includes(id))){let k=id;while(k&&k!==owned){if(stages.has(k))break;stages.add(k);assert.equal(data.purchase_stages[k].status,'verified');k=data.purchase_stages[k].prerequisite_id;}}
   const cost=[...stages].reduce((n,id)=>n+Math.floor(data.purchase_stages[id].base_cost*(100-[0,10,20,30,35,40][Number(states[id]??0)])/100),0);if(cost>900)continue;
   memo.set(key,{ids:active,cost,...ev.evaluate(active,144,.01)});
  }
  for(const budget of [500,900]){
   const expected=[...memo.values()].filter(r=>r.cost<=budget).sort(compareRacePlans)[0],p=await recommendFinalPlan(data,c,states,{...actual,spBudget:budget},{samples:144,dt:.01,diagnostics:false}),measured={ids:p.activeIds,cost:p.budget.used,...ev.evaluate(p.activeIds,144,.01)};
   assert.equal(measured.gain,p.gain);const oracleComparison=compareRacePlans(measured,expected);
   out.records.push({key:item.key,input:item.input,actual:{...actual,spBudget:budget},states,candidateIds:ids,ownedId:owned,enumeratedMasks:2**available.length,affordableDistinctPlans:[...memo.values()].filter(r=>r.cost<=budget).length,recommendation:{selectedIds:p.activeIds,budget:p.budget,acquisition:p.acquisition,...compact(p),search:p.search},oracle:{selectedIds:expected.ids,cost:expected.cost,...compact(expected)},matchesOracleObjective:oracleComparison<=0,oracleComparison,gainGap:expected.gain-p.gain});
   fs.mkdirSync(new URL('.cache/',root),{recursive:true});fs.writeFileSync(new URL('.cache/v11-reaudit-plans-progress.json',root),JSON.stringify({...stamp,...out},null,2)+'\n');console.log('new race oracle',item.key,budget,'gain',p.gain,'gap',expected.gain-p.gain,'match',oracleComparison<=0,'HP',p.hpSuccessRate);
  }
 }
 save('plans',out);
}

if(process.argv.includes('--guides')){
 const out={scope:'isolated real accelerations on four race courses; native-only reference, default and alternate no-extra-spurt model; seed/step controls; no empirical probability claims',records:[]};
 const groups=[{courseId:'10903',style:2,ids:['202671','202711','201901']},{courseId:'10906',style:2,ids:['202711','201341','201901']},{courseId:'10506',style:2,ids:['202481','202711','202671']},{courseId:'11709',style:4,ids:['202871','200641']},{courseId:'11709',style:2,ids:['202711','201901']}];
 for(const group of groups)for(const variant of [{key:'base',seed:0,dt:.01},{key:'seed',seed:20261123,dt:.01},{key:'fine',seed:0,dt:.005},{key:'no-extra-spurt',seed:0,dt:.01,off:true}]){
  const t=prepareChart(data,profiles,{},input(group.courseId,{style:group.style}),{samples:1,dt:.05}),s={...t.setup,samplingSeed:variant.seed,stats:{...t.setup.stats,stamina:2200},...(variant.off?{fullSpurtMode:'off'}:{})},compiled=new Map([...new Set([...t.nativeIds,...group.ids])].map(id=>[id,compileChartSkill(data.skills[id],s)])),ev=new RaceEvaluator(s,compiled,t.nativeIds,t.nativeIds,branchSampler);
  for(const id of group.ids){const selected=activeSkillIds([...t.nativeIds,id],s.possessionGraph),r=ev.evaluate(selected,144,variant.dt);let first=null;for(let sample=0;sample<144&&!first;sample++){const run=ev.run(selected,sample,variant.dt),e=run.events.find(e=>e.id===id);if(e)first={sample,event:e,usefulSeconds:run.accelerationUseSeconds[id]??0};}out.records.push({courseId:group.courseId,style:group.style,id,name:data.skills[id].name_jp,variant:variant.key,seed:variant.seed,dt:variant.dt,status:compiled.get(id).status,...compact(r),firstActivation:first});}
 }
 save('guides',out);console.log('course and precision controls',out.records.length);
}

if(process.argv.includes('--witness')){
 const source=read('docs/validation/cm-v11-reaudit-plans-20261118.json').records.find(r=>r.key==='mile'&&r.actual.spBudget===500);assert.ok(source&&!source.matchesOracleObjective);
 const t=prepareChart(data,profiles,{},source.input,{samples:1,dt:.05}),rows=t.rows.filter(r=>source.candidateIds.includes(r.id)),c={setup:t.setup,nativeIds:t.nativeIds,rows,evolutionOptions:[],modelVersion:t.modelVersion},s=createFinalSetup(c,source.actual);s.ownedSkillIds=[source.ownedId];
 const required=activeSkillIds([...t.nativeIds,source.ownedId],s.possessionGraph),price=new RecordedPurchaseModel(data,rows,source.states,source.actual),constraints=createAcquisitionConstraints(data,s),out={scope:'independent witness cost/admission check and fixed-selection seed/step controls; no reoptimization or encounter reweighting',input:source.input,actual:source.actual,states:source.states,records:[]};
 const selections={recommendation:source.recommendation.selectedIds,witness:source.oracle.selectedIds};
 for(const [key,ids]of Object.entries(selections)){const p=price.selection(ids);assert.ok(p.complete&&p.used<=500);assert.equal(p.used,key==='recommendation'?source.recommendation.budget.used:source.oracle.cost);assert.ok(constraints.allowed([...ids,source.ownedId]));}
 for(const variant of [{key:'base',seed:0,samples:144,dt:.01},{key:'held-out-seed',seed:20261123,samples:288,dt:.01},{key:'fine',seed:0,samples:144,dt:.005},{key:'more-samples',seed:0,samples:1152,dt:.01}]){
  const setup={...s,samplingSeed:variant.seed},compiled=new Map([...new Set([...source.candidateIds,...t.nativeIds])].map(id=>[id,compileChartSkill(data.skills[id],setup)])),ev=new RaceEvaluator(setup,compiled,required,t.nativeIds,branchSampler),r=Object.fromEntries(Object.entries(selections).map(([key,ids])=>[key,ev.evaluate(ids,variant.samples,variant.dt)]));
  out.records.push({variant,selections,recommendation:compact(r.recommendation),witness:compact(r.witness),witnessGainDifference:r.witness.gain-r.recommendation.gain});
 }
 save('witness',out);console.log('independent witness legal; seed/step controls',out.records.length);
}

if(process.argv.includes('--late-plan')){
 const source=read('docs/validation/cm-v11-reaudit-plans-20261118.json').records.find(r=>r.key==='dirt'&&r.actual.spBudget===900),t=prepareChart(data,profiles,{},source.input,{samples:1,dt:.05}),rows=t.rows.filter(r=>source.candidateIds.includes(r.id)),chart={setup:t.setup,nativeIds:t.nativeIds,rows,evolutionOptions:[],modelVersion:t.modelVersion},withoutExtra={...chart,setup:{...chart.setup,fullSpurtMode:'off'}};
 const alternate=await recommendFinalPlan(data,withoutExtra,source.states,source.actual,{samples:144,dt:.01,diagnostics:false}),out={scope:'same recorded dirt900 input, alternate physical approximation; fixed-plan cross-evaluation avoids comparing unlike model scores',input:source.input,actual:source.actual,states:source.states,defaultSelected:source.recommendation.selectedIds,alternateSelected:alternate.activeIds,records:[]};
 for(const mode of ['default','off']){
  const s=createFinalSetup(mode==='off'?withoutExtra:chart,source.actual);s.ownedSkillIds=[source.ownedId];const required=activeSkillIds([...t.nativeIds,source.ownedId],s.possessionGraph),compiled=new Map([...new Set([...source.candidateIds,...t.nativeIds])].map(id=>[id,compileChartSkill(data.skills[id],s)])),ev=new RaceEvaluator(s,compiled,required,t.nativeIds,branchSampler);
  const a=ev.evaluate(out.defaultSelected,144,.01),b=ev.evaluate(out.alternateSelected,144,.01),marginal=Object.fromEntries(['202871','200642'].filter(id=>out.defaultSelected.includes(id)).map(id=>[id,ev.marginal(out.defaultSelected,id,144,.01)]));
  out.records.push({mode,defaultSelectedScore:compact(a),alternateSelectedScore:compact(b),defaultSelectionMarginals:marginal});
 }
 save('late-plan',out);console.log('late conditional plan sensitivity',out.records.length,'selected change',out.defaultSelected.join(',')!==out.alternateSelected.join(','));
}
