import { impulseResponse, type Space, type SpaceSpec } from "../audio/dsp.ts";
import type { VoiceFx } from "../arcade/rivals.ts";

// Places a neural line in its character's world: a little EQ, an optional
// chorus (the Sirens, Scylla's second head), and a reverb send into the space
// they speak from. Every source plays at its natural rate, so the voice keeps
// its own formants and timing; giants and gods get their weight from EQ.
// Settings are gentle; intelligibility comes first.

/** Rooms for speech: shorter and drier than the sound-effect rooms, so words stay clear. */
export const VOICE_SPACES: Record<Space, SpaceSpec> = {
  hall: { seconds: 1.4, rt60: 1.1, predelay: 0.02, bright: 8000, dark: 2500, reflections: 5 },
  cave: { seconds: 1.9, rt60: 1.6, predelay: 0.03, bright: 5500, dark: 1200, reflections: 9 },
  sea: { seconds: 0.8, rt60: 0.5, predelay: 0.006, bright: 7000, dark: 2200, reflections: 2 },
  ethereal: { seconds: 2.6, rt60: 2.2, predelay: 0.04, bright: 11000, dark: 4500, reflections: 3 },
  storm: { seconds: 1.5, rt60: 1.2, predelay: 0.018, bright: 4500, dark: 1100, reflections: 4 },
};

const impulses = new WeakMap<BaseAudioContext, Map<Space, AudioBuffer>>();

function reverb(context: BaseAudioContext, space: Space) {
  let cache = impulses.get(context);
  if (!cache) impulses.set(context, (cache = new Map()));
  let buffer = cache.get(space);
  if (!buffer) {
    const [left, right] = impulseResponse(space, context.sampleRate, 3, VOICE_SPACES[space]);
    buffer = context.createBuffer(2, left.length, context.sampleRate);
    buffer.getChannelData(0).set(left);
    buffer.getChannelData(1).set(right);
    cache.set(space, buffer);
  }
  return buffer;
}

export type Playback = { done: Promise<void>; stop(): void; setVolume(volume: number): void };

/** Offsets the make-up gain the Web Audio compressor adds (about +1.7 dB at these settings). */
const MAKEUP = 0.82;

export function playWithFx(context: AudioContext, buffer: AudioBuffer, fx: VoiceFx, volume: number): Playback {
  const output = context.createGain(), trim = context.createGain(), limiter = context.createDynamicsCompressor();
  output.gain.value = volume;
  trim.gain.value = MAKEUP;
  // A real limiter: catches peaks, leaves the rest of the line alone.
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  output.connect(limiter);
  limiter.connect(trim);
  trim.connect(context.destination);

  const low = context.createBiquadFilter(), presence = context.createBiquadFilter(), high = context.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 160;
  low.gain.value = fx.low ?? 0;
  presence.type = "peaking";
  presence.frequency.value = 2500;
  presence.Q.value = 0.9;
  presence.gain.value = fx.presence ?? 0;
  high.type = "highshelf";
  high.frequency.value = 3800;
  high.gain.value = fx.high ?? 0;
  low.connect(presence);
  presence.connect(high);

  // The reverb hears only the body of the voice: no rumble, no hiss.
  const dry = context.createGain(), send = context.createGain(), sendLow = context.createBiquadFilter(), sendHigh = context.createBiquadFilter(), convolver = context.createConvolver();
  dry.gain.value = 1 - fx.wet * 0.4;
  send.gain.value = Math.min(0.3, fx.wet);
  sendLow.type = "highpass";
  sendLow.frequency.value = 350;
  sendHigh.type = "lowpass";
  sendHigh.frequency.value = 7000;
  convolver.buffer = reverb(context, fx.space);
  high.connect(dry);
  dry.connect(output);
  high.connect(send);
  send.connect(sendLow);
  sendLow.connect(sendHigh);
  sendHigh.connect(convolver);
  convolver.connect(output);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(low);
  const modulators: OscillatorNode[] = [];
  if (fx.chorus) {
    // Two copies a few milliseconds behind, each drifting slowly, one per side.
    const { delayMs, depthMs, gain } = fx.chorus;
    [-0.6, 0.6].forEach((pan, i) => {
      const delay = context.createDelay(0.1), lfo = context.createOscillator(), depth = context.createGain(), level = context.createGain(), panner = context.createStereoPanner();
      delay.delayTime.value = (delayMs + i * 4) / 1000;
      lfo.frequency.value = 0.35 + i * 0.22;
      depth.gain.value = depthMs / 1000;
      level.gain.value = gain;
      panner.pan.value = pan;
      lfo.connect(depth);
      depth.connect(delay.delayTime);
      source.connect(delay);
      delay.connect(level);
      level.connect(panner);
      panner.connect(low);
      lfo.start();
      modulators.push(lfo);
    });
  }
  source.start(context.currentTime);

  let finished = false;
  const release = (tail: number) => {
    if (finished) return;
    finished = true;
    // Let the reverb ring out before the chain is taken apart.
    setTimeout(() => {
      for (const lfo of modulators) { try { lfo.stop(); } catch { /* Already stopped. */ } }
      output.disconnect();
    }, tail);
  };
  const done = new Promise<void>(resolve => {
    source.onended = () => { release(convolver.buffer!.duration * 1000); resolve(); };
  });
  return {
    done,
    stop() {
      try { source.stop(); } catch { /* Not started yet. */ }
      release(0);
    },
    setVolume(next: number) { output.gain.value = next; },
  };
}
