# Farshore Phase 3: what's in this folder and how to finish

Prepared Thursday, November 5, 2026. Everything that can be done without real participants is done. The brief allows only real participants: no AI-generated or simulated users, sessions or data. So the sessions are the one thing only you can do, and the results slides and report sections stay empty until then.

## The six things to submit

| # | What the brief asks for | File in `1 Submit` | Status |
| --- | --- | --- | --- |
| 1 | One PDF: screen designs, test script, test report, list of changes, AI tool use statement | `Farshore-Phase-3-Submission.pdf` | Ready except the results (section 3), the Part B changes, the two links on the cover, and your check of the AI statement |
| 2 | Figma link with view access for the instructor | `Links.txt` | **You:** step 1 (about 10 minutes) |
| 3 | Repository link, with the README and the mock AI service, and no API keys | `Links.txt` | **You:** step 2 (about 10 minutes) |
| 4 | Raw test data (task results, times, SUS answers) as a spreadsheet | `Farshore-Phase-3-Test-Data.xlsx` | Blank, with the formulas ready. Filled from your sessions |
| 5 | Presentation slides (10 minutes plus 2 of Q&A) | `Farshore-Phase-3-Slides.pptx` | 12 slides with speaker notes. Slides 10 and 11 are filled from your sessions |
| 6 | Team contribution statement | `Team-Contribution-Statement.pdf` | **You:** sign and date it |

The other folders hold what you need to finish:

- `2 For Figma`: the 29 annotated screens, for step 1.
- `3 For the test sessions`: the printable script, task cards, SUS form, session logger, and an empty `data` folder for the session files.

## Step 1. Make the Figma file (about 10 minutes)

1. Go to https://www.figma.com, sign in, and choose **New design file**. Name it `Farshore Phase 3: Screen Designs`.
2. Rename the first page `Desktop`, and add three more pages: `Phone`, `AI states` and `Before / after`.
3. From `2 For Figma/frames`:
   - Drag every `D*.svg` file onto the **Desktop** page.
   - Drag `M01.svg` to `M04.svg` onto **Phone**.
   - Copy these AI-state frames onto **AI states**: `D06`, `D25`, `D07`, `D24`, `D09`, `D10`, `D22` and `D23`.
4. On each page, select everything and press **Ctrl+Alt+T** (Tidy up). If Figma asks about a missing font, choose Arial or Georgia.
5. Click **Share** at the top right. Under General access, choose **Anyone with the link** and **can view**. Copy the link into `1 Submit/Links.txt`.

## Step 2. Push the code to GitHub (about 10 minutes)

The repository is `https://github.com/RavangDai/Farshore`. Check that this is the one you submit. Your `.env` file is ignored by git, and no keys are tracked.

1. Commit the Phase 3 work and push it. You can ask Claude: **"commit the Phase 3 work in sensible commits and push"**. The brief wants meaningful commits.
2. On GitHub, open **Settings > Collaborators** and add the instructor.
3. Paste the repository link into `1 Submit/Links.txt`.

The README already explains how to run the game, the mock AI service and the design tokens. You do not need to commit this `Phase 3 nov 05` folder: it is a copy for submitting.

## Step 3. Run 5 or 6 usability sessions (about 25 minutes each)

The brief requires 5-6 tests on the running game. Members of other teams count, and so do any in-class tests you already ran, if you recorded them with this script.

**Once, before the first session:**
- Print, from `3 For the test sessions`:
  - `Farshore-Usability-Test-Script.docx`, one per participant, for your notes.
  - `task-cards.html`, once.
  - `sus-form.html`, one per participant.
- Recruit adults who have not seen Farshore, with a mix of gaming experience.
- Read `test-script.md` once, all the way through.

**Setting up each session:**
1. Start the Ollama app. After a reboot, "Ollama is not reachable" just means it is not running yet.
2. Open a terminal in `D:\Farshore\Farshore` and run `npm.cmd run dev`. Wait until it says Ready.
3. In your normal browser, open http://localhost:3000 and open any trial briefing once. This warms the model, so the participant does not wait 40 seconds for the first strategy.
4. Open a new **InPrivate** window (Edge: Ctrl+Shift+N) at http://localhost:3000 and press F11. Each participant starts a fresh game.
5. Open `3 For the test sessions/session-logger.html` in another window, and enter the participant ID (P1, P2, ...).

