"""Original synthetic starter sound design. No external audio samples or paid API."""
import json, math, subprocess, tempfile, wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
PLAN = json.loads((ROOT / "audio-plan.json").read_text(encoding="utf-8"))
SR = 32000
rng = np.random.default_rng(190826)

def time(d):
    return np.arange(round(d * SR), dtype=np.float64) / SR

def noise(t, low=0, high=11000):
    x = rng.standard_normal(len(t))
    if low and high:
        x = sosfilt(butter(2, (low, high), fs=SR, btype="bandpass", output="sos"), x)
    elif high:
        x = sosfilt(butter(2, high, fs=SR, output="sos"), x)
    return x / max(np.std(x), 1e-6)

def sine(t, f):
    return np.sin(2 * np.pi * f * t)

def sweep(t, a, b):
    return np.sin(2 * np.pi * (a * t + .5 * (b - a) * t*t / max(t[-1], .001)))

def envelope(t, attack=.015, decay=3.0):
    return np.minimum(1, t / max(attack, .001)) * np.exp(-decay*t / max(t[-1], .001))

def pan(x, position=0):
    a = (np.clip(position, -1, 1) + 1) * np.pi / 4
    return np.column_stack((x*np.cos(a), x*np.sin(a)))

def stereo(t, low, high, spread=.3):
    mid = noise(t, low, high)
    return np.column_stack((mid + spread*noise(t, low, high), mid + spread*noise(t, low, high)))

def place(out, x, at, p=0, gain=1):
    x = pan(x, p) if x.ndim == 1 else x
    i = round(at * SR)
    if i >= len(out): return
    n = min(len(x), len(out)-i)
    out[i:i+n] += x[:n] * gain

def chime(d, f, scale=1):
    t = time(d)
    return sum(w*sine(t, f*k)*np.exp(-t*r) for k,w,r in
               [(1,1,3.0),(2.01,.38,5.5),(3.08,.21,7),(4.2,.085,12)]) * np.minimum(t/.006, 1) * scale

def pluck(d, f, brightness=.65):
    t = time(d)
    return sum((brightness**(h-1)/h)*sine(t, f*h)*np.exp(-t*(3+h*.9))
               for h in range(1,8)) * np.minimum(1,t/.006)

def drum(d, f=62):
    t = time(d)
    body = np.sin(2*np.pi*(f*t+.026*f*(1-np.exp(-t*36)))) * np.exp(-t*8)
    strike = noise(t, 850, 4100)*np.exp(-t*43)*.14
    return (body + strike) * np.minimum(t/.004, 1)

def airy(d, lo=250, hi=4000, direction=1):
    t = time(d)
    env = np.sin(np.pi*np.clip(t/max(t[-1], .001),0,1))**1.5
    return (noise(t,lo,hi)*.24 + sweep(t,80 if direction==1 else 260,260 if direction==1 else 80)*.10)*env

def tonal(d, notes, center=True):
    out = np.zeros((len(time(d)),2))
    for i, f in enumerate(notes):
        place(out, chime(min(d,1.4), f), i*min(.2,d/(len(notes)+1)), (i%2-.5)*.35, .32)
    if center:
        place(out, drum(min(d,.45),90),0,0,.12)
    return out

def ambience(scene, seconds=16):
    t = time(seconds+1.0)
    out = np.zeros((len(t),2))
    a = lambda f: .60+.40*sine(t, f+0.01)**2
    sea = stereo(t,70,1200,.27) * (.10*a(.22))[:,None]
    sea += stereo(t,700,5100,.4) * (.033*a(.27))[:,None]
    breeze = stereo(t,160,2200,.55) * (.032*a(.17))[:,None]
    deep = stereo(t,22,100,.17) * (.055*a(.11))[:,None]
    out += breeze
    if scene in ("home","voyage-map","aeolus","sirens-passage","scylla-charybdis","calypsos-raft"):
        out += sea*(1.55 if scene in ("aeolus","scylla-charybdis") else .8)
    if scene in ("cyclops-cave","scylla-charybdis","aeolus"):
        out += deep*(1.7 if scene=="scylla-charybdis" else 1)
        for k in [3.1,10.4]:
            place(out, drum(2.2,38), k, -.2, .30)
    if scene in ("lotus-eaters","circes-palace","ithaca"):
        out += stereo(t,300,3600,.5)*(.019*a(.6))[:,None]
        out += stereo(t,90,600,.4)*(.017*a(.3))[:,None]
        for k in [2.1,6.5,11.4,14.0]:
            place(out,chime(1.8, rng.choice([330,392,523,587])),k,rng.uniform(-.7,.7),.07)
    if scene in ("cyclops-cave","circes-palace","ithaca"):
        for k in np.arange(.3,t[-1],.21):
            if rng.random()<.45:
                z=time(.055)
                place(out,noise(z,1100,10500)*np.exp(-z*92),k+rng.uniform(0,.08),rng.uniform(-.9,.9),rng.uniform(.008,.075))
        for k in [1.4,4.7,9.2,14.3]:
            place(out,chime(.6, rng.uniform(700,1100)), k,-.4,.027)
    if scene=="lotus-eaters":
        for k in [2.8,3.3,8.1,12.4]:
            z=time(.18)
            place(out,sweep(z,1800,2700)*envelope(z,.012,5),k,rng.uniform(-.8,.8),.06)
    if scene in ("home","voyage-map","calypsos-raft","aeolus"):
        for k in [1.1,5.2,9.7,13.2]:
            z=time(.7); creak=sweep(z,160,59)*np.sin(np.pi*z/.7)**2+noise(z,180,900)*.16
            place(out,creak,k,.5,.035 if scene=="home" else .054)
    if scene=="sirens-passage":
        for f in [174.61,220,261.63,349.23]:
            x=(sine(t,f+.23*sine(t,.26)) + .43*sine(t,2*f)) * (.015+.02*(.5+.5*sine(t,.1))**2)
            out+=pan(x,rng.uniform(-.7,.7))
    if scene=="scylla-charybdis":
        out+=stereo(t,55,650,.38)*(.095*a(.4))[:,None]
    return loop_xfade(out, seconds,1)

