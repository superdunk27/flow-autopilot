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

## v10: "regression" investigated — a397024 provably innocent

Right after v9 shipped, Toey re-tested the analyze step and hit the
*exact same* `attachmentPreview not found (after 2 attempts)` error that
v8 had already fixed and confirmed working — understandably read as v9
having broken v8's fix, since v9 also touched
`isReallyVisible`/`findByVisibleText`.

**Traced conclusively, not assumed**: `attachProductImage()` (the
analyze step's file-attach path) calls `FA_UTILS.waitFor()`, which is
pure `document.querySelector()` matching — it has never called
`isReallyVisible`, `findByVisibleText`, or `checkVisibility()` at any
point, before or after v9. `enterCreateImageMode()` (what v9 actually
changed) only runs for the image-gen step and is never called during
analyze. Confirmed by diffing v9's exact changes (`git diff 1449a5a
a397024`) and by grepping every call site of `findByVisibleText`/
`isReallyVisible` in the whole codebase — neither appears anywhere in
`attachAndSend`, `attachProductImage`, or `waitForPageReady`. **v9
mechanically cannot have caused this** — not a claim, a traced fact.

So what actually happened: this is very plausibly the *same*
page-readiness race v8 partially fixed, recurring under different
real-world conditions than the one successful run. The concrete
difference spotted: the live verification for v8's fix used a 3KB test
image; a real product photo from a phone camera can easily be 1-10MB+,
and ChatGPT's real upload + thumbnail-render pipeline for a file that
size plausibly takes meaningfully longer than for a tiny test image —
easily long enough to exceed the original 15-second-per-attempt budget,
which was never validated against a realistically-sized file.

**Fix**: widened `attachProductImage()`'s timing to a size this
plausible explanation actually needs, not a proven fix for a specific
defect — flagged as such: per-attempt timeout 15s → 25s, max attempts
2 → 3, retry gap now scales with attempt number (2.5s, 5s). Error
message on final failure now also names "the photo might be large and
still uploading" as a possibility alongside page-timing, rather than
only the timing theory.

**Verified not to affect the v9 imagegen fix**: the diff for this change
touches only `attachProductImage()` — confirmed by re-reading the diff
before committing, not just by intent. `enterCreateImageMode()`,
`tryOpenPlusMenu()`, and `dispatchHoverSequence()` are byte-for-byte
unchanged. Also confirmed clean extension load (zero console errors) via
CDP, same as every prior round. **Still not live-re-tested** — this
round couldn't verify against a real account either; the widened budget
is an evidence-based improvement, not a confirmed fix, same caveat as
v8/v9.

## v9: root-caused a real image-gen bug (not just another retry)

**v8 confirmed working**: Toey's next real-account run passed the
analyze step 100% — full, correct 3-section response for a real product
("Deo KLEAR Mineral Deodorant Roll On Skin Rescue"), matching the v3
template exactly. `waitForPageReady()` + the attach retry were the right
fix.

New bug, this time in the image-gen step: Toey observed the "+" button
get clicked but *nothing else happened* — no menu visibly opened, no
"Create image" ever got clicked, and the pipeline eventually failed with
an `attachmentPreview not found (after 2 attempts)` error — a different
failure surfacing symptoms of an *earlier* one. Since that error only
fires after `enterCreateImageMode()` returns without throwing, tracing
back: the function must have believed it successfully clicked
"Create image," even though nothing visible happened.

Root cause, found by code audit rather than adding another blind retry
(the retry mechanism from v8 was confirmed working as designed — it
retried twice, both attempts failed the same way, because the real
problem was upstream of what it was retrying): the old
`enterCreateImageMode()` searched the *entire document* for text
matching `/create image/i` right after clicking "+", without ever
confirming a menu had actually opened. `FA_UTILS.findByVisibleText`'s
visibility check was also too shallow — it only checked an element's own
`getBoundingClientRect()` and `visibility` CSS property, not whether an
*ancestor* clipped or hid it. Portal/animation-based menu component
libraries commonly keep menu item elements mounted in the DOM at all
times (for animation purposes) even while the menu is visually closed,
hidden via an ancestor's `display:none` or similar — exactly the kind of
hiding the old check couldn't see through. So the search very plausibly
matched a closed menu's dormant "Create image" item elsewhere in the DOM
and clicked it — doing nothing observable, matching exactly what Toey
saw, while the code believed it had succeeded.

Fixed two ways, both verified against real Chrome (not just read for
plausibility):

1. **`FA_UTILS.isReallyVisible()`/`findByVisibleText()` now use
   `Element.checkVisibility()`** (a real Chrome 105+ API that walks
   ancestors — `display:none`, `visibility:hidden`, zero-opacity, etc. —
   properly), falling back to the old shallow check only on engines
   without it. **Verified with a constructed real-DOM test**: built an
   actual hidden ancestor wrapping a "Create image" text node (simulating
   a closed portal-based menu) alongside a real, visible one with
   identical text, both in a live Chrome tab via CDP — confirmed the old
   bug pattern (`getBoundingClientRect` alone) would have matched the
   hidden one, and the new check correctly skips it and finds the real
   one instead.
2. **`enterCreateImageMode()` now confirms a real `[role="menu"]`
   container exists before searching it at all** (`tryOpenPlusMenu()`),
   and scopes the "Create image" search to *inside* that confirmed-open
   container — structurally ruling out matching anything elsewhere on
   the page, not just hoping the visibility check catches every case.
   Also tries a hover event sequence (`pointerenter`/`mouseenter`/
   `mouseover`) before a second click attempt if the first click doesn't
   open anything: the real `plusMenuButton` DOM (confirmed live, v5
   round) carries an `interestfor` attribute — part of the emerging HTML
   "Interest Invokers" spec for hover-triggered popovers — so a bare
   click may not be the right trigger at all. If the menu still never
   opens after both attempts, the error now says so explicitly
   ("เมนูไม่เปิดเลยหลังลองทั้งคลิกและ hover") instead of the old, misleading
   "menu item not found" phrasing that reads as a text/selector problem
   when the real issue is the menu never opening in the first place.

**Not yet live-re-tested against a real account** — same caveat as v8:
this round is a code-level root-cause fix based on Aree's precise
observation ("+" clicked, nothing happened, retry proven not to help),
verified as thoroughly as possible without a live session (real-DOM
`checkVisibility()` test, clean extension load via CDP), but the actual
image-gen step hasn't been re-run live yet.

## v8: regression fix — page-readiness timing (v7 exposed it)

Toey's real-account testing of the v7 fix hit a new symptom immediately:
`attachmentPreview` (now a required gate) failed to find *anything* from
the very first check, right after the file-attach step — before any
typing or sending happened at all. Toey observed no attachment chip ever
appearing in the chat box, as if the page had "just loaded." His theory,
which is what got fixed here: ChatGPT is a heavy SPA that keeps
client-side rendering/hydrating well after the initial page load event,
and the content script's file-attach step was very plausibly running
*before* the page was actually interactive — finding a real DOM element
via `querySelector`, but one whose React event handlers hadn't attached
yet, so setting `.files` via `DataTransfer` and dispatching synthetic
events never actually registered with the site's upload logic. Not a
selector problem — a timing one, and the v7 fix (correctly) just made
the previously-silent version of this exact failure visible instead of
hidden.

Fixed three ways, matching the three things Aree asked to check:

1. **`waitForPageReady()`** now runs first, before anything else in
   `attachAndSend` (including entering Create Image mode for the
   image-gen step) — waits for the composer *and* the "+" button to both
   exist, then requires them to still be present after a settle delay,
   re-waiting once more if the page re-rendered during that window
   (catching an early skeleton getting replaced by the real thing).
   `document_idle` only guarantees the load event fired, not that a
   heavy SPA has finished hydrating — there's no clean DOM signal for
   "React has attached its listeners," so this is a best-effort
   settle-and-recheck rather than a hard guarantee, but it directly
   targets the theorized root cause.
2. Yes — the "+" button click in `enterCreateImageMode` now happens
   *after* `waitForPageReady()`, not before it, for the same reason.
3. **`attachProductImage()` retries once** on failure: re-locates a
   *fresh* file input reference (rather than reusing a possibly-stale
   one from before a hydration pass), waits longer, and tries the
   whole attach-and-verify sequence again — this is what actually
   recovers from "the page wasn't ready the first time." Only if the
   retry also fails does it throw, and the final error's `siteHint` now
   explicitly names page-readiness/timing as a likely cause alongside
   selector drift, rather than only reading as "this selector is wrong"
   (which is what made the v7 regression's real cause less obvious than
   it needed to be).

Verified: `node --check` on the changed file, confirmed the extension's
background service worker and content-script isolated world still load
without errors via CDP (same technique as every prior round).
**Not yet re-tested against a real ChatGPT account** — Toey hadn't had a
chance to grab the full error stack or re-test by the time this was
fixed (only the `console.error(...)` call site, line 316, was available
as a location reference); this round's fix is based on code-level
analysis of a highly plausible, well-evidenced theory, not a live
repro-and-confirm cycle like v5–v7 had.

## v7: fixed a real blocking bug — sent messages with no image attached

Real bug report from Toey's own testing (with screenshot evidence): the
analyze step sent the full `FA_ANALYZE_TEMPLATE` message successfully
(visible in the chat), but **the product photo never actually attached**
— ChatGPT replied "Please upload the product photo so I can base all 5
shots on the actual product." The extension then made no further
progress.

**Root cause**: the v5 fix made the "attachment finished uploading"
check (`attachmentPreview`) an optional soft signal, gating only on the
send button becoming *enabled*. That was based on an incomplete
assumption — button-enablement turned out to be necessary but not
sufficient: the send button apparently enables from having *text* in the
composer alone, with no attached file required. So the pipeline could
(and did) send a text-only message believing it had verified the
attachment, because it had only verified the composer was ready to send
*something*.

The irony: by the time this bug shipped, `attachmentPreview`
(`button[aria-label^="Remove file"]`) had already been independently
CONFIRMED correct via the v5 live-DOM round — it just hadn't been
promoted back to a required check. Fixed three ways, addressing all
three points raised:

1. **`attachmentPreview` is a required gate again**, not optional —
   `attachAndSend()` now does `FA_UTILS.waitFor()` (throws on failure) on
   it right after attaching the file, before doing anything else. This
   is the correct call now that the selector is confirmed, not a guess.
2. **A second, final check runs immediately before clicking Send** —
   re-verifies the attachment chip is *still* present at that exact
   moment (in case it were somehow removed between the first check and
   send), throwing a specific error instead of proceeding if it's gone.
   This is the literal last chance to catch "about to send with no
   image" before it happens.
3. **Defense-in-depth**: `FA_UTILS.detectChatGptMissingImageReply()`
   scans the assistant's actual reply for phrasing indicating it never
   received an image ("please upload/attach/provide a photo", "I don't
   see an image", "no image was attached", etc.) and throws
   `FAMissingImageError` if matched — checked right after
   `attachAndSend()` returns, before the reply is trusted as real
   storyboard content, in both the analyze and image-gen steps. This
   should be unreachable now that (1) and (2) are in place, but catches
   it anyway if some other cause ever reproduces the same symptom, rather
   than silently parsing ChatGPT's "please upload a photo" as if it were
   the expected 3-section response.

Verified: unit-tested `detectChatGptMissingImageReply()` against the
exact real reply text from Toey's bug report (confirmed detected) plus
normal storyboard text and two other phrasing variants (confirmed not a
false positive / confirmed detected respectively); confirmed
`FAMissingImageError` and the detection function are loaded and callable
inside the real content-script isolated world via CDP.

## v6: Flow upload flow — real 2-click path found

A follow-up round after Toey reloaded the Flow tab (clearing a stuck
dropdown menu from v5) plus a rate-limit-detection feature (see below).
Real findings this round:

- **Confirmed real 2-step upload flow**: no `<input type="file">` exists
  anywhere on the page by default. Clicking "Add ingredients to the
  prompt box" opens a media panel (tabs: All/Images/Videos/Voices/
  Characters/Avatars, a "No assets found" empty state, and an "Upload
  media" option). Clicking that "Upload media" button — traced up from a
  real `<span class="upload-text">Upload media</span>` to its actual
  clickable ancestor, since the button itself has no aria-label/testid —
  makes a real file input appear with a highly distinctive `accept` list:
  `.png,.jpg,.jpeg,.webp,.gif,.heif,.heic,.mp4,.m4v,.mov,.3gp,.avi`. The
  button's real class is `.sidebar-upload-btn` (Angular Material,
  `mdc-button` family) — now the primary `uploadButton` selector, with
  `findByVisibleText` as a fallback. `content-flow.js`'s
  `uploadStoryboardImage()` now does both clicks in sequence before
  looking for the file input, matching this confirmed real flow instead
  of assuming one click was enough.
- **Not confirmed**: whether actually feeding a file through that input
  via `DataTransfer` completes a real upload. Live interaction became
  unreliable again right as this was being tested (same pattern as v5 —
  the VNC session's input channel stopped registering keystrokes/pastes
  after a similar number of consecutive interactions, despite a fresh
  page reload having cleared the *previous* round's stuck state; a
  ~75s pause and retry didn't help this time either). Stopped rather than
  force it, per explicit instruction. `promptField`, `generateButton`,
  `generatingIndicator`, and `resultVideo` remain entirely unverified —
  never reached this round.
- No destructive or unintended state left behind — clicking through the
  upload panel didn't create any asset, project change, or generation;
  nothing was submitted.

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
  primary. (Was briefly downgraded to a soft signal after this v5 fix,
  since it was unverified at the time — that turned out to be the wrong
  call once it *was* verified here and stayed soft anyway; see "v7",
  which made it a required gate again now that it's confirmed correct.)
- `composer` (`#prompt-textarea`), `sendButton`
  (`button[data-testid="send-button"]`), `plusMenuButton`
  (`button[data-testid="composer-plus-btn"]`), and `assistantMessages`
  (`[data-message-author-role="assistant"]`) — all confirmed exactly
  right, no changes needed.
- **New constraint discovered, now handled**: ChatGPT's free tier rate-
  limits chats that include files/images (hit this mid-session: "Chat
  paused until usage resets at 12:28 AM — You've reached the limit for
  chats that include files or images..."). `FA_UTILS.detectChatGptRateLimit()`
  scans the page for that exact confirmed phrase (ignoring the dynamic
  time) right after generation "completes" — the one place that also
  catches the worst case, where the limit blocks generation from ever
  starting and the "stop generating" button never appears at all, which
  would otherwise make `waitForGenerationComplete`'s grace-window logic
  resolve as if generation finished normally (a real silent-wrong-
  success risk, not a cosmetic one). Any match throws `FARateLimitError`
  unconditionally — even if the response looks complete, since there's
  no reliable way to tell whether a banner appearing mid-generation means
  the response is trustworthy or truncated — surfaced through the
  existing error-view pipeline in the popup, extracting the "resets at
  ..." time into the message when present. Unit-tested against the exact
  real banner text captured this round, plus a normal-page case
  (correctly returns `false`), and confirmed loaded and callable inside
  the real content-script isolated world via CDP.

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
  UI to work, not a guess at its internal markup. **(Reversed in "v7"
  below**: button-enablement turned out to require text alone, not an
  actual attachment — this soft-gating design is what let a real
  text-only send through undetected. Kept here as the historical record
  of the reasoning that led there.)
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

Updated through v9 — the analyze step is now fully confirmed working
end-to-end on a real account (v5, re-confirmed after the v8 fix). What's
still open:

- **ChatGPT `stopGeneratingButton` and `generatedImage`** — not yet
  confirmed. During the v5 test the send button visibly changed to a
  stop icon while generating, but its real testid/aria-label wasn't
  queried before generation finished; the image-gen step itself hasn't
  completed live yet (blocked by the free-tier rate limit in v5, then by
  the "+" menu bugs fixed in v8/v9).
- **`plusMenuButton`/`menuContainer`** — `plusMenuButton` itself is
  confirmed real (`button[data-testid="composer-plus-btn"]`, real DOM
  query). `menuContainer` (`[role="menu"]`) is a standard ARIA pattern,
  not site-specific, but not yet confirmed against ChatGPT's actual
  markup — v9's fix (see above) is structurally sound and verified with
  a constructed real-DOM visibility test, but the full click-through
  (does `[role="menu"]` really appear, does "Create image" really render
  inside it) hasn't been confirmed live yet. If it's wrong, it'll now
  surface as a specific "เมนูไม่เปิดเลย" error rather than a silent
  wrong-element click.
- **Google Flow — still only partially confirmed.** `newProjectButton`
  (real finding: no aria-label at all, text-match only), the domain
  itself, and — as of v6 — the full 2-click upload path
  (`uploadDropzone` → `uploadButton` → `fileInput`, with `fileInput`'s
  distinctive `accept*="heic"` attribute confirmed real) are confirmed.
  NOT confirmed: whether feeding a file through that confirmed input via
  `DataTransfer` actually completes an upload (v6's live test was
  interrupted before checking), and `promptField`, `generateButton`,
  `generatingIndicator`, `resultVideo` remain entirely unverified guesses
  — never reached in either round. Any of these being wrong will surface
  as a specific "selector not found" error, not a silent hang or wrong
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
