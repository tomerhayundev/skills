---
name: video-study
description: Use when someone sends a video (a YouTube link or a video file) to learn from, study, take lessons from, or fold into a skill, a project or a design, in any language, as in "learn this too <link>", "watch this and tell me what we can use" or "תלמד גם מזה".
---

# Study a video

**Read what is said AND what is shown, every part of both, before drawing one conclusion.** Frames alone invent
rules: in an earlier study they produced a rule opposite to the speaker ("keep onboarding short", when the speaker said length
was never the point), a wrong figure (3%/9% instead of 3%/30%), and hid that the speaker endorsed fake progress bars.
A transcript alone loses the before/after pairs, the annotated screens and the numbers on slides. Take both from the
start, compare them, then write.

## Steps

1. **Check it was not studied already.** Search the project's research notes for the video id and the title. A
   different length means a different video even under the same title.
2. **The full transcript.** Open the video page in a browser and run [scripts/browser-transcript.js](scripts/browser-transcript.js)
   (paste its function and call it). It opens the page's own "Show transcript" panel and returns the text with
   timestamps, the doubled copy removed; read past the first chunk with `__tx.slice(9000, 18000)` and on. The
   caption-file address comes back empty, so do not use it. What it may answer instead:
   - `{ ad: true }`: an ad is playing and the panel stays empty under it. Wait a few seconds and call again.
   - `the panel did not fill`: the panel was opened during an ad and cached "No results found". Reopening does not
     clear it; reload the page and run it again once no ad shows.
   - `no transcript button`: the page may still be drawing (slow after reloads; call again), or the video has no
     captions. Then say so and transcribe the audio with a local tool if one is available; never study a talking
     video from frames alone without telling the user.
3. **Frames every 4 seconds, as contact sheets.** Two routes, in this order:
   - **Browser (always works):** in the same page run [scripts/browser-sheets.js](scripts/browser-sheets.js). It
     steps through the whole video in the background (a browser tool call gives up after about 45 s, and a 7-minute
     video takes about 50), drops near-duplicate frames, waits out mid-roll ads, and tiles 12 frames per sheet with
     timestamps, kept in the page. Poll `__sheetsState` until `done`, then for each sheet `await __show(i)` and take
     a screenshot (`__show` waits until the sheet is painted; without that the screenshot shows the page underneath).
     `await __show(-1)` removes the overlay. Nothing is saved to disk, so no local receiver is needed (the built-in
     browser blocks a public page from posting to localhost).
   - **Files (a local video, or yt-dlp and ffmpeg installed):** take a frame at exactly 0, 4, 8… seconds, then tile:
     ```bash
     ffmpeg -i video.mp4 -vf "select='isnan(prev_selected_t)+gte(t-prev_selected_t\,4)'" -fps_mode vfr -q:v 3 frames/%05d.jpg
     python scripts/sheets.py frames sheets --step 4
     ```
     Not `-vf fps=1/4`: it takes each frame from inside its 4-second window, so every label is a second or two early.
     Never install yt-dlp or download a video without the user's yes; the browser route needs neither.
4. **Read every sheet,** first to last. Write down what is on screen that the speech does not say: slide titles,
   numbers, labels and arrows drawn on screenshots, the bad example next to the good one.
5. **Compare.** For each point, does the speech say the same as the screen? Where they differ, the speech says what
   the speaker means; the screen says what the speaker shows. Note every place a frames-only reading would have been wrong.
6. **Check the target first.** Before proposing anything, search the skill or project the lessons are for: most of
   a video usually confirms what is already there. Propose only what is new.
7. **Write the notes** (format below) next to the project's other research, then tell the user, in short, what is
   new, what is already covered, and where you would depart from the speaker. **Change nothing until the user says
   go:** the notes end with candidates, not edits.

## The notes

```
# Video study: <topic> (transcript and frames)
Source: <length> video, studied <date>. Transcript read <from> to <to>; <kept> distinct frames (<grabbed> grabbed
every 4 s) on <n> sheets, all read.

## What the speaker says, in order      one section per part, with its time range
   - *Frames:* what is on screen in that part
## Where frames and speech agree or differ
## What <target> already does
## Candidates (waiting for the owner's go)
## Where we depart from the speaker, on purpose
```

- Describe; do not reproduce. Summaries in your own words, at most a short quote where the wording is the point.
- Brands, people and sites seen in the video are described by category in anything that ships (a public skill, its
  tests, its commits), unless the project allows names.
- Say plainly when the speaker endorses something the project refuses (manipulation, fake urgency, fake progress),
  and that you are not taking it.
- Every count in the source line is real: frames grabbed, frames kept, sheets read.

## Red flags

| Thought | Reality |
| --- | --- |
| "The frames make the point clear enough" | That is how a rule opposite to the speaker got written. Get the transcript. |
| "I'll skim a few sheets" | The annotated screen that carries the lesson was on one sheet of nine. Read all. |
| "The transcript is enough, it's a talking head" | Slides, numbers and before/after pairs are only on screen. |
| "This is all new, let me add it" | Check the target first; propose only what it lacks. |
| "I'll apply the changes while I'm here" | Notes end with candidates. The owner decides. |
