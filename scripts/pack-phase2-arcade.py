"""Validate and package the current Phase 2 submission, excluding credentials."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, re, sys, zipfile, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.tmp/pdf-review-tools'))
from pypdf import PdfReader
OUT=ROOT/'Farshore Context and Assisment/docs/assignment/phase2-arcade'
ARCHIVE=OUT/'Farshore-Phase-2-Arcade-Submission.zip'
D=json.loads((OUT/'editable/content.json').read_text(encoding='utf-8'))
assert len(D['screens'])==15 and len(D['flows'])==5 and len(D['wireframes'])==28
assert {w['state'] for w in D['wireframes'] if w['state'].startswith('A1 ')} >= {'A1 initial','A1 loading','A1 success','A1 uncertain','A1 error'}
assert all(any(w['screen']==s[0] for w in D['wireframes']) for s in D['screens'])
assert len(D['spike']['samples'])==6 and all(s['legal'] and s['providerExchanges'] for s in D['spike']['samples'])
assert sum(1 for f in D['spike']['failures'] if f['boundary']=='real provider' and f['status']>=400 and f['rawBody']) == 2
times=[s['seconds'] for s in D['spike']['samples']]
assert abs(sum(times)/6-D['spike']['latency']['average'])<.001
counts={}
for name,expected in [('Farshore-Phase-2-Arcade-Design-Packet.pdf',35),('Farshore-Phase-2-Arcade-Presentation.pdf',8),('technical-spike-summary.pdf',1),('contribution-statement.pdf',1)]:
    counts[name]=len(PdfReader(OUT/name).pages)
    assert counts[name]==expected,(name,counts[name])
with zipfile.ZipFile(OUT/'Farshore-Phase-2-Arcade-Presentation.pptx') as z:
    slides=[n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)]
    notes=[n for n in z.namelist() if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml',n)]
    assert len(slides)==8 and len(notes)==8
    for name in z.namelist():
        if name.endswith(('.xml','.rels')):ET.fromstring(z.read(name))
    assert sum(z.read(n).count(b'<a:tbl>') for n in slides)>=3
    assert sum(z.read(n).count(b'<p:sp>') for n in slides)>60
notes=(OUT/'speaker-notes.md').read_text(encoding='utf-8')
assert sum(map(int,re.findall(r'Timing: (\d+) seconds',notes)))==600
class Links(HTMLParser):
    def __init__(self):super().__init__();self.targets=[];self.ids=set()
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.add(a['id'])
        for attr in ['src','href']:
            if a.get(attr):self.targets.append(a[attr])
links=Links();links.feed((OUT/'index.html').read_text(encoding='utf-8'))
for target in links.targets:
    u=urlsplit(target)
    if u.scheme or u.netloc:continue
    if u.path:assert (OUT/unquote(u.path)).is_file(),target
    elif u.fragment:assert u.fragment in links.ids,target
files=sorted(p for p in OUT.rglob('*') if p.is_file() and p!=ARCHIVE)
extra=[
 'scripts/phase2-arcade-content.mjs','scripts/build-phase2-arcade.mjs','scripts/render-phase2-arcade.py',
 'scripts/render-phase2.py','scripts/verify-phase2-arcade-powerpoint.ps1','scripts/pack-phase2-arcade.py','scripts/phase2-arcade-spike.mjs',
 'server/arcade.ts','server/turn.ts','src/lib/arcade.ts','src/lib/game.ts','src/lib/turn.ts','src/lib/odyssey.ts',
 'src/ArcadeApp.tsx','src/lib/mythic.ts','public/art/title.png','public/story-sources.md',
 'package.json','package-lock.json',
 'Farshore Context and Assisment/docs/assignment/original/CMPS_4200_HCI_Phase_2_Project_Requirements.pdf',
 'Farshore Context and Assisment/docs/assignment/original/Farshore_Phase12nd.pptx',
 'Farshore Context and Assisment/docs/assignment/phase2/editable/content.json',
]
with zipfile.ZipFile(ARCHIVE,'w',zipfile.ZIP_DEFLATED) as z:
    for p in files:
        assert not any(part in {'.git','node_modules','.tmp'} or part.startswith('.env') for part in p.parts)
        z.write(p,'Farshore-Phase-2-Arcade/'+p.relative_to(OUT).as_posix())
    for name in extra:
        p=ROOT/name;assert p.is_file(),name
        z.write(p,'Farshore-Phase-2-Arcade/source-reference/'+name)
with zipfile.ZipFile(ARCHIVE) as z:
    assert z.testzip() is None
    assert not any('/.env' in n or '/node_modules/' in n for n in z.namelist())
print(json.dumps({'archive':str(ARCHIVE),'files':len(files)+len(extra),'pdfPages':counts,'screens':15,'flows':5,'wireframes':28,'modelCalls':6,'realProviderFailures':2,'presentationSeconds':600},indent=2))
