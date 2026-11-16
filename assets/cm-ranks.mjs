// GameTora's condition viewer converts percentages to rounded field-size ranks:
// order_rate > 50 in CM9 means order > round(9 * .50), i.e. sixth or lower.
const compare=(a,op,b)=>({'==':a===b,'!=':a!==b,'>':a>b,'>=':a>=b,'<':a<b,'<=':a<=b})[op]??false;
export function cmRanks(atoms){
 return Array.from({length:9},(_,i)=>i+1).filter(rank=>atoms.every(a=>{
  if(a.field==='order')return compare(rank,a.operator,a.value);
  if(a.field==='order_rate')return compare(rank,a.operator,Math.round(9*a.value/100));
  const sustained=a.field.match(/^order_rate_(in|out)(\d+)_continue$/);
  if(sustained&&a.value>0&&['>','>=','=='].includes(a.operator))return compare(rank,sustained[1]==='in'?'<=':'>',Math.round(9*Number(sustained[2])/100));
  return true;
 }));
}
