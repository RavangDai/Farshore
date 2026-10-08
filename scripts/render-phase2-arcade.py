"""Current arcade design artifacts. Native OOXML fallback, no python-pptx.

Reuse the verified local drawing/export backend, with independent current content.
All tables, diagrams and wireframes remain editable PowerPoint objects.
"""
import importlib.util, json, sys
from xml.sax.saxutils import escape
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('phase2_backend', ROOT/'scripts/render-phase2.py')
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)
Page, bullets, draw_pdf, pptx = backend.Page, backend.bullets, backend.draw_pdf, backend.pptx
OUT = ROOT/'Farshore Context and Assisment/docs/assignment/phase2-arcade'
BUILD = ROOT/'.tmp/phase2-arcade-build'
BUILD.mkdir(parents=True, exist_ok=True)
D = json.loads((OUT/'editable/content.json').read_text(encoding='utf-8'))
NAVY, TEAL, GRAY, GOLD = backend.NAVY, backend.TEAL, backend.GRAY, backend.GOLD

def site(p,x,y,w,h):
    sx=w/1150;sy=h/460
    def box(label,a,b,ww,hh=56):
        p.box(x+a*sx,y+b*sy,ww*sx,hh*sy)
        p.text(label,x+(a+10)*sx,y+(b+10)*sy,(ww-20)*sx,21*sx,bold=True)
    for label,a,ww in [('S01 Title',0,200),('S02 Intro',260,210),('S03 Map',530,220),('S04 Briefing [A1]',810,330)]:box(label,a,0,ww)
    for a,b in [(200,260),(470,530),(750,810)]:p.arrow(x+a*sx,y+28*sy,x+b*sx,y+28*sy)
    # Each briefing chooses one game. Connections show the choice as a fan-out.
    for i,label in enumerate(['S05 Cyclops\nGrid stealth','S06 Circe\nPuzzle duel','S07 Sirens\nMelody memory','S08 Strait\nPaddle deflector','S09 Bow\nTurn-based shots']):
        box(label,i*230,145,210,85)
        p.arrow(x+975*sx,y+56*sy,x+(i*230+105)*sx,y+145*sy)
        p.arrow(x+(i*230+105)*sx,y+230*sy,x+440*sx,y+310*sy)
    box('S10 Round result',285,310,310)
    box('S11 Homecoming',770,310,350)
    p.arrow(x+595*sx,y+338*sy,x+770*sx,y+338*sy)
    p.text('Clear or assist returns to Map for the next shore. The fifth passage opens Homecoming.',x,y+389*sy,w,20*sx,color=GRAY)
    p.text('Shared overlays: S12 Settings, S13 Pause/leave, S14 Restart, S15 Assisted passage',x,y+428*sy,w,20*sx,color=GRAY)

def dataflow(p,x,y,w,h):
    sx=w/1150;sy=h/470
    nodes=[('Selected shore, difficulty,\nup to 2 numeric summaries',0,0,325),('React preparation\nRequest + Cancel',430,0,270),('POST /api/arcade\nDerive observations',805,0,340),('Local Ollama\nLlama 3.2 3B',805,190,340),('Validate planId + focus\nAuthored description',430,190,300),('Review, then start\nLocal rival simulation',0,190,325)]
    for label,a,b,ww in nodes:
        p.box(x+a*sx,y+b*sy,ww*sx,85*sy)
        p.text(label,x+(a+12)*sx,y+(b+14)*sy,(ww-24)*sx,22*sx,bold=True)
    for a,b,aa,bb in [(325,42,430,42),(700,42,805,42),(975,85,975,190),(805,232,730,232),(430,232,325,232)]:p.arrow(x+a*sx,y+b*sy,x+aa*sx,y+bb*sy)
    p.box(x,y+345*sy,570*sx,80*sy)
    p.text('Browser localStorage: campaign records, recent summaries and preferences',x+12*sx,y+359*sy,540*sx,22*sx)
    p.arrow(x+163*sx,y+275*sy,x+163*sx,y+345*sy)
    p.text('After completed play only',x+192*sx,y+298*sy,330*sx,18*sx,color=GRAY)
    p.text('Measured boundary: loopback inference. No third-party AI provider. A future hosted endpoint would receive these summaries.',x+650*sx,y+345*sy,490*sx,21*sx,color=TEAL)

