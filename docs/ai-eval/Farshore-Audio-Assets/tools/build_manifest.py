"""Create browser-friendly audio metadata and a Colab notebook."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
PLAN=json.loads((ROOT/"audio-plan.json").read_text(encoding="utf-8"))
sid=lambda x:x["id"]
manifest={
    "assetRoot":"/audio/farshore",
    "defaultVolumes":{"master":0.8,"music":0.34,"ambience":0.38,"voice":0.88,"sfx":0.52},
    "scenes":{},
    "sfx":{},
    "voices":{}
}
status={"ambience":{},"music":{},"sfx":{},"voice":{}}
for scene in PLAN["scenes"]:
    i=sid(scene)
    manifest["scenes"][i]={
        "name":scene["title"],
        "ambience":["ambience/"+i+".ogg","ambience/"+i+".mp3"],
        "music":["music/"+i+".ogg","music/"+i+".mp3"],
        "loop":True,
        "narration":"intro" if i=="home" else None if i=="voyage-map" else i
    }
    status["ambience"][i]=status["music"][i]="Original procedural starter"
for i in PLAN["sfx"]:
    manifest["sfx"][sid(i)]={"src":"sfx/"+sid(i)+".wav","duration":i["duration"],"loop":False}
    status["sfx"][sid(i)]="Original procedural starter"
for i in PLAN["voices"]:
    manifest["voices"][sid(i)]={"src":"voice/"+sid(i)+".mp3","role":i["role"],"subtitle":i["text"],"loop":False}
    status["voice"][sid(i)]="Flite offline fallback (replace with Kokoro in Colab)"
(ROOT/"audio-manifest.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding="utf-8")
if not (ROOT/"generation-status.json").exists():
    (ROOT/"generation-status.json").write_text(json.dumps(status,indent=2),encoding="utf-8")

# Self-contained Colab workflow except for the starter pack that the user uploads.
cells=[]
def md(text):
    cells.append({"cell_type":"markdown","metadata":{},"source":text.splitlines(keepends=True)})
def code(text):
    cells.append({"cell_type":"code","metadata":{},"execution_count":None,"outputs":[],"source":text.splitlines(keepends=True)})

md("""# FARSHORE | free cinematic audio generator

Use this notebook on Google Colab. It regenerates the bundled basic narration into higher-quality Kokoro neural speech and optionally replaces soundscapes with local Stable Audio 3 outputs. No paid API is used.

**Workflow:** upload the Farshore-Audio-Assets.zip when requested, run the Kokoro cells, then download the upgraded ZIP. Optional Stable Audio generation may take longer and requires enough free runtime. Choose a GPU runtime if available. No paid Colab tier is required by the code, but free compute quotas and model-download access are outside this notebook's control.

