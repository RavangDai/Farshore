"""Replace the starter speech with free Kokoro neural speech in Google Colab."""
import json, subprocess, tempfile
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[1]
PLAN = json.loads((ROOT / "audio-plan.json").read_text(encoding="utf-8"))
STATUS = ROOT / "generation-status.json"
status = json.loads(STATUS.read_text(encoding="utf-8"))
pipelines = {}
for cue in PLAN["voices"]:
    lang = cue["voice"][0]
    if lang not in pipelines:
        pipelines[lang] = KPipeline(lang_code=lang)
    chunks = []
    for _, _, sound in pipelines[lang](cue["text"], voice=cue["voice"], speed=cue["speed"]):
        if hasattr(sound, "detach"):
            sound = sound.detach().cpu().numpy()
        sound = np.asarray(sound, dtype=np.float32).reshape(-1)
        if sound.size:
            chunks.extend([sound, np.zeros(2400, dtype=np.float32)])
    if not chunks:
        raise RuntimeError("No neural speech generated for " + cue["id"])
    audio = np.concatenate(chunks)
    role = cue["role"]
    filt = "highpass=f=70,lowpass=f=11000,acompressor=threshold=0.19:ratio=2.0:attack=15:release=160"
    if role in ("Oracle","Siren"):
        filt += ",aecho=0.85:0.85:75|155:0.10|0.055"
    elif role in ("Narrator","Cyclops","Circe"):
        filt += ",aecho=0.85:0.85:85|170:0.045|0.025"
    out = ROOT / "audio" / "voice" / (cue["id"] + ".mp3")
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "speech.wav"
        mp3 = Path(tmp) / "speech.mp3"
        sf.write(wav,audio,24000,subtype="PCM_16")
        subprocess.run(["ffmpeg","-y","-v","error","-i",str(wav),"-af",filt,
                        "-codec:a","libmp3lame","-b:a","128k",str(mp3)],check=True)
        # Only replace the working starter after successful encoding.
        out.write_bytes(mp3.read_bytes())
    status["voice"][cue["id"]] = "Kokoro-82M"
    STATUS.write_text(json.dumps(status,indent=2),encoding="utf-8")
    print(f"Neural voice: {cue['id']}",flush=True)
