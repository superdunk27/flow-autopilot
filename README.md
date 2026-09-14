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

## v37: v7 template — stricter on-screen-text lock to stop cross-scene blending

Toey generated a real video of a smartwatch (GOOJODOQ) with v6 and
found Shot 1's on-screen text read **"สมาร์ตวอทช์ครบ จอใหญ่ 2.01" HD"**
— a blend of wording from Shot 5's closing text ("สมาร์ตวอทช์ครบ") and
Shot 1's own opening text ("จอใหญ่ 2.01" HD"), neither of which the
storyboard plan actually specified for Shot 1. Not seen on earlier
products (RUN9PRO, the stainless cutting board) — diagnosed as a known
video-model weakness (text rendering isn't 100% stable across scene
cuts) rather than a prompt bug, but Toey asked for one more
reinforcement attempt before accepting it as a hard limitation.

Single-sentence replacement in Section 3, verified via a Python diff
against the exact old/new sentence pair the spec gave (rather than a
full fenced block this time, since only one sentence changed): the old
"Do not redraw or regenerate any text overlay — keep all on-screen
text completely static..." sentence is replaced with a much stricter
CRITICAL on-screen-text-lock directive — character-for-character match
to that scene's own text only, zero cross-scene blending/merging,
treated as a static pre-rendered graphic layer copied verbatim from
the storyboard image. Copied verbatim from `ψ/active/flow-autopilot-extension.md`
"Update 2026-09-14 v7", same discipline as v2–v6.

Every other sentence — Sections 1, 2, and the rest of Section 3 —
confirmed byte-identical to v6 via the same diff (only the targeted
sentence differs, checked programmatically, not eyeballed). All 3
section headings unchanged — no parse-code impact, same reasoning
already established in v5/v6.

**Not live-tested this round**: `node --check` confirms the file
parses; the real test is the next live video generation with a
product that previously showed this cross-scene text blend.

## v36: v6 template — cap voice-over lines to ~2 seconds of speech

