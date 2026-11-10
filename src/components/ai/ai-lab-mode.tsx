"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Brain, FlaskConical, GitCompare, Play, Trash2 } from "lucide-react";
import { difficultyNames, trials, type Difficulty, type TrialId } from "../../lib/arcade/arcade";
import { TrialArtwork } from "../farshore-art";
import { TrialGlyph } from "../menu/odyssey-map";
import { DIFFICULTIES, labRunFrom, type LabRun, type LabSettings } from "../../lib/ai/lab";

// LabRun, labRunFrom and LabSettings are pure data shapes and projections,
// defined in src/lib/ai/lab.ts so they can be unit-tested without a JSX-aware
// runtime. Re-exported here so existing imports of this component keep working.
export { labRunFrom, type LabRun, type LabSettings };

export function AILabMode({
  settings,
  runs,
  onSettings,
  onLaunch,
  onClearRuns,
  onBack,
  locked,
}: {
  settings: LabSettings;
  runs: LabRun[];
  onSettings: (next: LabSettings) => void;
  onLaunch: (difficulty: Difficulty) => void;
  onClearRuns: () => void;
  onBack: () => void;
  /** Why runs cannot start right now (no AI rival connected), if they cannot. */
  locked?: string;
}) {
  const [compare, setCompare] = useState(true);
  const trial = trials.find(t => t.id === settings.trial)!;
  const forThisTrial = runs.filter(r => r.trial === settings.trial);
  const byDifficulty = DIFFICULTIES.map(d => ({
    difficulty: d,
    run: [...forThisTrial].reverse().find(r => r.difficulty === d) ?? null,
  }));
  const comparable =
    settings.seeded && byDifficulty.filter(e => e.run).length > 1
      ? new Set(byDifficulty.filter(e => e.run).map(e => e.run!.seed)).size === 1
      : false;

  return (
    <section className="fs-lab">
      <header className="fs-lab-head">
        <div>
          <span className="a-eyebrow">
            <FlaskConical size={12} /> PROFESSOR MODE
          </span>
          <h1>AI Lab</h1>
          <p>
            Run any encounter at any difficulty, with the opponent&rsquo;s decision pipeline on screen. Nothing here
            touches your campaign: lab runs record no attempts, medals or unlocks.
          </p>
        </div>
        <button className="a-btn a-ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Main menu
        </button>
      </header>

      <div className="fs-lab-body">
        <div className="fs-lab-pick">
          <span className="a-eyebrow">1 · CHOOSE AN ENCOUNTER</span>
          <div className="fs-lab-grid" role="radiogroup" aria-label="Encounter">
            {trials.map((t, i) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={settings.trial === t.id}
                className={`fs-lab-card${settings.trial === t.id ? " selected" : ""}`}
                onClick={() => onSettings({ ...settings, trial: t.id })}
              >
                <TrialArtwork id={t.id} />
                <span className="fs-lab-card-shade" />
                <span className="fs-lab-card-index">{String(i + 1).padStart(2, "0")}</span>
                <strong>{t.title}</strong>
                <small>
                  <TrialGlyph id={t.id} size={12} /> {t.character}
                </small>
              </button>
            ))}
          </div>

          <span className="a-eyebrow">2 · SET UP THE DEMONSTRATION</span>
          <div className="fs-lab-controls">
            <fieldset>
              <legend>Difficulty</legend>
              <div className="fs-lab-segment">
                {DIFFICULTIES.map(d => (
                  <button
                    key={d}
                    aria-pressed={settings.difficulty === d}
                    onClick={() => onSettings({ ...settings, difficulty: d })}
                  >
                    {difficultyNames[d]}
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              className="a-setting-toggle"
              aria-pressed={settings.seeded}
              onClick={() => onSettings({ ...settings, seeded: !settings.seeded })}
            >
              <span>
                Seeded comparison
                <small>
                  Hold one layout across all three difficulties, so only the opponent&rsquo;s behaviour differs.
                </small>
              </span>
              <strong>{settings.seeded ? "On" : "Off"}</strong>
            </button>

            <button
              className="a-setting-toggle"
              aria-pressed={settings.showPrediction}
              onClick={() => onSettings({ ...settings, showPrediction: !settings.showPrediction })}
            >
              <span>
                Reveal predictions in the world
                <small>Draws the opponent&rsquo;s forecast on the playfield. Does not change its behaviour.</small>
              </span>
              <strong>{settings.showPrediction ? "On" : "Off"}</strong>
            </button>

            <button
              className="a-setting-toggle"
              aria-pressed={settings.showHistory}
              onClick={() => onSettings({ ...settings, showHistory: !settings.showHistory })}
            >
              <span>
                Reveal observed player history
                <small>Shows the trail the opponent has been recording about you.</small>
              </span>
              <strong>{settings.showHistory ? "On" : "Off"}</strong>
            </button>
          </div>

          <div className="fs-lab-launch">
            {locked && <p className="fs-rival-locked" role="status">{locked}</p>}
            <button className="a-btn a-primary" disabled={!!locked} onClick={() => onLaunch(settings.difficulty)}>
              <Play size={16} /> Run {trial.title} on {difficultyNames[settings.difficulty]}
              <ArrowRight size={16} />
            </button>
            <p className="a-caption">
              The encounter opens full screen with the AI Lab panel docked beside it. F3 cycles the inspector; Escape
              pauses without losing the record.
            </p>
          </div>
        </div>

        <aside className="fs-lab-compare">
          <div className="fs-lab-compare-head">
            <span className="a-eyebrow">
              <GitCompare size={12} /> 3 · COMPARE THE DIFFICULTIES
            </span>
            <button className="fs-lab-switch" aria-pressed={compare} onClick={() => setCompare(v => !v)}>
              {compare ? "By difficulty" : "All runs"}
            </button>
          </div>

          {forThisTrial.length === 0 ? (
            <p className="ai-empty">
              Run {trial.title} on each difficulty to fill this table. With seeded comparison on, all three meet the
              same layout, so any difference you see comes from the opponent.
            </p>
          ) : compare ? (
            <>
              <table className="fs-lab-table">
                <thead>
                  <tr>
                    <th scope="col">Difficulty</th>
                    <th scope="col">Algorithm</th>
                    <th scope="col">Decisions</th>
                    <th scope="col">Forecast accuracy</th>
                    <th scope="col">Attacks landed</th>
                    <th scope="col">Model picks</th>
                  </tr>
                </thead>
                <tbody>
                  {byDifficulty.map(({ difficulty, run }) => (
                    <tr key={difficulty} className={run ? "" : "pending"}>
                      <th scope="row">{difficultyNames[difficulty]}</th>
                      <td className="ai-algorithm">{run?.algorithm ?? "—"}</td>
                      <td>{run ? `${run.decisions} · ${run.intervalMs} ms apart` : "not yet run"}</td>
                      <td>
                        {!run ? (
                          "—"
                        ) : run.accuracy === null ? (
                          <em className="ai-muted">no probability model</em>
                        ) : (
                          `${Math.round(run.accuracy * 100)}%`
                        )}
                      </td>
                      <td>
                        {!run
                          ? "—"
                          : run.attackRate === null
                            ? "—"
                            : `${Math.round(run.attackRate * 100)}% of ${run.attacks}`}
                      </td>
                      <td>
                        {!run ? (
                          "—"
                        ) : run.modelPicks + run.gamePicks === 0 ? (
                          <em className="ai-muted">plan chosen before the round</em>
                        ) : (
                          `${run.modelPicks} by the model${run.agreement === null ? "" : `, ${Math.round(run.agreement * 100)}% agreeing with the game`}${run.gamePicks ? `; ${run.gamePicks} by the game` : ""}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {byDifficulty.some(e => e.run?.nodesExplored) && (
                <p className="fs-lab-footnote">
                  Search effort:{" "}
                  {byDifficulty
                    .filter(e => e.run)
                    .map(e => `${difficultyNames[e.difficulty]} ${e.run!.nodesExplored.toLocaleString()} nodes`)
                    .join(" · ")}
                </p>
              )}
              {byDifficulty.some(e => e.run?.coordinationEvents) && (
                <p className="fs-lab-footnote">
                  Coordination events:{" "}
                  {byDifficulty
                    .filter(e => e.run)
                    .map(e => `${difficultyNames[e.difficulty]} ${e.run!.coordinationEvents}`)
                    .join(" · ")}
                </p>
              )}
              <p className="fs-lab-footnote">
                {comparable
                  ? "All three runs used the same seeded layout, so the differences above are the opponent's, not the level's."
                  : settings.seeded
                    ? "Run the remaining difficulties to complete the like-for-like comparison."
                    : "Seeded comparison is off, so these runs met different layouts. Turn it on for a like-for-like reading."}
              </p>
            </>
          ) : (
            <ol className="fs-lab-runs">
              {[...forThisTrial].reverse().map(run => (
                <li key={run.id}>
                  <span className="fs-lab-run-tag">{difficultyNames[run.difficulty]}</span>
                  <div>
                    <strong>
                      {run.agent} · {run.won ? "cleared" : "stopped the player"}
                    </strong>
                    <small className="ai-algorithm">{run.algorithm}</small>
                    <small>
                      {run.decisions} decisions · {run.intervalMs} ms apart · score {run.score.toLocaleString()} ·{" "}
                      {Math.round(run.elapsedMs / 1000)}s · seed {run.seed}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {forThisTrial.length > 0 && (
            <button className="a-text-btn" onClick={onClearRuns}>
              <Trash2 size={13} /> Clear recorded runs
            </button>
          )}

          <div className="fs-lab-explainer">
            <span className="a-eyebrow">
              <Brain size={12} /> WHAT THE PANEL SHOWS
            </span>
            <p>
              Every figure in the inspector is read from the opponent&rsquo;s own decision records: the actions it
              considered and the score it gave each, the one it chose, the reason, and what happened. Where a policy
              makes no probabilistic forecast the panel says so instead of printing a number.
            </p>
            <p>
              Opening or closing the inspector never changes how an opponent plays. The reveal toggles above only draw
              what the opponent had already decided.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