def flow(p,f,x,y,w,h,detail=False):
    step=h/6
    for i,s in enumerate(f['steps']):
        yy=y+i*step;p.box(x,yy,w,step*.76)
        p.text(f'{i+1}. {s}',x+16,yy+10,w-32,22 if p.h==720 else 23)
        if i<5:p.arrow(x+w/2,yy+step*.76,x+w/2,yy+step)
    if detail:
        yy=y
        for a in f['branches']:
            yy=p.text(a['label'],x+w+70,yy,405,24,bold=True,color=GOLD)+8
            yy=p.text(a['text'],x+w+70,yy,405,21)+23
        for n in f['notes']:
            yy=p.text(n,x+w+70,yy,405,19,color=GRAY)+16

def wire_game_view(p,wf,x,y,w,h):
    """Editable low-fidelity gameplay layouts rather than placeholder artwork."""
    ident=wf['id']
    if ident=='W11':
        cell=(h-16)/8
        for row in range(8):
            for col in range(8):
                xx=x+10+col*cell;yy=y+8+row*cell
                warn=(col in [2,3] and row in [3,4])
                p.box(xx,yy,cell,cell,'#bbbbbb' if warn else '#ffffff','#999999')
                label='E' if row==0 and col in [0,7] else 'O' if (row,col)==(6,3) else 'S' if (row,col) in [(5,3),(2,5),(4,1)] else ''
                if label:p.text(label,xx+3,yy+1,cell-3,10,bold=True,color='#222222')
        p.text('O = Odysseus\nS = sheep\nE = exit\nGray = warned smash',x+cell*8+28,y+17,w-cell*8-40,16,color='#222222')
    elif ident=='W12':
        cell=(h-34)/10
        for side in range(2):
            xx=x+16+side*(w/2)
            p.text('YOUR BOARD' if side==0 else 'CIRCE BOARD',xx,y+5,w/2-24,14,bold=True,color='#222222')
            for row in range(10):
                for col in range(6):
                    p.box(xx+col*cell,y+27+row*cell,cell,cell,'#cccccc' if row>6 or row==2 and col==3 else '#ffffff','#999999')
    elif ident in ['W13','W14']:
        pad=(w-40)/4
        for i,key in enumerate(['A / 1','S / 2','D / 3','F / 4']):
            xx=x+12+i*pad
            p.box(xx,y+22,pad-8,h-45,'#bbbbbb' if i==1 and ident=='W13' else '#ffffff','#777777')
            p.text(key,xx+9,y+42,pad-24,18,bold=True,color='#222222')
    elif ident=='W15':
        p.text('VORTEX',x+10,y+18,85,14,bold=True,color='#222222')
        p.box(x+123,y+45,64,38,'#dddddd','#777777');p.text('SHIP',x+130,y+52,52,13,color='#222222')
        p.box(x+232,y+38,12,64,'#999999','#777777')
        for i in range(6):
            yy=y+9+i*19;p.box(x+w-65,yy,45,15,'#dddddd','#777777');p.text(str(i+1),x+w-60,yy,30,10,color='#222222')
        p.arrow(x+w-68,y+56,x+250,y+68,GRAY,True)
    elif ident in ['W16','W17']:
        for i in range(12):
            xx=x+18+i*(w-50)/12;hh=82-i*4
            p.box(xx,y+20+i*2,22,hh,'#ffffff','#777777')
        p.arrow(x+12,y+h-20,x+w-25,y+52,GRAY,True)
    else:return False
    return True

def wire(p,wf,x,y,w,h,annotation=False):
    p.box(x,y,w,h,'#ffffff','#555555')
    yy=p.text(wf['id']+'  '+wf['title'],x+16,y+14,w-32,20,bold=True,color='#222222')+5
    yy=p.text(wf['screen']+' / '+wf['state']+' / '+wf['flow'],x+16,yy,w-32,16,color=GRAY)+14
    # Measure every region label before allocating its native box.
    font=18 if w>450 else 20
    special=wf['id'] in ['W11','W12','W13','W14','W15','W16','W17']
    heights=[140 if typ=='grid' and special else max(52,len(backend.wrap(label,w-60,font))*font*1.3+24) for typ,label in wf['regions']]
    room=h-(yy-y)-14
    if sum(heights)+8*len(heights)>room:
        font=16
        heights=[125 if typ=='grid' and special else max(42,len(backend.wrap(label,w-60,font))*font*1.3+20) for typ,label in wf['regions']]
    if sum(heights)+8*len(heights)>room:raise ValueError('Wireframe region overflow: '+wf['id'])
    for (typ,label),hh in zip(wf['regions'],heights):
        p.box(x+16,yy,w-32,hh,'#eeeeee' if typ in ['grid','image','buttons'] else '#fafafa','#aaaaaa')
        if not (typ=='grid' and wire_game_view(p,wf,x+16,yy,w-32,hh)):
            p.text(label,x+28,yy+10,w-56,font,color='#252525')
        yy+=hh+8
    if annotation:
        yy=p.text(wf['status'],x,y+h+16,w,19,bold=True,color=GOLD if 'Proposed' in wf['status'] else TEAL)+7
        p.text(wf['annotation'],x,yy,w,20,color=GRAY)

