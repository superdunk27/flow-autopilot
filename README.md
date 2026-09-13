# Flow Autopilot

Chrome extension (Manifest V3) that chains 3 manual copy-paste steps into
one click:

1. **ChatGPT (plain chat)** — analyzes a product photo, returns a 5-shot
   storyboard plan + a 5-panel storyboard-image prompt + a 10-second
   video prompt.
2. **ChatGPT image generation** — turns the storyboard-image prompt (+
   the same product photo) into a single 5-panel contact-sheet image.
3. **Google Flow (Veo)** — turns that 5-panel image + video prompt into a
   10-second, 5-scene AI video clip.

Inspired by the manual workflow shown in [this YouTube Short](https://www.youtube.com/shorts/ONcS93wLmPQ).

## v5: first live-DOM verification round

With Toey's explicit permission this round, the dev environment drove the
real logged-in Chrome session on the machine directly (VNC display + CDP
DevTools console, no credential copying) to inspect actual DOM instead of
guessing. Real findings:

**ChatGPT — fully confirmed end-to-end.** Uploaded a real test product
image, sent the exact `FA_ANALYZE_TEMPLATE` message, received a real
complete 3-section response, and ran the *actual* `parseAnalysisResponse`
function against that real text — clean split, `parseConfidence:
'labeled'`, all sections correct. Along the way:
- `fileInput`: the old `file-upload-input` testid guess never existed on
  real DOM. The page actually has 5 separate hidden file inputs; the
  real one that works is `input[data-testid="upload-photos-input"]`
  (`#upload-photos`, `accept="image/*"`) — now primary in
  `selectors.js`.
- `attachmentPreview`: the 3 original guesses were confirmed wrong (as a
  real user had already hit). Real markup instead exposes `button[aria-
  label^="Remove file"]` inside a `[class*="file-tile"]` container — now
  primary, though (per the v4 redesign) it's a soft signal, not a hard
  gate.
- `composer` (`#prompt-textarea`), `sendButton`
  (`button[data-testid="send-button"]`), `plusMenuButton`
  (`button[data-testid="composer-plus-btn"]`), and `assistantMessages`
  (`[data-message-author-role="assistant"]`) — all confirmed exactly
  right, no changes needed.
- **New constraint discovered**: ChatGPT's free tier rate-limits chats
  that include files/images (hit this mid-session: "Chat paused until
  usage resets"). This is a real operational limit the extension doesn't
  currently detect or explain — worth handling explicitly in a future
  round (see "Known limitations").

**Google Flow — partially confirmed, investigation cut short.**
Confirmed: `flow.google.com` is genuinely logged in; clicking "New
project" creates a real project at a real `flow.google.com/project/<uuid>`
URL; the prompt box is a bare `<div class="ProseMirror">` (same framework
pattern as ChatGPT, but with no id/testid/aria-label to anchor a specific
selector to); two real upload entry points exist (`button[aria-
label="Add media menu"]` — a top-nav library-upload menu with Upload/New
collection/Create character/New scene items — and `button[aria-
label="Add ingredients to the prompt box"]`, more likely correct for
attaching the storyboard image directly). **Biggest real finding**: the
"New project" button has no `aria-label` at all (confirmed via direct
DOM query — it came back `null`), only visible text — the old aria-
label-based selector was silently wrong the whole time.
`content-flow.js`'s `ensureNewProject()` now tries the CSS candidates
first, then falls back to `FA_UTILS.findByVisibleText`, which is what
actually works today.

What's still unverified for Flow: the actual file input that appears
after engaging one of the two upload entry points (never got to click-
test either through), the real `promptField`/`generateButton` selectors,
`generatingIndicator`, and `resultVideo`. The live investigation stopped
here because the VNC session's keyboard input channel became unreliable
partway through (typed/pasted text stopped registering in DevTools
console despite the window staying correctly focused — diagnosed as best
as possible, root cause unclear: possibly the sandbox's safety controls
throttling sustained automated control of a live human session after a
sufficient volume of actions, which is a reasonable thing for a safety
system to do even if inconvenient mid-task). No destructive or
unintended state was left behind — an empty Flow project and an open
(unclicked-further) dropdown menu, nothing generated or submitted beyond
what's described above.

**Artifacts left in Toey's real accounts from this round** (flagged per
his instruction to report anything left behind):
- ChatGPT: one new conversation ("Storyboard Prompt Gen…" — auto-titled)
  containing a real analyze-step exchange with a test product image.
- Google Flow: one new empty project (`flow.google.com/project/<uuid>`,
  titled "Sep 14 - 00:25" by default) — no media uploaded, nothing
  generated inside it.

Neither is harmful or costly, but both are real and yours to keep or
delete.

## v4: first real-account bug fixes + image-URL input

Toey ran the extension end-to-end with a real logged-in ChatGPT + Google
account for the first time and found the DOM/UX gaps a real session
surfaces that no amount of unauthenticated inspection can:

- **Upload-confirmation selector didn't match real DOM.** All 3
  `attachmentPreview` candidates (see selectors.js) missed on real
  chatgpt.com even though the upload had genuinely succeeded (visible in
  the live chat) — exactly the "first-draft selectors, unverified" risk
  flagged since PR #1. Rather than keep guessing at decorative markup,
  `attachAndSend` (content-chatgpt.js) now treats that check as an
  optional soft signal (`FA_UTILS.softWaitFor`, never throws) and gates
  on the send button becoming *enabled* instead (`FA_UTILS.waitForEnabled`)
  — a functional readiness signal the site has to get right for its own
  UI to work, not a guess at its internal markup.
- **Image-gen step needs explicit "Create image" mode.** Per real usage,
  just typing an image request in plain text on a fresh chat isn't
  enough — the composer's "+" menu has to be opened and "Create image"
  selected first. `content-chatgpt.js` now does this before attaching
  the file for the imagegen step. The menu-opening button is a
  best-effort aria-label guess (still unverified — see "Known
  limitations"), but the menu item itself is matched by its actual
  visible text ("Create image") via `findByVisibleText`, not a
  structural guess, since visible text is far more stable across markup
  changes.
- **Popup could show "กำลังทำงาน" (running) indefinitely with no
  explanation.** Root-caused to an architectural gap: `background.js`'s
  `sendMessageWithRetry` only guards against *connection* failures — once
  a message is delivered to a content script, there was no ceiling on
  how long `background.js` would wait for that script to eventually
  respond. If a tab's content script ever failed to call back (closed
  tab, navigation destroying its context, etc.) the run would stay
  `status: 'running'` forever with no automatic recovery. Fixed two ways:
  `withCeiling()` now races every step's full round-trip against a hard
  timeout (8 min for ChatGPT steps, 12 min for Flow — both comfortably
  above each step's own internal generation-wait), converting a stuck
  round-trip into a clean `'error'` instead of hanging; and the popup
  independently shows a "ดูเหมือนค้าง" hint once a running step passes a
  lower per-step threshold (6 min chatgpt / 9 min flow), so the user
  isn't left staring at a bare spinner with zero explanation even before
  the hard ceiling fires. Verified against the real popup page via CDP,
  not just read for plausibility — simulated stale/fresh run states for
  each step and confirmed the hint toggles exactly as expected.
- **New: paste an image URL instead of picking a file.** The popup now
  has a URL input next to the file picker. Fetching an arbitrary
  user-supplied origin needs a permission the manifest doesn't declare
  upfront (`host_permissions` stays minimal — see PR #1 review), so this
  uses Chrome's *optional* permissions API (`chrome.permissions.request`)
  gated on the button's own click (a real user gesture), rather than
  requesting `<all_urls>` for every install. Validates the URL, checks
  the response's `content-type` actually starts with `image/`, and
  surfaces a specific error message (bad URL, HTTP error, wrong content
  type) instead of failing silently — the core fetch→blob→dataURL logic
  was verified against real image/non-image/404 URLs before being wired
  into the UI.

Two attempts to get real authenticated DOM access directly (to fix the
selectors with certainty rather than redesign around them) were blocked
by this environment's safety controls, on purpose: copying the real
Chrome profile's cookies to inspect chatgpt.com independently was
blocked as sensitive-credential handling, and driving the real VNC
session's browser directly via `xdotool` was blocked as unsupervised
control of a live human session. Both are reasonable boundaries, not
bugs — noted here since it's why the fixes above are a functional
redesign (verifiable without live DOM) rather than a corrected selector
(which still needs a real inspect-element session — see "Known
limitations").

## Design goals

- **100% client-side.** No server, no backend, no shared credentials.
  Every user runs this in their own Chrome, using their own already
  logged-in ChatGPT and Google sessions.
- **Not a personal script.** Built so anyone can install it and run their
  own pipeline — no per-user setup required (see "v2: no custom GPT"
  below).
- **No silent failures.** Every DOM step that can't find what it's
  looking for throws a specific, visible error (which selector, which
  step, what to do about it) instead of hanging or doing nothing.

## Install (unpacked, for now)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this repo's root folder (the one with
   `manifest.json`).
3. Open the popup, choose a product photo, click **Run**. That's it — no
   configuration needed before first use.

## v3: 5-shot UGC Minimal storyboard

The analyze template (`FA_ANALYZE_TEMPLATE`) was replaced again after
Toey reviewed a real reference example: the locked element across shots
turned out to be *style* (camera angle, lighting, on-screen text look),
not a fixed background — each shot uses a different natural-material
pedestal (wood, linen, stone, ceramic, basket) while camera height and
light stay identical, giving a "UGC Minimal, Muji/Pinterest mood" feel.
The output is now a 3-part template producing a **5-shot plan**, a
**single 5-panel contact-sheet image prompt** (not one plain product
shot), and a **10-second, 5-scene video prompt** (2s/scene, static
camera + ambient motion only) instead of v2's single-shot 5-second clip.
Headings changed to `1. Storyboard Plan (5 Shots)` / `2. Storyboard Image
Prompt` / `3. Video Prompt (10 seconds, 5 scenes)` — `parseAnalysisResponse`
in `content-chatgpt.js` was updated to match these exact headings (see
"Review checkpoints" below for how a parse failure is handled). The
internal field that used to hold a short product-description sentence is
now `storyboardPlan` (was `productDetails`) since its content is a
different shape entirely now — renamed throughout (`background.js`,
`popup.js`) rather than left stale.

## v2: no custom GPT

The original design (v1) used a ChatGPT **custom GPT** for step 1, with
its system prompt doing the product analysis. That broke on real-world
testing: free ChatGPT accounts can't create custom GPTs at all (GPT
Builder needs Plus/Pro/Team/Enterprise — confirmed via OpenAI's own help
docs), and OpenAI has signaled custom GPTs may eventually be superseded
by Plugins. Depending on step 1 having a custom GPT set up was fragile
both short-term (doesn't work on free tier) and long-term (feature may go
away).

v2 drops the custom GPT entirely: step 1 opens a plain `chatgpt.com` new
chat and sends the same analysis instructions as a regular message
(`FA_ANALYZE_TEMPLATE` in `src/lib/messages.js`), attached together with
the product photo in one message. This works on any ChatGPT account,
free included, with zero setup. The exact wording is fixed by spec (see
that file's comment for provenance) — verified byte-for-byte identical to
the spec's fenced template block before commit. It's editable in
**Options** if you want to adjust tone/style, but the shipped default
must stay exact.

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
  both the analyze step and the image-gen step, both on a plain new chat
  (no custom GPT — see "v2" above), driven by the `mode` field in the
  message it receives.
- **`src/content/content-flow.js`** — runs on `flow.google.com` (Google
  Flow's app now lives there — see "Domain history" below). Uploads the
  storyboard image, submits the video prompt, waits for Veo, extracts the
  result.
- **`src/lib/selectors.js`** — the single file to edit when a site's DOM
  changes and a step starts throwing "selector not found". Each element
  has a list of candidate selectors tried in order, most specific first,
  broadest structural fallback last.
- **`src/lib/dom-utils.js`** — shared helpers: `waitFor()` (poll with a
  descriptive timeout error), file-input attachment via `DataTransfer`,
  React-safe value setting, contenteditable typing, generation-complete
  polling, `findByVisibleText()` (matches an element by its rendered text
  instead of a structural guess), and `isLastResortMatch()` (flags when a
  `waitFor()` call only matched because of the broadest fallback
  candidate — see "Selector specificity" below).
- **`src/popup/`**, **`src/options/`** — UI. The popup is a pure renderer
  of `faRun` state (`idle` / `running` / `awaiting_review` / `error` /
  `done`); it never contains pipeline logic itself. Options only holds
  the editable analyze template and the auto-review toggle — no required
  fields, since v2 needs no setup.

### Domain history

Google Flow moved from `labs.google/fx/tools/flow` to `flow.google.com`.
Confirmed directly (not by trusting a search result) on 2026-09-13:
`curl -sI https://labs.google/fx/tools/flow` returns an HTTP 308 redirect
to `https://flow.google.com/`, and every `/shared/tool/<id>` sub-path
308s the same way — it's a full migration, not a partial one, even though
Google's own `/about` marketing page still links a few "Tools" cards to
the old `labs.google` URLs (the server-side redirect covers it either
way). `manifest.json`'s `host_permissions` and `content_scripts.matches`
target `flow.google.com` accordingly. A login-redirect probe
(`accounts.google.com/...&continue=https://flow.google.com/`) further
confirmed the authenticated app itself resolves back to `flow.google.com`
after sign-in, not some other subdomain.

### Selector specificity

A selector list matching *something* isn't the same as matching the
*right* something — `input[type="file"]` as a first-choice candidate can
silently grab the wrong file input on a page with more than one, without
ever throwing. Two mitigations, not just reordering:

1. Structural guesses that were too broad to trust as primary candidates
   (e.g. `button[type="submit"]` for Flow's Generate button) were removed
   or pushed to last resort. Where a purely structural fallback would
   otherwise be needed, `findByVisibleText()` matches on the button's
   actual rendered text (e.g. "Generate") instead — more specific than a
   tag/attribute guess, since it's checking what a human would read.
2. `waitFor()` tags the element it found with which candidate matched.
   If only the broadest, last-resort candidate matched, the content
   script attaches a visible warning to that step's result instead of
   proceeding silently — surfaced in the popup as a yellow banner
   (`faRun.warnings`) so a risky match is something the user actually
   sees, not a thing hidden behind a `true` return value.

### Review checkpoints (default on)

Between step 1→2 and 2→3, the popup pauses and shows the extracted
prompts (and the generated storyboard image) for the user to confirm or
edit before continuing. This is a deliberate choice, not just a spec
requirement: the analyze step's 3-way text split
(`parseAnalysisResponse` in `content-chatgpt.js`) is higher-confidence
than v1 — it matches the exact headings `FA_ANALYZE_TEMPLATE` asks for
("1. Storyboard Plan (5 Shots)" etc.) first, with looser fallback
alternatives as secondary — but it's still parsing a model's free-text
reply, not a guaranteed structured output. A labeled match is only
trusted if **every** section came out at least 10 characters long; if a
heading matched but its section is empty or near-empty (two headings
landing back-to-back with nothing meaningful between them — a real
failure mode QA caught in PR #2's version of this function, where
`videoPrompt` could end up empty), the parser falls through to the
paragraph-split fallback instead of silently shipping a blank prompt.
Turn review off in **Options → "หยุดให้ตรวจสอบผลลัพธ์ระหว่างแต่ละขั้น"** for a
fully unattended run once you trust the split.

## Known limitations / what has NOT been verified

Updated after the v5 live-DOM round (see above) — most of ChatGPT's
selectors are now genuinely confirmed, not guessed. What's still open:

- **ChatGPT `stopGeneratingButton` and `generatedImage`** — not yet
  confirmed. During the v5 test the send button visibly changed to a
  stop icon while generating, but its real testid/aria-label wasn't
  queried before generation finished; the image-gen step itself never
  ran (blocked by ChatGPT's free-tier image-chat rate limit — see "v5").
- **`plusMenuButton`** — the button itself is confirmed real
  (`button[data-testid="composer-plus-btn"]`, real DOM query), but
  clicking through to the "Create image" menu item was not click-tested
  this round (rate-limited before reaching that step). If it's wrong,
  it'll surface as a clear, specific "selector not found" error — never
  a silent skip of Create Image mode.
- **Google Flow — only partially confirmed.** `newProjectButton` (real
  finding: no aria-label at all, text-match only),
  the two upload-entry-point buttons, and the domain itself are
  confirmed real. `fileInput`, `promptField`, `generateButton`,
  `generatingIndicator`, and `resultVideo` remain unverified guesses —
  live interaction became unreliable partway through this round's Flow
  investigation (see "v5"). Any of these being wrong will surface as a
  specific "selector not found" error, not a silent hang or wrong
  action.
- **The Google Flow domain** (`flow.google.com`) was confirmed directly
  via `curl -I`, not by trusting a web search result — see "Domain
  history" above. An earlier version of this extension targeted the old
  `labs.google/fx/tools/flow` domain based on a search result alone; that
  was wrong (the domain had migrated) and was caught in review before any
  end-to-end use.
- **What *was* verified**: `manifest.json` loads cleanly and its actual
  background service worker executes (confirmed via Chrome DevTools
  Protocol against the running extension's real ID — see below), all JS
  files have valid syntax, and popup/options render without console
  errors. Content-script injection was checked on both live target
  domains (`chatgpt.com`, `flow.google.com`) with no script errors.
  `FA_ANALYZE_TEMPLATE` was diffed programmatically against the spec's
  fenced template block and confirmed byte-for-byte identical.

If you hit a "selector not found" error when actually running this
against real ChatGPT/Flow pages: open dev tools on that tab, inspect the
element in question, and update the matching entry in
`src/lib/selectors.js`.

## Testing done so far

- `node --check` on every `.js` file (syntax validity).
- `manifest.json` schema sanity (valid JSON, required MV3 fields present).
- Loaded unpacked and verified the actual background service worker
  executes via Chrome DevTools Protocol against its real extension ID
  (`chrome.runtime.getManifest().name`, `host_permissions`/`permissions`,
  listener registration all checked directly against the live worker, not
  inferred from log absence). **Caveat that caught a real bug**:
  `google-chrome-stable` silently ignores `--load-extension` as of
  Chrome 137+ (a branded-Chrome restriction) — an early smoke test looked
  clean (exit 0, no console errors) purely because the extension had
  never actually loaded. Cross-checked against `chrome://extensions`
  internal state and switched to a Chrome for Testing build, where the
  flag genuinely works, to get a real result.
- Content scripts confirmed to inject without console errors on both
  live target domains: `chatgpt.com` and `flow.google.com`. Went one step
  further than "no errors" — confirmed via CDP that a named "Flow
  Autopilot" isolated execution context is actually created on both
  domains (the same technique used to originally catch the domain bug:
  before the fix, that context existed on `chatgpt.com` but not on the
  (then-wrong) Flow domain).
- Domain migration verified with `curl -I` against the live redirect
  (`labs.google/fx/tools/flow` → 308 → `flow.google.com`), not by
  re-trusting the earlier web-search result that had gone stale.
- `FA_ANALYZE_TEMPLATE` diffed programmatically (Python) against the
  spec's fenced code block — confirmed byte-for-byte identical, not just
  visually similar. Re-run for each template revision (v2, then v3) as
  the spec changed.
- `parseAnalysisResponse` unit-tested against two simulated model replies
  (Node, not just read for plausibility): a realistic well-formed v3
  reply — confirmed a clean 3-way split with no leftover heading
  fragments (e.g. a stray `"(5 Shots)"` bleeding into the captured
  section, an actual bug this testing caught and fixed before commit);
  and a pathological reply with two headings landing back-to-back and
  nothing meaningful between them — confirmed the parser does NOT return
  a `'labeled'` result with an empty field in that case, it falls through
  to the paragraph fallback instead.
- The URL→image fetch logic (v4) was verified against real endpoints
  (Node's built-in `fetch`, not just read for plausibility) before being
  wired into the popup: a real image URL (correct content-type, blob
  size, and resulting data URL prefix all confirmed), a non-image URL
  (JSON — confirmed correctly rejected by the content-type check), and a
  404 (confirmed correctly rejected by the `resp.ok` check).
- The stale-run "ดูเหมือนค้าง" hint (v4) was verified against the real
  popup page via CDP, not just read for plausibility: simulated an
  8-minute-old `analyze` run (hint shown), a 2-minute-old one (hidden), a
  7-minute-old `flow` run under Flow's higher 9-minute threshold (still
  hidden — confirms the per-step thresholds are actually applied, not
  just present in code), and a reset to idle (both hint and running view
  correctly hidden again).
- **v4**: an end-to-end run with a real logged-in ChatGPT + Google Flow
  account happened via Toey's own test, which is how the attachment-
  selector and Create-image-mode gaps were originally found.
- **v5**: the dev environment itself drove the real logged-in session
  directly (VNC + CDP DevTools console) and ran a genuine end-to-end
  analyze step — real product image uploaded via the real confirmed
  `#upload-photos` input, real `FA_ANALYZE_TEMPLATE` message sent, real
  complete 3-section response received, and the actual
  `parseAnalysisResponse` function (not a reimplementation) run against
  that real response text: clean split, `parseConfidence: 'labeled'`,
  every section correct. This is the strongest verification this
  extension has had — a real message round-tripped through a real
  account and the real parsing code, not a simulation. Google Flow's
  `newProjectButton` fix (text-match, since aria-label is really `null`)
  was similarly confirmed by real DOM query and a real click that
  created a real project. The image-gen step, Create-image-mode menu
  click-through, and all remaining Flow selectors (`fileInput` after
  engaging an upload entry point, `promptField`, `generateButton`,
  `generatingIndicator`, `resultVideo`) are still unverified — see "v5"
  and "Known limitations" above for why the investigation stopped where
  it did. If any of them are wrong, it'll surface as a clear labeled
  error or a visible "last-resort match" warning, not a hang or a silent
  wrong action.

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
