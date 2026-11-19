import {planSpurt,SPURT_POLICY} from './spurt-planning.mjs';
import {buildPhysics,phaseAt} from './physics.mjs';
import {sampleBranches,branchReady,slopeAt,compare} from './activation.mjs';
import {effectValue,effectDuration} from './cm-effect-policy.mjs';
import {advanceRankHistory,advanceFrontBlock} from './race-sampling.mjs';
import {activationFrame} from './race-frame.mjs';

// Paired single-runner trajectories. CM uses the explicit HP-adaptive policy;
// callers without it retain the legacy forced-spurt projection.
export function simulateSolo(setup,compiledSkills,q=.5,{dt=.1,failHeals=false,branchSampler=null,keepTrace=true,fullSpurt=false,scheduleConditions=true,diagnostics=false}={}){
 const d=setup.course.distance,selected=new Set([...compiledSkills.map(s=>s.id),...(setup.possessionIds||[])]);
 const sampled=!!branchSampler?.unit,draw=(id,channel)=>branchSampler?.unit?.(id,channel)??q;
 const eligible=compiledSkills.filter(s=>!s.probabilistic||draw(s.id,'activation')<(s.activationProbability??1));
 const pending=eligible.slice().sort((a,b)=>a.id.localeCompare(b.id)).flatMap(s=>s.invocations.map(i=>({...i,id:s.id,preMet:false,done:false,nextTime:0,
  condition:branchSampler?branchSampler(i.condition,s.id,i,false,q):sampleBranches(i.condition,q),
  precondition:branchSampler?branchSampler(i.precondition,s.id,i,true,q):sampleBranches(i.precondition,q,true)})));
 const passive={speed:0,stamina:0,power:0,guts:0,wisdom:0},used=new Set(),counts=[0,0,0,0],events=[],active=[],cooldowns=new Map(),accelerationUseSeconds={};
 const state={x:0,prevX:0,t:0,phase:0,hp:1,hpMax:1,used,usedInvocations:new Set(),selected,counts,laterCount:0,healCount:0,passiveCount:0,distance:d,fullSpurtStart:null,evolutionDuration:1};
 const context=setup.raceContext||{},startDelay=sampled?.1*draw('race','start-delay'):.1;
 state.startDelay=startDelay;state.raceContext=context;
 state.finalCornerStart=setup.course.corners.at(-1)?.start;
 state.dt=dt;
 const rankBands=new Map();
 if(context.coherentRanks)for(const invocation of pending){
  for(const branch of [...invocation.condition,...invocation.precondition])for(const atom of branch.external||[]){
   const match=/^order_rate_(in|out)(\d+)_continue$/.exec(atom.field);
   if(match)rankBands.set(atom.field,{inside:match[1]==='in',threshold:Math.round(9*Number(match[2])/100)});
  }
 }
 const blockWindows=context.encounterWindows?.blocked_front;
 const timeFrontBlock=blockWindows?.length&&pending.some(i=>[...i.condition,...i.precondition].some(b=>b.external?.some(a=>a.field==='blocked_front_continuetime')));
 state.rankBands=rankBands;
 state.postNumber=context.postNumber??(sampled?1+Math.floor(9*draw('race','post-number')):undefined);
 state.popularity=context.popularity??(sampled?1+Math.floor(9*draw('race','popularity')):undefined);
 state.inheritedCount=setup.inheritanceOrigins?new Set([...selected].filter(id=>Object.hasOwn(setup.inheritanceOrigins,id)).map(id=>setup.inheritanceOrigins[id])).size:compiledSkills.filter(s=>s.skill?.inherited).length;
 let physics=buildPhysics(setup,passive);
 const choice=i=>i.condition[0]?.choiceQ??q;
 // Passives are resolved at the start, including skill-possession predicates.
 const passives=pending.filter(i=>i.passive);
 const readyAtStart=i=>i.precondition.some(b=>branchReady(b,state,i.id))&&i.condition.some(b=>branchReady(b,state,i.id));
 // The eligible course-specific passive unlocks popularity gates even on
 // other passives whose skill IDs sort before its own.
 state.ignorePopularity=passives.some(i=>i.effects.some(e=>e.kind==='ignore_popularity')&&readyAtStart(i));
 for(const i of passives){
  if(used.has(i.id))continue;
  if(!readyAtStart(i))continue;
  for(const e of i.effects){const value=effectValue(e,{setup,physics,state,q:choice(i)});if(e.kind==='oonige')passive.oonige=true;else if(e.kind==='passive_all')for(const key of ['speed','stamina','power','guts','wisdom'])passive[key]+=value;else if(e.kind.startsWith('passive_'))passive[e.kind.slice(8)]+=value;}
  i.done=!i.effects.some(e=>['start_multiplier','start_offset'].includes(e.kind));i.passiveApplied=true;used.add(i.id);state.usedInvocations.add(`${i.id}:${i.index}`);counts[0]++;if(i.effects.some(e=>e.kind.startsWith('passive_')||e.kind==='temptation_rate'))state.passiveCount++;
  if(i.done)events.push({id:i.id,index:i.index,x:0,t:0,duration:null});
 }
 physics=buildPhysics(setup,passive);
 state.hp=state.hpMax=physics.hpMax;
 let velocity=3,currentOffset=0,entry=null,reach=null,legStart=null,staminaFight=false,depletion=null,fullSpurtStarted=false,fullSpurtSpeed=0;
 const adaptive=setup.spurtPolicy===SPURT_POLICY;let spurtPlan=null,maxSpurtAtEntry=null,entryHpShortfall=0,peakHpDebt=0;
 const updateSpurt=()=>{
  if(!adaptive||state.phase<2)return;
  spurtPlan=planSpurt(d,state.x,state.hp,physics,draw('race',`spurt-choice:${state.healCount}`));
  if(maxSpurtAtEntry===null){maxSpurtAtEntry=spurtPlan.maximum;entryHpShortfall=spurtPlan.hpShortfall;}
  state.lastSpurtActive=state.x>=spurtPlan.start&&state.hp>0;state.maximumSpurt=state.lastSpurtActive&&spurtPlan.maximum;
 };
 if(adaptive){state.lastSpurtActive=false;state.maximumSpurt=false;}
 const positions=[0],trace=[],diagnosticFrames=diagnostics?[]:null;
 // Both compared trajectories share the sampled race start delay.
 let delay=startDelay;
 const keyFor=i=>i.linked?`${i.id}:${i.index}`:i.id;
 let effectsChanged=false,nextExpiry=Infinity;
 let targetBonus=0,accelerationBonus=0,fullSpurtBonus=0;
 const accelerationById=new Map(),fullSpurtEffects=[];
 const fire=(i,forced=false,stack=new Set())=>{
  if(stack.has(i.id))return;
  stack=new Set([...stack,i.id]);
  i.done=!i.cooldownSeconds;i.nextTime=state.t+(i.cooldownSeconds||0);cooldowns.set(keyFor(i),i.nextTime);
  const frame=activationFrame(state,d),resolved=diagnostics?[]:null;
  used.add(i.id);state.usedInvocations.add(`${i.id}:${i.index}`);if(!i.passiveApplied){counts[frame.phase]++;if(frame.laterHalf)state.laterCount++;}
  const duration=effectDuration(i,{setup,state}),random=choice(i);
  for(const raw of i.effects){
   if(raw.kind.startsWith('passive_')||['oonige','model_neutral','temptation_rate'].includes(raw.kind))continue;
   let value=effectValue(raw,{setup,physics,state,q:random});if(raw.wisdomBoost)value*=physics.wisdomSpeedMultiplier(frame.phase);
   if(diagnostics)resolved.push({kind:raw.kind,value});
   if(raw.kind==='start_multiplier'){delay*=value;continue;}
   if(raw.kind==='start_offset'){delay+=value;continue;}
   if(raw.kind==='evolution_duration'){state.evolutionDuration=Math.max(state.evolutionDuration,value);continue;}
   if(['invoke_rare','invoke_unique'].includes(raw.kind))continue;
   if(raw.kind==='heal'){
    if(value>0){if(failHeals)continue;state.healCount++;}
    state.hp=Math.min(state.hpMax,state.hp+state.hpMax*value);updateSpurt();
   }else{
    if(raw.kind==='speed_with_decel')velocity+=value;
    active.push({...raw,value,id:i.id,end:state.t+duration});effectsChanged=true;
   }
  }
  events.push({id:i.id,index:i.index,x:state.x,frameStartX:frame.startX,activationPhase:frame.phase,physicsPhase:state.phase,t:state.t,duration:Number.isFinite(duration)?duration:null,...(forced?{forced:true}:{}),...(diagnostics?{effects:resolved}:{} )});
  for(const effect of i.effects.filter(e=>['invoke_rare','invoke_unique'].includes(e.kind))){
   const rare=effect.kind==='invoke_rare',count=Math.floor(effectValue(effect,{setup,physics,state,q:random}));
   const eligible=compiledSkills.filter(s=>s.id!==i.id&&!stack.has(s.id)&&(rare?['gold','evolution'].includes(s.skill.rarity)&&!used.has(s.id):['unique','unique_low_star','unique_upgraded'].includes(s.skill.rarity))).sort((a,b)=>a.id.localeCompare(b.id));
   const offset=Math.min(eligible.length-1,Math.floor(random*eligible.length));
   for(let n=0;n<Math.min(count,eligible.length);n++){
    const target=eligible[(offset+n)%eligible.length],first=target.forcedInvocation||target.invocations[0];if(!first||first.passive)continue;
    fire({...first,id:target.id,condition:sampleBranches(first.condition,random),precondition:sampleBranches(first.precondition,random,true)},true,stack);
    for(const natural of pending)if(natural.id===target.id&&!natural.linked){natural.done=!natural.cooldownSeconds;natural.nextTime=state.t+(natural.cooldownSeconds||0);}
   }
  }
 };
 for(const i of pending)if(!i.done&&i.effects.some(e=>['start_multiplier','start_offset'].includes(e.kind))&&i.precondition.some(b=>branchReady(b,state,i.id))&&i.condition.some(b=>branchReady(b,state,i.id)))fire(i);
 delay=Math.max(0,delay);state.startDelay=delay;
 for(const effect of active)nextExpiry=Math.min(nextExpiry,effect.end);
 // Distance-scheduled conditions avoid checking every future invocation on
 // every integration frame. Dynamic gates stay awake while their window holds.
 const awake=[],sleepers=[];
 // Schedule lower bounds only. branchReady still evaluates the original predicates
 // on the original movement endpoints, including a frame crossing several boundaries.
 const wakeRules=new WeakMap();
 const wakeRule=branch=>{
  if(wakeRules.has(branch))return wakeRules.get(branch);
  let earliest=branch.at;
  for(const atom of branch.dynamic){
   const full=atom.field==='run_at_full_speed_random';
   if(!full&&atom.field!=='is_lastspurt'&&atom.field!=='lastspurt')continue;
   if(!compare(atom.field==='lastspurt'?3:0,atom.operator,atom.value)){
    earliest=full&&(!fullSpurt||!physics.fullSpurtEligible)?Infinity:Math.max(earliest,2*d/3);
   }
  }
  const rankChange=context.coherentRanks&&context.rankTimeline?.length&&branch.external?.some(atom=>
   (atom.field==='change_order_onetime'||atom.field==='is_overtake')&&!context.encounterWindows?.[atom.field]&&
   !Object.hasOwn(context.conditions||{},atom.field)&&!compare(0,atom.operator,atom.value));
  const rule={earliest,rankChange,startEnd:branch.frameStartWindows?branch.frameStartWindows.reduce((end,w)=>Math.max(end,w[1]),-Infinity):Infinity};
  wakeRules.set(branch,rule);return rule;
 };
 const nextWindow=inv=>{
  const branches=inv.preMet?inv.condition:inv.precondition;
  if(inv.wakeBranches===branches&&state.prevX<inv.wakeUntil)return inv.wakeAt;
  let next=Infinity,until=Infinity;
  for(const branch of branches){
   const rule=wakeRule(branch);
   let earliest=rule.earliest,end=rule.startEnd;
   if(rule.rankChange){
    const change=context.rankTimeline.find(point=>point.distance>state.prevX)?.distance??Infinity;
    earliest=Math.max(earliest,change);end=Math.min(end,change);
   }
   for(const [lo,hi] of branch.windows){
    const expires=Math.min(hi,end),at=Math.max(lo,earliest);
    if(state.prevX>=expires)continue;
    if(at<next){next=at;until=expires;}
    else if(at===next)until=Math.max(until,expires);
   }
  }
  inv.wakeBranches=branches;inv.wakeUntil=until;inv.wakeAt=next;return next;
 };
 const schedule=(inv,x)=>{
  if(!Number.isFinite(x))return;
  let lo=0,hi=sleepers.length;while(lo<hi){const mid=(lo+hi)>>>1;if(sleepers[mid].x<=x)lo=mid+1;else hi=mid;}
  sleepers.splice(lo,0,{inv,x});
 };
 pending.forEach((inv,index)=>{inv.order=index;if(!inv.done&&!inv.passive){inv.preMet=inv.precondition.some(b=>branchReady(b,state,inv.id));if(scheduleConditions)schedule(inv,nextWindow(inv));else awake.push(inv);}});
 // Snapshot once per frame so skill ID order cannot satisfy a trigger in the same tick.
 const slopeBoundaries=[...new Set(setup.course.slopes.flatMap(s=>[s.start,s.start+s.length]))].sort((a,b)=>a-b);
 const courseScale=Math.pow(d/1000,1.5);
 const flatAccel=[],hillAccel=[];
 for(let phase=0;phase<4;phase++){
  flatAccel.push(physics.acceleration(phase,false));hillAccel.push(physics.acceleration(phase,true));
 }
 let slope=slopeAt(setup.course,0),slopeIndex=0;
 let previousEvents=0,previousHeals=0;
 for(let frame=0;state.x<d&&frame<100000;frame++){
  const t=frame*dt;state.t=t;state.phase=phaseAt(state.x,d);
  const eventStart=events.length;
  state.previousFrameActivated=eventStart>previousEvents;
  state.previousFrameHealed=state.healCount>previousHeals;
  previousEvents=eventStart;previousHeals=state.healCount;
  if(rankBands.size)advanceRankHistory(state);
  if(timeFrontBlock)advanceFrontBlock(state,blockWindows);
  if(adaptive&&state.phase>=2){if(!spurtPlan)updateSpurt();state.lastSpurtActive=state.x>=spurtPlan.start&&state.hp>0;state.maximumSpurt=state.lastSpurtActive&&spurtPlan.maximum;}
  if(t+1e-8>=nextExpiry){
   for(let k=active.length-1;k>=0;k--)if(t+1e-8>=active[k].end)active.splice(k,1);
   effectsChanged=true;
  }
  let added=false;
  while(sleepers.length&&sleepers[0].x<=state.x+1e-6){awake.push(sleepers.shift().inv);added=true;}
  if(added)awake.sort((a,b)=>a.order-b.order);
  for(let index=0;index<awake.length;){
   const i=awake[index];
   if(i.done){awake.splice(index,1);continue;}
   if(cooldowns.has(keyFor(i))&&(!i.cooldownSeconds||t<=cooldowns.get(keyFor(i))+1e-8)){index++;continue;}
   if(!i.preMet)i.preMet=i.precondition.some(b=>branchReady(b,state,i.id));
   const wake=scheduleConditions?nextWindow(i):0;
   if(scheduleConditions&&(!Number.isFinite(wake)||wake>state.x+1e-6)){awake.splice(index,1);schedule(i,wake);continue;}
   if(i.preMet&&i.condition.some(b=>branchReady(b,state,i.id)))fire(i);
   if(i.done)awake.splice(index,1);else index++;
  }
  // Re-sum in original activation order only when the active list changes.
  if(effectsChanged){
   nextExpiry=Infinity;targetBonus=0;accelerationBonus=0;fullSpurtBonus=0;currentOffset=0;
   accelerationById.clear();fullSpurtEffects.length=0;
   for(const effect of active){
    nextExpiry=Math.min(nextExpiry,effect.end);
    if(effect.kind==='target_speed'||effect.kind==='speed_with_decel')targetBonus+=effect.value;
    else if(effect.kind==='current_speed')currentOffset+=effect.value;
    else if(effect.kind==='acceleration'){
     accelerationBonus+=effect.value;
     if(effect.value>0)accelerationById.set(effect.id,(accelerationById.get(effect.id)||0)+effect.value);
    }else if(effect.kind==='full_spurt_acceleration'){
     fullSpurtBonus+=effect.value/10;
     if(effect.value>0)fullSpurtEffects.push(effect);
    }
   }
   effectsChanged=false;
  }
  if(slopeIndex<slopeBoundaries.length&&state.x>=slopeBoundaries[slopeIndex]){
   do{slopeIndex++;}while(slopeIndex<slopeBoundaries.length&&state.x>=slopeBoundaries[slopeIndex]);
   slope=slopeAt(setup.course,state.x);
  }
  const uphill=slope>0;
  if(state.phase>=2&&legStart===null)legStart=t;
  const baseTarget=adaptive&&state.phase>=2?(state.hp<=0?physics.minSpeed:state.lastSpurtActive?spurtPlan.speed:physics.lateCruise):physics.target(state.phase);
  let target=baseTarget+targetBonus-(uphill?slope*200/physics.modified.power:0);
  if(state.phase>=2&&velocity+currentOffset>=physics.spurt-1e-6)staminaFight=true;
  if(staminaFight)target+=physics.staminaSpeed;
  const startDash=state.x<d/6&&velocity<.85*physics.bs;
  if(startDash)target=.85*physics.bs;
  if(keepTrace&&frame%2===0&&state.x>=2*d/3-120&&(legStart===null||t-legStart<=12.2))trace.push({t,x:state.x,v:velocity+currentOffset+fullSpurtSpeed,target});
  const leg=legStart!==null&&t-legStart<physics.legDuration?physics.legAccel:0;
  const baseAcceleration=(uphill?hillAccel:flatAccel)[state.phase],acceleration=baseAcceleration+accelerationBonus+leg+(startDash?24:0);
  if(entry===null&&state.phase>=2)entry={x:state.x,t,speed:velocity+currentOffset,target,targetGap:Math.max(0,target-velocity-currentOffset)};
  if(entry&&reach===null&&velocity+currentOffset>=target-1e-5)reach={x:state.x,t};
  let next=velocity;
  if(t>=delay){
   next=velocity<target?Math.min(target,velocity+Math.max(0,acceleration)*dt):Math.max(target,velocity-[1.2,.8,1,1][state.phase]*dt);
   if(!startDash)next=Math.max(physics.minSpeed,next);
   next=Math.min(30,next);
  }
  // Test the entire effect lifetime, including pre-phase acceleration that
  // remains active after the phase boundary. No skill/course exclusions.
  if(t>=delay&&velocity<target&&accelerationBonus>0){
   for(const [id,value]of accelerationById){let without=Math.min(target,velocity+Math.max(0,acceleration-value)*dt);if(!startDash)without=Math.max(physics.minSpeed,without);without=Math.min(30,without);if(next>without+1e-9)accelerationUseSeconds[id]=(accelerationUseSeconds[id]||0)+dt;}
  }
  if(fullSpurt&&physics.fullSpurtEligible&&state.phase>=2&&(!adaptive||state.maximumSpurt)&&velocity>=physics.spurt-1e-6){fullSpurtStarted=true;if(state.fullSpurtStart===null)state.fullSpurtStart=state.x;}
  // Public umasim approximation: independent extra acceleration; its ceiling is
  // unknown in the source. This mode is explicit and versioned by the CM chart.
  const fullAcceleration=.068*baseAcceleration/courseScale+fullSpurtBonus;
  const nextFull=fullSpurtStarted&&(!adaptive||state.hp>0)?fullSpurtSpeed+Math.max(0,fullAcceleration)*dt:0;
  if(diagnostics){
   const observed={t,x:state.x,phase:state.phase,baseVelocity:velocity,target,baseTarget,targetBonus,currentOffset,fullSpurtSpeed,
    baseAcceleration,skillAcceleration:accelerationBonus,legAcceleration:leg,slope,hp:state.hp,
    lastSpurt:state.lastSpurtActive??state.phase>=2,spurtStart:spurtPlan?.start??null,spurtSpeed:spurtPlan?.speed??physics.spurt,
    nextVelocity:next,fullSpurtAcceleration:fullSpurtStarted?fullAcceleration:0};
   diagnosticFrames.push(observed);
   for(let k=eventStart;k<events.length;k++)events[k].observation={...observed,targetGap:Math.max(0,target-velocity)};
  }
  if(nextFull>fullSpurtSpeed)for(const effect of fullSpurtEffects)accelerationUseSeconds[effect.id]=(accelerationUseSeconds[effect.id]||0)+dt;
  const speed=t<delay?0:Math.max(0,(velocity+next)/2+currentOffset+(fullSpurtSpeed+nextFull)/2),step=speed*dt;
  const fraction=step>0?Math.min(1,(d-state.x)/step):1;
  state.hp-=physics.consumption(speed,state.phase)*dt*fraction;
  if(state.hp<0){
   peakHpDebt=Math.max(peakHpDebt,-state.hp);
   if(depletion===null)depletion=state.x+step*fraction;
  }
  state.prevX=state.x;state.x=Math.min(d,state.x+step);positions.push(state.x);velocity=next;fullSpurtSpeed=nextFull;
  if(state.x>=d){
   return {status:'ok',distance:d,dt,positions,finishTime:t+dt*fraction,entry,reach,
    hpMax:state.hpMax,hpRemaining:state.hp,minHpDepletion:depletion,entryHpShortfall,peakHpDebt,hpShortfall:Math.max(entryHpShortfall,peakHpDebt),fullSpeedFeasible:depletion===null&&(!adaptive||maxSpurtAtEntry===true),spurtPlan,maxSpurtAtEntry,spurtPolicy:adaptive?SPURT_POLICY:'forced-projection',
    events,passive,trace,accelerationUseSeconds,activation:{eligibleIds:eligible.map(s=>s.id),startDelay,postNumber:state.postNumber,popularity:state.popularity},triggerCounts:{inPhase:[...counts],laterHalf:state.laterCount},
    ...(diagnostics?{diagnostics:{frames:diagnosticFrames,interpretation:'observed-computation-state-not-an-independent-reference'}}:{}),
    fullSpurtExcluded:!fullSpurt&&physics.fullSpurtExcluded,fullSpurtApproximation:fullSpurt&&fullSpurtStarted,physics:{spurt:physics.spurt,staminaSpeed:physics.staminaSpeed,legAccel:physics.legAccel,modified:physics.modified}};
  }
 }
 throw new Error('단독 비교 계산이 수렴하지 않았습니다.');
}
