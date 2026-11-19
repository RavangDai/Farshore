"use client";
import { AnimatePresence, motion } from "motion/react";
import type { Caption } from "./use-audio-director";

/** The subtitle for a recorded line (narration, a character, the Oracle), shown while it is heard. */
export function NarrationCaption({ caption }: { caption: Caption | null }) {
  return <div className="cn-narration" aria-live="polite">
    <AnimatePresence mode="wait">
      {caption && <motion.p key={caption.id} className="cn-narration-line" data-kind={caption.kind}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <b>{caption.role}</b><span>{caption.text}</span>
      </motion.p>}
    </AnimatePresence>
  </div>;
}
