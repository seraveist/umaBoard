"""Source-specific adapters. Preserve race semantics; do not simulate a race."""
import json
import re
from collections import Counter

from .common import DataError, canonical_bytes, identifier, number, rows

# Classification only. Values and source timing/scaling remain explicit raw fields.
EFFECT_KINDS = {1:'passive_speed', 2:'passive_stamina', 3:'passive_power', 4:'passive_guts',
                5:'passive_wisdom', 6:'oonige', 8:'vision', 9:'heal', 10:'start_multiplier',
                13:'temptation_duration', 14:'start_offset', 21:'current_speed',
                22:'speed_with_decel', 27:'target_speed', 28:'lane_change_speed',
                29:'temptation_rate', 31:'acceleration', 32:'passive_all',
                35:'lane_position', 37:'invoke_rare', 38:'full_spurt_acceleration',
                41:'invoke_group', 42:'evolution_duration', 49:'invoke_unique', 50:'ignore_popularity'}
MEE_KINDS = {'targetSpeed':'target_speed','acceleration':'acceleration','speedWithDecel':'speed_with_decel',
             'currentSpeed':'current_speed','heal':'heal','passiveSpeed':'passive_speed',
             'passiveStamina':'passive_stamina','passivePower':'passive_power','passiveGuts':'passive_guts',
             'passiveWisdom':'passive_wisdom','passiveAll':'passive_all','fullSpurtAcceleration':'full_spurt_acceleration',
             'startMultiply':'start_multiplier','startAdd':'start_offset','temptationRate':'temptation_rate',
             'invokeRare':'invoke_rare','invokeUnique':'invoke_unique','evoDurationUp':'evolution_duration',
             'oonige':'oonige','ignorePopularity':'ignore_popularity','fixLane':'lane_position','laneChangeSpeed':'lane_change_speed'}
RARITIES={1:'white',2:'gold',3:'unique_low_star',4:'unique_upgraded',5:'unique',6:'evolution'}
TOKEN=re.compile(r'^([A-Za-z_][A-Za-z_0-9]*)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$')


def condition_ast(raw):
    if not isinstance(raw,str):
        raise DataError('condition: expected a string')
    if raw == '':
        return []
    result=[]
    for disjunction in raw.split('@'):
        group=[]
        for atom in disjunction.split('&'):
            match=TOKEN.fullmatch(atom.strip())
            if not match:
                return None
            field,operator,value=match.groups()
            group.append({'field':field,'operator':operator,'value':float(value) if '.' in value else int(value)})
        result.append(group)
    return result


def mee_condition(value):
    if value is None:
        return []
    if not isinstance(value,list):
        raise DataError('umasim condition: expected DNF array')
    result=[]
    for group in value:
        if not isinstance(group,list):raise DataError('umasim condition group: expected array')
        result.append([{'field':a['type'],'operator':a['operator'],'value':a['value']} for a in group])
    return result


def categories(invocations):
    kinds={e['kind'] for i in invocations for e in i['effects']}
    result=[]
    if kinds & {'target_speed','current_speed','speed_with_decel'}:result.append('speed')
    if kinds & {'acceleration','full_spurt_acceleration'}:result.append('acceleration')
    if 'heal' in kinds:result.append('heal')
    if kinds & {'passive_speed','passive_stamina','passive_power','passive_guts','passive_wisdom','passive_all'}:result.append('passive')
    return result or ['other']


