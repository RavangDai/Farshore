"""Optional local Stable Audio 3 generation; run using the project's uv environment."""
import argparse, gc, json, subprocess, tempfile
from pathlib import Path
import numpy as np
import torch
from stable_audio_3 import StableAudioModel

ROOT=Path(__file__).resolve().parents[1]
PLAN=json.loads((ROOT/"audio-plan.json").read_text(encoding="utf-8"))
STATUS=ROOT/"generation-status.json"
status=json.loads(STATUS.read_text(encoding="utf-8"))
parser=argparse.ArgumentParser()
parser.add_argument("--scope",choices=["test","scenes","all"],default="test")
parser.add_argument("--seconds",type=int,default=18)
args=parser.parse_args()
device="cuda" if torch.cuda.is_available() else "cpu"
print("Local inference device:",device,flush=True)

def encode(audio, sr, target, format):
    audio=np.asarray(audio,dtype=np.float32)
    peak=np.max(np.abs(audio))
    if not np.isfinite(peak) or peak<1e-4:
        raise ValueError("Silent/invalid output")
    audio=audio*(.78/peak)
    audio=np.ascontiguousarray(audio)
    codecs={"ogg":["-c:a","libvorbis","-q:a","5"],"mp3":["-c:a","libmp3lame","-b:a","128k"],"wav":["-c:a","pcm_s16le"]}
    subprocess.run(["ffmpeg","-y","-v","error","-f","f32le","-ar",str(sr),"-ac",str(audio.shape[1]),
                    "-i","pipe:0",*codecs[format],str(target)],input=audio.tobytes(),check=True)

def loop_join(wave,sr,seconds,overlap=.75):
    n,o=int(seconds*sr),int(overlap*sr)
    if len(wave)<n+o:
        n=len(wave)-o
    if n<=o:
        return wave
    out=wave[o:o+n].copy()
    a=np.linspace(0,1,o)[:,None]
    out[-o:]=out[-o:]*(1-a)+wave[:o]*a
    return out

def render(model,category,item,seconds,seed):
    loop=category!="sfx"
    prompt=item[category] if loop else item["prompt"]
    if loop:
        prompt += ", continuous seamless looping texture, no abrupt ending"
    waveform=model.generate(prompt=prompt,duration=seconds+(.8 if loop else 0),steps=8,seed=seed)
    pcm=waveform.detach().cpu().float().numpy()[0].T
    sr=int(model.model.sample_rate)
    if loop:
        pcm=loop_join(pcm,sr,seconds)
    else:
        taper=min(int(sr*.035),len(pcm)//4)
        pcm[:taper]*=np.linspace(0,1,taper)[:,None]
        pcm[-taper:]*=np.linspace(1,0,taper)[:,None]
    formats=["ogg","mp3"] if loop else ["wav"]
    with tempfile.TemporaryDirectory() as tmp:
        tmp=Path(tmp)
        for f in formats: encode(pcm,sr,tmp/(item["id"]+"."+f),f)
        for f in formats:
            dst=ROOT/"audio"/category/(item["id"]+"."+f)
            dst.write_bytes((tmp/(item["id"]+"."+f)).read_bytes())
    status[category][item["id"]]="Stable Audio 3"
    STATUS.write_text(json.dumps(status,indent=2),encoding="utf-8")
    print(category,item["id"],flush=True)

scenes=PLAN["scenes"][:1] if args.scope=="test" else PLAN["scenes"]
model=StableAudioModel.from_pretrained("small-sfx",device=device,model_half=(device=="cuda"))
for i,scene in enumerate(scenes):
    render(model,"ambience",scene,args.seconds,1000+i)
if args.scope=="all":
    for i,item in enumerate(PLAN["sfx"]):
        render(model,"sfx",item,max(1.0,item["duration"]),2000+i)
del model
gc.collect()
if device=="cuda": torch.cuda.empty_cache()
model=StableAudioModel.from_pretrained("small-music",device=device,model_half=(device=="cuda"))
for i,scene in enumerate(scenes):
    render(model,"music",scene,max(24,args.seconds),3000+i)
print("Done. Successful AI files replaced their respective starter files.",flush=True)
