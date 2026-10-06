# Media: recordings, captions and voice

What the promo engine never needed and the other formats do. Mechanics link to the Remotion docs
(remotion.dev/docs) and the official skills (`npx skills add remotion-dev/skills`: remotion-markup,
remotion-captions, remotion-multimedia); the method stays this skill's. Checked against Remotion
4.0.529.

## Voice: decide what is possible before offering it

Check before writing the chooser's voice question, and offer only what works:

1. **The user's own recording** (a file they hand over). Most authentic; transcribe it for captions.
2. **An AI voice** only when a key is already in the environment (`ELEVENLABS_API_KEY`, or the
   provider the user names). Never ask for a key in chat; if the user wants one, tell them where to
   put it (their shell profile or the project's `.env`, git-ignored) and continue without it meanwhile.
3. **The machine's own speech engine** (Windows System.Speech, macOS `say`, Linux espeak or piper):
   free and offline, but it sounds robotic. Use it for the animatic and for timing drafts, label it as a
   draft voice, and ship it only if the user hears it and approves.
4. **No voice: caption-led.** The default whenever 1 and 2 are unavailable, and the recommended
   choice for anything that autoplays muted. It is a design, not a gap. The music then leads at about
   -16 LUFS, except in a tutorial or onboarding video, whose bed sits lower (about -24 to -20 LUFS)
   or is left out, so it never competes with reading the steps:
   - the script becomes on-screen text: a step title per step (statement rules) plus subtitles of the
     line being demonstrated (at most 2 lines, 32 to 42 characters a line);
   - durations come from reading time, not audio: about 0.3 s a word, at least 1.5 s per line, rounded
     up to the grid, with the action on screen while the line is readable;
   - these lines are on-screen text, part of the picture, not subtitles of speech: they are always
     burned in, and an SRT is optional (useful for search and translation);
   - music can sit higher (no voice to duck under), but it is still a bed.

Say which rung was taken in the brief and why. A voice key or a connected voice tool appears on
the chooser under its tools, off until the user turns it on; an AI voice is used only when it is on
(`choices.tools`).

## Voiceover mechanics

- Generate per scene (one file per line or chapter), so a fix re-renders one line, not the film.
- ElevenLabs: `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` with the key in the
  `xi-api-key` header, model `eleven_multilingual_v2`, write MP3s into `public/voice/`.
- Windows draft voice (no install):
  `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('public/voice/01.wav'); $s.Speak('...'); $s.Dispose()`.
- Size the composition from the audio: `calculateMetadata` reads each file's duration (mediabunny or
  `@remotion/media-utils`), sums scenes, rounds up to the grid, and pads with silence. Transitions
  overlap scenes, so subtract their overlap from the total. It must return JSON-serializable data.
- Music sits 18 to 22 dB under the voice (a `volume` callback that ducks while a line plays).

## Captions and subtitles

- Data model: `@remotion/captions` (`Caption` type, `parseSrt`, `createTikTokStyleCaptions` for
  word-by-word pages with `combineTokensWithinMilliseconds`).
- Transcribing a recording or a voiceover: `@remotion/install-whisper-cpp` (16 kHz WAV input,
  `tokenLevelTimestamps: true`; ask before downloading a model, they are large), or the OpenAI or
  ElevenLabs speech-to-text APIs server-side when their key exists.
- Caption text is whitespace-sensitive: a leading space before each word, `white-space: pre`.
- Subtitles of a voice: ship an SRT where the platform shows one (YouTube displays it in muted
  autoplay, so do not also burn subtitles into a YouTube master); burn them in for muted placements
  that take no SRT (Reels, TikTok, Shorts, feed cutdowns). Caption-led videos are different: their
  lines are on-screen text and always burned in. Keep all text inside the platform's safe zone
  (`assets/templates/safe-zones.ts`).

## Screen recordings

- `<Video>` from `@remotion/media`: `trimBefore` (frames), `durationInFrames` (counts source frames,
  so on the timeline it lasts `durationInFrames / playbackRate`), `playbackRate`, `muted`, `volume(f)`.
  `trimAfter` is deprecated. `<OffthreadVideo>` from `remotion` is the fallback, and the one that keeps
  pitch when sped up and supports transparent video.
- Record at the output size or larger, at 30 or 60 fps, with the cursor visible; hide notifications
  and personal data; trim loading flashes before editing (they read as pops).
- **Cursor zoom**: `assets/templates/cursor-zoom.ts` keyframes the camera onto the action with the
  base's quintic ease and never shows past the recording's edges. Open each step wide enough to show
  where the control lives, then zoom; keyframes at least ~0.75 s apart for a big zoom (its jerk test
  enforces it). Never put `will-change` on the zoomed element: the text goes soft.
- A recording can cut internally where the profile allows (tutorial, demo): list those cuts in
  `out/<id>.cuts.json` so `frame-pops.mjs --cuts` passes them and still fails any other pop.

## Code, charts, output formats

- Code on screen: the Code Hike template (`npx create-video@latest --code-hike`) morphs code between
  steps; typewriter and word highlights are in the official skills' text rules.
- Charts: plain SVG plus `@remotion/paths` (`evolvePath`) on the base's spring.
- Scene transitions from `@remotion/transitions` shorten the video (overlays do not); the engine's own
  floods and shared elements are preferred, and they keep durations on the grid.
- GIF: `codec: 'gif'` with `everyNthFrame`; email GIFs under 1 MB, first frame standing alone.
- Transparent video: VP9 WebM with `yuva420p` and PNG frames, or ProRes 4444.
