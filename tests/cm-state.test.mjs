import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAcquisitionHierarchy,relatedAcquisitionIds,updateAcquisition,checklistSnapshot,inheritedCount,bulkAcquisition,ACQUISITION_OPTIONS} from '../assets/cm-state.mjs';
import {skillRarityLabel} from '../assets/cm-skill-details.mjs';

function fixture(){
 const skills=Object.fromEntries(['white','circle','rare','evoA','evoB','other','unverified'].map(id=>[id,{id,rarity:id.startsWith('evo')?'evolution':'white'}]));
 const data={skills,purchase_stages:{circle:{status:'verified',prerequisite_id:'white'},rare:{status:'verified',prerequisite_id:'circle'},unverified:{status:'unknown',prerequisite_id:'white'}},
  evolution_rules:[{base_id:'rare',evolved_id:'evoA'},{base_id:'rare',evolved_id:'evoB'}],relations:[{from_id:'white',to_id:'other',kind:'version_family'}]};
 const rows=Object.keys(skills).map(id=>({id,groupId:'shared-display-group'}));
 return {data,rows,hierarchy:buildAcquisitionHierarchy(data)};
}

test('acquisition labels distinguish already purchased, available without discount, and discount levels without changing stored values',()=>{
 assert.deepEqual(ACQUISITION_OPTIONS.map(option=>option.label),['습득','미획득','획득','할인 Lv1','할인 Lv2','할인 Lv3','할인 Lv4','할인 Lv5']);
 assert.deepEqual(ACQUISITION_OPTIONS.map(option=>option.value),['owned','unavailable','0','1','2','3','4','5']);
});

test('bulk Lv5 preserves paid history while an explicit whole reset clears records and excludes stale IDs',()=>{
 const {rows,hierarchy}=fixture(),old={white:'owned',rare:'owned',evoA:'owned',other:'4',stale:'owned'};
 const cleared=bulkAcquisition(rows,old,'unavailable');assert.ok(Object.values(cleared).every(value=>value==='unavailable'));assert.ok(!('stale' in cleared));assert.equal(old.evoA,'owned');
 const visible=rows.filter(row=>!row.id.startsWith('evo')),hidden=rows.filter(row=>row.id.startsWith('evo'));
 const recorded=updateAcquisition(rows,old,'evoA','owned',hierarchy);
 const hinted=bulkAcquisition(visible,recorded,'5',hidden);
 for(const id of ['white','circle','rare','evoA'])assert.equal(hinted[id],'owned');
 assert.equal(hinted.other,'5');assert.ok(!('stale' in hinted));assert.ok(!('evoB' in hinted));
 assert.equal(bulkAcquisition(visible,hinted,'unavailable',hidden).evoA,'unavailable');
 assert.throws(()=>bulkAcquisition(rows,old,'owned'));
});

test('bulk discount Lv5 retains secured inherits first and fills only the shared six slots',()=>{
 const rows=Array.from({length:10},(_,i)=>({id:String(i),inherited:true}));rows.unshift({id:'ordinary'});
 const states={'8':'owned','9':'0'},next=bulkAcquisition(rows,states,'5');
 assert.equal(next.ordinary,'5');assert.equal(next['8'],'owned');assert.equal(next['9'],'5');assert.equal(inheritedCount(rows,next),6);
 assert.deepEqual(rows.filter(row=>row.inherited&&next[row.id]!=='unavailable').map(row=>row.id),['0','1','2','3','8','9']);
 assert.equal(inheritedCount(rows,bulkAcquisition(rows,states,'unavailable')),0);
});

test('buying an evolution marks every verified lower stage, without buying its sibling or display peers',()=>{
 const {rows,hierarchy}=fixture(),original={white:'2',circle:'0',other:'4',evoB:'3'};
 const next=updateAcquisition(rows,original,'evoA','owned',hierarchy);
 assert.equal(next.evoA,'owned');assert.equal(next.rare,'owned');assert.equal(next.circle,'owned');assert.equal(next.white,'owned');
 assert.equal(next.evoB,'unavailable');assert.equal(next.other,'4');assert.equal(next.unverified,undefined);assert.equal(original.white,'2');
});

test('switching evolution branches clears the previous branch and keeps their common prerequisite chain',()=>{
 const {rows,hierarchy}=fixture();let states=updateAcquisition(rows,{},'evoA','owned',hierarchy);
 states=updateAcquisition(rows,states,'evoB','owned',hierarchy);
 assert.equal(states.evoA,'unavailable');assert.equal(states.evoB,'owned');
 for(const id of ['rare','circle','white'])assert.equal(states[id],'owned');
 states=updateAcquisition(rows,states,'evoB','unavailable',hierarchy);
 assert.equal(states.evoA,'unavailable');assert.equal(states.rare,'owned');
});

test('a lower unavailable clears all reachable uppers, including hints, across hidden filters and branches',()=>{
 const {rows,hierarchy}=fixture();const states={white:'owned',circle:'owned',rare:'owned',evoA:'owned',evoB:'5',other:'owned'};
 const next=updateAcquisition(rows,states,'white','unavailable',hierarchy);
 for(const id of ['white','circle','rare','evoA','evoB'])assert.equal(next[id],'unavailable');
 assert.equal(next.other,'owned');
});

