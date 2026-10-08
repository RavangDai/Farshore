"""Render the Phase 2 content to PDFs and a native editable OOXML PowerPoint.

The bundled Artifact Tool runtime is unavailable on this host. This fallback uses
standard library OOXML (not python-pptx). Diagrams, tables and wireframes remain
editable. PowerPoint renders the final slides in a separate verification step.
"""
import sys, json, math, re, zipfile, html
from pathlib import Path
from xml.sax.saxutils import escape
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tmp/pdf-review-tools'))
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

OUT = ROOT / 'Farshore Context and Assisment/docs/assignment/phase2'
D = json.loads((OUT/'editable/content.json').read_text(encoding='utf-8'))
BUILD = ROOT / '.tmp/phase2-build'
BUILD.mkdir(parents=True, exist_ok=True)
for name, file in [('Arial','arial.ttf'),('Arial-Bold','arialbd.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
NAVY='#102e40'; TEAL='#126978'; GRAY='#526875'; GOLD='#a9884b'; WHITE='#ffffff'
def wrap(text, width, size, bold=False):
    font='Arial-Bold' if bold else 'Arial'; lines=[]
    for para in str(text).split('\n'):
        line=''
        for word in para.split():
            candidate=(line+' '+word).strip()
            if line and pdfmetrics.stringWidth(candidate,font,size)>width:
                lines.append(line);line=word
            else:line=candidate
        lines.append(line)
    return lines

class Page:
    def __init__(self,title,subtitle='',w=1280,h=900,dark=False):
        self.title=title;self.subtitle=subtitle;self.w=w;self.h=h;self.dark=dark;self.items=[];self.notes=''
        if title:self.text(title,64,42,w-128,48 if h==720 else 38,bold=True,color=WHITE if dark else NAVY)
        if subtitle:self.text(subtitle,64,106,w-128,20 if h==720 else 18,color='#bfd6de' if dark else GRAY)
    def text(self,t,x,y,w,size=20,bold=False,color=NAVY):
        lines=wrap(t,w,size,bold);height=len(lines)*size*1.3+5
        if x<0 or y<0 or x+w>self.w+1 or y+height>self.h-26:raise ValueError(f'Text outside page: {self.title}: {t[:70]} at {x},{y} h={height}')
        self.items.append(dict(type='text',text=t,x=x,y=y,w=w,h=height,size=size,bold=bold,color=color,lines=lines))
        return y+height
    def box(self,x,y,w,h,fill='#f7fafb',stroke='#79909b'):
        self.items.append(dict(type='box',x=x,y=y,w=w,h=h,fill=fill,stroke=stroke))
    def arrow(self,x,y,x2,y2,color=GRAY,dash=False):
        self.items.append(dict(type='line',x=x,y=y,x2=x2,y2=y2,color=color,dash=dash))
    def image(self,file,x,y,w,h):self.items.append(dict(type='image',file=str(file),x=x,y=y,w=w,h=h))
    def table(self,headers,rows,x,y,widths,size=18,row_h=None):
        cells=[headers]+rows
        heights=[]
        for ri,row in enumerate(cells):
            heights.append(row_h or max(len(wrap(t,widths[i]-24,size,ri==0))*size*1.3+24 for i,t in enumerate(row)))
        if y+sum(heights)>self.h-40:raise ValueError(f'Table overflow: {self.title} {sum(heights)}')
        self.items.append(dict(type='table',cells=cells,x=x,y=y,w=sum(widths),h=sum(heights),widths=widths,heights=heights,size=size))
        return y+sum(heights)
    def footer(self,index):self.text(f'Farshore / Phase 2 / {index}',64,self.h-54,self.w-128,14,color='#9eb9c5' if self.dark else GRAY)

def bullets(p,items,x,y,w,size=20,gap=14):
    for item in items:
        p.text('•',x,y,18,size,color=TEAL)
        y=p.text(item,x+24,y,w-24,size)+gap
    return y

def site(p,x,y,w,h):
    # Native diagram geometry. Shared overlays list every actual modal.
    sx=w/1000;sy=h/570
    def b(label,a,c,bw,bh):
        p.box(x+a*sx,y+c*sy,bw*sx,bh*sy)
        p.text(label,x+(a+12)*sx,y+(c+14)*sy,(bw-24)*sx,22*sx,bold=True)
    for args in [('Farshore',400,0,210,54),('S01 Title',30,105,230,55),('S02 Introduction',345,105,285,55),('S03 Encounter [A1-A3]',710,105,280,55),('S04 Journey report',710,230,280,55),('Shared overlays',30,230,600,55)]:b(*args)
    for a,c,aa,cc in [(400,28,145,105),(505,54,487,105),(610,28,850,105),(260,132,345,132),(630,132,710,132),(850,160,850,230),(145,160,145,230)]:p.arrow(x+a*sx,y+c*sy,x+aa*sx,y+cc*sy)
    p.text('S05 Pause     S06 Characters     S07 Voyage map',x+45*sx,y+315*sy,w*.61,22*sx)
    p.text('S08 Log     S09 How to play     S10 Story & sources',x+45*sx,y+360*sy,w*.63,22*sx)
    p.text('S11 Settings     S12 New voyage confirmation',x+45*sx,y+405*sy,w*.63,22*sx)
    p.text('Overlays return to their invoking screen. Encounter states include input, processing, review, uncertainty and errors.',x+30*sx,y+485*sy,w*.92,20*sx,color=GRAY)

def dataflow(p,x,y,w,h):
    sx=w/1000;sy=h/570
    for label,a,c,bw,bh in [('Player counsel',0,0,215,65),('React input review',350,0,265,65),('POST /api/turn',740,0,260,65),('Local Llama 3.2 3B',740,205,260,65),('Validate + authored score',350,205,285,65),('UI result + explanation',0,205,275,65),('Browser localStorage',0,415,275,65),('Browser / OS speech service',350,415,480,65)]:
        p.box(x+a*sx,y+c*sy,bw*sx,bh*sy)
        p.text(label,x+(a+12)*sx,y+(c+16)*sy,(bw-24)*sx,21*sx,bold=True)
    for a,c,aa,cc in [(215,32,350,32),(615,32,740,32),(870,65,870,205),(740,238,635,238),(350,238,275,238),(135,270,135,415)]:p.arrow(x+a*sx,y+c*sy,x+aa*sx,y+cc*sy)
    p.text('Scene and advice',x+744*sx,y+105*sy,120*sx,17*sx,color=GRAY)
    p.text('reply / reason / decision flags',x+740*sx,y+295*sy,260*sx,17*sx,color=GRAY)
    p.text('Accepted route, log, time/trust and preferences',x,y+497*sy,290*sx,17*sx,color=GRAY)
    p.text('Optional audio or reply text may leave the device through a browser/OS voice service. Reviewed transcript returns to React.',x+350*sx,y+497*sy,640*sx,17*sx,color=GRAY)
    for a,c,aa,cc in [(380,65,330,100),(330,100,330,447),(330,447,350,447),(680,415,680,100),(680,100,570,65)]:
        p.arrow(x+a*sx,y+c*sy,x+aa*sx,y+cc*sy,GOLD,True)

def flow(p,f,x=70,y=168,w=710,h=520,branches=True):
    node_w=w*.70 if branches else w;step=h/6;node_h=step*.73
    for i,s in enumerate(f['steps']):
        yy=y+i*step;p.box(x,yy,node_w,node_h)
        p.text(f'{i+1}. {s}',x+18,yy+14,node_w-36,21 if p.h==720 else 22)
        if i<5:p.arrow(x+node_w/2,yy+node_h,x+node_w/2,yy+step)
    if branches:
        for i,a in enumerate(f['branches']):
            yy=y+a['at']*step
            p.arrow(x+node_w,yy+node_h/2,x+node_w+25,yy+node_h/2)
            p.text(a['label'],x+node_w+32,yy+4,w-node_w-32,18,bold=True,color=GOLD)
    else: pass

def wire(p,wf,x,y,width,height,annotation=False):
    p.box(x,y,width,height,WHITE,'#555555')
    sy=p.text(f"{wf['id']}  {wf['title']}",x+15,y+12,width-30,20,bold=True,color='#222222')
    sy=p.text(f"{wf['state']} / {wf['flow']}",x+15,sy+2,width-30,15,color='#555555')+10
    natural=[80 if a=='image' else 64 if a=='input' else 48 for a,b in wf['regions']]
    factor=min(1,(height-(sy-y)-18)/(sum(natural)+9*len(natural)))
    for (typ,label),hh in zip(wf['regions'],natural):
        rh=hh*factor;p.box(x+15,sy,width-30,rh,'#eeeeee' if typ in ['image','buttons'] else '#fafafa','#aaaaaa')
        p.text(label,x+25,sy+10,width-50,17*factor,color='#252525')
        sy+=rh+9*factor
    if annotation:
        yy=p.text(wf['status'],x,y+height+14,width,18,bold=True,color=GOLD if 'proposed' in wf['status'].lower() else TEAL)
        p.text(wf['annotation'],x,yy+7,width,18,color=GRAY)

def packet_pages():
    pages=[]
    def new(title,subtitle=''):
        p=Page(title,subtitle);pages.append(p);return p
    p=new('Farshore','Phase 2: Information architecture, wireframes and user flows')
    p.text(D['meta']['scope'],64,185,1100,36,bold=True)
    p.text('Bibek Pathak / CMPS 4200 HCI / September 30, 2026',64,360,1100,22)
    p.text(D['meta']['disclosure'],64,410,1100,22,color=GRAY)
    p.table(['Rubric','Artifacts'],[['Architecture (20%)','Screen hierarchy, content strategy, AI integration points and data flow'],['User flows (30%)','Five persona-linked flows and six edge cases'],['Wireframes (30%)','26 annotated grayscale designs, including all five states for A1-A3'],['Technical spike (10%)','Six real calls, latency, failures and one-page summary'],['Presentation (10%)','12 editable slides, 10-minute speaking plan and contribution draft']],64,550,[280,860],17)
    p=new('Persona references','Use the supplied Phase 1 sketches as provisional design references')
    yy=180
    for person in D['personas']:
        yy=p.text(person['id']+'  '+person['name'],64,yy,1120,28,bold=True)+8
        yy=p.text('Goal: '+person['goal']+'\nDesign need: '+person['need']+'\nFlows: '+person['flows'],64,yy,1120,22)+8
        yy=p.text(person['evidence'],64,yy,1120,18,color=GRAY)+32
    p=new('Screen hierarchy','Site map covering all current screens and shared overlays')
    site(p,64,175,1140,640)
    for start in [0,6]:
        p=new('Content strategy',f'Screens S{start+1:02d}-S{start+6:02d}')
        rows=[[r[0]+' '+r[1],r[2],r[4]] for r in D['screens'][start:start+6]]
        p.table(['Screen','Displayed information','AI / data behavior'],rows,64,170,[255,420,465],19)
    p=new('Data flow and privacy','Text inference stays on the device in the measured configuration')
    dataflow(p,64,180,1140,610)
    p=new('AI integration points','Name the service, input, output, timing and user control')
    yy=162
    for a in D['integrations']:
        yy=p.text(a['id']+'  '+a['name'],64,yy,1140,26,bold=True)+4
        timing=(f"Measured {D['spike']['statistics']['minSeconds']:.2f}-{D['spike']['statistics']['maxSeconds']:.2f} s, mean {D['spike']['statistics']['averageSeconds']:.2f} s. " if a['id']=='A1' else '')
        for label,key in [('Model','model'),('Input','input'),('Output','output'),('Timing','timing')]:
            yy=p.text(label+': '+(timing if key=='timing' else '')+a[key],64,yy,1140,18)+7
        yy+=20
    p=new('Storage, trust and user control','Current behavior and proposed Phase 2 additions')
    bullets(p,[
        'Current: localStorage saves route, accepted turn log, time and trust. Preferences have their own local key. No accounts or cloud saves.',
        'Current: generation counsel and responses are transient until the app applies a valid decision. No audio-upload route exists.',
        'Proposed: persist counsel drafts separately. Keep the AI candidate unscored until the player accepts it. Discard cancelled or superseded responses using a request ID.',
        'Proposed: refine counsel, request another interpretation or discard a mismatch before score commitment. A story refusal is a valid narrative outcome when action and explanation agree.',
        'Proposed: practice-only undo restores the complete prior route, log and time/trust. Scored voyages retain committed decisions.',
        'Text goes to local Ollama in this spike. Optional voice input/output may use browser or OS providers. A future cloud text endpoint changes the privacy disclosure.',
        'No invented confidence percentages. Show chosen action, rationale and sources. Narrative sources explain adaptation, rather than proving a generated decision is correct.'
    ],64,170,1140,23,19)
    for f in D['flows']:
        p=new(f['id']+'  '+f['title'],f['persona']+' / '+f['status'])
        flow(p,f,64,175,670,590)
        yy=175
        for a in f['branches']:
            yy=p.text(a['label'],810,yy,395,23,bold=True,color=GOLD)+7
            yy=p.text(a['text'],810,yy,395,20)+24
        yy=565
        for note in f['notes'][:2]:yy=p.text(note,810,yy,395,18,color=GRAY)+17
        p.text('States: '+f['states'],64,805,1140,18,color=GRAY)
    for start in [0,3]:
        p=new('Edge cases and recovery',f'EC{start+1}-EC{start+3}')
        p.table(['Scenario / states','Recovery','Evidence'],[[r[0]+' '+r[1]+'\n'+r[2],r[3],r[4]] for r in D['edges'][start:start+3]],64,165,[325,445,370],21)
    p=new('AI states and wireframe coverage','Every site-map screen and all five states for each AI/voice feature')
    p.table(['Feature','Initial','Loading','Success','Uncertain','Error'],[['A1 Llama interpretation','W03','W04','W05','W06','W07'],['A2 Speech input','W17','W18','W19','W20','W21'],['A3 Spoken replies','W22','W23','W24','W25','W26']],64,180,[330,162,162,162,162,162],20)
    p.text('Screen coverage',64,440,1140,28,bold=True)
    p.text('S01 W01, S02 W02, S03 W03-W07 + W17-W26, S04 W08, S05 W09, S06 W10, S07 W11, S08 W12, S09 W13, S10 W14, S11 W15, S12 W16.',64,495,1140,24)
    p.text('Annotations identify flow, state and current/proposed scope. Browser speech is an assistive service with an unspecified provider, not an implemented faster-whisper or Piper model.',64,630,1140,23,color=GRAY)
    for i in range(0,len(D['wireframes']),2):
        pair=D['wireframes'][i:i+2];p=new('Low-fidelity wireframes',pair[0]['id']+' and '+pair[-1]['id'])
        for j,w in enumerate(pair):wire(p,w,64+j*594,155,550,510,True)
    p=new('Technical spike findings','Six measured calls and explicit failure boundaries')
    st=D['spike']['statistics']
    p.text(f"Minimum {st['minSeconds']:.2f}s     Average {st['averageSeconds']:.2f}s     Maximum {st['maxSeconds']:.2f}s",64,165,1140,32,bold=True,color=TEAL)
    rows=[[s['id']+' '+s['purpose'],f"{s['latencySeconds']:.3f} s",D['quality']['samples'][i]['note']] for i,s in enumerate(D['spike']['samples'])]
    p.table(['Sample','Latency','Analytic review'],rows,64,250,[340,160,640],18)
    p.text('Six replies passed schema validation. S4, S5 and S6 disagree about whether advice was followed. This small run is not a general accuracy estimate. See the separate one-page summary and raw JSON.',64,725,1140,22,color=GRAY)
    p=new('Spike method, limitations and design response','Evidence supports latency-aware feedback and a review checkpoint')
    bullets(p,[
        'Run: September 30, 2026. Llama 3.2 3B Q4_K_M, Ollama 0.21.0, local CPU, 4096-token runtime context. Temperature 0.2, 450 output-token cap, no streaming.',
        'Machine: Intel Core Ultra 5 125H, 15.68 GiB total RAM, 2.12 GiB free at the start. No model was loaded before S1. The first measured call includes loading.',
        'Method: six sequential requests through the production adapter from a standalone script. Record raw model outputs and final adapter responses. No repeat/concurrency study.',
        'Real model-service failures: malformed JSON returned HTTP 400 (unexpected EOF). Missing model returned HTTP 404. A 1ms client deadline raised TimeoutError without a received model response.',
        'Invalid player input returned app HTTP 400 before provider contact. No 429 appeared. Local quota thresholds, browser microphone timing and sustained load are unmeasured.',
        'This loopback experiment used no billed inference API. Hardware, electricity, browser speech and future cloud costs are unmeasured.',
        'Proposed UI response: elapsed wait and cancel, retained counsel and explicit Story fallback, and unscored candidate review for semantic disagreement. Keep Llama provisionally while testing decision flags.'
    ],64,165,1140,22,15)
    p=new('Presentation and submission','Twelve slides with a 600-second speaking plan')
    p.text('The main presentation covers personas, architecture, data flow, task diagrams, AI states, measurements and design changes. Speaker notes contain the timing and source references. Keep Q&A separate: the brief allows 3-5 minutes.',64,180,1140,25)
    p.text('Human review still required',64,350,1140,29,bold=True)
    bullets(p,['Review the contribution statement and add actual personal/collaborator work accurately. AI assistance is disclosed. No agreed team attestation is asserted.','Collect actual peer critique and record feedback plus your design response. The supplied files do not contain completed critique.','Persona references remain provisional until actual research evidence is supplied. Solo exception approval is not documented.','The brief schedules spike/critique for the week of September 28 and presentations for the week of October 5. All deliverables are due by the end of that week. No specific submission hour is given.'],64,420,1140,23,18)
    for start in [0,5]:
        p=new('Sources and editable files','Primary assignment and repository evidence' if start==0 else 'Experiment evidence and official documentation')
        yy=163
        for name,url,note in D['sourceList'][start:start+5]:
            yy=p.text(name+' - '+url,64,yy,1140,20,bold=True)+9
            yy=p.text(note,64,yy,1140,19,color=GRAY)+27
    for i,p in enumerate(pages,1):p.footer(i)
    return pages

def summary_page():
    p=Page('Farshore AI technical spike','One-page summary / September 30, 2026',w=900,h=1280)
    st=D['spike']['statistics'];yy=168
    blocks=[
      ('Model and method','Llama 3.2 3B Q4_K_M, Ollama 0.21.0, local CPU. Intel Core Ultra 5 125H, 15.68 GiB RAM and 2.12 GiB free at start. Six sequential inputs through the existing adapter from a standalone script. Strict JSON schema, temperature 0.2, 450 output-token cap. No loaded model before S1. No repeated/concurrency trials.'),
      ('Latency',f"Minimum {st['minSeconds']:.2f} s, average {st['averageSeconds']:.2f} s, maximum {st['maxSeconds']:.2f} s. Individual wall-clock times: "+', '.join(f"{s['id']} {s['latencySeconds']:.2f} s" for s in D['spike']['samples'])+'. Includes first-call loading, request, parsing and validation. Failure timings excluded.'),
      ('Output quality','All six replies passed structure validation and described actions matching safeChoice. S4/S5 take the requested action but report followed=false. S6 has no definite requested action but reports followed=true. Analytic review of six cases does not establish a production error rate. The archived September 23 reply/score contradiction remains relevant.'),
      ('Failure behavior','E1: malformed JSON to model service, HTTP 400, unexpected EOF. E2: missing model, HTTP 404, model name not found. E3: deliberate 1ms client deadline, TimeoutError, no model response received. E4: one-character advice, app HTTP 400 before provider contact. Exact provider bodies and client errors are archived separately.'),
      ('Limits and cost','No 429 in this sequential local run and no quota/concurrency threshold measured. Existing adapter handles 429. No billed inference API was used. Hardware/electricity, browser speech services and future cloud costs are unmeasured.'),
      ('Effect on the design','Proposed elapsed wait and cancel for long requests. Retain counsel, retry and provide explicit Story mode. Review the action and rationale before score commitment, with refine/discard controls for uncertainty. No invented confidence percentages. Keep Llama provisionally for the prototype and evaluate decision flags.'),
      ('Evidence and sources','evidence/spike-2026-09-30.json, evidence/quality-review.json and scripts/phase2-spike.mjs. Official Ollama compatible API and structured outputs documentation, accessed September 30, 2026. Proposed controls are design deliverables, not implemented game changes.')]
    for title,body in blocks:
        yy=p.text(title,64,yy,772,24,bold=True)+5
        yy=p.text(body,64,yy,772,18)+18
    p.footer(1);return p

def slide_pages():
    pages=[];timings=[20,50,45,55,60,40,50,65,55,65,45,50]
    def new(t,sub=''):
        p=Page(t,sub,w=1280,h=720);pages.append(p);return p
    p=new('Farshore','Phase 2 / Bibek Pathak / CMPS 4200 HCI')
    p.text('The player advises.\nOdysseus decides.',64,220,630,54,bold=True)
    p.text('Information architecture, task flows and AI states',64,425,650,28,color=GRAY)
    p.image(ROOT/'public/art/title.png',800,195,410,280)
    p.notes='Introduce the game: the player uses free language to guide Odysseus home before 240 months. Phase 2 focuses on the structure and behavior of the interaction. This presentation uses current code plus clearly labeled design proposals. Source: Phase 2 brief, page 1; src/lib/game.ts. Original project artwork: public/art/title.png.'
    p=new('Players and design needs','Persona references from the Phase 1 sketches')
    for i,person in enumerate(D['personas']):
        x=64+i*402;p.text(person['name'],x,185,350,34,bold=True)
        p.text(person['goal'],x,255,350,26)
        p.text(person['need'],x,380,350,25,color=TEAL)
    p.text('Provisional persona sketches. Interview evidence was not supplied.',64,600,1150,24,color=GRAY)
    p.notes='Maya cares about fair scoring. Daniel needs a clear start and a text option. Rosa needs to understand the model and why Odysseus refused. These references come from the Phase 1 slide, not a completed interview study. Explain that task flows carry their persona labels. Source: Farshore_Phase12nd.pptx, slide 4; phase2 editable content.'
    p=new('Screen hierarchy','All current screens and shared overlays')
    site(p,64,170,1140,485)
    p.notes='Walk through Title, Introduction, Encounter and Journey report. Shared overlays hold support content without moving the voyage forward. The Encounter contains the Llama feature, optional voice input and spoken output. Settings shows model availability. Source: src/App.tsx screen and Modal types; design packet architecture.'
    p=new('Data flow and privacy','Local text inference with separate browser/OS voice services')
    dataflow(p,64,170,1140,470)
    p.notes='Reviewed text goes through React and the local API to Llama. The model returns text and decision flags. The server determines time and trust changes from authored rules. Accepted results live in browser localStorage. Browser/OS speech may use a remote provider, so voice is a separate privacy boundary. A cloud text endpoint would change the disclosure. Sources: server/turn.ts; src/App.tsx; src/lib/dictation.ts; https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition; https://docs.ollama.com/api/openai-compatibility, accessed September 30, 2026.'
    p=new('F2: Counsel and decision review','Maya and Rosa / review checkpoint proposed')
    flow(p,D['flows'][1],64,165,640,485,False)
    bullets(p,['Read the action and rationale before scoring.','Refine or discard a questionable candidate.','Commit once, then advance the route.','Current game commits immediately.'],800,185,420,27,28)
    p.notes='Describe the primary AI task: valid counsel, processing, structure validation, candidate review and one-time commitment. The proposed review step separates generation from consequences. It preserves a meaningful story refusal while offering a response to model contradiction. Refine counsel, regenerate or discard an unscored candidate. Current code applies a valid result immediately, so this is a Phase 2 design addition. Source: src/App.tsx submit; F2 in design packet.'
    p=new('F3: Dictation and transcript review','Daniel / typing remains available throughout')
    flow(p,D['flows'][2],64,165,660,485,False)
    bullets(p,['Wait for Listening, then speak.','Stop and correct the transcript.','Submit only reviewed text.','A speech failure offers Type instead.'],830,185,375,27,24)
    p.notes='Voice is optional and never submits automatically. Stop dictation and review names and negation before sending. Brave on Windows uses Windows + H guidance. The browser cannot open the OS panel itself. Dictation latency and actual microphone behavior were not measured in this spike. Sources: src/lib/dictation.ts; src/App.tsx; F3.'
    p=new('F4: Error recovery','Maya and Rosa / failed turns preserve counsel and score')
    flow(p,D['flows'][3],64,165,650,485,False)
    bullets(p,['Connection error, timeout or rate limit: retry or Story mode.','Invalid input: explain the required length inline.','Wrong or empty reply: reject or review.'],820,185,390,27,26)
    p.notes='No dead end. Distinguish provider failure, invalid model structure and semantic disagreement. Keep the same draft and unchanged score on failure. Story mode is explicit and labeled. Empty JSON errors already reject. Review and discard for plausible but incorrect output are proposed. The complete packet also contains F1 start/resume and F5 consequence/report. Source: server/turn.ts and src/App.tsx recovery; F1-F5.'
    p=new('AI interface states','Input, long-wait feedback and result review')
    columns=[('Initial',['Scene and current mode','Editable counsel','Dictate / Send']),('Loading',['Thinking and elapsed wait','Draft retained','Cancel request (proposed)']),('Success',['Action and rationale','Preview time/trust','Accept decision (proposed)'])]
    for i,(title,rows) in enumerate(columns):
        x=64+i*405;p.text(title,x,185,360,30,bold=True)
        p.box(x,255,350,295,WHITE,'#777777')
        yy=280
        for row in rows:
            p.box(x+18,yy,314,65,'#f1f1f1','#999999');p.text(row,x+32,yy+15,286,23,color='#333333');yy+=82
    p.text('W03-W07 cover all five Llama states. W17-W26 cover optional voice services.',64,600,1150,23,color=GRAY)
    p.notes='Show the low-fidelity component structure. The game art and style can remain, but this phase isolates hierarchy and controls. Measurements require more than a spinner: proposed elapsed time and cancellation address waits above ten seconds. The success state includes a proposed unscored review checkpoint. The full packet has 26 wireframes across every screen and five states for interpretation, speech input and spoken replies. Sources: Phase 2 brief page 2; W01-W26; fresh spike.'
    p=new('Uncertainty and user control','Proposed review before a candidate changes the score')
    p.box(64,185,560,370,WHITE,'#777777')
    p.text('Review this interpretation',88,210,510,30,bold=True)
    p.text('Check the action against your counsel',88,280,510,25)
    p.text('Refine and retry\nDiscard result\nUse Story mode',88,370,510,27,color=TEAL)
    bullets(p,['Show rationale and story sources.','Avoid invented confidence percentages.','Practice-only undo restores route, log and scores.','Semantic mismatch detection remains unvalidated.'],720,195,490,27,22)
    p.notes='An LLM confidence percentage would mislead. Use action wording, rationale, sources and player verification. Sources explain the story, not model certainty. A questionable candidate is unscored. A practice-only undo supports learning after commitment and restores branch state. The design does not claim a reliable automatic semantic detector or content moderation system. Sources: Phase 2 brief confidence note; W06; evidence/quality-review.json.'
    p=new('AI technical spike','Six real Llama calls on this laptop')
    st=D['spike']['statistics']
    p.text(f"Min {st['minSeconds']:.2f}s     Mean {st['averageSeconds']:.2f}s     Max {st['maxSeconds']:.2f}s",64,165,1150,34,bold=True,color=TEAL)
    notes=['Consistent action and flags','Negation handled','Risky advice understood','Followed flag disagrees','Followed flag disagrees','No action, but followed=true']
    short_purposes=['Supportive safe counsel','Negation with safe counsel','Polite dangerous counsel','Direct safe counsel','Motivated safe counsel','Ambiguous counsel']
    p.table(['Input','Use case','Seconds','Analytic review'],[[s['id'],short_purposes[i],f"{s['latencySeconds']:.2f}",notes[i]] for i,s in enumerate(D['spike']['samples'])],64,255,[90,360,155,545],23,49)
    p.text('Single sequential run, first-call loading included. Six valid structures. Three followed-flag disagreements.',64,625,1140,22,color=GRAY)
    p.notes='Method: standalone script uses the existing production prompt and adapter, captures raw provider bodies and times six realistic inputs. Local CPU inference, Llama 3.2 3B Q4_K_M, temperature 0.2 and 450 output-token cap. No model was loaded before S1. Report min, arithmetic mean and max across valid calls only. S4 and S5 follow requested actions but say followed=false. S6 has no requested action but says followed=true. This is a small analytic sample, not an accuracy benchmark. Sources: scripts/phase2-spike.mjs; evidence/spike-2026-09-30.json; evidence/quality-review.json.'
    p=new('Failures and design changes','Actual provider errors and separate client/app failures')
    p.table(['Failure','Observed response','Design response'],[['Malformed model JSON','HTTP 400: unexpected EOF','Explain invalid request / preserve draft'],['Missing model','HTTP 404: model not found','Connection check / explicit Story mode'],['1ms client deadline','TimeoutError, no received model body','Cancel long waits / retain counsel'],['One-character counsel','App HTTP 400 before model contact','Inline input guidance']],64,185,[365,385,400],24)
    p.text('No quota benchmark or API fee. Hardware and speech costs unmeasured.',64,605,1150,23,color=GRAY)
    p.notes='Two failures actually reached the model service and produced archived HTTP error bodies. The timeout is deliberately client-side with no received model response. Invalid counsel stops at the app boundary. No 429 was observed, and this test says nothing about sustained capacity. Local requests used no billed inference API. Do not claim an invalid API key failure for local Ollama because local keys are ignored. Sources: evidence/spike-2026-09-30.json; https://docs.ollama.com/api/openai-compatibility, accessed September 30, 2026.'
    p=new('Current prototype and Phase 2 design','Implemented behavior, proposed controls and remaining human review')
    p.text('Implemented',64,190,520,31,bold=True)
    bullets(p,['Playable 15-chapter game and branches','Local Llama integration and real evidence','Editable counsel, explanations and retry'],64,250,540,26,24)
    p.text('Proposed',720,190,490,31,bold=True)
    bullets(p,['Elapsed waits and request cancellation','Unscored review, refine and discard','Practice undo and uncertainty states'],720,250,490,26,24)
    p.text('Before submission: review contributions, collect peer critique and verify the solo arrangement. Personas remain provisional.',64,570,1140,25,color=GRAY)
    p.notes='Close by distinguishing the working prototype from the Phase 2 design. Keep local Llama provisionally, but the decision flags need improvement and evaluation. Class critique and real research require people. Bibek owns the concept and presentation. Codex assisted with drafting, experiment code and artifacts. The contribution statement is a review draft, not an agreed team attestation. Source: phase2/contribution-statement.md, peer-critique.md and design packet. Invite the allotted 3-5 minutes of Q&A after the 10-minute talk.'
    for i,p in enumerate(pages):
        p.footer(i+1);p.notes=f'Timing: {timings[i]} seconds.\n\n'+p.notes
    assert sum(timings)==600
    return pages

def draw_pdf(pages,file,page_size):
    c=canvas.Canvas(str(file),pagesize=page_size);c.setTitle('Farshore Phase 2');c.setAuthor('Bibek Pathak, with disclosed AI assistance')
    for p in pages:
        scale=min(page_size[0]/p.w,page_size[1]/p.h)
        c.saveState();c.scale(scale,scale)
        if p.dark:c.setFillColor(HexColor(NAVY));c.rect(0,0,p.w,p.h,fill=1,stroke=0)
        for e in p.items:
            typ=e['type'];x=e.get('x',0);y=e.get('y',0)
            if typ=='text':
                c.setFillColor(HexColor(e['color']));c.setFont('Arial-Bold' if e['bold'] else 'Arial',e['size'])
                for i,t in enumerate(e['lines']):c.drawString(x,p.h-y-e['size']-i*e['size']*1.3,t)
            elif typ=='box':
                c.setStrokeColor(HexColor(e['stroke']));c.setFillColor(HexColor(e['fill']));c.setLineWidth(1.2);c.rect(x,p.h-y-e['h'],e['w'],e['h'],fill=1,stroke=1)
            elif typ=='line':
                x2=e['x2'];y2=e['y2'];c.setStrokeColor(HexColor(e['color']));c.setLineWidth(1.5);c.setDash(5,4) if e['dash'] else c.setDash()
                c.line(x,p.h-y,x2,p.h-y2);c.setDash();a=math.atan2(y2-y,x2-x)
                for q in [-.45,.45]:c.line(x2,p.h-y2,x2-9*math.cos(a+q),p.h-y2+9*math.sin(a+q))
            elif typ=='image':c.drawImage(ImageReader(e['file']),x,p.h-y-e['h'],e['w'],e['h'],preserveAspectRatio=True,anchor='c')
            elif typ=='table':
                yy=y
                for ri,row in enumerate(e['cells']):
                    xx=x;hh=e['heights'][ri]
                    for ci,value in enumerate(row):
                        ww=e['widths'][ci];c.setFillColor(HexColor('#dce8ee' if ri==0 else WHITE));c.setStrokeColor(HexColor('#c5d2d8'));c.rect(xx,p.h-yy-hh,ww,hh,fill=1,stroke=1)
                        c.setFillColor(HexColor(NAVY));c.setFont('Arial-Bold' if ri==0 else 'Arial',e['size'])
                        for j,t in enumerate(wrap(value,ww-24,e['size'],ri==0)):c.drawString(xx+12,p.h-yy-12-e['size']-j*e['size']*1.3,t)
                        xx+=ww
                    yy+=hh
        c.restoreState();c.showPage()
    c.save()

def pptx(pages,file):
    emu=lambda px:round(px*9525)
    col=lambda s:s.lstrip('#').upper()
    parts={};parts['_rels/.rels']='''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'''
    ns='xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
    def tx(text,size,bold=False,color=NAVY):
        paras=[]
        for t in str(text).split('\n'):
            paras.append(f'<a:p><a:pPr><a:lnSpc><a:spcPct val="130000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="{round(size*75)}" b="{int(bold)}"><a:solidFill><a:srgbClr val="{col(color)}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t xml:space="preserve">{escape(t)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>')
        return ''.join(paras)
    def shape(id,e,geom='rect'):
        xx=emu(e['x']);yy=emu(e['y']);ww=emu(e['w'])
        # Office includes font ascender/descender metrics in BoundHeight. Reserve
        # room for them without shrinking or auto-fitting the intended text.
        hh=emu(e['h']*1.18+4 if e['type']=='text' else e['h'])
        fill=e.get('fill');stroke=e.get('stroke');istext=e['type']=='text'
        props=f'<a:xfrm><a:off x="{xx}" y="{yy}"/><a:ext cx="{ww}" cy="{hh}"/></a:xfrm><a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>'
        props+=f'<a:solidFill><a:srgbClr val="{col(fill)}"/></a:solidFill>' if fill else '<a:noFill/>'
        props+=f'<a:ln w="12700"><a:solidFill><a:srgbClr val="{col(stroke)}"/></a:solidFill></a:ln>' if stroke else '<a:ln><a:noFill/></a:ln>'
        body=''
        if istext:body=f'<p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>{tx(e["text"],e["size"],e["bold"],e["color"])}</p:txBody>'
        return f'<p:sp><p:nvSpPr><p:cNvPr id="{id}" name="{escape(e.get("text",geom)[:55],{chr(34):"&quot;"})}"/><p:cNvSpPr txBox="{int(istext)}"/><p:nvPr/></p:nvSpPr><p:spPr>{props}</p:spPr>{body}</p:sp>'
    group='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    for si,p in enumerate(pages,1):
        objects=[];rels=[f'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',f'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide{si}.xml"/>'];id=2
        for e in p.items:
            typ=e['type']
            if typ in ['text','box']:objects.append(shape(id,e))
            elif typ=='line':
                x=min(e['x'],e['x2']);y=min(e['y'],e['y2']);w=abs(e['x2']-e['x']);h=abs(e['y2']-e['y'])
                flips=(' flipH="1"' if e['x2']<e['x'] else '')+(' flipV="1"' if e['y2']<e['y'] else '')
                dash_xml='<a:prstDash val="dash"/>' if e['dash'] else ''
                objects.append(f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{id}" name="Connector {id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm{flips}><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="{col(e["color"])}"/></a:solidFill>{dash_xml}<a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>')
            elif typ=='image':
                name=f'image{si}-{id}.png';parts['ppt/media/'+name]=Path(e['file']).read_bytes();rid='rId'+str(len(rels)+1)
                rels.append(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/{name}"/>')
                objects.append(f'<p:pic><p:nvPicPr><p:cNvPr id="{id}" name="Original title art"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="{emu(e["x"])}" y="{emu(e["y"])}"/><a:ext cx="{emu(e["w"])}" cy="{emu(e["h"])}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')
            elif typ=='table':
                rows=[]
                for ri,row in enumerate(e['cells']):
                    cells=[]
                    for value in row:
                        cells.append(f'<a:tc><a:txBody><a:bodyPr lIns="114300" rIns="114300" tIns="76200" bIns="0"/><a:lstStyle/>{tx(value,e["size"],ri==0)}</a:txBody><a:tcPr><a:solidFill><a:srgbClr val="{"DCE8EE" if ri==0 else "FFFFFF"}"/></a:solidFill></a:tcPr></a:tc>')
                    rows.append(f'<a:tr h="{emu(e["heights"][ri])}">'+''.join(cells)+'</a:tr>')
                grid=''.join(f'<a:gridCol w="{emu(w)}"/>' for w in e['widths'])
                objects.append(f'<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="{id}" name="Editable evidence table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="{emu(e["x"])}" y="{emu(e["y"])}"/><a:ext cx="{emu(e["w"])}" cy="{emu(e["h"])}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="0"/><a:tblGrid>{grid}</a:tblGrid>{"".join(rows)}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>')
            id+=1
        parts[f'ppt/slides/slide{si}.xml']=f'<p:sld {ns}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="{col(NAVY if p.dark else WHITE)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>{group}{"".join(objects)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
        parts[f'ppt/slides/_rels/slide{si}.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(rels)+'</Relationships>'
        note_shape=f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Speaker notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>{tx(p.notes,16)}</p:txBody></p:sp>'
        parts[f'ppt/notesSlides/notesSlide{si}.xml']=f'<p:notes {ns}><p:cSld><p:spTree>{group}{note_shape}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
        parts[f'ppt/notesSlides/_rels/notesSlide{si}.xml.rels']=f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide{si}.xml"/></Relationships>'
    cm='<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>'
    parts['ppt/presentation.xml']=f'<p:presentation {ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+''.join(f'<p:sldId id="{255+i}" r:id="rId{i+2}"/>' for i in range(1,len(pages)+1))+f'</p:sldIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldSz cx="{emu(1280)}" cy="{emu(720)}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>'
    parts['ppt/_rels/presentation.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>'+''.join(f'<Relationship Id="rId{i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>' for i in range(1,len(pages)+1))+'</Relationships>'
    parts['ppt/slideMasters/slideMaster1.xml']=f'<p:sldMaster {ns}><p:cSld><p:spTree>{group}</p:spTree></p:cSld>{cm}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'
    parts['ppt/slideMasters/_rels/slideMaster1.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'
    parts['ppt/slideLayouts/slideLayout1.xml']=f'<p:sldLayout {ns} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>{group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    parts['ppt/slideLayouts/_rels/slideLayout1.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'
    parts['ppt/notesMasters/notesMaster1.xml']=f'<p:notesMaster {ns}><p:cSld><p:spTree>{group}</p:spTree></p:cSld>{cm}<p:notesStyle/></p:notesMaster>'
    parts['ppt/notesMasters/_rels/notesMaster1.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'
    colors={'dk1':'102E40','lt1':'FFFFFF','dk2':'526875','lt2':'F5F6F7','accent1':'126978','accent2':'A9884B','accent3':'577A8C','accent4':'A15347','accent5':'487563','accent6':'7B638A','hlink':'126978','folHlink':'7B638A'}
    # Reuse the supplied presentation's schema-complete Office theme. All slide
    # fonts and colors are explicit, so this does not copy its slide design.
    with zipfile.ZipFile(ROOT/'Farshore Context and Assisment/docs/assignment/original/Farshore_Phase12nd.pptx') as reference:
        parts['ppt/theme/theme1.xml']=reference.read('ppt/theme/theme1.xml')
    overrides=[]
    for name in parts:
        if name.endswith('.xml'):
            kind='presentation' if name=='ppt/presentation.xml' else 'slideMaster' if '/slideMasters/' in name else 'slideLayout' if '/slideLayouts/' in name else 'notesMaster' if '/notesMasters/' in name else 'notesSlide' if '/notesSlides/' in name else 'slide' if '/slides/' in name else 'theme' if '/theme/' in name else None
            if kind:overrides.append(f'<Override PartName="/{name}" ContentType="application/vnd.openxmlformats-officedocument.{"theme+xml" if kind=="theme" else "presentationml."+kind+"+xml"}"/>')
    parts['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/>'+''.join(overrides)+'</Types>'
    # main presentation needs the macro-free main MIME type.
    parts['[Content_Types].xml']=parts['[Content_Types].xml'].replace('presentationml.presentation+xml','presentationml.presentation.main+xml')
    with zipfile.ZipFile(file,'w',zipfile.ZIP_DEFLATED) as z:
        for name,body in parts.items():z.writestr(name,body if isinstance(body,bytes) else '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+body)

if __name__=='__main__':
    packet=packet_pages();summary=summary_page();slides=slide_pages()
    draw_pdf(packet,OUT/'Farshore-Phase-2-Design-Packet.pdf',(841.89,591.95))
    draw_pdf([summary],OUT/'technical-spike-summary.pdf',(595.28,841.89))
    pptx(slides,OUT/'Farshore-Phase-2-Presentation.pptx')
    # Private fallback preview. The final slide PDF comes from PowerPoint.
    draw_pdf(slides,BUILD/'slides-preview.pdf',(960,540))
    (BUILD/'layout.json').write_text(json.dumps([{'title':p.title,'items':p.items} for p in slides],indent=2),encoding='utf-8')
    (OUT/'speaker-notes.md').write_text('# Farshore Phase 2 speaking plan\n\nTotal: 600 seconds (10 minutes). Q&A: 3-5 minutes separately.\n\n'+'\n\n'.join(f'## {i+1}. {p.title}\n\n{p.notes}' for i,p in enumerate(slides)),encoding='utf-8')
    print(f'Created {len(packet)}-page design packet, one-page summary and {len(slides)}-slide editable PowerPoint.')