def packet_pages():
    pages=[]
    def new(t,s=''):
        p=Page(t,s);pages.append(p);return p
    p=new('Farshore: Arcade Trials','Phase 2 design packet / Bibek Pathak / October 8, 2026')
    p.text(D['meta']['scope'],64,175,1140,32,bold=True)
    p.text(D['meta']['disclosure'],64,340,1140,23,color=GRAY)
    p.table(['Rubric','Included evidence'],[['Architecture 20%','15-screen hierarchy, content strategy, A1 integration, storage and data flow'],['Flows 30%','Five persona-labeled tasks with control/recovery branches and eight edge cases'],['Wireframes 30%','28 annotated grayscale screens and major states, all five A1 model states'],['Spike 10%','Six real current-use-case calls, exact outputs and three failure records'],['Presentation 10%','12 editable slides, 600-second notes and contribution review draft']],64,485,[300,840],21)
    p=new('Phase 1 persona references','Provisional sketches guide tasks; arcade needs remain hypotheses')
    yy=168
    for a in D['personas']:
        yy=p.text(a['id']+'  '+a['name'],64,yy,1140,29,bold=True)+8
        yy=p.text('Goal: '+a['goal']+'\nDesign need: '+a['need']+'\nFlows: '+a['flows'],64,yy,1140,22)+8
        yy=p.text(a['evidence'],64,yy,1140,18,color=GRAY)+24
    p=new('Screen hierarchy','S01-S15 / A1 marks the only pretrained-model integration point')
    site(p,64,180,1140,610)
    for start in [0,5,10]:
        p=new('Content strategy',f'Screens S{start+1:02d}-S{start+5:02d}')
        p.table(['Screen','Displayed information','Model / storage behavior'],[[s[0]+' '+s[1],s[2],s[4]] for s in D['screens'][start:start+5]],64,175,[285,425,430],22)
    p=new('Data flow and provider boundary','A1 prepares a policy; local simulation owns the round')
    dataflow(p,64,185,1140,585)
    p=new('A1 model integration','Optional rival planning, shared by all five encounter briefings')
    a=D['integrations'][0];yy=162
    for label,key in [('Model','model'),('Input','input'),('Output','output'),('Timing','timing'),('Privacy','privacy'),('Player control','control')]:
        yy=p.text(label,64,yy,1140,23,bold=True)+4
        value=a[key]
        if key=='timing':value=f"Measured min {D['spike']['latency']['min']:.3f}s, mean {D['spike']['latency']['average']:.3f}s, max {D['spike']['latency']['max']:.3f}s. "+value
        yy=p.text(value,64,yy,1140,21)+12
    p=new('Storage, fixed rules and player control','Preparation changes neither score nor campaign progress')
    bullets(p,[
        'Current: browser-local save stores cleared/assisted records, best performance and at most two recent numeric attempts per shore. Preferences have a separate local key. No account or cloud save.',
        'Current: a ready model plan stays in memory. Navigating, editing difficulty/mode or cancelling discards it. Regeneration replaces it only after validation.',
        'Current: collision rules, warnings, difficulty and scoring remain authored. Local opponents act during play. No inference runs inside a real-time match.',
        'Current: the full-round result commits progress. Practice and an abandoned round award no clear. A failed replay preserves an earlier clear.',
        'Current: a pending request has elapsed time and Cancel. Generation IDs ignore late replies. Invalid plans expose uncertainty and local fallback choices.',
        'Proposed: a dedicated Discard strategy action explicitly undoes preparation. A visible privacy detail names loopback inference, and a persistent saving warning explains memory-only play.',
        'No confidence percentage. A strategy description explains permitted behavior, but does not prove tactical quality. Human evaluation is still required.'
    ],64,170,1140,23,18)
    for f in D['flows']:
        p=new(f['id']+'  '+f['title'],f['persona']+' / '+f['status'])
        flow(p,f,64,185,650,555,True)
        p.text('Screens and states: '+f['states'],64,805,1140,19,color=GRAY)
    for start in [0,3,6]:
        p=new('Edge cases and recovery',f'EC{start+1}-EC{min(start+3,len(D["edges"]))}')
        p.table(['Scenario / states','Recovery','Observed vs designed'],[[e[0]+' '+e[1]+'\n'+e[2],e[3],e[4]] for e in D['edges'][start:start+3]],64,175,[325,425,390],22)
    p=new('AI state and screen coverage','28 wireframes cover every screen and major interaction state')
    p.table(['A1 state','Wireframe','Flow','Expected action'],[['Initial','W05','F2','Prepare model or start local play'],['Loading','W06','F2/F4','Elapsed time / Cancel / Practice'],['Success','W07','F2','Review / Start / regenerate / edit'],['Uncertain','W08','F2/F4','Reject unsupported plan / retry / local'],['Error','W09','F4','Retry / check connection / local']],64,170,[250,160,180,550],23)
    p.text('Screen coverage',64,545,1140,28,bold=True)
    p.text('S01 W01-W02; S02 W03; S03 W04/W28; S04 W05-W10/W27; S05 W11; S06 W12; S07 W13-W14; S08 W15; S09 W16-W17; S10 W18-W20; S11 W21; S12 W22; S13 W23-W24; S14 W25; S15 W26.',64,602,1140,24)
    p.text('W10 inline validation, W27 explicit Discard and W28 saving warning are proposed UI changes. The current server already rejects invalid requests.',64,750,1140,22,color=GRAY)
    for i in range(0,len(D['wireframes']),2):
        pair=D['wireframes'][i:i+2];p=new('Low-fidelity wireframes',pair[0]['id']+' and '+pair[1]['id'])
        for j,w in enumerate(pair):wire(p,w,64+j*594,155,550,510,True)
    p=new('AI spike for the arcade trials','Six sequential actual Llama calls on October 8, 2026')
    st=D['spike']['latency']
    p.text(f"Minimum {st['min']:.3f}s     Mean {st['average']:.3f}s     Maximum {st['max']:.3f}s",64,175,1140,31,bold=True,color=TEAL)
    review=['Legal focused/center. Differs from advisory sweep preference. No optimality claim.','Legal chain/balanced. Matches repeated-loss preference.','Legal echo/balanced. Red miss counts reach the prompt. Local logic targets lanes.','Legal pincer/balanced. Differs from advisory undertow preference.','Legal feint/balanced. Fairness needs a player study.','Legal focused/left. Required habit focus is preserved.']
    p.table(['Sample','Seconds','Result','Analytic review'],[[s['id']+' '+s['label'],f"{s['seconds']:.3f}",s['answer']['plan']['planId']+'/'+s['answer']['plan']['focus'],review[i]] for i,s in enumerate(D['spike']['samples'])],64,245,[285,135,230,490],18)
    p.text('All six outputs were legal. S1 and S4 differ from advisory prompt preferences. This finite catalog limits output risk, but legal results do not establish fair or enjoyable play.',64,750,1140,22,color=GRAY)
    p=new('Failure evidence and loading decisions','Separate actual provider responses from app validation and unmeasured cases')
    p.table(['Probe','Boundary','Observed output'],[['E1 Missing model','Real provider','HTTP 404, model not found'],['E2 Malformed JSON','Real provider','HTTP 400, unexpected EOF'],['E3 Unsupported difficulty','App before provider','HTTP 400, choose supported encounter and difficulty']],64,175,[340,320,480],24)
    bullets(p,[
        'Display a preparation message immediately, show elapsed seconds and offer Cancel. The observed maximum exceeds ten seconds. No gameplay clock runs during the wait.',
        'Reject unsupported results before a match. Retain selections/progress and provide explicit Solo or local AI choices. Check connection, retry or leave without a dead end.',
        'No live 429 or sustained quota threshold was measured. Local inference used no billed API. Hardware, electricity and future hosting cost are unmeasured.',
        'Standalone script captures raw provider request/body and final adapter results. Temperature 0, strict JSON schema, 100 output-token cap and no streaming. No repeated, randomized or user-study benchmark.'
    ],64,455,1140,23,17)
    p=new('Sources and remaining human evidence','Traceable design evidence and honest research status')
    yy=166
    for title,ref,note in D['sourceList']:
        yy=p.text(title,64,yy,1140,23,bold=True)+4
        yy=p.text(ref,64,yy,1140,18,color=GRAY)+17
    p.text('Add actual peer critique and interview records if available. Review the contribution statement before submission. No invented reviewer feedback, human study results or instructor approval is included.',64,770,1140,21,color=TEAL)
    for i,p in enumerate(pages):p.footer(i+1)
    assert len(pages)==35
    return pages

