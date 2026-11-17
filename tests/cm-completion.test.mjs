import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortChartRows} from '../assets/cm-chart.mjs';
import {buildAcquisitionHierarchy,updateAcquisition,checklistSnapshot} from '../assets/cm-state.mjs';

const read=file=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const data=read(read('data/manifest.json').dataset_path),display=read('curated/cm-skill-display.json');
const rows=sortChartRows(Object.values(data.skills).map(skill=>({...skill,name:skill.name_jp})),data,display);
const hierarchy=buildAcquisitionHierarchy(data),prerequisites=new Map(),branches=new Map();
const link=(high,low)=>{
 if(!low||!data.skills[high]||!data.skills[low]||data.skills[high].inherited||data.skills[low].inherited)return;
 if(!prerequisites.has(high))prerequisites.set(high,new Set());prerequisites.get(high).add(low);
};
for(const [id,stage]of Object.entries(data.purchase_stages))if(stage.status==='verified')link(id,stage.prerequisite_id);
for(const rule of data.evolution_rules){
 if(data.skills[rule.evolved_id]?.rarity!=='evolution')continue;
 link(rule.evolved_id,rule.base_id);
 if(!branches.has(rule.base_id))branches.set(rule.base_id,new Set());branches.get(rule.base_id).add(rule.evolved_id);
}
// Expected purchases come directly from the source contract, independently of
// the runtime hierarchy traversal and its display/group metadata.
function expectedChain(id,path=[]){
 assert.ok(!path.includes(id),`source prerequisite cycle: ${[...path,id].join(' -> ')}`);
 return [...new Set([id,...[...prerequisites.get(id)||[]].flatMap(low=>expectedChain(low,[...path,id]))])];
}
const chains=[...prerequisites.keys()].map(id=>expectedChain(id));
const alternatives=[...branches].filter(([,ids])=>ids.size>1);
const pairs=alternatives.flatMap(([base,ids])=>[...ids].flatMap(a=>[...ids].filter(b=>b!==a).map(b=>({base,a,b}))));

test(`all ${rows.length} JP records retain contiguous families, descending rarity and stable indentation`,()=>{
 assert.equal(new Set(rows.map(row=>row.id)).size,Object.keys(data.skills).length);
 assert.deepEqual(sortChartRows([...rows].reverse(),data,display).map(row=>[row.id,row.indentLevel]),rows.map(row=>[row.id,row.indentLevel]));
 const tier=row=>row.inherited?0:row.rarity==='evolution'?2:row.rarity==='gold'?1:0;
 const groups=Map.groupBy(rows,row=>row.groupId),byId=new Map(rows.map((row,index)=>[row.id,{...row,index}]));
 for(const group of groups.values()){
  const tiers=[...new Set(group.map(tier))].sort((a,b)=>b-a);
  for(let i=0;i<group.length;i++){
   const row=group[i];assert.equal(row.indentLevel,row.inherited?0:tiers.indexOf(tier(row)),row.id);
   if(i){assert.ok(tier(group[i-1])>=tier(row),row.groupId);assert.equal(byId.get(row.id).index,byId.get(group[i-1].id).index+1);}
  }
 }
 for(const [high,lows]of prerequisites)for(const low of lows){
  const upper=byId.get(high),lower=byId.get(low);assert.equal(upper.groupId,lower.groupId,`${high} -> ${low}`);
  if(tier(upper)>tier(lower))assert.ok(upper.index<lower.index,`${high} must precede ${low}`);
 }
});

test(`all ${chains.length} real JP upper chains acquire their lowers and clear from the bottom`,()=>{
 for(const chain of chains){
  const high=chain[0],states=updateAcquisition(rows,{},high,'owned',hierarchy);
  for(const id of chain)assert.equal(states[id],'owned',`${high} -> ${id}`);
  const leaf=chain.find(id=>!prerequisites.get(id)?.size);assert.ok(leaf,high);
  const cleared=updateAcquisition(rows,states,leaf,'unavailable',hierarchy);
  assert.equal(cleared[high],'unavailable',`${leaf} must clear ${high}`);
  const hinted=updateAcquisition(rows,{},high,'5',hierarchy);
  for(const low of chain.slice(1))assert.notEqual(hinted[low],'owned',`${high}: hint alone purchased ${low}`);
  assert.deepEqual(checklistSnapshot(rows,states,hierarchy),checklistSnapshot(rows,checklistSnapshot(rows,states,hierarchy),hierarchy));
 }
});

test(`all ${pairs.length} ordered evolution switches preserve the common lower chain and one chosen branch`,()=>{
 for(const {base,a,b}of pairs){
  const first=updateAcquisition(rows,{},a,'owned',hierarchy),switched=updateAcquisition(rows,first,b,'owned',hierarchy);
  assert.equal(switched[b],'owned',`${a} -> ${b}`);
  for(const sibling of branches.get(base))if(sibling!==b)assert.equal(switched[sibling],'unavailable',`${b} vs ${sibling}`);
  for(const low of expectedChain(base))assert.equal(switched[low],'owned',`${b} -> ${low}`);
  const restored=checklistSnapshot(rows,JSON.parse(JSON.stringify(switched)),hierarchy);
  assert.equal(restored[b],'owned');assert.equal(restored[a],'unavailable');
  const cleared=updateAcquisition(rows,switched,base,'unavailable',hierarchy);
  for(const sibling of branches.get(base))assert.equal(cleared[sibling],'unavailable',`${base} -> ${sibling}`);
 }
});
