import copy,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from umaboard.common import canonical_bytes,digest,DataError
from umaboard.normalize import decode_secondary
from umaboard.sync import publish
from umaboard.validate import validate_dataset
from test_pipeline import fixtures
from umaboard.normalize import normalize

class SourceSupplementTests(unittest.TestCase):
    def test_secondary_noninherit_requires_exact_reviewed_payload(self):
        row={'id':'123','name':'test','rarity':'rare','sp':380,'invokes':[{'index':1,'conditions':[],'effects':[{'type':'targetSpeed','value':2500}],'duration':3}]}
        with self.assertRaises(DataError):decode_secondary(row)
        review={'sha256':digest(canonical_bytes(row)),'rarity':'gold'}
        self.assertEqual(decode_secondary(row,review)['rarity'],'gold')
        changed=copy.deepcopy(row);changed['sp']=370
        with self.assertRaisesRegex(DataError,'changed'):decode_secondary(changed,review)

    def test_additive_catalog_preserves_record_migration_but_removed_or_changed_id_does_not(self):
        raw,rules=fixtures();data=normalize(raw,rules)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);publish(root,data,validate_dataset(data,{}),[],[],'before')
            old=json.loads((root/'data/manifest.json').read_text(encoding='utf8'))
            new=copy.deepcopy(data);new['skills']['123']=copy.deepcopy(new['skills']['201012']);new['skills']['123']['id']='123'
            publish(root,new,validate_dataset(new,{}),[],[],'additive')
            manifest=json.loads((root/'data/manifest.json').read_text(encoding='utf8'))
            self.assertIn(old['checklist_data_sha256'],manifest['checklist_record_versions'])
            del new['skills']['123'];publish(root,new,validate_dataset(new,{}),[],[],'removed')
            self.assertNotIn('checklist_record_versions',json.loads((root/'data/manifest.json').read_text(encoding='utf8')))

    def test_active_daring_tact_links_and_prices_are_complete(self):
        root=Path(__file__).resolve().parents[1];manifest=json.loads((root/'data/manifest.json').read_text(encoding='utf8'));data=json.loads((root/manifest['dataset_path']).read_text(encoding='utf8'))
        self.assertIn('107501',data['outfits']);self.assertEqual(data['skills']['900751']['parent_ids'],['100751'])
        self.assertEqual({r['evolved_id'] for r in data['evolution_rules'] if r['owner_type']=='outfit' and r['owner_id']=='107501'},{'107501111','107501211','107501221'})
        self.assertEqual(data['purchase_stages']['204911']['base_cost'],190);self.assertEqual(data['purchase_stages']['204912']['base_cost'],190)

if __name__=='__main__':unittest.main()
