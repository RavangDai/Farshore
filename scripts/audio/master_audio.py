"""Masters the FARSHORE audio asset pack into public/audio/farshore.

    python -m pip install numpy scipy soundfile   (a virtual environment is fine)
    python -I scripts/audio/master_audio.py

Reads the pack (docs/ai-eval/Farshore-Audio-Assets/audio) and the Kokoro
voice masters from scripts/audio/render-voices.mjs (.cache/audio-build/voice),
and writes OGG Vorbis plus an MP3 fallback for each sound:

- Loudness is measured as ITU-R BS.1770 integrated loudness and brought to one
  target per category, so a raft creak no longer plays 13 dB louder than an
  arrow on a target. Peaks never pass -1 dBFS.
- Ambience loops have their seam crossfaded (equal power), so they repeat
  without a click.
- Voice lines get a gentle compressor (about 2.5:1 above the speaking level)
  so quiet words survive under music; the character's EQ and reverb are added
  in the browser by the voice chain.
- Short effects get a 3 ms fade in and a 15 ms fade out, so none starts or
  ends with a click.

The original pack files are left untouched.
"""
import json, math, os, shutil, sys
import numpy as np
import soundfile as sf
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import lfilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACK = os.path.join(ROOT, "docs", "ai-eval", "Farshore-Audio-Assets")
VOICES = os.path.join(ROOT, ".cache", "audio-build", "voice")
OUT = os.path.join(ROOT, "public", "audio", "farshore")

# Integrated loudness targets (LUFS). Buses and the mixer set the balance on top.
TARGET = {"music": -20.0, "ambience": -23.0, "voice": -18.0, "ui": -22.0, "sfx": -18.0, "stinger": -17.0}
UI = {"ui-hover", "ui-select", "ui-back", "glass-open", "glass-close", "checkpoint-complete", "checkpoint-locked", "oracle-activate", "oracle-thinking"}
STINGERS = {"victory", "defeat"}
CEILING = 10 ** (-1.0 / 20)


def k_weight(x, sr):
    f0, gain, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = math.tan(math.pi * f0 / sr); vh = 10 ** (gain / 20); vb = vh ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    b = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    a = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    y = lfilter(b, a, x, axis=0)
    f0, q = 38.13547087602444, 0.5003270373238773
    k = math.tan(math.pi * f0 / sr)
    a = [1, 2 * (k * k - 1) / (1 + k / q + k * k), (1 - k / q + k * k) / (1 + k / q + k * k)]
    return lfilter([1, -2, 1], a, y, axis=0)


def loudness(x, sr):
    """BS.1770 integrated loudness with the absolute and relative gates; whole-clip for clips under 400 ms."""
    y = k_weight(x, sr)
    block = min(len(y), int(0.4 * sr)); hop = max(1, min(block, int(0.1 * sr)))
    powers = np.array([np.mean(y[s:s + block] ** 2, axis=0).sum() for s in range(0, len(y) - block + 1, hop)])
    powers = powers[powers > 10 ** ((-70 + 0.691) / 10)]
    if not len(powers):
        return -70.0
    rel = 10 * np.log10(np.mean(powers)) - 0.691 - 10
    gated = powers[powers > 10 ** ((rel + 0.691) / 10)]
    return -0.691 + 10 * np.log10(np.mean(gated if len(gated) else powers))


def limit(x, sr, window=0.004):
    """A short look-ahead peak limiter: only the transients above the ceiling are held down, not the whole sound."""
    amp = np.max(np.abs(x), axis=1)
    g = np.minimum(1.0, CEILING / (amp + 1e-12))
    size = int(window * sr) * 2 + 1
    g = uniform_filter1d(minimum_filter1d(g, size=size), size=size)
    return np.clip(x * g[:, None], -CEILING, CEILING)


def normalize(x, sr, target):
    """Brings the sound to its loudness target, with at most 4 dB of peak limiting; quieter than that keeps its peaks."""
    gain = 10 ** ((target - loudness(x, sr)) / 20)
    peak = np.max(np.abs(x)) * gain
    if peak > CEILING * 10 ** (4 / 20):
        gain *= CEILING * 10 ** (4 / 20) / peak
    return limit(x * gain, sr)


