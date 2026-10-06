import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {skillName,outfitName,selectableSupports,cardName} from '../assets/display.mjs';
import {searchKey} from '../assets/search-select.mjs';
import {buildCandidates} from '../assets/candidates.mjs';
import {portraitPath} from '../assets/portraits.mjs';
const manifest=JSON.parse(readFileSync(new URL('../data/manifest.json',import.meta.url)));
const data=JSON.parse(readFileSync(new URL('../'+manifest.dataset_path,import.meta.url)));
const portraits=JSON.parse(readFileSync(new URL('../data/portraits.json',import.meta.url)));

test('portrait paths use exact outfit/card IDs and only local assets',()=>{
 assert.equal(portraits.source.repository,'daftuyda/UmaTools');
 assert.equal(portraits.source.commit,manifest.sources.find(source=>source.source_id==='umatools').commit);
 for(const kind of ['outfits','supports'])for(const [id,entry] of Object.entries(portraits[kind])){
  assert.ok(data[kind][id]);assert.equal(portraitPath(portraits,kind,id),entry.path);
  if(kind==='supports')assert.equal(data.supports[id].rarity,'SSR');
 }
 for(const kind of ['outfits','supports'])for(const id of portraits.missing[kind]){
  assert.ok(data[kind][id]);assert.equal(portraitPath(portraits,kind,id),null);
 }
 const catalog={outfits:{'1':{path:'https://gametora.com/image.png'},'2':{path:'assets/portraits/outfits/1-'+ 'a'.repeat(40)+'.webp'}}};
 assert.equal(portraitPath(catalog,'outfits','1'),null);assert.equal(portraitPath(catalog,'outfits','2'),null);
});

test('character localization keeps Japanese outfit titles and all skill names',()=>{
 const outfit=data.outfits['114101'];assert.match(outfitName(outfit),/^에피파네이아 · /);
 assert.ok(outfitName(outfit).endsWith(outfit.outfit_name_jp));
 const skill=Object.values(data.skills).find(skill=>skill.name_jp==='パスファインダー');
 assert.ok(skill.name_ko);assert.equal(skillName(skill),'パスファインダー');
 assert.ok(Object.values(data.skills).every(skill=>skillName(skill)===skill.name_jp));
});
test('selector includes only SSR while the master retains SR/R and group titles',()=>{
 const cards=selectableSupports(data);assert.ok(cards.length>0);
 assert.ok(cards.every(card=>card.rarity==='SSR'));
 assert.ok(Object.values(data.supports).some(card=>card.rarity==='SR'));
 assert.ok(Object.values(data.supports).some(card=>card.rarity==='R'));
 const pisa=cards.find(card=>card.name_jp.startsWith('ヴィクトワールピサ'));
 assert.equal(cardName(pisa),'빅투아르 피사');
 assert.equal(outfitName({name_jp:'新キャラ',name_ko:null,outfit_name_jp:'衣装'}),'新キャラ · 衣装');
 const group=cards.find(card=>card.type==='Group');assert.equal(cardName(group),group.name_jp.replace(/\s+\(SSR\)$/,''));
});
test('Korean search accepts spacing and composed/decomposed Hangul',()=>{
 assert.equal(searchKey('키타산 블랙'),searchKey('키타산블랙'));
 assert.equal(searchKey('에피파네이아'.normalize('NFD')),searchKey('에피파네이아'));
 assert.equal(searchKey('ＳＳＲ'),searchKey('ssr'));
});
test('inherited uniques link to the donor outfit of their native parent skill',()=>{
 const candidates=buildCandidates(data,{outfitId:'114101'});
 for(const skill of candidates.inheritance){
  assert.ok(skill.inheritance_outfit_ids.length>0,skill.name_jp);
  assert.equal(new Set(skill.inheritance_outfit_ids).size,skill.inheritance_outfit_ids.length);
  for(const id of skill.inheritance_outfit_ids){
   assert.ok(data.outfits[id]);
   assert.ok(data.acquisition_routes.some(route=>route.owner_type==='outfit'&&route.owner_id===id&&skill.parent_ids.includes(route.skill_id)));
  }
 }
 const gear=candidates.inheritance.find(skill=>skill.name_jp==='紅焔ギア/LP1211-M');
 assert.ok(gear);assert.ok(gear.inheritance_outfit_ids.some(id=>data.outfits[id].name_ko==='마루젠스키'));
});
