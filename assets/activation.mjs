import {phaseAt,STAT_KEYS,uniqueLevel,uniqueMultiplier} from './physics.mjs';
import {evaluateCondition} from './candidates.mjs';
const compare=(a,op,b)=>({'==':a===b,'!=':a!==b,'>':a>b,'>=':a>=b,'<':a<b,'<=':a<=b})[op]??false;
const OPPONENT=new Set(['order','order_rate','is_overtake','change_order_onetime','blocked_side_continuetime','blocked_front_continuetime','blocked_front','distance_diff_top','bashin_diff_behind','bashin_diff_infront','overtake_target_time','infront_near_lane_time','behind_near_lane_time','near_count','near_infront_count','is_move_lane','is_behind_in','is_surrounded','lane_type','popularity','post_number','distance_diff_top_float','distance_diff_rate','order_rate_out40_continue','order_rate_in20_continue','order_rate_out50_continue','order_rate_in50_continue','order_rate_out20_continue','order_rate_in40_continue','order_rate_out70_continue','order_rate_in80_continue','overtake_target_no_order_up_time','compete_fight_count']);
const DYNAMIC=new Set(['accumulatetime','hp_per','is_lastspurt','lastspurt','is_activate_other_skill_detail','is_used_skill_id','is_exist_skill_id','activate_count_all','activate_count_start','activate_count_middle','activate_count_end_after','activate_count_later_half','activate_count_heal','activate_count_param_skill','is_badstart','is_goodstart','temptation_count','is_temptation']);
const SPATIAL=new Set(['phase','phase_random','phase_firsthalf','phase_firsthalf_random','phase_laterhalf','phase_laterhalf_random','phase_firstquarter','phase_firstquarter_random','phase_corner_random','phase_straight_random','phase_latter_half_straight_random','phase_first_half_straight_random','distance_rate','remain_distance','distance_rate_after_random','corner','corner_random','all_corner_random','is_finalcorner','is_finalcorner_laterhalf','is_finalcorner_random','is_last_straight','is_last_straight_onetime','last_straight_random','straight_random','straight_front_type','slope','up_slope_random','down_slope_random']);
const SUPPORTED_EFFECTS=new Set(['target_speed','current_speed','speed_with_decel','acceleration','heal','passive_speed','passive_stamina','passive_power','passive_guts','passive_wisdom','passive_all']);
const phaseBounds=(d,p)=>[[0,d/6],[d/6,2*d/3],[2*d/3,5*d/6],[5*d/6,d]][p];
export function fixedContext(setup){
 const c=setup.course;
 return {course_distance:c.distance,distance_type:c.distance_type,ground_type:c.surface,track_id:Number(c.track_id),rotation:c.turn,
  ground_condition:setup.going,running_style:setup.style,season:setup.season,weather:setup.weather,time:setup.time,motivation:setup.mood+3,
  grade:100,is_basis_distance:Number(c.distance%400===0),is_abroad:Number(Number(c.track_id)>=10201),
  is_dirtgrade:Number(['10101','10103','10104','10105'].includes(c.track_id)),corner_count:c.corners.length,always:1,
  ...Object.fromEntries(STAT_KEYS.map((key,i)=>[['base_speed','base_stamina','base_power','base_guts','base_wiz'][i],setup.stats[key]]))};
}
function courseState(c,x){
 const corners=c.corners,at=corners.findIndex(k=>x>=k.start&&x<k.start+k.length),last=corners.at(-1);
 const straight=c.straights.find(k=>x>=k.start&&x<k.end),finalStraight=c.straights.at(-1);
 const slope=c.slopes.find(k=>x>=k.start&&x<k.start+k.length)?.slope||0;
 return {phase:phaseAt(x,c.distance),distance_rate:x/c.distance*100,remain_distance:Math.floor(c.distance-x),
  corner:at<0?0:((at-corners.length+4)%4+4)%4+1,
  is_finalcorner:Number(!!last&&x>=last.start),is_finalcorner_laterhalf:Number(!!last&&x>=last.start+last.length/2&&x<last.start+last.length),
  is_last_straight:Number(!!finalStraight&&x>=finalStraight.start&&x<finalStraight.end),
  straight_front_type:straight?.frontType||0,slope:slope>0?1:slope<0?2:0};
}
function spatialValue(atom,c,x,state){
 const f=atom.field,n=atom.value;
 if(f in state)return state[f];
 if(f==='distance_rate_after_random')return x>=c.distance*n/100?n:-1;
 if(f==='is_last_straight_onetime'||f==='last_straight_random')return state.is_last_straight;
 if(f==='is_finalcorner_random')return Number(!!c.corners.at(-1)&&x>=c.corners.at(-1).start&&x<c.corners.at(-1).start+c.corners.at(-1).length);
 if(f==='all_corner_random')return Number(state.corner!==0);
 if(f==='corner_random')return state.corner;
 if(f==='straight_random')return Number(c.straights.some(s=>x>=s.start&&x<s.end));
 if(f==='up_slope_random')return Number(state.slope===1);
 if(f==='down_slope_random')return Number(state.slope===2);
 if(f.startsWith('phase_')){
  const b=phaseBounds(c.distance,n);if(!b)return -1;
  let [lo,hi]=b;
  if(/firsthalf|first_half/.test(f))hi=(lo+hi)/2;
  if(/laterhalf|latter_half/.test(f))lo=(lo+hi)/2;
  if(/firstquarter/.test(f))hi=lo+(hi-lo)/4;
  const match=x>=lo&&x<hi&&(!f.includes('corner')||state.corner!==0)&&(!f.includes('straight')||c.straights.some(s=>x>=s.start&&x<s.end));
  return match?n:-1;
 }
 return undefined;
}
function boundaries(c,dnf){
 const d=c.distance,points=new Set([0,d/6,d/2,2*d/3,5*d/6,d]);
 for(const k of c.corners){points.add(k.start);points.add(k.start+k.length/2);points.add(k.start+k.length);}
 for(const k of c.straights){points.add(k.start);points.add(k.end);}
 for(const k of c.slopes){points.add(k.start);points.add(k.start+k.length);}
 for(const group of dnf||[])for(const a of group){
  if(['distance_rate','distance_rate_after_random'].includes(a.field))points.add(d*a.value/100);
  if(a.field==='remain_distance'){points.add(d-a.value);points.add(d-a.value-1);}
  if(a.field.startsWith('phase_')){const b=phaseBounds(d,a.value);if(b){points.add((b[0]+b[1])/2);points.add(b[0]+(b[1]-b[0])/4);}}
 }
 return [...points].filter(x=>x>=0&&x<=d).sort((a,b)=>a-b);
}
function feasibleOrder(group){
 return Array.from({length:9},(_,i)=>i+1).some(order=>group.filter(a=>['order','order_rate'].includes(a.field)).every(a=>compare(a.field==='order'?order:Math.round(order/9*100),a.operator,a.value)));
}
function compileCondition(dnf,setup){
 if(dnf===null)return {unsupported:['조건 구문'],branches:[]};
 const fixed=fixedContext(setup),points=boundaries(setup.course,dnf),branches=[],unsupported=[];
 for(const group of dnf.length?dnf:[[]]){
  if(evaluateCondition([group],fixed)===false||!feasibleOrder(group))continue;
  const unknown=group.filter(a=>!(a.field in fixed)&&!SPATIAL.has(a.field)&&!DYNAMIC.has(a.field)&&!OPPONENT.has(a.field));
  if(unknown.length){unsupported.push(...unknown.map(a=>a.field));continue;}
  const spatial=group.filter(a=>SPATIAL.has(a.field)),windows=[];
  for(let k=0;k<points.length-1;k++){
   const lo=points[k],hi=points[k+1],x=(lo+hi)/2,state=courseState(setup.course,x);
   if(spatial.every(a=>compare(spatialValue(a,setup.course,x,state),a.operator,a.value))){
    if(windows.at(-1)?.[1]===lo)windows.at(-1)[1]=hi;else windows.push([lo,hi]);
   }
  }
  if(!windows.length)continue;
  branches.push({windows,dynamic:group.filter(a=>DYNAMIC.has(a.field)),assumed:group.filter(a=>OPPONENT.has(a.field)).map(a=>a.field),
   random:group.some(a=>a.field.includes('random'))||group.some(a=>OPPONENT.has(a.field)&&!['order','order_rate','popularity','post_number','lane_type','is_behind_in'].includes(a.field))});
 }
 return {branches,unsupported};
}
export function compileSkill(skill,setup){
 const reasons=[],invocations=[];
 for(const inv of skill.invocations){
  const condition=compileCondition(inv.condition,setup),precondition=compileCondition(inv.precondition,setup);
  if(!condition.branches.length&&!condition.unsupported.length||!precondition.branches.length&&!precondition.unsupported.length)continue;
  reasons.push(...condition.unsupported,...precondition.unsupported);
  if(inv.time_scale_raw)reasons.push('가변 지속시간');
  if(inv.cooldown_raw>0)reasons.push('반복 발동');
  const effects=inv.effects.map(e=>{
   const extras=e.extras_raw||{};
   if(!SUPPORTED_EFFECTS.has(e.kind))reasons.push(`효과 ${e.source_type}`);
   if(extras.target&&extras.target!==1)reasons.push('다른 주자 대상 효과');
   if(extras.value_scale&&extras.value_scale!==1||extras.special>1)reasons.push('가변 효과량');
   if(extras.additional_activation||extras.additional)reasons.push('추가 효과');
   if(!['umatools_raw','umasim_raw'].includes(e.unit))reasons.push('효과 단위');
   let value=e.value_raw/10000;
   if(['unique','unique_low_star','unique_upgraded'].includes(skill.rarity))value*=uniqueMultiplier(e.kind,uniqueLevel(setup.bloom));
   return {kind:e.kind,value};
  });
  let duration;
  if(inv.duration_unit==='umatools_base_time')duration=inv.duration_raw<0?Infinity:inv.duration_raw/10000*setup.course.distance/1000;
  else if(inv.duration_unit==='umasim_seconds_at_base_distance')duration=inv.duration_raw<0?Infinity:inv.duration_raw*setup.course.distance/1000;
  else reasons.push('지속시간 단위');
  const passive=effects.every(e=>e.kind.startsWith('passive_'));
  if(effects.some(e=>e.kind.startsWith('passive_'))&&(!passive||condition.branches.some(b=>b.dynamic.length||b.random||b.windows[0]?.[0]!==0)))reasons.push('주행 중 능력치 변경');
  invocations.push({index:inv.index,condition:condition.branches,precondition:precondition.branches,effects,duration,passive,
   linked:(inv.condition||[]).flat().some(a=>['is_activate_other_skill_detail','is_used_skill_id'].includes(a.field))});
 }
 const assumed=[...new Set(invocations.flatMap(i=>[...i.condition,...i.precondition].flatMap(b=>b.assumed)))];
 return {id:skill.id,skill,invocations,reasons:[...new Set(reasons)],assumed,
  status:reasons.length?'unsupported':invocations.length?assumed.length?'assumed':'supported':'inactive'};
}
export function sampleBranches(branches,q,pre=false){
 return branches.map(b=>{
  const length=b.windows.reduce((sum,[lo,hi])=>sum+hi-lo,0);let offset=length*q;
  let at=b.windows[0]?.[0]??Infinity;
  if(b.random&&!pre)for(const[lo,hi]of b.windows){if(offset<=hi-lo){at=Math.min(hi-1e-5,lo+offset);break;}offset-=hi-lo;}
  return {...b,at};
 });
}
export function branchReady(branch,state,skillId){
 if(state.x+1e-6<branch.at||!branch.windows.some(([lo,hi])=>state.x+1e-6>=lo&&(state.prevX??state.x)<hi))return false;
 return branch.dynamic.every(a=>{
  let value;
  switch(a.field){
   case 'accumulatetime':value=state.t;break;
   case 'hp_per':value=100*state.hp/state.hpMax;break;
   case 'is_lastspurt':value=Number(state.phase>=2);break;
   case 'lastspurt':value=state.phase>=2?2:3;break;
   case 'is_activate_other_skill_detail':value=Number(state.used.has(skillId));break;
   case 'is_used_skill_id':value=state.used.has(String(a.value))?a.value:0;break;
   case 'is_exist_skill_id':value=state.selected.has(String(a.value))?a.value:0;break;
   case 'activate_count_all':value=state.counts.reduce((a,b)=>a+b,0);break;
   case 'activate_count_start':value=state.counts[0];break;
   case 'activate_count_middle':value=state.counts[1];break;
   case 'activate_count_end_after':value=state.counts[2]+state.counts[3];break;
   case 'activate_count_later_half':value=state.laterCount;break;
   case 'activate_count_heal':value=state.healCount;break;
   case 'activate_count_param_skill':value=state.passiveCount;break;
   case 'is_badstart':value=1;break;
   case 'is_goodstart':case 'temptation_count':case 'is_temptation':value=0;break;
  }
  return compare(value,a.operator,a.value);
 });
}
export const slopeAt=(course,x)=>(course.slopes.find(k=>x>=k.start&&x<k.start+k.length)?.slope||0)/10000;