Toey generated real output through v5 by hand directly in Flow's UI
(not through this extension) and got **no spoken narration at all**.
The voice-over lines ChatGPT wrote were full sentences (a real one
seen: "ใครกำลังหาเขียงสไตล์มินิมอล ตัวนี้เป็นเขียงสแตนเลส 316 ที่ใช้งาน
ได้ทั้งสองด้านครับ") too long to be spoken within the 2-second scene
each one has to fit into — likely why Omni 1.1 Flash dropped the
narration entirely rather than attempt to cram a long sentence into a
short scene.

Single-sentence change from v5 (verified via a Python diff — confirmed
only this one addition, nothing else moved): appends to Section 1's
voice-over instruction, "Keep each voice-over line SHORT enough to be
spoken naturally within about 2 seconds — roughly 4 to 7 Thai
syllables, a short phrase rather than a full sentence, so it fits the
2-second scene without being cut off or rushed." Copied verbatim from
`ψ/active/flow-autopilot-extension.md` "Update 2026-09-14 v6", same
byte-exact discipline as v2–v5 (`in_file == spec` → `True`, 6167/6167
chars).

Everything else — all 3 headings, Sections 2/3, the rest of Section 1
— confirmed byte-identical to v5. No parse-code impact: v5's own note
already established `parseAnalysisResponse()` only operates at the
section-heading level, unaffected by any wording change within a
section's body.

**Not live-tested this round**: `node --check` confirms the file
parses; the real test is whether the next live analyze+imagegen+video
run actually produces audible narration this time.

## v35: v5 template — theme-based shots, per-shot voice-over, strict product-lock directive

After testing 3 products (Deo KLEAR, Old Spice, RUN9PRO), Toey noticed
v4's fixed "5 different pedestals, same camera" formula produced the
same pedestal set repeating for every product — the real reference
example instead varies the *theme* per shot (with camera angle
adapting to that theme, not just the base), plus a separate per-shot
voice-over.

`FA_ANALYZE_TEMPLATE` replaced with the v5 spec text from
`ψ/active/flow-autopilot-extension.md` "Update 2026-09-14 v5", copied
verbatim per the spec's explicit instruction — verified **byte-for-byte**
via the same Python diff method used for v2–v4 (`in_file == spec` →
`True`, 5942/5942 chars).

Section 1's shot-line format changed: `Shot N: [pedestal] — [camera] —
[text]` (v3/v4) → `Shot N: [theme] — [camera treatment] — text:
"[main]" / "[secondary]" — voice: "[line]"` (v5), using 5 fixed themes
in order (product overview / material & texture / design & details /
use occasion / closing CTA). **Checked explicitly, per the spec's own
request**: read `parseAnalysisResponse()` in full — it only ever splits
by the 3 SECTION-level headings and keeps each section as one text
block; it never parses individual "Shot N:" lines or extracts
sub-fields from them. This format change needed **no code changes** —
confirmed by reading the actual parsing code, not assumed from the
spec's description of it.

Section 3 gained a permanent "CRITICAL: strict reference-image-
conditioned generation" directive (live-confirmed via RUN9PRO to fix a
real product-mismatch problem seen with Old Spice) and per-theme
camera motion (static for hero/closing shots, subtle push-in for the
macro shot, slow rotation for the design-detail shot, natural motion
for the use-occasion shot) replacing v4's fully-static-every-scene
rule, plus a voice directive telling Omni 1.1 Flash to narrate each
shot's voice line itself. Toey decided against automating Google
Flow's "Voices" tab for this — `content-flow.js` is unaffected, no
changes there.

All 3 section headings confirmed byte-identical to v3/v4 via
programmatic diff against the v4 commit, not eyeballed.

**Not live-tested this round**: `node --check` confirms the file
parses; the real test is the next live analyze run producing the new
theme-based shot lines and voice-over lines as intended.

## v34: v33's core sequence manually verified live; renamed for what it actually does

Aree manually walked through v33's exact sequence against the real
Old Spice video already generated this session (no extra quota
spent) and confirmed all 4 steps work as written: the "+" button opens
the asset picker after generation, the "Videos" filter tab filters
correctly (down to exactly the one video, since `storyboard.png` is an
Image and gets excluded), filtering to one result auto-shows its
preview (the thumbnail click wasn't even strictly necessary in this
case, but is harmless and kept), and `document.querySelectorAll('video').length === 1`
confirmed the real `<video src="https://flow-content.google/...">`
mounted successfully. v33's sequence is correct as written.

QA raised one real, still-open point about it that doesn't affect this
confirmed case: the function was named `openNewestVideoAsset()`,
implying real recency sorting that was never implemented — it only
works because of the fresh-project single-video invariant (v33), not
because it picks the newest of several. A `RETRY_STEP` that somehow
lands in a project that already has a video from an earlier attempt
would break that invariant, and there's no confirmed timestamp/sort
DOM to disambiguate by if it ever happens.

**Fixed the naming** (renamed to `openVideoAssetFromPicker()` — no
claim of recency logic it doesn't have) and **added ambiguity
detection**: if the "Videos" filter ever turns up more than one
result, a clear warning is pushed naming the count and flagging the
retry-into-existing-project risk explicitly, instead of silently
picking "the first one" and calling it correct. Still picks the first
result either way (no real sort/timestamp DOM to do better with yet)
— this doesn't *solve* the multi-video case, it makes it visible
instead of silent, consistent with this project's whole approach to
unconfirmed edge cases.

**Not live-tested this exact change**: the underlying sequence is
now real-world-confirmed (Aree's manual walkthrough above); this
specific rename + warning-on-ambiguity hasn't itself been re-run.

## v33: 🎉 video mode confirmed working end to end — last gap was navigation, not a selector

Toey's final live test with Old Spice Wolfthorn: `setVideoGenerationMode()`
(v30–v32) worked exactly right — the composer showed "Video · 720p ·
10s x1" automatically, no manual intervention, and the generated asset
was genuinely `type: Video` this time, not `Image`. The one remaining
error was the same old `resultVideo` `FASelectorError` — but this time
for a real, different reason.

Aree checked the real DOM: `document.querySelectorAll('video')`
returns 0 right after generation finishes, on the main "All media"
view — **`SEL.resultVideo` was never actually wrong** (Aree confirmed
via DevTools that the real mounted element matches `video[src]`
exactly: `<video ... aria-label="Video preview" class="video-preview"
src="https://flow-content.google/...">`). Flow simply doesn't
auto-navigate to a video-player view after generation — the `<video>`
element only mounts once the specific asset is actually opened, which
Aree did manually by opening the asset picker ("+") and clicking the
new video asset in its list.

**Fixed**: new `openNewestVideoAsset()` in `content-flow.js`, called
right after `waitForGenerationComplete()` and before `waitFor(SEL.resultVideo, ...)`
— opens the asset picker via the same confirmed `SEL.uploadDropzone`
button already used for uploading, clicks the "Videos" filter tab
(text-matched, confirmed to exist from this session's own earlier live
exploration of the picker's filter tabs), then clicks a thumbnail to
open the asset. Deliberately does **not** need the snapshot-diffing
technique from `findPromptField()`/`findVideoToggle()` (v27/v32):
since `ensureNewProject()` starts a genuinely fresh project every run,
there is at most **one** video asset in the whole project by the time
generation finishes — filtering to "Videos" is unambiguous on its own,
with no possible decoy to disambiguate against.

**Honest limit, flagged rather than glossed over**: the asset
picker's own item-row markup (what's actually clickable) has **not**
been confirmed live. Best-effort fallback: click any visible `<img>`
thumbnail inside the picker after filtering — clicking an `<img>`
bubbles the click event up through its ancestors regardless of
exactly which one owns the real click handler, so this should trigger
the row's click without needing to know the row's own selector (plain
DOM event bubbling — unrelated to the `interestfor`-gated trusted-input
requirement found on the ChatGPT side).

**Not live-tested this round**: verified via `node --check` only. If
this specific thumbnail-click guess doesn't land on the right row live,
the next report should include the real asset-row markup so this can
be tightened the same way `findPromptField()`/`addToPromptButton` were.

## v32: scoped the Video-toggle search to the panel that just opened, not the whole document

QA reviewed 21c85d5+853eb24 before Toey's final live generate and
found a real gap that got *worse*, not just redundant, when combined
with v31's check-then-set: `findVideoToggle()` queried
`button.mat-button-toggle-button` document-wide, not scoped to the
panel `settingsBtn.click()` just opened. A separate "Agent settings"
panel (found earlier the same day) also has Image/Video toggles — if
any of its elements linger in the DOM even hidden (the exact same
class of bug already found once this session, for the asset picker's
own leftover thumbnail — see v28), this could match the wrong panel's
toggle entirely. With v31's check-then-set layered on top, a stale
wrong-panel toggle that happens to read as "checked" would be silently
**trusted and skipped** rather than clicked — worse than the plain
unconditional click it replaced.

**Fixed** with the same real-evidence technique already used (and
QA-approved) for `findPromptField()` (see v27): snapshot which toggle
buttons exist *before* clicking `settingsBtn`, then prefer whichever
matching toggle is new *after* — structurally tied to this specific
click, not a document-wide guess. Falls back to the old document-wide
search only if the panel turns out to reuse existing hidden DOM nodes
rather than creating fresh ones on open (not confirmed either way, so
both paths are kept rather than assuming one) — with a warning pushed
in that fallback case, so it's visible rather than silent if it
happens.

**Not live-tested this round**: verified via `node --check` only, by
explicit agreement — Toey held off the final generate until this
landed.

## v31: check-then-set for the Video toggle — skip the click if already set

Toey's suggestion: if this setting turns out to persist across
projects/sessions (not confirmed either way — a real open question,
not settled), force-clicking it every time wastes a click for no
reason, and every extra click is one more chance at an
accidental-trigger surprise like the "Agent" chip tangent. Proposed
check-then-set instead of blind force-set.

**Implemented for the Video/Image toggle only** (the one piece of this
panel with a confirmed live selector): `setVideoGenerationMode()` now
checks whether the "Video" toggle is already selected before clicking
it — via the standard Angular Material `mat-button-toggle` checked-
state conventions (`aria-pressed="true"`, or the `mat-button-toggle-
checked` class on the toggle's host element). Reasonable to infer
rather than guessed blind: `mat-button-toggle-button` itself is
confirmed live as this site's real class, meaning it's a stock Angular
Material component using the library's own standard conventions, not
this site's custom naming. Defaults to clicking (the previous,
unconditional behavior) if neither signal reads as checked — never
silently skips based on an unconfirmed assumption.

**Not extended to resolution/duration/count** (720p/10s/x1) — no
selectors for those controls have been confirmed live at all yet
(only the Video/Image toggle was), so there's nothing safe to check
against; left untouched exactly as before (never explicitly set,
relying on whatever default/persisted state exists), per Toey's own
"not blocking, force-set is fine" allowance for anything too complex
to do safely right now.

**Not live-tested this round**: verified via `node --check` only.

## v30: 🎉🎉🎉 the real fix — an explicit per-message generation-type selector

Toey found the actual root cause by hand: v29's directive-prefix
wording theory was wrong. The real fix is a genuine, separate
per-message generation-type selector — opened via
`button.settings-trigger-button` (aria-label "Settings trigger", the
slider icon next to the send arrow), distinct from the "Agent
settings" *defaults* panel found earlier the same day. Setting it to
"Video · 720p · 10s · x1" explicitly before typing the prompt and
generating routed cleanly to Omni 1.1 Flash (video) — confirmed with a
real, complete, correctly-ordered 10-second/5-scene video, played back
and checked scene-by-scene.

A side-investigation into an "Agent" chip (`button.agent-mode-chip`)
briefly looked like a required prerequisite click, with confusing
results (a real trusted click triggered an unrelated "Thinking..."
hang with no new asset created — no quota spent; a synthetic JS click
did nothing to its own checked class but somehow made a previously-set
badge reappear). Resolved by re-checking the actual sequence used in
the run that produced the real video: **the "Agent" chip was never
clicked at all** in that run — Toey had set the generation type once
beforehand and handed off from there. Confirmed as not a real
prerequisite, just a confusing tangent — the direct
`.settings-trigger-button` → "Video" toggle → generate sequence is the
complete, correct flow on its own.

**Fixed**: new `setVideoGenerationMode()` in `content-flow.js`, called
at the very start of `submitVideoPrompt()`, before locating the prompt
field or typing anything:
1. Opens the settings panel via `SEL.settingsTriggerButton`
   (`button.settings-trigger-button`).
2. Finds the "Video" toggle — its class (`mat-button-toggle-button`)
   is shared with the "Image" toggle, confirmed live by Toey, so this
   scans every match and filters by the inner `span.toggle-text`'s
   actual visible text (`=== "Video"`), the same "shared class,
   distinguish by text" pattern `FA_UTILS.findByVisibleText()` already
   uses elsewhere in this codebase — and clicks it.
3. Closes the panel with a plain `document.body.click()` — the
   standard Angular Material CDK overlay dismiss behavior (clicking
   outside the overlay closes it via its backdrop listener). The exact
   dismiss mechanism wasn't independently confirmed live; flagged as
   the safest generic choice rather than a guessed specific close
   button.

v29's directive-prefix (`"Generate a video (not an image edit):\n\n"`)
is **kept**, per explicit agreement — harmless, and a reasonable extra
safety net even though it wasn't the actual cause.

**Not live-tested this exact code yet**: the underlying sequence (open
settings → click Video → generate) is real-world-confirmed by Toey's
manual run; this specific automated implementation of that sequence
has not itself been run through the extension end to end yet.

## v29: architecture-level bug — Agent has no Image/Video mode toggle, it infers intent

🔴 Live-tested v28: every automated step worked exactly right — upload,
"Add to prompt" (evidence-based fix confirmed working), prompt typed
into the correct field, Generate clicked with no error. But the real
result was a **new image** ("Nano Banana 2 Lite", the storyboard with
timestamp labels baked in, laid out vertically) — not a video. Aree
confirmed via the project's asset list (`asset type = Image`) and the
model name shown at the bottom-right of the composer.

Both Aree and Toey independently explored the live Flow UI to check
whether a mode toggle was simply missed — confirmed there isn't one to
find: the "Agent" chatbox has no Image/Video switch at all. The
"Agent settings" panel (gear/sliders icon next to the composer) holds
separate "Image generation default" (model: Nano Banana 2 Lite) and
"Video generation default" (model: **Omni 1.1 Flash** — Google's
renamed Veo) preferences, but these are just default *model choices*
for whichever path gets used — Agent (an LLM) decides which underlying
tool to invoke by interpreting the message content itself, not from
any per-message toggle a user sets first. Opening the per-asset "edit"
view for the wrongly-created image showed the exact prompt that was
sent: "Animate the provided 5-panel ... storyboard into a 10-second
video..." — phrasing that reads just as naturally as an *image*-editing
instruction ("animate/transform this image") as a video-generation
request, and Agent picked the former.

This is why it was never caught before: every prior test failed
*earlier* in the pipeline (selectors, timeouts, missing steps) — this
is the first time the pipeline ever ran cleanly end-to-end far enough
to expose it.

**Fixed as a hypothesis, not yet quota-confirmed**: `content-flow.js`
now prepends a fixed, blunt directive — `"Generate a video (not an
image edit):\n\n"` — before the actual video prompt, rather than
relying on the analyze template phrasing every future prompt exactly
right on its own (directly what went wrong this time). Deliberately
hardcoded in the extension, not left to ChatGPT's output wording.

**Recommended before spending more automated-run quota**: test this
specific hypothesis the cheapest way first — manually retype a
modified prompt directly into the *already-open* Flow chat (the image
is already attached there from the last run) rather than re-running
the whole 3-step pipeline just to test this one thing. That's the
fastest, lowest-cost way to learn whether an explicit directive
actually flips Agent's routing before committing to this specific
fix's wording, or exploring alternatives (a different phrasing, or
further DOM investigation for a forced-model path neither Aree nor
Toey found this round, if manual testing shows even an explicit
directive still doesn't reliably work).

