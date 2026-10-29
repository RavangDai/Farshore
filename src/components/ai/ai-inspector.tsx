"use client";
import { useMemo } from "react";
import {
  Activity,
  Brain,
  ChevronRight,
  Crosshair,
  Eye,
  Gauge,
  History,
  Lightbulb,
  ListTree,
  Target,
  Timer,
} from "lucide-react";
import {
  STAGES,
  averageInterval,
  attackSuccessRate,
  predictionAccuracy,
  type AIDecision,
  type AIMetric,
  type AIRuntime,
  type AIStage,
  type Difficulty,
} from "../lib/ai/types";

export type InspectorMode = "immersive" | "insights" | "lab";
export const INSPECTOR_MODES: InspectorMode[] = ["immersive", "insights", "lab"];
export const MODE_LABELS: Record<InspectorMode, string> = {
  immersive: "Immersive",
  insights: "AI Insights",
  lab: "AI Lab",
};
export const MODE_BLURBS: Record<InspectorMode, string> = {
  immersive: "Gameplay only. Attack telegraphs stay visible; the inspector is hidden.",
  insights: "A compact live panel showing the opponent's current decision and why.",
  lab: "The full decision pipeline, candidate scores, timeline, and metrics.",
};
export const nextMode = (mode: InspectorMode): InspectorMode =>
  INSPECTOR_MODES[(INSPECTOR_MODES.indexOf(mode) + 1) % INSPECTOR_MODES.length];

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "EASY", normal: "MEDIUM", hard: "HARD" };

const STAGE_META: Record<AIStage, { label: string; icon: typeof Eye; blurb: string }> = {
  perceive: { label: "PERCEPTION", icon: Eye, blurb: "What the opponent can observe right now" },
  remember: { label: "MEMORY", icon: History, blurb: "What it has recorded about your play" },
  evaluate: { label: "EVALUATION", icon: ListTree, blurb: "Every action considered, with its computed score" },
  decide: { label: "DECISION", icon: Target, blurb: "The action selected, and the reason" },
  telegraph: { label: "EXECUTION", icon: Crosshair, blurb: "The committed attack and its warning window" },
  learn: { label: "RESULT", icon: Brain, blurb: "What happened, and what was updated" },
};

const timecode = (atMs: number) => {
  const total = Math.max(0, atMs);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
};

/**
 * The state the inspector reads, projected out of whichever engine is running.
 *
 * Only an `AIRuntime` is required. Encounters add their own visualisation via
 * `extra`, so the panel never has to know about lanes, tiles, or formations.
 */
export type InspectorFeed = {
  runtime: AIRuntime;
  difficulty: Difficulty;
  /** Encounter-specific metrics. Only metrics the controller truly feeds. */
  metrics: AIMetric[];
  /** Optional probability bars, e.g. per-lane forecast. */
  distribution?: { label: string; value: number; highlight?: boolean }[];
  /** Headline for the compact panel, e.g. "Left lane · 1.4s". */
  headline?: string;
  /** Simulation clock in ms, for the timeline. */
  elapsed: number;
};

