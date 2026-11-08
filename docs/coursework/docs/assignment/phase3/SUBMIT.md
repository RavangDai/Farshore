# Phase 3 submission checklist

The copy to submit, with step-by-step instructions, is in `../Phase 3 nov 05/` (start with its "START HERE" file). Refresh it after any rebuild here.

Checked against the full brief (`CMPS_4200_HCI_Phase_3_Project_Requirements.pdf.pdf`) and the instructor's `Usability_Test_Script_Template.docx` on 2026-11-05.

| Brief requirement | Where it is met |
| --- | --- |
| Style basics: palette (background, text, accent, error, success), 4-5 text sizes, one spacing scale | PDF 1.1, read from `src/styles/tokens.css` |
| All major screens in high fidelity | PDF 1.3-1.4, `frames/*.svg` for Figma |
| Each AI feature in five states (empty, loading, success, low confidence, error with recovery) | PDF 1.2 table, frames D06, D25, D07, D22, D09, D23 |
| User control: edit, reject, regenerate or undo | PDF 1.2: regenerate, undo, reject, cancel (edit not offered, with the reason); frames D24, D25 |
| Changes from Phase 2 | `changes.md` Part A (A1-A17) |
| 4-5 core screens, design system in code, mock AI service (success, slow, error), user control, README | The game; `tokens.css`; `server/lib/mock-ai.ts`; README sections "Mock AI service" and "Design tokens" |
| 5-6 user tests, the same script with at least 3 tasks, think-aloud, one AI error task, consent | `Farshore-Usability-Test-Script.docx` (4 tasks; Task 4 is the AI error). **Sessions still to run** |
| Success rate, time on task, SUS, AI trust 1-5 with reason | Logger and workbook (blank until the sessions) |
| Severity 0-4, fixes for the worst issues with before/after screens, remaining issues for Phase 4 | After the sessions |
| Midterm: 10 min plus 2 min Q&A, recorded demo backup | `Farshore-Phase-3-Slides.pptx` (12 slides with speaker notes; slides 10-11 filled after the sessions). Record a 2-3 minute demo video as the backup |

In-class cross-team tests count toward the 5-6 sessions.

## Links (paste here, then ask Claude to rebuild the PDF)

- Figma view link: 
- GitHub repository link: 

These also go in `links.json`.

## Before the sessions (you)

- [x] Pilot issue 2 (the Lotus strategy has no gameplay effect): tested as-is, to be fixed after the sessions.
- [ ] Read `kit/test-script.md` (20-minute, four-task version) and `kit/pilot-notes.md`.
- [ ] Recruit 5 or 6 adults who have not seen Farshore, with a mix of gaming experience. Members of other teams count.
- [ ] Print `Farshore-Usability-Test-Script.docx` (one per participant, for notes), `kit/task-cards.html` (once), and `kit/sus-form.html` (one per participant).
- [ ] Run one practice session with a friend, if possible, to rehearse the script. Do not count it.

## Each session (you)

- [ ] Ollama running, `npm.cmd run dev`, model warmed, fresh InPrivate window, sound on.
- [ ] Before Task 4, open `localhost:3000/api/ai-mock?mode=error-once` in a second tab of the same window. After the session, open `?mode=off`.
- [ ] `kit/session-logger.html` open on a second screen. Enter the participant ID.
- [ ] After the session, **Export JSON** and save it as `phase3/data/P#.json`. Keep the paper SUS form.

## After the sessions (Claude, from your data)

- [ ] Import: `python scripts/coursework/phase3-import.py docs/coursework/docs/assignment/phase3/data docs/coursework/docs/assignment/phase3/Farshore-Phase-3-Test-Data.xlsx`, then recalculate with `phase3-recalc.ps1`.
- [ ] Fill in the Issues sheet with severity ratings, and write the test report.
- [ ] Fix the top issues in the game, then run `npm.cmd test` and `npm.cmd run build` and capture the after frames.
- [ ] Fix the Lotus plan bug (pilot issue 2) and report it in Part B.
- [ ] Write list of changes Part B, then build the slides and the final PDF.

## Final package

| Deliverable | File |
| --- | --- |
| Single PDF: screen designs, test script, test report, list of changes, AI tool use statement | `Farshore-Phase-3-Submission.pdf` |
| Figma link (view access) | on the PDF cover, and above |
| Repository link with Dr. Kazim as collaborator | on the PDF cover, and above (you handle access) |
| Raw test data spreadsheet | `Farshore-Phase-3-Test-Data.xlsx` |
| Presentation slides | `Farshore-Phase-3-Slides.pptx` (rebuild: `scripts/coursework/phase3-slides.mjs`, after `phase3-slide-images.py`) |
| Team contribution statement | `contribution-statement.md` (also section 6 of the PDF). Sign and date it |

- [ ] AI tool use statement: confirm or correct every line marked [confirm].
- [ ] Contribution statement signed.
- [ ] No `.env`, keys or participant names in anything you submit.
