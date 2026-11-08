# Farshore usability test script (Phase 3)

The instructor's Usability Test Script Template, filled in for Farshore (`Farshore-Usability-Test-Script.docx`). The same script is used for every participant, and Phase 5 repeats it for the before-and-after comparison.

## Session information

| Field | Fill in |
| --- | --- |
| Team / app name | Farshore (solo project, Bibek Pathak) |
| Participant ID | P1, P2, ... (per session) |
| Date and time | per session |
| Moderator / note-taker | Bibek Pathak (moderator and note-taker) |
| Build tested | Farshore 3.0.0, Nov 5 2026 build, run locally. Tasks 1-3 use Qwen3-4B-Instruct through Ollama; Task 4 uses the mock AI service |

## Setup before each session (about 3 minutes)

1. Open the Ollama app and run `npm.cmd run dev`. Open http://localhost:3000, wait for **AI rival online**, and open one trial briefing yourself so the model is warm.
2. Open a **new InPrivate (Edge) or Incognito (Chrome) window** at http://localhost:3000, so each participant starts a fresh game. Press F11.
3. Open `session-logger.html` on a second screen or device, or use a printed copy of the script. Enter the participant ID.
4. Have the four task cards and the SUS form ready.

## 1. Welcome and consent (read aloud)

"Thank you for helping us. We are students in an HCI course testing an app we built that uses AI. We are testing the app, not you. If something is confusing, that is a problem with our design, and that is exactly what we need to find.

I will ask you to do a few tasks. Please think out loud as you go: say what you are looking for, what you expect to happen, and anything that surprises you. I will not be able to help you during the tasks, because we need to see what happens without us.

This will take about 20 minutes. Your name will not appear in our report. You can stop at any time, and you can skip any task, with no explanation needed. Please do not enter any personal or sensitive information into the app.

Do you have any questions before we start?"

Record: consent given (yes/no). Sessions are not recorded unless the participant agrees.

## 2. Warm-up questions (2 minutes)

1. How often do you play video games, and what kind?
2. When you play against a computer opponent, how do you work out what it is planning?
3. Have you used AI tools (such as ChatGPT) or played games with AI-driven characters before?

## 3. Tasks

Read each task aloud and hand over the printed card. Start timing when they begin. Stop when they say they are done or give up. Record: completed (Yes / Partly / No / Gave up), time on task, errors or wrong turns, and quotes. After Tasks 1-3, ask: "How easy or difficult was that, from 1 (very difficult) to 5 (very easy)? Why?"

### Task 1, from primary flow F1 (start or resume and learn a trial)

- **Task wording:** "You've heard about a game where you travel home with Odysseus, and you've just opened it for the first time. Start a new journey and get ready for the first challenge."
- **Success criterion:** the Land of the Lotus-Eaters briefing is on screen (it shows "YOUR OBJECTIVE").

### Task 2, from primary flow F2 (prepare, review and accept a model strategy)

- **Task wording:** "Before you face your first opponent, you want to know what you're up against. Find out what your opponent plans to do in this challenge, and who or what decided that plan."
- **Success criterion:** they paraphrase the strategy in the rival panel **and** say the AI model chose it ("Strategy chosen by qwen3:4b-instruct").

### Task 3, from primary flow F3 (play against an active mythic rival)

- **Moderator setup (untimed):** Settings > Unlock all islands, close Settings, open the Voyage map. Say: "I've unlocked another island to save time."
- **Task wording:** "A friend told you the Cyclops' Cave is the toughest island, and that you can see how the Cyclops thinks. Play it, and while you play, tell me why the Cyclops made one of his moves, using what the game shows you."
- **Success criterion:** they cite a reason or action from the AI Insights (or AI Lab) panel for a specific throw.
- **Also record:** the game result, and whether they noticed the AI Insights panel without prompting.

### Task 4, the AI failure task, from primary flow F4 (recover from a failed or unsuitable AI plan)

- **Moderator setup:** in a second tab of the same browser window, open http://localhost:3000/api/ai-mock?mode=error-once, then close that tab. Do not warn the participant.
- **Task wording:** "You'd like to try a different island. Open the Island of Aeolus and get ready to play it."
- **What the AI does:** an error. The mock AI service fails the first strategy request, so the briefing shows "The rival is not ready" with "Prepare the rival again". The retry succeeds.
- **Record:** did they notice something was wrong (yes/no)? What did they do next? Did they recover without help (yes/no)? Success means they reach a ready rival (the start button reads "...counts toward your voyage") without help.
- After the session, open http://localhost:3000/api/ai-mock?mode=off.

## 4. Moderator rules

| Do | Do not |
| --- | --- |
| Stay quiet and let silence sit | Explain where to click or what a button does |
| Ask "what are you thinking?" when they go quiet | Say "it's over there" or point |
| Ask "what did you expect to happen?" | Defend the design or explain your reasoning |
| Ask "what would you do next if I weren't here?" | React with "yes!", "no" or "exactly" |
| Write down the exact words they use | Ask leading questions ("wasn't that easy?") |
| Let them struggle for at least 60 seconds | Finish their sentences or guess their intent |

If they are completely stuck and distressed, you may end the task. Record it as not completed and note where they stopped.

## 5. System Usability Scale (after all tasks)

The participant rates each statement from 1 (strongly disagree) to 5 (strongly agree). Do not explain or reword the statements. If asked, say "whatever it means to you."

1. I think that I would like to use this app frequently.
2. I found the app unnecessarily complex.
3. I thought the app was easy to use.
4. I think that I would need the support of a technical person to be able to use this app.
5. I found the various functions in this app were well integrated.
6. I thought there was too much inconsistency in this app.
7. I would imagine that most people would learn to use this app very quickly.
8. I found the app very awkward to use.
9. I felt very confident using the app.
10. I needed to learn a lot of things before I could get going with this app.

Scoring: for odd-numbered items subtract 1 from the score; for even-numbered items subtract the score from 5. Add the ten adjusted values and multiply by 2.5. The result is 0-100, and about 68 is average.

## 6. AI trust and perception questions

1. On a scale of 1 (not at all) to 5 (completely), how much did you trust the results the app gave you? Why?
2. How did you know whether a result was good or not?
3. When the app had trouble, what did you think had happened?
4. Was there anything you wanted to change about a result but could not?
5. Would you use this instead of how you do it today? Why or why not?

## 7. Debrief

"That's everything. Two last questions: what was the most frustrating moment, and what worked best? Is there anything you expected the app to do that it didn't?"

Thank them. Do not explain what they "should" have done, and do not justify the design.

## After the session

1. Within 10 minutes, write your top 3 observations while they are fresh.
2. In the logger, click **Export JSON** and save it as `phase3/data/P#.json`. This fills the results spreadsheet: completion, time on task, ease, SUS score and trust rating.
3. Do not change the script between participants. Note any change you were forced to make, and why.
4. Keep the completed script. Phase 5 reuses the same tasks and measures.

## Analysis plan

- Per task: success rate (Yes), completion including Partly, median completed time, mean errors, and mean ease (1-5).
- SUS per participant, plus mean and standard deviation, compared with the 68 average. AI trust: mean, median and share rating 4 or 5, with the reasons.
- Task 4: share who noticed the failure and share who recovered without help.
- Issues are rated 0 (not a problem) to 4 (usability catastrophe) by frequency, impact and persistence. The most severe are fixed before the midterm and shown before and after. The rest are listed for Phase 4.