test('hint levels never purchase lower stages; unbuying a lower stage also unbuys acquired uppers',()=>{
 const {rows,hierarchy}=fixture();let states=updateAcquisition(rows,{},'rare','4',hierarchy);
 assert.equal(states.rare,'4');assert.equal(states.white,undefined);
 states=updateAcquisition(rows,states,'evoA','owned',hierarchy);
 states=updateAcquisition(rows,states,'circle','2',hierarchy);
 assert.equal(states.circle,'2');assert.equal(states.rare,'unavailable');assert.equal(states.evoA,'unavailable');assert.equal(states.white,'owned');
});

test('chains traverse non-displayed intermediates, ignore unverified/family links and stop at cycles',()=>{
 const {data,hierarchy}=fixture(),rows=[{id:'white'},{id:'evoA'}];
 assert.equal(updateAcquisition(rows,{},'evoA','owned',hierarchy).white,'owned');
 assert.equal(updateAcquisition(rows,{evoA:'owned'},'white','unavailable',hierarchy).evoA,'unavailable');
 assert.deepEqual(relatedAcquisitionIds(hierarchy,'unverified'),[]);assert.deepEqual(relatedAcquisitionIds(hierarchy,'other'),[]);
 data.purchase_stages.white={status:'verified',prerequisite_id:'rare'};
 assert.deepEqual(new Set(relatedAcquisitionIds(buildAcquisitionHierarchy(data),'white')),new Set(['rare','circle']));
});

test('old drafts normalize to one evolution, restore lower purchases and drop stale IDs from export',()=>{
 const {rows,hierarchy}=fixture();const snapshot=checklistSnapshot(rows,{evoA:'owned',evoB:'owned',white:'unavailable',stale:'owned'},hierarchy);
 assert.equal(snapshot.evoA,'owned');assert.equal(snapshot.evoB,'unavailable');assert.equal(snapshot.white,'owned');assert.ok(!('stale'in snapshot));
 assert.deepEqual(checklistSnapshot(rows,JSON.parse(JSON.stringify(snapshot)),hierarchy),snapshot);
});

test('linked updates preserve the shared six-slot inheritance limit',()=>{
 const {data,rows}=fixture();for(let i=0;i<7;i++){const id=`inherit${i}`;data.skills[id]={id,inherited:true};rows.push({id,inherited:true});}
 data.purchase_stages.inherit0={status:'verified',prerequisite_id:'white'};
 const hierarchy=buildAcquisitionHierarchy(data);let states={};for(let i=0;i<6;i++)states=updateAcquisition(rows,states,`inherit${i}`,'0',hierarchy);
 assert.equal(inheritedCount(rows,states),6);assert.equal(updateAcquisition(rows,states,'inherit6','owned',hierarchy),states);
 assert.deepEqual(relatedAcquisitionIds(hierarchy,'inherit0'),[]);
 states=updateAcquisition(rows,states,'inherit0','unavailable',hierarchy);states=updateAcquisition(rows,states,'inherit6','owned',hierarchy);
 assert.equal(states.inherit6,'owned');assert.equal(inheritedCount(rows,states),6);
});

test('real JP purchase and evolution edges support the same transitive interaction',()=>{
 const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 const data=read(read('data/manifest.json').dataset_path),hierarchy=buildAcquisitionHierarchy(data);
 const rule=data.evolution_rules.find(rule=>relatedAcquisitionIds(hierarchy,rule.evolved_id).length>=2);
 const ids=[rule.evolved_id,...relatedAcquisitionIds(hierarchy,rule.evolved_id)],rows=ids.map(id=>({id}));
 let states=updateAcquisition(rows,{},rule.evolved_id,'owned',hierarchy);for(const id of ids)assert.equal(states[id],'owned');
 states=updateAcquisition(rows,states,ids.at(-1),'unavailable',hierarchy);for(const id of ids)assert.equal(states[id],'unavailable');
});

test('player-facing rarity labels use standard terms',()=>{
 assert.deepEqual(['white','gold','evolution'].map(rarity=>skillRarityLabel({rarity})),['일반','레어','진화']);
 assert.equal(skillRarityLabel({rarity:'gold',inherited:true}),'계승');
});
test('a saved original inheritance hint migrates only when the current row has no explicit record',()=>{
 const rows=[{id:'91101411',inherited:true}];
 assert.equal(checklistSnapshot(rows,{'901411':'5'})['91101411'],'5');
 assert.equal(checklistSnapshot(rows,{'901411':'owned'})['91101411'],'owned');
 assert.equal(checklistSnapshot(rows,{'901411':'owned','91101411':'unavailable'})['91101411'],'unavailable');
});


test('paid forms share an inheritance slot and retain priority over earlier hints',()=>{
 const rows=Array.from({length:7},(_,i)=>({id:String(i),inherited:true}));
 rows.push({id:'strong',inheritanceOriginId:'6',inherited:true});
 const states=Object.fromEntries(rows.map(row=>[row.id,'2']));states.strong='owned';
 const hinted=bulkAcquisition(rows,states,'5');assert.equal(hinted.strong,'owned');assert.equal(hinted['6'],'unavailable');assert.equal(inheritedCount(rows,hinted),6);
 states['6']='owned';const bought=bulkAcquisition(rows,states,'5');assert.equal(bought['6'],'owned');assert.equal(bought.strong,'owned');assert.equal(inheritedCount(rows,bought),6);
});
