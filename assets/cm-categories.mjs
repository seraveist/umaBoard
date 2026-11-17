// Categories follow the game's display icon, including mixed-effect icons.
export const SKILL_CATEGORIES=Object.freeze([
 {id:'all',label:'전체'},
 {id:'passive',label:'능력치',icon:'10011'},
 {id:'speed',label:'속도',icon:'20011'},
 {id:'heal',label:'회복',icon:'20021'},
 {id:'acceleration',label:'가속',icon:'20041'},
 {id:'other',label:'복합·기타',icon:'20141'}
]);
export function skillCategory(row){
 const family=String(row.iconId||'').slice(0,-1);
 if(family.startsWith('100'))return 'passive';
 if(family==='2001')return 'speed';
 if(family==='2002')return 'heal';
 if(family==='2004')return 'acceleration';
 if(family)return 'other';
 const categories=row.categories||[];
 if(categories.length===1&&['passive','speed','heal','acceleration'].includes(categories[0]))return categories[0];
 return 'other';
}
export const categoryRows=(rows,category)=>category==='all'?rows:rows.filter(row=>skillCategory(row)===category);
