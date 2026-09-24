import { useEffect, useState } from "react";

type Props = {
  text: string;
  instant?: boolean;
  busy?: boolean;
  decided?: boolean;
};

/** Reserve the whole line's space so revealing words never moves the scene. */
export function SpeechBubble({ text, instant = false, busy = false, decided = false }: Props) {
  const [length, setLength] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const complete = instant || revealed || length >= text.length;

  useEffect(() => {
    if (instant || revealed) return;
    const timer = window.setInterval(() => {
      setLength((value) => Math.min(value + 2, text.length));
    }, 25);
    return () => window.clearInterval(timer);
  }, [text, instant, revealed]);

  useEffect(() => {
    if (instant || length >= text.length) setRevealed(true);
  }, [instant, length, text]);

  return (
    <div className={`speech-bubble ${busy ? "is-thinking" : ""}`} data-speaking={!complete && !busy}>
      <div className="speech-heading">
        <span className="pixel">ODYSSEUS</span>
        <span className="speech-state">{busy ? "Considering your counsel" : decided ? "His reply" : "Your captain"}</span>
      </div>
      <div className="speech-words">
        <p className="speech-spacer" aria-hidden="true">“{text}”</p>
        <p className="speech-visible" aria-hidden="true">“{complete ? text : text.slice(0, length)}{complete ? "”" : <span className="type-cursor">▌</span>}</p>
        <p className="sr-only">{text}</p>
      </div>
      <div className="speech-bottom">
        {busy ? (
          <span className="thinking-dots" role="status"><i /><i /><i /><span className="sr-only">Odysseus is considering your counsel.</span></span>
        ) : (
          <span className="speech-personality">Proud. Curious. Homesick.</span>
        )}
        {!complete && !busy && <button type="button" className="reveal-text" onClick={() => setRevealed(true)}>Show full text</button>}
      </div>
    </div>
  );
}
