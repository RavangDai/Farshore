# Farshore Phase 2

October 8 update: **Trials of the Voyage** is now the default arcade game. This package remains an archival design for the original advice voyage. See [the arcade implementation and flows](../../arcade/README.md) and [the new strategy spike](../../arcade/technical-spike.md). A revised full wireframe set and presentation have not been authored.

Status, October 5: this package documents the original advice voyage. The default game has since become Circe's Broken Seal, an escape and mystery case. See the [current case record](../../MYSTERY-CASE.md). These PDFs, slides, flows, and wireframes await revision after newcomer evaluation.

A local browser game in which the player advises Odysseus in free language and tries to reach Ithaca before 240 total months.

The current game starts at 120 months and has 15 authored chapters with shorter routes. Design additions carry the label Proposed. Persona labels come from Phase 1 sketches, with no interview evidence supplied. This package records design work and a model experiment, not completed user research or peer critique.

## Submission package

- [Design packet](Farshore-Phase-2-Design-Packet.pdf): architecture, five flows, edge cases and 26 wireframes.
- [PowerPoint](Farshore-Phase-2-Presentation.pptx) and [presentation PDF](Farshore-Phase-2-Presentation.pdf): 12 slides and a 10-minute speaking plan.
- [Interactive design reference](index.html): diagrams, filterable wireframes and raw evidence links. Open locally in a browser.
- [Technical spike summary](technical-spike-summary.pdf): one-page findings.
- [Raw experiment](evidence/spike-2026-09-30.json) and [analytic review](evidence/quality-review.json).
- [Contribution statement](contribution-statement.md): review and adopt before submitting.
- [Peer critique sheet](peer-critique.md): collect actual class feedback.

## Coverage

| Rubric | Evidence |
| --- | --- |
| Architecture, 20% | Screen hierarchy, full content inventory, A1-A3 integration specs and storage/provider data flow |
| Flows, 30% | F1-F5, each labeled with Phase 1 persona sketches, including loading/recovery/user control |
| Wireframes, 30% | W01-W26 cover S01-S12 and all five states for A1-A3 |
| Spike, 10% | Six actual calls, raw outputs, min/mean/max, two actual provider failures plus client timeout and invalid input |
| Presentation, 10% | 12 slides, speaker notes and 600-second plan |

## Spike findings

Minimum 8.87 s, average 26.36 s, maximum 38.43 s. Six valid structured replies. S4/S5/S6 misidentify whether advice was followed. This small analytic review does not establish a population error rate.

## Reproduce

Rebuild the design artifacts from the recorded September 30 evidence, from the project root:

```powershell
node scripts/build-phase2.mjs
python scripts/render-phase2.py
& .\scripts\verify-phase2-powerpoint.ps1
python scripts/pack-phase2.py
```

Rebuilding does not call the model. The PowerPoint verification step requires installed Windows PowerPoint and creates the presentation PDF. PDF generation needs reportlab and Windows Arial fonts. Packaging needs pypdf. PyMuPDF supports optional visual review. Python packages for this session are under .tmp/pdf-review-tools. The PowerPoint authoring runtime is unavailable in this environment, so the builder writes native editable OOXML. The contribution and peer-critique files are created only when missing, preserving later human edits.

To run a new model experiment, use `node --experimental-strip-types scripts/phase2-spike.mjs` with the existing local model configuration. It refuses to overwrite evidence for the same date. The design builder uses the recorded September 30 evidence; a new run needs a deliberate update to the dated evidence references and analytic review. The spike does not change .env, browser saves or game code.

## Items requiring real people

- Collect class peer critique and enter exact feedback in the sheet.
- Review the contribution statement and confirm the solo arrangement with the instructor if needed.
- Replace provisional persona labels with research-backed personas if actual Phase 1 research is available.

The brief schedules the technical spike and critique in the week of September 28 and Phase 2 presentations in the week of October 5. All deliverables are due by the end of that week. No specific submission hour is supplied.