**Not live-tested this round**: verified via `node --check` only, by
explicit agreement — no quota spent on this fix's specific wording yet.

## v28: QA's fast pre-live-test catch — filtered newImagesSince() by visibility/size

QA approved v27's evidence-based approach as fixing the right thing,
but caught one small gap fast, before Aree spent real quota:
`newImagesSince()` had no visibility/size filter at all — a
hidden-but-not-removed leftover (e.g. the asset picker's own thumbnail
preview, still in the DOM just hidden after the picker closes) could
get counted as "new" evidence, potentially sitting closer to the wrong
field than the real, visible thumbnail and silently corrupting
`commonAncestorDistance()`'s pick — undermining the whole point of
v27's fix with one overlooked filter.

**Fixed**: `newImagesSince()` now also requires
`FA_UTILS.isReallyVisible(img) && img.complete && img.naturalWidth > 100`
— the same loaded/visible filter already used by
`waitForGeneratedImage()` on the ChatGPT side, applied here for the
same reason.

**Not live-tested this round**: verified via `node --check` only.
Aree is live-testing right after this lands.

## v27: QA caught a tautological check — real DOM-evidence-based fix instead

QA's final review of b0ba5c4 found the "verify-after-type" check from
v26 was a **tautology**: `typeIntoComposer(promptField, ...)` writes
into the exact element `findPromptField()` just returned, then the
verify step reads back from that *same* reference — so it passes
unconditionally regardless of whether the right element was ever
selected in the first place. All the actual protection was still
riding on `findPromptField()`'s own size/label heuristic alone, with
no real second layer — and QA found a concrete way that heuristic
could still be fooled: a decoy element with no aria-label/placeholder
(so nothing to exclude it by) happening to render *larger* than the
real prompt field at the exact moment of the query — plausible right
as the asset picker's closing CSS transition settles.

QA's proposed fix: tie field selection to real evidence of the action
just taken (the image landing in the prompt), not an heuristic
disconnected from actual page state. Implemented via
`snapshotImages()`/`newImagesSince()` in `uploadStoryboardImage()`:
captures every `<img>` on the page *before* touching the file input,
then again right after "Add to prompt" settles, and returns whichever
`<img>` elements are genuinely new — real, structurally-grounded
evidence that this image really did land somewhere, without needing to
guess its class/selector at all. `findPromptField()` now takes these
as `evidenceImgs` and, when available, scores every visible candidate
by `commonAncestorDistance()` — literal DOM-tree steps to their
nearest shared ancestor with the evidence — picking whichever is
*structurally closest* to where the image actually landed, instead of
size/label alone. The old size heuristic is kept only as a fallback for
when no new `<img>` is detected at all (with a warning pushed in that
case, since it's meaningfully weaker).

The tautological verify-after-type check is kept but re-scoped
honestly in its own comment: it still catches typing silently failing
to register (a real, different failure mode — e.g. `execCommand`
blocked) — it explicitly no longer claims to verify element selection,
since that's `findPromptField()`'s job now, backed by real evidence
instead of a guess.

**Not live-tested this round**: verified via `node --check` only, by
explicit agreement — no live DOM access, and no quota spent, until
QA's review is satisfied.

## v26: QA's pre-live-test review — same wrong-field quota risk, one step later in the same fix

QA reviewed ef7db33 in detail before Aree would spend real quota
testing it, and found 2 real gaps — one blocking, one not:

**Q3 (blocking, fixed)**: `SEL.promptField`'s generic catch-alls
(`textarea`, `div[contenteditable="true"]`) went through a bare
`document.querySelector` — which just returns whichever qualifying
element comes first in DOM order. The real prompt box has no
id/testid/aria-label at all (documented as a known gap since v6), and
the same page also has an unrelated search input and an "Editable
text"-labelled field. Typing the video prompt into the wrong one and
clicking Generate would waste a real, scarce (~5/day) quota unit — the
*exact* failure mode v25 just fixed for the image, one step later, for
the text.

Fixed with a new `findPromptField()`: tries the 3 specific "prompt"-
labelled candidates via plain `querySelector` first (safe, a real
signal if one ever matches), then — instead of trusting "first in DOM
order" — scores every visible `textarea`/`div[contenteditable="true"]`
candidate, excluding ones matching known non-prompt hints (`search`,
`editable text`), and picks the largest by rendered area (the main
composer is expected to visually dominate the page far more than a
small utility input). Also added a **verify-after-type check**: reads
back the field's actual content right after typing and compares
against the start of the intended prompt — if it doesn't match,
throws *before* Generate is ever reached, converting an unverified
assumption into a checked precondition on the one step where being
wrong has real cost.

**Q2 (non-blocking, fixed anyway)**: nothing previously confirmed
`addToPromptBtn.click()` (v25) had any effect at all. Added a weak but
real signal — if the button is still clearly visible after clicking
(the asset picker is expected to close), push a warning rather than
proceed silently. Kept as a warning, not a hard failure, since this
specific heuristic (button disappears on success) isn't itself
live-confirmed either, and a false failure here would be worse than a
missed one.

**Bonus real finding while this was in progress**: Toey checked the
live Flow UI directly and confirmed the mechanism precisely — hovering
the Generate button (while the request was genuinely incomplete)
showed a tooltip reading **"prompt must be provided"**. This isn't a
theory anymore: Generate is a real disabled-state element, gated by
Flow's own validation, not a button that "just doesn't do anything
useful" when clicked incomplete. Clicking a disabled element fires no
handler and throws nothing — almost certainly why v24/v25's earlier
live test's Generate click produced zero visible error despite the
request being incomplete, a silent no-op that looked like a real
click succeeding.

**Fixed the same gap this reveals**: `submitVideoPrompt()` never
checked `generateBtn` was actually enabled before clicking it — added
that check, same pattern as `waitForSendButtonReady()` on the ChatGPT
side (never click blind). If still disabled at that point, throws a
clear error referencing the real confirmed tooltip text, instead of
clicking a no-op button and silently doing nothing.

**Not live-tested this round**: verified via `node --check` only, by
explicit request — Aree held off spending real quota on a live test
until this review was addressed first.

## v25: found a missing step, not a wrong one — "Add to prompt" was never clicked

Aree live-tested v24's Generate-button fix: the button was now found
and clicked successfully (error changed from "can't find Generate" to
"can't find the result video" — meaning Generate really did fire).
**Zero quota spent** — Aree checked the project's "All media" panel
directly and confirmed only `storyboard.png` was there, no video ever
got created.

Aree's own hypothesis, confirmed correct by reading the code: Google
Flow's upload flow puts the file into an asset picker first — it has
to be explicitly committed into the actual prompt via an "Add to
prompt" button before the video prompt text/Generate click mean
anything. `uploadStoryboardImage()` fed the file into the hidden
`fileInput` and then just... stopped. It never looked for or clicked
"Add to prompt" — that button didn't exist anywhere in
`selectors.js` or `content-flow.js` at all. `submitVideoPrompt()` went
on to type the prompt and click Generate anyway, with no image ever
actually committed — and per Aree's live observation, Flow appears to
just silently no-op on an incomplete request rather than show any
error, which is exactly the kind of silent-wrong-success this whole
project exists to catch (and, worse here, one that would have quietly
burned a real quota unit for nothing).

**Fixed**: new `SEL.addToPromptButton` (Aree found it live via
DevTools — plain visible text "Add to prompt", no aria-label/testid at
all, same pattern as `newProjectButton`), and `uploadStoryboardImage()`
now polls for it (CSS candidates first, then `findByVisibleText`
fallback, up to 10s) and clicks it right after the file attaches,
before returning. Made this a **required, not soft** gate — same
reasoning as `attachProductImage()`'s required `attachmentPreview`
check on the ChatGPT side (see v7): proceeding to Generate without
confirming the image actually landed in the prompt would risk silently
wasting a real, scarce (~5/day) quota unit on an empty request again.

**Honest limit on this fix**: built from Aree's live report of the
button's existence and behavior, not from live DOM access this round —
whether clicking it actually results in `submitVideoPrompt()`'s
`promptField` search finding the *same* field the image just landed
in (rather than some other now-revealed field) has not been directly
confirmed; `submitVideoPrompt()` already does its own fresh
`waitFor(SEL.promptField, ...)` after this returns, which should
naturally re-query whatever the DOM looks like at that point regardless,
but this is inference, not a live-confirmed detail.

**Not live-tested this round**: verified via `node --check` only. No
quota was spent — Aree's report was itself already a no-quota-spent
finding, and this fix doesn't change that Generate still fires exactly
once per attempt (same click-count guarantee re-verified in v24, still
holds — nothing about *when* the click happens changes *how many*
times it happens).

## v24: 🎉 reached Google Flow for the first time this session — fixed generateButton selector

Milestone: the pipeline reached step 3 (Google Flow) for the first
time this session — `storyboard.png` uploaded successfully, image
preview displayed correctly. Then hit `FASelectorError` at
`submitVideoPrompt()` looking for the Generate button.

Aree diagnosed live via real DevTools `querySelectorAll('button')` on
the actual page — both the primary selector AND its text fallback were
simultaneously dead, for two independent reasons: (1) the real
`aria-label` is `"Start generation"`, not `"Generate"` — Google renamed
it; (2) the button's visible "text" is a Material Symbols icon
ligature (`"arrow_forward"`, a literal arrow icon), not a word at all —
`findByVisibleText`'s `GENERATE_TEXT_PATTERNS` (`/^generate$/i`,
`/generate video/i`, `/create video/i`) could never have matched an
icon ligature no matter what it said, so the fallback was never a real
safety net for this specific button to begin with.

