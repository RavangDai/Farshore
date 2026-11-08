# Farshore Phase 3 submission package

Prepared from the five supplied Cyclops' Cave participant records. The report, workbook and presentation use those records only. Original JSON files and notes are preserved in `Raw-data`.

## Submit these files

| File | Contents |
| --- | --- |
| Farshore-Phase-3-Submission.pdf | Design evidence, test script, method, results, findings, interface iteration, remaining work and AI disclosure |
| Farshore-Phase-3-Test-Data.xlsx | Raw responses, task measurements, recalculating summaries, SUS, trust, gameplay and original notes |
| Farshore-Phase-3-Slides.pptx | Twelve slides with presenter notes, planned for about 9 minutes 20 seconds plus a buffer |
| Team-Contribution-Statement.pdf | Contribution description with agreement and date fields for the owner to complete |
| Links.txt | Repository supplied in the earlier project materials and the outstanding Figma link |

## Results

- Five participant records; mean SUS 59.5/100; mean AI trust 3.0/5.
- Eighteen of twenty planned task outcomes are recorded. All recorded outcomes say Yes. This is not proof of independent success: P3 needed a prompt on T3.
- P1 T2/T3 outcomes and times are missing and remain blank. T3 ease is present for all five participants; T4 ease has four responses and is supplementary.
- Median task times: T1 4 seconds (n=5), T2 30 seconds (n=4), T3 21 seconds (n=4), T4 8 seconds (n=5).
- Gameplay is a separate measure: one reported win out of five, median attempt duration 40 seconds.

The report documents the unconfirmed build and session dates, P1's evolving procedure, P2's conflicting gaming-frequency fields and other measurement limits. Missing values were not replaced with invented measurements.

## Complete before submitting

1. Import the 29 original design frames in `Figma-import` into Figma (or the required design tool), enable instructor view access and put the actual view URL in `Links.txt`. The SVG files are prepared; no online design file has been published.
2. Open the repository URL and verify that the instructor can access the tested frontend, its README, meaningful commits and mock AI success, slow and error modes. The supplied current package did not include game source, so repository contents and operation were not verified here.
3. Integrate the interface changes into the actual game, check them in the browser and retest. `Cyclops-UI-Improvements.html` implements a standalone display prototype. It does not modify the game. The report labels its after image as a schematic, so replace it with genuine integrated-game evidence if the instructor requires completed fixes before presenting.
4. Review the contribution statement, enter the agreement name and date, and obtain any required agreement. It is intentionally unsigned.
5. Record the required short backup demo video. Rehearse the ten-minute talk and two-minute questions. Use the speaker notes in the slides.

These are real outstanding requirements. The package does not claim that they have already been completed.

## Supporting materials

- `Raw-data`: the five JSON files copied byte for byte, plus their SHA-256 hashes.
- `Evidence`: the two supplied game screenshots used to discuss the dense AI panel and preparation failure.
- `Figma-import`: 25 desktop and 4 phone frames from the supplied original design document, plus the clearly labeled prototype comparison.
- `Cyclops-UI-Improvements.html`: a self-contained prototype. Open it locally to inspect the five states and controls. JavaScript syntax was checked; browser interaction and actual-game integration were not verified.
- `Prototype-integration.md`: a concrete integration and verification guide.
- `Analysis-summary.json`: the calculated statistics, task-level denominators, analyst-coded issues and limitations.
- `Assignment-Requirements.pdf`: a copy of the supplied instructor brief.

Earlier simulated examples and the unrelated P04 fragment are excluded from this package. Participant records are anonymized as P1 through P5; do not add friends' real names unless the course and consent arrangements require them.
