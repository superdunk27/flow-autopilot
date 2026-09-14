// Flow Autopilot — DOM selector configuration
//
// ChatGPT and Google Flow ship frequent, unannounced DOM/markup changes.
// This file is the SINGLE place to update when a step starts throwing
// "selector not found" errors. Each entry is a *list* of candidate CSS
// selectors tried in order (first match wins) so one small tweak on the
// site's end doesn't have to break automation immediately — but keep the
// MOST SPECIFIC candidate first and the broadest structural one (if any)
// last: `content/content-*.js` flags a match against the last-resort
// candidate as a visible warning (see `FA_UTILS.isLastResortMatch`)
// instead of failing silently, precisely because a broad selector like
// `input[type="file"]` can match the *wrong* file input on a page with
// more than one and nothing about that match looks like a failure.
//
// NOTE: these selectors were written from public DOM inspection at
// scaffold time (2026-09-13) and have NOT been exercised against a live,
// logged-in ChatGPT Plus + custom GPT + Google Flow session (this
// environment has no such session). Treat them as a well-informed first
// draft, not a verified contract. See README.md "Known limitations".
//
// Domain history: Google Flow moved from labs.google/fx/tools/flow to
// flow.google.com (confirmed 2026-09-13 — labs.google/fx/tools/flow now
// 308-redirects there, including every /shared/tool/<id> sub-path).
// manifest.json's host_permissions/content_scripts.matches target
// flow.google.com accordingly.

