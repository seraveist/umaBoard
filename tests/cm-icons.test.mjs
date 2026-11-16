import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {skillIconId} from '../assets/cm-icons.mjs';
import {sortChartRows} from '../assets/cm-chart.mjs';

const read=file=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const manifest=read('data/manifest.json'),data=read(manifest.dataset_path),display=read('curated/cm-skill-display.json');

test('each source icon takes priority without borrowing an evolved or inherited parent image',()=>{
 const metadata={skills:{evo:{iconId:'20012'},gold:{iconId:'20012'},inherit:{iconId:'20013'}}};
 assert.equal(skillIconId({id:'evo',icon_id:'20016'},metadata),'20016');
 assert.equal(skillIconId({id:'inherit',icon_id:'20011'},metadata),'20011');
 assert.equal(skillIconId({id:'gold'},metadata),'20012');
 assert.equal(skillIconId({id:'unknown',icon_id:'99999'},metadata),'99999');
 assert.equal(skillIconId({id:'unknown'},metadata),null);
});

test('all active JP records resolve an existing registered image and retain their own source icon',()=>{
 const rows=sortChartRows(Object.values(data.skills).map(skill=>({...skill,name:skill.name_jp})),data,display);
 assert.equal(rows.length,Object.keys(data.skills).length);
 for(const row of rows){
  const skill=data.skills[row.id];assert.ok(row.iconId,`${row.id} ${row.name}: unassigned icon`);
  assert.ok(display.icons[row.iconId],`${row.id} ${row.name}: unregistered icon ${row.iconId}`);
  if(skill.icon_id)assert.equal(row.iconId,skill.icon_id,`${row.id}: source icon replaced`);
 }
 for(const id of ['210392','204453','204722','204731','204732','204751','210402'])assert.ok(skillIconId(data.skills[id],display));
 for(const id of ['101301311','415041','114401111'])assert.notEqual(skillIconId(data.skills[id],display),'20012');
});

test('the complete icon pack has byte-exact PNG files and source evidence for added assets',()=>{
 assert.deepEqual(display.missing_icon_ids,[]);
 for(const [iconId,meta]of Object.entries(display.icons)){
  const bytes=readFileSync(new URL(`../assets/skill-icons/utx_ico_skill_${iconId}.png`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256,iconId);
  assert.equal(bytes.length,meta.bytes,iconId);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',iconId);
  assert.equal(bytes.readUInt32BE(16),meta.width,iconId);assert.equal(bytes.readUInt32BE(20),meta.height,iconId);
  if(meta.source?.blob_sha)assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex'),meta.source.blob_sha,iconId);
 }
 for(const id of ['2010011','20361','20362','20366','20376','20381','20382','20386']){
  assert.equal(display.icons[id].source.website,'GameTora');assert.match(display.icons[id].source.url,/^https:\/\/media\.gametora\.com\/umamusume\/skills\/icon\//);
 }
});
