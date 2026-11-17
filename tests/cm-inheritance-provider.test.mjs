import test from 'node:test';
import assert from 'node:assert/strict';
import {inheritanceProviders} from '../assets/cm-inheritance-provider.mjs';

test('provider lookup deduplicates verified owners, preserves costume identity and has a safe portrait fallback',()=>{
 const data={skills:{s:{parent_ids:['u']}},outfits:{1:{id:'1',name_ko:'키타산 블랙',outfit_name_jp:'정월'},2:{id:'2',name_ko:'다른 의상',outfit_name_jp:'별도'}},acquisition_routes:[{skill_id:'u',owner_type:'outfit',owner_id:'1'},{skill_id:'u',owner_type:'outfit',owner_id:'1'},{skill_id:'u',owner_type:'support',owner_id:'2'}]};
 assert.deepEqual(inheritanceProviders(data,{id:'s',inherited:true},{}).map(p=>[p.id,p.label,p.portrait]),[['1','키타산 블랙 · 정월',null]]);
 assert.deepEqual(inheritanceProviders(data,{id:'s',inherited:false,providers:['1']},{}),[]);
 assert.deepEqual(inheritanceProviders(data,{id:'s',inherited:true,providers:['2','missing']},{}).map(p=>p.id),['2']);
});
