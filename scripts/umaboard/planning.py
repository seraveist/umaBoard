"""Purchase stages proven by primary increments and secondary cumulative costs."""
from .common import DataError, identifier, number, canonical_bytes


def purchase_stages(skills, costs, secondary, relations, evolutions):
    groups = {}
    for row in secondary:
        sid = identifier(row['id'])
        if sid in skills and row.get('group') is not None:
            groups.setdefault(str(row['group']), []).append(row)
    stages = {}
    for rows in groups.values():
        rows = [r for r in rows if skills[identifier(r['id'])]['rarity'] in ('white', 'gold')
                and identifier(r['id']) in costs and isinstance(r.get('sp'), (int, float))]
        rows.sort(key=lambda r: (r['sp'], identifier(r['id'])))
        previous_total = 0
        previous_id = None
        for row in rows:
            sid = identifier(row['id'])
            base = costs[sid]
            linked = previous_id is None or any(r['kind'] == 'version_family'
                and {r['from_id'], r['to_id']} == {sid, previous_id} for r in relations)
            if base > 0 and row['sp'] - previous_total == base and linked:
                stages[sid] = {'base_cost': base, 'prerequisite_id': previous_id,
                               'status': 'verified', 'evidence': 'umatools_increment_umasim_total'}
            previous_total = row['sp']
            previous_id = sid
    for sid, skill in skills.items():
        if sid in stages:
            continue
        base = costs.get(sid)
        if base and (skill['inherited'] or skill['rarity'] == 'white' and '◎' not in skill['name_jp']):
            stages[sid] = {'base_cost': base, 'prerequisite_id': None,
                           'status': 'verified', 'evidence': 'umatools_single_stage'}
        elif base:
            stages[sid] = {'base_cost': base, 'prerequisite_id': None,
                           'status': 'unverified', 'evidence': 'prerequisite_unresolved'}
    return stages


def validate_planning(data):
    skills = data['skills']
    event_routes = {(r['owner_id'], r['skill_id']) for r in data.get('acquisition_routes', [])
                    if r['owner_type'] == 'support' and r['kind'] == 'support_event'}
    scenario_routes = {(r['owner_id'], r.get('event_id'), r.get('event_choice_id'), r['skill_id'], canonical_bytes(r.get('requirements', {})))
                       for r in data.get('acquisition_routes', []) if r['owner_type'] == 'scenario' and r['kind'] == 'scenario_event'}

    def validate_rewards(card_id, rewards, event_id=None, choice_id=None):
        if not isinstance(rewards, list):
            raise DataError('event rewards must be an array')
        seen = set()
        for reward in rewards:
            sid, level = reward['skill_id'], reward['hint_level']
            if sid not in skills or type(level) is not int or not 0 <= level <= 5:
                raise DataError('invalid event skill or hint level')
            if sid in seen:
                raise DataError('duplicate event reward')
            seen.add(sid)
            if event_id is not None:
                requirements = reward.get('requirements', {})
                if requirements:
                    if not isinstance(requirements, dict):
                        raise DataError('unsupported scenario reward requirement')
                    link = requirements.get('character_link', {})
                    if not isinstance(link, dict) or set(requirements) != {'character_link'} or set(link) != {'name_jp', 'present'} or not isinstance(link['name_jp'], str) or not link['name_jp'] or type(link['present']) is not bool:
                        raise DataError('unsupported scenario reward requirement')
                if (card_id, event_id, choice_id, sid, canonical_bytes(requirements)) not in scenario_routes:
                    raise DataError('event reward missing scenario acquisition route')
            elif (card_id, sid) not in event_routes:
                raise DataError('event reward missing support acquisition route')

    for sid, stage in data.get('purchase_stages', {}).items():
        if sid not in skills or number(stage['base_cost'], 'purchase cost') <= 0:
            raise DataError('invalid purchase stage')
        parent = stage.get('prerequisite_id')
        if parent is not None and parent not in skills:
            raise DataError('missing purchase prerequisite')
        seen = {sid}
        while parent is not None:
            if parent in seen:
                raise DataError('cyclic purchase prerequisite')
            seen.add(parent)
            parent = data['purchase_stages'].get(parent, {}).get('prerequisite_id')
    for card_id, card in data.get('support_events', {}).items():
        if card_id not in data['supports'] or not card.get('source'):
            raise DataError('invalid support event owner or source')
        groups = set()
        for event in card['events']:
            if event['id'] in groups or not event['choices']:
                raise DataError('invalid event group')
            groups.add(event['id'])
            choices = set()
            for choice in event['choices']:
                if choice['id'] in choices:
                    raise DataError('duplicate event choice')
                choices.add(choice['id'])
                validate_rewards(card_id, choice['rewards'])
                # Evidence for other outcomes must not silently become extra rewards.
                outcomes = choice.get('outcomes')
                if outcomes is not None:
                    assumed = event.get('assumed_outcome')
                    if not isinstance(outcomes, dict) or assumed not in outcomes or outcomes[assumed] != choice['rewards']:
                        raise DataError('event assumed outcome differs from planning rewards')
                    for rewards in outcomes.values():
                        validate_rewards(card_id, rewards)
    event_ids = {event['id'] for card in data.get('support_events', {}).values() for event in card['events']}
    for scenario_id, entry in data.get('scenario_events', {}).items():
        if scenario_id not in data.get('scenarios', {}) or not entry.get('source'):
            raise DataError('invalid scenario event owner or source')
        for event in entry['events']:
            if event['id'] in event_ids or not event['choices']:
                raise DataError('invalid scenario event group')
            event_ids.add(event['id'])
            choices = set()
            for choice in event['choices']:
                if choice['id'] in choices:
                    raise DataError('duplicate scenario event choice')
                choices.add(choice['id'])
                validate_rewards(scenario_id, choice['rewards'], event['id'], choice['id'])
    for group in data.get('scenario_exclusive_groups', []):
        if 'max_count' not in group:
            continue
        ids = group['skill_ids']
        if type(group['max_count']) is not int or not 1 <= group['max_count'] <= len(ids) or len(set(ids)) != len(ids) or not group.get('source'):
            raise DataError('invalid scenario selection limit')
        for sid in ids:
            if not any(r['owner_type'] == 'scenario' and r['owner_id'] == group['scenario_id'] and r['evolved_id'] == sid for r in data.get('evolution_rules', [])):
                raise DataError('scenario limit skill is not a matching evolution')
    return True