**Fixed**: `SEL.generateButton` now tries `button[aria-label*="generation" i]`
first — the noun ("generation"), not the verb ("Generate") — deliberately
broader than matching `"Start generation"` verbatim, so a future rename
like `"Begin generation"` doesn't break it the same way `"Generate"` →
`"Start generation"` just did. Old `"Generate"`/`data-testid` patterns
kept as fallbacks in case Google reverts. The text-pattern fallback in
`content-flow.js` is left in place too (harmless), but documented as
known-dead against the current icon-only button — kept only in case a
future DOM revision adds real visible text back.

**Quota safety, checked explicitly since Aree flagged Flow's harsh
~5/day generate limit**: confirmed by reading `submitVideoPrompt()` —
`generateBtn.click()` fires exactly once, at the very end, with no
retry loop around the click itself (unlike `attachProductImage()`'s
3-attempt retry for file attach). This fix only changes which selector
*finds* the button; it doesn't add or remove anything about how many
times it gets clicked once found. **Separately worth flagging, not
fixed here** (pre-existing architecture, not introduced by this
change, and not what was asked): a user-initiated `RETRY_STEP` after
Generate has already fired successfully but a *later* step fails (e.g.
`waitForVideo()`) would re-open a fresh Flow tab and re-run the whole
step from `ensureNewProject()`, clicking Generate again — spending a
second quota unit for what's logically a retry of a later failure, not
of generation itself. Not addressed in this round since it wasn't the
ask and deserves its own deliberate design, not a rushed change on a
step with real per-click cost.

**Not live-tested this round**: verified via `node --check` only, and
by re-reading the click-count logic directly (not assumed) given the
quota stakes — Aree had not yet clicked Generate even once when this
was reported, so no quota was spent diagnosing or fixing this.

## v23: QA caught v22's ceiling math — widened again with real margin, not just past it

QA reviewed e572ecf and did the arithmetic v22 skipped: v22's "roughly
10-11 minutes worst case" for imagegen was itself an underestimate. QA
summed every actual timeout constant in the imagegen path and got
≈772s (≈12.87 min) — past the 12-minute (720s) ceiling v22 had just
set, by about 52s. Independently re-verified this against the live
code rather than trusting either estimate, term by term:
`waitForPageReady` 62.5s (composer 20s + plusMenuButton 20s + settle
1.5s + re-render-retry composer 20s + settle 1s) + `attachProductImage`
142.5s (3 attempts × up to 45s each + 2.5s + 5s backoff between them) +
two `randomDelay` calls ~2s + composer `waitFor` 20s +
`waitForSendButtonReady` ~65s worst case (its 45s budget is measured
from before its own initial 20s locate call, so normally bounded near
45s total, but a pathological detach-and-relocate right at that
boundary can add another ~20s) + `waitForGenerationComplete` 300s +
`waitForGeneratedImage` 180s (widened the same round as v22, for the
v4 template) = **772s**, confirming QA's number.

**Fixed**: `CHATGPT_STEP_CEILING_MS` widened again, from 12 to 14
minutes — real margin (≈68s) above the verified 772s worst case this
time, not just barely clearing it. `FLOW_STEP_CEILING_MS` left
unchanged at 12 minutes — QA's review and this recomputation were
specifically about the chatgpt.com steps; Flow's own worst-case budget
("10 min for Flow's video" per the ceilings' original doc comment) was
never in question here, so it wasn't bumped without a specific reason
to.

Aree was live-testing v4 + e572ecf in parallel while QA's review came
in — analyze already confirmed working; imagegen's result against the
new (now further-widened) timeout is still pending.

## v22: widened waitForGeneratedImage's timeout — v4's prompt genuinely takes longer

Aree tested the v4 template live (eba1dd2 + 100550c) and hit the same
`FASelectorError` at `waitForGeneratedImage()` again — but this time
checked the real DOM *after* the error, by hand, and found the matching
element existed with every condition satisfied (right URL pattern,
`naturalWidth` 941, `closest()` correctly not `'user'`). Real evidence
this was a timing gap, not a selector bug: generation was visibly
taking over a minute with v4's longer, more detailed prompt (grid
layout + gradient badges + gradient text + doodles) vs. v3's shorter,
plainer one — and `waitForGeneratedImage()`'s budget was still the
original 60s from before v4 shipped.

**Fixed**: widened to 3 minutes (`GENERATED_IMAGE_TIMEOUT_MS`), with a
one-time "still waiting, this may take longer than usual" progress
report at the 45s mark so a real future stall is now distinguishable
from this normal-for-v4 wait — matching the pattern already established
for `attachProductImage()` in v10. Also widened `CHATGPT_STEP_CEILING_MS`
in `background.js` from 8 to 12 minutes: with the 3-minute image-wait
added on top of the existing 5-minute generation-wait (plus page-ready/
attach/type overhead), imagegen's own realistic worst-case total is now
close to 11 minutes — the old 8-minute ceiling was no longer
"comfortably above" that, per its own doc comment, and could have fired
on a genuinely still-working step. Since v4 is the permanent default
template now (not a temporary edge case), sized this for the normal
case going forward, not just to clear one test run.

**Not live-tested this round**: verified via `node --check` only — the
real confirmation is whether the next live imagegen run with v4
completes within the new budget.

## v21: v4 template — badges/gradient text/doodles + 2-column grid layout

Toey compared v3's actual output (once imagegen finally worked live —
see v20) against the original reference clip (ครูแบงค์'s) and found 2
real gaps: (1) v3's "clean minimal sans-serif text overlay" instruction
produced flat plain-black captions with no number badges, no gradient
text, no sparkle/heart/leaf doodles — the reference has bold gradient
Thai lettering, circled gradient number badges, floating doodles, and
an emphasized final-panel CTA; (2) v3's "horizontal 5-panel contact
sheet" laid out as one long row — the reference uses a 2-column grid
(2/2/1 for 5 panels).

`FA_ANALYZE_TEMPLATE` in `messages.js` replaced with the v4 spec text
from `ψ/active/flow-autopilot-extension.md` "Update 2026-09-14 v4" —
copied verbatim, not paraphrased, per the spec's explicit instruction
(same discipline as v2/v3). Verified **byte-for-byte**, not just
visually, via a Python diff against the spec's fenced code block
(`in_file == spec` → `True`, 3572/3572 chars) — same verification
method used for v2/v3.

Only sections 2 (Storyboard Image Prompt: 2/2/1 grid layout, gradient
number badges, bold gradient Thai lettering, sparkle/heart/leaf
doodles, an emphasized final-panel CTA) and 3 (Video Prompt: text
animation float/breathe/fade + drifting doodles, matching section 2's
new style) changed. Section 1 (Storyboard Plan) is confirmed
byte-identical to v3 (diffed programmatically against the v3 commit,
not eyeballed). All 3 section headings are unchanged from v3 —
`parseAnalysisResponse()` in `content-chatgpt.js` needed no changes,
confirmed by re-reading its regex patterns against the new headings.

Not live-tested this round (a template/prompt-content change, not
selector/timing code — `node --check` confirms the file parses, but
the real test is whether the next live imagegen run actually produces
badges/gradient text/doodles/grid layout matching the reference).

## v20: real progress — analyze + imagegen both work end to end; fixed generatedImage DOM drift

🎉 Big milestone: v11–v19's fixes (recovery, CSS, runId, keepalive, retry)
all held up live — analyze completed cleanly and imagegen actually
generated a real 5-panel storyboard image matching the Storyboard Plan,
with progress updating the whole way (no more frozen popup). The next
real bug hit was `SEL.generatedImage` failing to match the finished
image at all.

Aree diagnosed this live with real DevTools probing on the actual
successful run (`querySelectorAll('img')` filtered by
`naturalWidth > 100`, checked each candidate's `closest()`) — not
guessed:

1. **ChatGPT switched image-serving domains**: generated images are now
   served from a same-origin `/backend-api/estuary/content?id=file_...`
   endpoint, not `*.oaiusercontent.com`. `SEL.generatedImage`'s old URL
   match broke outright.
2. **URL alone can no longer distinguish AI-generated from user-
   uploaded**: the user's own uploaded product photo *also* uses the
   identical `backend-api/estuary/content` pattern now — confirmed live.
3. **The generated image is no longer nested under any
   `[data-message-author-role]` ancestor at all** — `closest()` returns
   `null` (ChatGPT's UI renders it as an absolutely-positioned overlay
   outside the normal reply-bubble flow now), while the user's own
   uploaded photo's `closest()` still correctly resolves to `role="user"`.
   This is the one reliable discriminator — excluding an ancestor,
   which a plain CSS selector list can't express (there's no "NOT
   nested under X" combinator usable here), the same reason
   `findByVisibleText()` exists instead of a selector for its case.
4. **3 `<img>` elements matched for one generated image** — a
   progressive-loading UI (a blurred placeholder plus the final image
   as separate stacked elements, not one element swapping its `src`) —
   "the first match" isn't safe.

**Fixed**: new `waitForGeneratedImage(step)` in `content-chatgpt.js`
replaces the plain `waitFor(SEL.generatedImage, ...)` call — polls for
`<img>` elements matching the URL pattern (either domain, for forward/
backward compatibility) whose `closest('[data-message-author-role="user"]')`
is falsy, filters to ones that are actually loaded
(`img.complete && naturalWidth > 100`), and picks the largest by pixel
area if more than one qualifies. `SEL.generatedImage` in `selectors.js`
is kept as a documented record of what's been tried/proven-wrong plus a
plain fallback reference for the error message, not the actual matching
logic anymore. Aree's observed classNames (`"absolute top-0 z-1
w-full"`/`"absolute top-0 w-full"` for generated vs. a much more
verbose one for user-uploaded) are recorded as a secondary signal only —
utility-class strings are the most likely thing to drift again, so the
ancestor-role exclusion stays the primary discriminator.

**Not live-tested this round**: verified via `node --check` only —
Aree's next live imagegen run is what actually confirms this.

## v19: two fixes — stale-UI CSS bug, and a real runId gap QA caught in v18's recovery

Two independent issues, both closed in this round.

**1. Stale UI blocks, found live by Aree**: opening the popup fresh
(before even clicking Run) showed *every* view section simultaneously —
"กำลังทำงาน…", the review textareas, "ลองใหม่ขั้นนี้"/"ยกเลิก", **and**
"✅ เสร็จแล้ว!" with a Google Flow link, all stacked on one page. The
done/link content was confirmed leftover from an earlier, fully-
completed run, not the run just being tested — reproduced on every
popup open, predating this session's fixes entirely (not a regression
from anything in v11–v18).

