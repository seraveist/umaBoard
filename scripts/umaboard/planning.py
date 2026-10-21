"""Purchase stages proven by primary increments and secondary cumulative costs."""
from .common import DataError, identifier, number


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
                for reward in choice['rewards']:
                    if reward['skill_id'] not in skills or not isinstance(reward['hint_level'], int) or not 0 <= reward['hint_level'] <= 5:
                        raise DataError('invalid event skill or hint level')
    return True
