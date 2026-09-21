import json, re
d=json.load(open('/home/claude/getit/seed/catalogue.json'))
foods=d['foods']; byname={f['name'].lower():f for f in foods}

# D_Food is a USDA-style list with inverted names ("Fish Cod Atlantic").
# Token-overlap scoring handles that; ALIAS covers items the catalogue calls
# something else, and MISSING are real foods it simply does not contain.
ALIAS={
 'peanut butter':'Butter Peanut Smooth','hard-boiled egg':'Egg Chicken',
 'baked cod':'Fish Cod Atlantic','grilled chicken breast':'Chicken Broiler/Fryer Breast Meat',
 'turkey breast (grilled)':'Turkey Breast Meat','salmon fillet (grilled or baked)':'Fish Salmon Atlantic Farmed',
 'tuna (canned in water, drained)':'Fish Tuna Skipjack','greek yogurt (plain)':'Yogurt Greek',
 'greek yogurt (plain, low-fat)':'Yogurt Greek','romaine lettuce':'Lettuce Cos/Romaine',
 'mixed greens':'Lettuce Green Leaf','red bell pepper':'Bell Peppers',
 'cucumber slices':'Cucumber (with peel)','cucumber':'Cucumber (with peel)',
 'carrot sticks':'Carrot','cherry tomatoes':'Tomato Red Ripe',
 'sliced strawberries':'Strawberry','frozen berries':'Strawberry','berries (mixed)':'Strawberry',
 'steamed broccoli':'Broccoli','zucchini (grilled)':'Squash Winter Zucchini (with skin)',
 'tofu (firm, grilled)':'Tofu Firm','blueberries':'Blueberry','raspberries':'Raspberry','whole-wheat toast':'Whole-wheat bread','beef steak (grilled, lean)':'Beef Top Sirloin',
}
# Foods the D_Food sheet has no row for - added to the catalogue as new entries.
MISSING=[
 {'name':'Whole-wheat bread','kcal':247,'carbs_g':41.0,'fiber_g':7.0,'fat_g':3.4,'protein_g':13.0},
 {'name':'Whole-wheat pita','kcal':266,'carbs_g':55.7,'fiber_g':7.4,'fat_g':2.6,'protein_g':9.8},
 {'name':'Whole-wheat pasta (cooked)','kcal':124,'carbs_g':26.5,'fiber_g':3.2,'fat_g':0.5,'protein_g':5.3},
 {'name':'Hummus','kcal':166,'carbs_g':14.3,'fiber_g':6.0,'fat_g':9.6,'protein_g':7.9},
 {'name':'Mixed nuts','kcal':607,'carbs_g':21.0,'fiber_g':7.0,'fat_g':54.0,'protein_g':20.0},
 {'name':'Whey protein powder','kcal':375,'carbs_g':10.0,'fiber_g':0.0,'fat_g':5.0,'protein_g':75.0},
]
STATE=re.compile(r'\(([^)]*)\)')
COOK={'cooked','steamed','grilled','boiled','baked','roasted','drained'}
STOP={'and','with','or','in','the','a','of','sliced','slices','sticks','fillet','breast','plain','mixed','frozen','fresh','low-fat','lean','unsweetened','firm','whole','large','medium','small','water','canned'}

def tokens(s):
    s=STATE.sub(' ', s.lower())
    s=re.sub(r'[^a-z\s-]',' ',s)
    t={w for w in s.split() if w not in STOP and len(w)>2}
    return {w[:-1] if w.endswith('s') and len(w)>4 else w for w in t}

def state_of(raw):
    words={w.strip().lower() for m in STATE.finditer(raw) for w in re.split(r'[,\s]+',m.group(1))}
    if words & COOK: return 'cooked'
    if 'canned' in words: return 'canned'
    if any(w in raw.lower() for w in ('baked','grilled','steamed','boiled','cooked','roasted')): return 'cooked'
    return 'raw'

for f in MISSING:
    if f['name'].lower() not in byname:
        foods.append(f); byname[f['name'].lower()]=f
cand=[(f['name'], tokens(f['name'])) for f in foods]

def resolve(raw):
    k=raw.lower().strip()
    if k in ALIAS: return ALIAS[k],'alias'
    if k in byname: return byname[k]['name'],'exact'
    for m in MISSING:
        if tokens(m['name']) & tokens(raw) and len(tokens(m['name']) & tokens(raw))>=2:
            return m['name'],'added'
    t=tokens(raw)
    if not t: return None,'none'
    best,score=None,0.0
    for name,ct in cand:
        if not ct: continue
        inter=len(t&ct)
        if not inter: continue
        s=inter/len(t|ct) + 0.15*(inter==len(t))
        if s>score: best,score=name,s
    return (best,'token') if score>=0.45 else (None,'none')

stats={}; un=[]
for rc in d['recipes']:
    for l in rc['lines']:
        m,how=resolve(l['food'])
        l['matched_food']=m; l['match']=how; l['state']=state_of(l['food'])
        stats[how]=stats.get(how,0)+1
        if not m: un.append(l['food'])
d['foods']=foods
json.dump(d, open('/home/claude/getit/seed/catalogue.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('foods now:',len(foods),'| line matches:',stats)
print('still unresolved:', sorted(set(un)))
