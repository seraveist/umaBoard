// Independently implemented equations. Reference versions and omissions: docs/ENGINE_VALIDATION.md.
export const MODEL_VERSION='solo-comparison-v2';
export const STAT_KEYS=['speed','stamina','power','guts','wisdom'];
const SPEED=[[1,.98,.962],[.978,.991,.975],[.938,.998,.994],[.931,1,1]];
const ACCEL=[[1,1,.996],[.985,1,.996],[.975,1,1],[.945,1,.997]];
const HP_STYLE=[.95,.89,1,.995];
const DISTANCE_SPEED={S:1.05,A:1,B:.9,C:.8,D:.6,E:.4,F:.2,G:.1};
const DISTANCE_ACCEL={S:1,A:1,B:1,C:1,D:1,E:.6,F:.5,G:.4};
const SURFACE_ACCEL={S:1.05,A:1,B:.9,C:.8,D:.7,E:.5,F:.3,G:.1};
const STYLE_WISDOM={S:1.1,A:1,B:.85,C:.75,D:.6,E:.4,F:.2,G:.1};
const LEG_STYLE=[[1,.7,.75,.7],[1,.8,.7,.75],[1,.9,.875,.86],[1,.9,1,.9]];
const LEG_TIME=[.45,1,.875,.8];
const WISDOM_SKILL=[[.26,.23,.19,.16],[.21,.21,.21,.21],[.19,.18,.23,.24],[.15,.17,.25,.27]];
// JP wisdom speed-skill buff uses the mood-adjusted raw stat, not raceStat or style aptitude.
export function wisdomSkillBase(value){
 const n=Math.floor(value);if(n<=1220)return 0;
 let buff=Math.floor((Math.min(n,1401)-1201)/20)*.02;
 if(n>1420)buff+=Math.floor((Math.min(n,1601)-1401)/20)*.06;
 if(n>1620)buff+=Math.floor((Math.min(n,2001)-1601)/20)*.01;
 if(n>2100)buff+=Math.floor((Math.min(n,3101)-2001)/100)*.01;
 return buff;
}
export const baseSpeed=distance=>22-distance/1000;
export const raceStat=value=>value>1200?1200+Math.floor((value-1200)/2):value;
export const phaseAt=(x,d)=>x<d/6?0:x<2*d/3?1:x<5*d/6?2:3;
export const uniqueLevel=bloom=>bloom<3?bloom+3:bloom+1;
export function uniqueMultiplier(kind,level){
 if(kind==='target_speed')return [1,1,1.01,1.04,1.07,1.1,1.13][level];
 if(kind.startsWith('passive_'))return 1+.01*(level-1);
 return 1+.02*(level-1);
}
export function validateSetup(setup){
 if(!setup.course?.selectable)throw new Error('선택할 수 없는 코스입니다.');
 if(setup.course.run_up_m||Number(setup.course.track_id)>=10202)throw new Error('미국 코스의 출발 좌표 보정은 검증 중입니다.');
 if(![1,2,3,4].includes(setup.style))throw new Error('각질을 확인하세요.');
 if(![1,2,3,4].includes(setup.going))throw new Error('마장 상태를 확인하세요.');
 if(![-2,-1,0,1,2].includes(setup.mood))throw new Error('의욕을 확인하세요.');
 for(const key of STAT_KEYS)if(!Number.isInteger(setup.stats[key])||setup.stats[key]<1||setup.stats[key]>3000)throw new Error('목표 능력치는 1~3000 사이의 정수로 입력하세요.');
 for(const key of ['distance','surface','style'])if(!(setup.aptitudes[key] in DISTANCE_SPEED))throw new Error('적성을 확인하세요.');
}
export function buildPhysics(setup,passive={}){
 const {course,stats,style,going,mood,aptitudes}=setup,coeff=1+.02*mood;
 const checks=course.course_set_status||[];
 const courseBonus=1+checks.reduce((sum,index)=>sum+(stats[STAT_KEYS[index-1]]*coeff<=300?.05:stats[STAT_KEYS[index-1]]*coeff<=600?.1:stats[STAT_KEYS[index-1]]*coeff<=900?.15:.2),0)/Math.max(checks.length,1);
 const powerPenalty=course.surface===1?(going===1?0:-50):[0,-100,-50,-100,-100][going];
 const modified=Object.fromEntries(STAT_KEYS.map(key=>[key,Math.max(1,Math.floor(raceStat(stats[key])*coeff*(key==='speed'?courseBonus:key==='wisdom'?STYLE_WISDOM[aptitudes.style]:1)+(passive[key]||0)+(key==='speed'&&going===4?-50:key==='power'?powerPenalty:0)))]));
 const bs=baseSpeed(course.distance),ds=DISTANCE_SPEED[aptitudes.distance],lateAdd=Math.sqrt(modified.speed/500)*ds;
 const spurt=(bs*(SPEED[style-1][2]+.01)+lateAdd)*1.05+lateAdd+Math.pow(450*modified.guts,.597)*.0001;
 const rawPower=stats.power+(passive.power||0),rawStamina=stats.stamina+(passive.stamina||0);
 const legAccel=rawPower>1200?Math.sqrt((rawPower-1200)*130)*.001*LEG_STYLE[course.distance_type-1][style-1]:0;
 const staminaDistance=course.distance<=2100?0:course.distance<=2200?.5:course.distance<=2400?1:course.distance<=2600?1.5:1.8;
 return {modified,bs,spurt,minSpeed:.85*bs+Math.sqrt(200*modified.guts)*.001,
  hpMax:course.distance+.8*modified.stamina*HP_STYLE[style-1],
  legAccel,legDuration:3*LEG_TIME[course.distance_type-1],
  staminaSpeed:rawStamina>1200?Math.sqrt(rawStamina-1200)*.0085*staminaDistance:0,
  // Keep the entered speed in the ordinary equations; never clamp it to 2000.
  // Full-spurt's additional speed ceiling is still unverified and is excluded explicitly.
  fullSpurtExcluded:stats.speed>2000||stats.speed*coeff+(passive.speed||0)>2000,
  wisdomSpeedMultiplier(phase){return 1+wisdomSkillBase(stats.wisdom*coeff+(passive.wisdom||0))*WISDOM_SKILL[style-1][phase];},
  target(phase){return phase>=2?spurt:bs*SPEED[style-1][phase];},
  acceleration(phase,uphill){return (uphill?.0004:.0006)*Math.sqrt(500*modified.power)*ACCEL[style-1][Math.min(phase,2)]*SURFACE_ACCEL[aptitudes.surface]*DISTANCE_ACCEL[aptitudes.distance];},
  consumption(speed,phase){return 20*(speed-bs+12)**2/144*(course.surface===1?(going>=3?1.02:1):going===3?1.01:going===4?1.02:1)*(phase>=2?1+200/Math.sqrt(600*modified.guts):1);}
 };
}
export function positionAt(run,time){
 if(time<=0)return 0;
 if(time>=run.finishTime)return run.distance;
 const index=Math.min(Math.floor(time/run.dt),run.positions.length-2),span=Math.min(run.dt,run.finishTime-index*run.dt),fraction=(time-index*run.dt)/span;
 return run.positions[index]+(run.positions[index+1]-run.positions[index])*fraction;
}
export function lengthsBetween(better,reference){
 // Compare positions at the first finisher's time; neither trajectory is extrapolated beyond the line.
 const time=Math.min(better.finishTime,reference.finishTime);
 return (positionAt(better,time)-positionAt(reference,time))/2.5;
}