def loop_xfade(x, seconds, overlap=1):
    n,o=round(SR*seconds),round(SR*overlap)
    assert len(x)>=n+o
    y=x[o:n+o].copy()
    a=np.linspace(0,1,o)[:,None]
    # complementary crossfade gives a continuous loop seam.
    y[-o:]=y[-o:]*(1-a)+x[:o]*a
    return y

def music(scene, seconds=24):
    t=time(seconds+1)
    out=np.zeros((len(t),2))
    idx=[s["id"] for s in PLAN["scenes"]].index(scene)
    minor = [146.83,174.61,220,261.63]
    chords = [
        [146.83,174.61,220], [130.81,164.81,196],
        [116.54,146.83,174.61], [130.81,155.56,196]
    ]
    if scene=="ithaca": chords=[[146.83,185,220],[130.81,164.81,196],[98,146.83,196],[146.83,185,220]]
    pace = 0.62 if scene in ("cyclops-cave","scylla-charybdis","aeolus") else 1.0
    base_len=6
    for b,chord in enumerate(chords+[chords[0]]):
        z=time(base_len+1.0)
        env=np.minimum(z/.75,1)*np.minimum((base_len+1-z)/.75,1)
        for j,f in enumerate(chord):
            pad=(sine(z,f/2)+.38*sine(z,f)+.15*sine(z,2*f+.2)+.11*sine(z,3*f-.15))*env
            pad*=.027*(.8+.2*sine(z,.19+j*.08))
            place(out,pad,b*base_len,(-.4 if j%2==0 else .4))
        motif=[chord[0]*2,chord[1]*2,chord[2]*2,chord[1]*2]
        for j, f in enumerate(motif):
            place(out,pluck(1.9,f,.66),b*base_len+.5+j*pace,(-.35 if j%2==0 else .28),.105)
        if scene in ("lotus-eaters","sirens-passage","circes-palace","ithaca"):
            for j,f in enumerate([chord[1]*4,chord[2]*4]):
                place(out,chime(2.4,f),b*base_len+1.6+j*2.2, .65 if j==0 else -.65,.033)
        if scene in ("cyclops-cave","scylla-charybdis","aeolus","ithaca"):
            for at in [0,1.5,3,4.5]:
                place(out,drum(.8,53+idx),b*base_len+at,0,.065 if scene=="ithaca" else .14)
    out+=stereo(t,25,120,.12)*.005
    return loop_xfade(out,seconds,1)