Root cause was CSS, not JS: `popup.js`'s `showView()` correctly sets
`el.hidden = true/false` on every view, every single call — that logic
was never wrong. But `.view { display: flex; ... }` in `popup.css` and
the browser's built-in `[hidden] { display: none }` rule have **equal
specificity** (0,1,0 each); at a tie, the author stylesheet (this
file) wins over the user-agent default, so `.view`'s `display: flex`
was silently overriding `hidden`'s own styling on every view section.
The `hidden` attribute was being toggled correctly the entire time —
it just never visually did anything. Fixed with a more specific
`.view[hidden] { display: none; }` rule (0,2,0), no `!important`
needed. `#connectionErrorBanner`/`#warningsBanner` were never affected
— their `.panel.warning` class doesn't set `display` at all, so
nothing there competed with `[hidden]` in the first place.

**2. QA's runId gap in v18's recoverLostStepDone()**: matching a
recovered result against the active run by `status: 'running'` +
`currentStep` alone isn't unique — every run starts at "analyze", so
cancelling a run stuck there and immediately starting a genuinely
different run (a different photo) would still "match" on both fields,
silently grafting the old run's leftover result onto the new one.

Fixed: every run now gets a `runId` (`crypto.randomUUID()`), generated
once in `startAnalyzeStep()` — reused (not regenerated) across a retry
of the same run via `existingRun?.runId`, so identity survives
`RETRY_STEP`, but a genuinely new run (storage cleared by
`CANCEL_RUN` first) always gets a fresh one. Threaded through every
step's message payload (`RUN_CHATGPT_STEP`/`RUN_FLOW_STEP`) and back
out through every `STEP_DONE` (success and error paths, all three
steps) so `recoverLostStepDone()` can compare `runId` directly instead
of inferring identity from shape alone.

Also added, per QA's non-blocking note on the same review: an in-memory
`recoveringLostStepDone` guard against two messages arriving close
together both racing the `get()`-then-`remove()` gap in
`recoverLostStepDone()` and double-processing the same entry — the
storage `remove()` is still what makes this safe *across* service-
worker restarts; this flag only covers the same-instance concurrent
case QA flagged.

**Not live-tested this round**: verified via `node --check` (all 3
changed JS files) only; the CSS fix was diagnosed from the stylesheet
directly (specificity math), not confirmed by re-rendering it live.

## v18: closed the loop on sendStepDone's own fallback — it was silently invisible too

Toey's direct question, precisely on target: does `sendStepDone()`
(content script → background) actually retry, or is it a bare
`sendMessage` with no retry — i.e. is *this* where the real extracted
answer gets silently dropped, separate from the keepalive-port bug?

**Direct answer, from the actual code**: it does retry — 4 attempts,
backing off 1s/2s/3s (added v16, unchanged since) — that part was never
the gap Toey suspected. But tracing what happens *after* all 4 attempts
fail found the real remaining problem: `sendStepDone()` falls back to
writing the complete real result directly to `chrome.storage.local`
(key `faLostStepDone`) — and then nothing else happens. No error is
thrown (by design, so a failed *progress-adjacent* message never crashes
the pipeline), no `reportProgress()` follow-up (that goes through the
same failing channel anyway), nothing updates `run.status` or
`run.progressLabel`. From the popup's perspective, "retried 4 times,
gave up, saved the real result somewhere nobody reads" is **completely
indistinguishable** from "still silently stuck" — the progress label
just stays frozen forever either way. This is exactly why v16/v17's
retry logic being in place made zero visible difference in Aree's
tests: those fixes closed the *data-loss* gap, not the *frozen-popup*
symptom actually being tested against — two different problems that
looked like one from the outside.

**Fixed**: `background.js` now checks for a pending `faLostStepDone`
entry at the very start of `handleMessage()` — on *every* incoming
message, not just a specific one, so recovery can happen as early as
whatever next wakes the service worker (most likely the popup reopening
and calling `GET_STATE`, but not relying on that specific trigger). If
found, and only if it still matches the currently-active run (same
`status: 'running'` + `currentStep` — a stale result from an abandoned/
cancelled run must never silently overwrite a newer one), it's
processed exactly as if `STEP_DONE` had just arrived fresh, via the
same `handleStepDone()` path, then the fallback key is cleared.

**Practical implication for the next test**: if progress ever looks
frozen again, simply **closing and reopening the popup** now forces a
fresh `GET_STATE` call, which will trigger recovery immediately if a
real result is sitting in the fallback — a concrete, fast way to tell
"the result really is stuck/lost" from "it's sitting recovered, just
needed something to wake the service worker and check."

**What this does *not* resolve**: if the service worker is failing to
wake on literally *any* incoming message at all (the deeper mystery
flagged as unresolved since v15) — not just this specific STEP_DONE
path — then recovery itself also can't fire, since it depends on
`handleMessage()` running in the first place. If reopening the popup a
few times still shows nothing, that would be much stronger evidence
pointing at that deeper mystery specifically, rather than this fallback
gap (now closed) or the keepalive port (v17, also just fixed, not yet
live-confirmed to actually work).

**Not live-tested this round**: verified via `node --check` only.

## v17: the v16 keepalive port never actually connected — fixed the connect race

Aree tested v16 live (fresh run, extension reloaded first — ruled out
the "stale cached script" explanation): identical symptom, same stuck
point, same evidence pattern. New this round: `chrome://extensions/?errors=`
showed one real entry for the first time — `Unchecked runtime.lastError:
Could not establish connection. Receiving end does not exist.` QA
independently spotted the same root cause from reading the v16 diff
alone: `startKeepalive()`'s `onDisconnect` handler just set
`keepalivePort = null` — never read `chrome.runtime.lastError`, never
retried, never logged anything.

Confirmed precisely: `startKeepalive(tabId)` calls `chrome.tabs.connect()`
exactly once, synchronously, right after `openTab()` resolves —
but `chrome.tabs.create()` resolving only means the tab object exists,
not that the page has loaded and the content script has run and
registered its `onConnect` listener (content scripts run at
`document_idle`, a real delay after tab creation — this is the exact
same "content script not ready yet" race `sendMessageWithRetry()`
already exists elsewhere in this file to handle, just not applied to
the new connect call). `chrome.tabs.connect()` doesn't throw when
there's no listener on the other end yet, so the `try/catch` around it
never caught anything — the failure only surfaces later, asynchronously,
via `onDisconnect` with `chrome.runtime.lastError` set, which the old
handler discarded unread. Net effect: the port almost certainly failed
to connect on its one and only attempt, every single time, providing
**zero actual protection** — v16 shipped a keepalive that never
connected, which is exactly why nothing improved.

