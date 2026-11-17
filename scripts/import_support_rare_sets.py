"""Import rare reward bundles only, keeping existing detailed event reviews.

Inputs are the public GameTora training_events/ssr and dict/evrew snapshots.
No event prose, stats, random white-skill events or chain walkthrough is imported.
"""
import argparse
import hashlib
import json
from pathlib import Path


def rare_sets(events, rewards, skills):
    result = []
    for event in events:
        if not isinstance(event[1], list):
            continue
        for choice in event[1]:
            if not isinstance(choice, list) or len(choice) < 2 or not isinstance(choice[1], list):
                continue
            parts = [[]]
            for index in choice[1]:
                reward = rewards[index - 36] if isinstance(index, int) and 0 <= index - 36 < len(rewards) else None
                if not reward:
                    continue
                if reward[0] in ('di', 'nl'):
                    parts.append([])
                elif reward[0] == 'sk' and len(reward) > 2 and skills.get(str(reward[2]), {}).get('rarity') == 'gold':
                    parts[-1].append({'skill_id': str(reward[2]), 'hint_level': int(reward[1])})
            # Different previous choices (brp/nl) are distinct obtainable sets.
            # Repeated success outcomes of the same set retain the highest
            # listed hint for that set, never union mutually exclusive rewards.
            for part in parts:
                if not part:
                    continue
                levels = {item['skill_id']: item['hint_level'] for item in part}
                key = tuple(sorted(levels))
                existing = next((r for r in result if tuple(item['skill_id'] for item in r) == key), None)
                if existing:
                    for item in existing:
                        item['hint_level'] = max(item['hint_level'], levels[item['skill_id']])
                else:
                    result.append([{'skill_id': key_id, 'hint_level': levels[key_id]} for key_id in key])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--events', type=Path, required=True)
    parser.add_argument('--rewards', type=Path, required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--checked-at', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / 'data/manifest.json').read_text())
    data = json.loads((root / manifest['dataset_path']).read_text())
    path = root / 'curated/planning.json'
    planning = json.loads(path.read_text())
    raw = dict(json.loads(args.events.read_text()))
    rewards = json.loads(args.rewards.read_text())
    by_card = {}
    for route in data['acquisition_routes']:
        if route['kind'] == 'support_event' and data['supports'][route['owner_id']]['rarity'] == 'SSR' and data['skills'][route['skill_id']]['rarity'] == 'gold':
            by_card.setdefault(route['owner_id'], set()).add(route['skill_id'])
    added = 0
    for card_id, expected in sorted(by_card.items()):
        if len(expected) < 2 or card_id in planning['support_events'] and planning['support_events'][card_id].get('scope') != 'rare_reward_sets':
            continue
        bundles = rare_sets(raw.get(int(card_id), []), rewards, data['skills'])
        found = {item['skill_id'] for bundle in bundles for item in bundle}
        if found != expected:
            raise ValueError(f'{card_id}: rare reward mismatch: {found} != {expected}')
        planning['support_events'][card_id] = {
            'source': args.source, 'checked_at': args.checked_at,
            'scope': 'rare_reward_sets',
            'source_sha256': hashlib.sha256(args.events.read_bytes()).hexdigest(),
            'reward_sha256': hashlib.sha256(args.rewards.read_bytes()).hexdigest(),
            'events': [{'id': card_id + '-rare-sets', 'name_jp': 'レアスキルセット',
                        'choices': [{'id': str(index + 1), 'label': '레어 세트 ' + str(index + 1), 'rewards': bundle}
                                    for index, bundle in enumerate(bundles)]}]
        }
        added += 1
    path.write_text(json.dumps(planning, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'added': added, 'reviewed_cards': len(planning['support_events'])}))


if __name__ == '__main__':
    main()
