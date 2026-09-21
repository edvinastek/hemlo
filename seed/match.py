import json, re, difflib
d=json.load(open('/home/claude/getit/seed/catalogue.json'))
foods=d['foods']
index={}
for f in foods: index.setdefault(f['name'].lower(), f)
names=list(index)

STATE=re.compile(r'\((?P<s>[^)]*)\)')
STATE_WORDS={'cooked':'cooked','steamed':'cooked','grilled':'cooked','boiled':'cooked',
 'baked':'cooked','roasted':'cooked','raw':'raw','canned':'canned','dried':'dried',
 'unsweetened':None,'low-fat':None,'lean':None,'mixed':None,'skinless':None}

def norm(s):
    s=s.lower().strip()
    state=None
    for m in STATE.finditer(s):
        for w in re.split(r'[,\s]+', m.group('s')):
            if w in STATE_WORDS and STATE_WORDS[w]: state=STATE_WORDS[w]
    s=STATE.sub('', s)
    s=re.sub(r'\b(fresh|raw|whole|large|medium|small)\b','',s)
    s=re.sub(r'[^a-z\s-]','',s).strip()
    s=re.sub(r'\s+',' ',s)
    return s, state

def singular(s):
    for suf,rep in (('ies','y'),('oes','o'),('s','')):
        if s.endswith(suf) and len(s)>4: return s[:-len(suf)]+rep
    return s

def resolve(raw):
    base,state=norm(raw)
    for cand in (base, singular(base), ' '.join(singular(w) for w in base.split())):
        if cand in index: return index[cand]['name'], state, 'exact'
    hit=difflib.get_close_matches(base, names, n=1, cutoff=0.86)
    if hit: return index[hit[0]]['name'], state, 'fuzzy'
    hit=difflib.get_close_matches(singular(base), names, n=1, cutoff=0.82)
    if hit: return index[hit[0]]['name'], state, 'fuzzy'
    return None, state, 'none'

stats={'exact':0,'fuzzy':0,'none':0}; unresolved=[]
for rc in d['recipes']:
    for l in rc['lines']:
        m,state,how=resolve(l['food'])
        l['matched_food']=m; l['state']=state; l['match']=how
        stats[how]+=1
        if how=='none': unresolved.append(l['food'])
json.dump(d, open('/home/claude/getit/seed/catalogue.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(stats)
print('unresolved:', sorted(set(unresolved)))
