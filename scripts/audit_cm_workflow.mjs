// Workflow diagnostics, including controlled counterexamples. These are not
// assertions that the current numerical assumptions are correct game mechanics.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {prepareChart,compileChartSkill,branchSampler} from '../assets/cm-chart.mjs';
import {compileSkill} from '../assets/activation.mjs';
import {selfEffectSkill} from '../assets/cm-effect-policy.mjs';
import {simulateSolo} from '../assets/solo.mjs';
import {lengthsBetween} from '../assets/physics.mjs';
import {createPositionComparison} from '../assets/cm-position-comparison.mjs';
import {recommendFinalPlan,RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';
import {bulkAcquisition} from '../assets/cm-state.mjs';
import {EventConstraints} from '../assets/cm-event-constraints.mjs';
import {TARGET_ACCELERATION_VERSION} from '../assets/cm-acceleration-plan.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const targetVersion=TARGET_ACCELERATION_VERSION.replace('cm-target-acceleration-','');
const audit=read(`docs/validation/cm-acceleration-${targetVersion}-20261117/kyoto2200-leader.json`);
if(audit.dataVersion!==manifest.active_version)throw new Error('Refresh the target audit for this dataset first');
for(const [path,hash] of Object.entries(audit.sourceHashes))if(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')!==hash)throw new Error('Refresh the target audit for current production source: '+path);
const task=prepareChart(data,profiles,display,audit.input),quick={searchSamples:2,searchDt:.05,samples:4,dt:.01};
const run=(setup,skills)=>simulateSolo(setup,skills,.5,{dt:.01,fullSpurt:true,keepTrace:false});

// Actual data: HP predicates are the only dynamic predicates on these skills.
// Strict compilation here is a controlled sensitivity check, not a replacement
// race engine or a claim of validated real-race performance.
const longSetup={...task.setup,course:data.courses['10506']};
const empty=run(longSetup,[]),hpTiming=[];
for(const id of ['200761','200762']){
 const raw=data.skills[id],current=compileChartSkill(raw,longSetup),strict=compileSkill(selfEffectSkill(raw),longSetup);
 const a=run(longSetup,[current]),b=run(longSetup,[strict]);
 hpTiming.push({id,name:raw.name_jp,condition:raw.invocations[0].condition_raw,
  current:{events:a.events,hpRemaining:a.hpRemaining,hpGain:a.hpRemaining-empty.hpRemaining,gain:lengthsBetween(a,empty),feasible:a.fullSpeedFeasible},
  hpPredicateRetained:{events:b.events,hpRemaining:b.hpRemaining,hpGain:b.hpRemaining-empty.hpRemaining,gain:lengthsBetween(b,empty),feasible:b.fullSpeedFeasible},
  hpPredicateRemoved:!current.invocations.some(i=>i.condition.some(b=>b.dynamic.some(a=>a.field==='hp_per')))});
}

// Controlled CM9 example: same final-phase window, disjoint rank requirements.
const atom=(field,operator,value)=>({field,operator,value});
const skill=(id,condition,value=3000,rarity='white')=>({id,name_jp:id,description_jp:id,rarity,inherited:false,parent_ids:[],categories:['speed'],invocations:[{index:1,condition,precondition:[],duration_raw:30000,duration_unit:'umatools_base_time',cooldown_raw:null,effects:[{kind:'target_speed',value_raw:value,unit:'umatools_raw',extras_raw:{}}]}]});
const list=[skill('native',[],0,'unique'),skill('front',[[atom('phase','==',3),atom('order','<=',2)]]),skill('rear',[[atom('phase','==',3),atom('order','>=',5)]])];
const fixtureData={skills:Object.fromEntries(list.map(s=>[s.id,s])),relations:[],evolution_rules:[],scenario_exclusive_groups:[],purchase_stages:{front:{status:'verified',base_cost:100},rear:{status:'verified',base_cost:100}}};
// Keep HP ample in this isolated example, so HP-shortage precedence does not
// mask the separate question about simultaneous rank predicates.
const fixtureSetup={...task.setup,stats:{...task.setup.stats,speed:1500,stamina:2000,power:1500}};
const chart={modelVersion:task.modelVersion,setup:fixtureSetup,nativeIds:['native'],rows:list.slice(1).map(s=>({...s,name:s.name_jp}))};
const input={stats:fixtureSetup.stats,aptitudes:fixtureSetup.aptitudes,spBudget:120,discountTrait:'none',maintainTargetAcceleration:false};
const final=await recommendFinalPlan(fixtureData,chart,{front:'5',rear:'5'},input,quick);
const compiled=new Map(list.map(s=>[s.id,compileChartSkill(s,chart.setup)])),rankComparison=createPositionComparison(chart.setup,compiled,chart.nativeIds);
const direct=simulateSolo(chart.setup,final.activeIds.map(id=>compiled.get(id)),.5,{dt:quick.dt,fullSpurt:true,keepTrace:false,branchSampler:branchSampler(chart.setup,chart.nativeIds,0)});
const allRun=run(chart.setup,[...compiled.values()]),baseRun=run(chart.setup,[compiled.get('native')]);
const eventsByRank=comparisonEvents();
function comparisonEvents(){return rankComparison.ranks.map(rank=>({rank,events:rankComparison.run(final.activeIds,0,quick.dt,rank).events}));}
const rankConsistency={kind:'controlled-counterexample',selected:final.activeIds,gainUnderFinalPolicy:final.gain,
 fixtureSetup:chart.setup,finalStatus:{candidateCount:final.candidateCount,excluded:final.excluded,hpRemaining:final.hpRemaining,feasible:final.fullSpeedFeasible},
 compiled:[...compiled].map(([id,s])=>({id,status:s.status,reasons:s.reasons})),
 allRun:{gain:lengthsBetween(allRun,baseRun),hp:allRun.hpRemaining,feasible:allRun.fullSpeedFeasible,events:allRun.events},
 gainUnderTargetRankPolicy:rankComparison.compare(final.activeIds,quick.samples,quick.dt),events:direct.events,
 eventsByRank,simultaneousDisjointRankEvents:eventsByRank.filter(r=>r.events.some(e=>e.id==='front')&&r.events.some(e=>e.id==='rear')),unfilteredCounterfactualEvents:direct.events,finalHasRankPolicy:Object.hasOwn(final,'rankComparison')};

// Actual data: the scenario's linked rare choice exists, but the published
// target lists only card-owned rare sets. Purchase legality still enforces it.
const constraints=new EventConstraints(data,task.setup);
const scenarioChoices=constraints.groups.filter(g=>g.scenario_id&&g.choices.filter(c=>c.rewards.some(r=>data.skills[r.skill_id]?.rarity==='gold')).length>1).map(g=>({id:g.id,choices:g.choices.map(c=>({id:c.id,rareIds:c.rewards.filter(r=>data.skills[r.skill_id]?.rarity==='gold').map(r=>r.skill_id)})).filter(c=>c.rareIds.length),publishedChoice:audit.plan.eventChoices[g.id]??null,visibleRewardSet:[...audit.plan.rewards,...(audit.plan.scenarioRewards||[])].some(r=>r.groupId===g.id)}));

// Ingame paid history is distinct from making all remaining hints Lv5.
const paidStates={front:'owned',rear:'0'},afterBulk=bulkAcquisition(chart.rows,paidStates,'5');
const beforePrice=new RecordedPurchaseModel(fixtureData,chart.rows,paidStates).selection(['front']);
const afterPrice=new RecordedPurchaseModel(fixtureData,chart.rows,afterBulk).selection(['front']);
const bulkPaidHistory={kind:'controlled-interaction',before:paidStates,after:afterBulk,
 paidSkillUnpaidAgain:afterBulk.front!=='owned',previouslyPaidStageCostBefore:beforePrice.used,previouslyPaidStageCostAfter:afterPrice.used};

const strategyScores=[];
for(const [courseId,style] of [['10808',2],['10506',2],['10506',3],['10506',4]]){
 const t=prepareChart(data,profiles,display,{...audit.input,courseId,style});
 const rows=['201591','201592'].map(id=>t.rows.find(r=>r.id===id)).filter(Boolean).map(r=>{const v=t.evaluate(r);return {id:r.id,name:r.name,gain:v.gain,hpGain:v.hpGain};});
 strategyScores.push({courseId,style,rows,scope:'solo numerical effect; no opponents, pace-down mode, position keep or PDM-release value'});
}

const sources=['assets/cm-chart.mjs','assets/cm-final-plan.mjs','assets/cm-acceleration-plan.mjs','assets/cm-state.mjs','assets/cm-evolution.mjs','assets/cm-effect-policy.mjs','assets/solo.mjs','assets/cm-final-ui.mjs','index.html'];
let realFinalSensitivity=null;
const finalPath=`docs/validation/cm-acceleration-${targetVersion}-7000-20261117.json`;
if(existsSync(resolve(root,finalPath))){
 const plan=read(finalPath);
 if(plan.dataVersion!==manifest.active_version||plan.ownedIds.length)throw new Error('Refresh the unowned real final-plan diagnostic first');
 const finalCompiled=new Map(plan.activeIds.map(id=>[id,compileChartSkill(data.skills[id],plan.setup)]));
 const comparison=createPositionComparison(plan.setup,finalCompiled,plan.nativeIds);
 realFinalSensitivity={source:finalPath,finalPublishedGain:plan.gain,sameSelectionUnderTargetRankPolicy:comparison.compare(plan.activeIds,24,.01),
  budget:plan.budget,maintainedStrategyIds:plan.maintainedStrategyIds,inheritedCount:plan.inheritedCount,scenarioEvolutionCount:plan.scenarioEvolutionCount,umaGonomiIncluded:plan.activeIds.includes('201591'),
  interpretation:'same actual selected skills and stats; comparison-policy sensitivity, not measured race performance or placement probabilities'};
}
const output={checkedAt:'2026-11-17',codeBaseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dataVersion:manifest.active_version,
 sourceHashes:Object.fromEntries(sources.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')])),hpTiming,rankConsistency,scenarioChoices,bulkPaidHistory,strategyScores,realFinalSensitivity,
 facts:{scenario15EvolutionChoices:data.evolution_rules.filter(r=>r.owner_type==='scenario'&&r.owner_id==='15').length,
  scenario15EvolutionLimit:data.scenario_exclusive_groups.filter(g=>g.scenario_id==='15'),targetInheritedCount:audit.plan.skills.filter(r=>r.inherited).length},
 scope:'read-only diagnostics of the fixed workflow; pre-fix evidence is preserved in cm-workflow-20261117.json'};
if(process.argv.includes('--assert-fixed')){
 const checks={hp:hpTiming.every(r=>!r.hpPredicateRemoved&&r.current.events[0]?.t>0),rank:rankConsistency.finalHasRankPolicy&&rankConsistency.simultaneousDisjointRankEvents.length===0&&Math.abs(final.gain-rankConsistency.gainUnderTargetRankPolicy.gain)<1e-8,
  scenario:scenarioChoices.every(g=>g.publishedChoice!==null&&g.visibleRewardSet),paid:!bulkPaidHistory.paidSkillUnpaidAgain&&bulkPaidHistory.previouslyPaidStageCostAfter===0,
  real:realFinalSensitivity&&Math.abs(realFinalSensitivity.finalPublishedGain-realFinalSensitivity.sameSelectionUnderTargetRankPolicy.gain)<1e-8&&realFinalSensitivity.maintainedStrategyIds.includes('201591')};
 if(Object.values(checks).some(value=>!value))throw new Error('Workflow regression: '+JSON.stringify(checks));
 output.fixedWorkflowChecks=checks;
}
writeFileSync(resolve(root,`docs/validation/cm-workflow-${targetVersion}-20261117.json`),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({hpTiming:hpTiming.map(r=>({id:r.id,currentAt:r.current.events[0]?.t,retainedAt:r.hpPredicateRetained.events[0]?.t,currentHpGain:r.current.hpGain,retainedHpGain:r.hpPredicateRetained.hpGain})),rankConsistency:{finalGain:final.gain,targetPolicyGain:rankComparison.compare(final.activeIds,quick.samples,quick.dt).gain,events:rankConsistency.simultaneousDisjointRankEvents},scenarioChoices,bulkPaidHistory,strategyScores},null,2));