function ReadingList({ readings }: { readings: { key: string; label: string; value: string; hint?: string }[] }) {
  if (readings.length === 0) return <p className="ai-empty">Nothing observed yet.</p>;
  return (
    <dl className="ai-readings">
      {readings.map(r => (
        <div key={r.key}>
          <dt>{r.label}</dt>
          <dd>
            {r.value}
            {r.hint && <em>{r.hint}</em>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CandidateTable({ decision }: { decision: AIDecision }) {
  const scores = decision.candidates.map(c => c.score);
  const max = Math.max(...scores, 1);
  const min = Math.min(...scores, 0);
  const span = Math.max(1, max - min);
  return (
    <ul className="ai-candidates">
      {decision.candidates.map(candidate => {
        const withheld = candidate.score <= -1000;
        return (
          <li key={candidate.action} className={`${candidate.chosen ? "chosen" : ""} ${withheld ? "withheld" : ""}`}>
            <span className="ai-candidate-name">{candidate.action}</span>
            <span className="ai-candidate-bar" aria-hidden="true">
              <i style={{ width: withheld ? "0%" : `${Math.max(2, ((candidate.score - min) / span) * 100)}%` }} />
            </span>
            <span className="ai-candidate-score">{withheld ? "withheld" : candidate.score.toFixed(1)}</span>
            {candidate.note && <small>{candidate.note}</small>}
          </li>
        );
      })}
    </ul>
  );
}

/** The compact overlay. Every value comes from the decision record. */
export function AIInsights({ feed, onExpand }: { feed: InspectorFeed; onExpand: () => void }) {
  const { runtime } = feed;
  const decision = runtime.decisions[runtime.decisions.length - 1];
  return (
    <aside className="ai-insights" aria-label="AI insights">
      <header>
        <span className="ai-insights-agent">
          <Brain size={14} /> {runtime.agentName.toUpperCase()} AI
        </span>
        <span className="ai-insights-difficulty">{DIFFICULTY_LABELS[feed.difficulty]}</span>
      </header>
      <dl>
        <div>
          <dt>STATE</dt>
          <dd>{runtime.state.replace(/^./, ch => ch.toUpperCase())}</dd>
        </div>
        <div>
          <dt>ALGORITHM</dt>
          <dd className="ai-algorithm">{runtime.algorithm}</dd>
        </div>
        {decision ? (
          <>
            <div>
              <dt>ACTION</dt>
              <dd>{decision.selectedAction}</dd>
            </div>
            {decision.target && (
              <div>
                <dt>TARGET</dt>
                <dd>{decision.target}</dd>
              </div>
            )}
            {decision.confidence === undefined ? (
              <div>
                <dt>CONFIDENCE</dt>
                <dd className="ai-muted">no probability model on this difficulty</dd>
              </div>
            ) : (
              <div>
                <dt>CONFIDENCE</dt>
                <dd>{Math.round(decision.confidence * 100)}%</dd>
              </div>
            )}
            {runtime.commitRemaining > 0 && (
              <div>
                <dt>ATTACK IN</dt>
                <dd className="ai-countdown">{(runtime.commitRemaining / 1000).toFixed(1)}s</dd>
              </div>
            )}
          </>
        ) : (
          <div>
            <dt>ACTION</dt>
            <dd className="ai-muted">Observing — no committed action</dd>
          </div>
        )}
      </dl>
      {decision && (
        <div className="ai-why">
          <span>
            <Lightbulb size={12} /> WHY?
          </span>
          <p>{decision.reason}</p>
        </div>
      )}
      {decision?.outcome && (
        <div className="ai-outcome" data-outcome={decision.outcome}>
          <span>RESULT</span>
          <p>{decision.outcomeNote || decision.outcome}</p>
        </div>
      )}
      <button className="ai-expand" onClick={onExpand}>
        Open AI Lab <ChevronRight size={13} />
      </button>
    </aside>
  );
}

/** The expanded presentation panel. */
export function AILab({ feed, onCollapse }: { feed: InspectorFeed; onCollapse: () => void }) {
  const { runtime } = feed;
  const decision = runtime.decisions[runtime.decisions.length - 1];
  const timeline = useMemo(() => [...runtime.events].reverse().slice(0, 16), [runtime.events]);
  const accuracy = predictionAccuracy(runtime);
  const success = attackSuccessRate(runtime);
  const interval = averageInterval(runtime);

  const coreMetrics: AIMetric[] = [
    { key: "decisions", label: "Decisions", value: String(runtime.stats.decisions) },
    {
      key: "interval",
      label: "Mean interval",
      value: interval > 0 ? `${Math.round(interval)} ms` : "—",
      detail: "between committed decision cycles",
    },
    {
      key: "accuracy",
      label: "Prediction accuracy",
      value: accuracy === null ? "not applicable" : `${Math.round(accuracy * 100)}%`,
      detail:
        accuracy === null
          ? "this policy makes no probabilistic forecast"
          : `${runtime.stats.predictionsCorrect} of ${runtime.stats.predictions} forecasts held`,
    },
    {
      key: "attacks",
      label: "Attacks landed",
      value: success === null ? "—" : `${Math.round(success * 100)}%`,
      detail: `${runtime.stats.attacksLanded} of ${runtime.stats.attacks} committed attacks`,
    },
  ];
  if (runtime.stats.nodesExplored > 0) {
    coreMetrics.push({
      key: "nodes",
      label: "Search nodes",
      value: runtime.stats.nodesExplored.toLocaleString(),
      detail: "states expanded by this controller",
    });
  }
  if (runtime.stats.coordinationEvents > 0) {
    coreMetrics.push({
      key: "coordination",
      label: "Coordination events",
      value: String(runtime.stats.coordinationEvents),
      detail: "role assignments issued across the group",
    });
  }

  return (
    <aside className="ai-lab" aria-label="AI Lab">
      <header className="ai-lab-head">
        <div>
          <span className="a-eyebrow">EXPLAINABLE OPPONENT</span>
          <h3>
            {runtime.agentName} <small>{DIFFICULTY_LABELS[feed.difficulty]}</small>
          </h3>
          <p className="ai-algorithm">{runtime.algorithm}</p>
        </div>
        <button className="ai-collapse" onClick={onCollapse} aria-label="Collapse the AI Lab panel">
          Collapse
        </button>
      </header>

      <div className="ai-pipeline">
        {STAGES.map(stage => {
          const meta = STAGE_META[stage];
          const Icon = meta.icon;
          const active =
            (stage === "telegraph" && runtime.commitRemaining > 0) ||
            (stage === "decide" && !!decision) ||
            (stage === "learn" && !!decision?.outcome) ||
            stage === "perceive" ||
            stage === "remember" ||
            (stage === "evaluate" && !!decision);
          return (
            <details key={stage} className="ai-stage" open={stage === "decide" || stage === "evaluate"} data-active={active}>
              <summary>
                <Icon size={13} />
                <strong>{meta.label}</strong>
                <em>{meta.blurb}</em>
              </summary>
              <div className="ai-stage-body">
                {stage === "perceive" && <ReadingList readings={runtime.perception} />}
                {stage === "remember" && <ReadingList readings={runtime.memory} />}
                {stage === "evaluate" &&
                  (decision ? <CandidateTable decision={decision} /> : <p className="ai-empty">No cycle has run yet.</p>)}
                {stage === "decide" &&
                  (decision ? (
                    <div className="ai-decision">
                      <strong>{decision.selectedAction}</strong>
                      {decision.target && <span className="ai-target">{decision.target}</span>}
                      <p>{decision.reason}</p>
                      <small>
                        {timecode(decision.at)} · {decision.algorithm}
                        {decision.confidence !== undefined && ` · forecast ${Math.round(decision.confidence * 100)}%`}
                      </small>
                    </div>
                  ) : (
                    <p className="ai-empty">Observing. No committed action.</p>
                  ))}
                {stage === "telegraph" &&
                  (runtime.commitRemaining > 0 && runtime.committed ? (
                    <div className="ai-telegraph">
                      <strong>{runtime.committed.selectedAction}</strong>
                      <span className="ai-countdown">{(runtime.commitRemaining / 1000).toFixed(1)}s to release</span>
                      <i aria-hidden="true">
                        <b
                          style={{
                            width: `${Math.min(100, (1 - runtime.commitRemaining / Math.max(1, runtime.committed.commitMs || 1)) * 100)}%`,
                          }}
                        />
                      </i>
                      <small>
                        The target was locked when the warning began and is never re-aimed.
                        {runtime.committed.safety &&
                          ` ${runtime.committed.safety.actionFree} lane${runtime.committed.safety.actionFree === 1 ? "" : "s"} were left open where no jump or slide is needed.`}
                      </small>
                    </div>
                  ) : (
                    <p className="ai-empty">Nothing committed right now.</p>
                  ))}
                {stage === "learn" && (
                  <div className="ai-learn">
                    {runtime.decisions.filter(d => d.outcome).length === 0 ? (
                      <p className="ai-empty">No action has resolved yet.</p>
                    ) : (
                      <ul>
                        {runtime.decisions
                          .filter(d => d.outcome)
                          .slice(-4)
                          .reverse()
                          .map(d => (
                            <li key={d.id} data-outcome={d.outcome}>
                              <span>{d.outcome}</span>
                              <p>{d.outcomeNote || d.selectedAction}</p>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {feed.distribution && feed.distribution.length > 0 && (
        <section className="ai-distribution">
          <span className="ai-section-title">
            <Gauge size={13} /> FORECAST DISTRIBUTION
          </span>
          <ul>
            {feed.distribution.map(entry => (
              <li key={entry.label} className={entry.highlight ? "highlight" : ""}>
                <span>{entry.label}</span>
                <i aria-hidden="true">
                  <b style={{ width: `${Math.round(Math.max(0, Math.min(1, entry.value)) * 100)}%` }} />
                </i>
                <strong>{Math.round(entry.value * 100)}%</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ai-metrics">
        <span className="ai-section-title">
          <Activity size={13} /> LIVE METRICS
        </span>
        <div>
          {[...coreMetrics, ...feed.metrics].map(metric => (
            <div key={metric.key} className="ai-metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.detail && <small>{metric.detail}</small>}
            </div>
          ))}
        </div>
      </section>

      <section className="ai-timeline">
        <span className="ai-section-title">
          <Timer size={13} /> DECISION TIMELINE
        </span>
        {timeline.length === 0 ? (
          <p className="ai-empty">The timeline fills as the opponent acts.</p>
        ) : (
          <ol>
            {timeline.map((event, i) => (
              <li key={`${event.at}-${i}`} data-stage={event.stage}>
                <time>{timecode(event.at)}</time>
                <span className="ai-event-stage">{event.stage}</span>
                <p>{event.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="ai-footnote">
        Every value on this panel is read from the opponent&rsquo;s own decision records. Opening or closing this panel
        does not change how the opponent plays.
      </p>
    </aside>
  );
}

export function AIInspector({
  mode,
  feed,
  onMode,
}: {
  mode: InspectorMode;
  feed: InspectorFeed | null;
  onMode: (mode: InspectorMode) => void;
}) {
  if (!feed || mode === "immersive") return null;
  if (mode === "insights") return <AIInsights feed={feed} onExpand={() => onMode("lab")} />;
  return <AILab feed={feed} onCollapse={() => onMode("insights")} />;
}

export function InspectorModeSwitch({
  mode,
  onMode,
  compact = false,
}: {
  mode: InspectorMode;
  onMode: (mode: InspectorMode) => void;
  compact?: boolean;
}) {
  return (
    <div className={`ai-mode-switch${compact ? " compact" : ""}`} role="group" aria-label="AI inspector display mode">
      {INSPECTOR_MODES.map(option => (
        <button
          key={option}
          aria-pressed={mode === option}
          title={MODE_BLURBS[option]}
          onClick={() => onMode(option)}
        >
          {MODE_LABELS[option]}
        </button>
      ))}
      {!compact && <span className="ai-mode-hint">F3 cycles</span>}
    </div>
  );
}
