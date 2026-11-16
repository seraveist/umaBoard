import {buildPhysics,phaseAt} from './physics.mjs';
import {sampleBranches,branchReady,slopeAt} from './activation.mjs';
import {effectValue,effectDuration} from './cm-effect-policy.mjs';

// A single-runner comparison with a full-speed spurt from 2/3. HP is a separate
// feasibility projection: we do not manufacture a late/reduced spurt decision.
export function simulateSolo(setup,compiledSkills,q=.5,{dt=.1,failHeals=false,branchSampler=null,keepTrace=true,fullSpurt=false}={}){
 const d=setup.course.distance,selected=new Set(compiledSkills.map(s=>s.id));
 const pending=compiledSkills.slice().sort((a,b)=>a.id.localeCompare(b.id)).flatMap(s=>s.invocations.map(i=>({...i,id:s.id,preMet:false,done:false,nextTime:0,
  condition:branchSampler?branchSampler(i.condition,s.id,i,false,q):sampleBranches(i.condition,q),
  precondition:branchSampler?branchSampler(i.precondition,s.id,i,true,q):sampleBranches(i.precondition,q,true)})));
 const passive={speed:0,stamina:0,power:0,guts:0,wisdom:0},used=new Set(),counts=[0,0,0,0],events=[],active=[],cooldowns=new Map();
 const state={x:0,prevX:0,t:0,phase:0,hp:1,hpMax:1,used,selected,counts,laterCount:0,healCount:0,passiveCount:0,distance:d,fullSpurtStart:null,evolutionDuration:1};
 let physics=buildPhysics(setup,passive);
 const choice=i=>i.condition[0]?.choiceQ??q;
 // Passives are resolved at the start, including skill-possession predicates.
 for(const i of pending.filter(i=>i.passive)){
  if(used.has(i.id))continue;
  if(!i.precondition.some(b=>branchReady(b,state,i.id))||!i.condition.some(b=>branchReady(b,state,i.id)))continue;
  for(const e of i.effects){const value=effectValue(e,{setup,physics,state,q:choice(i)});if(e.kind==='oonige')passive.oonige=true;else if(e.kind==='passive_all')for(const key of ['speed','stamina','power','guts','wisdom'])passive[key]+=value;else if(e.kind.startsWith('passive_'))passive[e.kind.slice(8)]+=value;}
  i.done=!i.effects.some(e=>['start_multiplier','start_offset'].includes(e.kind));i.passiveApplied=true;used.add(i.id);counts[0]++;if(i.effects.some(e=>e.kind.startsWith('passive_')||e.kind==='temptation_rate'))state.passiveCount++;
  if(i.done)events.push({id:i.id,index:i.index,x:0,t:0,duration:null});
 }
 physics=buildPhysics(setup,passive);
 state.hp=state.hpMax=physics.hpMax;
 let velocity=3,currentOffset=0,entry=null,reach=null,legStart=null,staminaFight=false,depletion=null,fullSpurtStarted=false,fullSpurtSpeed=0;
 const positions=[0],trace=[];
 // A fixed 0.1s gate delay is shared between the compared trajectories.
 let delay=.1;
 const keyFor=i=>i.linked?`${i.id}:${i.index}`:i.id;
 const fire=(i,forced=false,stack=new Set())=>{
  if(stack.has(i.id))return;
  stack=new Set([...stack,i.id]);
  i.done=!i.cooldownSeconds;i.nextTime=state.t+(i.cooldownSeconds||0);cooldowns.set(keyFor(i),i.nextTime);
  used.add(i.id);if(!i.passiveApplied){counts[state.phase]++;if(state.x>=d/2)state.laterCount++;}
  const duration=effectDuration(i,{setup,state}),random=choice(i);
  for(const raw of i.effects){
   if(raw.kind.startsWith('passive_')||['oonige','model_neutral','temptation_rate'].includes(raw.kind))continue;
   let value=effectValue(raw,{setup,physics,state,q:random});if(raw.wisdomBoost)value*=physics.wisdomSpeedMultiplier(state.phase);
   if(raw.kind==='start_multiplier'){delay*=value;continue;}
   if(raw.kind==='start_offset'){delay+=value;continue;}
   if(raw.kind==='evolution_duration'){state.evolutionDuration=Math.max(state.evolutionDuration,value);continue;}
   if(['invoke_rare','invoke_unique'].includes(raw.kind))continue;
   if(raw.kind==='heal'){
    if(value>0){state.healCount++;if(failHeals)continue;}
    state.hp=Math.min(state.hpMax,state.hp+state.hpMax*value);
   }else{
    if(raw.kind==='speed_with_decel')velocity+=value;
    active.push({...raw,value,id:i.id,end:state.t+duration});
   }
  }
  events.push({id:i.id,index:i.index,x:state.x,t:state.t,duration:Number.isFinite(duration)?duration:null,...(forced?{forced:true}:{})});
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
 delay=Math.max(0,delay);
 for(let frame=0;state.x<d&&frame<100000;frame++){
  const t=frame*dt;state.t=t;state.phase=phaseAt(state.x,d);
  for(let k=active.length-1;k>=0;k--)if(t+1e-8>=active[k].end)active.splice(k,1);
  // Exclusive alternatives activate once; explicitly linked effects can follow.
  for(const i of pending){
   if(i.done||i.passive||cooldowns.has(keyFor(i))&&(!i.cooldownSeconds||t<=cooldowns.get(keyFor(i))+1e-8))continue;
   if(!i.preMet)i.preMet=i.precondition.some(b=>branchReady(b,state,i.id));
   if(!i.preMet||!i.condition.some(b=>branchReady(b,state,i.id)))continue;
   fire(i);
  }
  const targetBonus=active.reduce((sum,e)=>sum+(['target_speed','speed_with_decel'].includes(e.kind)?e.value:0),0);
  currentOffset=active.reduce((sum,e)=>sum+(e.kind==='current_speed'?e.value:0),0);
  const accelerationBonus=active.reduce((sum,e)=>sum+(e.kind==='acceleration'?e.value:0),0);
  const slope=slopeAt(setup.course,state.x),uphill=slope>0;
  if(state.phase>=2&&legStart===null)legStart=t;
  let target=physics.target(state.phase)+targetBonus-(uphill?slope*200/physics.modified.power:0);
  if(state.phase>=2&&velocity+currentOffset>=physics.spurt-1e-6)staminaFight=true;
  if(staminaFight)target+=physics.staminaSpeed;
  const startDash=state.x<d/6&&velocity<.85*physics.bs;
  if(startDash)target=.85*physics.bs;
  if(keepTrace&&frame%2===0&&state.x>=2*d/3-120&&(legStart===null||t-legStart<=12.2))trace.push({t,x:state.x,v:velocity+currentOffset+fullSpurtSpeed,target});
  const leg=legStart!==null&&t-legStart<physics.legDuration?physics.legAccel:0;
  const acceleration=physics.acceleration(state.phase,uphill)+accelerationBonus+leg+(startDash?24:0);
  if(entry===null&&state.phase>=2)entry={x:state.x,t,speed:velocity+currentOffset,target,targetGap:Math.max(0,target-velocity-currentOffset)};
  if(entry&&reach===null&&velocity+currentOffset>=target-1e-5)reach={x:state.x,t};
  let next=velocity;
  if(t>=delay){
   next=velocity<target?Math.min(target,velocity+Math.max(0,acceleration)*dt):Math.max(target,velocity-[1.2,.8,1,1][state.phase]*dt);
   if(!startDash)next=Math.max(physics.minSpeed,next);
   next=Math.min(30,next);
  }
  if(fullSpurt&&setup.stats.speed>2000&&state.phase>=2&&velocity>=physics.spurt-1e-6){fullSpurtStarted=true;if(state.fullSpurtStart===null)state.fullSpurtStart=state.x;}
  // Public umasim approximation: independent extra acceleration; its ceiling is
  // unknown in the source. This mode is explicit and versioned by the CM chart.
  const fullAcceleration=.068*physics.acceleration(state.phase,uphill)/Math.pow(d/1000,1.5)+active.reduce((sum,e)=>sum+(e.kind==='full_spurt_acceleration'?e.value/10:0),0);
  const nextFull=fullSpurtStarted?fullSpurtSpeed+Math.max(0,fullAcceleration)*dt:0;
  const speed=t<delay?0:Math.max(0,(velocity+next)/2+currentOffset+(fullSpurtSpeed+nextFull)/2),step=speed*dt;
  const fraction=step>0?Math.min(1,(d-state.x)/step):1;
  state.hp-=physics.consumption(speed,state.phase)*dt*fraction;
  if(depletion===null&&state.hp<0)depletion=state.x+step*fraction;
  state.prevX=state.x;state.x=Math.min(d,state.x+step);positions.push(state.x);velocity=next;fullSpurtSpeed=nextFull;
  if(state.x>=d){
   return {status:'ok',distance:d,dt,positions,finishTime:t+dt*fraction,entry,reach,
    hpMax:state.hpMax,hpRemaining:state.hp,minHpDepletion:depletion,fullSpeedFeasible:depletion===null,
    events,passive,trace,fullSpurtExcluded:!fullSpurt&&physics.fullSpurtExcluded,fullSpurtApproximation:fullSpurt&&fullSpurtStarted,physics:{spurt:physics.spurt,staminaSpeed:physics.staminaSpeed,legAccel:physics.legAccel,modified:physics.modified}};
  }
 }
 throw new Error('단독 비교 계산이 수렴하지 않았습니다.');
}
