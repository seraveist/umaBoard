// Reproducible external-guide comparison. This records differences, not a
// snapshot assertion that would bless the current recommendation as correct.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {prepareChart,buildChartCandidates,compileChartSkill} from '../assets/cm-chart.mjs';
import {recommendTargetAcceleration,TARGET_ACCELERATION_VERSION} from '../assets/cm-acceleration-plan.mjs';
import {createPositionComparison} from '../assets/cm-position-comparison.mjs';
import {selectionRules} from '../assets/selection.mjs';
import {EventConstraints} from '../assets/cm-event-constraints.mjs';
import {scenarioSelectionAllowed} from '../assets/acquisition-rules.mjs';
import {RecordedPurchaseModel} from '../assets/cm-final-plan.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),profiles=read('curated/cm-scenario-profiles.json'),display=read('curated/cm-skill-display.json');
const sourceFiles=['assets/cm-acceleration-plan.mjs','assets/cm-position-comparison.mjs','assets/cm-final-plan.mjs','assets/cm-state.mjs','assets/cm-chart.mjs','assets/cm-sampling.mjs','assets/cm-strategy.mjs','assets/cm-effect-policy.mjs'];
const sourceHashes=Object.fromEntries(sourceFiles.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
const codeBaseCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const costBridge=process.argv.includes('--cost-bridge');
// Diagnostic only: never writes modified game data or production code.
if(costBridge)for(const [base,strong] of [['901351','91101351'],['901411','91101411']])data.purchase_stages[strong]={...data.purchase_stages[base]};
const base=['30275','30311','30300','30322','30289','30323'];
const replace=(from,to)=>base.map(id=>id===from?to:id);
const source=slug=>'https://umamusumelabo.com/'+slug;
const expectations=(...pairs)=>pairs.map(([name,ids])=>({name,ids}));
export const cases=[
 {id:'kyoto2200-leader',label:'교토 2200m 선행',courseId:'10808',style:2,outfitId:'101301',supportIds:base,source:source('ikusei/chanmi-senkouikusei-202610'),guideDate:'2026-10-12',scope:'current-skill course guidance; scenario/stats normalized',expected:expectations(['에피파네이아 강화 계승',['91101411']],['직활강 계열',['201341','201342']])},
 {id:'kyoto2200-betweener',label:'교토 2200m 선입',courseId:'10808',style:3,outfitId:'111101',supportIds:replace('30275','30317'),source:source('ikusei/chanmi-sasioikomi-202610'),guideDate:'2026-10',scope:'current-skill course guidance; scenario/stats normalized',expected:expectations(['스테이 골드 강화 계승',['91101351']],['駆け降り',['203322']])},
 {id:'kyoto2200-chaser',label:'교토 2200m 추입',courseId:'10808',style:4,outfitId:'111501',supportIds:replace('30275','30312'),source:source('ikusei/chanmi-sasioikomi-202610'),guideDate:'2026-10',scope:'current-skill course guidance; scenario/stats normalized',expected:expectations(['스테이 골드 강화 계승',['91101351']],['急降下',['203902']])},
 {id:'tokyo2400-leader',label:'도쿄 2400m 선행',courseId:'10606',style:2,outfitId:'101301',supportIds:replace('30275','30282'),source:source('event/champions-meeting/chanmi-tokyo2400-202606'),guideDate:'2026-06',scope:'course-valid key families, not an exact historical meta replay',expected:expectations(['홍염 기어',['900041']],['왕수 계열',['202711','202712']])},
 {id:'tokyo2400-runner',label:'도쿄 2400m 도주',courseId:'10606',style:1,outfitId:'102001',supportIds:base,source:source('event/champions-meeting/chanmi-tokyo2400-202606'),guideDate:'2026-06',scope:'course-valid key families; native Angling counts',expected:expectations(['앵글링(본체 포함)',['100201','900201']],['홍염 기어',['900041']],['逃げ切り体勢',['203382']])},
 {id:'nakayama2500-betweener',label:'나카야마 2500m 선입',courseId:'10506',style:3,outfitId:'107601',supportIds:replace('30300','30281'),source:source('event/champions-meeting/chanmilong-202612'),guideDate:'2026-11-14',scope:'upcoming December CM preview, not completed-event results',expected:expectations(['스테이 골드 강화 계승',['91101351']],['무아몽중 계열',['202421','202422']],['절진 계열',['204431','204432']])},
 {id:'nakayama2500-chaser',label:'나카야마 2500m 추입',courseId:'10506',style:4,outfitId:'105001',supportIds:replace('30300','30278'),source:source('event/champions-meeting/chanmilong-202612'),guideDate:'2026-11-14',scope:'upcoming December CM preview, not completed-event results',expected:expectations(['스테이 골드 강화 계승',['91101351']],['다가오는 그림자 계열',['200641','200642']])},
 {id:'chukyo1200-leader',label:'주쿄 1200m 선행',courseId:'10701',style:2,outfitId:'103801',supportIds:replace('30322','30130'),going:1,weather:1,season:4,source:source('event/champions-meeting/capricorn2023-course-umamusume'),guideDate:'2022-12-24 (2023-01 CM)',scope:'historical guide validates geometry/role only, not 2026 ranking; only Tsubomi is a required anchor',expected:expectations(['꽃봉오리',['900511']]),negative:['900201','900041']},
 {id:'tokyo1600-betweener',label:'도쿄 잔디 1600m 선입',courseId:'10602',style:3,outfitId:'108501',supportIds:replace('30289','30268'),source:source('event/champions-meeting/chanmi-mile-202306'),guideDate:'2023-06',scope:'historical guide validates geometry/role only, not 2026 ranking; native activation aid may replace Anabolic',expected:expectations(['전광석화 계열',['202401','202402']])},
 {id:'tokyo-dirt1600-runner',label:'도쿄 더트 1600m 도주',courseId:'10611',style:1,outfitId:'108001',supportIds:replace('30322','30277'),going:3,weather:4,season:4,source:source('event/champions-meeting/aquarius2023-course-umamusume'),guideDate:'2023-01-26 (2023-02 CM)',scope:'historical guide validates geometry/role only, not 2026 ranking',expected:expectations(['앵글링',['900201']]),negative:['900591']}
];

async function execute(c){
 const input={scenarioId:'15',bloom:5,uniqueLevel:6,going:1,weather:2,season:3,time:2,...Object.fromEntries(['courseId','style','outfitId','supportIds','going','weather','season'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]))};
 const task=prepareChart(data,profiles,display,input),chart={setup:task.setup,nativeIds:task.nativeIds,rows:task.rows.filter(r=>r.rarity!=='evolution'),evolutionOptions:task.rows.filter(r=>r.rarity==='evolution')};
 const records=buildChartCandidates(data,task.setup),rules=selectionRules(data,records),compiled=new Map([...records].map(([id,s])=>[id,compileChartSkill(s,task.setup)]));
 let reported=Date.now();
 const plan=await recommendTargetAcceleration(data,chart,{onProgress:p=>{if(Date.now()-reported>15000){console.log('PROGRESS',c.id,p.stage,p.completed,p.total);reported=Date.now();}}});
 const all=[...task.nativeIds,...plan.ids];
 const sameFamily=(a,b)=>a===b||data.relations.some(r=>r.kind==='version_family'&&[r.from_id,r.to_id].includes(a)&&[r.from_id,r.to_id].includes(b))||data.evolution_rules.some(r=>[r.base_id,r.evolved_id].includes(a)&&[r.base_id,r.evolved_id].includes(b));
 const family=(ids)=>new Set([...records.keys()].filter(id=>ids.some(other=>sameFamily(id,other))));
 const events=new EventConstraints(data,task.setup);
 const comparison=createPositionComparison(task.setup,compiled,task.nativeIds);
 const prices=new RecordedPurchaseModel(data,task.rows,Object.fromEntries([...records.keys()].map(id=>[id,'5'])));
 const legal=ids=>ids.every((id,i)=>ids.slice(0,i).every(other=>rules.compatible(id,other)))&&ids.filter(id=>records.get(id)?.inherited).length<=6&&scenarioSelectionAllowed(data,ids,task.setup.scenarioId)&&events.selection(ids)!==null;
 const evaluate=ids=>{
  ids=[...new Set([...task.nativeIds,...ids])];if(!legal(ids))return null;
  const eventExamples=comparison.ranks.flatMap(rank=>comparison.run(ids,0,.01,rank).events.map(e=>({rank,id:e.id,index:e.index,x:e.x,t:e.t,duration:e.duration})));
  const score=comparison.compare(ids,24,.01),cost=prices.selection(ids).used;
  return {ids:ids.filter(id=>!task.nativeIds.includes(id)),...score,cost,score:cost===null?null:score.gain-cost*(plan.efficiencyPolicy?.minGainPer100Sp||0)/100,eventExamples};
 };
 const comparisons=c.expected.map(e=>{
  const equivalents=family(e.ids),matched=all.filter(id=>equivalents.has(id)||e.ids.includes(id)),available=[...equivalents];
  const candidates=available.map(id=>({id,name:data.skills[id]?.name_jp,status:compiled.get(id)?.status,price:prices.selection([id]),solo:task.rows.find(r=>r.id===id)?task.evaluate(task.rows.find(r=>r.id===id)).gain:null}));
  let counterfactual=null,bestOneSwap=null;
  if(!matched.length){
   const best=candidates.filter(s=>['supported','assumed'].includes(s.status)).sort((a,b)=>b.solo-a.solo)[0];
   if(best){
    counterfactual=evaluate([...plan.ids.filter(id=>rules.compatible(id,best.id)),best.id]);
    bestOneSwap=plan.ids.map(removed=>({removed,result:evaluate([...plan.ids.filter(id=>id!==removed&&rules.compatible(id,best.id)),best.id])})).filter(s=>s.result).sort((a,b)=>b.result.gain-a.result.gain)[0]||null;
   }
  }
  return {...e,matched,available,candidates,counterfactual,bestOneSwap};
 });
 const negatives=(c.negative||[]).map(id=>({id,name:data.skills[id]?.name_jp,selected:all.includes(id),available:records.has(id),status:compiled.get(id)?.status,solo:task.rows.find(r=>r.id===id)?task.evaluate(task.rows.find(r=>r.id===id)).gain:null}));
 const trace=evaluate(plan.ids);
 if(Math.abs(trace.gain-plan.gain)>1e-8||trace.cost!==plan.cost)throw new Error('Published target score is inconsistent with its selected skills');
 return {case:c,input,setup:task.setup,native:task.nativeIds.map(id=>({id,name:data.skills[id].name_jp})),plan,comparisons,negatives,firstSampleEvents:trace.eventExamples,structuralChecks:{legalFamiliesEventsAndLimits:legal(all),priceComplete:prices.selection(all).complete,inheritedCount:plan.skills.filter(s=>s.inherited).length,scenarioEvolutionCount:plan.scenarioEvolutionCount},allExpectedMatched:comparisons.every(e=>e.matched.length>0)};
}

