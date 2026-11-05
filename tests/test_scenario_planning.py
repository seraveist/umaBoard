import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from umaboard.common import DataError
from umaboard.normalize import normalize
from umaboard.planning import validate_planning
from test_pipeline import fixtures


class ScenarioPlanningTests(unittest.TestCase):
 def fixture(self):
  raw,rules=fixtures()
  raw['skills'][1]['evo'].append({'scenario_id':'15','evos':[100101111]})
  rules['planning']={'scenario_events':{'15':{'source':'https://example.com/scenario','events':[
   {'id':'15-link','choices':[{'id':'1','rewards':[{'skill_id':'201011','hint_level':2,
    'requirements':{'character_link':{'name_jp':'テストウマ','present':True}}}]}]}]}}}
  rules['scenario_exclusive_groups']=[{'scenario_id':'15','skill_ids':['100101111'],'max_count':1,'source':'https://example.com/scenario'}]
  return normalize(raw,rules)
 def test_scenario_reward_keeps_owner_choice_and_link_requirement(self):
  d=self.fixture();self.assertTrue(validate_planning(d))
  r=next(r for r in d['acquisition_routes'] if r.get('event_id')=='15-link')
  self.assertEqual((r['owner_type'],r['owner_id'],r['event_choice_id']),('scenario','15','1'))
  self.assertEqual(r['requirements'],{'character_link':{'name_jp':'テストウマ','present':True}})
 def test_disconnected_or_changed_scenario_reward_blocks_activation(self):
  for field,value in [('event_choice_id','wrong'),('owner_id','14'),('requirements',{})]:
   d=self.fixture();r=next(r for r in d['acquisition_routes'] if r.get('event_id')=='15-link');r[field]=value
   with self.subTest(field=field),self.assertRaisesRegex(DataError,'missing scenario acquisition route'):validate_planning(d)
 def test_unimplemented_requirement_is_not_accepted_as_verified(self):
  d=self.fixture();d['scenario_events']['15']['events'][0]['choices'][0]['rewards'][0]['requirements']={'unknown':True}
  with self.assertRaisesRegex(DataError,'unsupported scenario reward requirement'):validate_planning(d)
 def test_invalid_or_non_scenario_evolution_limit_blocks_activation(self):
  for kind in ['zero','boolean','duplicate','wrong_scenario','wrong_skill','no_source']:
   d=self.fixture();g=d['scenario_exclusive_groups'][0]
   if kind=='zero':g['max_count']=0
   if kind=='boolean':g['max_count']=True
   if kind=='duplicate':g['skill_ids']*=2
   if kind=='wrong_scenario':g['scenario_id']='14'
   if kind=='wrong_skill':g['skill_ids']=['201011']
   if kind=='no_source':g.pop('source')
   with self.subTest(kind=kind),self.assertRaises(DataError):validate_planning(d)
 def test_duplicate_scenario_event_group_and_missing_source_block_activation(self):
  for kind in ['duplicate','no_source']:
   d=self.fixture();entry=d['scenario_events']['15']
   if kind=='duplicate':entry['events'].append(copy.deepcopy(entry['events'][0]))
   else:entry.pop('source')
   with self.subTest(kind=kind),self.assertRaises(DataError):validate_planning(d)


if __name__=='__main__':unittest.main()
