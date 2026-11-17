// Equations and explicit approximations: pinned umasim SkillData/SkillChecker,
// documented in CM_SELF_EFFECTS_QA.md. Raw source records are never rewritten.
const neutral=new Set(['vision','lane_change_speed','lane_position','ignore_popularity','invoke_group']);
export const supportedScale=code=>[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,19,20,22,23,24,25,26,27,28,30,31,32,34,35,36,37,40,41,42].includes(code);
export const supportedDuration=code=>[0,1,2,3,4,5,7,8].includes(code);
export function selfEffectSkill(skill){
 const notes=new Set();
 const invocations=skill.invocations.flatMap(inv=>{
  let ownNeutral=false;
  const effects=inv.effects.filter(effect=>{
   if(effect.extras_raw?.target&&effect.extras_raw.target!==1){notes.add('상대 대상 효과 제외');return false;}
   if(neutral.has(effect.kind)){ownNeutral=true;notes.add('시야·레인 효과는 단독 직진 주행에서 직접 마신0으로 계산');return false;}
   return true;
  });
  if(!effects.length&&ownNeutral)effects.push({kind:'model_neutral',value_raw:0,source_type:0,unit:'umatools_raw',extras_raw:{}});
  if(!effects.length)return [];
  for(const effect of effects){
   const code=effect.extras_raw?.value_scale||effect.extras_raw?.special||0;
   if([3,4,5,6,7,10,11,12,19,20,24,25,26,27,28,30,31,32,34,35,37].includes(code))notes.add(`외부 효과량 조건 ${code}: 공개 시뮬레이터의 충족 가정`);
   if([40,41].includes(code))notes.add(`시나리오 보너스 ${code}: 공개 시뮬레이터의 조건 충족 배율 1.2 적용`);
   if(effect.extras_raw?.additional_activation)notes.add('효과 중 추가 발동·추월은 공개 시뮬레이터의 즉시 근사');
  }
  if([2,4,5].includes(inv.time_scale_raw))notes.add('외부 지속시간 조건은 공개 시뮬레이터의 고정 근사');
  return [{...inv,effects}];
 });
 return {...skill,invocations,cmSelfEffects:true,calculationNotes:[...notes]};
}
const tier=(value,thresholds,levels)=>levels[thresholds.filter(n=>value>=n).length];
export function effectValue(effect,{setup,physics,state,q=.5}){
 let value=effect.value;
 switch(effect.scale||0){
  case 2:value*=Math.min(1.2,1+.01*state.selected.size);break;
  case 3:case 4:case 5:case 6:case 7:case 10:case 12:case 24:case 26:case 27:case 28:case 31:case 32:case 37:value*=1.2;break;
  case 8:case 9:value*=q<.6?0:q<.9?.02:.04;break;
  case 11:value*=1.1;break;
  case 13:value*=tier(Math.max(...Object.values(setup.stats)),[600,800,1000,1100],[.8,.9,1,1.1,1.2]);break;
  case 14:value*=tier(state.passiveCount,[3,5,6],[0,1,2,3]);break;
  case 19:value+=.1;break;
  case 20:case 30:value*=3;break;
  case 22:value*=tier(physics.modified.speed,[1700,1800,1900,2000],[0,1,2,3,4]);break;
  case 23:value*=tier(physics.modified.speed,[1400,1600],[1,2,3]);break;
  case 25:value*=1.8;break;
  case 34:value+=.2;break;
  case 35:value+=setup.course.distance_type===2?.1:setup.course.distance===2500&&String(setup.course.track_id)==='10005'?.2:0;break;
  case 36:if(setup.course.distance_type===3)value=.65;break;
  case 40:case 41:value*=1.2;break;
  case 42:if([2,3].includes(setup.course.distance_type))value+=.05;break;
 }
 if([1,2].includes(effect.additional))value*=2;
 return value;
}
export function effectDuration(inv,{setup,state}){
 let duration=inv.duration;
 switch(inv.durationScale||0){
  case 2:duration*=1.6;break;
  case 3:duration*=tier(state.hp,[2000,2400,2600,2800,3000,3200,3500],[1,1.5,2,2.2,2.5,3,3.5,4]);break;
  case 4:duration+=2*setup.course.distance/1000;break;
  case 5:duration*=3;break;
  case 7:duration*=tier(state.hp,[1500,1800,2000,2100],[1,1.5,2,2.5,3]);break;
  case 8:{const last=setup.course.corners.at(-1)?.start??Infinity,count=Math.min(4,setup.course.slopes.filter(s=>s.slope>0&&s.start+s.length<last).length);duration+=count*.5*setup.course.distance/1000;break;}
 }
 return duration*(inv.evolution?state.evolutionDuration:1);
}
