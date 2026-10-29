"""Validate and archive the explicit Phase 2 deliverables and source references."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tmp/pdf-review-tools'))
from pypdf import PdfReader

OUT = ROOT / 'Farshore Context and Assisment/docs/assignment/phase2'
ARCHIVE = OUT / 'Farshore-Phase-2-Submission.zip'
PREFIX = 'Farshore-Phase-2/'

extra = [
    'Farshore Context and Assisment/docs/assignment/original/CMPS_4200_HCI_Phase_2_Project_Requirements.pdf',
    'Farshore Context and Assisment/docs/assignment/original/Farshore_Phase12nd.pptx',
    'Farshore Context and Assisment/docs/AI-VERIFICATION.md',
    'Farshore Context and Assisment/docs/ai-verification-2026-09-23.json',
    'src/App.tsx', 'server/turn.ts', 'src/lib/dictation.ts',
    'src/lib/turn.ts', 'src/lib/game.ts', 'src/lib/odyssey.ts',
    'scripts/phase2-spike.mjs', 'scripts/phase2-content.mjs',
    'scripts/build-phase2.mjs', 'scripts/render-phase2.py',
    'scripts/verify-phase2-powerpoint.ps1', 'scripts/pack-phase2.py',
    'public/art/title.png', 'package.json', 'package-lock.json',
]
files = sorted(p for p in OUT.rglob('*') if p.is_file() and p != ARCHIVE)
files += [ROOT / p for p in extra]
for p in files:
    if not p.is_file():
        raise ValueError(f'Missing package file: {p}')
    p.resolve().relative_to(ROOT.resolve())
    if any(part in {'.git', 'node_modules', '.tmp'} or part.startswith('.env') for part in p.parts):
        raise ValueError(f'Excluded path: {p}')

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        for attr in ['href', 'src']:
            if attrs.get(attr):
                self.targets.append(attrs[attr])

links = Links()
links.feed((OUT / 'index.html').read_text(encoding='utf-8'))
file_set = {p.resolve() for p in files}
for target in links.targets:
    url = urlsplit(target)
    if url.scheme or url.netloc:
        continue
    if not url.path:
        if url.fragment and url.fragment not in links.ids:
            raise ValueError(f'Missing HTML anchor: {target}')
        continue
    destination = (OUT / unquote(url.path)).resolve()
    if destination not in file_set:
        raise ValueError(f'Link missing from package: {target}')

counts = {}
for name, expected in [
    ('Farshore-Phase-2-Design-Packet.pdf', 34),
    ('technical-spike-summary.pdf', 1),
    ('Farshore-Phase-2-Presentation.pdf', 12),
]:
    count = len(PdfReader(OUT / name).pages)
    if count != expected:
        raise ValueError(f'{name}: expected {expected} pages, found {count}')
    counts[name] = count

with zipfile.ZipFile(OUT / 'Farshore-Phase-2-Presentation.pptx') as deck:
    names = deck.namelist()
    slides = [n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)]
    notes = [n for n in names if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml', n)]
    if len(slides) != 12 or len(notes) != 12:
        raise ValueError('Expected 12 editable slides and 12 speaker-note parts')
    for n in names:
        if n.endswith('.xml') or n.endswith('.rels'):
            ET.fromstring(deck.read(n))
    if sum(deck.read(n).count(b'<a:tbl>') for n in slides) < 2:
        raise ValueError('The evidence tables must remain native editable tables')

content = json.loads((OUT / 'editable/content.json').read_text(encoding='utf-8'))
assert len(content['wireframes']) == 26
assert len(content['flows']) == 5
assert len(content['screens']) == 12
assert len(content['spike']['samples']) == 6
assert all(s['status'] == 200 and s['providerExchanges'] for s in content['spike']['samples'])
assert len(content['spike']['failures']) == 4
assert sum(f.get('status') in [400, 404] and f.get('rawBody') is not None for f in content['spike']['failures']) >= 2

start = '''# Farshore Phase 2

Open `Farshore Context and Assisment/docs/assignment/phase2/README.md` for the package guide.
Open that folder's `index.html` for the offline design reference.

The design packet covers the architecture, five user flows, edge cases and 26 wireframes.
The editable PowerPoint has 12 slides and a 10-minute speaking plan. A PDF copy is included.
The separate one-page technical spike summary accompanies the raw results of six real local AI calls and deliberate failures.

Before submission, review the contribution statement and collect actual class peer critique.
Persona references are Phase 1 sketches. Proposed controls are labeled as design work.

The archive preserves relative source links. Supporting source excerpts and authoring scripts are included for traceability.
This is a design submission package, not a complete game installation or model download.
Reproduction instructions assume the original project checkout, Node dependencies, Windows Arial fonts and PowerPoint.
PDF authoring requires reportlab; validation requires pypdf. Credentials, model weights, installed dependencies and private build files are excluded.
'''
with zipfile.ZipFile(ARCHIVE, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.writestr(PREFIX + 'START-HERE.md', start)
    for p in files:
        archive.write(p, PREFIX + p.relative_to(ROOT).as_posix())
with zipfile.ZipFile(ARCHIVE) as archive:
    if archive.testzip() is not None:
        raise ValueError('Archive integrity check failed')
    members = len(archive.namelist())

print(json.dumps({'archive': str(ARCHIVE), 'files': members,
    'pdfPages': counts, 'slides': 12, 'notes': 12,
    'wireframes': 26, 'flows': 5, 'screens': 12,
    'relativeLinksChecked': len(links.targets), 'bytes': ARCHIVE.stat().st_size}, indent=2))
