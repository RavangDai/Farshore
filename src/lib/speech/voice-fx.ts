import { impulseResponse, type Space } from "../audio/dsp.ts";
import type { VoiceFx } from "../arcade/rivals.ts";

// Places a neural line in its character's world: a little EQ, an optional
// doubled copy (the Sirens' chorus, Scylla's second head), and a reverb send
// into the space they speak from. Settings are gentle; the voice stays natural.

const impulses = new WeakMap<BaseAudioContext, Map<Space, AudioBuffer>>();

function reverb(context: BaseAudioContext, space: Space) {
  let cache = impulses.get(context);
  if (!cache) impulses.set(context, (cache = new Map()));
  let buffer = cache.get(space);
  if (!buffer) {
    const [left, right] = impulseResponse(space, context.sampleRate, 3);
    buffer = context.createBuffer(2, left.length, context.sampleRate);
    buffer.getChannelData(0).set(left);
    buffer.getChannelData(1).set(right);
    cache.set(space, buffer);
  }
  return buffer;
}

export type Playback = { done: Promise<void>; stop(): void; setVolume(volume: number): void };

export function playWithFx(context: AudioContext, buffer: AudioBuffer, fx: VoiceFx, volume: number): Playback {
  const output = context.createGain(), limiter = context.createDynamicsCompressor();
  output.gain.value = volume;
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  output.connect(limiter);
  limiter.connect(context.destination);

  const low = context.createBiquadFilter(), high = context.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 220;
  low.gain.value = fx.low ?? 0;
  high.type = "highshelf";
  high.frequency.value = 3800;
  high.gain.value = fx.high ?? 0;
  low.connect(high);

  const dry = context.createGain(), send = context.createGain(), convolver = context.createConvolver();
  dry.gain.value = 1 - fx.wet * 0.5;
  send.gain.value = fx.wet;
  convolver.buffer = reverb(context, fx.space);
  high.connect(dry);
  dry.connect(output);
  high.connect(send);
  send.connect(convolver);
  convolver.connect(output);

  const rate = fx.pitch ?? 1, sources: AudioBufferSourceNode[] = [];
  const start = (playbackRate: number, delay: number, gain: number) => {
    const source = context.createBufferSource(), level = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    level.gain.value = gain;
    source.connect(level);
    level.connect(low);
    source.start(context.currentTime + delay);
    sources.push(source);
  };
  start(rate, 0, fx.double ? 0.8 : 1);
  if (fx.double) start(rate * fx.double.rate, fx.double.delayMs / 1000, fx.double.gain);

  let finished = false;
  const release = (tail: number) => {
    if (finished) return;
    finished = true;
    // Let the reverb ring out before the chain is taken apart.
    setTimeout(() => output.disconnect(), tail);
  };
  const done = new Promise<void>(resolve => {
    let playing = sources.length;
    for (const source of sources) source.onended = () => { if (--playing === 0) { release(convolver.buffer!.duration * 1000); resolve(); } };
  });
  return {
    done,
    stop() {
      for (const source of sources) { try { source.stop(); } catch { /* Not started yet. */ } }
      release(0);
    },
    setVolume(next: number) { output.gain.value = next; },
  };
}