const requested=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
let selected=requested?cases.filter(c=>c.id===requested):costBridge?cases.filter(c=>c.expected.some(e=>e.ids.some(id=>id.startsWith('9110')))):cases;
const partition=process.argv.find(arg=>arg.startsWith('--partition='))?.slice('--partition='.length);
if(partition){const [index,count]=partition.split('/').map(Number);if(!Number.isInteger(index)||!Number.isInteger(count)||index<0||index>=count)throw new Error('Invalid partition');selected=selected.filter((_,i)=>i%count===index);}
if(!selected.length)throw new Error('Unknown case');
const outputDirectory=TARGET_ACCELERATION_VERSION==='cm-target-acceleration-v1'?'docs/validation/cm-acceleration-external-20261117':`docs/validation/cm-acceleration-${TARGET_ACCELERATION_VERSION.replace('cm-target-acceleration-','')}-20261117`;
mkdirSync(resolve(root,outputDirectory),{recursive:true});
for(const c of selected){
 console.log('START',c.id);const started=Date.now(),result=await execute(c);
 const out={auditedAt:'2026-11-17',dataVersion:manifest.active_version,codeBaseCommit,sourceHashes,controlledExperiment:costBridge?'IN-MEMORY ONLY: upgraded inheritance uses original verified 200 SP price stage':null,method:'prepareChart inputs + production recommendTargetAcceleration defaults; no display Top10 scoring required',elapsedSeconds:(Date.now()-started)/1000,...result};
 writeFileSync(resolve(root,outputDirectory,c.id+(costBridge?'.cost-bridge':'')+'.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({id:c.id,seconds:out.elapsedSeconds,ids:result.plan.skills.map(s=>s.name),gain:result.plan.gain,cost:result.plan.cost,expected:result.comparisons.map(e=>({name:e.name,matched:e.matched,candidates:e.candidates.map(x=>({id:x.id,solo:x.solo})),counterfactual:e.counterfactual&&{gain:e.counterfactual.gain,cost:e.counterfactual.cost}})),negatives:result.negatives}));
}
