import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from umaboard.planning import purchase_stages,validate_planning
from umaboard.common import DataError

class PlanningTests(unittest.TestCase):
 def test_missing_gold_is_proven_from_unique_white_increment_and_evolved_cumulative_price(self):
  skills={s:{'rarity':r,'inherited':False,'name_jp':s} for s,r in [('1','white'),('2','gold'),('3','evolution')]}
  links=[{'kind':'version_family','from_id':'2','to_id':'1'}];evo=[{'base_id':'2','evolved_id':'3'}]
  stages=purchase_stages(skills,{'1':110,'2':110},[{'id':'3','group':1,'sp':220}],links,evo)
  self.assertEqual(stages['2']['status'],'verified');self.assertEqual(stages['2']['prerequisite_id'],'1')
  for total in [110,219,221]:
   self.assertEqual(purchase_stages(skills,{'1':110,'2':110},[{'id':'3','group':1,'sp':total}],links,evo)['2']['status'],'unverified')
  self.assertEqual(purchase_stages(skills,{'1':110,'2':110},[{'id':'3','group':1,'sp':220}],[],evo)['2']['status'],'unverified')
 def test_explicit_independent_purchase_review_cannot_override_changed_costs_or_relations(self):
  skills={s:{'rarity':r,'inherited':False,'name_jp':s} for s,r in [('1','white'),('2','gold')]}
  links=[{'kind':'version_family','from_id':'2','to_id':'1'}]
  review={'2':{'base_cost':110,'prerequisite_id':'1','total_cost':220,'source':'https://example.com/independent'}}
  self.assertEqual(purchase_stages(skills,{'1':110,'2':110},[],links,[],review)['2']['status'],'verified')
  for costs,relations in [({'1':110,'2':111},links),({'1':111,'2':110},links),({'1':110,'2':110},[])]:
   with self.assertRaises(DataError):purchase_stages(skills,costs,[],relations,[],review)
 def test_proven_circle_gold_stage_chain(self):
  skills={s:{'rarity':r,'inherited':False,'name_jp':n} for s,r,n in [('1','white','角○'),('2','white','角◎'),('3','gold','金')]}
  stages=purchase_stages(skills,{'1':100,'2':110,'3':150},[{'id':s,'group':1,'sp':v} for s,v in [('1',100),('2',210),('3',360)]],[{'kind':'version_family','from_id':a,'to_id':b} for a,b in [('1','2'),('2','3')]],[])
  self.assertEqual([stages[s]['prerequisite_id'] for s in ['1','2','3']],[None,'1','2'])
  self.assertTrue(all(s['status']=='verified' for s in stages.values()))
 def test_unproven_gold_and_double_circle_are_not_free_or_single_stage(self):
  skills={'1':{'rarity':'gold','inherited':False,'name_jp':'金'},'2':{'rarity':'white','inherited':False,'name_jp':'角◎'}}
  stages=purchase_stages(skills,{'1':150,'2':110},[],[],[])
  self.assertEqual(stages['1']['status'],'unverified');self.assertEqual(stages['2']['status'],'unverified')
 def test_invalid_event_reference_and_purchase_cycles_fail_validation(self):
  d={'skills':{'1':{}},'supports':{'c':{}},'purchase_stages':{'1':{'base_cost':100,'prerequisite_id':'1'}}}
  with self.assertRaises(DataError):validate_planning(d)
  d['purchase_stages']={};d['support_events']={'c':{'source':'https://example.com','events':[{'id':'e','choices':[{'id':'1','rewards':[{'skill_id':'missing','hint_level':2}]}]}]}}
  with self.assertRaises(DataError):validate_planning(d)
 def event_fixture(self):
  reward={'skill_id':'1','hint_level':2}
  return {'skills':{'1':{}},'supports':{'c':{}},'purchase_stages':{},
   'acquisition_routes':[{'owner_type':'support','owner_id':'c','kind':'support_event','skill_id':'1'}],
   'support_events':{'c':{'source':'https://example.com','events':[{'id':'e','assumed_outcome':'great_success','choices':[
    {'id':'1','rewards':[reward],'outcomes':{'great_success':[reward],'success':[{'skill_id':'1','hint_level':1}]}}]}]}}}
 def test_verified_reward_detached_from_card_blocks_publication(self):
  d=self.event_fixture();self.assertTrue(validate_planning(d))
  for field,value in [('owner_id','other'),('kind','support_hint')]:
   broken=copy.deepcopy(d);broken['acquisition_routes'][0][field]=value
   with self.subTest(field=field),self.assertRaisesRegex(DataError,'missing support acquisition route'):
    validate_planning(broken)
 def test_outcome_evidence_must_be_valid_and_match_the_assumed_rewards(self):
  for kind in ['unknown_skill','invalid_level','boolean_level','duplicate_reward','wrong_assumption']:
   d=self.event_fixture();event=d['support_events']['c']['events'][0];choice=event['choices'][0]
   if kind=='unknown_skill':choice['outcomes']['success'][0]['skill_id']='missing'
   if kind=='invalid_level':choice['outcomes']['success'][0]['hint_level']=6
   if kind=='boolean_level':choice['outcomes']['success'][0]['hint_level']=True
   if kind=='duplicate_reward':choice['outcomes']['success']*=2
   if kind=='wrong_assumption':event['assumed_outcome']='success'
   with self.subTest(kind=kind),self.assertRaises(DataError):validate_planning(d)
if __name__=='__main__':unittest.main()
