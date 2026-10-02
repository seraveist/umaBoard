import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from umaboard.common import DataError,canonical_bytes
from umaboard.normalize import normalize
from umaboard.sync import HttpClient,git_blob_sha,publish,raw_inputs,synchronize
from umaboard.validate import validate_dataset


def fixtures():
    def skill(sid,rarity=1,**extra):
        return {'id':sid,'jpname':f'スキル{sid}','rarity':rarity,'activation':1,
                'condition_groups':[{'base_time':30000,'condition':'running_style==2','effects':[{'type':27,'value':1500}]}],**extra}
    inherited={'id':910011,'rarity':1,'inherited':True,'parent_skills':[110011],
               'condition_groups':[{'base_time':18000,'condition':'running_style==2','effects':[{'type':27,'value':500}]}]}
    primary=[skill(110011,5,char=[100101],gene_version=inherited,unreleased=['en','ko']),
             skill(201011,2,cost=180,char=[100101],sup_e=[[30001],[]],sup_hint=[[30001],[]],versions=[201012],
                   evo=[{'card_id':100101,'evos':[100101111]}]),
             skill(201012,1,cost=100,versions=[201011]),
             skill(100101111,6,pre_evo={'old':201011,'card_id':100101},evo_cond=[[['unknown']]])]
    raw={'skills':primary,
         'outfits':[{'UmaId':'100101','UmaNameJP':'テストウマ','UmaNicknameJP':'テスト衣装','UmaBaseStars':3}],
         'supports':[{'SupportId':'30001','SupportNameJP':'テストSSR','SupportRarity':'SSR','SupportType':'Speed',
                      'SupportHints':[{'SkillId':'201011'},{'SkillId':'','Name':'Initial Speed bonus'}]}],
         'secondary_skills':[{'id':'110011','name':'スキル110011','rarity':'unique','invokes':[]}],
         'courses':{'10606':{'raceTrackId':10006,'distance':2400,'distanceType':3,'surface':1,'turn':2,
                            'corners':[{'start':1000,'length':300}],
                            'straights':[{'start':1300,'end':2400,'frontType':1}],'slopes':[]}},
         'scenario_memo':'reference memo'}
    curated={'review_status':'partial','pending':['scenario_rules'],'inheritance_links':[]}
    return raw,curated


