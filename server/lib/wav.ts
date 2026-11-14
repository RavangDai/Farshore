// Tidies a synthesized line and wraps it as a WAV file for the browser.

/** Bump when prepareSpeech changes, so lines cached on disk are made again. */
export const DSP_VERSION = 2;

const SILENCE = 10 ** (-50 / 20);
/** Loudness every line is brought to, so sentences and characters sit at one level. */
const TARGET_RMS = 10 ** (-18 / 20);
const PEAK = 0.89;

/** A second-order Butterworth high-pass, in place: removes rumble the voice never needs. */
function highPass(samples: Float32Array, sampleRate: number, cutoff: number) {
  const w = (2 * Math.PI * cutoff) / sampleRate, cos = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha, b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    samples[i] = y;
  }
}

/** RMS over 20 ms windows that hold speech, ignoring the pauses between words. */
function speechRms(samples: Float32Array, sampleRate: number) {
  const size = Math.max(1, Math.round(sampleRate * 0.02)), windows: number[] = [];
  for (let at = 0; at < samples.length; at += size) {
    let sum = 0, n = 0;
    for (let i = at; i < Math.min(samples.length, at + size); i++, n++) sum += samples[i] * samples[i];
    windows.push(Math.sqrt(sum / Math.max(1, n)));
  }
  const loudest = Math.max(...windows), gate = loudest * 10 ** (-30 / 20);
  const voiced = windows.filter(v => v >= gate);
  return Math.sqrt(voiced.reduce((s, v) => s + v * v, 0) / Math.max(1, voiced.length));
}

/**
 * Trims silence at both ends (keeping a 40 ms margin), removes rumble below
 * 70 Hz, brings the speech to -18 dBFS RMS with peaks no higher than -1 dBFS,
 * and fades the ends so a line never starts or stops with a click.
 */
export function prepareSpeech(samples: Float32Array, sampleRate: number): Float32Array {
  let start = 0, end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]) < SILENCE) start++;
  if (start === samples.length) return new Float32Array(0);
  while (end > start && Math.abs(samples[end]) < SILENCE) end--;
  const margin = Math.round(sampleRate * 0.04);
  const out = samples.slice(Math.max(0, start - margin), Math.min(samples.length, end + 1 + margin));
  highPass(out, sampleRate, 70);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const rms = speechRms(out, sampleRate);
  if (peak > 0 && rms > 0) {
    const gain = Math.min(TARGET_RMS / rms, PEAK / peak);
    for (let i = 0; i < out.length; i++) out[i] *= gain;
  }
  const fadeIn = Math.min(out.length, Math.round(sampleRate * 0.008)), fadeOut = Math.min(out.length, Math.round(sampleRate * 0.01));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= i / fadeOut;
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return bytes;
}
