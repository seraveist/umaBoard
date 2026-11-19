// Public HP/spurt model (alpha HpPolicy / umasim calcSpurtParameter), expressed
// as a distance budget. Future heals and opponent consumption are not presumed.
export const SPURT_POLICY='hp-adaptive-v1';
export function planSpurt(distance,position,hp,physics,choice=.5){
 const remaining=Math.max(0,distance-position),charged=Math.max(0,remaining-60);
 const cruise=physics.lateCruise,max=physics.spurt;
 const cost=v=>physics.consumption(v,2)/v;
 const hpShortfall=Math.max(0,charged*cost(max)-hp);
 if(hpShortfall===0)return {start:position,speed:max,maximum:true,hpShortfall};
 if(hp<=charged*cost(cruise))return {start:distance,speed:cruise,maximum:false,hpShortfall};
 const candidates=[];
 for(let speed=Math.ceil(cruise*10)/10;speed<max;speed+=.1){
  const extra=cost(speed)-cost(cruise);
  if(extra<=0)continue;
  const sprint=Math.min(remaining,Math.max(0,(hp-charged*cost(cruise))/extra+60));
  const start=distance-sprint,time=(start-position)/cruise+sprint/speed;
  candidates.push({start,speed,maximum:false,hpShortfall,time});
 }
 if(!candidates.length)return {start:distance,speed:cruise,maximum:false,hpShortfall};
 candidates.sort((a,b)=>a.time-b.time||b.speed-a.speed);
 const acceptance=Math.min(1,.15+.0005*physics.modified.wisdom);
 const index=acceptance===1?0:Math.min(candidates.length-1,Math.floor(Math.log1p(-choice)/Math.log1p(-acceptance)));
 return candidates[index];
}