class NormalizationTests(unittest.TestCase):
    def test_current_speed_and_target_speed_are_not_mixed(self):
        raw,rules=fixtures()
        raw['skills'][0]['condition_groups'][0]['effects']=[
            {'type':21,'value':-1500},{'type':22,'value':1500},{'type':27,'value':1500}]
        data=normalize(raw,rules)
        effects=data['skills']['110011']['invocations'][0]['effects']
        self.assertEqual([e['kind'] for e in effects],['current_speed','speed_with_decel','target_speed'])

    def test_jp_not_filtered_by_english_or_korean_release(self):
        raw,rules=fixtures();data=normalize(raw,rules)
        self.assertTrue(data['skills']['110011']['jp_available'])
        self.assertTrue(data['skills']['910011']['jp_available'])
        self.assertEqual(data['skills']['910011']['parent_ids'],['110011'])

    def test_actual_jp_release_gate_propagates_to_inheritance(self):
        raw,rules=fixtures();rules['jp_unavailable_skill_ids']=['110011'];data=normalize(raw,rules)
        self.assertFalse(data['skills']['910011']['jp_available'])

    def test_card_hint_event_dedup_and_pseudo_bonuses_ignored(self):
        raw,rules=fixtures();data=normalize(raw,rules)
        routes=[r for r in data['acquisition_routes'] if r['owner_type']=='support']
        self.assertEqual({r['kind'] for r in routes},{'support_hint','support_event'})
        self.assertEqual(len(routes),2)
        self.assertTrue(all(not r['event_conditions_affect_candidates'] for r in routes))

    def test_evolution_references_and_source_effect_metadata_retained(self):
        raw,rules=fixtures();effect=raw['skills'][1]['condition_groups'][0]['effects'][0]
        effect.update({'target':2,'target_details':['all'],'value_scale':5,'additional_activation':1})
        data=normalize(raw,rules);validate_dataset(data,{})
        self.assertEqual(data['evolution_rules'][0]['base_id'],'201011')
        self.assertEqual(data['skills']['201011']['invocations'][0]['effects'][0]['extras_raw']['target'],2)

    def test_unknown_effect_is_preserved_without_fake_zero_gain(self):
        raw,rules=fixtures();raw['skills'][0]['condition_groups'][0]['effects'][0]['type']=9999
        data=normalize(raw,rules);s=data['skills']['110011']
        self.assertEqual(s['unknown_effect_codes'],[9999])
        self.assertEqual(s['invocations'][0]['effects'][0]['value_raw'],1500)
        self.assertEqual(s['calculation_status'],'unvalidated')
        self.assertNotIn('gain',s)

    def test_conflicting_duplicate_cannot_overwrite_primary(self):
        raw,rules=fixtures();other=copy.deepcopy(raw['skills'][0]);other['condition_groups'][0]['effects'][0]['value']=9999
        raw['skills'].append(other)
        with self.assertRaisesRegex(DataError,'conflicting duplicate'):normalize(raw,rules)

    def test_missing_owner_or_evolution_reference_blocks_activation(self):
        raw,rules=fixtures();raw['skills'][1]['sup_e']=[[99999],[]];data=normalize(raw,rules)
        with self.assertRaisesRegex(DataError,'missing route owner'):validate_dataset(data,{})
        raw,rules=fixtures();raw['skills'][1]['evo'][0]['evos']=[99999]
        with self.assertRaisesRegex(DataError,'missing relation endpoint'):validate_dataset(normalize(raw,rules),{})

    def test_unreviewed_bulk_deletion_rejected(self):
        raw,rules=fixtures();data=normalize(raw,rules);old=copy.deepcopy(data)
        old['skills'].update({str(n):{'id':str(n)} for n in range(9990,9999)})
        with self.assertRaisesRegex(DataError,'count decrease'):validate_dataset(data,{},old)

    def test_corrupt_course_fails_unless_explicitly_quarantined(self):
        raw,rules=fixtures();raw['courses']['10606']['corners'][0]['length']=2000
        with self.assertRaisesRegex(DataError,'requires quarantine'):validate_dataset(normalize(raw,rules),{})
        rules.update({'course_exclusions':['10606'],'course_exclusion_reasons':{'10606':'verified source anomaly'}})
        data=normalize(raw,rules);report=validate_dataset(data,{})
        self.assertFalse(data['courses']['10606']['selectable'])
        self.assertEqual(report['warnings'][0]['kind'],'course_quarantined')

    def test_malformed_regional_field_cannot_drop_jp_catalog(self):
        raw,rules=fixtures();raw['skills'][0]['unreleased']=True
        with self.assertRaisesRegex(DataError,'regional-code array'):normalize(raw,rules)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        raw,rules=fixtures();self.data=normalize(raw,rules);self.validation=validate_dataset(self.data,{})
    def tearDown(self):self.temp.cleanup()

    def test_failed_manifest_swap_keeps_old_active_bundle(self):
        publish(self.root,self.data,self.validation,[],[],'first')
        pointer=self.root/'data/manifest.json';before=pointer.read_bytes()
        changed=copy.deepcopy(self.data);changed['skills']['110011']['name_jp']='updated'
        original_replace=__import__('os').replace
        def fail_pointer(src,dst):
            if Path(dst)==pointer:raise OSError('simulated failure before activation')
            return original_replace(src,dst)
        with patch('umaboard.sync.os.replace',side_effect=fail_pointer):
            with self.assertRaises(OSError):publish(self.root,changed,self.validation,[],[],'next')
        self.assertEqual(pointer.read_bytes(),before)
        old=json.loads(before);self.assertTrue((self.root/old['dataset_path']).exists())

    def test_repeat_publish_does_not_change_pointer(self):
        changed,version=publish(self.root,self.data,self.validation,[],[],'same')
        self.assertTrue(changed)
        before=(self.root/'data/manifest.json').stat().st_mtime_ns
        self.assertEqual(publish(self.root,self.data,self.validation,[],[],'same'),(False,version))
        self.assertEqual((self.root/'data/manifest.json').stat().st_mtime_ns,before)

    def test_download_mismatch_cannot_poison_pinned_blob(self):
        content=b'[]';blob=git_blob_sha(content)
        source={'repository':'example/repo','commit':'a'*40,'files':[{'key':'skills','path':'skills.json','blob_sha':blob,'bytes':len(content)}]}
        class BadClient:
            def get(self,url):return b'{"bad":true}'
        with self.assertRaisesRegex(DataError,'pinned Git blob'):raw_inputs(BadClient(),[source],self.root/'cache')
        self.assertFalse((self.root/'cache'/f'{blob}.raw').exists())

    def test_network_failure_keeps_existing_active_pointer(self):
        root=Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as tmp:
            import shutil
            work=Path(tmp)
            for path in ['sync-config.json','curated','scripts','data']:
                src=root/path
                if src.is_dir():shutil.copytree(src,work/path)
                else:shutil.copy(src,work/path)
            before=(work/'data/manifest.json').read_bytes()
            class OfflineClient:
                def json(self,url):raise DataError('network failure')
            with self.assertRaisesRegex(DataError,'network failure'):synchronize(work,client=OfflineClient())
            self.assertEqual((work/'data/manifest.json').read_bytes(),before)

if __name__=='__main__':unittest.main()
