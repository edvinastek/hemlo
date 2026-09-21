import openpyxl, json, re, unicodedata
SRC='/mnt/user-data/uploads/GETIT/PRO_GRESS_v2.xlsx'
wb=openpyxl.load_workbook(SRC, read_only=True, data_only=True)

def rows(name):
    return [r for r in wb[name].iter_rows(values_only=True) if any(c not in (None,'') for c in r)]

def num(v):
    if v is None or v=='': return None
    try: return round(float(v),4)
    except: return None

# ---- foods -------------------------------------------------------------
foods=[]; seen=set()
for r in rows('D_Food')[1:]:
    name=(r[1] or '').strip()
    if not name: continue
    key=name.lower()
    if key in seen: continue
    seen.add(key)
    foods.append({'name':name,'kcal':num(r[2]),'carbs_g':num(r[3]),'fiber_g':num(r[4]),
                  'fat_g':num(r[5]),'protein_g':num(r[6])})

# ---- exercises ---------------------------------------------------------
exercises=[]; seen=set()
for r in rows('D_Exercises')[1:]:
    name=(r[1] or '').strip()
    if not name or name.lower() in seen: continue
    seen.add(name.lower())
    exercises.append({'name':name})

# ---- recipes -----------------------------------------------------------
GRAM=re.compile(r'(\d+(?:[.,]\d+)?)\s*g\b', re.I)
def parse_lines(txt):
    out=[]
    for raw in (txt or '').splitlines():
        line=unicodedata.normalize('NFKC', raw).strip()
        if not line: continue
        parts=re.split(r'\s[–—-]\s', line, maxsplit=1)
        food=parts[0].strip(' -–—')
        qty=parts[1].strip() if len(parts)>1 else ''
        grams=None
        m=list(GRAM.finditer(qty)) or list(GRAM.finditer(line))
        if m: grams=float(m[-1].group(1).replace(',','.'))
        out.append({'food':food,'grams':grams,'raw_qty':qty or None})
    return out

recipes=[]
for r in rows('D_Meals')[1:]:
    name=(r[1] or '').strip()
    if not name: continue
    recipes.append({'name':name,'kcal':num(r[2]),'carbs_g':num(r[3]),'fiber_g':num(r[4]),
                    'fat_g':num(r[5]),'protein_g':num(r[6]),'lines':parse_lines(r[7])})
wb.close()

out={'foods':foods,'exercises':exercises,'recipes':recipes}
with open('/home/claude/getit/seed/catalogue.json','w',encoding='utf-8') as f:
    json.dump(out,f,ensure_ascii=False,indent=1)

# ---- match report ------------------------------------------------------
fnames={f['name'].lower() for f in foods}
tot=unmatched=nograms=0
miss=[]
for rc in recipes:
    for l in rc['lines']:
        tot+=1
        if l['grams'] is None: nograms+=1
        if l['food'].lower() not in fnames:
            unmatched+=1; miss.append(l['food'])
print(f"foods={len(foods)} exercises={len(exercises)} recipes={len(recipes)}")
print(f"ingredient lines={tot}  no grams={nograms}  unmatched to D_Food={unmatched}")
print("sample unmatched:", sorted(set(miss))[:15])
