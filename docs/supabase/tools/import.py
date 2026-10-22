"""Idempotent import Sheet(xlsx export) -> Supabase via PostgREST. Upsert on sheet_row; deletes rows whose sheet_row no longer exists.
Usage: python3 import.py sheet.xlsx   (env SUPABASE_SERVICE_ROLE_KEY)"""
import openpyxl,json,os,sys,datetime,decimal,urllib.request,urllib.parse
import os,importlib; TABS=importlib.import_module(os.environ.get('TABSMOD','tabs')).TABS
URL='https://heuolwxyxoezkewyufrl.supabase.co/rest/v1/'; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
S=json.load(open(os.path.join(os.path.dirname(__file__),os.environ.get('SCHEMA','schema.json'))))
def req(m,path,body=None,extra={}):
  h={'apikey':K,'Authorization':'Bearer '+K,'Content-Type':'application/json',**extra}
  r=urllib.request.Request(URL+path,json.dumps(body).encode() if body is not None else None,h,method=m)
  with urllib.request.urlopen(r) as f: return f.headers,f.read()
def js(v):
  if isinstance(v,(datetime.datetime,datetime.date)): return v.isoformat()
  if isinstance(v,datetime.time): return v.isoformat()
  if isinstance(v,decimal.Decimal): return float(v)
  return v
def conv(v,ty):
  if v in (None,''): return None
  v=js(v)
  if ty=='numeric': return v if isinstance(v,(int,float)) and not isinstance(v,bool) else None
  if ty=='timestamptz': return v if isinstance(v,str) and v[:4].isdigit() and '-' in v[:8] else None
  if ty=='boolean': return v if isinstance(v,bool) else None
  return str(v)
BETA_SAFE=set()
def has_origin(t):
  try: req('GET',t+'?select=origin&limit=1'); return True
  except Exception: return False
wb=openpyxl.load_workbook(sys.argv[1],data_only=True,read_only=True); res={}
for tab,s in S.items():
  t=s['table']; hr=s['hr']
  if has_origin(t): BETA_SAFE.add(t)
  rows=list(wb[tab].iter_rows(values_only=True))
  hdr=rows[hr-1] if hr else ()
  recs=[]
  for n,r in enumerate(rows[hr:],start=hr+1):
    if not any(c not in (None,'') for c in r): continue
    orig={(str(hdr[i]) if i<len(hdr) and hdr[i] not in (None,'') else f'col_{i+1}'):js(c) for i,c in enumerate(r) if c not in (None,'')}
    d={'sheet_row':n,'orig':orig}
    for i,c,ty,_ in s['cols']: d[c]=conv(r[i] if i<len(r) else None,ty)
    recs.append(d)
  for i in range(0,len(recs),500):
    req('POST',t+'?on_conflict=sheet_row',recs[i:i+500],{'Prefer':'resolution=merge-duplicates,return=minimal'})
  keep={d['sheet_row'] for d in recs}
  flt='&sheet_row=gt.0'+('&origin=not.in.(beta,test)' if t in BETA_SAFE else '')   # nunca toca filas origin='beta' ni 'test' (sheet_row nulo o negativo)
  have=[]; off=0
  while True:   # paginado: PostgREST corta en 1000 filas
    _,b=req('GET',t+'?select=sheet_row'+flt+f'&order=sheet_row&limit=1000&offset={off}'); page=json.loads(b); have+=page; off+=1000
    if len(page)<1000: break
  gone=[x['sheet_row'] for x in have if x['sheet_row'] not in keep]
  for i in range(0,len(gone),200): req('DELETE',t+'?sheet_row=in.('+','.join(map(str,gone[i:i+200]))+')')
  h,_=req('HEAD',t+'?select=id'+('&origin=eq.sheet' if t in BETA_SAFE else ''),None,{'Prefer':'count=exact'})
  res[t]=(len(recs),int(h['Content-Range'].split('/')[1]))
  print(f"{t:22} sheet={len(recs):5} db={res[t][1]:5} {'OK' if res[t][0]==res[t][1] else 'MISMATCH'}")
