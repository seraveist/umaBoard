import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('rare_sets', Path(__file__).resolve().parents[1] / 'scripts/import_support_rare_sets.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RareSetTests(unittest.TestCase):
    def test_outcomes_do_not_stack_and_previous_choice_branches_remain_alternatives(self):
        rewards = [['sk', '+2', 1], ['sk', '+2', 2], ['di'], ['sk', '+1', 1], ['sk', '+1', 2], ['nl'], ['sk', '+2', 3]]
        skills = {str(i): {'rarity': 'gold'} for i in [1, 2, 3]}
        events = [[0, [[0, [36, 37, 38, 39, 40]], [1, [36, 41, 42]]], 100]]
        result = module.rare_sets(events, rewards, skills)
        self.assertIn([{'skill_id': '1', 'hint_level': 2}, {'skill_id': '2', 'hint_level': 2}], result)
        self.assertIn([{'skill_id': '3', 'hint_level': 2}], result)
        self.assertFalse(any({r['skill_id'] for r in bundle} == {'1', '2', '3'} for bundle in result))

    def test_white_only_events_and_non_skill_rewards_are_omitted(self):
        rewards = [['sk', '+5', 1], ['sk', '+1', 2], ['sp', '+20']]
        result = module.rare_sets([[0, [[0, [36, 38]], [1, [37]]], 100]], rewards, {'1': {'rarity': 'white'}, '2': {'rarity': 'gold'}})
        self.assertEqual(result, [[{'skill_id': '2', 'hint_level': 1}]])


if __name__ == '__main__':
    unittest.main()