(function (root) {
  root.FA_SELECTORS = {
    chatgpt: {
      // The hidden <input type="file"> ChatGPT's composer uses for
      // attachments. CONFIRMED live 2026-09-14 (real logged-in session,
      // real product-photo upload + real send + real 3-section response
      // received and parsed correctly end-to-end): the page actually has
      // 5 separate hidden file inputs (#upload-files, #upload-photos
      // [data-testid="upload-photos-input"], #upload-media, #upload-camera,
      // #upload-media-files), each with a different `accept` value.
      // `#upload-photos` (accept="image/*") is the one verified to
      // actually trigger a real upload — kept first. The old
      // `file-upload-input` testid guess never existed on real DOM;
      // removed.
      fileInput: [
        'input[data-testid="upload-photos-input"]',
        '#upload-photos',
        '#upload-files',
        'input[type="file"]',
      ],
      // Chip that appears once an attachment finishes uploading.
      // CONFIRMED live 2026-09-14: the earlier 3 candidates all missed —
      // real markup instead exposes a "Remove file" button whose
      // aria-label includes the filename/index (e.g. "Remove file 1:
      // product.png"), inside a container classed `...group/file-tile...`.
      // Matched by aria-label PREFIX since the full label is dynamic.
      // Still an optional soft signal, not a hard gate (see
      // FA_UTILS.softWaitFor in content-chatgpt.js) — the send-button-
      // enabled check remains the required functional gate, since a
      // second real DOM change could just as easily invalidate this one
      // too.
      attachmentPreview: [
        'button[aria-label^="Remove file" i]',
        '[class*="file-tile" i]',
        '[data-testid="attachment-thumbnail"]',
        '[class*="attachment"] img',
        'button[aria-label*="attach" i]',
      ],
      // The prompt composer (ChatGPT uses a contenteditable ProseMirror div).
      // CONFIRMED live 2026-09-14 — `#prompt-textarea` is exactly right
      // (a real message was typed in and sent through it end-to-end).
      composer: [
        '#prompt-textarea',
        'div[contenteditable="true"][data-id]',
        'textarea[data-testid="prompt-textarea"]',
        'div[contenteditable="true"]',
      ],
      // CONFIRMED live 2026-09-14 — `button[data-testid="send-button"]`
      // is exactly right (aria-label "Send prompt", `.disabled` correctly
      // reflects composer readiness — used to send a real message).
      sendButton: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label*="Send" i]',
      ],
      // The "+" button that opens the composer's attachment/tools menu
      // (Add photos & files / Create image / Agent mode / etc.) — needed
      // for the image-gen step, which per real usage must explicitly
      // enter "Create image" mode via this menu rather than just typing
      // a request in plain text. CONFIRMED live 2026-09-14 —
      // `button[data-testid="composer-plus-btn"]` (aria-label "Add files
      // and more") is exactly right — real DOM query, not yet click-
      // tested through to the "Create image" menu item itself (see
      // README "Known limitations"). The menu item is found by visible
      // text (FA_UTILS.findByVisibleText) rather than a structural guess,
      // since "Create image" as literal button text is far more stable
      // across markup changes than any data-testid/class guess would be.
      plusMenuButton: [
        'button[data-testid="composer-plus-btn"]',
        'button[aria-label="Add photos & files" i]',
        'button[aria-haspopup="menu"][aria-label*="add" i]',
      ],
      // Real bug (2026-09-14): the old code searched the WHOLE document
      // for text matching /create image/i without first confirming a
      // menu had actually opened — a real user saw the "+" click do
      // nothing visible, yet the code proceeded as if it had clicked
      // "Create image", meaning it matched and clicked some unrelated
      // element still mounted (but not actually shown) elsewhere in the
      // DOM. Now required: wait for this container to actually appear
      // before searching inside it for the menu item. Standard ARIA
      // pattern for an open dropdown, not site-specific — should be
      // fairly durable. NOTE: the real plusMenuButton DOM (confirmed
      // live, v5 round) carries an `interestfor` attribute — part of the
      // emerging HTML "Interest Invokers" spec for hover-triggered
      // popovers — so this menu may need a hover sequence, not just a
      // click, to actually open; content-chatgpt.js now tries both.
      menuContainer: ['[role="menu"]'],
      // Searched with FA_UTILS.findByVisibleText, scoped to menuContainer
      // once confirmed open (not matched directly, and no longer
      // document-wide — see menuContainer comment above).
      menuItemTags: '[role="menuitem"], [role="menuitemradio"], button, div',
      // Shown while ChatGPT is still generating a response. NOT yet
      // confirmed against real DOM (during the 2026-09-14 live test the
      // button visibly changed to a stop icon while generating, but its
      // testid/aria-label wasn't queried before generation finished) —
      // still a best-effort guess.
      stopGeneratingButton: [
        'button[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]',
      ],
      // Assistant message turns, in DOM order. CONFIRMED live 2026-09-14
      // — used to extract a real, complete 3-section response, which
      // content-chatgpt.js's real parseAnalysisResponse() then split
      // correctly (parseConfidence: 'labeled', all 3 sections non-empty
      // and clean — verified with the actual response text, not a
      // simulated one).
      assistantMessages: [
        '[data-message-author-role="assistant"]',
        'div[data-testid^="conversation-turn"] [data-message-author-role="assistant"]',
      ],
      // PROVEN WRONG live 2026-09-15 (see README "v20") — ChatGPT
      // switched image-serving domains from *.oaiusercontent.com to a
      // same-origin `/backend-api/estuary/content?id=file_...`
      // endpoint, which the user's own uploaded photo ALSO uses now —
      // URL alone can no longer distinguish AI-generated from
      // user-uploaded. Worse, the generated image is no longer nested
      // under any [data-message-author-role] ancestor at all
      // (closest() returns null — confirmed live via DevTools by
      // Aree), so a plain CSS selector can't express the real
      // discriminator either (which requires *excluding* an ancestor,
      // not matching one). Actual matching logic now lives in
      // content-chatgpt.js's waitForGeneratedImage() instead of a
      // selector list — this array is kept only as a documented record
      // of what's been tried/confirmed-wrong, and a plain-URL/className
      // fallback reference for that function's error message.
      // classNames seen on the 3 real generated-image <img> elements
      // found live (a progressive-loading UI: multiple stacked
      // elements for one image, not one element swapping src):
      // "absolute top-0 z-1 w-full" and "absolute top-0 w-full" — vs.
      // the user's own uploaded photo's very different, verbose
      // className ("max-w-full object-cover object-center overflow-
      // hidden rounded-[1.75rem] w-full h-full max-w-96 max-h-64 w-fit
      // transition-opacity duration-300 opacity-100"). Utility-class
      // strings like these are the most likely thing to drift again —
      // treated as a secondary signal only, never the primary one.
      generatedImage: [
        'img[src*="backend-api/estuary/content"]',
        'img[src*="oaiusercontent"]',
        '[data-message-author-role="assistant"] img[alt]',
      ],
    },
    flow: {
      // Google Flow (flow.google.com) — Project creation / editor.
      // CONFIRMED live 2026-09-14: real DOM query found this button has
      // NO aria-label and NO data-testid — only visible text ("New
      // project"). Both CSS candidates below were WRONG (aria was
      // literally null). content-flow.js's ensureNewProject() now tries
      // these first (cheap, in case a future redesign adds a real
      // attribute) then falls back to FA_UTILS.findByVisibleText, which
      // is what actually works today. Real click-through confirmed a
      // genuine project gets created (real URL
      // flow.google.com/project/<uuid>).
      newProjectButton: [
        'button[aria-label*="New project" i]',
        'a[href*="/project/"]',
      ],
      // Image-upload input. CONFIRMED live 2026-09-14 (2nd round): no
      // <input type="file"> exists by default, but clicking
      // uploadDropzone[0] then uploadButton (below) makes one appear with
      // a real, highly distinctive accept list:
      // ".png,.jpg,.jpeg,.webp,.gif,.heif,.heic,.mp4,.m4v,.mov,.3gp,.avi"
      // — matched on `.heic` since that extension is unlikely to appear
      // in any other file input's accept list on this page, avoiding the
      // silent-wrong-match risk a bare `input[type="file"]` would carry.
      // NOT yet confirmed: whether actually feeding a file through this
      // input via DataTransfer completes an upload (live interaction
      // became unreliable again right as this was being tested — see
      // README "v6").
      fileInput: [
        'input[type="file"][accept*="heic" i]',
        'input[type="file"][accept*="image" i]',
        'input[data-testid*="upload" i][type="file"]',
        'input[type="file"]',
      ],
      // 2-step flow, both CONFIRMED live 2026-09-14: click
      // uploadDropzone[0] ("Add ingredients to the prompt box") to open a
      // media panel, then click uploadButton ("Upload media" — a real
      // `.sidebar-upload-btn` class, found by tracing up from a
      // `<span class="upload-text">Upload media</span>` since the button
      // itself has no aria-label/testid) to make the real fileInput
      // above appear. content-flow.js does both clicks in sequence, with
      // findByVisibleText("Upload media") as a fallback for uploadButton
      // in case the class name changes.
      uploadDropzone: [
        'button[aria-label="Add ingredients to the prompt box" i]',
        'button[aria-label="Add media menu" i]',
        '[data-testid*="upload" i]',
        'button[aria-label*="upload" i]',
        'button[aria-label*="add image" i]',
      ],
      uploadButton: [
        '.sidebar-upload-btn',
      ],
      // NOT yet confirmed against live DOM — the real prompt box found
      // this round (`document.querySelectorAll('textarea,
      // [contenteditable="true"]')` inside a real project) was a bare
      // `<div class="ProseMirror">` with no id/testid/aria-label at all,
      // same framework pattern as ChatGPT's composer but with nothing
      // unique to anchor a selector to — only the generic
      // `div[contenteditable="true"]` catch-all below would actually
      // match it today. Left as-is rather than guessing a fake
      // specific selector; worth tightening once there's a reliable way
      // to disambiguate it from other contenteditable elements on the
      // page (there's also a real `input[type="text"]` search box and
      // an "Editable text"-labelled input elsewhere on the same page).
      promptField: [
        'textarea[placeholder*="prompt" i]',
        'textarea[aria-label*="prompt" i]',
        'div[contenteditable="true"][aria-label*="prompt" i]',
        'textarea',
        'div[contenteditable="true"]',
      ],
      // No structural fallback (`button[type="submit"]` was removed — SPA
      // buttons rarely use native submit, and it risks matching an
      // unrelated dialog's submit button). content-flow.js falls back to
      // `FA_UTILS.findByVisibleText` (matches visible button text like
      // "Generate") instead, which is a more specific last resort than a
      // structural guess.
      generateButton: [
        'button[aria-label*="Generate" i]',
        'button[data-testid*="generate" i]',
      ],
      // Spinner / progress indicator shown while Veo renders the clip.
      generatingIndicator: [
        '[data-testid*="progress" i]',
        '[role="progressbar"]',
        '[class*="loading" i]',
      ],
      resultVideo: [
        'video[src]',
        'video source[src]',
      ],
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