def decode_primary(row, parent=None):
    sid=identifier(row['id'],'skill ID')
    rarity=row['rarity']
    inherited=bool(row.get('inherited')) or parent is not None
    invocations=[]
    for index,group in enumerate(rows(row['condition_groups'],'condition_groups'),1):
        effects=[]
        for effect in rows(group['effects'],'effects'):
            code=number(effect['type'],'effect type')
            effects.append({'kind':EFFECT_KINDS.get(code,'unknown'),'source_type':code,
                            'value_raw':number(effect['value'],'effect value'),'unit':'umatools_raw',
                            'extras_raw':{k:v for k,v in effect.items() if k not in {'type','value'}}})
        invocations.append({'index':index,'condition_raw':group['condition'],
                            'condition':condition_ast(group['condition']),
                            'precondition_raw':group.get('precondition',''),
                            'precondition':condition_ast(group.get('precondition','')),
                            'duration_raw':number(group['base_time'],'base_time'),
                            'duration_unit':'umatools_base_time','time_scale_raw':group.get('time_scale'),
                            'cooldown_raw':group.get('cd'),'effects':effects,
                            'extras_raw':{k:v for k,v in group.items() if k not in {'base_time','condition','precondition','time_scale','cd','effects'}}})
    region=row.get('unreleased',(parent or {}).get('unreleased',[]))
    if not isinstance(region,list) or not all(isinstance(x,str) for x in region):
        raise DataError(f'{sid}: unreleased must be a regional-code array')
    raw_parents=row.get('parent_skills',[]) or ([parent['id']] if parent else [])
    return {'id':sid,'name_jp':row.get('jpname') or (parent or {}).get('jpname') or (parent or {}).get('name_en') or row.get('name_en') or sid,
            'name_ko':row.get('name_ko') or (parent or {}).get('name_ko'),
            'description_jp':row.get('jpdesc') or (parent or {}).get('jpdesc',''),
            'rarity':'inherited' if inherited else RARITIES.get(rarity,'unknown'),
            'source_rarity':rarity,'inherited':inherited,'parent_ids':[identifier(x) for x in raw_parents],
            'categories':categories(invocations),'invocations':invocations,
            'activation_raw':row.get('activation'),'flags':row.get('type',(parent or {}).get('type',[])),
            'jp_available':not ({'jp','ja','japan'} & {x.lower() for x in region}),
            'release_evidence':'source_regional_status','calculation_status':'unvalidated',
            'origin':'umatools','provenance':['umatools'],
            'unknown_effect_codes':sorted({e['source_type'] for i in invocations for e in i['effects'] if e['kind']=='unknown'}),
            'unparsed_condition':any(i['condition'] is None or i['precondition'] is None for i in invocations),
            '_comparison_cost':row.get('cost')}


def decode_secondary(row):
    invocations=[]
    for inv in rows(row['invokes'],'umasim invokes'):
        effects=[{'kind':MEE_KINDS.get(e['type'],'unknown'),'source_type':e['type'],
                  'value_raw':number(e['value'],'umasim effect value'),'unit':'umasim_raw',
                  'extras_raw':{k:v for k,v in e.items() if k not in {'type','value'}}} for e in rows(inv['effects'],'umasim effects')]
        invocations.append({'index':inv['index'],'condition':mee_condition(inv.get('conditions',[])),
                            'precondition':mee_condition(inv.get('preConditions',[])),
                            'condition_raw':None,'precondition_raw':None,
                            'duration_raw':number(inv.get('duration',0),'umasim duration'),
                            'duration_unit':'umasim_seconds_at_base_distance','time_scale_raw':None,
                            'cooldown_raw':inv.get('cooldown'),'effects':effects,
                            'extras_raw':{k:v for k,v in inv.items() if k not in {'index','skillId','conditions','preConditions','duration','cooldown','effects'}}})
    if row.get('rarity') != 'inherit':
        raise DataError(f"{row['id']}: unreviewed secondary-only skill kind")
    return {'id':identifier(row['id']),'name_jp':row['name'],'name_ko':None,
            'description_jp':(row.get('info') or [''])[0],'rarity':'inherited','source_rarity':'inherit',
            'inherited':True,'parent_ids':[],'categories':categories(invocations),'invocations':invocations,
            'activation_raw':row.get('activateLot'),'flags':[],'jp_available':True,
            'release_evidence':'secondary_inheritance_supplement','calculation_status':'unvalidated',
            'origin':'umasim','provenance':['umasim'],'unknown_effect_codes':[],
            'unparsed_condition':False,'_comparison_cost':row.get('sp')}


def flat_ids(value):
    if not isinstance(value,list):raise DataError('acquisition references must be arrays')
    for item in value:
        if isinstance(item,list):yield from flat_ids(item)
        else:yield identifier(item)