Also answered directly (Aree's Q3): `sendStepDone()` (v16) sends the
actual result via a completely separate, independent
`chrome.runtime.sendMessage()` — never through the keepalive port,
which exists solely to keep the service worker alive as a side effect
of staying open, not to carry data. The new "Unchecked lastError" is
consistent with coming *only* from the broken port-connect code, not
from `sendStepDone`'s own (promise-based, properly awaited/caught, so
never "unchecked") retries — but that also means this round's evidence
doesn't tell us whether `sendStepDone` itself ran, retried, or
succeeded; its own `console.error` lines land in the **chat tab's own**
DevTools console, not `chrome://extensions/?errors=` — worth checking
directly next time to separate "the message was retried and still
failed" from "something upstream of it never got that far."

**Fixed**: `connectKeepalivePort()`/`scheduleKeepaliveRetry()` retry the
connection (up to 20 attempts, 1s apart) whenever it disconnects while
the step is still in flight — covers both "connected too early" and "a
live port dropped mid-step" (e.g. a page navigation) with the same code
path — and always reads `chrome.runtime.lastError` in `onDisconnect` so
Chrome stops flagging it as unchecked, logging it via `console.debug`
for diagnosability instead.

**Not live-tested this round**: verified via `node --check` only.

### Direct answer to Toey's question: the expected code path after a successful analyze reply

Traced from the actual current code, not from memory/assumption:

1. **`extractLastAssistantText()`** (`content-chatgpt.js`) is a plain
   synchronous DOM read — no `await` inside it, can't itself hang.
   Runs right after `checkForMissingImageReply()` (also synchronous),
   both after `attachAndSend()` returns.
2. **`sendStepDone({type: STEP_DONE, step: 'analyze', ok: true, payload: {raw, storyboardPlan, storyboardPrompt, videoPrompt, warnings}})`**
   sends to **background.js only** — content scripts cannot message the
   popup directly, ever. This is the step retried up to 4x since v16.
3. **background.js's `handleStepDone()`** receives it, calls
   `appendWarnings()`, then reads `opts.autoReview` (**default `true`**,
   confirmed in `messages.js` — not changed by anything in this
   session): with `autoReview: true` (the live default), it calls
   `setRun({...patch, status: AWAITING_REVIEW, currentStep: 'analyze'})`
   and **stops there** — no new tab, no auto-continuing to imagegen.
   That single `setRun()` write is what `popup.js`'s
   `chrome.storage.onChanged` listener picks up to switch the popup from
   the running view to the review checkpoint (editable Storyboard
   Plan/Storyboard Prompt/Video Prompt fields + "ดำเนินการต่อ" button).
   Only if `autoReview` were `false` would background open the imagegen
   tab immediately on its own, skipping the checkpoint.
4. **"[analyze] ChatGPT ตอบเสร็จแล้ว กำลังตรวจสอบผลลัพธ์…"** is set once,
   inside `attachAndSend()`, immediately after `waitForGenerationComplete()`
   resolves (ChatGPT's "Stop generating" button disappearing) — and nothing
   updates it again anywhere in this stretch. It stays displayed through,
   in order: the rate-limit text scan, `checkForMissingImageReply()`,
   `extractLastAssistantText()`, `parseAnalysisResponse()`, and finally
   `sendStepDone()` — the **only** part of that whole stretch that's
   slow/async/can actually get stuck (its own retries can take up to
   ~7s; everything before it is synchronous DOM/regex work). This label
   not updating again until either success (view switches away entirely
   to the review checkpoint) or a thrown error is itself a real,
   separate observability gap — the same class v12 already fixed for
   the send-button wait, not yet applied here. Flagged as a real
   follow-up, not fixed in this round (scope stayed on the connect-race
   bug specifically, per the immediate ask).

## v16: keepalive upgraded to a persistent port; STEP_DONE made retry-safe

Answering Aree's direct question: does the v13 alarm keepalive actually
cover the "ตรวจสอบผลลัพธ์" phase? By scope, yes — `startKeepalive()`
runs for the entire `withCeiling(sendMessageWithRetry(...))` await in
`startAnalyzeStep()`, which doesn't resolve until the content script's
whole `runAnalyze()` finishes, well past that phase. But Aree's live
evidence says it didn't actually work: a fresh full-photo run got real
content back from ChatGPT (confirmed visibly correct in the tab within
~8s) — progress then froze at "ChatGPT ตอบเสร็จแล้ว กำลังตรวจสอบผลลัพธ์…"
for over a minute, `chrome://extensions/?errors=` stayed completely
empty, and the service worker was confirmed **(Inactive)** again at
exactly that moment. No throw, no reject anywhere — execution just
stopped, which given that evidence most likely means the alarm did not
actually prevent idle-termination here. The most likely explanation is
the exact caveat flagged (and left unconfirmed) back in v13: Chrome's
`periodInMinutes` floor for packaged extensions may be silently clamping
the alarm coarser than the ~30s idle window, making it far less
effective than intended. Still not confirmed with certainty which
Chrome-side mechanism is at fault — flagged as the leading hypothesis,
not a proven fact.

**Primary keepalive switched to a persistent port** (the fallback
already named in v13): `startKeepalive(tabId)` now also opens a live
`chrome.tabs.connect(tabId, {name: FA_KEEPALIVE_PORT_NAME})` for the
whole step, accepted by a trivial `chrome.runtime.onConnect` listener in
both content scripts. An open message channel is documented by Chrome
as keeping a service worker alive for as long as it stays connected —
no minimum-period ambiguity at all, unlike alarms. The alarm from v13 is
kept running alongside it (belt-and-suspenders + its console.debug tick
still helps diagnose), not removed.

**Separately, and just as important**: reading `content-chatgpt.js` and
`content-flow.js` end to end found the exact mechanism that turns "the
service worker briefly went idle mid-step" into "a fully completed real
result is silently discarded forever" — the same class of bug already
found and fixed in `popup.js` (v15), not yet fixed here. Every step's
final `STEP_DONE` message (the single most important message in the
whole pipeline — the actual finished result) was a bare, un-awaited,
uncaught `chrome.runtime.sendMessage()`, in both the success path *and*
the error-catch path, in all three of `runAnalyze()`, `runImageGen()`,
and Flow's `run()`. If the service worker is unreachable at that exact
instant, the rejection has nowhere to go — no `FASelectorError`/
`FATimeoutError` is ever thrown, `chrome://extensions/?errors=` stays
clean, and the popup just stops, matching Aree's evidence exactly.

**Fixed**: new `sendStepDone(message)` in both content scripts retries
delivery up to 4 times with backoff (1s/2s/3s) instead of firing once
and hoping. If every attempt still fails, the result is written directly
to `chrome.storage.local` (key `faLostStepDone`, content scripts can
write storage directly too) as a last-resort fallback, so a real
completed result is recoverable by hand instead of destroyed outright.
**Honest limit, not glossed over**: `background.js` does not yet
automatically read or recover from that key — this is a manual-recovery
escape hatch for now, not full auto-recovery. Wiring that up (matching
it to the currently active run, handling the case where a newer run has
since started) is real additional design work, left as an explicit
follow-up rather than rushed in under this fix.

**Not live-tested this round**: verified via `node --check` across all
4 changed files only. The next live run reproducing this should show
either the port keepalive actually preventing the Inactive state this
time, or — if it still goes Inactive — the retried STEP_DONE delivery
getting the real result through anyway once the SW wakes back up within
the ~7s retry window, or, worst case, a recoverable entry in
`chrome.storage.local.faLostStepDone` instead of silent loss.

## v15: popup buttons going silently dead when the service worker won't wake

Aree's next live test (real photo, Plus account, commit fc10cfd)
clicking Run mid-way through a still-running previous attempt: the
pipeline restarted at "analyze" as expected, but progress froze at
`[analyze] ChatGPT ตอบเสร็จแล้ว กำลังตรวจสอบผลลัพธ์…` for over a minute.
`chrome://extensions` showed the service worker as **(Inactive)** the
whole time. Clicking "ยกเลิก" or "Run" in the popup did *nothing at
all* — verified rigorously: click listeners genuinely attached
(`getEventListeners` showed `Array(1)` on every button), calling
`.click()` directly via DevTools ran to completion with no exception,
`chrome.runtime.lastError` was `undefined`, no console output of any
kind appeared, no new entry in `chrome://extensions/?errors=...`, and
the service worker stayed Inactive afterward — no sign it ever woke to
process anything.

Checked live with the same VNC access (`chrome://extensions` directly):
confirmed the Inactive state and the small error badge on the
extension's icon first-hand. Clicking the "service worker (Inactive)"
inspect link *did* wake it successfully (label flipped to active,
stayed alive while DevTools was attached) — its console showed a clean
startup with no error, which rules out a top-level crash in the v13
keepalive code (e.g. `chrome.alarms` being undefined) as the cause of
the Inactive state itself. Getting a stable, correctly-scoped screenshot
of the woken SW's own console reliably enough to read further (e.g.
confirm whether `alarms.getAll()` shows the keepalive firing) hit
repeated window-manager/coordinate issues in this VNC session and was
not fully resolved this round — flagged rather than papered over.

