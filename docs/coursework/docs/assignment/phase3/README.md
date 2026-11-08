# Farshore Phase 3: usability testing and iteration

Phase 3 package for CMPS 4200. Start with [SUBMIT.md](SUBMIT.md).

| Path | What it is |
| --- | --- |
| `Farshore-Usability-Test-Script.docx` | The instructor's template, filled in: print one per participant |
| `kit/test-script.md` | The same script as text (used in the PDF), plus setup and analysis plan |
| `kit/session-logger.html` | Offline task timer and recorder. Exports P#.json and CSV |
| `kit/task-cards.html`, `kit/sus-form.html` | Printable task cards, and the SUS plus AI trust form |
| `kit/pilot-notes.md` | Automated walkthrough of the task path (not participant data) |
| `Farshore-Phase-3-Test-Data.xlsx` | Raw data workbook with formulas. Blank until the sessions |
| `editable/frames.json` | Annotation spec for the screen designs |
| `frames/*.svg` | Annotated frames for Figma (real captures plus vector notes) |
| `frames/img/*.jpg` | The same captures, for the PDF |
| `figma-import.md` | How to build and share the Figma file |
| `changes.md` | List of changes: Part A (Phase 2 to tested prototype), Part B (from testing) |
| `ai-tool-use.md`, `contribution-statement.md` | Statements (check the [confirm] lines) |
| `report.html`, `Farshore-Phase-3-Submission.pdf` | The single submission PDF and its source |

## Rebuild

From the repository root, with the game running for captures (`npm.cmd run dev`, Ollama running):

```powershell
$env:PLAYWRIGHT_CORE = "<path>/node_modules/playwright-core"
node scripts/coursework/phase3-capture.mjs <captures-dir> desktop
node scripts/coursework/phase3-capture.mjs <captures-dir> phone
node scripts/coursework/phase3-frames.mjs <captures-dir>
python scripts/coursework/phase3-images.py <captures-dir>
node scripts/coursework/phase3-report.mjs
node scripts/coursework/phase3-pdf.mjs
```

Data: `phase3-workbook.py` builds the blank workbook, `phase3-import.py` loads logger exports, and `phase3-recalc.ps1` recalculates in Excel.

## Evidence rules

No participant data, quotes or results are estimated or invented. The pilot notes come from an automated walkthrough and are labelled as such. Failure states in the screen designs were simulated for capture only, and each one is marked.