Source projects: [Kokoro](https://github.com/hexgrad/kokoro), [Stable Audio 3](https://github.com/Stability-AI/stable-audio-3).""")
code("""from google.colab import files
from pathlib import Path
import zipfile, shutil, subprocess, sys, os

work = Path('/content/farshore_audio_work')
work.mkdir(exist_ok=True)
uploaded = files.upload()
names = [n for n in uploaded if n.lower().endswith('.zip')]
assert len(names) == 1, 'Upload exactly Farshore-Audio-Assets.zip.'
source = Path(names[0])
with zipfile.ZipFile(source) as z:
    for member in z.infolist():
        target = (work / member.filename).resolve()
        if not target.is_relative_to(work.resolve()):
            raise ValueError('Unsafe archive path')
    z.extractall(work)
pack = work / 'Farshore-Audio-Assets'
assert (pack / 'audio-plan.json').is_file(), 'The expected starter package was not found.'
print('Ready:', pack)
""")
md("""## 1. Generate all 21 neural voiceovers with Kokoro

This section is the recommended minimum upgrade. The starter ZIP includes basic Flite speech only for immediate audio integration. Kokoro replaces those files in-place with neural dialogue using the same filenames and subtitles.""")
code("""subprocess.run(['apt-get', '-qq', '-y', 'install', 'espeak-ng'], check=True)
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'kokoro>=0.9.4', 'soundfile'], check=True)
subprocess.run([sys.executable, str(pack/'tools/render_kokoro.py')], check=True)
""")
code("""from IPython.display import Audio, display
display(Audio(filename=str(pack/'audio/voice/intro.mp3')))
display(Audio(filename=str(pack/'audio/voice/oracle-ready.mp3')))
""")
md("""## 2. Optional: regenerate original scene music, ambience and or sound effects with Stable Audio 3

The procedural starter effects and music are already usable. This optional stage creates AI-generated audio in the local Colab runtime. Review [the Stability AI Community License](https://stability.ai/license). You may need to accept model terms for [Small-SFX](https://huggingface.co/stabilityai/stable-audio-3-small-sfx) and [Small-Music](https://huggingface.co/stabilityai/stable-audio-3-small-music) with a free Hugging Face account. If downloads are gated, add a read token in Colab's Secrets panel under HF_TOKEN.

Start with scope 'test' (one ambience and one music track). Change to 'scenes' for all 10 environments; 'all' also regenerates the 34 one-shot effects. Free Colab sessions are variable, and installing the optional model dependencies can take a while. Leave the option disabled if you just want the neural voices and starter sound effects.""")
code("""RUN_STABLE_AUDIO = False  # @param {type:"boolean"}
SCOPE = "test"  # @param ["test", "scenes", "all"]
SECONDS = 18  # @param {type:"integer"}

if RUN_STABLE_AUDIO:
    try:
        from google.colab import userdata
        token = userdata.get('HF_TOKEN')
        if token:
            os.environ['HF_TOKEN'] = token
    except Exception:
        pass
    repo = Path('/content/stable-audio-3')
    if not repo.exists():
        subprocess.run(['git','clone','--depth','1','https://github.com/Stability-AI/stable-audio-3.git',str(repo)],check=True)
    subprocess.run([sys.executable,'-m','pip','install','-q','uv'],check=True)
    subprocess.run(['uv','sync'],cwd=repo,check=True)
    subprocess.run(['uv','run','python',str(pack/'tools/render_stable.py'),'--scope',SCOPE,'--seconds',str(SECONDS)],cwd=repo,check=True)
else:
    print('Skipped optional AI music/SFX. Starter files are preserved.')
""")
md("""## 3. Download the completed audio pack

When the voiceovers are generated, run this final cell. The ZIP contains the exact audio filenames, the source plan, the updated generation-status metadata, and Claude integration instructions. Give this ZIP to Claude Code.""")
code("""import json
status = json.loads((pack/'generation-status.json').read_text())
from collections import Counter
for category, items in status.items():
    print(category, dict(Counter(items.values())))
archive = shutil.make_archive('/content/Farshore-Colab-Audio','zip',root_dir=pack.parent,base_dir=pack.name)
files.download(archive)
""")
notebook={"cells":cells,"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"},"language_info":{"name":"python"},"colab":{"provenance":[]}},"nbformat":4,"nbformat_minor":0}
(ROOT/"colab/Farshore-Audio-Generator.ipynb").write_text(json.dumps(notebook,indent=1),encoding="utf-8")

# Local sampler: embedded manifest avoids fetch/CORS when opened from disk.
preview="""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FARSHORE Audio Preview</title>
<style>body{background:#080f17;color:#f5e8d0;font:16px system-ui;margin:0;padding:32px}main{max-width:980px;margin:auto}h1,h2{font-family:Georgia,serif;font-weight:400;color:#e4bf79}h1{font-size:42px}details{border:1px solid #795a3588;border-radius:14px;padding:16px;margin:10px 0;background:#13202b}summary{cursor:pointer}article{display:grid;gap:7px;margin:15px 0;padding-top:10px;border-top:1px solid #ffffff15}audio{width:min(420px,100%);height:40px}small{color:#c8bdab}p{line-height:1.5}</style>
<main><h1>Farshore · Audio preview</h1><p>Play any starter track. Voice files are intentionally basic until regenerated with the Colab notebook. Original procedural effects and loops can be replaced by the optional model stage.</p><div id="list"></div></main>
<script>const manifest=MANIFEST;const root=document.getElementById('list');
function section(name,items){const d=document.createElement('details');const s=document.createElement('summary');s.textContent=name;d.append(s);for(const [label,src,note] of items){const a=document.createElement('article'),title=document.createElement('span'),audio=document.createElement('audio');title.textContent=label;audio.controls=true;audio.preload='none';audio.src='audio/'+src;audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(el=>{if(el!==audio)el.pause()}));a.append(title,audio);if(note){const text=document.createElement('small');text.textContent=note;a.append(text)}d.append(a)}root.append(d)}
section('Scene ambience',Object.values(manifest.scenes).map(s=>[s.name,s.ambience[1]]));section('Scene music',Object.values(manifest.scenes).map(s=>[s.name,s.music[1]]));section('Gameplay and UI effects',Object.entries(manifest.sfx).map(([k,v])=>[k,v.src]));section('Narration and dialogue',Object.entries(manifest.voices).map(([k,v])=>[k,v.src,v.subtitle]));</script></html>"""
(ROOT/"preview.html").write_text(preview.replace("MANIFEST",json.dumps(manifest,ensure_ascii=False)),encoding="utf-8")