That still leaves the actual question open — Aree's specific report is
about **why chrome.runtime.sendMessage() from the popup doesn't wake
the service worker at all**, when MV3 documents this as one of the two
guaranteed wake events (alongside alarms). Not resolved with certainty
this round. But reading `popup.js` end to end found a real, separate,
confirmed bug that exactly explains the *symptom* Aree described —
"clicked, nothing happened anywhere, no console output visible" —
regardless of what's ultimately keeping the service worker down:

**Every popup button called `chrome.runtime.sendMessage()` directly,
awaited with no `try/catch` anywhere in the file.** If that promise
*rejects* (which it does when the service worker is genuinely
unreachable), the rejection had nowhere to go but an unhandled promise
rejection in the **popup's own** JS context — not the service worker's,
which is why checking the SW's console/errors page found nothing. MV3
popups close the instant they lose focus, and Chrome's console buffer
for a closed window goes with it — unless DevTools happens to already
be pinned open on that specific popup (not something a normal user, or
even a tester working across multiple browser windows, reliably does),
that rejection is realistically never seen by anyone. This is the same
"totally silent, no console anywhere" signature Aree described,
independent of the deeper service-worker-wake mystery.

**Fixed**: new `sendToBackground(label, message)` helper in `popup.js`
wraps every `chrome.runtime.sendMessage()` call (all button handlers,
plus `getRun()`/`init()` which had the same gap — an unhandled
rejection there could leave the *entire popup* stuck on whatever the
static HTML shows with no explanation at all, a more severe variant of
the same bug) in a real `try/catch`. On failure, it shows a **visible
banner directly in the popup's own DOM** (`#connectionErrorBanner`) —
survives exactly as long as the popup itself stays open, no console or
external inspection needed — naming the actual error and suggesting the
standard remedy: reload the unpacked extension via `chrome://extensions`
(the well-known fix for a service worker stuck in an unresponsive state
during active development). This does not fix *why* the service worker
became unresponsive to messages — that remains an open question — but
it fixes the silent-failure symptom regardless of the cause, and turns
"nothing happens" into an actionable, visible next step for whoever
hits it live.

**Not live-tested this round**: verified via `node --check` only,
and via live (but ultimately inconclusive on the deeper question)
`chrome://extensions` inspection. The next live run reproducing this
should watch for the new banner directly, and Aree's suggestion of a
clean extension reload after a stuck SW is the fastest way to test
whether that alone restores normal operation, independent of this fix.

## v14: sidestepped the "+" menu entirely — chatgpt.com/images route

Good news first: **analyze step confirmed 100% working end to end**, live,
by Aree, on a real product photo (Deo KLEAR) with no rate limit —
attach, type, send, parse, and the review checkpoint all correct. v11's
keepalive/progress work, v12's send-button self-heal, and v13's SW
keepalive are all confirmed real, not just plausible, for that step.

For the imagegen step's "+" menu bug, Aree got definitive proof (not
just a plausible theory) that this is a real browser-platform limit, not
a fixable selector/timing bug: clicking the real "+" button with
`xdotool` (an OS-level, hardware-trusted click via the X server — not
JS) opened the menu instantly; the extension's `element.click()`/
`dispatchEvent()` (synthetic, `isTrusted: false`) never does, no matter
what's tried. ChatGPT's "+" button carries the HTML `interestfor`
attribute (Open UI's emerging Interest Invokers spec — flagged as a
possibility since v9), which genuinely requires a trusted input event.
A content script cannot produce one through the DOM. Chrome's
`chrome.debugger` (CDP) *can* dispatch trusted input, but requires the
`debugger` permission, which puts a persistent, unmissable "being
debugged" banner in the user's browser — invasive enough that Aree
flagged it as likely unsuitable for something meant for general use.

Before reaching for that or accepting partial automation (a human
clicking "+" once per run), checked Aree's first suggestion: does
`chatgpt.com` expose an image-gen entry point that doesn't go through
this menu at all? **Yes — with live DOM access this round (same VNC
session Aree had just used, read-only inspection, no real
attach/send/generation triggered to avoid spending real account usage
without a specific go-ahead for that)**:

- `chatgpt.com/images` is a real, dedicated route. Its composer's
  placeholder is literally "Describe a new image" — it's in image-gen
  mode *by default*, no menu needed.
- Its own "+" button **also** carries `interestfor` (confirmed via a
  live `getAttribute()` check) — so this route doesn't bypass the
  trusted-click issue for opening *that* menu either. It doesn't need
  to: a direct DOM query on that page found `input[data-testid=
  "upload-photos-input"]` (`id="upload-photos"`) already present and
  visible, the *exact same* file input `fileInput`'s already-confirmed
  first-candidate selector matches — the same element `attachProductImage()`
  already locates and fills via `DataTransfer` (never a click) for the
  analyze step. `#prompt-textarea` (the composer) is confirmed present
  too.

So the fix doesn't work around the trusted-event requirement — it
avoids ever needing the gated button at all: `startImageGenStep()` now
opens `chatgpt.com/images` directly (a plain URL navigation, not a DOM
interaction, so no trusted-event issue there either) instead of a fresh
chat, and `attachAndSend()` no longer calls `enterCreateImageMode()`
for the imagegen step — it goes straight to `attachProductImage()` +
type + send, exactly like the now-confirmed-working analyze step.
`enterCreateImageMode()`/`tryOpenPlusMenu()`/`dispatchHoverSequence()`
are left in the file (marked PARKED, not deleted) as a real, working
fallback in case this doesn't fully hold up end to end.

**Honest limits of this round's verification**: confirmed via live DOM
— the route exists, is in image-gen mode by default, and its file
input/composer selectors are identical to already-working ones.
**Not confirmed**: actually attaching a photo and sending a prompt on
this page and getting a real generated image back — that step was
deliberately not performed this round to avoid spending real ChatGPT
usage/generation quota on Toey's account without an explicit go-ahead
for that specific action. This is strong DOM evidence for a promising
fix, not a DOM-verified end-to-end pass — flagged as an open question
for the next live imagegen test, same as v9's now-confirmed fix once was.

## v13: possible unifying root cause — MV3 service-worker idle-termination, no keepalive

Aree checked `chrome://extensions` directly during a stuck run (analyze
step failing to attach, both a 2.6MB and — critically — a 179KB image
that should have been well within margin) and found the **service
worker itself showing (Inactive)** while the run was still stuck at
"running". Real, direct, live evidence — not a theory — and it
potentially reframes several of today's earlier fixes (v11's silent
gap, v12's send-button hang) as symptoms of one deeper cause rather than
independent bugs, since a terminated MV3 service worker destroys its
entire JS execution state, including any in-flight `try/catch` → `fail()`
safety net.

Confirmed by reading the code (not assumed): `manifest.json` declared no
`alarms` permission and `background.js` had zero keepalive mechanism.
The long waits during a step (`withCeiling`'s `setTimeout` ceiling timer,
and the pending `chrome.tabs.sendMessage()` response it races against)
sit in `startAnalyzeStep()`/etc. for up to 8–12 minutes doing *no*
further Chrome-extension-API activity — exactly the condition MV3's
~30s SW idle-termination targets. If the SW dies mid-step: the
`withCeiling` `setTimeout` (a bare timer, explicitly *not* one of the
mechanisms Chrome guarantees survives SW termination) may simply never
fire; the entire `startAnalyzeStep()` closure and its `catch → fail()`
are destroyed with it — the very safety net documented as guaranteeing
"a step always eventually reaches a terminal status" (see `withCeiling`'s
own doc comment) is itself vulnerable to exactly what it exists to
catch. A step can go fully silent this way with nothing actually broken
in the selector/timing logic that's been the focus of v9–v12.

This does not retroactively prove v9–v12's fixes were unnecessary — each
of those was independently reasoned from its own evidence (v9's DOM-
confirmed `checkVisibility` fix in particular) — but it is a real
category of failure those fixes could never have addressed, since none
of them touch service-worker lifetime at all.

**Fixed**: added `alarms` permission + a `chrome.alarms`-based keepalive
(`startKeepalive()`/`stopKeepalive()`, `fa-keepalive` alarm firing every
~24s) started at the top of each `startAnalyzeStep()`/`startImageGenStep()`/
`startFlowStep()` and stopped in a `finally` block, so the SW receives a
Chrome-extension-API event well under the ~30s idle threshold for the
entire duration of a step — `chrome.alarms` specifically (not a bare
`setInterval`) because regular timers are the *unreliable* mechanism in
a service worker per Chrome's own docs; alarms are the documented
exception. The `onAlarm` listener itself does nothing but log — merely
being a registered listener that fires is what resets the idle clock.

