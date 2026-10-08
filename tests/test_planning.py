import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from umaboard.planning import purchase_stages,validate_planning
from umaboard.common import DataError

class PlanningTests(unittest.TestCase):
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
if __name__=='__main__':unittest.main()
