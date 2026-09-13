# Flow Autopilot

Chrome extension (Manifest V3) that chains 3 manual copy-paste steps into
one click:

1. **ChatGPT custom GPT** — analyzes a product photo, returns product
   details + a storyboard-image prompt + a video prompt.
2. **ChatGPT image generation** — turns the storyboard prompt (+ the same
   product photo) into a storyboard image.
3. **Google Flow (Veo)** — turns the storyboard image + video prompt into
   an AI video clip.

Inspired by the manual workflow shown in [this YouTube Short](https://www.youtube.com/shorts/ONcS93wLmPQ).

## Design goals

- **100% client-side.** No server, no backend, no shared credentials.
  Every user runs this in their own Chrome, using their own already
  logged-in ChatGPT and Google sessions.
- **Not a personal script.** Built so anyone can install it, point it at
  their own custom GPT, and run their own pipeline.
- **No silent failures.** Every DOM step that can't find what it's
  looking for throws a specific, visible error (which selector, which
  step, what to do about it) instead of hanging or doing nothing.

## Install (unpacked, for now)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this repo's root folder (the one with
   `manifest.json`).
3. Open the extension's **Options** page (gear icon in the popup, or via
   `chrome://extensions`) and paste the URL of the custom GPT you want to
   use for product analysis (e.g. the "รีวิวสินค้า minimal" GPT from
   Crewbank.com referenced in the source video, or your own).
4. Open the popup, choose a product photo, click **Run**.

## Architecture

```
popup (UI)  <--chrome.storage.local (faRun)-->  background.js (orchestrator)
                                                        |  chrome.tabs.sendMessage
                                                        v
                                    content-chatgpt.js / content-flow.js
                                       (DOM automation, per open tab)
```

- **`src/background/background.js`** — the only writer of pipeline state
  (`chrome.storage.local['faRun']`). Opens each step's tab, sends it a
  "run this step" message, and reacts to the step's completion message.
  Never touches page DOM directly.
- **`src/content/content-chatgpt.js`** — runs on `chatgpt.com`. Handles
  both the analyze step (custom GPT) and the image-gen step (default
  ChatGPT), driven by the `mode` field in the message it receives.
- **`src/content/content-flow.js`** — runs on `labs.google/*` (Google
  Flow lives at `labs.google/fx/tools/flow`). Uploads the storyboard
  image, submits the video prompt, waits for Veo, extracts the result.
- **`src/lib/selectors.js`** — the single file to edit when a site's DOM
  changes and a step starts throwing "selector not found". Each element
  has a list of candidate selectors tried in order.
- **`src/lib/dom-utils.js`** — shared helpers: `waitFor()` (poll with a
  descriptive timeout error), file-input attachment via `DataTransfer`,
  React-safe value setting, contenteditable typing, generation-complete
  polling.
- **`src/popup/`**, **`src/options/`** — UI. The popup is a pure renderer
  of `faRun` state (`idle` / `running` / `awaiting_review` / `error` /
  `done`); it never contains pipeline logic itself.

### Review checkpoints (default on)

Between step 1→2 and 2→3, the popup pauses and shows the extracted
prompts (and the generated storyboard image) for the user to confirm or
edit before continuing. This is a deliberate choice, not just a spec
requirement: the analyze step's 3-way text split
(`parseAnalysisResponse` in `content-chatgpt.js`) is a best-effort
heuristic, since the custom GPT's exact output format isn't known ahead
of time. Turn it off in **Options → "หยุดให้ตรวจสอบผลลัพธ์ระหว่างแต่ละขั้น"**
for a fully unattended run once you trust the split for your GPT's output
format.

## Known limitations / what has NOT been verified

This extension was scaffolded and written without an authenticated
ChatGPT Plus + custom-GPT + Google Flow session available in the build
environment, so:

- **DOM selectors in `src/lib/selectors.js` are a first draft**, based on
  public inspection of ChatGPT/Flow markup, not exercised against a real
  logged-in session. They are very likely to need adjustment — that's
  exactly why they live in one file with multiple fallback candidates
  each, and why every failure mode surfaces a specific, actionable error
  instead of failing silently.
- **The Google Flow domain** was confirmed to be `labs.google` (path
  `/fx/tools/flow`, projects at `/fx/tools/flow/project/<id>`) via public
  web search, not by visiting it with a logged-in account.
- **What *was* verified**: `manifest.json` loads cleanly in a real Chrome
  instance via `--load-extension` with no console errors (see
  `Testing done so far` below), all JS files have valid syntax, and the
  popup/options UI render and interact correctly.

If you hit a "selector not found" error when actually running this
against real ChatGPT/Flow pages: open dev tools on that tab, inspect the
element in question, and update the matching entry in
`src/lib/selectors.js`.

## Testing done so far

- `node --check` on every `.js` file (syntax validity).
- `manifest.json` schema sanity (valid JSON, required MV3 fields present).
- Loaded unpacked in a real `google-chrome` instance via
  `--load-extension`; verified the extension installs without manifest
  errors, the service worker starts, and the popup/options pages render
  without console errors.
- **Not yet tested**: an actual end-to-end run against logged-in
  ChatGPT + Google Flow accounts (no such session was available in this
  environment). Please test with your own account per the original
  task — if a selector is wrong, it'll surface as a clear labeled error,
  not a hang.

## Risks (shown to the user in-app too)

- Automating ChatGPT/Google Flow's UI may violate each platform's Terms
  of Service. Each user runs this with their own account, so the risk is
  theirs individually — this is not "safe" in any absolute sense, and the
  extension does not claim otherwise anywhere.
- Realistic delays are inserted between actions (roughly human-paced, not
  instant) to avoid firing faster than a person plausibly would, but this
  is a mitigation, not a guarantee against detection or account action.

## Out of scope (v1)

- No backend/server.
- No payment/subscription.
- No headless or multi-account parallel runs.
- No auto-publishing the resulting video anywhere else — the pipeline
  ends once Google Flow has produced the clip.