def effect(name, d):
    t=time(d); out=np.zeros((len(t),2))
    if name in ("ui-hover","ui-select","checkpoint-complete","oracle-activate","oracle-thinking","pickup","sailor-rescue","trial-start","victory","defeat","magic-pulse","siren-note"):
        sets={
            "ui-hover":[760],"ui-select":[330,495],"checkpoint-complete":[293.66,440,587.33],
            "oracle-activate":[196,293.66,440],"oracle-thinking":[330,369.99],
            "pickup":[494,659],"sailor-rescue":[392,523],"trial-start":[146.83,293.66,440],
            "victory":[293.66,369.99,440,587.33],"defeat":[293.66,261.63,174.61],
            "magic-pulse":[523,698,784],"siren-note":[349.23,523.25]
        }
        out=tonal(d,sets[name],name not in ("ui-hover","oracle-thinking","siren-note"))
        if name in ("oracle-activate","magic-pulse","siren-note","trial-start"):
            out+=pan(airy(d,400,4600),.11)*.24
    elif name in ("ui-back","glass-open","glass-close","wind-gust","maelstrom-surge","water-splash"):
        out=pan(airy(d,100 if name=="maelstrom-surge" else 300,6500, -1 if name in ("ui-back","glass-close") else 1))
        if name in ("water-splash","maelstrom-surge"):
            out+=stereo(t,650,10000,.3)*(envelope(t,.025, 3.0))[:,None]*.20
    elif name in ("cyclops-growl","sea-monster-roar"):
        f=49 if name=="cyclops-growl" else 74
        y=np.sin(2*np.pi*(f*t+3*sine(t,1.7)))+.50*sine(t,f*1.49)+.23*noise(t,90,850)
        y*=np.sin(np.pi*t/d)**2
        out=pan(y,.18)*.42
    elif name in ("footstep-stone","footstep-grass","target-hit","damage","cave-impact","countdown","checkpoint-locked","boulder-rumble","gate-open"):
        y=drum(d,52 if name in ("cave-impact","boulder-rumble","countdown") else 103)
        grit=noise(t,380,6000 if name=="footstep-grass" else 2600)*envelope(t,.006,5)
        out=pan(y*.38+grit*.16)
        if name in ("gate-open","boulder-rumble"):
            out+=pan(airy(d,80,720))*0.42
    elif name in ("sail-flap","raft-creak","bow-twang","potion-mix","warning"):
        if name=="bow-twang": out=pan(pluck(d,128,.9))
        elif name=="warning": out=tonal(d,[147,138],False)
        elif name=="potion-mix":
            out=pan(airy(d,250,1800))*.28
            for i,f in enumerate([370,523,698]): place(out,chime(.45,f),i*.23,(-1)**i*.3,.15)
        elif name=="sail-flap": out=pan(airy(d,350,5500))*.7
        else: out=pan(sweep(t,230,70)*np.sin(np.pi*t/d)**2+noise(t,200,1000)*envelope(t,.06,3)*.2)
    else:
        out=pan(airy(d))*0.5
    # Brief fade at the end avoids codec clicks for discrete sound effects.
    tail=min(len(out)//3,round(SR*.035))
    if tail: out[-tail:]*=np.linspace(1,0,tail)[:,None]
    return out

def pcm(x, peak=.65):
    x=np.nan_to_num(x)
    level=float(np.max(np.abs(x))) if x.size else 0
    x=x*(peak/max(level,.0001))
    return np.int16(np.clip(x,-1,1)*32767)

def encode(path,x,fmt,peak=.65):
    x=pcm(x,peak)
    channels=x.shape[1] if x.ndim>1 else 1
    path.parent.mkdir(parents=True,exist_ok=True)
    if fmt=="wav":
        with wave.open(str(path),"wb") as w:
            w.setnchannels(channels); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x.tobytes())
    else:
        codec=["-codec:a","libvorbis","-q:a","4"] if fmt=="ogg" else ["-codec:a","libmp3lame","-b:a","112k"]
        subprocess.run(["ffmpeg","-y","-v","error","-f","s16le","-ar",str(SR),"-ac",str(channels),"-i","pipe:0",*codec,str(path)],input=x.tobytes(),check=True)

def render_voice(item):
    # Offline fallback only. Colab notebook regenerates these exact filenames with Kokoro.
    role=item["role"]; voice="slt" if role in {"Oracle","Circe","Siren"} else "rms"
    rate=15000 if role=="Narrator" else 16000
    if role=="Cyclops": rate=13000
    with tempfile.TemporaryDirectory(prefix="farshore-voice-") as tmp:
        p=Path(tmp); (p/"line.txt").write_text(item["text"],encoding="utf-8")
        audiofilter=f"asetrate={rate},aresample=24000,atempo=1.03,highpass=f=65,lowpass=f=9500,acompressor=threshold=0.14:ratio=2.5:attack=20:release=180,aecho=0.8:0.88:95|180:0.07|0.04"
        if role in {"Oracle","Siren"}: audiofilter+= ",aecho=0.8:0.85:70|140:0.10|0.05"
        output=ROOT/"audio"/"voice"/(item["id"]+".mp3")
        subprocess.run(["ffmpeg","-y","-v","error","-f","lavfi","-i",f"flite=textfile=line.txt:v={voice}","-af",audiofilter,"-codec:a","libmp3lame","-b:a","96k",str(output)],cwd=p,check=True)

if __name__=="__main__":
    for scene in PLAN["scenes"]:
        sid=scene["id"]
        for category,render,d in [("ambience",ambience,16),("music",music,24)]:
            a=render(sid,d)
            for fmt in ("ogg","mp3"): encode(ROOT/"audio"/category/(sid+"."+fmt),a,fmt,.55)
        print("scene",sid,flush=True)
    for item in PLAN["sfx"]:
        encode(ROOT/"audio"/"sfx"/(item["id"]+".wav"),effect(item["id"],item["duration"]),"wav",.66)
    for item in PLAN["voices"]: render_voice(item)
    print("Generated original synthetic audio and offline fallback narration.",flush=True)