**Running each session** (the script has every word to read):
1. Read the consent script aloud, and tick consent in the logger. Only record audio or video if they agree.
2. Ask the three warm-up questions.
3. Tasks 1-3: read each task aloud and hand over its card. Use the logger's timer. Record Yes, Partly, No or Gave up, and the 1-5 ease rating. Do not help, point or explain.
4. **Before Task 4:** in a second tab of the same InPrivate window, open http://localhost:3000/api/ai-mock?mode=error-once, then close that tab. Do not warn the participant. Read Task 4, and record whether they noticed the error and recovered without help.
5. Hand over the SUS form. Then ask the AI trust questions, including "how much did you trust the results, 1 to 5, and why?" Type the answers into the logger.
6. Debrief, and thank them.

**After each session:**
1. In the logger, click **Export JSON**. The file lands in Downloads as `P1.json` (or P2, P3...). Move it into `3 For the test sessions/data`.
2. Open http://localhost:3000/api/ai-mock?mode=off, then close the InPrivate window.
3. Write your top 3 observations while they are fresh. Keep the paper SUS forms.
4. Use the same script for everyone, and do not change the game between sessions.

## Step 4. Hand the data to Claude

When the sessions are done, tell Claude: **"Phase 3 sessions are done, the data is in Phase 3 nov 05/3 For the test sessions/data"**. Send the Figma and GitHub links in the same message. Claude will then:

- Fill the workbook: success rates, times, SUS, AI trust.
- Write the test report, with each issue rated by severity from 0 to 4.
- Fix the worst issues in the game (including the Lotus maze strategy bug), with before and after screens.
- Fill slides 10 and 11 and the Part B changes, put the links on the PDF cover, and refresh every file in `1 Submit`.

You check the numbers against your paper notes.

## Step 5. Check the AI tool use statement (5 minutes)

This statement is section 5 of the PDF, and two places in it are marked `[confirm]`:

- whether OpenAI Codex was used in September to October 2026;
- the "What I did myself" list.

Tell Claude what is right or wrong. It will remove the markers and rebuild the PDF.

## Step 6. Sign the contribution statement

Open `1 Submit/Team-Contribution-Statement.pdf`, then sign and date it, either by hand and scan, or in Edge with the **Draw** tool. Save it under the same name.

## Step 7. Slides and the backup demo video

1. Open `Farshore-Phase-3-Slides.pptx` in PowerPoint. Each slide has speaker notes for a 10-minute talk.
2. Rehearse with a timer. The talk gets 10 minutes, strictly timed, plus 2 minutes of questions.
3. Record a backup demo of 2-3 minutes in case the live demo fails, following the demo path on slide 12:
   1. Start a new game and open the briefing.
   2. Read the rival's strategy.
   3. Ask for another strategy, then undo it.
   4. Trigger the mock error and recover.
   5. Finish in the Cyclops' Cave with AI Insights.

   Record with **Win+Alt+R** (Xbox Game Bar) or the Snipping Tool's video mode. Keep the video on your laptop and on a USB stick.
4. If a PDF of the slides is wanted, use PowerPoint's **File > Export > Create PDF**.

## Step 8. Final check, then submit

- [ ] The PDF cover shows both links, and section 3 has the real results.
- [ ] The workbook has every participant, and the Summary sheet is filled.
- [ ] Slides 10 and 11 show the real numbers and fixes.
- [ ] The contribution statement is signed.
- [ ] Figma opens in a private window without signing in (view access).
- [ ] The instructor can see the GitHub repository.
- [ ] Nothing contains participant names, a `.env` file or API keys.

Then upload these files, and paste both links into the submission form:

- `Farshore-Phase-3-Submission.pdf`
- `Farshore-Phase-3-Test-Data.xlsx`
- `Farshore-Phase-3-Slides.pptx`
- `Team-Contribution-Statement.pdf`

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "AI rival offline" | Start Ollama, wait 15 seconds, and press Check again |
| The first strategy takes very long | Warm the model first (setup step 3) |
| Task 4 shows no error | Open the `?mode=error-once` link again in the same InPrivate window, then reopen the island |
| The error repeats after the session | Open `?mode=off` in that window |
| Port 3000 is in use | Close the old terminal that is running `npm run dev`, then start it again |
