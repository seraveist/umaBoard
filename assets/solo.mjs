import {buildPhysics,phaseAt} from './physics.mjs';
import {sampleBranches,branchReady,slopeAt} from './activation.mjs';

// A single-runner comparison with a full-speed spurt from 2/3. HP is a separate
// feasibility projection: we do not manufacture a late/reduced spurt decision.
export function simulateSolo(setup,compiledSkills,q=.5,{dt=.1,failHeals=false,branchSampler=null,keepTrace=true,fullSpurt=false}={}){
 const d=setup.course.distance,selected=new Set(compiledSkills.map(s=>s.id));
 const pending=compiledSkills.slice().sort((a,b)=>a.id.localeCompare(b.id)).flatMap(s=>s.invocations.map(i=>({...i,id:s.id,preMet:false,done:false,nextTime:0,
  condition:branchSampler?branchSampler(i.condition,s.id,i,false,q):sampleBranches(i.condition,q),
  precondition:branchSampler?branchSampler(i.precondition,s.id,i,true,q):sampleBranches(i.precondition,q,true)})));
 const passive={speed:0,stamina:0,power:0,guts:0,wisdom:0},used=new Set(),counts=[0,0,0,0],events=[],active=[];
 const state={x:0,prevX:0,t:0,phase:0,hp:1,hpMax:1,used,selected,counts,laterCount:0,healCount:0,passiveCount:0};
 // Passives are resolved at the start, including skill-possession predicates.
 for(const i of pending.filter(i=>i.passive)){
  if(used.has(i.id))continue;
  if(!i.precondition.some(b=>branchReady(b,state,i.id))||!i.condition.some(b=>branchReady(b,state,i.id)))continue;
  for(const e of i.effects)if(e.kind==='passive_all')for(const key of Object.keys(passive))passive[key]+=e.value;else passive[e.kind.slice(8)]+=e.value;
  i.done=true;used.add(i.id);counts[0]++;state.passiveCount++;
  events.push({id:i.id,index:i.index,x:0,t:0,duration:null});
 }
 const physics=buildPhysics(setup,passive);
 state.hp=state.hpMax=physics.hpMax;
 let velocity=3,currentOffset=0,entry=null,reach=null,legStart=null,staminaFight=false,depletion=null,fullSpurtStarted=false,fullSpurtSpeed=0;
 const positions=[0],trace=[];
 // A fixed 0.1s gate delay is shared between the compared trajectories.
 const delay=.1;
 for(let frame=0;state.x<d&&frame<100000;frame++){
  const t=frame*dt;state.t=t;state.phase=phaseAt(state.x,d);
  for(let k=active.length-1;k>=0;k--)if(t+1e-8>=active[k].end)active.splice(k,1);
  // Exclusive alternatives activate once; explicitly linked effects can follow.
  for(const i of pending){
   if(i.done||i.passive||i.cooldownSeconds&&used.has(i.id)&&t<=i.nextTime+1e-8||used.has(i.id)&&!i.linked&&!i.cooldownSeconds)continue;
   if(!i.preMet)i.preMet=i.precondition.some(b=>branchReady(b,state,i.id));
   if(!i.preMet||!i.condition.some(b=>branchReady(b,state,i.id)))continue;
   i.done=!i.cooldownSeconds;i.nextTime=t+(i.cooldownSeconds||0);
   used.add(i.id);counts[state.phase]++;if(state.x>=d/2)state.laterCount++;
   for(const rawEffect of i.effects){
    const e=rawEffect.wisdomBoost?{...rawEffect,value:rawEffect.value*physics.wisdomSpeedMultiplier(state.phase)}:rawEffect;
    if(e.kind==='heal'){
     if(e.value>0){state.healCount++;if(failHeals)continue;}
     state.hp=Math.min(state.hpMax,state.hp+state.hpMax*e.value);
    }else{
     if(e.kind==='speed_with_decel')velocity+=e.value;
     active.push({...e,id:i.id,end:t+i.duration});
    }
   }
   events.push({id:i.id,index:i.index,x:state.x,t,duration:Number.isFinite(i.duration)?i.duration:null});
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
  if(fullSpurt&&setup.stats.speed>2000&&state.phase>=2&&velocity>=physics.spurt-1e-6)fullSpurtStarted=true;
  // Public umasim approximation: independent extra acceleration; its ceiling is
  // unknown in the source. This mode is explicit and versioned by the CM chart.
  const nextFull=fullSpurtStarted?fullSpurtSpeed+.068*physics.acceleration(state.phase,uphill)/Math.pow(d/1000,1.5)*dt:0;
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
