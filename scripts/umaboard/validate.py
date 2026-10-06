"""Validation gates shared by CI and the synchronization publisher."""
from .common import DataError, identifier, number


def validate_dataset(data, config, previous=None, allow_count_decrease=False):
    if data.get('server')!='JP' or data.get('schema_version')!=1:raise DataError('unsupported bundle contract')
    counts={key:len(data[key]) for key in ['skills','outfits','supports','courses']}
    for key,count in counts.items():
        if count<config.get('minimum_records',{}).get(key,1):raise DataError(f'{key}: unexpectedly small source ({count})')
        if previous and not allow_count_decrease:
            old=len(previous[key]);threshold=config.get('maximum_count_decrease_ratio',0.05)
            if count<old*(1-threshold):raise DataError(f'{key}: count decrease requires review ({old} -> {count})')
        for sid,row in data[key].items():
            identifier(sid)
            if row['id']!=sid:raise DataError(f'{key}: key and ID differ')
    skills=data['skills'];warnings=[]
    for skill in skills.values():
        if skill['calculation_status']!='unvalidated':raise DataError('this adapter cannot declare race calculation validated')
        for pid in skill['parent_ids']:
            if pid not in skills:raise DataError(f"{skill['id']}: inherited parent missing {pid}")
    for route in data['acquisition_routes']:
        sid=route['skill_id'];typ=route['owner_type'];oid=route['owner_id']
        if sid not in skills:raise DataError('missing route skill '+sid)
        owner={'outfit':'outfits','support':'supports','scenario':'scenarios'}.get(typ)
        if not owner or oid not in data[owner]:raise DataError(f'missing route owner {typ}:{oid}')
        if route['event_conditions_affect_candidates']:raise DataError('event conditions must not restrict candidates')
    for rel in data['relations']:
        if rel['from_id'] not in skills or rel['to_id'] not in skills:raise DataError(f'missing relation endpoint {rel}')
    for rule in data['evolution_rules']:
        if rule['base_id'] not in skills or rule['evolved_id'] not in skills:raise DataError('missing evolution endpoint')
        owner={'outfit':'outfits','scenario':'scenarios'}.get(rule['owner_type'])
        if not owner or rule['owner_id'] not in data[owner]:raise DataError('missing evolution owner')
    for group in data['scenario_exclusive_groups']:
        if group['scenario_id'] not in data['scenarios']:raise DataError('missing exclusive-group scenario')
        if any(sid not in skills for sid in group['skill_ids']):raise DataError('missing exclusive-group skill')
    for sid,cost in data['internal_acceleration_comparison_cost'].items():
        if sid not in skills or number(cost,'cost')<0:raise DataError('invalid internal comparison cost')
    for course in data['courses'].values():
        distance=number(course['distance'],'distance');maximum=distance
        for key in ('corners','straights','slopes'):
            if not isinstance(course[key],list):raise DataError('segments must be arrays')
            last_start=-1
            # Slope arrays in source are not necessarily ordered; retain their original order.
            for segment in course[key]:
                start=number(segment['start'],'segment start')
                end=number(segment['end'],'segment end') if key=='straights' else start+number(segment['length'],'segment length')
                if start<0 or end<=start:raise DataError(f"{course['id']}: invalid {key} interval")
                if end>distance+200 and not (not course['selectable'] and course.get('geometry_review_reason')):
                    raise DataError(f"{course['id']}: out-of-range {key} interval requires quarantine")
                if key!='slopes' and start<last_start:raise DataError('unsorted course interval')
                if key=='slopes':number(segment['slope'],'slope')
                if key=='straights' and 'frontType' not in segment:raise DataError('straight classification missing')
                last_start=start;maximum=max(maximum,end)
        if course.get('geometry_review_reason'):
            warnings.append({'kind':'course_quarantined','course_id':course['id'],'reason':course['geometry_review_reason']})
        elif maximum>distance:warnings.append({'kind':'course_coordinate_origin_requires_review','course_id':course['id'],'maximum_end':maximum,'race_distance':distance})
    if data['curation']['status']!='complete':warnings.append({'kind':'manual_curation_pending','items':data['curation']['pending']})
    if data['diagnostics']['unknown_effect_codes']:warnings.append({'kind':'unknown_effects_preserved','codes':data['diagnostics']['unknown_effect_codes']})
    if data['diagnostics']['unparsed_conditions']:warnings.append({'kind':'condition_parser_partial','count':data['diagnostics']['unparsed_conditions']})
    if data['diagnostics'].get('missing_korean_character_names'):
        warnings.append({'kind':'korean_character_name_missing','names_jp':data['diagnostics']['missing_korean_character_names']})
    return {'schema_version':1,'status':'passed','counts':counts,'acquisition_routes':len(data['acquisition_routes']),
            'evolution_rules':len(data['evolution_rules']),'relations':len(data['relations']),
            'warnings':warnings,'race_calculation_validated':False}
