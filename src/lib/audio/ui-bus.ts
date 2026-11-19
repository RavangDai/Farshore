// Interface sounds from anywhere in the menus (a glass drawer opening, a
// checkpoint chosen) without each component knowing the audio engine: the
// app connects the sink once; until then requests are simply dropped.

import type { SampleName } from "./library.ts";

let sink: ((name: SampleName) => void) | null = null;

export function setUiSink(next: ((name: SampleName) => void) | null) { sink = next; }

export function uiSound(name: SampleName) { sink?.(name); }