def fades(x, sr, inn=0.003, out=0.015):
    n_in, n_out = min(len(x), int(sr * inn)), min(len(x), int(sr * out))
    x = x.copy()
    x[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    x[len(x) - n_out:] *= np.linspace(1, 0, n_out)[:, None]
    return x


def seamless(x, sr, overlap=0.8):
    """Folds the loop's last `overlap` seconds into its start with an equal-power crossfade."""
    n = int(sr * overlap)
    t = np.linspace(0, math.pi / 2, n)[:, None]
    head, tail = x[:n], x[-n:]
    y = x[:-n].copy()
    y[:n] = head * np.sin(t) + tail * np.cos(t)
    return y


def compress(x, sr, threshold_db=-24.0, ratio=2.5, attack=0.006, release=0.09):
    """A gentle RMS compressor; the voice keeps its dynamics, the quiet words come up under music."""
    mono = np.mean(x ** 2, axis=1)
    level = np.zeros_like(mono)
    a_att, a_rel, env = math.exp(-1 / (attack * sr)), math.exp(-1 / (release * sr)), 0.0
    for i, v in enumerate(mono):
        coeff = a_att if v > env else a_rel
        env = coeff * env + (1 - coeff) * v
        level[i] = env
    db = 10 * np.log10(level + 1e-12)
    over = np.maximum(0, db - threshold_db)
    gain = 10 ** (-(over - over / ratio) / 20)
    return x * gain[:, None]


def write(x, sr, base):
    """OGG Vorbis (sample-accurate, so loops stay seamless) and an MP3 fallback for Safari.

    libsndfile 1.2 crashes when a long Vorbis stream is written in one call, so
    both are written in small blocks.
    """
    os.makedirs(os.path.dirname(base), exist_ok=True)
    x = np.ascontiguousarray(x, dtype=np.float32)
    for ext, kw in ((".ogg", dict(format="OGG", subtype="VORBIS", compression_level=0.45)),
                    (".mp3", dict(format="MP3", subtype="MPEG_LAYER_III", bitrate_mode="VARIABLE", compression_level=0.45))):
        with sf.SoundFile(base + ext, "w", sr, x.shape[1], **kw) as f:
            for i in range(0, len(x), 4096):
                f.write(x[i:i + 4096])


def main():
    report, status = [], json.load(open(os.path.join(PACK, "generation-status.json"), encoding="utf-8"))
    for kind in ("music", "ambience"):
        for name in sorted(os.listdir(os.path.join(PACK, "audio", kind))):
            if not name.endswith(".ogg"):
                continue
            x, sr = sf.read(os.path.join(PACK, "audio", kind, name), always_2d=True)
            if kind == "ambience":
                x = seamless(x, sr)
            y = normalize(x, sr, TARGET[kind])
            stem = name[:-4]
            write(y, sr, os.path.join(OUT, kind, stem))
            report.append((f"{kind}/{stem}", loudness(y, sr), len(y) / sr))
            status[kind][stem] += "; mastered (loudness-normalized" + (", loop seam crossfaded" if kind == "ambience" else "") + ")"
    for name in sorted(os.listdir(os.path.join(PACK, "audio", "sfx"))):
        stem = name.rsplit(".", 1)[0]
        x, sr = sf.read(os.path.join(PACK, "audio", "sfx", name), always_2d=True)
        cat = "stinger" if stem in STINGERS else "ui" if stem in UI else "sfx"
        y = normalize(fades(x, sr), sr, TARGET[cat])
        write(y, sr, os.path.join(OUT, "sfx", stem))
        report.append((f"sfx/{stem}", loudness(y, sr), len(y) / sr))
        status["sfx"][stem] += "; mastered (loudness-normalized, de-clicked)"
    if not os.path.isdir(VOICES):
        sys.exit("Render the voices first: node --experimental-strip-types scripts/audio/render-voices.mjs")
    for name in sorted(os.listdir(VOICES)):
        stem = name[:-4]
        x, sr = sf.read(os.path.join(VOICES, name), always_2d=True)
        y = normalize(fades(compress(x, sr), sr, 0.004, 0.03), sr, TARGET["voice"])
        write(y, sr, os.path.join(OUT, "voice", stem))
        report.append((f"voice/{stem}", loudness(y, sr), len(y) / sr))
        status.setdefault("voice", {})[stem] = "Kokoro-82M (the game's own engine and character voice); replaces the Flite starter"
    with open(os.path.join(OUT, "generation-status.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(status, f, indent=2, ensure_ascii=False)
        f.write("\n")
    shutil.copyfile(os.path.join(PACK, "audio-manifest.json"), os.path.join(OUT, "audio-manifest.json"))
    for path, lufs, dur in report:
        print(f"{path:32s} {lufs:6.1f} LUFS {dur:6.2f} s")


if __name__ == "__main__":
    main()