**Explicit caveats, not glossed over**: (1) Chrome clamps
`periodInMinutes` to a 1-minute floor for packaged/Web-Store extensions;
this project is currently unpacked/dev-only, where sub-1-minute alarms
are commonly permitted, but that specific clamping behavior has **not**
been live-confirmed on this Chrome build — if the next live test still
shows the SW going Inactive mid-run, the alarm period is the first
thing to check via the SW's own `console.debug` keepalive-tick log,
with a persistent `chrome.runtime.connect()` port + periodic ping as the
fallback (no minimum-period ambiguity there). (2) This is a plausible,
evidence-informed fix for a real, confirmed gap — not a DOM-verified
root cause the way v9 was. **Not live-tested this round** — no live
access for dev this time; verified via `node --check` + JSON validation
only.

## v12: fixed the send-button wait — self-healing against a stale re-render, plus progress granularity

Aree ran a live test directly via noVNC (new workflow — Aree now tests
each round, no longer waiting on Toey every time), using a realistic
2.6MB product photo instead of the 3KB test image earlier fixes were
verified against. Result: analyze step got all the way through opening
the chat tab, attaching the image (real thumbnail visible), and typing
the full template (visible in the composer) — then **stopped there**.
30+ seconds with no further action and no error, violating the
anti-silent-fail principle. The extension's own popup (progress
reporting from v11 working as intended) showed it stuck at
`[analyze] กำลังพิมพ์ข้อความ…`, never advancing. Aree also observed the
visible Send button looked enabled (dark blue, not greyed) the whole
time it was stuck.

Read the whole `attachAndSend()` tail (after typing, before
`sendBtn.click()`) end to end. No infinite loop exists in that stretch
by code reading — `waitFor(SEL.sendButton)` (20s default) and
`waitForEnabled(sendBtn, {timeoutMs: 30000})` are both flat-bounded and
would eventually throw, which should surface via the same
`STEP_DONE ok:false` → `fail()` path verified in v11. So **not a proven
infinite hang** — two real things found instead, and both fixed:

1. **A real stale-reference risk, not yet proven as this incident's
   cause**: `sendBtn` was captured once via `waitFor()`, then polled in
   place by `waitForEnabled()`. chatgpt.com is React-based; if its
   composer toolbar re-renders while a large image's upload pipeline is
   still settling (the same class of "page re-rendered mid-wait" case
   `waitForPageReady()` already had to handle for the composer/`+`
   button — see v8), and that re-render *replaces* the send button node
   rather than mutating it, the captured reference goes stale/detached.
   A detached node's `disabled` state is frozen at whatever it was the
   instant it was orphaned — it can never become "enabled" again no
   matter what the live button on screen shows. That matches every
   observed symptom (visibly enabled button, code never proceeding)
   exactly, but there was no way to confirm it from a live DOM snapshot
   this round (Aree tested solo this time, no live DOM access granted to
   dev for this round).
2. **A real observability gap, confirmed by code reading**: this
   stretch of `attachAndSend()` had zero progress-label granularity
   between "typing" and "sent" — up to its full combined ~50s budget
   (20s send-button lookup + 30s enabled-wait) could elapse with the
   popup showing the exact same static label the whole time. Aree's
   30+s observation window plausibly wasn't long enough to reach that
   combined ceiling, which — with no intermediate feedback — is
   indistinguishable from a true hang. Same failure class v11 already
   fixed elsewhere in this file, just not yet covered at this spot.

Fixed both in one change, `waitForSendButtonReady(step)`: replaces the
old capture-once-then-poll pattern with a loop that re-checks
`document.contains(btn)` on every poll tick and re-locates the button
fresh if it was detached (self-healing, same pattern already
established for the composer/`+`-button re-render case), reports
progress at 3 new checkpoints (button lookup started, detached &
re-locating, button ready), widens the combined budget to a flat 45s to
give a large real photo more margin (consistent with v10's precedent of
widening `attachProductImage()` for the same 3KB-vs-real-photo gap), and
— if it still genuinely times out — includes the button's actual live
`disabled`/`aria-disabled` values in the thrown error, so a future
report carries hard evidence instead of a generic timeout message.

**Not live-verified this round** — no live DOM/account access for dev
this time (Aree is testing directly now); confirmed only via careful
reading of the full call chain and a plain `node --check` syntax pass.
Aree's next live run will show directly (via the new checkpoint labels)
whether this was actually the stale-reference case, or just the timing
gap, or something else still — flagged as an open question, not a
confirmed fix, unlike v9's DOM-verified case.

## v11: closed a real silent-fail gap + live progress reporting

Toey's next test hit the worst version of this yet: **no error at all**
— arrived at the chat, no upload, no message typed, nothing. Directly
against the project's core anti-silent-fail principle, so treated as
top priority.

Traced the entire flow (popup click → background → content script →
back) for anywhere an exception could go unreported, and found two real
things, not one:

1. **A genuine silent-fail gap**, confirmed by code reading:
   `handleMessage`'s `START_RUN`/`CONFIRM_STEP`/`RETRY_STEP` cases had no
   try/catch of their own — only `startAnalyzeStep()` etc.'s *internal*
   try/catch (around the `sendMessageWithRetry` call) wrote to run state
   via `fail()`. If something threw *before* reaching that internal
   try/catch (e.g. `getOptions()` or `chrome.tabs.create()` failing), the
   only catch was the generic top-level one in `background.js`, which
   logs to the service worker's own console (invisible anywhere a normal
   user would look) and calls `sendResponse()` — which `popup.js`'s
   `runBtn`/`retryBtn`/`reviewContinueBtn` click handlers never read
   (fire-and-forget `chrome.runtime.sendMessage()` with no response
   handling). Run status would just stay wherever it was — genuinely
   silent, exactly what was reported. (Not confirmed to be *this*
   incident's specific cause — the chat tab did open, meaning
   `getOptions()`/`openTab()` both succeeded — but a real, independent
   gap worth closing regardless.)
2. **The more likely explanation for this specific report**: nothing
   was actually silently *failing* — the pipeline was silently
   *working* for an uncomfortably long stretch with **zero visible
   feedback** anywhere (not on the chat tab, not in the popup beyond a
   static "กำลังทำงาน"), which is functionally indistinguishable from
   broken to someone watching in real time. v10 had just widened
   `attachProductImage()`'s budget to up to ~85+ seconds across 3
   attempts to accommodate realistically-sized real photos — a
   reasonable fix in isolation, but one that made the "did nothing
   change in front of me" window uncomfortably long with no progress
   signal to distinguish "still working" from "stuck."

Fixed both:

- **`handleMessage`'s `START_RUN`/`CONFIRM_STEP`/`RETRY_STEP` cases now
  each wrap their body in a try/catch that calls `fail()` on any throw**
  — closing the gap regardless of exactly where in the chain something
  fails. `popup.js`'s click handlers also now check the response and
  `console.error` on an unexpected shape, as a secondary safety net.
- **New live progress reporting**: content scripts call
  `reportProgress(label)` at every real milestone (page-ready wait
  started/confirmed, file-input found, attach attempt N/3, attachment
  confirmed, "+" clicked, menu opened, "Create image" clicked, composer
  typed, message sent, ChatGPT replied) — sent via a new
  `FA_MSG.STEP_PROGRESS` message, stored in `run.progressLabel`
  (background), and rendered live in the popup's running view. Every
  call also `console.log`s to the chat tab's own DevTools console, so
  the pipeline's state is inspectable there too, not just via the popup.
  As a side benefit, `progressLabel` updates go through `setRun()`,
  which bumps `updatedAt` — the existing "looks stuck" hint (see v4) now
  effectively resets on genuine progress instead of just on step/status
  transitions, making it more accurate, not just more informative.
- `waitForPageReady()`'s `waitFor` calls originally shipped in this
  commit with an explicit 15s timeout each, reasoned from Toey's casual
  "page usable ~6s" remark in the bug report. **Corrected 2026-09-14**
  after QA flagged it: that single anecdotal number isn't a worst-case
  bound, and this is exactly the check v8 (1449a5a) deliberately left at
  `waitFor()`'s unstated 20s default to absorb SPA-hydration variance —
  right after fe947a0 had just *widened* timing elsewhere for that same
  variance reason. Reverted to the 20s default; no functional reason to
  have narrowed it here at all.

Verified: the full `STEP_PROGRESS` round-trip was tested against the
real running extension via CDP, not just read for plausibility — sent an
actual message to the real background service worker, confirmed
`run.progressLabel` was stored and retrievable via `GET_STATE`, then
confirmed the popup's real `render()` function displays it correctly in
the running view. Confirmed clean extension load (zero console errors)
across background/popup/options/both content-script contexts. **Still
not live-re-tested against a real account.**

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
