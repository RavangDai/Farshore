// Tidies a synthesized line and wraps it as a WAV file for the browser.

const SILENCE = 10 ** (-50 / 20);

/** Trims silence at both ends (keeping a 40 ms margin) and normalizes the peak to 0.89 (-1 dBFS). */
export function prepareSpeech(samples: Float32Array, sampleRate: number): Float32Array {
  let start = 0, end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]) < SILENCE) start++;
  if (start === samples.length) return new Float32Array(0);
  while (end > start && Math.abs(samples[end]) < SILENCE) end--;
  const margin = Math.round(sampleRate * 0.04);
  const out = samples.slice(Math.max(0, start - margin), Math.min(samples.length, end + 1 + margin));
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] *= 0.89 / peak;
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
