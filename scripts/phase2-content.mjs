// Editable content source for the Phase 2 design packet and presentation.
export const meta = {
  title: 'Farshore', subtitle: 'Phase 2: Information architecture, wireframes and user flows',
  author: 'Bibek Pathak', course: 'CMPS 4200 HCI', date: 'September 30, 2026',
  scope: 'A local browser game in which the player advises Odysseus in free language and tries to reach Ithaca before 240 total months.',
  disclosure: 'The current game starts at 120 months and has 15 authored chapters with shorter routes. Design additions carry the label Proposed. Persona labels come from Phase 1 sketches, with no interview evidence supplied. This package records design work and a model experiment, not completed user research or peer critique.',
};
export const personas = [
  {id:'P1',name:'Maya, 21',background:'Phase 1 gamer sketch',goal:'Reach Ithaca quickly and understand what changes the score.',need:'Fair scoring, visible consequences and a way to challenge a contradictory interpretation.',flows:'F2, F4, F5',evidence:'Provisional persona. The fairness concern comes from the Phase 1 slide. No interview findings or additional demographics are asserted.'},
  {id:'P2',name:'Daniel, 19',background:'Phase 1 reader sketch',goal:'Experience the poem through play without a technical setup burden.',need:'A clear first turn, plain controls, story context and typing when voice fails.',flows:'F1, F3, F5',evidence:'Provisional persona. Familiarity with the poem and limited technical comfort come from the Phase 1 slide.'},
  {id:'P3',name:'Rosa, 34',background:'Phase 1 skeptical AI user sketch',goal:'Understand why Odysseus accepts or refuses advice.',need:'Visible AI mode, a short rationale, privacy information and control over questionable results.',flows:'F2, F4, F5',evidence:'Provisional persona. AI skepticism and the need for explanations come from the Phase 1 slide.'},
];
export const screens = [
  ['S01','Title','Begin/resume, new voyage, help, characters, sources and settings.','All players','No model call. Saved progress controls the resume action.'],
  ['S02','Story introduction','Six parts, next/back, skip, introduction progress.','Daniel','No model call. Replaying the introduction preserves the voyage.'],
  ['S03','Encounter','Scene, Odysseus, source notes, time, trust, counsel, current mode and result.','All players','A1 interpretation after Send counsel. A2 optional dictation. A3 optional spoken reply.'],
  ['S04','Journey report','Win/loss, time, trust, costly decisions and log access.','Maya, Rosa','No new model call. Use the saved log.'],
  ['S05','Pause overlay','Resume, map, characters, settings, title and new voyage.','All players','Keep scene position. Proposed: a pending call requires cancel or wait before leaving.'],
  ['S06','Characters overlay','Twenty figures, selectable portraits, identity and story notes.','Daniel','Authored content, no model call.'],
  ['S07','Voyage map overlay','Progress route, zoom, selected shore and source context.','Daniel, Maya','Authored geographic notes. Legendary locations are illustrative.'],
  ['S08','Captain\'s log overlay','Advice, reply, rationale, source mode, time and trust per turn.','Rosa, Maya','Stored accepted turns. Proposed practice undo lives here.'],
  ['S09','How to play overlay','Goal, counsel cycle, shortcuts, typing/voice and replay intro.','Daniel','No model call.'],
  ['S10','Story and sources overlay','Primary text, adaptation differences, downloadable source guide.','Daniel, Rosa','Opens external sources only on user action.'],
  ['S11','Settings overlay','Story/AI mode, connection check, sound, voice, reading and motion.','Rosa, Daniel','Catalog check verifies availability without generating a reply.'],
  ['S12','New voyage confirmation','Explain loss of the current save. Keep voyage or replace it.','All players','Current confirmation. Proposed practice choice is separate from restart consent.'],
];
export const integrations = [
  {id:'A1',name:'Odysseus advice interpretation',model:'Llama 3.2 3B via local Ollama',input:'Reviewed counsel, current scene and temptation, trust 0-100, safe/risky actions and source context.',output:'JSON: reply, reason, safeChoice, followed and tone. Server supplies months, trust change and authored consequence.',timing:'Use the six-call measurements in the technical spike. Allow 90 seconds on the server and 95 seconds in the browser.',privacy:'Text goes to loopback Ollama in this setup. No account or third-party text inference is needed. A cloud endpoint would send that same payload outside the device and would require a revised disclosure.',control:'Existing retry and explicit Story mode fallback. Proposed review, refine counsel and discard a questionable candidate before score changes.'},
  {id:'A2',name:'Optional speech input',model:'Browser speech service or Windows voice typing. Provider/model unspecified.',input:'Microphone audio after the player initiates dictation.',output:'Editable transcript. Only a reviewed transcript reaches A1 after Send counsel.',timing:'No microphone timing was measured. Current browser start deadline is 15 seconds, listening limit is 60 seconds and finishing limit is 3 seconds.',privacy:'Audio can reach the browser/OS speech provider. The app has no audio-upload endpoint and stores no audio files. Provider retention is outside this project\'s verified scope.',control:'Current stop/cancel, transcript review and typing alternative. Proposed explicit uncertain-transcript state.'},
  {id:'A3',name:'Optional spoken replies',model:'Browser speech synthesis, installed/browser voice. Piper is not integrated.',input:'Odysseus\' accepted text reply.',output:'Speech while the written result remains visible.',timing:'Speech start latency is unmeasured. It does not block reading or advancing the text result.',privacy:'Voice processing may depend on the selected browser/OS voice. The app does not assume every voice runs locally.',control:'Current opt-in setting and cancellation on navigation. Proposed Stop reading, replay, voice-check and playback-error message.'},
];
export const flows = [
  {id:'F1',title:'Start or resume a voyage',persona:'P2 Daniel',states:'S01, S02, S03, S09, S11, S12',status:'Current behavior with proposed practice option',steps:['Open title screen','Choose Begin or Resume','New: read/skip introduction','Read encounter and mode label','Type counsel or choose dictation','Submit a first turn'],branches:[{at:1,label:'New voyage with a save',text:'S12 warns before replacing progress. Keep voyage returns to S01.'},{at:3,label:'AI unavailable',text:'S11 explains connection status. Start in labeled Story mode or check connection again.'}],notes:['Success: the player reaches a usable encounter without technical help.','Resume preserves the saved route, time, trust and log.','If saving fails, show a persistent warning and keep the voyage usable in memory.','Proposed practice mode disables the scored challenge and permits local undo.']},
  {id:'F2',title:'Give counsel and review the AI decision',persona:'P1 Maya and P3 Rosa',states:'A1-INITIAL, A1-LOADING, A1-SUCCESS, A1-UNCERTAIN, A1-ERROR',status:'Current input/result loop. Review checkpoint and cancel are proposed.',steps:['Read scene, time, trust and AI label','Write/review 3-800 characters','Send once and show processing','Validate model structure','Review action and short rationale','Accept once and show consequence'],branches:[{at:2,label:'Cancel or request failure',text:'Restore the draft. Preserve scene, score and trust. Retry, edit or explicitly use Story mode.'},{at:4,label:'Mismatch or unclear advice',text:'A1-UNCERTAIN: hold score. Refine counsel, request a fresh interpretation or discard.'}],notes:['Current code applies a valid decision immediately. The proposed checkpoint separates candidate generation from score commitment.','LLM structure validation cannot prove meaning. User-reported mismatch and ambiguous counsel enter review without invented confidence numbers.','Regeneration uses the same scene and draft. Each discarded candidate remains unscored.','After commitment, Next shore advances. Practice undo restores the full prior route, score, trust and log.']},
  {id:'F3',title:'Dictate and correct counsel',persona:'P2 Daniel',states:'A2-INITIAL, A2-LOADING, A2-SUCCESS, A2-UNCERTAIN, A2-ERROR',status:'Current editable transcript and typing alternative. Uncertainty warning proposed.',steps:['Choose Dictate or Voice typing','Allow microphone / Windows + H','Wait for Listening','Speak, then Stop','Review and edit transcript','Send reviewed text through F2'],branches:[{at:1,label:'Permission/service failure',text:'Show a specific message. Preserve existing text. Retry dictation or Type instead.'},{at:4,label:'Missing or suspicious words',text:'Keep the draft. Highlight review instruction. Edit, re-record or type.'}],notes:['Send stays unavailable during an active dictation session.','Voice never submits counsel automatically.','Brave on Windows provides guidance rather than claiming to open the OS voice panel.','No acoustic emotion analysis. No claim that speech models match the Phase 1 five-model proposal.']},
  {id:'F4',title:'Recover from a failed or questionable result',persona:'P1 Maya and P3 Rosa',states:'A1-ERROR, A1-UNCERTAIN, S11',status:'Current error retry/fallback. Candidate review and discard are proposed.',steps:['Observe failure or flag mismatch','Explain the issue in plain language','Preserve draft and uncommitted score','Choose Edit, Retry or Story mode','Re-submit or discard candidate','Return to result review'],branches:[{at:0,label:'Poor or empty result',text:'Empty/invalid JSON is an error. A plausible but wrong or harmful reply enters review. A detected policy issue should never display a scored result.'},{at:3,label:'Rate limit or service offline',text:'Recheck connection, wait, use Story mode or leave with the draft intact. Repeated retry does not advance time.'}],notes:['A 429 response is covered by existing error mapping but was not induced against the local provider.','Malformed JSON and missing model are real provider failure tests in this spike.','A 1ms timeout records a client failure, not an invented model response.','A reported mismatch cancels a pending candidate. Undo of committed turns is available only in proposed practice mode.']},
  {id:'F5',title:'Explain a consequence and finish the voyage',persona:'P1 Maya, P2 Daniel and P3 Rosa',states:'S03, S07, S08, S10, S04',status:'Current explanations, route and report. Practice undo proposed.',steps:['Read time/trust consequence','Open Why this choice?','Compare source or inspect map','Read previous counsel in log','Continue to the next shore','Reach Ithaca or the time limit'],branches:[{at:1,label:'Explanation seems inconsistent',text:'Current: no reversal control. Proposed review before commitment prevents a disputed score, and practice log offers one-turn undo.'},{at:5,label:'Report reached',text:'Show elapsed time, final trust and costly choices. Open log, return to title or confirm a new voyage.'}],notes:['A safe route can shorten the journey at the wind bag or cattle. The map must follow the saved route.','A scored voyage retains committed choices. Practice undo restores route changes as well as numeric values.','Sources distinguish Homer\'s account from game dialogue and counterfactual outcomes.','Closing overlays returns focus to the control that opened them.']},
];
export const edges = [
  ['EC1','Service unavailable / timeout / rate limit','A1-ERROR, F4','Retain counsel and unchanged score. Recheck, retry, edit or choose Story mode explicitly. Cancel long waits.','Real E2 missing model and E3 client timeout. 429 mapping exists but is unmeasured.'],
  ['EC2','Wrong / empty / contradictory output','A1-UNCERTAIN or A1-ERROR, F2/F4','Reject empty or malformed structure. Hold a questionable candidate for review. Explain action and evidence without a percentage.','Fresh manual sample review plus the archived September 23 wind-bag contradiction.'],
  ['EC3','Invalid or unsupported player input','A1-INITIAL, F2','Inline 3-800 character instruction. Keep input editable. Do not call the model until valid.','E4 returns HTTP 400 before provider contact.'],
  ['EC4','Speech permission, silence or provider failure','A2-ERROR, F3','Name the microphone/service issue. Preserve draft. Offer retry or typing.','Current error paths and automated checks. No new microphone test.'],
  ['EC5','Biased or inappropriate generated reply','A1-UNCERTAIN, F4','Proposed flag-and-discard control. Hide a detected harmful reply behind review, keep score unchanged and offer Story mode.','A design requirement. No validated content moderation system exists.'],
  ['EC6','Save unavailable or reload during a turn','S03, F1/F2','Current warning for save failure. Proposed persist only accepted state, retain draft separately and discard late response after cancel.','Current localStorage persistence. Draft persistence and cancellation tokens are proposed.'],
];
function wf(id, screen, title, state, flow, status, regions, annotation) { return {id,screen,title,state,flow,status,regions,annotation}; }
export const wireframes = [
  wf('W01','S01','Title','Initial / saved voyage','F1','Current',[
    ['heading','FARSHORE'],['image','Title artwork placeholder'],['text','Reach Ithaca before 240 total months'],['buttons','Begin voyage / Resume voyage'],['buttons','New voyage / Characters / How to play'],['buttons','Story & sources / Settings']
  ],'Resume appears when a valid save exists. New voyage opens S12 before overwriting progress. Primary action stays easy to find.'),
  wf('W02','S02','Story introduction','Reading / skip','F1','Current',[
    ['heading','Story introduction - part 1 of 6'],['image','Scene placeholder'],['text','Short story passage and speaker'],['text','Part indicators 1 2 3 4 5 6'],['buttons','Back / Next / Skip introduction']
  ],'Keyboard next/back and skip lead to S03. Replaying the introduction preserves the voyage.'),
  wf('W03','S03','Encounter / A1','A1-INITIAL','F2','Current',[
    ['heading','Time 120/240 months   Trust 50/100'],['image','Current shore and Odysseus'],['text','Scene problem and Odysseus\' words'],['text','AI dialogue / Story mode label'],['input','Your counsel, 3-800 characters'],['buttons','Dictate / Send counsel'],['buttons','Map / Log / Characters / Help / Settings']
  ],'Empty input includes an example, character count and keyboard shortcut. Invalid input stays inline and never calls the model.'),
  wf('W04','S03','Encounter / A1','A1-LOADING','F2','Proposed improvement',[
    ['heading','Time and trust remain unchanged'],['image','Odysseus considering counsel'],['text','Thinking - elapsed time shown'],['text','Local model may take several seconds'],['input','Your draft remains visible, locked'],['buttons','Cancel and keep counsel'],['text','After 10s: offer explicit Story mode path']
  ],'Current UI has Thinking and a brief message. Proposed elapsed time and cancel address measured waits. Discard late replies by request ID.'),
  wf('W05','S03','Encounter / A1','A1-SUCCESS','F2/F5','Proposed review checkpoint',[
    ['heading','AI interpretation - review before scoring'],['text','Chosen action: Keep the wind bag sealed'],['text','Odysseus\' reply and short rationale'],['text','Preview: +2 months, +12 trust'],['buttons','Accept decision / Refine counsel'],['buttons','Report mismatch / Read source'],['text','After Accept: Next shore and saved log']
  ],'Current app commits immediately. Proposed review presents one unscored candidate. Only Accept applies score once. Sources support story context, not model certainty.'),
  wf('W06','S03','Encounter / A1','A1-UNCERTAIN','F2/F4','Proposed',[
    ['heading','Review this interpretation'],['text','Your advice or the reply may be unclear'],['text','Check chosen action against your counsel'],['input','Original counsel, editable'],['buttons','Refine and retry / Discard result'],['buttons','Use Story mode / Read source'],['text','Time and trust unchanged']
  ],'User-reported mismatch or ambiguous counsel triggers this state. No fabricated confidence percentage. No proven automatic semantic detector is claimed.'),
  wf('W07','S03','Encounter / A1','A1-ERROR','F4','Current recovery + proposed cancel',[
    ['heading','The model could not reply'],['text','Specific connection, timeout or reply issue'],['input','Original counsel retained'],['buttons','Try AI again / Edit counsel'],['buttons','Send in Story mode / Settings'],['text','No score or route change']
  ],'Distinguish transport failure from poor meaning. Story mode requires a deliberate choice and remains labeled scripted.'),
  wf('W08','S04','Journey report','Win / time limit','F5','Current',[
    ['heading','Ithaca reached / Time challenge ended'],['text','Elapsed months, final trust'],['text','Advice followed and costly choices'],['buttons','Read captain\'s log'],['buttons','Return to title / New voyage']
  ],'The report derives from accepted turns. At 240 months the time challenge ends. New voyage requires S12 confirmation.'),
  wf('W09','S05','Pause overlay','Open','F1/F5','Current',[
    ['heading','Voyage paused'],['buttons','Resume voyage'],['buttons','Voyage map / Characters'],['buttons','Settings / Return to title'],['buttons','New voyage']
  ],'Close returns focus to Pause. Proposed pending-turn rule requires explicit cancel or waiting before navigation.'),
  wf('W10','S06','Characters overlay','Selected character','F1/F5','Current',[
    ['heading','Gods, mortals and monsters'],['image','Selectable character portrait grid'],['text','Name, identity and source books'],['text','Short character notes'],['buttons','Close and return to encounter']
  ],'Character content is authored. Selection works with keyboard and touch. No model-generated biography.'),
  wf('W11','S07','Voyage map overlay','Selected shore','F5','Current',[
    ['heading','The way home'],['image','Route map and shore markers'],['buttons','Zoom in / Zoom out / Current shore'],['text','Selected shore, visit progress'],['text','Source note and illustrative location label'],['buttons','Close']
  ],'Show the actual saved branch. Mark legendary locations as illustrative. Selection is independent of game progression.'),
  wf('W12','S08','Captain\'s log overlay','Entries / empty','F5','Current + proposed practice undo',[
    ['heading','Captain\'s log'],['text','Empty: Your voyage has no decisions yet'],['text','Entry: counsel, reply and rationale'],['text','AI/scripted source, time and trust delta'],['buttons','Practice only: Undo last accepted turn'],['buttons','Close']
  ],'Current log is read-only. Proposed undo is practice-only and restores the full prior route and save, including branch changes.'),
  wf('W13','S09','How to play overlay','Open','F1','Current',[
    ['heading','How to play'],['text','You advise. Odysseus decides.'],['text','Read the scene, send counsel, learn why'],['text','Time starts at 120; finish below 240'],['buttons','Replay introduction / Story sources'],['buttons','Return to voyage']
  ],'Explain that refusal is part of the story. It should remain distinguishable from a contradictory AI interpretation.'),
  wf('W14','S10','Story and sources overlay','Open','F5','Current',[
    ['heading','The story behind Farshore'],['text','Homer\'s account and game adaptation'],['text','Primary text and book references'],['text','Map and original art notes'],['buttons','Open source / Download guide / Close']
  ],'External links open only on user action. Do not present game penalties or alternate events as Homer\'s account.'),
  wf('W15','S11','Settings overlay','Available / disconnected','F1/F4','Current',[
    ['heading','Game settings'],['text','Story mode: scripted and ready'],['text','AI dialogue: model status and recheck'],['buttons','Choose mode / Check connection again'],['text','Sound, volumes, read replies aloud'],['text','Instant dialogue and scene motion'],['text','Voice privacy and local save notice'],['buttons','Done']
  ],'Connection status checks the catalog without generating text. AI mode is disabled when unavailable. Typing and Story mode remain accessible.'),
  wf('W16','S12','New voyage confirmation','Pending confirmation','F1/F5','Current',[
    ['heading','A new voyage?'],['text','This replaces the saved voyage on this device'],['buttons','Keep my voyage / Begin a new voyage']
  ],'Name the local save consequence before the action. Cancel preserves everything. Practice mode is a separate proposed setting.'),
  wf('W17','S03','Speech input / A2','A2-INITIAL','F3','Current',[
    ['heading','Your counsel'],['input','Type here or choose Dictate'],['text','Audio may use a browser/OS speech service'],['buttons','Dictate / Voice typing guidance'],['buttons','Send reviewed counsel']
  ],'Offer typing immediately. Windows + H guidance does not claim the website can open the OS panel.'),
  wf('W18','S03','Speech input / A2','A2-LOADING','F3','Current',[
    ['heading','Starting dictation / Listening'],['text','Allow microphone, then speak'],['input','Keep existing counsel visible'],['buttons','Cancel start / Stop listening'],['text','Send unavailable until dictation ends']
  ],'Actual transcript timing is unmeasured. Use live service events and existing start/listening deadlines, with no invented percent progress.'),
  wf('W19','S03','Speech input / A2','A2-SUCCESS','F3','Current',[
    ['heading','Review your transcript'],['input','Recognized words, editable'],['text','Check names and negation before sending'],['buttons','Dictate again / Send counsel']
  ],'Speech input never triggers an automatic game turn. Edits feed the same text path as typing.'),
  wf('W20','S03','Speech input / A2','A2-UNCERTAIN','F3','Proposed',[
    ['heading','Check these words'],['input','Transcript requiring player review'],['text','A missing word can change your advice'],['buttons','Edit text / Re-record / Type instead'],['buttons','Confirm transcript and send']
  ],'Use a player correction or unsupported/unusable transcript as the signal. Browser confidence values are not established for this setup.'),
  wf('W21','S03','Speech input / A2','A2-ERROR','F3','Current',[
    ['heading','Speech could not start'],['text','Microphone / network / silence message'],['input','Existing counsel stays intact'],['buttons','Try dictation again / Type instead']
  ],'Name permission failure separately from no speech and network failure. No score change and no model call.'),
  wf('W22','S03/S11','Spoken reply / A3','A3-INITIAL','F2/F5','Current',[
    ['heading','Read replies aloud: Off'],['text','Text result stays available'],['buttons','Enable browser voice'],['text','Voice service depends on browser/OS']
  ],'Opt-in speech and text remain separate. The voice feature does not analyze the player\'s emotions.'),
  wf('W23','S03','Spoken reply / A3','A3-LOADING','F2/F5','Proposed',[
    ['heading','Preparing spoken reply'],['text','Full written reply already visible'],['buttons','Stop reading / Continue silently'],['text','Game controls stay available']
  ],'Voice loading never blocks the score result or text navigation. Cancel playback if the user advances.'),
  wf('W24','S03','Spoken reply / A3','A3-SUCCESS','F2/F5','Current + proposed replay controls',[
    ['heading','Odysseus is speaking'],['text','Written reply and rationale'],['buttons','Stop reading / Read again'],['buttons','Next shore']
  ],'Current speech plays the result. Visible stop/replay controls are proposed. Reduce background music while speech plays.'),
  wf('W25','S03/S11','Spoken reply / A3','A3-UNCERTAIN','F2/F5','Proposed',[
    ['heading','Check the selected voice'],['text','Pronunciation may differ from the text'],['text','Written reply is the game record'],['buttons','Replay / Turn voice off / Settings']
  ],'This is a voice-quality review state, not an LLM confidence score. Audio never changes the underlying decision.'),
  wf('W26','S03','Spoken reply / A3','A3-ERROR','F2/F5','Proposed',[
    ['heading','Spoken reply unavailable'],['text','Continue reading the written result'],['buttons','Retry voice / Turn voice off'],['buttons','Next shore']
  ],'Current playback errors clear the speaking flag. Proposed message provides visible recovery without regenerating the AI decision.'),
];
export const sourceList = [
  ['Assignment authority','../original/CMPS_4200_HCI_Phase_2_Project_Requirements.pdf','Pages 1-3. Architecture 20%, flows 30%, wireframes 30%, spike 10%, presentation 10%.'],
  ['Phase 1 persona source','../original/Farshore_Phase12nd.pptx','Slide 4. Maya, Daniel and Rosa are sketches. Six interviews were planned, not evidenced.'],
  ['Current UI','../../../../src/App.tsx','Screen/modal inventory, current loading, errors, input review and immediate commitment.'],
  ['Current model adapter','../../../../server/turn.ts','Actual prompt, schema, error mapping and server-controlled scoring.'],
  ['Current speech adapter','../../../../src/lib/dictation.ts','Browser/Windows paths, typed fallback and timing limits.'],
  ['Archived model evidence','../../AI-VERIFICATION.md','September 23-26 observations and a known semantic contradiction.'],
  ['Fresh model evidence','evidence/spike-2026-09-30.json','Raw provider responses, adapter results, measured timings and manual review.'],
  ['Ollama compatible API','https://docs.ollama.com/api/openai-compatibility','Official API reference, accessed September 30, 2026. Local key is ignored.'],
  ['Ollama structured outputs','https://docs.ollama.com/capabilities/structured-outputs','Official schema documentation, accessed September 30, 2026.'],
  ['Browser speech behavior','https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition','Speech service may use a remote recognition engine, accessed September 30, 2026.'],
];