def summary_page():
    p=Page('AI technical spike','Farshore: Arcade Trials / October 8, 2026',w=794,h=1123)
    yy=165
    sections=[
        ('Model and method','Llama 3.2 3B through local Ollama. Six sequential current-use-case samples using the production adapter from a standalone script. Strict JSON schema, temperature 0, 100 output-token cap, no streaming. Timings include inference, parsing and validation.'),
        ('Measured latency','Minimum 7.317 s, average 8.278 s, maximum 11.613 s. Individual calls: S1 Cyclops 11.613 s, S2 Circe 7.597 s, S3 Sirens 7.317 s, S4 Strait 7.889 s, S5 Bow 7.614 s, S6 left-side Cyclops 7.641 s. One sequential run, no repeated warm/cold or concurrency benchmark.'),
        ('Output quality','Six legal planId/focus outputs. Circe after two losses selects chain. Left-side Cyclops retains left focus. First-time Cyclops and one-loss Strait differ from advisory preferences. Legality does not prove adaptation, fairness or enjoyment. Siren lane targeting executes locally.'),
        ('Actual failures','E1: nonexistent provider model returns HTTP 404 and model-not-found JSON. E2: malformed provider JSON returns HTTP 400 with unexpected EOF. E3: unsupported difficulty returns application HTTP 400 before provider contact. Exact bodies are archived with sample inputs and raw outputs.'),
        ('Rate limits and cost','No provider 429 or sustained quota/concurrency threshold was measured. The app maps a provider 429 to a visible busy-service error. These local requests used no billed inference API. Hardware, electricity and future hosting costs remain unmeasured.'),
        ('Design response and model decision','Show elapsed preparation and Cancel. Keep game clocks stopped. Review before play and offer regeneration, edit/rejection and explicit local fallback. Reject illegal plans before scores change. Retain Llama provisionally for this bounded task, pending player evaluation. No confidence percentages.'),
        ('Evidence','Exact inputs, outputs and failures: evidence/phase2-arcade-spike-2026-10-08.json. Analytic review: quality-review.json. Code: scripts/phase2-arcade-spike.mjs and server/arcade.ts. Format reference: Ollama structured outputs documentation, accessed October 8.'),
    ]
    for title,text in sections:
        yy=p.text(title,52,yy,690,20,bold=True)+4
        yy=p.text(text,52,yy,690,17)+12
    p.footer(1)
    return p

