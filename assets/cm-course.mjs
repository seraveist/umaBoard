export function courseSegments(course){
 const points=[...new Set([0,course.distance,...course.corners.flatMap(c=>[c.start,c.start+c.length]),...course.straights.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b);
 return points.slice(0,-1).map((start,i)=>{
  const end=points[i+1],mid=(start+end)/2,corner=course.corners.findIndex(c=>mid>=c.start&&mid<c.start+c.length),straight=course.straights.findIndex(s=>mid>=s.start&&mid<s.end);
  const number=((corner-course.corners.length+4)%4+4)%4+1;
  return {start,end,kind:corner>=0?'corner':straight>=0?'straight':'unknown',label:corner>=0?(corner===course.corners.length-1?'최종 코너':`${number}코너`):straight>=0?(straight===course.straights.length-1?'최종 직선':'직선'):'–'};
 });
}
export function elevationProfile(course){
 const points=[...new Set([0,course.distance,...course.slopes.flatMap(s=>[s.start,s.start+s.length])])].sort((a,b)=>a-b),profile=[[0,0]];
 for(let i=1;i<points.length;i++){
  const lo=points[i-1],hi=points[i],slope=course.slopes.find(s=>(lo+hi)/2>=s.start&&(lo+hi)/2<s.start+s.length)?.slope||0;
  profile.push([hi,profile.at(-1)[1]+(hi-lo)*slope/10000]);
 }
 return profile;
}
export function courseSvg(course){
 const x=m=>18+m/course.distance*864,profile=elevationProfile(course),heights=profile.map(p=>p[1]),min=Math.min(...heights),range=Math.max(...heights)-min;
 const y=h=>range?78-(h-min)/range*35:65;
 const path=profile.map(([m,h],i)=>`${i?'L':'M'}${x(m).toFixed(2)} ${y(h).toFixed(2)}`).join(' ');
 let svg='<svg viewBox="0 0 900 216" aria-hidden="true"><text x="18" y="19" class="course-end">START</text><text x="882" y="19" text-anchor="end" class="course-end">GOAL</text>';
 svg+=`<path d="${path} L882 88 L18 88 Z" class="course-elevation"/><path d="${path}" class="course-profile"/>`;
 const phases=[{start:0,end:course.distance/6,label:'초반',color:'#4b8db0'},{start:course.distance/6,end:course.distance*2/3,label:'중반',color:'#31916e'},{start:course.distance*2/3,end:course.distance*5/6,label:'종반',color:'#bd7625'},{start:course.distance*5/6,end:course.distance,label:'최종반',color:'#ac5571'}];
 for(const p of phases)svg+=`<rect x="${x(p.start)}" y="92" width="${x(p.end)-x(p.start)}" height="32" fill="${p.color}"/><text x="${x((p.start+p.end)/2)}" y="113" text-anchor="middle" class="course-phase">${p.label}</text>`;
 for(const p of phases.slice(1))svg+=`<line x1="${x(p.start)}" x2="${x(p.start)}" y1="31" y2="124" class="course-phase-boundary"/><text x="${x(p.start)}" y="28" text-anchor="middle" class="course-distance">${Math.floor(p.start)}</text>`;
 const segments=courseSegments(course);
 for(const s of segments){const lo=x(s.start),hi=x(s.end);svg+=`<rect x="${lo}" y="151" width="${hi-lo}" height="29" class="course-segment ${s.kind}"/><text x="${(lo+hi)/2}" y="170" text-anchor="middle" class="course-segment-label">${s.label}</text>`;}
 const boundaries=[...new Set(segments.flatMap(s=>[s.start,s.end]))];
 boundaries.forEach((m,i)=>{const labelY=i%2?211:141;svg+=`<line x1="${x(m)}" x2="${x(m)}" y1="${i%2?180:145}" y2="${i%2?198:151}" class="course-segment-tick"/><text x="${x(m)}" y="${labelY}" text-anchor="${i===0?'start':i===boundaries.length-1?'end':'middle'}" class="course-distance">${Math.round(m)}</text>`;});
 return svg+'</svg>';
}
