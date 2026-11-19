# FARSHORE | Free cinematic audio assets

A playable starter audio library for the home menu, voyage map, and all eight Greek mythological trials, together with a free Google Colab workflow for upgrading it to neural speech and optionally AI-generated soundscapes/music.

## What is included

- 10 original procedural ambience loops (16 seconds each), OGG and MP3.
- 10 original procedural music loops (24 seconds each), OGG and MP3.
- 34 original short UI and in-game effects, WAV.
- 21 playable offline Flite voiceover/dialogue files, MP3, with subtitles.
- Original dialogue and audio-generation prompts in `audio-plan.json`.
- Browser event/scene mapping in `audio-manifest.json`.
- `colab/Farshore-Audio-Generator.ipynb` for Kokoro speech, optional Stable Audio 3 SFX and music, and ZIP export.
- `preview.html` for auditioning every asset in a browser.

The bundled speech is basic synthetic Flite, not neural or actor-quality narration. The Colab notebook replaces these files with free Kokoro neural speech. The ambience, music and SFX are original synthesized starters, not recordings or Stable Audio outputs. After model generation, `generation-status.json` truthfully records which individual assets have been upgraded.

## How to upgrade using Google Colab

1. Download and extract this ZIP.
2. Open [Google Colab](https://colab.research.google.com/) and upload `colab/Farshore-Audio-Generator.ipynb`.
3. Run the notebook, uploading the original ZIP when prompted.
4. Run the Kokoro section. No paid API or API key is required.
5. Optionally enable the Stable Audio section. Use `test` first, then `scenes` or `all`. Check free runtime availability and the model license. Accept model terms in Hugging Face if the downloads require it.
6. Run the final ZIP export cell. Give `Farshore-Colab-Audio.zip` to Claude Code.

Use the free Colab tier where available. Large model installations and GPU quotas can vary; the optional section is not executed by default. The notebook was syntax-checked but hosted model execution must be performed in your Colab runtime.

## Prompt to give Claude Code

Integrate this complete audio pack into my existing FARSHORE browser game. Preserve all existing routes, gameplay logic, AI models, saved progress, and graphics. Use the supplied real audio files, not oscillator-only placeholders, web SpeechSynthesis, or paid APIs. Copy the contents of the `audio/` folder to the project's public audio directory (for example public/audio/farshore) and adapt `audio-manifest.json` to the actual path. Prefer the Colab-upgraded package if provided; use the basic starter voiceovers only temporarily.

Implement a single audio manager using the game's existing Web Audio or Howler implementation. Support master, music, dialogue, ambience, and sound effect volumes. Unlock audio through a user gesture. Crossfade music and ambience on scene transitions; duck music and ambience while dialogue is active, then restore levels. Keep looping ambience and music separate. Avoid restarting music on every React re-render.

Trigger chapter narration once on arrival/briefing, not whenever the player opens a menu. Display optional subtitles directly from the supplied manifest. Play voice cues only when the actual game state supports their meaning. Do not fake AI activity or play the Oracle's rival-ready line when the model is offline. Rate-limit repeated cues and prioritize meaningful feedback.

Map each effect to the corresponding real gameplay event, including checkmarks, locked destinations, glass dialogs, pickup/rescue, cave pursuit, wind, potion mixing, siren notes, water hazards, raft movement, archery, win and loss. If a cue has no implementation, preserve the actual behavior; do not invent new mechanics solely to play a sound.

Preserve user volume and mute preference. Respect browser autoplay restrictions, pause/background behavior, screen reader access and subtitles. Test music transitions, rapid input, game start, trial completion, settings, replay, AI state and mobile behavior.

## Sources and regeneration

The starter sounds are synthesized from original procedural generators in `tools/generate_starter.py`; no samples of commercial music or external sound libraries were incorporated. The basic speech was produced with the installed Flite engine. Voice upgrade code uses the original Kokoro API and shipped voices, not cloned celebrity voices. Optional Stable Audio generation runs in your notebook environment and requires applicable model-license compliance.

- Kokoro source: https://github.com/hexgrad/kokoro
- Kokoro model and license: https://huggingface.co/hexgrad/Kokoro-82M
- Stable Audio 3 source: https://github.com/Stability-AI/stable-audio-3
- Stability license: https://stability.ai/license
- Howler: https://howlerjs.com/
- Optional CC0 alternatives: https://kenney.nl/assets/rpg-audio and https://freesound.org/ (verify each sound's license).