def contribution_page():
    p=Page('Contribution statement','Farshore: Arcade Trials / CMPS 4200 HCI / October 8, 2026',w=794,h=1123)
    p.text('Bibek Pathak',52,180,690,27,bold=True)
    p.text('Project owner and intended presenter. Supplied the Farshore concept, the Odyssey arcade direction and encounter requirements, and reviewed the project direction. Responsible for checking and adopting this statement before submission.',52,245,690,21)
    p.text('AI assistance disclosure',52,435,690,27,bold=True)
    p.text('Codex assisted with drafting architecture, flows, wireframes, experiment code, analytic review, slides and supporting documents. The experiment made actual calls to local Llama 3.2 3B. AI assistance is not a human team member or interview participant.',52,495,690,21)
    p.text('Student review',52,700,690,27,bold=True)
    p.text('This is a review draft. The supplied Phase 1 slides identify a solo project. No additional teammate contribution or instructor approval is documented in the supplied files. Correct any inaccurate details and obtain agreement from every actual team member before submitting.',52,760,690,21)
    p.text('The editable contribution-statement.md is included for corrections. This document does not assert a signature or an agreement that has not been provided.',52,975,690,18,color=GRAY)
    p.footer(1)
    return p

def slide_pages():
    slides=[]
    timings=[30,50,45,45,55,60,45,45,55,65,65,40]
    def new(t,s=''):
        p=Page(t,s,w=1280,h=720);slides.append(p);return p
    p=Page('',w=1280,h=720,dark=True);slides.append(p)
    p.text('FARSHORE',64,125,525,58,bold=True,color='#ffffff')
    p.text('The Odyssey:\nArcade Trials',64,215,525,45,color='#ffffff')
    p.text('Phase 2: Interface structure\nand AI interaction design',64,385,525,26,color='#bfd6de')
    p.text('Bibek Pathak\nCMPS 4200 HCI / October 8, 2026',64,540,525,23,color='#bfd6de')
    from PIL import Image
    art=ROOT/'public/art/title.png'
    iw,ih=Image.open(art).size
    p.image(art,650,160,565,565*ih/iw)
    p.notes='Farshore turns Odysseus\' journey into five distinct arcade trials. Phase 2 focuses on how a player learns a trial, reviews an optional model strategy and recovers from failure. The new direction keeps the Odyssey setting and makes each shore a recognizable game. Source: user arcade design, current src/ArcadeApp.tsx. Original project artwork: public/art/title.png.'
    p=new('The five arcade trials','Each shore uses different controls and shows an active rival')
    p.table(['Shore','Player interaction','Visible rival action'],[['Cyclops','Grid stealth','Blind smash from noise clues'],['Circe','Falling-potion match-3','Own board, chains and curses'],['Sirens','Four-lane melody memory','Composes and targets missed lanes'],['Scylla & Charybdis','Shield paddle and rowing','Six heads with pulsing vortex'],['Ithaca','Turn-based archery','Own scored shot or ring block']],64,180,[300,365,485],25)
    p.notes='Explain the variety briefly. The player moves on a grid, solves a puzzle duel, echoes a melody, controls a shield while rowing, then aims through twelve axe rings. Rivals take turns or visibly react. The myth provides context, while the arcade rules are adaptations. Antinous\' competitive shots are invented because in Homer he cannot string the bow. Source: src/lib/arcade.ts and src/lib/mythic.ts; Odyssey Books IX, X, XII, XXI.'
    p=new('Players and design needs','Phase 1 persona sketches guide the flows')
    for i,a in enumerate(D['personas']):
        x=64+i*400
        p.text(a['name'],x,190,350,33,bold=True)
        p.text(a['goal'],x,260,350,26)
        short=['Fixed rules and visible rival warnings.','Short practice and one clear objective per shore.','Model labels, strategy review and a usable fallback.'][i]
        p.text(short,x,425,350,26,color=TEAL)
    p.text('Provisional design references. Interview evidence has not been supplied.',64,617,1140,23,color=GRAY)
    p.notes='Maya is the gamer concerned about fairness, Daniel is the reader with limited technical comfort, and Rosa is skeptical of AI. Their ages and sketches come from my Phase 1 slide. The arcade needs are design hypotheses, not new interview findings. Each of the five full task flows names the persona it serves. Source: original/Farshore_Phase12nd.pptx, slide 4; design packet persona page.'
    p=new('Screen hierarchy','A1 in the briefing is the only pretrained-model feature')
    site(p,64,175,1140,445)
    p.notes='The first path is Title, Introduction, Map and Briefing. A briefing opens one of five games, then a result either retries or unlocks the next shore. The fifth passage reaches Homecoming. Settings, Pause/leave, Restart and Assistance are shared overlays. The full packet inventories all fifteen screens and their content. F1 handles starting and learning. F5 handles progress, assistance and finishing. Source: src/ArcadeApp.tsx, round component and design packet S01-S15.'
    p=new('Model data flow and privacy','Numeric summaries prepare a strategy before the round')
    dataflow(p,64,175,1140,450)
    p.notes='The browser sends a shore ID, difficulty and at most two numeric attempts. The server derives the player observations and gives Llama a finite strategy catalog. It validates planId and focus and supplies an authored description. The player reviews it, then local game logic runs the match. Completed records and preferences stay in browser localStorage. Our measured endpoint is loopback Ollama. No third-party model provider receives these calls. A hosted endpoint would require a changed disclosure. Sources: server/arcade.ts, src/lib/arcade.ts, https://docs.ollama.com/api/openai-compatibility and https://docs.ollama.com/capabilities/structured-outputs, accessed October 8, 2026.'
    p=new('F2: Strategy preparation and review','Maya and Rosa / player control before a match')
    flow(p,D['flows'][1],64,175,645,445)
    bullets(p,['Cancel preserves progress.','Prepare another replaces the candidate.','Edit difficulty or choose Solo to discard.','Proposed: a dedicated Discard action.'],800,190,405,26,26)
    p.notes='After selecting AI Rival Battle, Prepare sends the model request. Loading shows elapsed seconds and Cancel. Server validation must succeed before a strategy can be shown. The player can read its description and start, regenerate, or change input. Changing difficulty or mode discards the plan. A dedicated Discard action is a design proposal for clearer undo of preparation. There is no score undo after a completed round. Source: F2 and W05-W09/W27; src/ArcadeApp.tsx prepare, cancelAi and setDifficulty.'
    p=new('F3: Active play and recovery','Maya and Daniel / local simulation keeps play responsive')
    flow(p,D['flows'][2],64,175,645,445)
    bullets(p,['Warnings show what the rival will do.','Pause stops clocks and held controls.','Loss offers retry or short practice.','Assistance has an honest report label.'],800,190,405,26,26)
    p.notes='Gameplay differs at each shore, but the interaction cycle is shared: enter, act, observe the rival and reach a clear or loss condition. Local simulation owns the physics and scoring, even in a model-planned match. Hidden tabs or lost focus pause and release held controls. Loss offers retry, practice, the map or assistance. Practice changes no campaign progress. The packet includes all five play interfaces and major turns. Sources: F3, W11-W20, src/components/arcade-round.tsx and src/lib/mythic.ts.'
    p=new('AI preparation states','Initial, loading and reviewed success')
    for i,(title,rows) in enumerate([('Initial',['Difficulty and mode','Local rival ready','Prepare with model']),('Loading',['Preparing strategy','12 seconds elapsed','Cancel / Practice']),('Success',['Chain Alchemist','Fixed Normal rules','Start / Prepare another'])]):
        x=64+i*400
        p.text(title,x,187,350,31,bold=True)
        p.box(x,250,350,295,'#ffffff','#777777');yy=272
        for text in rows:
            p.box(x+16,yy,318,69,'#f4f4f4','#999999');p.text(text,x+28,yy+17,294,23,color='#222222');yy+=86
    p.text('W05-W07 / F2. Preparation consumes no gameplay time.',64,611,1140,24,color=GRAY)
    p.notes='These grayscale wireframes show information hierarchy rather than game art. Initial makes the optional model action visible. Loading provides real feedback and Cancel. A prepared result names the strategy and explains that the selected difficulty stays fixed. Start is disabled while the request is pending. The measured maximum above ten seconds supports elapsed-time feedback and cancellation. Source: W05-W07 and current prepare states; professor Phase 2 brief page 2.'
    p=new('F4: Uncertainty and error recovery','Rosa and Maya / no dead end and no invented confidence score')
    for i,(title,rows) in enumerate([('Uncertain or unsupported',['Unsupported strategy','Nothing changed','Retry / local AI / Solo']),('Service error',['Unavailable or timed out','Your voyage is kept','Retry / check / local play'])]):
        x=64+i*595;p.text(title,x,188,545,30,bold=True)
        p.box(x,250,535,290,'#ffffff','#777777');yy=278
        for text in rows:
            p.box(x+18,yy,499,67,'#f4f4f4','#999999');p.text(text,x+32,yy+16,472,25,color='#222222');yy+=82
    p.text('W08-W09 / F4. Invalid input is rejected before model contact.',64,611,1140,24,color=GRAY)
    p.notes='An unsupported or empty model result cannot start a game. Finite allowed IDs and authored descriptions keep arbitrary prose out of the interface. A legal but unwanted strategy can still be regenerated or rejected. Connection failure, timeout and a busy provider preserve progress and provide explicit local play. Unsupported input returns guidance before inference. We show no confidence percentage because this generative model does not supply a calibrated probability. Source: F4, EC1-EC5, W08-W10, server/arcade.ts; professor confidence note on page 2.'
    p=new('AI technical spike','Six real calls to local Llama 3.2 3B')
    st=D['spike']['latency'];p.text(f"Min {st['min']:.3f}s     Mean {st['average']:.3f}s     Max {st['max']:.3f}s",64,172,1140,34,bold=True,color=TEAL)
    p.table(['Sample','Seconds','Selected plan','Review'],[[s['id']+' '+s['label'],f"{s['seconds']:.3f}",s['answer']['plan']['planId']+'/'+s['answer']['plan']['focus'],['Legal, advisory mismatch','Matches loss preference','Legal, local lane targeting','Legal, advisory mismatch','Legal block-shot policy','Required left focus kept'][i]] for i,s in enumerate(D['spike']['samples'])],64,248,[330,145,260,405],21,51)
    p.text('Six legal outputs. One sequential sample; tactical quality still needs evaluation.',64,625,1140,22,color=GRAY)
    p.notes='A standalone script calls the production adapter with six realistic current-use-case inputs and captures raw provider outputs. Temperature is zero, structured schema is strict, output cap is one hundred tokens and streaming is off. Report each latency, then minimum, arithmetic mean and maximum. All outputs are legal. First-time Cyclops and one-loss Strait differ from advisory prompt preferences. That demonstrates why validity is not the same as choosing the best tactics. Siren missed-lane targeting executes locally. This is not an accuracy or enjoyment benchmark. Sources: evidence/phase2-arcade-spike-2026-10-08.json, quality-review.json, scripts/phase2-arcade-spike.mjs.'
    p=new('Failure evidence and design decisions','Real provider failures, with app validation kept separate')
    p.table(['Triggered condition','Observed response','UI response'],[['Nonexistent provider model','HTTP 404, model not found','Check / retry / local play'],['Malformed provider JSON','HTTP 400, unexpected EOF','Explain failure / retain selections'],['Unsupported difficulty','App HTTP 400 before inference','Supported-choice guidance']],64,180,[365,380,405],25)
    p.text('Wait design: elapsed time and Cancel, with every round clock stopped.',64,465,1140,27,bold=True,color=TEAL)
    p.text('No live 429 or capacity benchmark. Local API calls had no billed fee.\nHardware, electricity and future hosting costs are unmeasured.',64,550,1140,24,color=GRAY)
    p.notes='Two probes actually reach the model service: a nonexistent model returns 404 and malformed provider JSON returns 400 with unexpected EOF. Unsupported difficulty stops at the app boundary and returns 400. Exact error bodies are archived. No live rate-limit threshold or sustained load is measured. The adapter has a busy-service path for 429. Local inference produces no billed API fee in this run, but hardware and electricity cost are unmeasured. These results support visible preparation, elapsed time and Cancel, validated plans and retained progress with explicit fallback. Source: raw spike failure records and one-page summary.'
    p=new('Phase 2 design and next evaluation','Implemented behavior and proposed improvements')
    p.text('Implemented',64,185,525,31,bold=True)
    bullets(p,['Five distinct playable trials','Model review, cancellation and regeneration','Local saves, practice and assisted passage'],64,252,525,27,26)
    p.text('Proposed or awaiting evidence',700,185,510,31,bold=True)
    bullets(p,['Explicit Discard and saving warning','Interview-backed persona validation','Actual peer critique and fairness playtests'],700,252,510,27,26)
    p.text('Supporting packet: 15 screens, 5 flows, 28 wireframes and exact AI evidence.',64,602,1140,24,color=TEAL)
    p.notes='The prototype implements the core arcade loop and the model controls discussed today. Discard, explicit privacy detail and a persistent storage warning remain design proposals. Actual interviews and class critique require real people and are not invented in this package. The model remains provisional until player evaluation shows whether its strategy choices help. The supporting packet has every screen, five persona-labeled tasks, twenty-eight wireframes and exact technical evidence. Finish at ten minutes and invite the separate three-to-five-minute Q&A. Sources: design packet and peer-critique record.'
    assert len(slides)==12 and sum(timings)==600
    for i,p in enumerate(slides):
        p.footer(i+1);p.notes=f'Timing: {timings[i]} seconds.\n\n'+p.notes
    return slides

