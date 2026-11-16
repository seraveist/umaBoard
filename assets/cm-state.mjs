// Acquisition is deliberately independent from the simulation's selected skills.
import {INHERITED_LIMIT} from './cm-recommendation.mjs';
export const ACQUISITION_OPTIONS=Object.freeze([
 {value:'owned',label:'습득'}, {value:'unavailable',label:'미획득'},
 ...Array.from({length:6},(_,level)=>({value:String(level),label:`Lv${level}`}))
]);
export const validAcquisition=value=>ACQUISITION_OPTIONS.some(option=>option.value===String(value));
export const acquisitionValue=value=>validAcquisition(value)?String(value):'unavailable';
// Branch ownership is row-specific: buying one evolution must not mark every
// alternative as purchased. evolutionBaseId remains separate pricing metadata.
export const acquisitionId=row=>row.id;
export function checklistSnapshot(rows,states={}){
 return Object.fromEntries(rows.map(row=>[row.id,acquisitionValue(states[acquisitionId(row)])]));
}
export function checklistCounts(rows,states={}){
 const values=rows.map(row=>acquisitionValue(states[acquisitionId(row)]));
 return {total:rows.length,available:values.filter(v=>v!=='unavailable').length,owned:values.filter(v=>v==='owned').length};
}
export const inheritedCount=(rows,states={})=>rows.filter(row=>row.inherited&&acquisitionValue(states[row.id])!=='unavailable').length;
export function canRecordAcquisition(rows,states,id,value){
 const row=rows.find(row=>row.id===id);
 if(!row)return false;
 return !row.inherited||acquisitionValue(value)==='unavailable'||acquisitionValue(states[id])!=='unavailable'||inheritedCount(rows,states)<INHERITED_LIMIT;
}