def normalize(raw, curated):
    primary=rows(raw['skills'],'skills_all.json')
    labels=curated.get('korean_names',{})
    names=labels.get('names',{});aliases=labels.get('aliases',{})
    if not isinstance(names,dict) or any(not isinstance(v,str) or not v.strip() for v in names.values()):
        raise DataError('Korean character names must be nonempty strings')
    if not isinstance(aliases,dict) or any(not isinstance(v,list) or any(not isinstance(a,str) for a in v) for v in aliases.values()):
        raise DataError('Korean search aliases must be string arrays')
    outfits={}
    for row in rows(raw['outfits'],'uma_data.json'):
        sid=identifier(row['UmaId'])
        if sid in outfits:raise DataError('duplicate outfit ID '+sid)
        outfits[sid]={'id':sid,'name_jp':row['UmaNameJP'],'name_ko':names.get(row['UmaNameJP']),
                      'search_aliases_ko':aliases.get(row['UmaNameJP'],[]),'outfit_name_jp':row.get('UmaNicknameJP',''),
                      'base_stars':row['UmaBaseStars'],'aptitudes':row.get('UmaAptitudes',{}),
                      'awakening':'MAX','origin':'umatools'}
    supports={}
    for row in rows(raw['supports'],'support_hints.json'):
        sid=identifier(row['SupportId'])
        if sid in supports:raise DataError('duplicate support ID '+sid)
        character_name=re.sub(r'\s+\((SSR|SR|R)\)$','',row['SupportNameJP'])
        # Group names are card titles, not character names; preserve Japanese.
        supports[sid]={'id':sid,'name_jp':row['SupportNameJP'],
                       'name_ko':names.get(character_name) if row['SupportType']!='Group' else None,
                       'search_aliases_ko':aliases.get(character_name,[]),'rarity':row['SupportRarity'],
                       'type':row['SupportType'],'origin':'umatools'}
    skills={};routes={};relations={};evolutions={};costs={}
    def add_route(sid,owner_type,owner_id,kind,**extra):
        r={'skill_id':sid,'owner_type':owner_type,'owner_id':identifier(owner_id),
           'kind':kind,'event_conditions_affect_candidates':False,**extra}
        routes[canonical_bytes(r)]=r
    def add_relation(kind,parent,child,**extra):
        r={'kind':kind,'from_id':identifier(parent),'to_id':identifier(child),**extra}
        if r['from_id']!=r['to_id']:relations[canonical_bytes(r)]=r
    def add_evolution(base,evolved,owner_type,owner_id,conditions=None):
        r={'base_id':identifier(base),'evolved_id':identifier(evolved),
           'owner_type':owner_type,'owner_id':identifier(owner_id),
           'conditions_raw':conditions,'conditions_assumed_met':True,
           'choice_group':f'{owner_type}:{owner_id}:{base}'}
        key=(r['base_id'],r['evolved_id'],owner_type,r['owner_id'])
        if key not in evolutions or conditions is not None:evolutions[key]=r
        add_relation('evolution',base,evolved,owner_type=owner_type,owner_id=identifier(owner_id))
    def add_skill(row,parent=None):
        rec=decode_primary(row,parent)
        sid=rec['id'];cost=rec.pop('_comparison_cost')
        if cost is not None:costs[sid]=number(cost,'comparison cost')
        if sid in skills:
            old=skills[sid]
            for field in ('invocations','rarity','activation_raw'):
                if old[field]!=rec[field]:raise DataError(f'{sid}: conflicting duplicate {field}')
            old['parent_ids']=sorted(set(old['parent_ids']+rec['parent_ids']))
        else:skills[sid]=rec
        for pid in rec['parent_ids']:add_relation('inheritance',pid,sid)
        for key,owner_type,kind in [('char','outfit','self'),('char_e','outfit','outfit_event'),('sup_hint','support','support_hint'),('sup_e','support','support_event'),('sce_e','scenario','scenario_event')]:
            for oid in flat_ids(row.get(key,[])):add_route(sid,owner_type,oid,kind)
        # "versions" is a family relation, not an inferred lower-skill ordering.
        for other in row.get('versions',[]):add_relation('version_family',sid,other)
        pre=row.get('pre_evo')
        if pre:
            typ='scenario' if 'scenario_id' in pre else 'outfit'
            oid=pre.get('scenario_id',pre.get('card_id'))
            if oid is None:raise DataError(f'{sid}: evolution owner missing')
            add_evolution(pre['old'],sid,typ,oid,row.get('evo_cond'))
        for rule in row.get('evo',[]):
            typ='scenario' if 'scenario_id' in rule else 'outfit'
            oid=rule.get('scenario_id',rule.get('card_id'))
            if oid is None:raise DataError(f'{sid}: evolution owner missing')
            for evo in rule['evos']:add_evolution(sid,evo,typ,oid)
        if row.get('gene_version'):add_skill(row['gene_version'],row)
    for row in primary:add_skill(row)
    # The hint catalog includes pseudo bonuses with no SkillId; they are not skills.
    for row in raw['supports']:
        for hint in row.get('SupportHints',[]):
            if hint.get('SkillId'):add_route(identifier(hint['SkillId']),'support',row['SupportId'],'support_hint')
    secondary=rows(raw['secondary_skills'],'skill_data.txt')
    secondary_by={identifier(x['id']):x for x in secondary}
    if len(secondary_by)!=len(secondary):raise DataError('duplicate umasim skill ID')
    secondary_only=sorted(set(secondary_by)-set(skills))
    for sid in secondary_only:
        rec=decode_secondary(secondary_by[sid]);cost=rec.pop('_comparison_cost')
        skills[sid]=rec
        if cost is not None:costs[sid]=number(cost,'comparison cost')
    for link in curated.get('inheritance_links',[]):
        pid=identifier(link['parent_skill_id']);sid=identifier(link['inherited_skill_id'])
        if pid not in skills or sid not in skills:raise DataError('curated inheritance reference missing')
        skills[sid]['parent_ids']=sorted(set(skills[sid]['parent_ids']+[pid]))
        add_relation('inheritance',pid,sid)
    for sid in curated.get('jp_unavailable_skill_ids',[]):
        if sid not in skills:raise DataError('curated JP release reference missing: '+sid)
        skills[sid]['jp_available']=False;skills[sid]['release_evidence']='curated_jp_gate'
    for skill in skills.values():
        if skill['inherited'] and skill['parent_ids'] and not any(skills[pid]['jp_available'] for pid in skill['parent_ids'] if pid in skills):
            skill['jp_available']=False;skill['release_evidence']='inherited_parent_jp_status'
    scenario_ids={r['owner_id'] for r in routes.values() if r['owner_type']=='scenario'} | {r['owner_id'] for r in evolutions.values() if r['owner_type']=='scenario'}
    scenarios={sid:{'id':sid,'name_jp':curated.get('scenario_names',{}).get(sid,f'シナリオ {sid}'),
                    'rules_status':'partial','origin':'observed_acquisition_and_evolution'} for sid in sorted(scenario_ids)}
    for rule in curated.get('scenario_extra_routes',[]):
        add_route(identifier(rule['skill_id']),'scenario',rule['scenario_id'],'scenario_curated',requirements=rule.get('requirements',{}))
    courses={}
    if not isinstance(raw['courses'],dict) or not raw['courses']:raise DataError('courses: expected nonempty dictionary')
    for sid,c in raw['courses'].items():
        identifier(sid,'course ID')
        distance=number(c['distance'],'course distance')
        if distance<=0:raise DataError('course distance must be positive')
        courses[sid]={'id':sid,'track_id':identifier(c['raceTrackId']),'distance':distance,
                      'distance_type':c['distanceType'],'surface':c['surface'],'turn':c['turn'],
                      'course_variant':c.get('course'),'course_set_status':c.get('courseSetStatus',[]),
                      'corners':c['corners'],'straights':c['straights'],'slopes':c['slopes'],
                      'coordinate_system':'alpha_source_coordinates','run_up_m':None,
                      'calculation_status':'unvalidated','selectable':sid not in curated.get('course_exclusions',[]),
                      'geometry_review_reason':curated.get('course_exclusion_reasons',{}).get(sid),
                      'origin':'courses'}
    # Cross-source comparison is a diagnostic, not a second effect application.
    common=set(skills)&set(secondary_by)-set(secondary_only)
    different_names=[sid for sid in sorted(common) if skills[sid]['name_jp']!=secondary_by[sid]['name']]
    diagnostics={'secondary_only_ids':secondary_only,'primary_only_ids':sorted(set(skills)-set(secondary_by)),
                 'missing_korean_character_names':sorted({o['name_jp'] for o in outfits.values() if not o['name_ko']}
                     | {re.sub(r'\s+\((SSR|SR|R)\)$','',s['name_jp']) for s in supports.values() if s['type']!='Group' and not s['name_ko']}),
                 'shared_ids':len(common),'shared_name_differences':different_names,
                 'unknown_effect_codes':dict(Counter(str(code) for s in skills.values() for code in s['unknown_effect_codes'])),
                 'unparsed_conditions':sum(s['unparsed_condition'] for s in skills.values())}
    dataset={'schema_version':1,'server':'JP','calculation_status':'unvalidated',
             'skills':skills,'outfits':outfits,'supports':supports,'scenarios':scenarios,'courses':courses,
             'acquisition_routes':sorted(routes.values(),key=lambda x:canonical_bytes(x)),
             'relations':sorted(relations.values(),key=lambda x:canonical_bytes(x)),
             'evolution_rules':sorted(evolutions.values(),key=lambda x:canonical_bytes(x)),
             'scenario_exclusive_groups':curated.get('scenario_exclusive_groups',[]),
             'race_presets':curated.get('race_presets',[]),
             'internal_acceleration_comparison_cost':costs,
             'curation':{'status':curated['review_status'],'pending':curated.get('pending',[])},
             'diagnostics':diagnostics}
    if labels.get('source'):dataset['curation']['korean_names_source']=labels['source']
    return dataset
