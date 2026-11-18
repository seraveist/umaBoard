// Half-open spatial intervals, with explicit one-crossing boundary events.
// A zero-length event is not a small invented distance window.
export function intersectWindows(left,right){
 const result=[];
 for(const [a,b]of left)for(const [c,d]of right){
  const lo=Math.max(a,c),hi=Math.min(b,d);
  if(lo<hi||a===b&&c<=a&&a<d||c===d&&a<=c&&c<b||a===b&&c===d&&a===c)result.push([lo,hi]);
 }
 return result.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
export const containsPosition=(windows,x)=>windows.some(([lo,hi])=>x>=lo&&x<hi);
export function windowCrossed(windows,previous,current){
 return windows.some(([lo,hi])=>lo===hi?previous<lo&&current>=lo:current>=lo&&previous<hi);
}
export function randomWindow(areas,q,endGuard=2){
 const length=areas.reduce((sum,[lo,hi])=>sum+hi-lo,0);let offset=length*q;
 for(const [lo,hi]of areas){
  // The pinned reference's generic random-area draw keeps its start at most
  // areaEnd - 2m. This is separate from the 10m opportunity's clipped end.
  if(offset<=hi-lo){const at=Math.max(lo,Math.min(hi-endGuard,lo+offset));return {at,window:[at,Math.min(hi,at+10)]};}offset-=hi-lo;
 }
 return {at:Infinity,window:[Infinity,Infinity]};
}
