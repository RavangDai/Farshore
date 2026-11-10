"use client";
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { GameState } from "../../lib/arcade/arcade-runtime";
import { debriefRequest } from "../../lib/arcade/debrief";
import { requestDebrief } from "../../lib/arcade/decisions";

/**
 * "What the rival learned": the game's own measurements of the round, the
 * choices the rival made (and who made them), and, when the model can give a
 * grounded one, the rival's account of it in its own voice.
 */
export function RivalDebrief({
  state,
  rival,
  online,
  onSpeak,
}: {
  state: GameState;
  rival: string;
  online: boolean;
  onSpeak?: (text: string) => void;
}) {
  const request = useMemo(() => debriefRequest(state), [state]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"loading" | "done" | "none">(online ? "loading" : "none");

  useEffect(() => {
    if (!request || !online) {
      setStatus("none");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    requestDebrief(request, controller.signal)
      .then(line => {
        if (controller.signal.aborted) return;
        setText(line);
        setStatus(line ? "done" : "none");
        if (line) onSpeak?.(line);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("none");
      });
    return () => controller.abort();
    // The request is derived from the finished state, which never changes once shown.
  }, [request, online]);

  if (!request) return null;
  return (
    <section className="fs-debrief" aria-label={`What ${rival} learned`}>
      <span className="a-eyebrow">
        <Sparkles size={12} aria-hidden="true" /> WHAT {rival.toUpperCase()} LEARNED
      </span>
      {status === "loading" && <p className="fs-debrief-wait" role="status">{rival} is thinking back over the encounter…</p>}
      {text && <blockquote>{text}</blockquote>}
      <div className="fs-debrief-grid">
        <dl>
          {Object.entries(request.facts).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
        {request.picks.length > 0 && (
          <ol className="fs-debrief-picks">
            {request.picks.map((pick, i) => (
              <li key={i} data-by={pick.by}>
                <b>{pick.point}</b>
                <span>{pick.label}</span>
                <small>
                  {pick.by === "model" ? "Model's pick" : "Game's pick"} · {pick.outcome}
                </small>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="a-caption">
        Every number here was measured by the game. {text ? "The words are the model's, checked against these numbers before they were shown." : "The rival's own account appears here when the model can give one that matches them."}
      </p>
    </section>
  );
}