def editable_svg(page):
    pieces=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {page.w} {page.h}"><rect width="100%" height="100%" fill="white"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="{GRAY}"/></marker></defs>']
    for e in page.items:
        if e['type']=='box':
            pieces.append(f'<rect x="{e["x"]}" y="{e["y"]}" width="{e["w"]}" height="{e["h"]}" fill="{e["fill"]}" stroke="{e["stroke"]}"/>')
        elif e['type']=='text':
            for i,line in enumerate(e['lines']):
                yy=e['y']+e['size']+i*e['size']*1.3
                weight='bold' if e['bold'] else 'normal'
                pieces.append(f'<text x="{e["x"]}" y="{yy}" font-family="Arial" font-size="{e["size"]}" font-weight="{weight}" fill="{e["color"]}">{escape(line)}</text>')
        elif e['type']=='line':
            dash=' stroke-dasharray="5 4"' if e['dash'] else ''
            pieces.append(f'<line x1="{e["x"]}" y1="{e["y"]}" x2="{e["x2"]}" y2="{e["y2"]}" stroke="{e["color"]}" stroke-width="1.5" marker-end="url(#arrow)"{dash}/>')
    return ''.join(pieces)+'</svg>'

if __name__=='__main__':
    packet,slides=packet_pages(),slide_pages()
    draw_pdf(packet,OUT/'Farshore-Phase-2-Arcade-Design-Packet.pdf',(841.89,591.95))
    draw_pdf([summary_page()],OUT/'technical-spike-summary.pdf',(595.28,841.89))
    draw_pdf([contribution_page()],OUT/'contribution-statement.pdf',(595.28,841.89))
    pptx(slides,OUT/'Farshore-Phase-2-Arcade-Presentation.pptx')
    draw_pdf(slides,BUILD/'slides-preview.pdf',(960,540))
    (BUILD/'layout.json').write_text(json.dumps([{'title':p.title,'items':p.items} for p in slides],indent=2),encoding='utf-8')
    (OUT/'speaker-notes.md').write_text('# Ten-minute presentation notes\n\nThe twelve slide timings total 600 seconds. Allow 3-5 minutes of Q&A afterward.\n\n'+'\n\n'.join(f'## {i+1}. {p.title or "Farshore"}\n\n{p.notes}' for i,p in enumerate(slides)),encoding='utf-8')
    for wf in D['wireframes']:
        p=Page('',w=620,h=800)
        wire(p,wf,30,30,560,510,True)
        (OUT/f'editable/{wf["id"]}.svg').write_text(editable_svg(p),encoding='utf-8')
    for name,draw in [('site-map',site),('data-flow',dataflow)]:
        p=Page('',w=1280,h=720);draw(p,64,70,1140,555)
        (OUT/f'editable/{name}.svg').write_text(editable_svg(p),encoding='utf-8')
    print(f'Created {len(packet)}-page packet, one-page spike, contribution PDF and {len(slides)} editable slides.')
